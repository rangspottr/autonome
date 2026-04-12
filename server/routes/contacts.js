import { Router } from 'express';
import { body } from 'express-validator';
import { pool } from '../db/index.js';
import { requireAuth, requireWorkspace, requireActiveSubscription } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();
const guard = [requireAuth, requireWorkspace, requireActiveSubscription];

const CONTACT_TYPES = ['lead', 'prospect', 'customer', 'partner', 'vendor', 'other'];

const contactCreateRules = [
  body('name').trim().notEmpty().isLength({ max: 255 }),
  body('email').optional({ nullable: true }).isEmail(),
  body('phone').optional({ nullable: true }).isLength({ max: 50 }),
  body('type').optional().isIn(CONTACT_TYPES),
  validate,
];

const contactUpdateRules = [
  body('name').optional().trim().notEmpty().isLength({ max: 255 }),
  body('email').optional({ nullable: true }).isEmail(),
  body('phone').optional({ nullable: true }).isLength({ max: 50 }),
  body('type').optional().isIn(CONTACT_TYPES),
  validate,
];

router.get('/', ...guard, async (req, res, next) => {
  try {
    const { type } = req.query;
    let query = 'SELECT * FROM contacts WHERE workspace_id = $1';
    const params = [req.workspace.id];
    if (type) {
      query += ' AND type = $2';
      params.push(type);
    }
    query += ' ORDER BY created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.post('/', ...guard, ...contactCreateRules, async (req, res, next) => {
  try {
    const { name, email, phone, company, type, source, tags, metadata } = req.body;
    if (!name) return res.status(400).json({ message: 'name is required' });
    const result = await pool.query(
      `INSERT INTO contacts (workspace_id, name, email, phone, company, type, source, tags, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [req.workspace.id, name, email || null, phone || null, company || null, type || 'lead', source || null, JSON.stringify(tags || []), JSON.stringify(metadata || {})]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', ...guard, async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM contacts WHERE id = $1 AND workspace_id = $2', [req.params.id, req.workspace.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', ...guard, ...contactUpdateRules, async (req, res, next) => {
  try {
    const { name, email, phone, company, type, source, tags, metadata } = req.body;
    const result = await pool.query(
      `UPDATE contacts SET
        name = COALESCE($1, name),
        email = COALESCE($2, email),
        phone = COALESCE($3, phone),
        company = COALESCE($4, company),
        type = COALESCE($5, type),
        source = COALESCE($6, source),
        tags = COALESCE($7, tags),
        metadata = COALESCE($8, metadata),
        updated_at = NOW()
       WHERE id = $9 AND workspace_id = $10 RETURNING *`,
      [name, email, phone, company, type, source, tags ? JSON.stringify(tags) : null, metadata ? JSON.stringify(metadata) : null, req.params.id, req.workspace.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', ...guard, async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM contacts WHERE id = $1 AND workspace_id = $2 RETURNING id', [req.params.id, req.workspace.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

export default router;
