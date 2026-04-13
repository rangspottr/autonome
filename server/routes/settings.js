import { Router } from 'express';
import { config } from '../config.js';
import { requireAuth, requireWorkspace } from '../middleware/auth.js';
import { pool } from '../db/index.js';

const router = Router();

// GET /api/settings/integrations
// Returns which integrations are configured (without exposing the actual secrets).
router.get('/integrations', requireAuth, requireWorkspace, async (req, res, next) => {
  try {
    res.json({
      email: {
        configured: !!(config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS),
        provider: 'smtp',
      },
      sms: {
        configured: !!(config.TWILIO_ACCOUNT_SID && config.TWILIO_AUTH_TOKEN && config.TWILIO_PHONE_NUMBER),
        provider: 'twilio',
      },
      ai: {
        configured: !!config.ANTHROPIC_API_KEY,
        provider: 'anthropic',
      },
      stripe: {
        configured: !!config.STRIPE_SECRET_KEY,
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
    res.json({
      smtp: !!(config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS),
      sms: !!(config.TWILIO_ACCOUNT_SID && config.TWILIO_AUTH_TOKEN && config.TWILIO_PHONE_NUMBER),
      stripe: !!config.STRIPE_SECRET_KEY,
      ai: !!config.ANTHROPIC_API_KEY,
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
    const connected = !!config.ANTHROPIC_API_KEY;
    const provider = connected ? 'anthropic' : 'none';
    const model = config.AI_MODEL || null;

    // Look up the most recent successful AI response (source = 'anthropic') in chat_messages
    let lastSuccessful = null;
    try {
      const lastResult = await pool.query(
        `SELECT created_at FROM chat_messages
         WHERE workspace_id = $1
           AND role = 'assistant'
           AND metadata->>'source' = 'anthropic'
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
