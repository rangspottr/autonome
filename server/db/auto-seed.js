import bcrypt from 'bcrypt';
import { pool } from './index.js';
import { config } from '../config.js';

const DEV_EMAIL = 'admin@autonome.local';
const DEV_PASSWORD = 'autonome123!';
const DEV_FULL_NAME = 'Admin User';
const DEV_WORKSPACE_NAME = 'Dev Workspace';

export async function autoSeed() {
  if (!config.BYPASS_SUBSCRIPTION) return;

  try {
    // Check if admin user already exists
    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1 LIMIT 1',
      [DEV_EMAIL]
    );

    if (existing.rows.length > 0) {
      console.log('[Auto-Seed] Admin user already exists, skipping');
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create admin user
      const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, full_name, email_verified, failed_login_attempts, locked_until)
         VALUES ($1, $2, $3, true, 0, NULL)
         ON CONFLICT (email) DO NOTHING
         RETURNING id`,
        [DEV_EMAIL, passwordHash, DEV_FULL_NAME]
      );

      // If another process beat us to it, bail out gracefully
      if (userResult.rows.length === 0) {
        await client.query('ROLLBACK');
        console.log('[Auto-Seed] Admin user already exists, skipping');
        return;
      }

      const userId = userResult.rows[0].id;

      // Create workspace
      const workspaceResult = await client.query(
        `INSERT INTO workspaces (name, onboarding_completed)
         VALUES ($1, true)
         RETURNING id`,
        [DEV_WORKSPACE_NAME]
      );
      const workspaceId = workspaceResult.rows[0].id;

      // Link user to workspace as owner (idempotent)
      await client.query(
        `INSERT INTO workspace_members (workspace_id, user_id, role)
         VALUES ($1, $2, 'owner')
         ON CONFLICT (workspace_id, user_id) DO NOTHING`,
        [workspaceId, userId]
      );

      // Create active subscription (check-before-insert to be idempotent)
      const existingSub = await client.query(
        'SELECT id FROM subscriptions WHERE workspace_id = $1 LIMIT 1',
        [workspaceId]
      );
      if (existingSub.rows.length === 0) {
        await client.query(
          `INSERT INTO subscriptions (workspace_id, status, current_period_start, current_period_end)
           VALUES ($1, 'active', NOW(), NOW() + interval '1 year')`,
          [workspaceId]
        );
      }

      await client.query('COMMIT');

      console.log('[Auto-Seed] Admin user created successfully');
      console.log('[Auto-Seed]   Email:', DEV_EMAIL);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.warn('[Auto-Seed] Warning: failed to seed admin user:', err.message);
  }
}
