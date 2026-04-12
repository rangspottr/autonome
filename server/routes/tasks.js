import { Router } from 'express';
import { pool } from '../db/index.js';
import { requireAuth, requireWorkspace, requireActiveSubscription } from '../middleware/auth.js';

const router = Router();
const guard = [requireAuth, requireWorkspace, requireActiveSubscription];

router.get('/', ...guard, async (req, res, next) => {
  try {
    const { status, priority } = req.query;
    let query = 'SELECT * FROM tasks WHERE workspace_id = $1';
    const params = [req.workspace.id];
    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }
    if (priority) {
      params.push(priority);
      query += ` AND priority = $${params.length}`;
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
    const { title, description, status, priority, assigned_to, due_date, related_entity_type, related_entity_id, metadata } = req.body;
    if (!title) return res.status(400).json({ message: 'title is required' });
    const result = await pool.query(
      `INSERT INTO tasks (workspace_id, title, description, status, priority, assigned_to, due_date, related_entity_type, related_entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [req.workspace.id, title, description || null, status || 'pending', priority || 'normal', assigned_to || null, due_date || null, related_entity_type || null, related_entity_id || null, JSON.stringify(metadata || {})]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', ...guard, async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM tasks WHERE id = $1 AND workspace_id = $2', [req.params.id, req.workspace.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', ...guard, async (req, res, next) => {
  try {
    const { title, description, status, priority, assigned_to, due_date, related_entity_type, related_entity_id, metadata } = req.body;
    const result = await pool.query(
      `UPDATE tasks SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        status = COALESCE($3, status),
        priority = COALESCE($4, priority),
        assigned_to = COALESCE($5, assigned_to),
        due_date = COALESCE($6, due_date),
        related_entity_type = COALESCE($7, related_entity_type),
        related_entity_id = COALESCE($8, related_entity_id),
        metadata = COALESCE($9, metadata),
        updated_at = NOW()
       WHERE id = $10 AND workspace_id = $11 RETURNING *`,
      [title, description, status, priority, assigned_to, due_date, related_entity_type, related_entity_id, metadata ? JSON.stringify(metadata) : null, req.params.id, req.workspace.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
