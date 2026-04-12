import { pool } from '../db/index.js';

const DEFAULT_INTERVAL_HOURS = 6;

export async function runCleanup() {
  try {
    const refreshResult = await pool.query(
      `DELETE FROM refresh_tokens WHERE revoked = TRUE OR expires_at < NOW()`
    );
    const resetResult = await pool.query(
      `DELETE FROM password_reset_tokens WHERE expires_at < NOW()`
    );
    console.log(
      `[Cleanup] Removed ${refreshResult.rowCount} expired refresh tokens, ${resetResult.rowCount} expired reset tokens`
    );
  } catch (err) {
    console.error('[Cleanup] Error during token cleanup:', err.message);
  }
}

export function startCleanupScheduler() {
  const intervalHours = parseInt(process.env.CLEANUP_INTERVAL_HOURS) || DEFAULT_INTERVAL_HOURS;
  const intervalMs = intervalHours * 60 * 60 * 1000;

  // Run immediately on startup
  runCleanup();

  // Then run on interval
  const timer = setInterval(runCleanup, intervalMs);
  console.log(`[Cleanup] Scheduler started — running every ${intervalHours} hours`);
  return timer;
}
