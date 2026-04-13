import { Router } from 'express';
import { pool } from '../db/index.js';
import { requireAuth, requireWorkspace, requireActiveSubscription } from '../middleware/auth.js';

const router = Router();
const guard = [requireAuth, requireWorkspace, requireActiveSubscription];

// GET /api/companies — list companies for workspace
router.get('/', ...guard, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT * FROM companies WHERE workspace_id = $1 ORDER BY name ASC`,
      [req.workspace.id]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/companies — create company
router.post('/', ...guard, async (req, res, next) => {
  try {
    const { name, domain, industry, metadata } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'name is required' });
    }
    const result = await pool.query(
      `INSERT INTO companies (workspace_id, name, domain, industry, metadata)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.workspace.id, name, domain || null, industry || null, JSON.stringify(metadata || {})]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// GET /api/companies/:id — get company with linked contacts, deals, invoices
router.get('/:id', ...guard, async (req, res, next) => {
  try {
    const companyRes = await pool.query(
      `SELECT * FROM companies WHERE id = $1 AND workspace_id = $2`,
      [req.params.id, req.workspace.id]
    );
    if (!companyRes.rows[0]) return res.status(404).json({ message: 'Company not found' });
    const company = companyRes.rows[0];

    const [contacts, deals, invoices] = await Promise.all([
      pool.query(
        `SELECT id, name, email, phone, type FROM contacts WHERE workspace_id = $1 AND company_id = $2 ORDER BY name`,
        [req.workspace.id, company.id]
      ),
      pool.query(
        `SELECT d.id, d.title, d.stage, d.value FROM deals d
         JOIN contacts c ON c.id = d.contact_id
         WHERE d.workspace_id = $1 AND c.company_id = $2 ORDER BY d.created_at DESC`,
        [req.workspace.id, company.id]
      ),
      pool.query(
        `SELECT i.id, i.description, i.amount, i.status FROM invoices i
         JOIN contacts c ON c.id = i.contact_id
         WHERE i.workspace_id = $1 AND c.company_id = $2 ORDER BY i.created_at DESC`,
        [req.workspace.id, company.id]
      ),
    ]);

    res.json({
      ...company,
      contacts: contacts.rows,
      deals: deals.rows,
      invoices: invoices.rows,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/companies/:id — update company
router.patch('/:id', ...guard, async (req, res, next) => {
  try {
    const { name, domain, industry, metadata } = req.body;
    const existing = await pool.query(
      `SELECT id FROM companies WHERE id = $1 AND workspace_id = $2`,
      [req.params.id, req.workspace.id]
    );
    if (!existing.rows[0]) return res.status(404).json({ message: 'Company not found' });

    const updated = await pool.query(
      `UPDATE companies
       SET name = COALESCE($1, name),
           domain = COALESCE($2, domain),
           industry = COALESCE($3, industry),
           metadata = CASE WHEN $4::jsonb IS NOT NULL THEN $4::jsonb ELSE metadata END,
           updated_at = NOW()
       WHERE id = $5 AND workspace_id = $6
       RETURNING *`,
      [name || null, domain || null, industry || null, metadata ? JSON.stringify(metadata) : null, req.params.id, req.workspace.id]
    );
    res.json(updated.rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/companies/:id — delete company
router.delete('/:id', ...guard, async (req, res, next) => {
  try {
    const result = await pool.query(
      `DELETE FROM companies WHERE id = $1 AND workspace_id = $2 RETURNING id`,
      [req.params.id, req.workspace.id]
    );
    if (!result.rows[0]) return res.status(404).json({ message: 'Company not found' });
    res.json({ message: 'Company deleted' });
  } catch (err) {
    next(err);
  }
});

// POST /api/companies/:id/link-contact — link a contact to a company
router.post('/:id/link-contact', ...guard, async (req, res, next) => {
  try {
    const { contact_id } = req.body;
    if (!contact_id) {
      return res.status(400).json({ message: 'contact_id is required' });
    }

    const companyRes = await pool.query(
      `SELECT id FROM companies WHERE id = $1 AND workspace_id = $2`,
      [req.params.id, req.workspace.id]
    );
    if (!companyRes.rows[0]) return res.status(404).json({ message: 'Company not found' });

    const contactRes = await pool.query(
      `UPDATE contacts SET company_id = $1, updated_at = NOW()
       WHERE id = $2 AND workspace_id = $3 RETURNING id, name`,
      [req.params.id, contact_id, req.workspace.id]
    );
    if (!contactRes.rows[0]) return res.status(404).json({ message: 'Contact not found' });

    res.json({ message: `Contact ${contactRes.rows[0].name} linked to company`, contact: contactRes.rows[0] });
  } catch (err) {
    next(err);
  }
});

export default router;
