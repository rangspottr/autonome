/**
 * Credential resolver: checks workspace_credentials table first, falls back to env vars.
 * DB credentials take priority over environment variables when present.
 * API keys are stored encrypted when ENCRYPTION_KEY / JWT_SECRET is available.
 */
import { pool } from '../db/index.js';
import { config } from '../config.js';
import { encrypt, decrypt } from './crypto.js';
import { OPENAI_DEFAULT_MODEL } from './ai-client.js';

/**
 * Obfuscate (encrypt) a string value for storage.
 * Falls back to base64 if no key is available (provides minimal obfuscation).
 */
export function obfuscate(value) {
  if (!value) return value;
  try {
    if (config.ENCRYPTION_KEY || config.JWT_SECRET) {
      return encrypt(value);
    }
    return Buffer.from(value).toString('base64');
  } catch {
    return Buffer.from(value).toString('base64');
  }
}

/**
 * Deobfuscate a stored value.
 */
export function deobfuscate(stored) {
  if (!stored) return stored;
  try {
    if (config.ENCRYPTION_KEY || config.JWT_SECRET) {
      // Try AES decrypt first (has specific format iv:tag:data)
      if (stored.split(':').length === 3) {
        return decrypt(stored);
      }
    }
    // Try base64 decode
    return Buffer.from(stored, 'base64').toString('utf8');
  } catch {
    return stored;
  }
}

/**
 * Mask an API key for safe display: show first 4 + last 4 characters.
 */
export function maskKey(key) {
  if (!key || key.length < 8) return '••••••••';
  return `${key.slice(0, 4)}${'•'.repeat(Math.max(4, key.length - 8))}${key.slice(-4)}`;
}

/**
 * Fetch raw (decrypted) credentials object for a workspace+provider from the DB.
 * Returns null if not found.
 */
async function fetchDbCredentials(workspaceId, provider) {
  try {
    const result = await pool.query(
      'SELECT credentials, is_verified, last_verified_at FROM workspace_credentials WHERE workspace_id = $1 AND provider = $2',
      [workspaceId, provider]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    // Decrypt each credential field
    const decrypted = {};
    for (const [k, v] of Object.entries(row.credentials || {})) {
      decrypted[k] = typeof v === 'string' ? deobfuscate(v) : v;
    }
    return { credentials: decrypted, is_verified: row.is_verified, last_verified_at: row.last_verified_at };
  } catch {
    return null;
  }
}

/**
 * Resolve all credentials for a workspace.
 * Returns a merged config object: DB credentials take priority over env vars.
 */
export async function resolveCredentials(workspaceId) {
  const [anthropic, openai, smtp, twilio, stripe] = await Promise.all([
    fetchDbCredentials(workspaceId, 'anthropic'),
    fetchDbCredentials(workspaceId, 'openai'),
    fetchDbCredentials(workspaceId, 'smtp'),
    fetchDbCredentials(workspaceId, 'twilio'),
    fetchDbCredentials(workspaceId, 'stripe'),
  ]);

  // AI credentials — backward-compat fields
  let ANTHROPIC_API_KEY = config.ANTHROPIC_API_KEY;
  let AI_MODEL = config.AI_MODEL;
  if (anthropic?.credentials?.api_key) {
    ANTHROPIC_API_KEY = anthropic.credentials.api_key;
    if (anthropic.credentials.model) AI_MODEL = anthropic.credentials.model;
  }
  const OPENAI_API_KEY = openai?.credentials?.api_key || null;

  // Provider-neutral AI fields.
  // Resolution order:
  //   1. Workspace DB credentials — if both providers exist, prefer the most recently verified one
  //      (or Anthropic as a tiebreaker).
  //   2. Environment variable ANTHROPIC_API_KEY (platform default).
  //   3. null — no provider available.
  let AI_PROVIDER = null;
  let AI_API_KEY = null;
  let AI_MODEL_RESOLVED = config.AI_MODEL;
  let AI_SOURCE = null;

  if (anthropic?.credentials?.api_key && openai?.credentials?.api_key) {
    const anthropicVerifiedAt = anthropic.last_verified_at ? new Date(anthropic.last_verified_at) : new Date(0);
    const openaiVerifiedAt = openai.last_verified_at ? new Date(openai.last_verified_at) : new Date(0);
    if (openaiVerifiedAt > anthropicVerifiedAt) {
      AI_PROVIDER = 'openai';
      AI_API_KEY = openai.credentials.api_key;
      AI_MODEL_RESOLVED = openai.credentials.model || OPENAI_DEFAULT_MODEL;
      AI_PROVIDER = 'anthropic';
      AI_API_KEY = anthropic.credentials.api_key;
      AI_MODEL_RESOLVED = anthropic.credentials.model || config.AI_MODEL;
      AI_SOURCE = 'db:anthropic';
    }
  } else if (anthropic?.credentials?.api_key) {
    AI_PROVIDER = 'anthropic';
    AI_API_KEY = anthropic.credentials.api_key;
    AI_MODEL_RESOLVED = anthropic.credentials.model || config.AI_MODEL;
    AI_SOURCE = 'db:anthropic';
  } else if (openai?.credentials?.api_key) {
    AI_PROVIDER = 'openai';
    AI_API_KEY = openai.credentials.api_key;
    AI_MODEL_RESOLVED = openai.credentials.model || OPENAI_DEFAULT_MODEL;
    AI_SOURCE = 'db:openai';
  } else if (config.ANTHROPIC_API_KEY) {
    AI_PROVIDER = 'anthropic';
    AI_API_KEY = config.ANTHROPIC_API_KEY;
    AI_MODEL_RESOLVED = config.AI_MODEL;
    AI_SOURCE = 'env';
  }

  // Keep AI_MODEL in sync with the resolved provider model for backward compat
  if (AI_MODEL_RESOLVED) AI_MODEL = AI_MODEL_RESOLVED;

  // SMTP credentials
  const SMTP_HOST = smtp?.credentials?.host || config.SMTP_HOST;
  const SMTP_PORT = smtp?.credentials?.port ? parseInt(smtp.credentials.port) : config.SMTP_PORT;
  const SMTP_USER = smtp?.credentials?.user || config.SMTP_USER;
  const SMTP_PASS = smtp?.credentials?.pass || config.SMTP_PASS;
  const SMTP_FROM = smtp?.credentials?.from || config.SMTP_FROM;

  // Twilio credentials
  const TWILIO_ACCOUNT_SID = twilio?.credentials?.account_sid || config.TWILIO_ACCOUNT_SID;
  const TWILIO_AUTH_TOKEN = twilio?.credentials?.auth_token || config.TWILIO_AUTH_TOKEN;
  const TWILIO_PHONE_NUMBER = twilio?.credentials?.phone_number || config.TWILIO_PHONE_NUMBER;

  // Stripe credentials
  const STRIPE_SECRET_KEY = stripe?.credentials?.secret_key || config.STRIPE_SECRET_KEY;
  const STRIPE_WEBHOOK_SECRET = stripe?.credentials?.webhook_secret || config.STRIPE_WEBHOOK_SECRET;

  return {
    // Provider-neutral AI fields (preferred for all new call sites)
    AI_PROVIDER,
    AI_API_KEY,
    AI_MODEL,
    AI_SOURCE,
    // Backward-compat per-provider keys
    ANTHROPIC_API_KEY,
    OPENAI_API_KEY,
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
    SMTP_FROM,
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_PHONE_NUMBER,
    STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET,
    // Source tracking
    _aiSource: AI_SOURCE,
    _smtpSource: smtp?.credentials?.host ? 'db' : 'env',
    _twilioSource: twilio?.credentials?.account_sid ? 'db' : 'env',
    _stripeSource: stripe?.credentials?.secret_key ? 'db' : 'env',
  };
}
