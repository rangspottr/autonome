import { Router } from 'express';
import { pool } from '../db/index.js';
import { requireAuth, requireWorkspace, requireActiveSubscription } from '../middleware/auth.js';

const router = Router();
const guard = [requireAuth, requireWorkspace, requireActiveSubscription];

const VALID_TYPES = ['preference', 'policy', 'rule', 'override'];
const VALID_AGENTS = ['finance', 'revenue', 'operations', 'growth', 'support'];
const VALID_SOURCES = ['manual', 'chat', 'boardroom'];

// GET /api/operator-instructions — list active instructions
router.get('/', ...guard, async (req, res, next) => {
  try {
    const { agent, type } = req.query;
    const params = [req.workspace.id];
    let where = 'WHERE workspace_id = $1 AND active = true';

    if (agent) {
      params.push(agent);
      where += ` AND (agent = $${params.length} OR agent IS NULL)`;
    }
    if (type) {
      params.push(type);
      where += ` AND type = $${params.length}`;
    }

    const result = await pool.query(
      `SELECT * FROM operator_instructions ${where} ORDER BY priority DESC, created_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/operator-instructions — create instruction
router.post('/', ...guard, async (req, res, next) => {
  try {
    const { agent, instruction, type, priority, source } = req.body;
    if (!instruction) {
      return res.status(400).json({ message: 'instruction is required' });
    }
    if (type && !VALID_TYPES.includes(type)) {
      return res.status(400).json({ message: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` });
    }
    if (agent && !VALID_AGENTS.includes(agent)) {
      return res.status(400).json({ message: `Invalid agent. Must be one of: ${VALID_AGENTS.join(', ')}` });
    }
    if (source && !VALID_SOURCES.includes(source)) {
      return res.status(400).json({ message: `Invalid source. Must be one of: ${VALID_SOURCES.join(', ')}` });
    }
    const result = await pool.query(
      `INSERT INTO operator_instructions (workspace_id, agent, instruction, type, priority, source)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        req.workspace.id,
        agent || null,
        instruction,
        type || 'preference',
        priority !== undefined ? parseInt(priority, 10) : 50,
        source || 'manual',
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/operator-instructions/:id — update instruction
router.patch('/:id', ...guard, async (req, res, next) => {
  try {
    const { instruction, type, priority, active, agent } = req.body;
    if (type && !VALID_TYPES.includes(type)) {
      return res.status(400).json({ message: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` });
    }
    if (agent && !VALID_AGENTS.includes(agent)) {
      return res.status(400).json({ message: `Invalid agent. Must be one of: ${VALID_AGENTS.join(', ')}` });
    }
    const existing = await pool.query(
      `SELECT id FROM operator_instructions WHERE id = $1 AND workspace_id = $2`,
      [req.params.id, req.workspace.id]
    );
    if (!existing.rows[0]) return res.status(404).json({ message: 'Instruction not found' });

    const updated = await pool.query(
      `UPDATE operator_instructions
       SET instruction = COALESCE($1, instruction),
           type = COALESCE($2, type),
           priority = COALESCE($3, priority),
           active = COALESCE($4, active),
           agent = COALESCE($5, agent),
           updated_at = NOW()
       WHERE id = $6 AND workspace_id = $7
       RETURNING *`,
      [
        instruction || null,
        type || null,
        priority !== undefined ? parseInt(priority, 10) : null,
        active !== undefined ? active : null,
        agent || null,
        req.params.id,
        req.workspace.id,
      ]
    );
    res.json(updated.rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/operator-instructions/:id — soft-delete (set active=false)
router.delete('/:id', ...guard, async (req, res, next) => {
  try {
    const result = await pool.query(
      `UPDATE operator_instructions SET active = false, updated_at = NOW()
       WHERE id = $1 AND workspace_id = $2 RETURNING id`,
      [req.params.id, req.workspace.id]
    );
    if (!result.rows[0]) return res.status(404).json({ message: 'Instruction not found' });
    res.json({ message: 'Instruction deactivated' });
  } catch (err) {
    next(err);
  }
});

export default router;
