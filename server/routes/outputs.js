/**
 * Outputs API — surface finished work artifacts (briefings, reports, summaries)
 * as first-class deliverables in the product.
 *
 * GET  /api/outputs            — list outputs (filterable by type)
 * GET  /api/outputs/latest     — latest output per type
 * GET  /api/outputs/:id        — single output
 * POST /api/outputs/trigger/:type — manually trigger output generation
 */
import { Router } from 'express';
import { pool } from '../db/index.js';
import { requireAuth, requireWorkspace, requireActiveSubscription } from '../middleware/auth.js';
import { generateMorningBriefing } from '../jobs/morning-briefing.js';
import { generateWeeklyReport } from '../jobs/weekly-report.js';
import { runCollectionsOperator } from '../jobs/collections-operator.js';

const router = Router();
const guard = [requireAuth, requireWorkspace, requireActiveSubscription];

const VALID_OUTPUT_TYPES = ['morning_briefing', 'weekly_report', 'collections_summary', 'inbox_summary'];

// GET /api/outputs — list outputs with optional type filter
router.get('/', ...guard, async (req, res, next) => {
  try {
    const { type } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
    const offset = (page - 1) * limit;

    const params = [req.workspace.id];
    let where = 'WHERE workspace_id = $1';

    if (type) {
      params.push(type);
      where += ` AND output_type = $${params.length}`;
    }

    const countRes = await pool.query(
      `SELECT COUNT(*) FROM outputs ${where}`,
      params
    );

    params.push(limit, offset);
    const result = await pool.query(
      `SELECT id, output_type, title, data, period_start, period_end, created_at
       FROM outputs ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      outputs: result.rows,
      total: parseInt(countRes.rows[0].count, 10),
      page,
      limit,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/outputs/latest — latest output per type
router.get('/latest', ...guard, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT ON (output_type) id, output_type, title, content, data, period_start, period_end, created_at
       FROM outputs
       WHERE workspace_id = $1
       ORDER BY output_type, created_at DESC`,
      [req.workspace.id]
    );

    const latest = {};
    for (const row of result.rows) {
      latest[row.output_type] = row;
    }

    res.json(latest);
  } catch (err) {
    next(err);
  }
});

// GET /api/outputs/:id — single output with full content
router.get('/:id', ...guard, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT * FROM outputs WHERE id = $1 AND workspace_id = $2`,
      [req.params.id, req.workspace.id]
    );
    if (!result.rows[0]) return res.status(404).json({ message: 'Output not found' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/outputs/trigger/:type — manually trigger output generation
router.post('/trigger/:type', ...guard, async (req, res, next) => {
  try {
    const { type } = req.params;
    if (!VALID_OUTPUT_TYPES.includes(type)) {
      return res.status(400).json({ message: `Invalid output type. Must be one of: ${VALID_OUTPUT_TYPES.join(', ')}` });
    }

    let result;
    if (type === 'morning_briefing') {
      result = await generateMorningBriefing(req.workspace.id);
    } else if (type === 'weekly_report') {
      result = await generateWeeklyReport(req.workspace.id);
    } else if (type === 'collections_summary') {
      result = await runCollectionsOperator(req.workspace.id);
    } else {
      return res.status(400).json({ message: `Cannot manually trigger ${type}` });
    }

    res.json({ success: true, type, id: result.id });
  } catch (err) {
    next(err);
  }
});

export default router;
