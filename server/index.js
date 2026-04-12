import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
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

// Raw body for Stripe webhooks
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));

// JSON body for everything else
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/deals', dealRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api/audit-log', auditLogRoutes);
app.use('/api/communications', communicationRoutes);
app.use('/api/agent-runs', agentRunRoutes);

// Centralized error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
});

app.listen(config.PORT, () => {
  console.log(`Autonome server running on port ${config.PORT}`);
});
