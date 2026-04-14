import { Router } from 'express';
import { config } from '../config.js';
import { requireAuth, requireWorkspace } from '../middleware/auth.js';
import { pool } from '../db/index.js';
import { resolveCredentials } from '../lib/credential-resolver.js';

const router = Router();

/**
 * Load DB credential flags for a workspace: { provider -> is_verified }
 */
async function loadDbCredFlags(workspaceId) {
  try {
    const result = await pool.query(
      'SELECT provider, is_verified FROM workspace_credentials WHERE workspace_id = $1',
      [workspaceId]
    );
    const flags = {};
    for (const row of result.rows) {
      flags[row.provider] = row.is_verified;
    }
    return flags;
  } catch {
    return {};
  }
}

// GET /api/settings/integrations
// Returns which integrations are configured (without exposing the actual secrets).
router.get('/integrations', requireAuth, requireWorkspace, async (req, res, next) => {
  try {
    const dbCreds = await loadDbCredFlags(req.workspace.id);

    const aiConfiguredDb = dbCreds.anthropic !== undefined || dbCreds.openai !== undefined;
    const aiProvider = dbCreds.anthropic !== undefined ? 'anthropic' : dbCreds.openai !== undefined ? 'openai' : config.ANTHROPIC_API_KEY ? 'anthropic' : 'none';

    res.json({
      email: {
        configured: !!(dbCreds.smtp !== undefined || (config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS)),
        verified: dbCreds.smtp === true,
        source: dbCreds.smtp !== undefined ? 'db' : 'env',
        provider: 'smtp',
      },
      sms: {
        configured: !!(dbCreds.twilio !== undefined || (config.TWILIO_ACCOUNT_SID && config.TWILIO_AUTH_TOKEN && config.TWILIO_PHONE_NUMBER)),
        verified: dbCreds.twilio === true,
        source: dbCreds.twilio !== undefined ? 'db' : 'env',
        provider: 'twilio',
      },
      ai: {
        configured: !!(aiConfiguredDb || config.ANTHROPIC_API_KEY),
        verified: dbCreds.anthropic === true || dbCreds.openai === true,
        source: aiConfiguredDb ? 'db' : config.ANTHROPIC_API_KEY ? 'env' : 'none',
        provider: aiProvider,
      },
      stripe: {
        configured: !!(dbCreds.stripe !== undefined || config.STRIPE_SECRET_KEY),
        verified: dbCreds.stripe === true,
        source: dbCreds.stripe !== undefined ? 'db' : 'env',
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/settings/status
// Returns boolean flags for system configuration status — never exposes actual secrets.
router.get('/status', requireAuth, requireWorkspace, async (req, res, next) => {
  try {
    const dbCreds = await loadDbCredFlags(req.workspace.id);
    res.json({
      smtp: !!(dbCreds.smtp !== undefined || (config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS)),
      sms: !!(dbCreds.twilio !== undefined || (config.TWILIO_ACCOUNT_SID && config.TWILIO_AUTH_TOKEN && config.TWILIO_PHONE_NUMBER)),
      stripe: !!(dbCreds.stripe !== undefined || config.STRIPE_SECRET_KEY),
      ai: !!(dbCreds.anthropic !== undefined || dbCreds.openai !== undefined || config.ANTHROPIC_API_KEY),
      bypass_subscription: !!config.BYPASS_SUBSCRIPTION,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/settings/ai-status
// Returns current AI provider status, model, connection health.
router.get('/ai-status', requireAuth, requireWorkspace, async (req, res, next) => {
  try {
    const workspaceId = req.workspace.id;
    const creds = await resolveCredentials(workspaceId);

    const provider = creds.AI_PROVIDER || 'none';
    const connected = !!(creds.AI_PROVIDER && creds.AI_API_KEY);
    const model = creds.AI_MODEL || null;

    // Look up the most recent successful AI response for any provider
    let lastSuccessful = null;
    try {
      const lastResult = await pool.query(
        `SELECT created_at FROM chat_messages
         WHERE workspace_id = $1
           AND role = 'assistant'
           AND metadata->>'source' IN ('anthropic', 'openai')
         ORDER BY created_at DESC LIMIT 1`,
        [workspaceId]
      );
      lastSuccessful = lastResult.rows[0]?.created_at || null;
    } catch {
      // metadata column may not track source; fall back gracefully
    }

    res.json({
      provider,
      model,
      connected,
      lastSuccessful,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
