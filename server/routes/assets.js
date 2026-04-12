import { Router } from 'express';
import { pool } from '../db/index.js';
import { requireAuth, requireWorkspace, requireActiveSubscription } from '../middleware/auth.js';

const router = Router();
const guard = [requireAuth, requireWorkspace, requireActiveSubscription];

router.get('/', ...guard, async (req, res, next) => {
  try {
    const { category, status } = req.query;
    let query = 'SELECT * FROM assets WHERE workspace_id = $1';
    const params = [req.workspace.id];
    if (category) {
      query += ` AND category = $${params.length + 1}`;
      params.push(category);
    }
    if (status) {
      query += ` AND status = $${params.length + 1}`;
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
    const { name, category, quantity, unit_cost, location, status, metadata } = req.body;
    if (!name) return res.status(400).json({ message: 'name is required' });
    const result = await pool.query(
      `INSERT INTO assets (workspace_id, name, category, quantity, unit_cost, location, status, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        req.workspace.id,
        name,
        category || null,
        quantity !== undefined ? quantity : 0,
        unit_cost !== undefined ? unit_cost : null,
        location || null,
        status || 'available',
        JSON.stringify(metadata || {}),
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', ...guard, async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT * FROM assets WHERE id = $1 AND workspace_id = $2',
      [req.params.id, req.workspace.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', ...guard, async (req, res, next) => {
  try {
    const { name, category, quantity, unit_cost, location, status, metadata } = req.body;
    const result = await pool.query(
      `UPDATE assets SET
        name = COALESCE($1, name),
        category = COALESCE($2, category),
        quantity = COALESCE($3, quantity),
        unit_cost = COALESCE($4, unit_cost),
        location = COALESCE($5, location),
        status = COALESCE($6, status),
        metadata = COALESCE($7, metadata),
        updated_at = NOW()
       WHERE id = $8 AND workspace_id = $9 RETURNING *`,
      [
        name || null,
        category || null,
        quantity !== undefined ? quantity : null,
        unit_cost !== undefined ? unit_cost : null,
        location || null,
        status || null,
        metadata ? JSON.stringify(metadata) : null,
        req.params.id,
        req.workspace.id,
      ]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', ...guard, async (req, res, next) => {
  try {
    const result = await pool.query(
      'DELETE FROM assets WHERE id = $1 AND workspace_id = $2 RETURNING id',
      [req.params.id, req.workspace.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

export default router;
