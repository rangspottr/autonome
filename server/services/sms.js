import twilio from 'twilio';
import { config } from '../config.js';
import { pool } from '../db/index.js';

function isTwilioConfigured() {
  return !!(config.TWILIO_ACCOUNT_SID && config.TWILIO_AUTH_TOKEN && config.TWILIO_PHONE_NUMBER);
}

export async function sendSMS({ to, body }) {
  if (!isTwilioConfigured()) {
    console.log(`[SMS] Twilio not configured — simulating send to ${to}`);
    return { success: true, simulated: true };
  }

  try {
    const client = twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);
    const message = await client.messages.create({
      body,
      from: config.TWILIO_PHONE_NUMBER,
      to,
    });
    return { success: true, sid: message.sid };
  } catch (err) {
    console.error(`[SMS] Send failed to ${to}:`, err.message);
    return { success: false, error: err.message };
  }
}

export async function processSMSQueue(workspaceId) {
  const queued = await pool.query(
    `SELECT c.*, ct.phone AS contact_phone
     FROM communications c
     LEFT JOIN contacts ct ON ct.id = c.contact_id AND ct.workspace_id = c.workspace_id
     WHERE c.workspace_id = $1 AND c.channel = 'sms' AND c.status = 'queued'
     ORDER BY c.created_at ASC`,
    [workspaceId]
  );

  let processed = 0;
  for (const comm of queued.rows) {
    const to = comm.contact_phone;
    if (!to) {
      await pool.query(
        `UPDATE communications SET status = 'failed', metadata = $1 WHERE id = $2`,
        [JSON.stringify({ error: 'No phone number for contact' }), comm.id]
      );
      continue;
    }

    const result = await sendSMS({ to, body: comm.body || '' });

    const newStatus = result.simulated ? 'simulated' : result.success ? 'sent' : 'failed';
    const metadata = result.simulated
      ? { simulated: true, delivery_method: 'simulated' }
      : result.success
      ? { sid: result.sid, delivery_method: 'real' }
      : { error: result.error, delivery_method: 'failed' };

    await pool.query(
      `UPDATE communications
       SET status = $1, sent_at = NOW(), metadata = $2
       WHERE id = $3`,
      [newStatus, JSON.stringify(metadata), comm.id]
    );

    await pool.query(
      `INSERT INTO audit_log (workspace_id, agent, action, entity_type, entity_id, details, outcome)
       VALUES ($1, 'sms', $2, 'communication', $3, $4, $5)`,
      [
        workspaceId,
        result.success || result.simulated ? 'sms_sent' : 'sms_failed',
        comm.id,
        JSON.stringify({ to, ...metadata }),
        result.success || result.simulated ? 'success' : 'failed',
      ]
    );

    processed++;
  }

  return processed;
}
