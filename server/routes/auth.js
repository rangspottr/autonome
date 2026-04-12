import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { body } from 'express-validator';
import { pool } from '../db/index.js';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { sendEmail } from '../services/email.js';

const router = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

function issueAccessToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, full_name: user.full_name },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRES_IN }
  );
}

async function issueRefreshToken(userId) {
  const token = randomBytes(64).toString('hex');
  const expiresAt = new Date(
    Date.now() + (config.REFRESH_TOKEN_EXPIRES_DAYS || 7) * 24 * 60 * 60 * 1000
  );
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
    [userId, token, expiresAt]
  );
  return token;
}

async function logAudit(workspaceId, action, details, outcome, ip) {
  try {
    await pool.query(
      `INSERT INTO audit_log (workspace_id, agent, action, details, outcome)
       VALUES ($1, 'system', $2, $3, $4)`,
      [workspaceId || null, action, JSON.stringify({ ...details, ip: ip || undefined }), outcome]
    );
  } catch {
    // Non-fatal — never block auth on audit failure
  }
}

// ── POST /signup ──────────────────────────────────────────────────────────────

router.post(
  '/signup',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('full_name').trim().notEmpty().isLength({ max: 255 }),
    validate,
  ],
  async (req, res, next) => {
    try {
      const { email, password, full_name } = req.body;
      const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ message: 'Email already in use' });
      }

      const password_hash = await bcrypt.hash(password, 10);

      // Generate email verification token
      const verificationToken = randomBytes(32).toString('hex');
      const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

      const smtpConfigured = config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS;
      const emailVerified = !smtpConfigured; // auto-verify when SMTP not configured

      const result = await pool.query(
        `INSERT INTO users (email, password_hash, full_name, email_verified, email_verification_token, email_verification_expires)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, email, full_name, email_verified, created_at`,
        [email, password_hash, full_name, emailVerified, emailVerified ? null : verificationToken, emailVerified ? null : verificationExpires]
      );
      const user = result.rows[0];

      if (!emailVerified) {
        const verifyUrl = `${config.CLIENT_URL}/verify-email?token=${verificationToken}`;
        await sendEmail({
          to: user.email,
          subject: 'Verify your Autonome email',
          body: `Welcome to Autonome!\n\nPlease verify your email by clicking the link below (expires in 24 hours):\n\n${verifyUrl}\n\nIf you did not sign up, please ignore this email.`,
        }).catch((err) => console.warn('[Auth] Failed to send verification email:', err.message));
      } else {
        console.warn(`[Auth] SMTP not configured — auto-verified email for ${user.email}`);
      }

      const token = issueAccessToken(user);
      const refreshToken = await issueRefreshToken(user.id);

      await logAudit(null, 'user_signup', { email: user.email }, 'success', req.ip);

      res.status(201).json({ token, refreshToken, user, emailVerificationRequired: !emailVerified });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /verify-email ─────────────────────────────────────────────────────────

router.get('/verify-email', async (req, res, next) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ message: 'token is required' });

    const result = await pool.query(
      `SELECT id FROM users
       WHERE email_verification_token = $1
         AND email_verification_expires > NOW()
         AND email_verified = FALSE`,
      [token]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid or expired verification token' });
    }

    await pool.query(
      `UPDATE users
       SET email_verified = TRUE,
           email_verification_token = NULL,
           email_verification_expires = NULL
       WHERE id = $1`,
      [result.rows[0].id]
    );

    res.json({ verified: true });
  } catch (err) {
    next(err);
  }
});

// ── POST /login ───────────────────────────────────────────────────────────────

router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
    validate,
  ],
  async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const result = await pool.query(
        `SELECT u.*, wm.workspace_id, w.name as workspace_name
         FROM users u
         LEFT JOIN workspace_members wm ON wm.user_id = u.id
         LEFT JOIN workspaces w ON w.id = wm.workspace_id
         WHERE u.email = $1
         LIMIT 1`,
        [email]
      );

      if (result.rows.length === 0) {
        await logAudit(null, 'login_failed', { email, reason: 'user_not_found' }, 'failed', req.ip);
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      const row = result.rows[0];

      // Account lockout check
      if (row.locked_until && new Date(row.locked_until) > new Date()) {
        await logAudit(row.workspace_id, 'login_blocked', { email }, 'failed', req.ip);
        return res.status(423).json({
          message: 'Account temporarily locked. Try again later.',
          locked_until: row.locked_until,
        });
      }

      // Email verification check
      if (row.email_verified === false) {
        return res.status(403).json({ message: 'Please verify your email before logging in' });
      }

      const valid = await bcrypt.compare(password, row.password_hash);
      if (!valid) {
        // Increment failed_login_attempts; lock after 5 failures
        const newAttempts = (row.failed_login_attempts || 0) + 1;
        const lockUntil = newAttempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
        await pool.query(
          `UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3`,
          [newAttempts, lockUntil, row.id]
        );
        if (lockUntil) {
          await logAudit(row.workspace_id, 'account_locked', { email }, 'failed', req.ip);
        } else {
          await logAudit(row.workspace_id, 'login_failed', { email, reason: 'wrong_password', attempts: newAttempts }, 'failed', req.ip);
        }
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      // Successful login — reset lockout counters
      await pool.query(
        `UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1`,
        [row.id]
      );

      const user = { id: row.id, email: row.email, full_name: row.full_name, email_verified: row.email_verified, created_at: row.created_at };
      const workspace = row.workspace_id ? { id: row.workspace_id, name: row.workspace_name } : null;
      const token = issueAccessToken(user);
      const refreshToken = await issueRefreshToken(user.id);

      await logAudit(row.workspace_id, 'user_login', { email }, 'success', req.ip);

      res.json({ token, refreshToken, user, workspace });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /refresh ─────────────────────────────────────────────────────────────

router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ message: 'refreshToken is required' });

    const result = await pool.query(
      `SELECT rt.*, u.id as user_id, u.email, u.full_name, u.email_verified
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token = $1 AND rt.revoked = FALSE AND rt.expires_at > NOW()`,
      [refreshToken]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid or expired refresh token' });
    }

    const row = result.rows[0];

    // Revoke old refresh token (rotation)
    await pool.query(`UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1`, [row.id]);

    const user = { id: row.user_id, email: row.email, full_name: row.full_name, email_verified: row.email_verified };
    const token = issueAccessToken(user);
    const newRefreshToken = await issueRefreshToken(user.id);

    res.json({ token, refreshToken: newRefreshToken });
  } catch (err) {
    next(err);
  }
});

// ── POST /logout ──────────────────────────────────────────────────────────────

router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      // Revoke the specific refresh token
      await pool.query(
        `UPDATE refresh_tokens SET revoked = TRUE WHERE token = $1 AND user_id = $2`,
        [refreshToken, req.user.id]
      );
    } else {
      // Revoke all refresh tokens for this user (full logout)
      await pool.query(
        `UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1`,
        [req.user.id]
      );
    }
    await logAudit(null, 'user_logout', { email: req.user.email }, 'success', req.ip);
    res.json({ message: 'Logged out' });
  } catch (err) {
    next(err);
  }
});

// ── GET /me ───────────────────────────────────────────────────────────────────

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const userResult = await pool.query(
      'SELECT id, email, full_name, email_verified, created_at FROM users WHERE id = $1',
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

// ── POST /forgot-password ─────────────────────────────────────────────────────

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
      await logAudit(null, 'password_reset_requested', { email }, 'success', req.ip);
    }
    res.json({ message: 'If that email exists, a reset link has been sent' });
  } catch (err) {
    next(err);
  }
});

// ── POST /reset-password ──────────────────────────────────────────────────────

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
    await logAudit(null, 'password_reset_completed', {}, 'success', req.ip);
    res.json({ message: 'Password updated' });
  } catch (err) {
    next(err);
  }
});

export default router;

