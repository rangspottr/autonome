import { Router } from 'express';
import { pool } from '../db/index.js';
import { requireAuth, requireWorkspace, requireActiveSubscription } from '../middleware/auth.js';

const router = Router();
const guard = [requireAuth, requireWorkspace, requireActiveSubscription];

router.get('/', ...guard, async (req, res, next) => {
  try {
    const { status } = req.query;
    let query = 'SELECT * FROM invoices WHERE workspace_id = $1';
    const params = [req.workspace.id];
    if (status) {
      query += ' AND status = $2';
      params.push(status);
    }
    query += ' ORDER BY created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.post('/', ...guard, async (req, res, next) => {
  try {
    const { contact_id, deal_id, description, amount, status, due_date, issued_date, metadata } = req.body;
    if (amount === undefined || amount === null) return res.status(400).json({ message: 'amount is required' });
    const result = await pool.query(
      `INSERT INTO invoices (workspace_id, contact_id, deal_id, description, amount, status, due_date, issued_date, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [req.workspace.id, contact_id || null, deal_id || null, description || null, amount, status || 'draft', due_date || null, issued_date || null, JSON.stringify(metadata || {})]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', ...guard, async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM invoices WHERE id = $1 AND workspace_id = $2', [req.params.id, req.workspace.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', ...guard, async (req, res, next) => {
  try {
    const { contact_id, deal_id, description, amount, amount_paid, status, due_date, issued_date, metadata } = req.body;
    const result = await pool.query(
      `UPDATE invoices SET
        contact_id = COALESCE($1, contact_id),
        deal_id = COALESCE($2, deal_id),
        description = COALESCE($3, description),
        amount = COALESCE($4, amount),
        amount_paid = COALESCE($5, amount_paid),
        status = COALESCE($6, status),
        due_date = COALESCE($7, due_date),
        issued_date = COALESCE($8, issued_date),
        metadata = COALESCE($9, metadata),
        updated_at = NOW()
       WHERE id = $10 AND workspace_id = $11 RETURNING *`,
      [contact_id, deal_id, description, amount, amount_paid, status, due_date, issued_date, metadata ? JSON.stringify(metadata) : null, req.params.id, req.workspace.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
