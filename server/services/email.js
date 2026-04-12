import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { pool } from '../db/index.js';

function isSmtpConfigured() {
  return !!(config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS);
}

function createTransporter() {
  return nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    auth: {
      user: config.SMTP_USER,
      pass: config.SMTP_PASS,
    },
  });
}

export async function sendEmail({ to, subject, body, html }) {
  if (!isSmtpConfigured()) {
    console.log(`[Email] SMTP not configured — simulating send to ${to}: "${subject}"`);
    return { success: true, simulated: true };
  }

  try {
    const transporter = createTransporter();
    const info = await transporter.sendMail({
      from: config.SMTP_FROM,
      to,
      subject,
      text: body,
      html: html || undefined,
    });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error('[Email] Send failed:', err.message);
    return { success: false, error: err.message };
  }
}

export async function processEmailQueue(workspaceId) {
  const queued = await pool.query(
    `SELECT c.*, ct.email AS contact_email
     FROM communications c
     LEFT JOIN contacts ct ON ct.id = c.contact_id AND ct.workspace_id = c.workspace_id
     WHERE c.workspace_id = $1 AND c.channel = 'email' AND c.status = 'queued'
     ORDER BY c.created_at ASC`,
    [workspaceId]
  );

  let processed = 0;
  for (const comm of queued.rows) {
    const to = comm.contact_email;
    if (!to) {
      await pool.query(
        `UPDATE communications SET status = 'failed', metadata = $1 WHERE id = $2`,
        [JSON.stringify({ error: 'No email address for contact' }), comm.id]
      );
      continue;
    }

    const result = await sendEmail({
      to,
      subject: comm.subject || '(No subject)',
      body: comm.body || '',
    });

    const newStatus = result.simulated ? 'simulated' : result.success ? 'sent' : 'failed';
    const metadata = result.simulated
      ? { simulated: true, delivery_method: 'simulated' }
      : result.success
      ? { messageId: result.messageId, delivery_method: 'real' }
      : { error: result.error, delivery_method: 'failed' };

    await pool.query(
      `UPDATE communications
       SET status = $1, sent_at = NOW(), metadata = $2
       WHERE id = $3`,
      [newStatus, JSON.stringify(metadata), comm.id]
    );

    await pool.query(
      `INSERT INTO audit_log (workspace_id, agent, action, entity_type, entity_id, details, outcome)
       VALUES ($1, 'email', $2, 'communication', $3, $4, $5)`,
      [
        workspaceId,
        result.success || result.simulated ? 'email_sent' : 'email_failed',
        comm.id,
        JSON.stringify({ to, subject: comm.subject, ...metadata }),
        result.success || result.simulated ? 'success' : 'failed',
      ]
    );

    processed++;
  }

  return processed;
}
