import { Router } from 'express';
import { body } from 'express-validator';
import { pool } from '../db/index.js';
import { requireAuth, requireWorkspace, requireActiveSubscription } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();
const guard = [requireAuth, requireWorkspace, requireActiveSubscription];

const DEAL_STAGES = ['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];

const dealCreateRules = [
  body('title').trim().notEmpty().isLength({ max: 255 }),
  body('value').optional({ nullable: true }).isFloat({ min: 0 }),
  body('stage').optional().isIn(DEAL_STAGES),
  validate,
];

const dealUpdateRules = [
  body('title').optional().trim().notEmpty().isLength({ max: 255 }),
  body('value').optional({ nullable: true }).isFloat({ min: 0 }),
  body('stage').optional().isIn(DEAL_STAGES),
  validate,
];

router.get('/', ...guard, async (req, res, next) => {
  try {
    const { stage } = req.query;
    let query = 'SELECT * FROM deals WHERE workspace_id = $1';
    const params = [req.workspace.id];
    if (stage) {
      query += ' AND stage = $2';
      params.push(stage);
    }
    query += ' ORDER BY created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.post('/', ...guard, ...dealCreateRules, async (req, res, next) => {
  try {
    const { contact_id, title, value, stage, probability, expected_close_date, metadata } = req.body;
    if (!title) return res.status(400).json({ message: 'title is required' });
    const result = await pool.query(
      `INSERT INTO deals (workspace_id, contact_id, title, value, stage, probability, expected_close_date, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [req.workspace.id, contact_id || null, title, value || null, stage || 'new', probability || 0, expected_close_date || null, JSON.stringify(metadata || {})]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', ...guard, async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM deals WHERE id = $1 AND workspace_id = $2', [req.params.id, req.workspace.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', ...guard, ...dealUpdateRules, async (req, res, next) => {
  try {
    const { contact_id, title, value, stage, probability, expected_close_date, metadata } = req.body;
    const result = await pool.query(
      `UPDATE deals SET
        contact_id = COALESCE($1, contact_id),
        title = COALESCE($2, title),
        value = COALESCE($3, value),
        stage = COALESCE($4, stage),
        probability = COALESCE($5, probability),
        expected_close_date = COALESCE($6, expected_close_date),
        metadata = COALESCE($7, metadata),
        updated_at = NOW()
       WHERE id = $8 AND workspace_id = $9 RETURNING *`,
      [contact_id, title, value, stage, probability, expected_close_date, metadata ? JSON.stringify(metadata) : null, req.params.id, req.workspace.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', ...guard, async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM deals WHERE id = $1 AND workspace_id = $2 RETURNING id', [req.params.id, req.workspace.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

export default router;
