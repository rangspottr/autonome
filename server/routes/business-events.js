import { Router } from 'express';
import { pool } from '../db/index.js';
import { requireAuth, requireWorkspace, requireActiveSubscription } from '../middleware/auth.js';
import { processBusinessEvent } from '../engine/intake.js';

const router = Router();
const guard = [requireAuth, requireWorkspace, requireActiveSubscription];

// GET /api/business-events/stats — aggregate stats (must be before /:id)
router.get('/stats', ...guard, async (req, res, next) => {
  try {
    const wsId = req.workspace.id;

    const [bySource, byStatus, byAgent, byType, total] = await Promise.all([
      pool.query(
        `SELECT source, COUNT(*) AS count FROM business_events WHERE workspace_id = $1 GROUP BY source ORDER BY count DESC`,
        [wsId]
      ),
      pool.query(
        `SELECT status, COUNT(*) AS count FROM business_events WHERE workspace_id = $1 GROUP BY status ORDER BY count DESC`,
        [wsId]
      ),
      pool.query(
        `SELECT owner_agent, COUNT(*) AS count FROM business_events WHERE workspace_id = $1 AND owner_agent IS NOT NULL GROUP BY owner_agent ORDER BY count DESC`,
        [wsId]
      ),
      pool.query(
        `SELECT event_type, COUNT(*) AS count FROM business_events WHERE workspace_id = $1 GROUP BY event_type ORDER BY count DESC`,
        [wsId]
      ),
      pool.query(
        `SELECT COUNT(*) AS count FROM business_events WHERE workspace_id = $1`,
        [wsId]
      ),
    ]);

    res.json({
      total: parseInt(total.rows[0].count, 10),
      bySource: bySource.rows,
      byStatus: byStatus.rows,
      byAgent: byAgent.rows,
      byType: byType.rows,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/business-events — list events (paginated, filterable)
router.get('/', ...guard, async (req, res, next) => {
  try {
    const { source, event_type, status, owner_agent, from, to } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const params = [req.workspace.id];
    let where = 'WHERE workspace_id = $1';

    if (source) {
      params.push(source);
      where += ` AND source = $${params.length}`;
    }
    if (event_type) {
      params.push(event_type);
      where += ` AND event_type = $${params.length}`;
    }
    if (status) {
      params.push(status);
      where += ` AND status = $${params.length}`;
    }
    if (owner_agent) {
      params.push(owner_agent);
      where += ` AND owner_agent = $${params.length}`;
    }
    if (from) {
      params.push(from);
      where += ` AND created_at >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      where += ` AND created_at <= $${params.length}`;
    }

    const countRes = await pool.query(
      `SELECT COUNT(*) FROM business_events ${where}`,
      params
    );

    params.push(limit, offset);
    const result = await pool.query(
      `SELECT * FROM business_events ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      events: result.rows,
      total: parseInt(countRes.rows[0].count, 10),
      page,
      limit,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/business-events/:id — get single event
router.get('/:id', ...guard, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT * FROM business_events WHERE id = $1 AND workspace_id = $2`,
      [req.params.id, req.workspace.id]
    );
    if (!result.rows[0]) return res.status(404).json({ message: 'Business event not found' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/business-events/:id/reprocess — re-run the pipeline
router.post('/:id/reprocess', ...guard, async (req, res, next) => {
  try {
    const existing = await pool.query(
      `SELECT id FROM business_events WHERE id = $1 AND workspace_id = $2`,
      [req.params.id, req.workspace.id]
    );
    if (!existing.rows[0]) return res.status(404).json({ message: 'Business event not found' });

    // Reset status to pending so pipeline runs fresh
    await pool.query(
      `UPDATE business_events SET status = 'pending', updated_at = NOW() WHERE id = $1`,
      [req.params.id]
    );

    const processed = await processBusinessEvent(req.workspace.id, req.params.id);
    res.json(processed);
  } catch (err) {
    next(err);
  }
});

export default router;
