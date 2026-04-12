import { Router } from 'express';
import { randomBytes } from 'crypto';
import { pool } from '../db/index.js';
import { requireAuth, requireWorkspace } from '../middleware/auth.js';
import { encrypt, decrypt } from '../lib/crypto.js';

const router = Router();

// Resolve a workspace by API key from x-api-key header.
// Keys are stored encrypted; we decrypt and compare in application code.
async function resolveWorkspaceByApiKey(apiKey) {
  if (!apiKey) return null;
  const result = await pool.query(
    `SELECT * FROM workspaces WHERE settings->>'webhook_api_key' IS NOT NULL`
  );
  for (const row of result.rows) {
    try {
      const decrypted = decrypt(row.settings.webhook_api_key);
      if (decrypted === apiKey) return row;
    } catch {
      // Skip rows with un-decryptable keys (e.g. legacy plaintext keys)
    }
  }
  return null;
}

// ── Ingest endpoints (API-key auth) ─────────────────────────────────────────

// POST /api/webhooks/lead
router.post('/lead', async (req, res, next) => {
  try {
    const workspace = await resolveWorkspaceByApiKey(req.headers['x-api-key']);
    if (!workspace) return res.status(401).json({ message: 'Invalid API key' });

    const { name, email, phone, source, tags } = req.body;
    if (!name) return res.status(400).json({ message: 'name is required' });

    const result = await pool.query(
      `INSERT INTO contacts (workspace_id, name, email, phone, type, source, tags)
       VALUES ($1, $2, $3, $4, 'lead', $5, $6)
       RETURNING id`,
      [workspace.id, name, email || null, phone || null, source || 'webhook', tags ? JSON.stringify(tags) : '[]']
    );

    await pool.query(
      `INSERT INTO audit_log (workspace_id, agent, action, entity_type, entity_id, details, outcome)
       VALUES ($1, 'webhook', 'lead_ingested', 'contact', $2, $3, 'success')`,
      [workspace.id, result.rows[0].id, JSON.stringify({ name, source })]
    );

    res.json({ received: true, id: result.rows[0].id });
  } catch (err) {
    next(err);
  }
});

// POST /api/webhooks/payment
router.post('/payment', async (req, res, next) => {
  try {
    const workspace = await resolveWorkspaceByApiKey(req.headers['x-api-key']);
    if (!workspace) return res.status(401).json({ message: 'Invalid API key' });

    const { invoice_id, amount, reference, processor } = req.body;
    if (!invoice_id || !amount) {
      return res.status(400).json({ message: 'invoice_id and amount are required' });
    }

    // Update the invoice status to paid if it belongs to this workspace
    const inv = await pool.query(
      `UPDATE invoices
       SET status = 'paid', updated_at = NOW(), metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
       WHERE id = $2 AND workspace_id = $3
       RETURNING id`,
      [JSON.stringify({ paymentReference: reference, processor }), invoice_id, workspace.id]
    );
    if (inv.rowCount === 0) {
      return res.status(404).json({ message: 'Invoice not found in this workspace' });
    }

    await pool.query(
      `INSERT INTO audit_log (workspace_id, agent, action, entity_type, entity_id, details, outcome)
       VALUES ($1, 'webhook', 'payment_received', 'invoice', $2, $3, 'success')`,
      [
        workspace.id,
        invoice_id,
        JSON.stringify({ amount, reference, processor }),
      ]
    );

    res.json({ received: true, id: invoice_id });
  } catch (err) {
    next(err);
  }
});

// POST /api/webhooks/event
router.post('/event', async (req, res, next) => {
  try {
    const workspace = await resolveWorkspaceByApiKey(req.headers['x-api-key']);
    if (!workspace) return res.status(401).json({ message: 'Invalid API key' });

    const { event_type, description, metadata } = req.body;
    if (!event_type) return res.status(400).json({ message: 'event_type is required' });

    const result = await pool.query(
      `INSERT INTO audit_log (workspace_id, agent, action, details, outcome)
       VALUES ($1, 'webhook', $2, $3, 'success')
       RETURNING id`,
      [workspace.id, event_type, JSON.stringify({ description: description || `Webhook event: ${event_type}`, ...(metadata || {}) })]
    );

    res.json({ received: true, id: result.rows[0].id });
  } catch (err) {
    next(err);
  }
});

// ── Key management endpoints (require auth) ──────────────────────────────────

// POST /api/webhooks/generate-key — generate a new webhook API key
router.post('/generate-key', requireAuth, requireWorkspace, async (req, res, next) => {
  try {
    // Generate a 64-character hex key (32 random bytes encoded as hex)
    const newKey = randomBytes(32).toString('hex');
    const encryptedKey = encrypt(newKey);

    await pool.query(
      `UPDATE workspaces
       SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object('webhook_api_key', $1)
       WHERE id = $2`,
      [encryptedKey, req.workspace.id]
    );

    res.json({ key: newKey });
  } catch (err) {
    next(err);
  }
});

// GET /api/webhooks/key — get the current webhook API key (decrypted for authenticated user)
router.get('/key', requireAuth, requireWorkspace, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT settings->>'webhook_api_key' AS webhook_api_key FROM workspaces WHERE id = $1`,
      [req.workspace.id]
    );
    const stored = result.rows[0]?.webhook_api_key || null;
    let key = null;
    if (stored) {
      try {
        key = decrypt(stored);
      } catch {
        // Legacy plaintext key — return as-is
        key = stored;
      }
    }
    res.json({ key });
  } catch (err) {
    next(err);
  }
});

export default router;
