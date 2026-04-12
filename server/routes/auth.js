import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { pool } from '../db/index.js';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';
import { sendEmail } from '../services/email.js';

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

router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'email is required' });
    }
    // Always return 200 to avoid leaking email existence
    const user = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (user.rows.length > 0) {
      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await pool.query(
        `INSERT INTO password_reset_tokens (user_id, token, expires_at)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [user.rows[0].id, token, expiresAt]
      );
      const resetUrl = `${config.CLIENT_URL}/reset-password?token=${token}`;
      if (config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS) {
        await sendEmail({
          to: email,
          subject: 'Reset your Autonome password',
          body: `Click the link below to reset your password (expires in 1 hour):\n\n${resetUrl}\n\nIf you did not request this, please ignore this email.`,
        });
      } else {
        console.warn(`[Auth] Password reset token for ${email}: ${resetUrl}`);
      }
    }
    res.json({ message: 'If that email exists, a reset link has been sent' });
  } catch (err) {
    next(err);
  }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ message: 'token and newPassword are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }
    const result = await pool.query(
      `SELECT * FROM password_reset_tokens WHERE token = $1 AND expires_at > NOW()`,
      [token]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }
    const resetToken = result.rows[0];
    const password_hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [password_hash, resetToken.user_id]);
    await pool.query('DELETE FROM password_reset_tokens WHERE token = $1', [token]);
    res.json({ message: 'Password updated' });
  } catch (err) {
    next(err);
  }
});

export default router;
