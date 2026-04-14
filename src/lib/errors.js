/**
 * Returns a user-friendly error message, falling back to `fallback` when the
 * error looks like a raw runtime / minified error rather than a clean API response.
 */
export function friendlyError(err, fallback) {
  const msg = err?.message || '';
  if (/invalid|unauthorized|required|forbidden|not found|timeout|network|rate limit|credential|connection/i.test(msg)) {
    return msg;
  }
  return fallback;
}
