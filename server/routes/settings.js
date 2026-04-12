import { Router } from 'express';
import { config } from '../config.js';
import { requireAuth, requireWorkspace } from '../middleware/auth.js';

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

export default router;
