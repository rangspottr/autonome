import { Router } from 'express';
import { pool } from '../db/index.js';
import { requireAuth, requireWorkspace, requireActiveSubscription } from '../middleware/auth.js';

const router = Router();
const guard = [requireAuth, requireWorkspace, requireActiveSubscription];

router.get('/', ...guard, async (req, res, next) => {
  try {
    const { category } = req.query;
    let query = 'SELECT * FROM knowledge_documents WHERE workspace_id = $1';
    const params = [req.workspace.id];
    if (category) {
      query += ` AND category = $${params.length + 1}`;
      params.push(category);
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
    const { title, content, category, tags, metadata } = req.body;
    if (!title) return res.status(400).json({ message: 'title is required' });
    const result = await pool.query(
      `INSERT INTO knowledge_documents (workspace_id, title, content, category, tags, metadata)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        req.workspace.id,
        title,
        content || null,
        category || null,
        JSON.stringify(tags || []),
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
      'SELECT * FROM knowledge_documents WHERE id = $1 AND workspace_id = $2',
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
    const { title, content, category, tags, metadata } = req.body;
    const result = await pool.query(
      `UPDATE knowledge_documents SET
        title = COALESCE($1, title),
        content = COALESCE($2, content),
        category = COALESCE($3, category),
        tags = COALESCE($4, tags),
        metadata = COALESCE($5, metadata),
        updated_at = NOW()
       WHERE id = $6 AND workspace_id = $7 RETURNING *`,
      [
        title || null,
        content || null,
        category || null,
        tags ? JSON.stringify(tags) : null,
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
      'DELETE FROM knowledge_documents WHERE id = $1 AND workspace_id = $2 RETURNING id',
      [req.params.id, req.workspace.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

export default router;
