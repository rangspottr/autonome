import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../db/index.js';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/signup', async (req, res, next) => {
  try {
    const { email, password, full_name } = req.body;
    if (!email || !password || !full_name) {
      return res.status(400).json({ message: 'email, password, and full_name are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: 'Email already in use' });
    }
    const password_hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id, email, full_name, created_at`,
      [email.toLowerCase(), password_hash, full_name]
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email, full_name: user.full_name }, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRES_IN });
    res.status(201).json({ token, user });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'email and password are required' });
    }
    const result = await pool.query(
      `SELECT u.*, wm.workspace_id, w.name as workspace_name
       FROM users u
       LEFT JOIN workspace_members wm ON wm.user_id = u.id
       LEFT JOIN workspaces w ON w.id = wm.workspace_id
       WHERE u.email = $1
       LIMIT 1`,
      [email.toLowerCase()]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const row = result.rows[0];
    const valid = await bcrypt.compare(password, row.password_hash);
    if (!valid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const user = { id: row.id, email: row.email, full_name: row.full_name, created_at: row.created_at };
    const workspace = row.workspace_id ? { id: row.workspace_id, name: row.workspace_name } : null;
    const token = jwt.sign({ id: user.id, email: user.email, full_name: user.full_name }, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRES_IN });
    res.json({ token, user, workspace });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const userResult = await pool.query(
      'SELECT id, email, full_name, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    const user = userResult.rows[0];
    const workspacesResult = await pool.query(
      `SELECT w.*, wm.role, s.status as subscription_status
       FROM workspaces w
       JOIN workspace_members wm ON wm.workspace_id = w.id
       LEFT JOIN subscriptions s ON s.workspace_id = w.id
       WHERE wm.user_id = $1
       ORDER BY w.created_at DESC`,
      [req.user.id]
    );
    res.json({ user, workspaces: workspacesResult.rows });
  } catch (err) {
    next(err);
  }
});

export default router;
