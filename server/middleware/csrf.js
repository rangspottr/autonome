import { randomBytes } from 'crypto';

const CSRF_COOKIE = '__csrf';

const SKIP_PATHS = [
  '/api/webhooks/lead',
  '/api/webhooks/payment',
  '/api/webhooks/event',
  '/api/billing/webhook',
  '/api/auth/login',
  '/api/auth/signup',
];

export function csrfMiddleware(req, res, next) {
  // Always set/refresh the CSRF cookie on every request
  let token = req.cookies?.[CSRF_COOKIE];
  if (!token) {
    token = randomBytes(32).toString('hex');
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      sameSite: 'Strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
  }

  // Only enforce on state-changing methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  // Skip explicitly excluded paths
  if (SKIP_PATHS.some((p) => req.path === p || req.path.startsWith(p))) {
    return next();
  }

  const headerToken = req.headers['x-csrf-token'];
  if (!headerToken || headerToken !== token) {
    return res.status(403).json({ message: 'Invalid CSRF token' });
  }

  next();
}
