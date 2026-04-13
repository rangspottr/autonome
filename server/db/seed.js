import 'dotenv/config';
import bcrypt from 'bcrypt';
import { pool } from './index.js';

const DEV_EMAIL = process.env.SEED_EMAIL || 'admin@autonome.local';
const DEV_PASSWORD = process.env.SEED_PASSWORD || 'autonome123!';
const DEV_FULL_NAME = 'Admin User';
const DEV_WORKSPACE_NAME = 'Dev Workspace';

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create dev user (idempotent: skip if email already exists)
    const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);
    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, full_name, email_verified)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (email) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             full_name = EXCLUDED.full_name
       RETURNING id`,
      [DEV_EMAIL, passwordHash, DEV_FULL_NAME]
    );
    const userId = userResult.rows[0].id;

    // Create dev workspace if it doesn't already exist for this user
    let workspaceId;
    const existingWorkspace = await client.query(
      `SELECT w.id FROM workspaces w
       JOIN workspace_members wm ON wm.workspace_id = w.id
       WHERE wm.user_id = $1 AND w.name = $2
       LIMIT 1`,
      [userId, DEV_WORKSPACE_NAME]
    );

    if (existingWorkspace.rows.length > 0) {
      workspaceId = existingWorkspace.rows[0].id;
    } else {
      const workspaceResult = await client.query(
        `INSERT INTO workspaces (name, onboarding_completed)
         VALUES ($1, true)
         RETURNING id`,
        [DEV_WORKSPACE_NAME]
      );
      workspaceId = workspaceResult.rows[0].id;
    }

    // Link user to workspace as owner (idempotent)
    await client.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1, $2, 'owner')
       ON CONFLICT (workspace_id, user_id) DO NOTHING`,
      [workspaceId, userId]
    );

    // Create active subscription if one doesn't exist for this workspace
    const existingSub = await client.query(
      `SELECT id FROM subscriptions WHERE workspace_id = $1 LIMIT 1`,
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

    console.log('Dev seed complete.');
    console.log('   Email:    ', DEV_EMAIL);
    console.log('   Password: ', DEV_PASSWORD);
    process.exit(0);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

seed();
