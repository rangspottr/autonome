import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { csrfMiddleware } from './middleware/csrf.js';
import { pool } from './db/index.js';

import authRoutes from './routes/auth.js';
import workspaceRoutes from './routes/workspaces.js';
import billingRoutes from './routes/billing.js';
import contactRoutes from './routes/contacts.js';
import dealRoutes from './routes/deals.js';
import invoiceRoutes from './routes/invoices.js';
import taskRoutes from './routes/tasks.js';
import workflowRoutes from './routes/workflows.js';
import auditLogRoutes from './routes/audit-log.js';
import communicationRoutes from './routes/communications.js';
import agentRunRoutes from './routes/agent-runs.js';
import assetRoutes from './routes/assets.js';
import knowledgeRoutes from './routes/knowledge.js';
import agentRoutes from './routes/agent.js';
import metricsRoutes from './routes/metrics.js';
import aiRoutes from './routes/ai.js';
import webhookRoutes from './routes/webhooks.js';
import settingsRoutes from './routes/settings.js';
import agentsRoutes from './routes/agents.js';
import intelligenceRoutes from './routes/intelligence.js';
import integrationsRoutes from './routes/integrations.js';
import businessEventsRoutes from './routes/business-events.js';
import ingestRoutes from './routes/ingest.js';
import operatorInstructionsRoutes from './routes/operator-instructions.js';
import companiesRoutes from './routes/companies.js';
import commandRoutes from './routes/command.js';
import activityRoutes from './routes/activity.js';
import notificationsRoutes from './routes/notifications.js';
import autonomyRoutes from './routes/autonomy.js';
import proactiveAlertsRoutes from './routes/proactive-alerts.js';
import { startScheduler } from './engine/cycle.js';
import { autoSeed } from './db/auto-seed.js';
import { startCleanupScheduler } from './jobs/cleanup.js';
import { startDailyDigestScheduler } from './jobs/daily-digest.js';

export function createApp() {
  const app = express();

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", config.CLIENT_URL],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
      },
    },
  }));
  app.use(cors({ origin: config.CLIENT_URL, credentials: true }));
  app.use(cookieParser());

  // Rate limiting — auth endpoints (strict, per spec)
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many login attempts, please try again later.' },
  });

  const signupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many signup attempts, please try again later.' },
  });

  const forgotPasswordLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many password reset requests, please try again later.' },
  });

  const verifyEmailLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many verification attempts, please try again later.' },
  });

  const refreshLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many refresh attempts, please try again later.' },
  });

  // General rate limiter for authenticated API routes
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests, please try again later.' },
  });

  // CSRF double-submit cookie protection (mounted after cookie-parser)
  app.use(csrfMiddleware);

  // Remove old custom CSRF x-requested-with check — replaced by csrfMiddleware above

  // Raw body for Stripe webhooks (must be before express.json())
  app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));

  // JSON body for everything else
  app.use(express.json());

  // Health check (light rate limit to protect DB ping)
  const healthLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.get('/api/health', healthLimiter, async (req, res) => {
    let dbStatus = 'ok';
    try {
      await pool.query('SELECT 1');
    } catch {
      dbStatus = 'error';
    }
    res.json({
      status: dbStatus === 'ok' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      db: dbStatus,
      uptime: Math.floor(process.uptime()),
      node: process.version,
    });
  });

  // Routes — per-endpoint auth rate limiters must come before the route handler
  app.use('/api/auth/login', loginLimiter);
  app.use('/api/auth/signup', signupLimiter);
  app.use('/api/auth/forgot-password', forgotPasswordLimiter);
  app.use('/api/auth/verify-email', verifyEmailLimiter);
  app.use('/api/auth/refresh', refreshLimiter);
  app.use('/api/auth', authRoutes);
  app.use('/api/workspaces', apiLimiter, workspaceRoutes);
  app.use('/api/billing', apiLimiter, billingRoutes);
  app.use('/api/contacts', apiLimiter, contactRoutes);
  app.use('/api/deals', apiLimiter, dealRoutes);
  app.use('/api/invoices', apiLimiter, invoiceRoutes);
  app.use('/api/tasks', apiLimiter, taskRoutes);
  app.use('/api/workflows', apiLimiter, workflowRoutes);
  app.use('/api/audit-log', apiLimiter, auditLogRoutes);
  app.use('/api/communications', apiLimiter, communicationRoutes);
  app.use('/api/agent-runs', apiLimiter, agentRunRoutes);
  app.use('/api/assets', apiLimiter, assetRoutes);
  app.use('/api/knowledge', apiLimiter, knowledgeRoutes);
  app.use('/api/agent', apiLimiter, agentRoutes);
  app.use('/api/metrics', apiLimiter, metricsRoutes);
  app.use('/api/ai', apiLimiter, aiRoutes);
  app.use('/api/webhooks', apiLimiter, webhookRoutes);
  app.use('/api/settings', apiLimiter, settingsRoutes);
  app.use('/api/agents', apiLimiter, agentsRoutes);
  app.use('/api/intelligence', apiLimiter, intelligenceRoutes);
  app.use('/api/integrations', apiLimiter, integrationsRoutes);
  app.use('/api/business-events', apiLimiter, businessEventsRoutes);
  app.use('/api/ingest', apiLimiter, ingestRoutes);
  app.use('/api/operator-instructions', apiLimiter, operatorInstructionsRoutes);
  app.use('/api/companies', apiLimiter, companiesRoutes);
  app.use('/api/command', apiLimiter, commandRoutes);
  app.use('/api/activity', apiLimiter, activityRoutes);
  app.use('/api/notifications', apiLimiter, notificationsRoutes);
  app.use('/api/autonomy-settings', apiLimiter, autonomyRoutes);
  app.use('/api/proactive-alerts', apiLimiter, proactiveAlertsRoutes);

  // In production, serve the Vite build
  if (process.env.NODE_ENV === 'production') {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    app.use(express.static(path.join(__dirname, '..', 'dist')));
    // SPA fallback — serve index.html for all non-API routes
    app.get('*', apiLimiter, (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
    });
  }

  // Centralized error handler
  app.use((err, req, res, _next) => {
    console.error(err);
    res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
  });

  return app;
}

// Only start the server when run directly
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const app = createApp();
  app.listen(config.PORT, async () => {
    console.log(`Autonome server running on port ${config.PORT}`);
    try {
      await autoSeed();
    } catch (err) {
      console.error('[Auto-Seed] Failed:', err.message);
    }
    try {
      startScheduler();
    } catch (err) {
      console.error('[Agent Scheduler] Failed to start scheduler:', err);
    }
    try {
      startCleanupScheduler();
    } catch (err) {
      console.error('[Cleanup Scheduler] Failed to start:', err.message);
    }
    try {
      startDailyDigestScheduler();
    } catch (err) {
      console.error('[Daily Digest Scheduler] Failed to start:', err.message);
    }
  });
}
