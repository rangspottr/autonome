/**
 * Credentials API — manage per-workspace provider credentials.
 *
 * GET    /api/credentials           — list all configured providers (masked keys)
 * PUT    /api/credentials/:provider — save/update credentials
 * POST   /api/credentials/:provider/test — test credentials with live API call
 * DELETE /api/credentials/:provider — remove credentials
 */
import { Router } from 'express';
import { pool } from '../db/index.js';
import { requireAuth, requireWorkspace } from '../middleware/auth.js';
import { obfuscate, deobfuscate, maskKey } from '../lib/credential-resolver.js';
import rateLimit from 'express-rate-limit';

const router = Router();
const guard = [requireAuth, requireWorkspace];

const VALID_PROVIDERS = ['anthropic', 'openai', 'smtp', 'twilio', 'stripe'];

// Rate limit test endpoints to prevent abuse
const testLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  keyGenerator: (req) => `cred-test:${req.workspace?.id || req.ip}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many credential test requests. Max 5 per minute.' },
});

/**
 * Mask credential fields for safe API response.
 */
function maskCredentials(provider, creds) {
  if (!creds) return {};
  const masked = {};
  for (const [k, v] of Object.entries(creds)) {
    if (typeof v !== 'string') { masked[k] = v; continue; }
    const isKey = k.includes('key') || k.includes('token') || k.includes('pass') || k.includes('secret');
    masked[k] = isKey ? maskKey(v) : v;
  }
  return masked;
}

// GET /api/credentials — list all configured providers with masked credentials
router.get('/', ...guard, async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT provider, credentials, is_verified, last_verified_at, updated_at FROM workspace_credentials WHERE workspace_id = $1',
      [req.workspace.id]
    );

    const providers = {};
    for (const row of result.rows) {
      // Decrypt and then re-mask for display
      const decrypted = {};
      for (const [k, v] of Object.entries(row.credentials || {})) {
        decrypted[k] = typeof v === 'string' ? deobfuscate(v) : v;
      }
      providers[row.provider] = {
        configured: true,
        is_verified: row.is_verified,
        last_verified_at: row.last_verified_at,
        updated_at: row.updated_at,
        credentials: maskCredentials(row.provider, decrypted),
      };
    }

    res.json(providers);
  } catch (err) {
    next(err);
  }
});

// PUT /api/credentials/:provider — save or update credentials
router.put('/:provider', ...guard, async (req, res, next) => {
  try {
    const { provider } = req.params;
    if (!VALID_PROVIDERS.includes(provider)) {
      return res.status(400).json({ message: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}` });
    }

    const { credentials } = req.body;
    if (!credentials || typeof credentials !== 'object') {
      return res.status(400).json({ message: 'credentials object is required' });
    }

    // Encrypt each non-empty string credential field; skip empty strings to avoid unencrypted blanks
    const encrypted = {};
    for (const [k, v] of Object.entries(credentials)) {
      if (typeof v === 'string') {
        if (v.length > 0) encrypted[k] = obfuscate(v);
        // Skip empty strings — don't store them
      } else {
        encrypted[k] = v;
      }
    }

    await pool.query(
      `INSERT INTO workspace_credentials (workspace_id, provider, credentials, is_verified, updated_at)
       VALUES ($1, $2, $3, false, NOW())
       ON CONFLICT (workspace_id, provider) DO UPDATE
         SET credentials = $3, is_verified = false, updated_at = NOW()`,
      [req.workspace.id, provider, JSON.stringify(encrypted)]
    );

    res.json({ success: true, provider, message: 'Credentials saved.' });
  } catch (err) {
    next(err);
  }
});

// POST /api/credentials/:provider/test — test credentials with a live API call
router.post('/:provider/test', ...guard, testLimiter, async (req, res, next) => {
  try {
    const { provider } = req.params;
    if (!VALID_PROVIDERS.includes(provider)) {
      return res.status(400).json({ message: `Invalid provider.` });
    }

    // Load the saved credentials (or use supplied ones from body for pre-save testing)
    let creds = {};
    if (req.body.credentials) {
      // Test with freshly-supplied credentials (not yet saved)
      creds = req.body.credentials;
    } else {
      const row = await pool.query(
        'SELECT credentials FROM workspace_credentials WHERE workspace_id = $1 AND provider = $2',
        [req.workspace.id, provider]
      );
      if (row.rows.length === 0) {
        return res.status(404).json({ message: 'No credentials found for this provider. Save first.' });
      }
      const stored = row.rows[0].credentials || {};
      for (const [k, v] of Object.entries(stored)) {
        creds[k] = typeof v === 'string' ? deobfuscate(v) : v;
      }
    }

    let testResult;
    switch (provider) {
      case 'anthropic':
        testResult = await testAnthropic(creds);
        break;
      case 'openai':
        testResult = await testOpenAI(creds);
        break;
      case 'smtp':
        testResult = await testSMTP(creds);
        break;
      case 'twilio':
        testResult = await testTwilio(creds);
        break;
      case 'stripe':
        testResult = await testStripe(creds);
        break;
      default:
        testResult = { success: false, error: 'Unknown provider' };
    }

    // Update verification status if test used saved credentials
    if (!req.body.credentials && testResult.success) {
      await pool.query(
        `UPDATE workspace_credentials SET is_verified = true, last_verified_at = NOW(), updated_at = NOW()
         WHERE workspace_id = $1 AND provider = $2`,
        [req.workspace.id, provider]
      );
    } else if (!req.body.credentials && !testResult.success) {
      await pool.query(
        `UPDATE workspace_credentials SET is_verified = false, updated_at = NOW()
         WHERE workspace_id = $1 AND provider = $2`,
        [req.workspace.id, provider]
      );
    }

    res.json(testResult);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/credentials/:provider — remove credentials
router.delete('/:provider', ...guard, async (req, res, next) => {
  try {
    const { provider } = req.params;
    if (!VALID_PROVIDERS.includes(provider)) {
      return res.status(400).json({ message: 'Invalid provider.' });
    }
    await pool.query(
      'DELETE FROM workspace_credentials WHERE workspace_id = $1 AND provider = $2',
      [req.workspace.id, provider]
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ─── Provider test functions ─────────────────────────────────────────────────

async function testAnthropic(creds) {
  const apiKey = creds.api_key;
  if (!apiKey) return { success: false, error: 'API key is required' };
  const model = creds.model || 'claude-sonnet-4-20250514';
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Say ok' }],
      }),
    });
    if (resp.ok) {
      return { success: true, message: `Anthropic connected — ${model} is working.` };
    }
    const body = await resp.json().catch(() => ({}));
    const errMsg = body.error?.message || `HTTP ${resp.status}`;
    if (resp.status === 401) return { success: false, error: 'Invalid API key. Please check your Anthropic API key.' };
    if (resp.status === 403) return { success: false, error: `Access denied for model ${model}. Check your Anthropic plan.` };
    if (resp.status === 404) return { success: false, error: `Model ${model} not found. Select a different model.` };
    if (resp.status === 429) return { success: false, error: 'Rate limit or quota exceeded. Check your Anthropic billing.' };
    return { success: false, error: errMsg };
  } catch (err) {
    return { success: false, error: `Connection failed: ${err.message}` };
  }
}

async function testOpenAI(creds) {
  const apiKey = creds.api_key;
  if (!apiKey) return { success: false, error: 'API key is required' };
  const model = creds.model || 'gpt-4o';
  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Say ok' }],
      }),
    });
    if (resp.ok) {
      return { success: true, message: `OpenAI connected — ${model} is working.` };
    }
    const body = await resp.json().catch(() => ({}));
    const errMsg = body.error?.message || `HTTP ${resp.status}`;
    if (resp.status === 401) return { success: false, error: 'Invalid API key. Please check your OpenAI API key.' };
    if (resp.status === 404) return { success: false, error: `Model ${model} does not exist or you do not have access. Select a different model.` };
    if (resp.status === 429) return { success: false, error: 'Quota exceeded. Check your OpenAI billing at platform.openai.com/account/billing.' };
    if (resp.status === 403) return { success: false, error: `Access denied for model ${model}. Your OpenAI plan may not include this model.` };
    return { success: false, error: errMsg };
  } catch (err) {
    return { success: false, error: `Connection failed: ${err.message}` };
  }
}

async function testSMTP(creds) {
  const { host, port, user, pass } = creds;
  if (!host || !user || !pass) return { success: false, error: 'Host, username, and password are required' };
  try {
    const nodemailer = (await import('nodemailer')).default;
    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(port) || 587,
      secure: parseInt(port) === 465,
      auth: { user, pass },
    });
    await transporter.verify();
    return { success: true, message: 'SMTP connection verified.' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function testTwilio(creds) {
  const { account_sid, auth_token } = creds;
  if (!account_sid || !auth_token) return { success: false, error: 'Account SID and Auth Token are required' };
  try {
    const twilio = (await import('twilio')).default;
    const client = twilio(account_sid, auth_token);
    await client.api.accounts(account_sid).fetch();
    return { success: true, message: 'Twilio credentials are valid.' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function testStripe(creds) {
  const { secret_key } = creds;
  if (!secret_key) return { success: false, error: 'Secret key is required' };
  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(secret_key, { apiVersion: '2023-10-16' });
    await stripe.balance.retrieve();
    return { success: true, message: 'Stripe key is valid.' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export default router;
