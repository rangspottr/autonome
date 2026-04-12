import jwt from 'jsonwebtoken';
import { pool } from '../db/index.js';
import { config } from '../config.js';

export function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }
    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, config.JWT_SECRET);
    req.user = { id: decoded.id, email: decoded.email, full_name: decoded.full_name };
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

export async function requireWorkspace(req, res, next) {
  try {
    const workspaceId = req.headers['x-workspace-id'];
    if (!workspaceId) {
      return res.status(400).json({ message: 'Workspace ID required' });
    }
    const result = await pool.query(
      `SELECT w.* FROM workspaces w
       JOIN workspace_members wm ON wm.workspace_id = w.id
       WHERE w.id = $1 AND wm.user_id = $2`,
      [workspaceId, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(403).json({ message: 'Access denied to workspace' });
    }
    req.workspace = result.rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

export async function requireActiveSubscription(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT * FROM subscriptions WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [req.workspace.id]
    );
    if (result.rows.length === 0) {
      return res.status(402).json({ message: 'No active subscription' });
    }
    const sub = result.rows[0];
    if (sub.status !== 'active' && sub.status !== 'trialing') {
      return res.status(402).json({ message: 'Subscription inactive', status: sub.status });
    }
    req.subscription = sub;
    next();
  } catch (err) {
    next(err);
  }
}
