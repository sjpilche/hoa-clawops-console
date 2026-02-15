/**
 * @file schedules.js
 * @description API routes for managing agent schedules (cron jobs)
 *
 * This connects the SchedulePage UI to OpenClaw's cron functionality
 */

const express = require('express');
const router = express.Router();
const openclawBridge = require('../services/openclawBridge');
const db = require('../db/connection');

/**
 * GET /api/schedules
 * List all scheduled jobs from OpenClaw
 */
router.get('/', async (req, res) => {
  try {
    // Get all schedules from OpenClaw
    const schedules = await openclawBridge.listSchedules();

    // Enrich with agent information from database
    const enrichedSchedules = [];
    for (const schedule of schedules) {
      const agent = db.get(
        'SELECT id, name, target_system FROM agents WHERE config LIKE ?',
        [`%"openclaw_id":"${schedule.agent_id}"%`]
      );

      enrichedSchedules.push({
        ...schedule,
        agent_name: agent?.name || schedule.agent_id,
        agent_db_id: agent?.id,
        target_system: agent?.target_system,
      });
    }

    res.json({
      success: true,
      count: enrichedSchedules.length,
      schedules: enrichedSchedules,
    });
  } catch (error) {
    console.error('[Schedules API] Error listing schedules:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/schedules/:agentId
 * Get schedules for a specific agent
 */
router.get('/:agentId', async (req, res) => {
  try {
    const agent = db.get('SELECT * FROM agents WHERE id = ?', [req.params.agentId]);

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: 'Agent not found',
      });
    }

    const config = JSON.parse(agent.config || '{}');
    const openclawId = config.openclaw_id;

    if (!openclawId) {
      return res.json({
        success: true,
        schedules: [],
        message: 'Agent has no OpenClaw ID',
      });
    }

    // Get all schedules and filter by agent
    const allSchedules = await openclawBridge.listSchedules();
    const agentSchedules = allSchedules.filter(s => s.agent_id === openclawId);

    res.json({
      success: true,
      count: agentSchedules.length,
      schedules: agentSchedules,
      agent: {
        id: agent.id,
        name: agent.name,
        openclaw_id: openclawId,
      },
    });
  } catch (error) {
    console.error('[Schedules API] Error getting agent schedules:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/schedules
 * Create a new schedule for an agent
 * Body: { agentId, cron, description }
 */
router.post('/', async (req, res) => {
  try {
    const { agentId, cron, description } = req.body;

    if (!agentId || !cron) {
      return res.status(400).json({
        success: false,
        error: 'agentId and cron are required',
      });
    }

    // Get agent from database
    const agent = db.get('SELECT * FROM agents WHERE id = ?', [agentId]);

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: 'Agent not found',
      });
    }

    const config = JSON.parse(agent.config || '{}');
    const openclawId = config.openclaw_id;

    if (!openclawId) {
      return res.status(400).json({
        success: false,
        error: 'Agent has no OpenClaw ID. Cannot schedule.',
      });
    }

    // Add schedule via OpenClaw
    const result = await openclawBridge.addSchedule(openclawId, cron, description);

    // Update agent config to mark scheduling enabled
    config.task = config.task || {};
    config.task.schedule = {
      enabled: true,
      cron: cron,
      description: description || '',
    };

    db.run(
      'UPDATE agents SET config = ? WHERE id = ?',
      [JSON.stringify(config), agentId]
    );

    res.status(201).json({
      success: true,
      message: 'Schedule created successfully',
      schedule: result,
    });
  } catch (error) {
    console.error('[Schedules API] Error creating schedule:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * PUT /api/schedules/:agentId
 * Update a schedule for an agent
 * Body: { cron, description }
 */
router.put('/:agentId', async (req, res) => {
  try {
    const { cron, description } = req.body;
    const agentId = req.params.agentId;

    if (!cron) {
      return res.status(400).json({
        success: false,
        error: 'cron is required',
      });
    }

    // Get agent
    const agent = db.get('SELECT * FROM agents WHERE id = ?', [agentId]);

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: 'Agent not found',
      });
    }

    const config = JSON.parse(agent.config || '{}');
    const openclawId = config.openclaw_id;

    if (!openclawId) {
      return res.status(400).json({
        success: false,
        error: 'Agent has no OpenClaw ID',
      });
    }

    // Remove old schedule and add new one
    await openclawBridge.removeSchedule(openclawId);
    const result = await openclawBridge.addSchedule(openclawId, cron, description);

    // Update agent config
    config.task = config.task || {};
    config.task.schedule = {
      enabled: true,
      cron: cron,
      description: description || '',
    };

    db.run(
      'UPDATE agents SET config = ? WHERE id = ?',
      [JSON.stringify(config), agentId]
    );

    res.json({
      success: true,
      message: 'Schedule updated successfully',
      schedule: result,
    });
  } catch (error) {
    console.error('[Schedules API] Error updating schedule:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * DELETE /api/schedules/:agentId
 * Delete a schedule for an agent
 */
router.delete('/:agentId', async (req, res) => {
  try {
    const agentId = req.params.agentId;

    // Get agent
    const agent = db.get('SELECT * FROM agents WHERE id = ?', [agentId]);

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: 'Agent not found',
      });
    }

    const config = JSON.parse(agent.config || '{}');
    const openclawId = config.openclaw_id;

    if (!openclawId) {
      return res.status(404).json({
        success: false,
        error: 'Agent has no OpenClaw ID',
      });
    }

    // Remove schedule from OpenClaw
    await openclawBridge.removeSchedule(openclawId);

    // Update agent config to mark scheduling disabled
    if (config.task && config.task.schedule) {
      config.task.schedule.enabled = false;
    }

    db.run(
      'UPDATE agents SET config = ? WHERE id = ?',
      [JSON.stringify(config), agentId]
    );

    res.json({
      success: true,
      message: 'Schedule deleted successfully',
    });
  } catch (error) {
    console.error('[Schedules API] Error deleting schedule:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/schedules/:agentId/toggle
 * Enable/disable a schedule
 * Body: { enabled: boolean }
 */
router.post('/:agentId/toggle', async (req, res) => {
  try {
    const { enabled } = req.body;
    const agentId = req.params.agentId;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'enabled (boolean) is required',
      });
    }

    const agent = db.get('SELECT * FROM agents WHERE id = ?', [agentId]);

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: 'Agent not found',
      });
    }

    const config = JSON.parse(agent.config || '{}');
    const openclawId = config.openclaw_id;

    if (!openclawId) {
      return res.status(400).json({
        success: false,
        error: 'Agent has no OpenClaw ID',
      });
    }

    if (enabled) {
      // Enable: add schedule back
      if (config.task?.schedule?.cron) {
        await openclawBridge.addSchedule(
          openclawId,
          config.task.schedule.cron,
          config.task.schedule.description
        );
      } else {
        return res.status(400).json({
          success: false,
          error: 'No cron schedule configured for this agent',
        });
      }
    } else {
      // Disable: remove schedule
      await openclawBridge.removeSchedule(openclawId);
    }

    // Update config
    if (config.task && config.task.schedule) {
      config.task.schedule.enabled = enabled;
    }

    db.run(
      'UPDATE agents SET config = ? WHERE id = ?',
      [JSON.stringify(config), agentId]
    );

    res.json({
      success: true,
      message: `Schedule ${enabled ? 'enabled' : 'disabled'} successfully`,
      enabled,
    });
  } catch (error) {
    console.error('[Schedules API] Error toggling schedule:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
