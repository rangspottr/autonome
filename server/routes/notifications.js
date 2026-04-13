import { Router } from 'express';
import { pool } from '../db/index.js';
import { requireAuth, requireWorkspace, requireActiveSubscription } from '../middleware/auth.js';

const router = Router();
const guard = [requireAuth, requireWorkspace, requireActiveSubscription];

/**
 * GET /api/notifications
 * List notifications for current user. Supports ?type, ?read, ?limit, ?offset.
 */
router.get('/', ...guard, async (req, res, next) => {
  try {
    const wsId = req.workspace.id;
    const userId = req.user.id;
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
    const offset = parseInt(req.query.offset, 10) || 0;
    const { type, read } = req.query;

    const conditions = ['workspace_id = $1', 'user_id = $2'];
    const params = [wsId, userId];
    let idx = 3;

    if (type) {
      conditions.push(`type = $${idx++}`);
      params.push(type);
    }
    if (read !== undefined) {
      conditions.push(`read = $${idx++}`);
      params.push(read === 'true');
    }

    const where = conditions.join(' AND ');

    const result = await pool.query(
      `SELECT * FROM notifications
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM notifications WHERE ${where}`,
      params
    );

    const unreadResult = await pool.query(
      `SELECT COUNT(*) FROM notifications
       WHERE workspace_id = $1 AND user_id = $2 AND read = false`,
      [wsId, userId]
    );

    res.json({
      notifications: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
      unread: parseInt(unreadResult.rows[0].count, 10),
      limit,
      offset,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/notifications/:id/read
 * Mark a specific notification as read.
 */
router.post('/:id/read', ...guard, async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE notifications
       SET read = true, read_at = NOW()
       WHERE id = $1 AND workspace_id = $2 AND user_id = $3
       RETURNING *`,
      [id, req.workspace.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/notifications/read-all
 * Mark all notifications as read for current user.
 */
router.post('/read-all', ...guard, async (req, res, next) => {
  try {
    const result = await pool.query(
      `UPDATE notifications
       SET read = true, read_at = NOW()
       WHERE workspace_id = $1 AND user_id = $2 AND read = false`,
      [req.workspace.id, req.user.id]
    );
    res.json({ updated: result.rowCount });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/notifications/preferences
 * Get notification preferences for current user.
 */
router.get('/preferences', ...guard, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT * FROM notification_preferences
       WHERE workspace_id = $1 AND user_id = $2`,
      [req.workspace.id, req.user.id]
    );
    if (result.rows.length === 0) {
      // Return defaults
      return res.json({
        daily_digest: true,
        approval_alerts: true,
        critical_risk_alerts: true,
        boardroom_summaries: true,
        quiet_hours_start: null,
        quiet_hours_end: null,
        quiet_hours_timezone: 'UTC',
        channels: { email: true, in_app: true },
      });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/notifications/preferences
 * Update notification preferences for current user.
 */
router.patch('/preferences', ...guard, async (req, res, next) => {
  try {
    const {
      daily_digest,
      approval_alerts,
      critical_risk_alerts,
      boardroom_summaries,
      quiet_hours_start,
      quiet_hours_end,
      quiet_hours_timezone,
      channels,
    } = req.body;

    const result = await pool.query(
      `INSERT INTO notification_preferences
         (workspace_id, user_id, daily_digest, approval_alerts, critical_risk_alerts,
          boardroom_summaries, quiet_hours_start, quiet_hours_end, quiet_hours_timezone, channels, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
       ON CONFLICT (workspace_id, user_id) DO UPDATE SET
         daily_digest = COALESCE($3, notification_preferences.daily_digest),
         approval_alerts = COALESCE($4, notification_preferences.approval_alerts),
         critical_risk_alerts = COALESCE($5, notification_preferences.critical_risk_alerts),
         boardroom_summaries = COALESCE($6, notification_preferences.boardroom_summaries),
         quiet_hours_start = COALESCE($7, notification_preferences.quiet_hours_start),
         quiet_hours_end = COALESCE($8, notification_preferences.quiet_hours_end),
         quiet_hours_timezone = COALESCE($9, notification_preferences.quiet_hours_timezone),
         channels = COALESCE($10, notification_preferences.channels),
         updated_at = NOW()
       RETURNING *`,
      [
        req.workspace.id,
        req.user.id,
        daily_digest ?? true,
        approval_alerts ?? true,
        critical_risk_alerts ?? true,
        boardroom_summaries ?? true,
        quiet_hours_start || null,
        quiet_hours_end || null,
        quiet_hours_timezone || 'UTC',
        channels ? JSON.stringify(channels) : JSON.stringify({ email: true, in_app: true }),
      ]
    );
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
