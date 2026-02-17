/**
 * @file agents.js (routes)
 * @description Agent management endpoints.
 *
 * ENDPOINTS:
 *   GET    /api/agents          — List all agents
 *   GET    /api/agents/:id      — Get single agent details
 *   POST   /api/agents          — Create a new agent
 *   PUT    /api/agents/:id      — Update agent configuration
 *   DELETE /api/agents/:id      — Delete an agent
 *   POST   /api/agents/:id/run  — Trigger an agent run (Phase 3)
 */

const { Router } = require('express');
const { v4: uuidv4 } = require('uuid');
const { all, get, run } = require('../db/connection');
const { authenticate } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { validateBody, validateParams, validateMultiple } = require('../middleware/validator');
const {
  createAgentSchema,
  updateAgentSchema,
  runAgentSchema,
  agentIdParamSchema,
} = require('../schemas');

const router = Router();

// All agent routes require authentication
router.use(authenticate);

/**
 * GET /api/agents
 * List all configured agents with their current status.
 */
router.get('/', (req, res, next) => {
  try {
    const { domain, domain_id, layer, orchestration_role } = req.query;
    const domainFilter = domain || domain_id;

    let sql = `
      SELECT a.*, h.layer as hierarchy_layer, h.parent_id, h.hierarchy_type,
             d.display_name as domain_name, d.color as domain_color
      FROM agents a
      LEFT JOIN agent_hierarchies h ON a.id = h.agent_id
      LEFT JOIN domains d ON a.domain_id = d.id
    `;
    const conditions = [];
    const params = [];

    if (domainFilter) {
      conditions.push('a.domain_id = ?');
      params.push(domainFilter);
    }
    if (layer !== undefined) {
      conditions.push('COALESCE(h.layer, a.layer) = ?');
      params.push(Number(layer));
    }
    if (orchestration_role) {
      conditions.push('a.orchestration_role = ?');
      params.push(orchestration_role);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY COALESCE(h.layer, a.layer), a.name ASC';

    const agents = all(sql, params);
    res.json({ agents });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/agents/:id
 * Get detailed info about a specific agent, including recent runs.
 */
router.get('/:id', validateParams(agentIdParamSchema), (req, res, next) => {
  try {
    const agentId = req.validated.params.id;
    const agent = get('SELECT * FROM agents WHERE id = ?', [agentId]);
    if (!agent) {
      throw new AppError(
        `Agent with ID "${agentId}" not found. Check the agent ID and try again.`,
        'AGENT_NOT_FOUND',
        404
      );
    }

    // Also fetch the 10 most recent runs for this agent
    const recentRuns = all(
      'SELECT * FROM runs WHERE agent_id = ? ORDER BY created_at DESC LIMIT 10',
      [agentId]
    );

    res.json({ agent, recentRuns });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/agents
 * Create a new agent configuration.
 * Also registers the agent with OpenClaw and writes SOUL.md.
 *
 * Request body: { name, description, target_system, config, domains, permissions, instructions }
 */
router.post('/', validateBody(createAgentSchema), async (req, res, next) => {
  try {
    const { name, description, target_system, config, domains, permissions, instructions } = req.validated.body;

    const agentId = uuidv4();

    // 1. Create agent in OpenClaw (registers workspace + SOUL.md)
    // Registration is REQUIRED — if OpenClaw is unavailable, fail with clear error
    const openclawBridge = require('../services/openclawBridge');
    let openclawResult;
    try {
      openclawResult = await openclawBridge.createAgent(name, {
        soulDocument: instructions || null,
      });
      console.log(`[Agents] ✅ Agent registered in OpenClaw: ${openclawResult.openclawId}`);
    } catch (err) {
      throw new AppError(
        `Failed to register agent with OpenClaw: ${err.message}. ` +
        `Make sure OpenClaw is running in WSL and try again.`,
        'OPENCLAW_REGISTRATION_FAILED',
        502
      );
    }

    // 2. Store agent in our database (include openclawId for linking)
    const agentConfig = {
      ...(config || {}),
      openclaw_id: openclawResult?.openclawId || null,
      openclaw_workspace: openclawResult?.workspace || null,
    };

    run(
      `INSERT INTO agents (id, name, description, target_system, config, domains, permissions, instructions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agentId,
        name,
        description || '',
        target_system || '',
        JSON.stringify(agentConfig),
        JSON.stringify(domains || []),
        permissions || 'read-only',
        instructions || '',
      ]
    );

    // 3. Schedule the agent if task schedule is enabled
    let scheduleResult = null;
    const taskConfig = config?.task;
    if (taskConfig?.schedule?.enabled && taskConfig.schedule.cron && openclawResult?.openclawId) {
      try {
        scheduleResult = await openclawBridge.scheduleAgent(openclawResult.openclawId, {
          cron: taskConfig.schedule.cron,
          message: taskConfig.message || name,
          name: `${name} - scheduled`,
          timezone: taskConfig.schedule.timezone || 'America/New_York',
        });
        console.log(`[Agents] ✅ Agent scheduled: ${taskConfig.schedule.cron}`);
      } catch (err) {
        console.warn(`[Agents] ⚠️ Scheduling failed (agent created but not scheduled): ${err.message}`);
      }
    }

    const agent = get('SELECT * FROM agents WHERE id = ?', [agentId]);
    res.status(201).json({
      agent,
      openclaw: openclawResult ? {
        registered: true,
        openclawId: openclawResult.openclawId,
        workspace: openclawResult.workspace,
      } : { registered: false },
      schedule: scheduleResult ? {
        scheduled: true,
        cron: taskConfig.schedule.cron,
        timezone: taskConfig.schedule.timezone,
      } : { scheduled: false },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/agents/:id/register
 * Retry OpenClaw registration for agents that failed initial registration.
 * This registers the agent with OpenClaw and sets up scheduling if configured.
 */
router.post('/:id/register', authenticate, validateParams(agentIdParamSchema), async (req, res, next) => {
  try {
    const agentId = req.validated.params.id;
    const agent = get('SELECT * FROM agents WHERE id = ?', [agentId]);
    if (!agent) {
      throw new AppError(`Agent "${agentId}" not found.`, 'AGENT_NOT_FOUND', 404);
    }

    const agentConfig = agent.config ? JSON.parse(agent.config) : {};

    // If already registered, return early
    if (agentConfig.openclaw_id) {
      return res.json({
        message: 'Agent already registered with OpenClaw',
        openclaw_id: agentConfig.openclaw_id,
      });
    }

    // Register with OpenClaw
    const openclawBridge = require('../services/openclawBridge');
    const openclawResult = await openclawBridge.createAgent(agent.name, {
      soulDocument: agent.instructions || null,
    });

    // Update config with openclaw_id
    agentConfig.openclaw_id = openclawResult.openclawId;
    agentConfig.openclaw_workspace = openclawResult.workspace;

    run('UPDATE agents SET config = ?, updated_at = datetime("now") WHERE id = ?', [
      JSON.stringify(agentConfig),
      agentId,
    ]);

    console.log(`[Agents] ✅ Agent "${agent.name}" registered with OpenClaw as "${openclawResult.openclawId}"`);

    // If agent has a schedule configured, register that too
    let scheduleResult = null;
    const taskConfig = agentConfig.task;
    if (taskConfig?.schedule?.enabled && taskConfig.schedule.cron) {
      try {
        scheduleResult = await openclawBridge.scheduleAgent(openclawResult.openclawId, {
          cron: taskConfig.schedule.cron,
          message: taskConfig.message || agent.name,
          name: `${agent.name} - scheduled`,
          timezone: taskConfig.schedule.timezone || 'America/New_York',
        });
        console.log(`[Agents] ✅ Schedule registered: ${taskConfig.schedule.cron}`);
      } catch (schedErr) {
        console.warn(`[Agents] ⚠️ Scheduling failed during registration: ${schedErr.message}`);
      }
    }

    const updated = get('SELECT * FROM agents WHERE id = ?', [agentId]);
    res.json({
      message: 'Agent registered with OpenClaw',
      agent: updated,
      openclaw: { registered: true, openclawId: openclawResult.openclawId },
      schedule: scheduleResult ? { scheduled: true } : { scheduled: false },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/agents/:id
 * Update an existing agent's configuration.
 * Also syncs changes to OpenClaw (SOUL.md, schedule).
 */
router.put(
  '/:id',
  validateMultiple({
    params: agentIdParamSchema,
    body: updateAgentSchema,
  }),
  async (req, res, next) => {
    try {
      const agentId = req.validated.params.id;
      const existing = get('SELECT * FROM agents WHERE id = ?', [agentId]);
      if (!existing) {
        throw new AppError(`Agent "${agentId}" not found.`, 'AGENT_NOT_FOUND', 404);
      }

      const { name, description, target_system, config, domains, permissions, status, instructions } =
        req.validated.body;

      // Merge config carefully — preserve openclaw_id and openclaw_workspace from existing
      const existingConfig = existing.config ? JSON.parse(existing.config) : {};
      let mergedConfig = null;
      if (config) {
        mergedConfig = {
          ...existingConfig,
          ...config,
          // Always preserve these — frontend doesn't know about them
          openclaw_id: existingConfig.openclaw_id,
          openclaw_workspace: existingConfig.openclaw_workspace,
        };
      }

      run(
        `UPDATE agents SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        target_system = COALESCE(?, target_system),
        config = COALESCE(?, config),
        domains = COALESCE(?, domains),
        permissions = COALESCE(?, permissions),
        status = COALESCE(?, status),
        instructions = COALESCE(?, instructions),
        updated_at = datetime('now')
       WHERE id = ?`,
        [
          name || null,
          description || null,
          target_system || null,
          mergedConfig ? JSON.stringify(mergedConfig) : null,
          domains ? JSON.stringify(domains) : null,
          permissions || null,
          status || null,
          instructions || null,
          agentId,
        ]
      );

      // Sync changes to OpenClaw if agent is registered
      const openclawId = (mergedConfig || existingConfig).openclaw_id;
      if (openclawId) {
        const openclawBridge = require('../services/openclawBridge');

        // Update SOUL.md if instructions changed
        if (instructions && instructions !== existing.instructions) {
          try {
            await openclawBridge.writeSoulDocument(openclawId, instructions);
            console.log(`[Agents] ✅ SOUL.md updated for "${openclawId}"`);
          } catch (err) {
            console.warn(`[Agents] ⚠️ Failed to update SOUL.md: ${err.message}`);
          }
        }

        // Update schedule if task config changed
        const finalConfig = mergedConfig || existingConfig;
        const newTaskConfig = finalConfig.task;
        if (newTaskConfig?.schedule?.enabled && newTaskConfig.schedule.cron) {
          try {
            await openclawBridge.scheduleAgent(openclawId, {
              cron: newTaskConfig.schedule.cron,
              message: newTaskConfig.message || name || existing.name,
              name: `${name || existing.name} - scheduled`,
              timezone: newTaskConfig.schedule.timezone || 'America/New_York',
            });
            console.log(`[Agents] ✅ Schedule updated for "${openclawId}": ${newTaskConfig.schedule.cron}`);
          } catch (err) {
            console.warn(`[Agents] ⚠️ Failed to update schedule: ${err.message}`);
          }
        } else if (newTaskConfig?.schedule && !newTaskConfig.schedule.enabled) {
          // Schedule was disabled — remove cron jobs
          try {
            await openclawBridge.unscheduleAgent(openclawId);
            console.log(`[Agents] ✅ Schedule removed for "${openclawId}"`);
          } catch (err) {
            console.warn(`[Agents] ⚠️ Failed to remove schedule: ${err.message}`);
          }
        }
      }

      const agent = get('SELECT * FROM agents WHERE id = ?', [agentId]);
      res.json({ agent });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/agents/:id
 * Delete an agent. Also cleans up OpenClaw registration and cron jobs.
 */
router.delete('/:id', validateParams(agentIdParamSchema), async (req, res, next) => {
  try {
    const agentId = req.validated.params.id;
    const existing = get('SELECT * FROM agents WHERE id = ?', [agentId]);
    if (!existing) {
      throw new AppError(`Agent "${agentId}" not found.`, 'AGENT_NOT_FOUND', 404);
    }

    // Don't delete agents that are currently running!
    if (existing.status === 'running') {
      throw new AppError(
        'Cannot delete a running agent. Stop it first with the kill switch or /stop command.',
        'AGENT_STILL_RUNNING',
        409
      );
    }

    // Clean up OpenClaw registration and cron jobs
    const agentConfig = existing.config ? JSON.parse(existing.config) : {};
    if (agentConfig.openclaw_id) {
      const openclawBridge = require('../services/openclawBridge');

      // Remove cron jobs first
      try {
        await openclawBridge.unscheduleAgent(agentConfig.openclaw_id);
        console.log(`[Agents] ✅ Cron jobs removed for "${agentConfig.openclaw_id}"`);
      } catch (err) {
        console.warn(`[Agents] ⚠️ Failed to remove cron jobs: ${err.message}`);
      }

      // Remove agent from OpenClaw
      try {
        await openclawBridge.removeAgent(agentConfig.openclaw_id);
        console.log(`[Agents] ✅ Agent removed from OpenClaw: "${agentConfig.openclaw_id}"`);
      } catch (err) {
        console.warn(`[Agents] ⚠️ Failed to remove from OpenClaw: ${err.message}`);
      }
    }

    run('DELETE FROM agents WHERE id = ?', [agentId]);
    res.json({ message: 'Agent deleted', id: agentId });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/agents/:id/run
 * =============================
 * PHASE 2.1: CONFIRMATION GATE ⭐
 * =============================
 *
 * Creates a PENDING agent run that requires user confirmation.
 * This is Step 1 of the human-in-the-loop safety flow.
 *
 * OLD BEHAVIOR (Phase 0): Executed agent immediately
 * NEW BEHAVIOR (Phase 2.1): Creates pending run, returns run_id for confirmation
 *
 * Flow:
 * 1. POST /api/agents/:id/run → creates pending run record ← YOU ARE HERE
 * 2. Client displays ConfirmationDialog with cost estimate, permissions, domains
 * 3. User confirms → POST /api/runs/:id/confirm (in runs.js)
 * 4. Agent executes and run status updates to completed/failed
 *
 * Request body: { message, sessionId (optional), json (optional) }
 */
router.post(
  '/:id/run',
  validateMultiple({
    params: agentIdParamSchema,
    body: runAgentSchema,
  }),
  async (req, res, next) => {
    try {
      const agentId = req.validated.params.id;
      const agent = get('SELECT * FROM agents WHERE id = ?', [agentId]);
      if (!agent) {
        throw new AppError(`Agent "${agentId}" not found.`, 'AGENT_NOT_FOUND', 404);
      }

      const { message, sessionId, json } = req.validated.body;

      // Extract the OpenClaw agent ID from the stored config
      const agentConfig = agent.config ? JSON.parse(agent.config) : {};

      if (!agentConfig.openclaw_id) {
        throw new AppError(
          `Agent "${agent.name}" is not registered with OpenClaw. ` +
          `Use the Register button on the Agents page to register it, then try again.`,
          'AGENT_NOT_REGISTERED',
          400
        );
      }

      // Create a PENDING run record (does NOT execute agent yet)
      const runId = uuidv4();
      const userId = req.user?.id || 'system';

      // Store the run parameters in result_data for later use when confirmed
      const resultData = JSON.stringify({
        message,
        sessionId,
        json: json !== false,
      });

      run(
        `INSERT INTO runs (id, agent_id, user_id, status, trigger, result_data)
       VALUES (?, ?, ?, ?, ?, ?)`,
        [
          runId,
          agent.id,
          userId,
          'pending', // ⭐ NEW: Run is pending confirmation
          'manual',
          resultData,
        ]
      );

      // Return the pending run information
      // Client will display confirmation dialog
      res.json({
        message: `Agent run created - awaiting confirmation`,
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
        next_step: `POST /api/runs/${runId}/confirm to execute`,
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
