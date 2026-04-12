import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
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

// Centralized error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
});

app.listen(config.PORT, () => {
  console.log(`Autonome server running on port ${config.PORT}`);
});
