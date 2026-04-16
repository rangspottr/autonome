/**
 * Production startup script.
 *
 * Runs all pending database migrations, verifies critical schema, and then
 * starts the HTTP server.  Using a single startup entry-point ensures the
 * live database schema is always in sync with the codebase on every
 * deployment, preventing "column does not exist" errors caused by
 * un-applied migrations.
 *
 * Usage (production):
 *   node server/start.js
 *
 * The script exits non-zero if migrations fail or if schema verification
 * detects missing tables/columns so the process manager (Heroku, Railway,
 * Docker, PM2) treats a broken deployment as a failed start and does not
 * route traffic to a broken instance.
 */

import { readdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

const { Pool } = pg;

// Critical tables and their required columns.  Any missing entry causes
// startup to abort with a clear, operator-facing error instead of a raw
// SQL error surfacing in the UI at runtime.
const REQUIRED_SCHEMA = {
  outputs: ['id', 'workspace_id', 'output_type', 'title', 'content', 'data', 'period_start', 'period_end', 'created_at'],
  workflows: ['id', 'workspace_id', 'template', 'status', 'updated_at'],
  agent_actions: ['id', 'workspace_id', 'agent', 'action_type', 'outcome', 'description', 'created_at'],
  invoices: ['id', 'workspace_id', 'status', 'amount', 'due_date', 'updated_at'],
  tasks: ['id', 'workspace_id', 'status', 'priority', 'due_date', 'updated_at'],
  deals: ['id', 'workspace_id', 'title', 'stage', 'value', 'expected_close_date', 'updated_at'],
  contacts: ['id', 'workspace_id', 'name', 'type', 'created_at'],
  proactive_alerts: ['id', 'workspace_id', 'severity', 'title', 'status', 'created_at'],
  job_health_runs: ['id', 'job_name', 'status', 'created_at'],
  workspaces: ['id'],
  users: ['id'],
};

async function runMigrations() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const migrationsDir = join(__dirname, 'db', 'migrations');
    const files = (await readdir(migrationsDir))
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const sql = await readFile(join(migrationsDir, file), 'utf8');
      console.log(`[migrate] Running: ${file}`);
      // Wrap each migration in a transaction so a partial failure does not
      // leave the schema in an inconsistent state.
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('COMMIT');
        console.log(`[migrate] Done:    ${file}`);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw new Error(`Migration ${file} failed: ${err.message}`);
      } finally {
        client.release();
      }
    }

    console.log('[migrate] All migrations applied.');
  } finally {
    await pool.end();
  }
}

/**
 * Verify that every table and column listed in REQUIRED_SCHEMA exists in the
 * live database.  Throws a descriptive error listing every missing item so
 * the operator knows exactly what to fix before the server can start.
 */
async function verifySchema() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const missing = [];

    for (const [table, columns] of Object.entries(REQUIRED_SCHEMA)) {
      // Check table exists
      const tableRes = await pool.query(
        `SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = $1`,
        [table]
      );
      if (tableRes.rowCount === 0) {
        missing.push(`table "${table}" does not exist`);
        continue; // skip column checks — whole table is missing
      }

      // Check each required column exists
      for (const column of columns) {
        const colRes = await pool.query(
          `SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
          [table, column]
        );
        if (colRes.rowCount === 0) {
          missing.push(`column "${table}"."${column}" does not exist`);
        }
      }
    }

    if (missing.length > 0) {
      throw new Error(
        `Schema verification failed — the following required schema is missing:\n` +
        missing.map((m) => `  • ${m}`).join('\n') +
        `\n\nRun pending migrations with: node server/db/migrate.js`
      );
    }

    console.log('[schema] All critical tables and columns verified.');
  } finally {
    await pool.end();
  }
}

async function main() {
  console.log('[start] Running database migrations…');
  try {
    await runMigrations();
  } catch (err) {
    console.error('[start] Migration failed — aborting startup:', err.message);
    process.exit(1);
  }

  console.log('[start] Verifying database schema…');
  try {
    await verifySchema();
  } catch (err) {
    console.error('[start] Schema verification failed — aborting startup:\n', err.message);
    process.exit(1);
  }

  console.log('[start] Starting HTTP server…');
  // Dynamic import so the server module only loads after migrations+schema checks succeed.
  const { startHttpServer } = await import('./index.js');
  startHttpServer();
}

main();
