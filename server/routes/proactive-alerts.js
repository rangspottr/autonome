import { Router } from 'express';
import { pool } from '../db/index.js';
import { requireAuth, requireWorkspace, requireActiveSubscription } from '../middleware/auth.js';

const router = Router();
const guard = [requireAuth, requireWorkspace, requireActiveSubscription];


/**
 * GET /api/proactive-alerts
 * List proactive alerts. Supports ?agent, ?severity, ?status, ?limit, ?offset.
 */
router.get('/', ...guard, async (req, res, next) => {
  try {
    const wsId = req.workspace.id;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = parseInt(req.query.offset, 10) || 0;
    const { agent, severity, status } = req.query;

    const conditions = ['workspace_id = $1'];
    const params = [wsId];
    let idx = 2;

    if (agent) {
      conditions.push(`agent = $${idx++}`);
      params.push(agent);
    }
    if (severity) {
      conditions.push(`severity = $${idx++}`);
      params.push(severity);
    }
    if (status) {
      conditions.push(`status = $${idx++}`);
      params.push(status);
    } else {
      conditions.push(`status = 'active'`);
    }

    const where = conditions.join(' AND ');

    const result = await pool.query(
      `SELECT * FROM proactive_alerts
       WHERE ${where}
       ORDER BY
         CASE severity
           WHEN 'critical' THEN 1
           WHEN 'high' THEN 2
           WHEN 'medium' THEN 3
           ELSE 4
         END,
         created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM proactive_alerts WHERE ${where}`,
      params
    );

    res.json({
      alerts: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
      limit,
      offset,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/proactive-alerts/:id/acknowledge
 * Acknowledge a proactive alert.
 */
router.post('/:id/acknowledge', ...guard, async (req, res, next) => {
  try {
    const result = await pool.query(
      `UPDATE proactive_alerts
       SET status = 'acknowledged', acknowledged_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND workspace_id = $2 AND status = 'active'
       RETURNING *`,
      [req.params.id, req.workspace.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Alert not found or already actioned' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/proactive-alerts/:id/dismiss
 * Dismiss a proactive alert.
 */
router.post('/:id/dismiss', ...guard, async (req, res, next) => {
  try {
    const result = await pool.query(
      `UPDATE proactive_alerts
       SET status = 'dismissed', updated_at = NOW()
       WHERE id = $1 AND workspace_id = $2 AND status IN ('active', 'acknowledged')
       RETURNING *`,
      [req.params.id, req.workspace.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Alert not found or already dismissed' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/proactive-alerts/:id/resolve
 * Mark a proactive alert as resolved.
 */
router.post('/:id/resolve', ...guard, async (req, res, next) => {
  try {
    const result = await pool.query(
      `UPDATE proactive_alerts
       SET status = 'resolved', resolved_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND workspace_id = $2 AND status != 'resolved'
       RETURNING *`,
      [req.params.id, req.workspace.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Alert not found or already resolved' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/proactive-alerts/stats
 * Alert statistics by severity and type.
 */
router.get('/stats', ...guard, async (req, res, next) => {
  try {
    const wsId = req.workspace.id;

    const [bySeverity, byAgent, byType] = await Promise.all([
      pool.query(
        `SELECT severity, COUNT(*) AS count FROM proactive_alerts
         WHERE workspace_id = $1 AND status = 'active'
         GROUP BY severity`,
        [wsId]
      ),
      pool.query(
        `SELECT agent, COUNT(*) AS count FROM proactive_alerts
         WHERE workspace_id = $1 AND status = 'active'
         GROUP BY agent`,
        [wsId]
      ),
      pool.query(
        `SELECT alert_type, COUNT(*) AS count FROM proactive_alerts
         WHERE workspace_id = $1 AND status = 'active'
         GROUP BY alert_type`,
        [wsId]
      ),
    ]);

    res.json({
      bySeverity: bySeverity.rows,
      byAgent: byAgent.rows,
      byType: byType.rows,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
