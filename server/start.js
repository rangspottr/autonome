/**
 * Production startup script.
 *
 * Runs all pending database migrations and then starts the HTTP server.
 * Using a single startup entry-point ensures the live database schema is
 * always in sync with the codebase on every deployment, preventing
 * "column does not exist" errors caused by un-applied migrations.
 *
 * Usage (production):
 *   node server/start.js
 *
 * The script exits non-zero if migrations fail so the process manager
 * (Heroku, Railway, Docker, PM2) treats a migration failure as a failed
 * deployment and does not route traffic to a broken instance.
 */

import { readdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

const { Pool } = pg;

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

async function main() {
  console.log('[start] Running database migrations…');
  try {
    await runMigrations();
  } catch (err) {
    console.error('[start] Migration failed — aborting startup:', err.message);
    process.exit(1);
  }

  console.log('[start] Starting HTTP server…');
  // Dynamic import so the server module only loads after migrations succeed.
  await import('./index.js');
}

main();
