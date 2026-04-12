import { Router } from 'express';
import { pool } from '../db/index.js';
import { requireAuth, requireWorkspace, requireActiveSubscription } from '../middleware/auth.js';
import { advanceWorkflows } from '../engine/workflows.js';

const router = Router();
const guard = [requireAuth, requireWorkspace, requireActiveSubscription];

router.get('/', ...guard, async (req, res, next) => {
  try {
    const { status } = req.query;
    let query = 'SELECT * FROM workflows WHERE workspace_id = $1';
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

router.get('/:id', ...guard, async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM workflows WHERE id = $1 AND workspace_id = $2', [req.params.id, req.workspace.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/steps', ...guard, async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id, template, status, current_step, steps, context, trigger_entity_type, trigger_entity_id, started_at, completed_at, next_action_at FROM workflows WHERE id = $1 AND workspace_id = $2',
      [req.params.id, req.workspace.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    const wf = result.rows[0];
    const steps = Array.isArray(wf.steps) ? wf.steps : JSON.parse(wf.steps || '[]');
    res.json({
      id: wf.id,
      template: wf.template,
      status: wf.status,
      current_step: wf.current_step,
      steps,
      context: wf.context,
      trigger_entity_type: wf.trigger_entity_type,
      trigger_entity_id: wf.trigger_entity_id,
      started_at: wf.started_at,
      completed_at: wf.completed_at,
      next_action_at: wf.next_action_at,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/trigger', ...guard, async (req, res, next) => {
  try {
    const result = await advanceWorkflows(req.workspace.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
