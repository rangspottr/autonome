import { Router } from 'express';
import { pool } from '../db/index.js';
import { requireAuth, requireWorkspace, requireActiveSubscription } from '../middleware/auth.js';
import { ingestBusinessEvent } from '../engine/intake.js';

const router = Router();

// Middleware to allow workspace API key auth (for external integrations)
async function apiKeyOrAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (apiKey) {
    try {
      const result = await pool.query(
        `SELECT workspace_id FROM integrations WHERE config->>'api_key' = $1 AND status = 'active' LIMIT 1`,
        [apiKey]
      );
      if (result.rows[0]) {
        const wsResult = await pool.query(
          `SELECT * FROM workspaces WHERE id = $1`,
          [result.rows[0].workspace_id]
        );
        if (wsResult.rows[0]) {
          req.workspace = wsResult.rows[0];
          return next();
        }
      }
    } catch (_err) {
      // fall through to standard auth
    }
  }
  // Fall through to standard guard
  return requireAuth(req, res, () =>
    requireWorkspace(req, res, () =>
      requireActiveSubscription(req, res, next)
    )
  );
}

// POST /api/ingest/email
router.post('/email', apiKeyOrAuth, async (req, res, next) => {
  try {
    const { from, to, subject, body, attachments, headers } = req.body;
    if (!from || !subject) {
      return res.status(400).json({ message: 'from and subject are required' });
    }
    const event = await ingestBusinessEvent(
      req.workspace.id,
      'email',
      'inbound_email',
      { from, to, subject, body, attachments, headers }
    );
    res.status(201).json(event);
  } catch (err) {
    next(err);
  }
});

// POST /api/ingest/form
router.post('/form', apiKeyOrAuth, async (req, res, next) => {
  try {
    const { form_type, fields, source_url, referrer } = req.body;
    if (!form_type || !fields) {
      return res.status(400).json({ message: 'form_type and fields are required' });
    }
    const eventType = /support|help|issue/.test(form_type.toLowerCase()) ? 'support_request' : 'form_submission';
    const event = await ingestBusinessEvent(
      req.workspace.id,
      'form',
      eventType,
      { form_type, fields, source_url, referrer }
    );
    res.status(201).json(event);
  } catch (err) {
    next(err);
  }
});

// POST /api/ingest/call
router.post('/call', apiKeyOrAuth, async (req, res, next) => {
  try {
    const { caller_phone, caller_name, duration, type, notes, transcript } = req.body;
    if (!caller_phone) {
      return res.status(400).json({ message: 'caller_phone is required' });
    }
    const VALID_TYPES = ['missed', 'completed', 'voicemail'];
    if (type && !VALID_TYPES.includes(type)) {
      return res.status(400).json({ message: `type must be one of: ${VALID_TYPES.join(', ')}` });
    }
    const eventType = type === 'missed' ? 'missed_call' : 'schedule_event';
    const event = await ingestBusinessEvent(
      req.workspace.id,
      'phone',
      eventType,
      { caller_phone, caller_name, duration, type, notes, transcript }
    );
    res.status(201).json(event);
  } catch (err) {
    next(err);
  }
});

// POST /api/ingest/sms
router.post('/sms', apiKeyOrAuth, async (req, res, next) => {
  try {
    const { from, to, body, direction } = req.body;
    if (!from || !body) {
      return res.status(400).json({ message: 'from and body are required' });
    }
    const event = await ingestBusinessEvent(
      req.workspace.id,
      'sms',
      'inbound_email',
      { from, to, body, direction }
    );
    res.status(201).json(event);
  } catch (err) {
    next(err);
  }
});

// POST /api/ingest/payment
router.post('/payment', apiKeyOrAuth, async (req, res, next) => {
  try {
    const { amount, currency, status, customer_email, invoice_ref, provider, provider_event_id } = req.body;
    if (amount === undefined || !currency || !status || !provider) {
      return res.status(400).json({ message: 'amount, currency, status, and provider are required' });
    }
    const eventType = status === 'succeeded' ? 'payment_received' : status === 'failed' ? 'payment_failed' : 'invoice_event';
    const event = await ingestBusinessEvent(
      req.workspace.id,
      'webhook',
      eventType,
      { amount, currency, status, customer_email, invoice_ref, provider, provider_event_id }
    );
    res.status(201).json(event);
  } catch (err) {
    next(err);
  }
});

// POST /api/ingest/support
router.post('/support', apiKeyOrAuth, async (req, res, next) => {
  try {
    const { from_email, from_name, subject, body, priority, channel } = req.body;
    if (!subject || !body) {
      return res.status(400).json({ message: 'subject and body are required' });
    }
    const event = await ingestBusinessEvent(
      req.workspace.id,
      'support',
      'support_request',
      { from_email, from_name, subject, body, priority, channel }
    );
    res.status(201).json(event);
  } catch (err) {
    next(err);
  }
});

// POST /api/ingest/calendar
router.post('/calendar', apiKeyOrAuth, async (req, res, next) => {
  try {
    const { title, start, end, attendees, type, notes } = req.body;
    if (!title || !start) {
      return res.status(400).json({ message: 'title and start are required' });
    }
    const VALID_TYPES = ['meeting', 'booking', 'deadline', 'reminder'];
    if (type && !VALID_TYPES.includes(type)) {
      return res.status(400).json({ message: `type must be one of: ${VALID_TYPES.join(', ')}` });
    }
    const eventType = type === 'booking' ? 'booking_request' : 'schedule_event';
    const event = await ingestBusinessEvent(
      req.workspace.id,
      'calendar',
      eventType,
      { title, start, end, attendees, type, notes }
    );
    res.status(201).json(event);
  } catch (err) {
    next(err);
  }
});

// POST /api/ingest/document
router.post('/document', apiKeyOrAuth, async (req, res, next) => {
  try {
    const { type, name, content, extracted_data, url } = req.body;
    if (!type || !name) {
      return res.status(400).json({ message: 'type and name are required' });
    }
    const VALID_TYPES = ['receipt', 'invoice', 'contract', 'other'];
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ message: `type must be one of: ${VALID_TYPES.join(', ')}` });
    }
    const event = await ingestBusinessEvent(
      req.workspace.id,
      'manual',
      'document',
      { type, name, content, extracted_data, url }
    );
    res.status(201).json(event);
  } catch (err) {
    next(err);
  }
});

// POST /api/ingest/webhook — generic webhook ingestion
router.post('/webhook', apiKeyOrAuth, async (req, res, next) => {
  try {
    const { source, event_type, payload } = req.body;
    if (!source || !event_type || !payload) {
      return res.status(400).json({ message: 'source, event_type, and payload are required' });
    }
    const event = await ingestBusinessEvent(
      req.workspace.id,
      source,
      event_type,
      payload
    );
    res.status(201).json(event);
  } catch (err) {
    next(err);
  }
});

export default router;
