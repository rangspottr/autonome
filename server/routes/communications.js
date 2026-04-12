import { Router } from 'express';
import { pool } from '../db/index.js';
import { requireAuth, requireWorkspace, requireActiveSubscription } from '../middleware/auth.js';

const router = Router();
const guard = [requireAuth, requireWorkspace, requireActiveSubscription];

router.get('/', ...guard, async (req, res, next) => {
  try {
    const { contact_id } = req.query;
    let query = 'SELECT * FROM communications WHERE workspace_id = $1';
    const params = [req.workspace.id];
    if (contact_id) {
      query += ' AND contact_id = $2';
      params.push(contact_id);
    }
    query += ' ORDER BY created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

export default router;
