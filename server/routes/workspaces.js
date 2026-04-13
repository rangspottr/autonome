import { Router } from 'express';
import { pool } from '../db/index.js';
import { requireAuth, requireWorkspace } from '../middleware/auth.js';
import { seedScenario } from '../db/seed-scenario.js';

const router = Router();

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { name, industry } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Workspace name is required' });
    }
    const wsResult = await pool.query(
      `INSERT INTO workspaces (name, industry) VALUES ($1, $2) RETURNING *`,
      [name, industry || null]
    );
    const workspace = wsResult.rows[0];
    await pool.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [workspace.id, req.user.id]
    );

    // Auto-seed new workspaces with realistic demo data (non-fatal)
    try {
      await seedScenario(workspace.id);
    } catch (seedErr) {
      console.error('[Workspace] Seed scenario failed (non-fatal):', seedErr.message);
    }

    res.status(201).json(workspace);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireAuth, requireWorkspace, async (req, res, next) => {
  try {
    res.json(req.workspace);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', requireAuth, requireWorkspace, async (req, res, next) => {
  try {
    const { name, industry, company_size, phone, address, settings } = req.body;
    const result = await pool.query(
      `UPDATE workspaces SET
        name = COALESCE($1, name),
        industry = COALESCE($2, industry),
        company_size = COALESCE($3, company_size),
        phone = COALESCE($4, phone),
        address = COALESCE($5, address),
        settings = COALESCE($6, settings),
        updated_at = NOW()
       WHERE id = $7 RETURNING *`,
      [name, industry, company_size, phone, address, settings ? JSON.stringify(settings) : null, req.workspace.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/complete-onboarding', requireAuth, requireWorkspace, async (req, res, next) => {
  try {
    const { company_size, phone, address, industry, settings } = req.body;
    const result = await pool.query(
      `UPDATE workspaces SET
        onboarding_completed = TRUE,
        company_size = COALESCE($1, company_size),
        phone = COALESCE($2, phone),
        address = COALESCE($3, address),
        industry = COALESCE($4, industry),
        settings = COALESCE($5, settings),
        updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [company_size, phone, address, industry, settings ? JSON.stringify(settings) : null, req.workspace.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
