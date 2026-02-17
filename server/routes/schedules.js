/**
 * @file schedules.js
 * @description API routes for managing agent schedules.
 * Schedules are stored in the local SQLite DB and displayed in the Scheduler UI.
 */

const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { v4: uuidv4 } = require('uuid');

/**
 * GET /api/schedules
 * List all scheduled jobs
 */
router.get('/', (req, res) => {
  try {
    const schedules = db.all(`
      SELECT s.*, a.name as agent_name_live
      FROM schedules s
      LEFT JOIN agents a ON s.agent_id = a.id
      ORDER BY s.created_at DESC
    `);

    // Normalize field names for the frontend ScheduleCard component
    const normalized = schedules.map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      agentId: s.agent_id,
      agentName: s.agent_name_live || s.agent_name,
      cronExpression: s.cron_expression,
      message: s.message,
      enabled: s.enabled === 1,
      lastRunAt: s.last_run_at,
      nextRunAt: s.next_run_at,
      createdAt: s.created_at,
    }));

    res.json({ success: true, count: normalized.length, schedules: normalized });
  } catch (error) {
    console.error('[Schedules] Error listing schedules:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/schedules
 * Create a new schedule
 * Body: { name, description, agentId, message, cronExpression, enabled }
 */
router.post('/', (req, res) => {
  try {
    const { name, description, agentId, message, cronExpression, enabled } = req.body;

    if (!name || !agentId || !message || !cronExpression) {
      return res.status(400).json({
        success: false,
        error: 'name, agentId, message, and cronExpression are required',
      });
    }

    const agent = db.get('SELECT * FROM agents WHERE id = ?', [agentId]);
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }

    const id = uuidv4();
    db.run(
      `INSERT INTO schedules (id, name, description, agent_id, agent_name, cron_expression, message, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, description || '', agentId, agent.name, cronExpression, message, enabled !== false ? 1 : 0]
    );

    const created = db.get('SELECT * FROM schedules WHERE id = ?', [id]);
    res.status(201).json({
      success: true,
      message: 'Schedule created successfully',
      schedule: { ...created, agentName: agent.name, cronExpression: created.cron_expression, enabled: created.enabled === 1 },
    });
  } catch (error) {
    console.error('[Schedules] Error creating schedule:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/schedules/:id
 * Update a schedule (enable/disable or change cron)
 * Body: { enabled?, cronExpression?, description?, message? }
 */
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { enabled, cronExpression, description, message } = req.body;

    const existing = db.get('SELECT * FROM schedules WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }

    db.run(
      `UPDATE schedules SET
        enabled = ?,
        cron_expression = ?,
        description = ?,
        message = ?,
        updated_at = datetime('now')
       WHERE id = ?`,
      [
        enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled,
        cronExpression || existing.cron_expression,
        description !== undefined ? description : existing.description,
        message || existing.message,
        id,
      ]
    );

    const updated = db.get('SELECT * FROM schedules WHERE id = ?', [id]);
    res.json({
      success: true,
      message: 'Schedule updated',
      schedule: { ...updated, cronExpression: updated.cron_expression, enabled: updated.enabled === 1 },
    });
  } catch (error) {
    console.error('[Schedules] Error updating schedule:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/schedules/:id/run
 * Immediately run a schedule's agent with the schedule's stored message.
 * Creates a pending run (same flow as POST /api/agents/:id/run).
 */
router.post('/:id/run', (req, res) => {
  try {
    const { id } = req.params;
    const schedule = db.get('SELECT * FROM schedules WHERE id = ?', [id]);
    if (!schedule) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }

    const agent = db.get('SELECT * FROM agents WHERE id = ?', [schedule.agent_id]);
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent not found for this schedule' });
    }

    const agentConfig = agent.config ? JSON.parse(agent.config) : {};
    if (!agentConfig.openclaw_id) {
      return res.status(400).json({
        success: false,
        error: `Agent "${agent.name}" is not registered with OpenClaw. Register it on the Agents page first.`,
      });
    }

    // Create a pending run (same as POST /api/agents/:id/run)
    const runId = uuidv4();
    const userId = req.user?.id || 'system';
    const resultData = JSON.stringify({
      message: schedule.message,
      sessionId: undefined,
      json: true,
    });

    db.run(
      `INSERT INTO runs (id, agent_id, user_id, status, trigger, result_data)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [runId, agent.id, userId, 'pending', 'schedule_manual', resultData]
    );

    res.json({
      success: true,
      message: `Schedule run created — awaiting confirmation`,
      run: {
        id: runId,
        status: 'pending',
        agent_id: agent.id,
        created_at: new Date().toISOString(),
      },
      agent: {
        id: agent.id,
        name: agent.name,
        permissions: agent.permissions,
        domains: agent.domains ? JSON.parse(agent.domains) : [],
      },
      confirmation_required: true,
      estimated_cost_usd: 0.05,
    });
  } catch (error) {
    console.error('[Schedules] Error running schedule:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/schedules/:id
 * Delete a schedule
 */
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.get('SELECT * FROM schedules WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }

    db.run('DELETE FROM schedules WHERE id = ?', [id]);
    res.json({ success: true, message: 'Schedule deleted' });
  } catch (error) {
    console.error('[Schedules] Error deleting schedule:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
