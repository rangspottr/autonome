import { pool } from './index.js';

/**
 * Seed a workspace with realistic business scenario data.
 * Idempotent: checks for existing contacts before seeding.
 */
export async function seedScenario(workspaceId) {
  // Check if already seeded
  const check = await pool.query(
    'SELECT COUNT(*) FROM contacts WHERE workspace_id = $1',
    [workspaceId]
  );
  if (parseInt(check.rows[0].count, 10) > 0) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const now = new Date();
    const daysAgo = (n) => new Date(now - n * 86400000).toISOString();
    const daysFromNow = (n) => new Date(now.getTime() + n * 86400000).toISOString();

    // ── Contacts ───────────────────────────────────────────────────────────────
    const contacts = [
      { name: 'Sarah Chen',        company: 'Meridian Consulting',  email: 'sarah@meridianconsulting.com',  phone: '+1-415-555-0101', type: 'client'    },
      { name: 'Marcus Webb',       company: 'Apex Digital',         email: 'marcus@apexdigital.io',         phone: '+1-312-555-0102', type: 'client'    },
      { name: 'Priya Nair',        company: 'Summit Logistics',     email: 'priya@summitlogistics.com',     phone: '+1-214-555-0103', type: 'client'    },
      { name: 'James Holloway',    company: 'Vertex Systems',       email: 'james@vertexsystems.net',       phone: '+1-617-555-0104', type: 'client'    },
      { name: 'Alicia Torres',     company: 'Cascade Partners',     email: 'alicia@cascadepartners.com',    phone: '+1-503-555-0105', type: 'lead'      },
      { name: 'Derek Fong',        company: 'NovaTech Labs',        email: 'derek@novatechlabs.com',        phone: '+1-650-555-0106', type: 'lead'      },
      { name: 'Rachel Simmons',    company: 'BluePeak Solutions',   email: 'rachel@bluepeaksolutions.com',  phone: '+1-404-555-0107', type: 'lead'      },
      { name: 'Omar Hassan',       company: 'Ironclad Industries',  email: 'omar@ironclad.industries',      phone: '+1-713-555-0108', type: 'qualified' },
      { name: 'Nina Kowalski',     company: 'Brightline Media',     email: 'nina@brightlinemedia.co',       phone: '+1-206-555-0109', type: 'qualified' },
      { name: 'Carlos Reyes',      company: 'Elevate Brands',       email: 'carlos@elevatebrands.com',      phone: '+1-305-555-0110', type: 'prospect'  },
    ];

    const contactIds = [];
    for (const c of contacts) {
      const r = await client.query(
        `INSERT INTO contacts (workspace_id, name, company, email, phone, type)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [workspaceId, c.name, c.company, c.email, c.phone, c.type]
      );
      contactIds.push(r.rows[0].id);
    }

    // Alias contact IDs by name index for clarity
    const [sarahId, marcusId, priyaId, jamesId, aliciaId, derekId, rachelId, omarId, ninaId, carlosId] = contactIds;

    // ── Deals ─────────────────────────────────────────────────────────────────
    const dealRows = [
      { title: 'Meridian Q3 Retainer',       contact_id: sarahId,  stage: 'negotiation', value: 42000, probability: 80,  expected_close_date: daysFromNow(5)  },
      { title: 'Apex Digital Platform Build', contact_id: marcusId, stage: 'proposal',    value: 28500, probability: 55,  expected_close_date: daysFromNow(14) },
      { title: 'Summit Logistics Integration',contact_id: priyaId,  stage: 'qualified',   value: 15000, probability: 40,  expected_close_date: daysFromNow(21) },
      { title: 'Vertex Systems Upgrade',      contact_id: jamesId,  stage: 'new',         value: 9800,  probability: 25,  expected_close_date: daysFromNow(30) },
      { title: 'Cascade Brand Campaign',      contact_id: aliciaId, stage: 'qualified',   value: 6500,  probability: 35,  expected_close_date: daysFromNow(18) },
      { title: 'NovaTech Enterprise License', contact_id: derekId,  stage: 'won',         value: 2500,  probability: 100, expected_close_date: daysAgo(3)      },
    ];

    const dealIds = [];
    for (const d of dealRows) {
      const r = await client.query(
        `INSERT INTO deals (workspace_id, contact_id, title, stage, value, probability, expected_close_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [workspaceId, d.contact_id, d.title, d.stage, d.value, d.probability, d.expected_close_date]
      );
      dealIds.push(r.rows[0].id);
    }

    const [meridianDealId, apexDealId, summitDealId, _vertexDealId, cascadeDealId, novatechDealId] = dealIds;

    // ── Invoices ──────────────────────────────────────────────────────────────
    const invoiceRows = [
      { contact_id: sarahId,  description: 'Meridian Q1 Consulting',   amount: 8400,  status: 'paid',      due_date: daysAgo(20)  },
      { contact_id: marcusId, description: 'Apex Digital Discovery',   amount: 3200,  status: 'paid',      due_date: daysAgo(10)  },
      { contact_id: priyaId,  description: 'Summit Phase 1 Deposit',   amount: 5000,  status: 'pending',   due_date: daysFromNow(4) },
      { contact_id: jamesId,  description: 'Vertex Initial Assessment',amount: 1800,  status: 'pending',   due_date: daysAgo(2)   },
      { contact_id: aliciaId, description: 'Cascade Brand Audit',      amount: 2400,  status: 'overdue',   due_date: daysAgo(6)   },
      { contact_id: omarId,   description: 'Ironclad Consulting Fees', amount: 6200,  status: 'escalated', due_date: daysAgo(15)  },
      { contact_id: ninaId,   description: 'Brightline Media Retainer',amount: 3800,  status: 'draft',     due_date: daysFromNow(14) },
      { contact_id: carlosId, description: 'Elevate Brand Strategy',   amount: 4500,  status: 'overdue',   due_date: daysAgo(12)  },
    ];

    const invoiceIds = [];
    for (const inv of invoiceRows) {
      const r = await client.query(
        `INSERT INTO invoices (workspace_id, contact_id, description, amount, status, due_date,
                               amount_paid, issued_date)
         VALUES ($1, $2, $3, $4, $5, $6,
                 CASE WHEN $5 = 'paid' THEN $4 ELSE 0 END,
                 NOW() - INTERVAL '5 days') RETURNING id`,
        [workspaceId, inv.contact_id, inv.description, inv.amount, inv.status, inv.due_date]
      );
      invoiceIds.push(r.rows[0].id);
    }

    const [inv1, inv2, inv3, inv4, inv5, inv6, _inv7, inv8] = invoiceIds;

    // ── Tasks ─────────────────────────────────────────────────────────────────
    const taskRows = [
      { title: 'Follow up with Meridian on Q2 contract',          status: 'completed',   priority: 'high',   due_date: daysAgo(5),    contact_id: sarahId  },
      { title: 'Review Apex Digital proposal terms',              status: 'completed',   priority: 'medium', due_date: daysAgo(3),    contact_id: marcusId },
      { title: 'Send Summit Logistics integration spec',          status: 'completed',   priority: 'medium', due_date: daysAgo(1),    contact_id: priyaId  },
      { title: 'Prepare Vertex Systems demo environment',         status: 'completed',   priority: 'low',    due_date: daysAgo(7),    contact_id: jamesId  },
      { title: 'Draft Cascade campaign brief',                    status: 'pending',     priority: 'high',   due_date: daysFromNow(2),contact_id: aliciaId },
      { title: 'Call Derek Fong re: NovaTech renewal',            status: 'pending',     priority: 'medium', due_date: daysFromNow(3),contact_id: derekId  },
      { title: 'Research BluePeak Solutions competitors',         status: 'pending',     priority: 'low',    due_date: daysFromNow(7),contact_id: rachelId },
      { title: 'Invoice Ironclad for overdue balance',            status: 'in_progress', priority: 'high',   due_date: daysAgo(1),    contact_id: omarId   },
      { title: 'Onboard Brightline Media account',                status: 'in_progress', priority: 'medium', due_date: daysFromNow(5),contact_id: ninaId   },
      { title: 'Collect final sign-off from Meridian',            status: 'pending',     priority: 'high',   due_date: daysAgo(4),    contact_id: sarahId  },
      { title: 'Prepare Q2 performance report for Apex',         status: 'pending',     priority: 'medium', due_date: daysAgo(2),    contact_id: marcusId },
      { title: 'Escalate Elevate Brands payment reminder',        status: 'pending',     priority: 'high',   due_date: daysAgo(8),    contact_id: carlosId },
    ];

    const taskIds = [];
    for (const t of taskRows) {
      const r = await client.query(
        `INSERT INTO tasks (workspace_id, title, status, priority, due_date, related_entity_type, related_entity_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [workspaceId, t.title, t.status, t.priority, t.due_date, t.contact_id ? 'contact' : null, t.contact_id || null]
      );
      taskIds.push(r.rows[0].id);
    }

    // ── Workflows ─────────────────────────────────────────────────────────────
    const workflowRows = [
      { template: 'invoice_collection', entity_type: 'invoice', entity_id: inv5, step: 2, steps: 5 },
      { template: 'invoice_collection', entity_type: 'invoice', entity_id: inv6, step: 4, steps: 5 },
      { template: 'deal_followup',      entity_type: 'deal',    entity_id: apexDealId,  step: 1, steps: 3 },
      { template: 'task_escalation',    entity_type: 'task',    entity_id: taskIds[9],  step: 1, steps: 3 },
    ];

    const workflowIds = [];
    for (const wf of workflowRows) {
      const steps = Array.from({ length: wf.steps }, (_, i) => ({ step: i + 1, label: `Step ${i + 1}` }));
      const r = await client.query(
        `INSERT INTO workflows (workspace_id, template, status, trigger_entity_type, trigger_entity_id,
                                current_step, steps)
         VALUES ($1, $2, 'active', $3, $4, $5, $6) RETURNING id`,
        [workspaceId, wf.template, wf.entity_type, wf.entity_id, wf.step, JSON.stringify(steps)]
      );
      workflowIds.push(r.rows[0].id);
    }

    // ── Communications ────────────────────────────────────────────────────────
    const commRows = [
      { contact_id: sarahId,  direction: 'outbound', status: 'sent',   subject: 'Payment reminder: Meridian Q1',     channel: 'email' },
      { contact_id: aliciaId, direction: 'outbound', status: 'sent',   subject: 'Payment reminder: Cascade Brand Audit', channel: 'email' },
      { contact_id: omarId,   direction: 'outbound', status: 'sent',   subject: 'URGENT: Ironclad Consulting Fees overdue', channel: 'email' },
      { contact_id: marcusId, direction: 'outbound', status: 'sent',   subject: 'Follow-up: Apex Digital Platform Build', channel: 'email' },
      { contact_id: priyaId,  direction: 'outbound', status: 'queued', subject: 'Summit Phase 1 invoice due soon',    channel: 'email' },
      { contact_id: carlosId, direction: 'outbound', status: 'queued', subject: 'Payment reminder: Elevate Brand Strategy', channel: 'email' },
    ];

    for (const c of commRows) {
      await client.query(
        `INSERT INTO communications (workspace_id, contact_id, channel, direction, subject, body, status)
         VALUES ($1, $2, $3, $4, $5, '', $6)`,
        [workspaceId, c.contact_id, c.channel, c.direction, c.subject, c.status]
      );
    }

    // ── Agent Runs ────────────────────────────────────────────────────────────
    for (let i = 0; i < 3; i++) {
      await client.query(
        `INSERT INTO agent_runs (workspace_id, agent, status, actions_taken, items_scanned, summary, completed_at)
         VALUES ($1, 'system', 'completed', $2, $3, $4, $5)`,
        [
          workspaceId,
          4 + i,
          12 + i * 2,
          JSON.stringify({
            decisionsAutoExecuted: 4 + i,
            decisionsPending: 2,
            workflowsAdvanced: i + 1,
            emailsSent: i + 1,
            smsSent: 0,
          }),
          daysAgo(i * 2),
        ]
      );
    }

    // ── Agent Actions (historical) ─────────────────────────────────────────────
    const actionRows = [
      { agent: 'finance',    action_type: 'remind',    entity_type: 'invoice', entity_id: inv5,          description: 'Sent overdue reminder for Cascade Brand Audit', reasoning: 'Invoice is 6 days overdue, $2,400 at risk. Policy triggers reminder after 3 days.', outcome: 'completed', created_at: daysAgo(6)  },
      { agent: 'finance',    action_type: 'remind',    entity_type: 'invoice', entity_id: inv8,          description: 'Sent payment reminder for Elevate Brand Strategy', reasoning: 'Invoice is 12 days overdue, $4,500 at risk. Second reminder in escalation sequence.', outcome: 'completed', created_at: daysAgo(10) },
      { agent: 'finance',    action_type: 'urgent',    entity_type: 'invoice', entity_id: inv6,          description: 'Sent urgent payment notice for Ironclad Consulting Fees', reasoning: 'Invoice is 15 days overdue, $6,200 at risk. Multiple reminders sent — escalating urgency.', outcome: 'completed', created_at: daysAgo(5)  },
      { agent: 'finance',    action_type: 'escalate',  entity_type: 'invoice', entity_id: inv6,          description: 'Escalated to collections: Ironclad Consulting Fees ($6,200)', reasoning: 'No response after 3 reminders and urgent notice. Escalating per workspace policy.', outcome: 'handed_off', handed_off_to: 'support', created_at: daysAgo(3) },
      { agent: 'finance',    action_type: 'remind',    entity_type: 'invoice', entity_id: inv5,          description: 'Sent second overdue reminder for Cascade Brand Audit', reasoning: 'No payment after first reminder. Sending second reminder as per collection workflow.', outcome: 'completed', created_at: daysAgo(3)  },
      { agent: 'finance',    action_type: 'mark_paid', entity_type: 'invoice', entity_id: inv1,          description: 'Marked invoice paid: Meridian Q1 Consulting ($8,400)', reasoning: 'Payment confirmed via bank reconciliation. Closing collection workflow.', outcome: 'completed', created_at: daysAgo(20) },
      { agent: 'finance',    action_type: 'mark_paid', entity_type: 'invoice', entity_id: inv2,          description: 'Marked invoice paid: Apex Digital Discovery ($3,200)', reasoning: 'Payment received. Marking as paid and notifying revenue agent.', outcome: 'completed', created_at: daysAgo(10) },
      { agent: 'revenue',    action_type: 'followup',  entity_type: 'deal',    entity_id: apexDealId,    description: 'Sent follow-up for deal with Marcus Webb', reasoning: 'Apex Digital proposal has been in review for 8 days with no response. Follow-up sequence triggered.', outcome: 'completed', created_at: daysAgo(4)  },
      { agent: 'revenue',    action_type: 'followup',  entity_type: 'deal',    entity_id: summitDealId,  description: 'Sent follow-up for deal with Priya Nair', reasoning: 'Summit Logistics deal stale for 5 days. Sending follow-up to advance pipeline.', outcome: 'completed', created_at: daysAgo(7)  },
      { agent: 'revenue',    action_type: 'qualify',   entity_type: 'contact', entity_id: omarId,        description: 'Qualified lead: Omar Hassan', reasoning: 'Contact showed high engagement signals — 3 inbound messages and viewed proposal twice. Qualifying lead.', outcome: 'completed', created_at: daysAgo(9)  },
      { agent: 'revenue',    action_type: 'qualify',   entity_type: 'contact', entity_id: ninaId,        description: 'Qualified lead: Nina Kowalski', reasoning: 'Brightline Media requested pricing. Intent signal strong — qualifying for pipeline.', outcome: 'completed', created_at: daysAgo(6)  },
      { agent: 'revenue',    action_type: 'close',     entity_type: 'deal',    entity_id: novatechDealId,description: 'Closed deal: NovaTech Enterprise License ($2,500)', reasoning: 'Deal met all closing criteria. Stage advanced to closed-won. Handing off to Finance to create invoice.', outcome: 'handed_off', handed_off_to: 'finance', created_at: daysAgo(3) },
      { agent: 'operations', action_type: 'escalate',  entity_type: 'task',    entity_id: taskIds[9],    description: 'Escalated task: Collect final sign-off from Meridian', reasoning: 'Task is 4 days overdue and blocking Meridian contract finalization. Escalating to high priority.', outcome: 'completed', created_at: daysAgo(2)  },
      { agent: 'operations', action_type: 'escalate',  entity_type: 'task',    entity_id: taskIds[10],   description: 'Escalated task: Prepare Q2 performance report for Apex', reasoning: 'Task is 2 days overdue. Client deliverable at risk. Escalating and creating workflow.', outcome: 'completed', created_at: daysAgo(1)  },
      { agent: 'operations', action_type: 'escalate',  entity_type: 'task',    entity_id: taskIds[11],   description: 'Escalated task: Escalate Elevate Brands payment reminder', reasoning: 'Task is 8 days overdue. Payment recovery blocked by missing follow-up. High priority escalation.', outcome: 'completed', created_at: daysAgo(4)  },
      { agent: 'growth',     action_type: 'reengage',  entity_type: 'contact', entity_id: carlosId,      description: 'Sent re-engagement to Elevate Brands', reasoning: 'Contact has been unresponsive for 14 days. Re-engagement campaign initiated to recover opportunity.', outcome: 'completed', created_at: daysAgo(5)  },
      { agent: 'growth',     action_type: 'reengage',  entity_type: 'contact', entity_id: rachelId,      description: 'Sent re-engagement to BluePeak Solutions', reasoning: 'Lead has been in pipeline for 21 days with no progression. Re-engagement to test intent.', outcome: 'completed', created_at: daysAgo(8)  },
      { agent: 'support',    action_type: 'escalate',  entity_type: 'invoice', entity_id: inv6,          description: 'Support escalation: Ironclad Consulting Fees collections handoff', reasoning: 'Received handoff from Finance agent. Ironclad has an outstanding $6,200 and 15+ days overdue. Initiating direct contact protocol.', outcome: 'completed', created_at: daysAgo(3) },
      { agent: 'finance',    action_type: 'pre',       entity_type: 'invoice', entity_id: inv3,          description: 'Sent pre-due reminder for Summit Phase 1 Deposit', reasoning: 'Invoice due in 4 days. Pre-due reminder sent per workspace policy to reduce late payments.', outcome: 'completed', created_at: daysAgo(1)  },
      { agent: 'revenue',    action_type: 'reengage',  entity_type: 'deal',    entity_id: cascadeDealId, description: 'Sent re-engagement for Cascade Brand Campaign', reasoning: 'Deal has been in qualified stage for 12 days. No activity from contact. Re-engagement to advance.', outcome: 'completed', created_at: daysAgo(12) },
      { agent: 'operations', action_type: 'reorder',   entity_type: 'asset',   entity_id: null,          description: 'Initiated reorder for office supplies', reasoning: 'Asset stock dropped below minimum threshold. Reorder initiated to prevent disruption.', outcome: 'completed', created_at: daysAgo(11) },
      { agent: 'revenue',    action_type: 'followup',  entity_type: 'deal',    entity_id: meridianDealId,description: 'Sent follow-up for deal with Sarah Chen', reasoning: 'Meridian Q3 deal expected to close in 5 days. Final follow-up to confirm terms and close.', outcome: 'completed', created_at: daysAgo(1)  },
      { agent: 'finance',    action_type: 'remind',    entity_type: 'invoice', entity_id: inv4,          description: 'Sent overdue reminder for Vertex Initial Assessment', reasoning: 'Invoice overdue 2 days, $1,800 at risk. Auto-reminder triggered per collection policy.', outcome: 'completed', created_at: daysAgo(1)  },
      { agent: 'growth',     action_type: 'qualify',   entity_type: 'contact', entity_id: derekId,       description: 'Engaged lead: Derek Fong at NovaTech Labs', reasoning: 'Lead opened 3 emails and visited pricing page. Warming sequence initiated for qualification.', outcome: 'completed', created_at: daysAgo(14) },
      { agent: 'support',    action_type: 'followup',  entity_type: 'contact', entity_id: sarahId,       description: 'Scheduled follow-up for Meridian Consulting', reasoning: 'No response to Q2 proposal email after 5 days. Support follow-up scheduled to ensure client satisfaction.', outcome: 'completed', created_at: daysAgo(13) },
    ];

    for (const a of actionRows) {
      await client.query(
        `INSERT INTO agent_actions
           (workspace_id, agent, action_type, entity_type, entity_id, description, reasoning, outcome, handed_off_to, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          workspaceId,
          a.agent,
          a.action_type,
          a.entity_type,
          a.entity_id || null,
          a.description,
          a.reasoning,
          a.outcome,
          a.handed_off_to || null,
          a.created_at,
        ]
      );
    }

    // ── Agent Memory ──────────────────────────────────────────────────────────
    const memoryRows = [
      { agent: 'finance',    memory_type: 'learned_preference', entity_type: 'contact', entity_id: sarahId,  content: 'Meridian Consulting typically pays within 48h of second reminder' },
      { agent: 'finance',    memory_type: 'observation',        entity_type: 'contact', entity_id: omarId,   content: 'Ironclad Industries has been reminded 3 times — direct call escalation recommended' },
      { agent: 'finance',    memory_type: 'observation',        entity_type: 'contact', entity_id: carlosId, content: 'Elevate Brands overdue 12 days — at risk of collections escalation' },
      { agent: 'finance',    memory_type: 'learned_preference', entity_type: 'contact', entity_id: marcusId, content: 'Apex Digital pays promptly — usually clears within 7 days of invoice' },
      { agent: 'revenue',    memory_type: 'observation',        entity_type: 'deal',    entity_id: apexDealId,   content: 'Apex Digital Platform Build has been in proposal stage for 14 days despite follow-ups' },
      { agent: 'revenue',    memory_type: 'learned_preference', entity_type: 'contact', entity_id: sarahId,  content: 'Meridian Consulting responds well to direct follow-up emails — high conversion rate' },
      { agent: 'revenue',    memory_type: 'observation',        entity_type: 'deal',    entity_id: meridianDealId, content: 'Meridian Q3 deal closing this week — high probability, coordinate with Finance for invoice' },
      { agent: 'operations', memory_type: 'blocker',            entity_type: 'task',    entity_id: taskIds[9],   content: 'Sign-off task blocking Meridian contract — escalated and assigned high priority' },
      { agent: 'operations', memory_type: 'observation',        entity_type: null,       entity_id: null,      content: '3 tasks overdue for more than 2 days — operations health declining this week' },
      { agent: 'growth',     memory_type: 'observation',        entity_type: 'contact', entity_id: carlosId, content: 'Elevate Brands unresponsive — 2 re-engagement attempts, conversion probability low' },
      { agent: 'growth',     memory_type: 'learned_preference', entity_type: 'contact', entity_id: derekId,  content: 'NovaTech Labs responds to email — closed $2,500 deal after 2 follow-ups' },
      { agent: 'support',    memory_type: 'observation',        entity_type: 'contact', entity_id: omarId,   content: 'Ironclad Industries escalation received from Finance — active collections in progress' },
    ];

    for (const m of memoryRows) {
      await client.query(
        `INSERT INTO agent_memory (workspace_id, agent, memory_type, entity_type, entity_id, content)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [workspaceId, m.agent, m.memory_type, m.entity_type, m.entity_id || null, m.content]
      );
    }

    // ── Audit Log ─────────────────────────────────────────────────────────────
    const auditRows = [
      { agent: 'Finance',    action: 'remind',   entity_type: 'invoice', entity_id: inv5, outcome: 'executed', details: { desc: 'Sent overdue reminder for Cascade Brand Audit' } },
      { agent: 'Revenue',    action: 'followup', entity_type: 'deal',    entity_id: apexDealId, outcome: 'executed', details: { desc: 'Sent follow-up for Apex Digital Platform Build' } },
      { agent: 'Operations', action: 'escalate', entity_type: 'task',    entity_id: taskIds[9], outcome: 'executed', details: { desc: 'Escalated overdue sign-off task' } },
      { agent: 'Finance',    action: 'mark_paid',entity_type: 'invoice', entity_id: inv1, outcome: 'executed', details: { desc: 'Marked Meridian Q1 invoice paid' } },
    ];

    for (const a of auditRows) {
      await client.query(
        `INSERT INTO audit_log (workspace_id, agent, action, entity_type, entity_id, details, outcome)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [workspaceId, a.agent, a.action, a.entity_type, a.entity_id, JSON.stringify(a.details), a.outcome]
      );
    }

    // ── Companies ─────────────────────────────────────────────────────────────
    const companyRows = [
      { name: 'Meridian Consulting',  domain: 'meridianconsulting.com', industry: 'Consulting'          },
      { name: 'Apex Digital',         domain: 'apexdigital.io',         industry: 'Technology'           },
      { name: 'Summit Logistics',     domain: 'summitlogistics.com',    industry: 'Logistics'            },
    ];
    const companyIds = [];
    for (const co of companyRows) {
      const r = await client.query(
        `INSERT INTO companies (workspace_id, name, domain, industry)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [workspaceId, co.name, co.domain, co.industry]
      );
      companyIds.push(r.rows[0].id);
    }
    const [meridianCoId, apexCoId, summitCoId] = companyIds;

    // Link contacts to companies
    await client.query(`UPDATE contacts SET company_id = $1, updated_at = NOW() WHERE id = $2`, [meridianCoId, sarahId]);
    await client.query(`UPDATE contacts SET company_id = $1, updated_at = NOW() WHERE id = $2`, [apexCoId, marcusId]);
    await client.query(`UPDATE contacts SET company_id = $1, updated_at = NOW() WHERE id = $2`, [summitCoId, priyaId]);

    // ── Integrations ──────────────────────────────────────────────────────────
    const integrationRows = [
      { type: 'webhook', name: 'Stripe Payments Webhook', status: 'active', config: { endpoint: '/api/billing/webhook', provider: 'stripe' } },
      { type: 'form',    name: 'Contact Us Form',         status: 'active', config: { form_id: 'contact-form-001', source_url: '/contact' } },
    ];
    const integrationIds = [];
    for (const ig of integrationRows) {
      const r = await client.query(
        `INSERT INTO integrations (workspace_id, type, name, status, config)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [workspaceId, ig.type, ig.name, ig.status, JSON.stringify(ig.config)]
      );
      integrationIds.push(r.rows[0].id);
    }
    const [stripeIntegId, formIntegId] = integrationIds;

    // ── Business Events ───────────────────────────────────────────────────────
    const businessEventRows = [
      {
        integration_id: stripeIntegId,
        source: 'webhook', event_type: 'payment_received', status: 'acted',
        raw_data: { amount: 8400, currency: 'USD', status: 'succeeded', customer_email: 'sarah@meridianconsulting.com', provider: 'stripe', provider_event_id: 'evt_001' },
        classified_data: { category: 'financial', urgency: 'low', sentiment: 'positive', summary: 'Payment received: USD 8400 from sarah@meridianconsulting.com' },
        owner_agent: 'finance',
        resolution: { action_taken: 'marked_invoice_paid', auto_acted: true, notes: ['Invoice automatically marked as paid'] },
      },
      {
        integration_id: formIntegId,
        source: 'form', event_type: 'form_submission', status: 'acted',
        raw_data: { form_type: 'contact', fields: { name: 'Alex Rivera', email: 'alex@newprospect.com', message: 'Interested in your services' } },
        classified_data: { category: 'communication', urgency: 'medium', sentiment: 'positive', summary: 'Form submission: contact from alex@newprospect.com' },
        owner_agent: 'revenue',
        resolution: { action_taken: 'created_contact', auto_acted: true, notes: ['Created new lead contact: Alex Rivera'] },
      },
      {
        integration_id: null,
        source: 'email', event_type: 'inbound_email', status: 'acted',
        raw_data: { from: 'marcus@apexdigital.io', to: 'hello@autonome.io', subject: 'Re: Apex Digital Platform Build proposal', body: 'Happy to move forward — can we schedule a call to finalize?' },
        classified_data: { category: 'communication', urgency: 'medium', sentiment: 'positive', summary: 'Email from marcus@apexdigital.io: Re: Apex Digital Platform Build proposal' },
        owner_agent: 'revenue',
        resolution: { action_taken: 'routed', auto_acted: false, notes: ['Event routed to revenue'] },
      },
      {
        integration_id: null,
        source: 'phone', event_type: 'missed_call', status: 'classified',
        raw_data: { caller_phone: '+1-713-555-0108', caller_name: 'Omar Hassan', type: 'missed' },
        classified_data: { category: 'operations', urgency: 'high', sentiment: 'neutral', summary: 'Missed call from Omar Hassan' },
        owner_agent: 'support',
        resolution: {},
      },
      {
        integration_id: stripeIntegId,
        source: 'webhook', event_type: 'payment_failed', status: 'acted',
        raw_data: { amount: 4500, currency: 'USD', status: 'failed', customer_email: 'carlos@elevatebrands.com', provider: 'stripe', provider_event_id: 'evt_002' },
        classified_data: { category: 'financial', urgency: 'high', sentiment: 'negative', summary: 'Payment failed: USD 4500 from carlos@elevatebrands.com' },
        owner_agent: 'finance',
        resolution: { action_taken: 'routed', requires_approval: false, auto_acted: false, notes: ['Routed to finance — payment retry required'] },
      },
      {
        integration_id: null,
        source: 'support', event_type: 'support_request', status: 'pending',
        raw_data: { from_email: 'priya@summitlogistics.com', from_name: 'Priya Nair', subject: 'Invoice confusion — billed twice?', body: 'I received two invoices for Phase 1. Please clarify.', priority: 'high', channel: 'email' },
        classified_data: {},
        owner_agent: null,
        resolution: {},
      },
      {
        integration_id: formIntegId,
        source: 'form', event_type: 'form_submission', status: 'acted',
        raw_data: { form_type: 'demo_request', fields: { name: 'Kim Park', email: 'kim@techstartup.io', company: 'TechStartup', message: 'Would love a demo of your platform' } },
        classified_data: { category: 'communication', urgency: 'medium', sentiment: 'positive', summary: 'Form submission: demo_request from kim@techstartup.io' },
        owner_agent: 'revenue',
        resolution: { action_taken: 'created_contact', auto_acted: true, notes: ['Created new lead contact: Kim Park'] },
      },
      // ── After-hours missed calls ──────────────────────────────────────────
      {
        integration_id: null,
        source: 'phone', event_type: 'missed_call', status: 'pending',
        raw_data: { caller_phone: '+1-312-555-0171', caller_name: 'Derek Fong', type: 'missed', notes: 'After-hours call, no voicemail left' },
        classified_data: { category: 'operations', urgency: 'high', sentiment: 'neutral', afterHours: true, summary: 'Missed call from Derek Fong' },
        owner_agent: 'revenue',
        resolution: {},
      },
      {
        integration_id: null,
        source: 'phone', event_type: 'missed_call', status: 'classified',
        raw_data: { caller_phone: '+1-415-555-0192', caller_name: 'Rachel Simmons', type: 'missed', notes: 'Second missed call this week' },
        classified_data: { category: 'operations', urgency: 'high', sentiment: 'neutral', afterHours: false, summary: 'Missed call from Rachel Simmons' },
        owner_agent: 'revenue',
        resolution: { action_taken: 'created_followup_task', auto_acted: true, notes: ['Follow-up task created for missed call from Rachel Simmons'] },
      },
      // ── Inbound SMS leads ─────────────────────────────────────────────────
      {
        integration_id: null,
        source: 'sms', event_type: 'inbound_sms', status: 'acted',
        raw_data: { from: '+1-646-555-0133', body: 'Hi, I saw your ad and wanted to learn more about your services. Is someone available to chat?', direction: 'inbound' },
        classified_data: { category: 'communication', urgency: 'medium', sentiment: 'positive', summary: 'SMS from +1-646-555-0133: Hi, I saw your ad...' },
        owner_agent: 'revenue',
        resolution: { action_taken: 'routed', auto_acted: false, notes: ['Routed to revenue for follow-up'] },
      },
      // ── Calendar / booking events ─────────────────────────────────────────
      {
        integration_id: null,
        source: 'calendar', event_type: 'booking_request', status: 'acted',
        raw_data: { title: 'Discovery call — Nina Kowalski (BrightLine Media)', start: new Date(Date.now() + 2 * 86400000).toISOString(), attendees: ['nina@brightlinemedia.co', 'hello@autonome.io'], type: 'meeting' },
        classified_data: { category: 'operations', urgency: 'medium', sentiment: 'positive', summary: 'Booking request: Discovery call — Nina Kowalski (BrightLine Media)' },
        owner_agent: 'revenue',
        resolution: { action_taken: 'routed', auto_acted: false, notes: ['Meeting routed to revenue for preparation'] },
      },
      // ── Additional support / billing tickets ──────────────────────────────
      {
        integration_id: null,
        source: 'support', event_type: 'support_request', status: 'acted',
        raw_data: { from_email: 'nina@brightlinemedia.co', from_name: 'Nina Kowalski', subject: 'Service disruption — campaign data not updating', body: 'Our dashboard has been showing stale data for 3 days. This is impacting our team.', priority: 'high', channel: 'email' },
        classified_data: { category: 'support', urgency: 'high', sentiment: 'negative', summary: 'Support request: Service disruption — campaign data not updating from nina@brightlinemedia.co' },
        owner_agent: 'support',
        resolution: { action_taken: 'routed', auto_acted: false, notes: ['High-priority support ticket escalated to support agent'] },
      },
      {
        integration_id: null,
        source: 'support', event_type: 'support_request', status: 'pending',
        raw_data: { from_email: 'marcus@apexdigital.io', from_name: 'Marcus Webb', subject: 'Invoice question — charge does not match estimate', body: 'The invoice for Phase 2 is $2,000 higher than the estimate we agreed on. Can you clarify?', priority: 'medium', channel: 'email' },
        classified_data: { category: 'support', urgency: 'medium', sentiment: 'negative', summary: 'Support request: Invoice question from marcus@apexdigital.io' },
        owner_agent: 'finance',
        resolution: {},
      },
      // ── Positive signals ──────────────────────────────────────────────────
      {
        integration_id: null,
        source: 'email', event_type: 'inbound_email', status: 'acted',
        raw_data: { from: 'sarah@meridianconsulting.com', to: 'hello@autonome.io', subject: 'Thank you — great first month', body: 'Just wanted to say the platform has been excellent. We are ready to expand to the full team.' },
        classified_data: { category: 'communication', urgency: 'low', sentiment: 'positive', summary: 'Email from sarah@meridianconsulting.com: Thank you — great first month' },
        owner_agent: 'growth',
        resolution: { action_taken: 'routed', auto_acted: false, notes: ['Positive signal routed to growth for expansion opportunity'] },
      },
    ];

    for (const be of businessEventRows) {
      await client.query(
        `INSERT INTO business_events
           (workspace_id, integration_id, source, event_type, status, raw_data, classified_data, owner_agent, resolution, processed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          workspaceId,
          be.integration_id || null,
          be.source,
          be.event_type,
          be.status,
          JSON.stringify(be.raw_data),
          JSON.stringify(be.classified_data),
          be.owner_agent || null,
          JSON.stringify(be.resolution),
          be.status === 'pending' ? null : daysAgo(Math.floor(Math.random() * 5)),
        ]
      );
    }

    // ── Operator Instructions ─────────────────────────────────────────────────
    const instructionRows = [
      { agent: 'finance',  instruction: 'Escalate any invoice over 14 days overdue to a direct call — do not send another email', type: 'policy',     priority: 90 },
      { agent: null,       instruction: "Don't auto-send emails to contacts tagged as VIP — always surface for approval first",  type: 'rule',       priority: 85 },
      { agent: null,       instruction: 'Surface any transaction or commitment over $10,000 for operator approval before acting', type: 'rule',       priority: 95 },
      { agent: 'revenue',  instruction: 'Always follow up on inbound leads within 2 hours during business hours',                 type: 'preference', priority: 70 },
      { agent: 'support',  instruction: 'For complaints from existing clients, prioritise human review before automated response', type: 'policy',     priority: 80 },
    ];

    for (const ins of instructionRows) {
      await client.query(
        `INSERT INTO operator_instructions (workspace_id, agent, instruction, type, priority, source)
         VALUES ($1, $2, $3, $4, $5, 'manual')`,
        [workspaceId, ins.agent || null, ins.instruction, ins.type, ins.priority]
      );
    }

    await client.query('COMMIT');
    console.log(`[Seed Scenario] Workspace ${workspaceId} seeded with realistic business data.`);

    // Seed demo outputs (briefings and reports) so the first-run experience
    // shows finished work being produced immediately.
    await seedDemoOutputs(workspaceId);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Seed Scenario] Failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Seed demo output artifacts so new workspaces immediately show
 * morning briefings, weekly reports, and collections summaries.
 */
async function seedDemoOutputs(workspaceId) {
  try {
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekStartStr = weekStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    const weekEndStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    const briefingContent = `# Morning Briefing — ${todayStr}
Prepared for **Your Business**

## What Happened Overnight
Your AI team completed **7 actions** overnight across 4 agents.

**Finance Agent** — 3 completed
  • Escalated Cascade Brand Audit invoice — $2,400 (6d overdue)
  • Queued payment reminder to Elevate Brands — $4,500 (12d overdue)
  • Reviewed Ironclad Industries account status — $6,200 escalated

**Revenue Agent** — 2 completed
  • Followed up on Meridian Q3 Retainer — negotiation stage
  • Classified inbound form lead: Kim Park (TechStartup)

**Operations Agent** — 1 completed
  • Advanced Summit Logistics Integration workflow

**Support Agent** — 1 completed
  • Flagged Priya Nair billing dispute for owner review

## New Leads Overnight
• **Kim Park** (TechStartup) — lead
• **Alex Rivera** — lead

## Needs Your Attention Today
🔴 **2 urgent alerts** require immediate attention
⚠️  **3 agent decisions** awaiting your approval
💰 **3 overdue invoices** totaling $13,100
📋 **4 tasks** due today or overdue

## Overdue Invoices
• **Cascade Partners** — $2,400 overdue 6d (Cascade Brand Audit)
• **Elevate Brands** — $4,500 overdue 12d (Elevate Brand Strategy)
• **Ironclad Industries** — $6,200 overdue 15d (Ironclad Consulting Fees)

## Tasks Due Today
• **Send Momentum Corp renewal invoice** 🔴 — due today
• **Review overdue invoices** 🟡 — due today
• **Prepare pipeline review for board meeting** 🟡 — due today

## Stale Deals (No Activity in 7+ Days)
• **Summit Logistics Integration** (qualified) — $15,000
• **Vertex Systems Upgrade** (new) — $9,800
• **Cascade Brand Campaign** (qualified) — $6,500

## What Each Agent Is Handling
**Finance:** Escalated overdue invoice: Cascade Partners — $2,400 (6d overdue)
**Revenue:** Followed up on Meridian Q3 Retainer — negotiation stage
**Operations:** Advanced Summit Logistics Integration workflow
**Growth:** Monitoring lead pipeline — no overnight actions
**Support:** Flagged Priya Nair billing dispute for owner review`;

    const weeklyContent = `# Weekly Owner Report
**Your Business** | Week of ${weekStartStr} – ${weekEndStr}

## Revenue Summary
💰 **Collected this week:** $11,600 (+8% vs. prior week)
⏳ **Outstanding (pending/sent):** $6,800
🔴 **Overdue:** $13,100 — needs collection action
✅ **Invoices paid:** 2
⚠️  **Invoices overdue:** 3

## Pipeline Movement
**Total active pipeline:** $101,800

• **Negotiation** — 1 deal ($42,000)
• **Qualified** — 2 deals ($21,500)
• **Proposal** — 1 deal ($28,500)
• **New** — 1 deal ($9,800)

**Recently active deals:**
  • Meridian Q3 Retainer (negotiation) — $42,000
  • Apex Digital Platform Build (proposal) — $28,500

## Overdue Invoices
• **Cascade Partners** — $2,400 (6d overdue) — overdue
• **Elevate Brands** — $4,500 (12d overdue) — overdue
• **Ironclad Industries** — $6,200 (15d overdue) — escalated

*Collections operator is monitoring these accounts.*

## Tasks
✅ Completed this week: **12**
📋 Pending (due next 7 days): **8**

## AI Agent Activity This Week
**Total actions:** 47 | **Completed:** 38

**Finance:** 14 actions — 11 completed, 3 pending
**Revenue:** 12 actions — 10 completed, 2 pending
**Operations:** 11 actions — 9 completed, 2 pending
**Growth:** 6 actions — 5 completed, 1 pending
**Support:** 4 actions — 3 completed, 1 pending

## Growth Opportunities
📈 **5 new contacts added** this week — ensure they receive timely follow-up
🎯 **1 deal in negotiation** worth $42,000 — close this week

## Next Week's Priorities
• Resolve $13,100 in overdue invoices
• Close Meridian Q3 Retainer ($42,000 — negotiation stage)
• Complete 8 pending tasks
• Review agent recommendations in Approvals
• Follow up with 2 new leads from overnight intake`;

    const collectionsContent = `# Collections Summary — ${todayStr}

## Cash Risk Overview
💰 **Total overdue:** $13,100 across 3 invoices
🔴 **Escalated (14+ days):** $6,200
🟡 **At risk (3–13 days):** $6,900

## Overdue Accounts
🔴 **Ironclad Industries** — $6,200 (15d overdue) — Ironclad Consulting Fees
🟡 **Elevate Brands** — $4,500 (12d overdue) — Elevate Brand Strategy
🟡 **Cascade Partners** — $2,400 (6d overdue) — Cascade Brand Audit

## Actions Taken
**Reminders queued:** 2
**Escalations:** 1 account escalated

## Recommended Owner Actions
• Call **Ironclad Industries** directly — $6,200 is 15+ days overdue`;

    const client2 = await pool.connect();
    try {
      await client2.query('BEGIN');
      await client2.query(
        `INSERT INTO outputs (workspace_id, output_type, title, content, data, period_start, period_end, created_at)
         VALUES
           ($1, 'morning_briefing', $2, $3, $4, $5, $6, $7),
           ($1, 'weekly_report',    $8, $9, $10, $11, $12, $13),
           ($1, 'collections_summary', $14, $15, $16, $17, $18, $19)`,
        [
          workspaceId,
          // morning briefing
          `Morning Briefing — ${todayStr}`,
          briefingContent,
          JSON.stringify({ overdue_invoices: 3, overdue_amount: 13100, pending_tasks: 4, pending_approvals: 3, stale_deals: 3, new_leads: 2, agent_actions: 7, blocked_workflows: 0 }),
          new Date(now.getTime() - 16 * 60 * 60 * 1000).toISOString(),
          now.toISOString(),
          now.toISOString(),
          // weekly report
          `Weekly Owner Report — ${weekEndStr}`,
          weeklyContent,
          JSON.stringify({ revenue_collected: 11600, revenue_pending: 6800, revenue_overdue: 13100, invoices_overdue: 3, tasks_completed: 12, tasks_pending: 8, agent_actions: 47, blocked_workflows: 0, new_contacts: 5 }),
          weekStart.toISOString(),
          now.toISOString(),
          new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
          // collections summary
          `Collections Summary — ${todayStr}`,
          collectionsContent,
          JSON.stringify({ total_overdue: 13100, overdue_count: 3, escalated_count: 1, reminders_sent: 2, disputes_flagged: 0 }),
          new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
          now.toISOString(),
          now.toISOString(),
        ]
      );
      await client2.query('COMMIT');
      console.log(`[Seed Scenario] Demo outputs seeded for workspace ${workspaceId}`);
    } catch (err) {
      await client2.query('ROLLBACK');
      console.error('[Seed Scenario] Failed to seed demo outputs:', err.message);
    } finally {
      client2.release();
    }
  } catch (err) {
    console.error('[Seed Scenario] Demo outputs error:', err.message);
  }
}
