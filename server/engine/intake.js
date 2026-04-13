import { pool } from '../db/index.js';

// ── Stage 1: Classification ────────────────────────────────────────────────────

function classifyEvent(event) {
  const { event_type, raw_data } = event;
  const data = raw_data || {};

  let category = 'general';
  let urgency = 'medium';
  let sentiment = 'neutral';
  let summary = '';

  // Determine category from event_type
  if (['inbound_email', 'form_submission', 'new_lead'].includes(event_type)) {
    category = 'communication';
  } else if (['payment_received', 'payment_failed', 'invoice_event'].includes(event_type)) {
    category = 'financial';
  } else if (['support_request', 'complaint', 'review'].includes(event_type)) {
    category = 'support';
  } else if (['missed_call', 'booking_request', 'schedule_event'].includes(event_type)) {
    category = 'operations';
  } else if (['document'].includes(event_type)) {
    category = 'document';
  }

  // Urgency rules
  if (event_type === 'payment_failed') {
    urgency = 'high';
    sentiment = 'negative';
    const amount = data.amount || 0;
    if (amount > 10000) urgency = 'critical';
    summary = `Payment failed: ${data.currency || 'USD'} ${amount} from ${data.customer_email || 'unknown'}`;
  } else if (event_type === 'payment_received') {
    urgency = 'low';
    sentiment = 'positive';
    summary = `Payment received: ${data.currency || 'USD'} ${data.amount || 0} from ${data.customer_email || 'unknown'}`;
  } else if (event_type === 'complaint') {
    urgency = 'high';
    sentiment = 'negative';
    summary = `Complaint received from ${data.from_email || data.from || 'unknown'}`;
  } else if (event_type === 'support_request') {
    urgency = data.priority === 'urgent' ? 'critical' : data.priority === 'high' ? 'high' : 'medium';
    sentiment = 'negative';
    summary = `Support request: ${data.subject || '(no subject)'} from ${data.from_email || data.from || 'unknown'}`;
  } else if (event_type === 'missed_call') {
    urgency = 'high';
    sentiment = 'neutral';
    summary = `Missed call from ${data.caller_name || data.caller_phone || 'unknown'}`;
  } else if (event_type === 'inbound_email') {
    const subject = (data.subject || '').toLowerCase();
    const body = (data.body || '').toLowerCase();
    if (/urgent|asap|immediately|critical/.test(subject + body)) urgency = 'high';
    if (/complaint|frustrated|unhappy|terrible|refund/.test(subject + body)) {
      sentiment = 'negative';
      urgency = 'high';
    } else if (/thank|great|excellent|happy|love/.test(subject + body)) {
      sentiment = 'positive';
    }
    summary = `Email from ${data.from || 'unknown'}: ${data.subject || '(no subject)'}`;
  } else if (event_type === 'form_submission') {
    urgency = 'medium';
    summary = `Form submission: ${data.form_type || 'unknown'} from ${data.fields?.email || data.fields?.name || 'unknown'}`;
  } else if (event_type === 'new_lead') {
    urgency = 'medium';
    sentiment = 'positive';
    summary = `New lead: ${data.name || data.email || 'unknown'}`;
  } else if (event_type === 'booking_request') {
    urgency = 'medium';
    summary = `Booking request: ${data.title || 'unknown'} on ${data.start || 'TBD'}`;
  } else if (event_type === 'review') {
    const rating = data.rating || 0;
    sentiment = rating >= 4 ? 'positive' : rating <= 2 ? 'negative' : 'neutral';
    urgency = rating <= 2 ? 'high' : 'low';
    summary = `Review received (${rating}/5): ${data.body || ''}`.substring(0, 200);
  } else if (event_type === 'invoice_event') {
    urgency = 'medium';
    summary = `Invoice event: ${data.status || 'unknown'} for ${data.invoice_ref || 'unknown'}`;
  } else {
    summary = `${event_type} event from ${event.source}`;
  }

  return { category, urgency, sentiment, summary };
}

// ── Stage 2: Entity Identification ───────────────────────────────────────────

async function identifyEntities(workspaceId, event) {
  const data = event.raw_data || {};
  const links = [];

  // Extract search signals
  const email =
    data.from ||
    data.from_email ||
    data.customer_email ||
    data.fields?.email ||
    null;
  const phone =
    data.caller_phone ||
    data.from ||
    data.fields?.phone ||
    null;
  const domain = email ? email.split('@')[1] : null;

  // Search contacts by email
  if (email) {
    try {
      const res = await pool.query(
        `SELECT id, name, company FROM contacts WHERE workspace_id = $1 AND email ILIKE $2 LIMIT 1`,
        [workspaceId, email]
      );
      if (res.rows[0]) {
        links.push({
          entity_type: 'contact',
          entity_id: res.rows[0].id,
          relationship: 'sender',
          confidence: 1.0,
        });

        // Find open deals for this contact
        const dealRes = await pool.query(
          `SELECT id, title FROM deals WHERE workspace_id = $1 AND contact_id = $2 AND stage NOT IN ('closed', 'lost') LIMIT 5`,
          [workspaceId, res.rows[0].id]
        );
        for (const deal of dealRes.rows) {
          links.push({ entity_type: 'deal', entity_id: deal.id, relationship: 'related_deal', confidence: 0.9 });
        }

        // Find pending invoices for this contact
        const invRes = await pool.query(
          `SELECT id, description FROM invoices WHERE workspace_id = $1 AND contact_id = $2 AND status IN ('pending', 'overdue', 'escalated') LIMIT 5`,
          [workspaceId, res.rows[0].id]
        );
        for (const inv of invRes.rows) {
          links.push({ entity_type: 'invoice', entity_id: inv.id, relationship: 'related_invoice', confidence: 0.9 });
        }

        // Find active workflows involving this contact
        const wfRes = await pool.query(
          `SELECT id, template FROM workflows WHERE workspace_id = $1 AND trigger_entity_id = $2 AND status = 'active' LIMIT 3`,
          [workspaceId, res.rows[0].id]
        );
        for (const wf of wfRes.rows) {
          links.push({ entity_type: 'workflow', entity_id: wf.id, relationship: 'active_workflow', confidence: 0.85 });
        }
      }
    } catch (_err) {
      // non-fatal
    }
  }

  // Search contacts by phone
  if (phone && !email) {
    try {
      const res = await pool.query(
        `SELECT id FROM contacts WHERE workspace_id = $1 AND phone = $2 LIMIT 1`,
        [workspaceId, phone]
      );
      if (res.rows[0] && !links.find((l) => l.entity_id === res.rows[0].id)) {
        links.push({ entity_type: 'contact', entity_id: res.rows[0].id, relationship: 'caller', confidence: 0.95 });
      }
    } catch (_err) {
      // non-fatal
    }
  }

  // Search companies by domain
  if (domain) {
    try {
      const res = await pool.query(
        `SELECT id, name FROM companies WHERE workspace_id = $1 AND domain ILIKE $2 LIMIT 1`,
        [workspaceId, domain]
      );
      if (res.rows[0]) {
        links.push({ entity_type: 'company', entity_id: res.rows[0].id, relationship: 'company_domain', confidence: 0.9 });
      }
    } catch (_err) {
      // non-fatal
    }
  }

  // Match invoice reference
  const invoiceRef = data.invoice_ref || data.invoice_reference || null;
  if (invoiceRef) {
    try {
      const res = await pool.query(
        `SELECT id FROM invoices WHERE workspace_id = $1 AND (description ILIKE $2 OR id::text = $2) LIMIT 1`,
        [workspaceId, `%${invoiceRef}%`]
      );
      if (res.rows[0] && !links.find((l) => l.entity_id === res.rows[0].id)) {
        links.push({ entity_type: 'invoice', entity_id: res.rows[0].id, relationship: 'invoice_ref', confidence: 0.95 });
      }
    } catch (_err) {
      // non-fatal
    }
  }

  return links;
}

// ── Stage 3: Agent Routing ─────────────────────────────────────────────────────

function routeToAgents(event, entityLinks) {
  const { event_type } = event;
  const routing = [];
  const hasOpenDeal = entityLinks.some((l) => l.entity_type === 'deal');
  const hasInvoice = entityLinks.some((l) => l.entity_type === 'invoice');

  if (['payment_received', 'payment_failed'].includes(event_type)) {
    routing.push({ agent: 'finance', role: 'primary', priority: 1, reason: 'Payment event — finance owns' });
    if (hasOpenDeal) {
      routing.push({ agent: 'revenue', role: 'informed', priority: 2, reason: 'Open deal linked to this payment' });
    }
  } else if (event_type === 'invoice_event') {
    routing.push({ agent: 'finance', role: 'primary', priority: 1, reason: 'Invoice event — finance owns' });
    if (hasOpenDeal) {
      routing.push({ agent: 'operations', role: 'informed', priority: 2, reason: 'Linked to active job/task' });
    }
  } else if (event_type === 'inbound_email') {
    const data = event.raw_data || {};
    const text = `${data.subject || ''} ${data.body || ''}`.toLowerCase();
    if (/invoice|payment|billing|charge|refund/.test(text)) {
      routing.push({ agent: 'finance', role: 'primary', priority: 1, reason: 'Email contains billing/payment content' });
    } else if (/proposal|quote|pricing|contract|deal|buy|purchase/.test(text)) {
      routing.push({ agent: 'revenue', role: 'primary', priority: 1, reason: 'Email contains sales/deal content' });
    } else if (/help|support|issue|problem|broken|error|ticket/.test(text)) {
      routing.push({ agent: 'support', role: 'primary', priority: 1, reason: 'Email contains support request content' });
    } else {
      routing.push({ agent: 'revenue', role: 'primary', priority: 1, reason: 'Inbound email routed to revenue by default' });
    }
    if (hasOpenDeal) {
      routing.push({ agent: 'revenue', role: hasOpenDeal ? 'coordinator' : 'informed', priority: 2, reason: 'Open deal found for sender' });
    }
  } else if (['form_submission', 'new_lead'].includes(event_type)) {
    const data = event.raw_data || {};
    const formType = (data.form_type || '').toLowerCase();
    if (/support|help|issue/.test(formType)) {
      routing.push({ agent: 'support', role: 'primary', priority: 1, reason: 'Support form submission' });
    } else {
      routing.push({ agent: 'revenue', role: 'primary', priority: 1, reason: 'New lead/form submission routed to revenue' });
    }
  } else if (event_type === 'missed_call') {
    if (hasOpenDeal) {
      routing.push({ agent: 'revenue', role: 'primary', priority: 1, reason: 'Missed call from prospect/lead with open deal' });
    } else if (hasInvoice) {
      routing.push({ agent: 'support', role: 'primary', priority: 1, reason: 'Missed call from customer with outstanding invoice' });
    } else {
      routing.push({ agent: 'operations', role: 'primary', priority: 1, reason: 'Missed call — no deal/invoice link, ops handles' });
    }
  } else if (['booking_request', 'schedule_event'].includes(event_type)) {
    routing.push({ agent: 'operations', role: 'primary', priority: 1, reason: 'Calendar/booking event owned by operations' });
    if (hasOpenDeal) {
      routing.push({ agent: 'revenue', role: 'informed', priority: 2, reason: 'Booking linked to open deal' });
    }
  } else if (['support_request', 'complaint'].includes(event_type)) {
    routing.push({ agent: 'support', role: 'primary', priority: 1, reason: 'Support/complaint — support owns' });
    if (hasOpenDeal) {
      routing.push({ agent: 'revenue', role: 'informed', priority: 2, reason: 'Customer has active deal — retention risk' });
    }
    if (hasInvoice) {
      routing.push({ agent: 'finance', role: 'informed', priority: 3, reason: 'Potential billing dispute' });
    }
  } else if (event_type === 'review') {
    routing.push({ agent: 'support', role: 'primary', priority: 1, reason: 'Review — support owns response' });
    routing.push({ agent: 'growth', role: 'informed', priority: 2, reason: 'Review impacts reputation/growth' });
    if (hasOpenDeal) {
      routing.push({ agent: 'revenue', role: 'informed', priority: 3, reason: 'Reviewer has open deal — retention risk' });
    }
  } else {
    routing.push({ agent: 'operations', role: 'primary', priority: 1, reason: 'Default routing to operations' });
  }

  // De-duplicate: keep only the first entry per agent
  const seen = new Set();
  const deduped = [];
  for (const r of routing) {
    if (!seen.has(r.agent)) {
      seen.add(r.agent);
      deduped.push(r);
    }
  }

  const ownerAgent = deduped.find((r) => r.role === 'primary')?.agent || deduped[0]?.agent || 'operations';
  return { routing: deduped, ownerAgent };
}

// ── Stage 4: Resolution Decision ──────────────────────────────────────────────

async function resolveEvent(workspaceId, event, entityLinks, agentRouting) {
  const { event_type, raw_data } = event;
  const data = raw_data || {};
  const resolution = {
    action_taken: null,
    action_ids: [],
    requires_approval: false,
    auto_acted: false,
    notes: [],
  };

  // Fetch active operator instructions for relevant agents
  let instructions = [];
  try {
    const agentNames = agentRouting.map((r) => r.agent);
    const res = await pool.query(
      `SELECT instruction, type, priority, agent FROM operator_instructions
       WHERE workspace_id = $1 AND active = true AND (agent IS NULL OR agent = ANY($2))
       ORDER BY priority DESC`,
      [workspaceId, agentNames]
    );
    instructions = res.rows;
  } catch (_err) {
    // non-fatal
  }

  // Check for approval requirement from operator instructions
  const requiresApprovalInstruction = instructions.find((i) =>
    /approval|approve|confirm|surface/i.test(i.instruction)
  );

  // Payment received — mark invoice paid if reference found
  if (event_type === 'payment_received') {
    const invoiceLink = entityLinks.find((l) => l.entity_type === 'invoice');
    if (invoiceLink) {
      if (requiresApprovalInstruction) {
        resolution.requires_approval = true;
        resolution.notes.push(`Operator instruction requires approval: "${requiresApprovalInstruction.instruction}"`);
      } else {
        try {
          await pool.query(
            `UPDATE invoices SET status = 'paid', amount_paid = amount, updated_at = NOW()
             WHERE id = $1 AND workspace_id = $2`,
            [invoiceLink.entity_id, workspaceId]
          );
          resolution.action_taken = 'marked_invoice_paid';
          resolution.auto_acted = true;
          resolution.notes.push(`Invoice ${invoiceLink.entity_id} automatically marked as paid`);
        } catch (_err) {
          resolution.notes.push('Failed to auto-mark invoice paid');
        }
      }
    }
  }

  // New lead / form submission — create contact if not found
  if (['new_lead', 'form_submission'].includes(event_type)) {
    const existingContact = entityLinks.find((l) => l.entity_type === 'contact');
    if (!existingContact) {
      const email = data.from || data.from_email || data.fields?.email || null;
      const name = data.from_name || data.fields?.name || null;
      if (email || name) {
        if (requiresApprovalInstruction) {
          resolution.requires_approval = true;
          resolution.notes.push('New contact creation pending operator approval');
        } else {
          try {
            const newContact = await pool.query(
              `INSERT INTO contacts (workspace_id, name, email, type)
               VALUES ($1, $2, $3, 'lead') RETURNING id`,
              [workspaceId, name || email, email]
            );
            resolution.action_taken = 'created_contact';
            resolution.auto_acted = true;
            resolution.action_ids.push(newContact.rows[0].id);
            resolution.notes.push(`Created new lead contact: ${name || email}`);
          } catch (_err) {
            resolution.notes.push('Failed to auto-create contact');
          }
        }
      }
    }
  }

  // Large payment / amount threshold — require approval
  const amount = data.amount || 0;
  if (amount > 10000 && !resolution.requires_approval) {
    const largeAmountInstruction = instructions.find((i) => /\$10,000|10000|large|high.value/i.test(i.instruction));
    if (largeAmountInstruction) {
      resolution.requires_approval = true;
      resolution.notes.push(`Amount $${amount} exceeds threshold — requires approval per operator instruction`);
    }
  }

  if (!resolution.action_taken && !resolution.requires_approval) {
    resolution.action_taken = 'routed';
    resolution.notes.push(`Event routed to ${agentRouting.find((r) => r.role === 'primary')?.agent || 'operations'}`);
  }

  return resolution;
}

// ── Main Pipeline ──────────────────────────────────────────────────────────────

export async function processBusinessEvent(workspaceId, eventId) {
  // 1. Fetch event
  const eventRes = await pool.query(
    `SELECT * FROM business_events WHERE id = $1 AND workspace_id = $2`,
    [eventId, workspaceId]
  );
  if (!eventRes.rows[0]) throw new Error(`Business event ${eventId} not found`);
  const event = eventRes.rows[0];

  // Mark as processing
  await pool.query(
    `UPDATE business_events SET status = 'processing', updated_at = NOW() WHERE id = $1`,
    [eventId]
  );

  let classifiedData = {};
  let entityLinks = [];
  let agentRoutingArr = [];
  let ownerAgent = 'operations';
  let resolution = {};
  let finalStatus = 'acted';

  // 2. Classify
  try {
    classifiedData = classifyEvent(event);
  } catch (err) {
    console.error(`[Intake] Classification failed for event ${eventId}:`, err.message);
    classifiedData = { error: err.message };
  }

  // 3. Identify entities
  try {
    entityLinks = await identifyEntities(workspaceId, event);
  } catch (err) {
    console.error(`[Intake] Entity identification failed for event ${eventId}:`, err.message);
  }

  // 4. Route to agents
  try {
    const routeResult = routeToAgents(event, entityLinks);
    agentRoutingArr = routeResult.routing;
    ownerAgent = routeResult.ownerAgent;
  } catch (err) {
    console.error(`[Intake] Agent routing failed for event ${eventId}:`, err.message);
    agentRoutingArr = [{ agent: 'operations', role: 'primary', priority: 1, reason: 'Fallback routing' }];
    ownerAgent = 'operations';
  }

  // 5. Resolve
  try {
    resolution = await resolveEvent(workspaceId, event, entityLinks, agentRoutingArr);
    if (resolution.requires_approval) {
      finalStatus = 'classified';
    }
  } catch (err) {
    console.error(`[Intake] Resolution failed for event ${eventId}:`, err.message);
    resolution = { error: err.message };
    finalStatus = 'failed';
  }

  // 6. Write agent_memory if patterns detected
  try {
    if (classifiedData.urgency === 'critical' || classifiedData.urgency === 'high') {
      await pool.query(
        `INSERT INTO agent_memory (workspace_id, agent, memory_type, entity_type, entity_id, content, confidence)
         VALUES ($1, $2, 'observation', 'business_event', $3, $4, 0.8)
         ON CONFLICT DO NOTHING`,
        [
          workspaceId,
          ownerAgent,
          eventId,
          `${classifiedData.urgency?.toUpperCase()} priority event: ${classifiedData.summary}`,
        ]
      );
    }
  } catch (_err) {
    // non-fatal
  }

  // 7. Log to agent_actions
  try {
    await pool.query(
      `INSERT INTO agent_actions (workspace_id, agent, action_type, entity_type, entity_id, description, reasoning, outcome)
       VALUES ($1, $2, 'intake', 'business_event', $3, $4, $5, $6)`,
      [
        workspaceId,
        ownerAgent,
        eventId,
        `Processed business event: ${classifiedData.summary || event.event_type}`,
        `Source: ${event.source}, Type: ${event.event_type}, Urgency: ${classifiedData.urgency}`,
        finalStatus === 'failed' ? 'failed' : 'completed',
      ]
    );
  } catch (_err) {
    // non-fatal
  }

  // 8. Update business_events record
  const updatedRes = await pool.query(
    `UPDATE business_events
     SET status = $1,
         classified_data = $2,
         entity_links = $3,
         agent_routing = $4,
         owner_agent = $5,
         resolution = $6,
         processed_at = NOW(),
         updated_at = NOW()
     WHERE id = $7
     RETURNING *`,
    [
      finalStatus,
      JSON.stringify(classifiedData),
      JSON.stringify(entityLinks),
      JSON.stringify(agentRoutingArr),
      ownerAgent,
      JSON.stringify(resolution),
      eventId,
    ]
  );

  return updatedRes.rows[0];
}

export async function ingestBusinessEvent(workspaceId, source, eventType, rawData, integrationId = null) {
  // 1. Insert with status='pending'
  const insertRes = await pool.query(
    `INSERT INTO business_events (workspace_id, integration_id, source, event_type, raw_data, status)
     VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
    [workspaceId, integrationId, source, eventType, JSON.stringify(rawData)]
  );
  const newEvent = insertRes.rows[0];

  // 2. Process pipeline
  const processed = await processBusinessEvent(workspaceId, newEvent.id);
  return processed;
}
