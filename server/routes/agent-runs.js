import { Router } from 'express';
import { pool } from '../db/index.js';
import { requireAuth, requireWorkspace, requireActiveSubscription } from '../middleware/auth.js';
import { runAgentCycle } from '../engine/cycle.js';

const router = Router();
const guard = [requireAuth, requireWorkspace, requireActiveSubscription];

router.get('/', ...guard, async (req, res, next) => {
  try {
    const { agent } = req.query;
    let query = 'SELECT * FROM agent_runs WHERE workspace_id = $1';
    const params = [req.workspace.id];
    if (agent) {
      query += ' AND agent = $2';
      params.push(agent);
    }
    query += ' ORDER BY started_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.post('/trigger', ...guard, async (req, res, next) => {
  try {
    const result = await runAgentCycle(req.workspace.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
