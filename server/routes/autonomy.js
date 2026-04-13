import { Router } from 'express';
import { pool } from '../db/index.js';
import { requireAuth, requireWorkspace, requireActiveSubscription } from '../middleware/auth.js';

const router = Router();
const guard = [requireAuth, requireWorkspace, requireActiveSubscription];

const VALID_AGENTS = ['finance', 'revenue', 'operations', 'growth', 'support'];
const VALID_RISK_TOLERANCES = ['conservative', 'moderate', 'aggressive'];

/**
 * GET /api/autonomy-settings
 * Get current autonomy settings (global + per-agent).
 */
router.get('/', ...guard, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT * FROM autonomy_settings WHERE workspace_id = $1 ORDER BY agent NULLS FIRST`,
      [req.workspace.id]
    );

    const global = result.rows.find((r) => r.agent === null) || null;
    const agents = {};
    for (const row of result.rows) {
      if (row.agent) agents[row.agent] = row;
    }

    // Return defaults if nothing configured
    const defaults = {
      auto_execute_threshold: 500,
      approval_threshold: 5000,
      max_auto_actions_per_cycle: 20,
      max_daily_emails: 50,
      max_daily_sms: 20,
      escalation_delay_hours: 24,
      risk_tolerance: 'moderate',
      quiet_hours_start: null,
      quiet_hours_end: null,
      enabled: true,
    };

    res.json({
      global: global || { ...defaults, agent: null },
      agents,
      defaults,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/autonomy-settings
 * Update global autonomy settings.
 */
router.patch('/', ...guard, async (req, res, next) => {
  try {
    const {
      auto_execute_threshold,
      approval_threshold,
      max_auto_actions_per_cycle,
      max_daily_emails,
      max_daily_sms,
      escalation_delay_hours,
      risk_tolerance,
      quiet_hours_start,
      quiet_hours_end,
      enabled,
    } = req.body;

    if (risk_tolerance && !VALID_RISK_TOLERANCES.includes(risk_tolerance)) {
      return res.status(400).json({ message: `Invalid risk_tolerance. Must be one of: ${VALID_RISK_TOLERANCES.join(', ')}` });
    }

    const result = await pool.query(
      `INSERT INTO autonomy_settings
         (workspace_id, agent, auto_execute_threshold, approval_threshold,
          max_auto_actions_per_cycle, max_daily_emails, max_daily_sms,
          escalation_delay_hours, risk_tolerance, quiet_hours_start, quiet_hours_end, enabled, updated_at)
       VALUES ($1,NULL,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
       ON CONFLICT (workspace_id, agent) DO UPDATE SET
         auto_execute_threshold = COALESCE($2, autonomy_settings.auto_execute_threshold),
         approval_threshold = COALESCE($3, autonomy_settings.approval_threshold),
         max_auto_actions_per_cycle = COALESCE($4, autonomy_settings.max_auto_actions_per_cycle),
         max_daily_emails = COALESCE($5, autonomy_settings.max_daily_emails),
         max_daily_sms = COALESCE($6, autonomy_settings.max_daily_sms),
         escalation_delay_hours = COALESCE($7, autonomy_settings.escalation_delay_hours),
         risk_tolerance = COALESCE($8, autonomy_settings.risk_tolerance),
         quiet_hours_start = COALESCE($9, autonomy_settings.quiet_hours_start),
         quiet_hours_end = COALESCE($10, autonomy_settings.quiet_hours_end),
         enabled = COALESCE($11, autonomy_settings.enabled),
         updated_at = NOW()
       RETURNING *`,
      [
        req.workspace.id,
        auto_execute_threshold ?? null,
        approval_threshold ?? null,
        max_auto_actions_per_cycle ?? null,
        max_daily_emails ?? null,
        max_daily_sms ?? null,
        escalation_delay_hours ?? null,
        risk_tolerance ?? null,
        quiet_hours_start || null,
        quiet_hours_end || null,
        enabled ?? null,
      ]
    );
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/autonomy-settings/:agent
 * Update per-agent autonomy settings.
 */
router.patch('/:agent', ...guard, async (req, res, next) => {
  try {
    const { agent } = req.params;
    if (!VALID_AGENTS.includes(agent)) {
      return res.status(400).json({ message: `Invalid agent. Must be one of: ${VALID_AGENTS.join(', ')}` });
    }

    const {
      auto_execute_threshold,
      approval_threshold,
      max_auto_actions_per_cycle,
      max_daily_emails,
      max_daily_sms,
      escalation_delay_hours,
      risk_tolerance,
      quiet_hours_start,
      quiet_hours_end,
      enabled,
    } = req.body;

    if (risk_tolerance && !VALID_RISK_TOLERANCES.includes(risk_tolerance)) {
      return res.status(400).json({ message: `Invalid risk_tolerance. Must be one of: ${VALID_RISK_TOLERANCES.join(', ')}` });
    }

    const result = await pool.query(
      `INSERT INTO autonomy_settings
         (workspace_id, agent, auto_execute_threshold, approval_threshold,
          max_auto_actions_per_cycle, max_daily_emails, max_daily_sms,
          escalation_delay_hours, risk_tolerance, quiet_hours_start, quiet_hours_end, enabled, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
       ON CONFLICT (workspace_id, agent) DO UPDATE SET
         auto_execute_threshold = COALESCE($3, autonomy_settings.auto_execute_threshold),
         approval_threshold = COALESCE($4, autonomy_settings.approval_threshold),
         max_auto_actions_per_cycle = COALESCE($5, autonomy_settings.max_auto_actions_per_cycle),
         max_daily_emails = COALESCE($6, autonomy_settings.max_daily_emails),
         max_daily_sms = COALESCE($7, autonomy_settings.max_daily_sms),
         escalation_delay_hours = COALESCE($8, autonomy_settings.escalation_delay_hours),
         risk_tolerance = COALESCE($9, autonomy_settings.risk_tolerance),
         quiet_hours_start = COALESCE($10, autonomy_settings.quiet_hours_start),
         quiet_hours_end = COALESCE($11, autonomy_settings.quiet_hours_end),
         enabled = COALESCE($12, autonomy_settings.enabled),
         updated_at = NOW()
       RETURNING *`,
      [
        req.workspace.id,
        agent,
        auto_execute_threshold ?? null,
        approval_threshold ?? null,
        max_auto_actions_per_cycle ?? null,
        max_daily_emails ?? null,
        max_daily_sms ?? null,
        escalation_delay_hours ?? null,
        risk_tolerance ?? null,
        quiet_hours_start || null,
        quiet_hours_end || null,
        enabled ?? null,
      ]
    );
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
