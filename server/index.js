import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';

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
import { startScheduler } from './engine/cycle.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: config.CLIENT_URL, credentials: true }));

// Rate limiting for auth routes (strict)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' },
});

// General rate limiter for authenticated API routes
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' },
});

// CSRF protection — require custom header on all state-changing requests
// except webhook ingestion endpoints (which use API-key auth instead)
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.path.startsWith('/api/webhooks/lead') ||
      req.path.startsWith('/api/webhooks/payment') ||
      req.path.startsWith('/api/webhooks/event') ||
      req.path.startsWith('/api/billing/webhook')) {
    return next();
  }
  if (req.headers['x-requested-with'] !== 'XMLHttpRequest') {
    return res.status(403).json({ message: 'Forbidden: missing required header' });
  }
  next();
});

// Raw body for Stripe webhooks (must be before express.json())
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));

// JSON body for everything else
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authLimiter, authRoutes);
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
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
});

app.listen(config.PORT, () => {
  console.log(`Autonome server running on port ${config.PORT}`);
  try {
    startScheduler();
  } catch (err) {
    console.error('[Agent Scheduler] Failed to start scheduler:', err);
  }
});
