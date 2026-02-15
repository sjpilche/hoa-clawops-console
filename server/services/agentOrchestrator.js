// ==============================================================================
// Agent Orchestrator — Multi-agent workflow coordination engine
// ==============================================================================
// Manages the HOA Funding Agent Fleet with hierarchical orchestration:
// Commander → Coordinators → Specialists
//
// Key Responsibilities:
// - Workflow state machine management
// - Task delegation and coordination
// - Progress tracking and monitoring
// - Failure recovery and retry logic

const { v4: uuidv4 } = require('uuid');
const { EventEmitter } = require('events');
const db = require('../db/connection');
const redisClient = require('./redisClient');

// ==============================================================================
// WORKFLOW ENGINE — State machine for funding workflows
// ==============================================================================

class WorkflowEngine extends EventEmitter {
  constructor() {
    super();
    this.activeWorkflows = new Map(); // In-memory cache of active workflows
  }

  /**
   * Start a new funding workflow
   * @param {string} leadId - Lead UUID
   * @param {Object} options - Workflow options
   * @returns {string} Workflow ID
   */
  async startFundingWorkflow(leadId, options = {}) {
    try {
      const workflowId = uuidv4();
      const now = new Date().toISOString();

      // Create workflow record in database
      db.run(`
        INSERT INTO funding_workflows (
          id, lead_id, current_stage, status, progress_percent,
          started_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        workflowId,
        leadId,
        'intake',
        'in_progress',
        0,
        now,
        now,
        now
      ]);

      // Initialize workflow state in Redis
      await redisClient.setWorkflowState(workflowId, {
        id: workflowId,
        lead_id: leadId,
        stage: 'intake',
        status: 'in_progress',
        progress: 0,
        tasks: {
          lending_research: { status: 'pending', progress: 0 },
          compliance_check: { status: 'pending', progress: 0 },
          document_prep: { status: 'pending', progress: 0 }
        },
        results: {
          loan_options: [],
          compliance_issues: [],
          documents: []
        },
        created_at: now,
        started_at: now
      });

      // Cache in memory
      this.activeWorkflows.set(workflowId, {
        id: workflowId,
        leadId,
        stage: 'intake',
        status: 'in_progress'
      });

      console.log(`[WorkflowEngine] Started workflow ${workflowId} for lead ${leadId}`);

      // Emit event for WebSocket broadcasting
      this.emit('workflow:started', {
        workflowId,
        leadId,
        timestamp: now
      });

      // Trigger commander agent to orchestrate the workflow
      await this.delegateToCommander(workflowId, options);

      return workflowId;
    } catch (error) {
      console.error('[WorkflowEngine] Error starting workflow:', error);
      throw error;
    }
  }

  /**
   * Delegate workflow to commander agent
   * @param {string} workflowId - Workflow ID
   * @param {Object} options - Workflow options
   */
  async delegateToCommander(workflowId, options) {
    try {
      // Find commander agent
      const commander = db.get(`
        SELECT * FROM agents
        WHERE name = 'hoa-funding-commander'
        AND status != 'disabled'
        LIMIT 1
      `);

      if (!commander) {
        throw new Error('Commander agent not found');
      }

      // Update workflow with commander assignment
      db.run(`
        UPDATE funding_workflows
        SET commander_agent_id = ?, updated_at = datetime('now')
        WHERE id = ?
      `, [commander.id, workflowId]);

      // Publish task to coordinator channel
      await redisClient.publish('hoa-funding:coordinator-tasks', {
        workflow_id: workflowId,
        task_type: 'orchestrate_workflow',
        commander_id: commander.id,
        options
      });

      console.log(`[WorkflowEngine] Delegated workflow ${workflowId} to commander ${commander.id}`);
    } catch (error) {
      console.error('[WorkflowEngine] Error delegating to commander:', error);
      await this.failWorkflow(workflowId, error.message);
      throw error;
    }
  }

  /**
   * Delegate task to coordinator
   * @param {string} coordinatorType - 'lending', 'compliance', or 'document'
   * @param {Object} task - Task details
   */
  async delegateToCoordinator(coordinatorType, task) {
    try {
      const channelName = `hoa-funding:${coordinatorType}-tasks`;

      // Find coordinator agent
      const coordinator = db.get(`
        SELECT * FROM agents
        WHERE name LIKE ?
        AND status != 'disabled'
        LIMIT 1
      `, [`%${coordinatorType}-coordinator%`]);

      if (!coordinator) {
        console.warn(`[WorkflowEngine] Coordinator not found: ${coordinatorType}`);
        // Fallback: queue task for later
        await this.queueTask(task.workflow_id, `${coordinatorType}-coordinator`, task);
        return;
      }

      const taskWithMetadata = {
        ...task,
        coordinator_id: coordinator.id,
        delegated_at: new Date().toISOString(),
        timeout: 600000, // 10 minutes
        retry_count: 0,
        max_retries: 3
      };

      // Publish to coordinator channel
      await redisClient.publish(channelName, taskWithMetadata);

      console.log(`[WorkflowEngine] Delegated ${task.task_type} to ${coordinatorType} coordinator`);

      // Emit progress event
      this.emit('workflow:task-delegated', {
        workflowId: task.workflow_id,
        coordinatorType,
        taskType: task.task_type
      });
    } catch (error) {
      console.error(`[WorkflowEngine] Error delegating to ${coordinatorType}:`, error);
      // Queue task for retry
      await this.queueTask(task.workflow_id, `${coordinatorType}-coordinator`, task);
    }
  }

  /**
   * Handle task completion
   * @param {string} taskId - Task ID
   * @param {Object} result - Task result
   */
  async handleTaskComplete(taskId, result) {
    try {
      const { workflow_id, task_type, data, status } = result;

      if (!workflow_id) {
        console.warn('[WorkflowEngine] Task completion missing workflow_id');
        return;
      }

      // Update task status in database
      db.run(`
        UPDATE agent_task_queue
        SET status = ?, result_data = ?, completed_at = datetime('now')
        WHERE id = ?
      `, [status, JSON.stringify(data), taskId]);

      // Get current workflow state
      const workflowState = await redisClient.getWorkflowState(workflow_id);

      if (!workflowState) {
        console.warn(`[WorkflowEngine] Workflow state not found: ${workflow_id}`);
        return;
      }

      // Update workflow results based on task type
      if (task_type === 'scrape_lender' || task_type === 'research_loans') {
        workflowState.results.loan_options = [
          ...(workflowState.results.loan_options || []),
          ...(data.loan_options || [])
        ];
        workflowState.tasks.lending_research.progress += 10;
      } else if (task_type === 'verify_compliance') {
        workflowState.results.compliance_issues = [
          ...(workflowState.results.compliance_issues || []),
          ...(data.issues || [])
        ];
        workflowState.tasks.compliance_check.progress += 10;
      } else if (task_type === 'extract_document') {
        workflowState.results.documents = [
          ...(workflowState.results.documents || []),
          data
        ];
        workflowState.tasks.document_prep.progress += 10;
      }

      // Update workflow state
      await redisClient.setWorkflowState(workflow_id, workflowState);

      // Check if stage is complete
      await this.checkStageCompletion(workflow_id);

      console.log(`[WorkflowEngine] Task completed: ${taskId} for workflow ${workflow_id}`);

      // Emit progress event
      this.emit('workflow:progress', {
        workflowId: workflow_id,
        taskType: task_type,
        status,
        data
      });
    } catch (error) {
      console.error('[WorkflowEngine] Error handling task completion:', error);
    }
  }

  /**
   * Check if current stage is complete and advance to next
   * @param {string} workflowId - Workflow ID
   */
  async checkStageCompletion(workflowId) {
    try {
      const workflow = db.get('SELECT * FROM funding_workflows WHERE id = ?', [workflowId]);
      const workflowState = await redisClient.getWorkflowState(workflowId);

      if (!workflow || !workflowState) {
        return;
      }

      const { current_stage } = workflow;
      let nextStage = null;
      let stageComplete = false;

      // Check if current stage is complete
      switch (current_stage) {
        case 'intake':
          // Intake is complete when commander agent assigns tasks
          nextStage = 'lending_research';
          stageComplete = true;
          break;

        case 'lending_research':
          // Complete when we have 5+ loan options
          stageComplete = workflowState.results.loan_options?.length >= 5;
          if (stageComplete) {
            nextStage = 'compliance';
            workflowState.tasks.lending_research.status = 'completed';
          }
          break;

        case 'compliance':
          // Complete when all compliance checks are done
          const checks = db.all('SELECT * FROM compliance_checks WHERE workflow_id = ?', [workflowId]);
          stageComplete = checks.length > 0 && checks.every(c => c.status !== 'pending');
          if (stageComplete) {
            nextStage = 'document_prep';
            workflowState.tasks.compliance_check.status = 'completed';
          }
          break;

        case 'document_prep':
          // Complete when all documents are processed
          const documents = db.all('SELECT * FROM documents WHERE workflow_id = ?', [workflowId]);
          stageComplete = documents.length > 0 && documents.every(d => d.processing_status === 'extracted');
          if (stageComplete) {
            nextStage = 'complete';
            workflowState.tasks.document_prep.status = 'completed';
          }
          break;
      }

      if (stageComplete && nextStage) {
        // Advance to next stage
        db.run(`
          UPDATE funding_workflows
          SET current_stage = ?, progress_percent = ?, updated_at = datetime('now')
          WHERE id = ?
        `, [nextStage, this.calculateProgress(nextStage), workflowId]);

        workflowState.stage = nextStage;
        await redisClient.setWorkflowState(workflowId, workflowState);

        console.log(`[WorkflowEngine] Workflow ${workflowId} advanced to ${nextStage}`);

        // Emit stage change event
        this.emit('workflow:stage-changed', {
          workflowId,
          previousStage: current_stage,
          nextStage
        });

        // If complete, finalize workflow
        if (nextStage === 'complete') {
          await this.completeWorkflow(workflowId);
        }
      }
    } catch (error) {
      console.error('[WorkflowEngine] Error checking stage completion:', error);
    }
  }

  /**
   * Calculate progress percentage based on stage
   * @param {string} stage - Current stage
   * @returns {number} Progress (0-100)
   */
  calculateProgress(stage) {
    const stageProgress = {
      intake: 10,
      lending_research: 40,
      compliance: 70,
      document_prep: 90,
      complete: 100
    };
    return stageProgress[stage] || 0;
  }

  /**
   * Complete workflow
   * @param {string} workflowId - Workflow ID
   */
  async completeWorkflow(workflowId) {
    try {
      const now = new Date().toISOString();

      // Update database
      db.run(`
        UPDATE funding_workflows
        SET status = 'completed',
            progress_percent = 100,
            completed_at = ?,
            updated_at = ?
        WHERE id = ?
      `, [now, now, workflowId]);

      // Update workflow counts
      const loanCount = db.get(`
        SELECT COUNT(*) as count FROM loan_options WHERE workflow_id = ?
      `, [workflowId]);

      const compliancePassed = db.get(`
        SELECT COUNT(*) as failed FROM compliance_checks
        WHERE workflow_id = ? AND status = 'fail'
      `, [workflowId]);

      const documentsReady = db.get(`
        SELECT COUNT(*) as total, COUNT(CASE WHEN processing_status = 'extracted' THEN 1 END) as extracted
        FROM documents WHERE workflow_id = ?
      `, [workflowId]);

      db.run(`
        UPDATE funding_workflows
        SET loan_options_count = ?,
            compliance_pass = ?,
            documents_ready = ?
        WHERE id = ?
      `, [
        loanCount?.count || 0,
        (compliancePassed?.failed || 0) === 0 ? 1 : 0,
        (documentsReady?.total || 0) === (documentsReady?.extracted || 0) ? 1 : 0,
        workflowId
      ]);

      // Update Redis state
      const workflowState = await redisClient.getWorkflowState(workflowId);
      if (workflowState) {
        workflowState.status = 'completed';
        workflowState.completed_at = now;
        await redisClient.setWorkflowState(workflowId, workflowState);
      }

      // Remove from active workflows
      this.activeWorkflows.delete(workflowId);

      console.log(`[WorkflowEngine] Workflow completed: ${workflowId}`);

      // Emit completion event
      this.emit('workflow:completed', {
        workflowId,
        completedAt: now,
        loanCount: loanCount?.count || 0
      });
    } catch (error) {
      console.error('[WorkflowEngine] Error completing workflow:', error);
    }
  }

  /**
   * Fail workflow
   * @param {string} workflowId - Workflow ID
   * @param {string} errorMessage - Error message
   */
  async failWorkflow(workflowId, errorMessage) {
    try {
      const now = new Date().toISOString();

      db.run(`
        UPDATE funding_workflows
        SET status = 'failed',
            completed_at = ?,
            updated_at = ?
        WHERE id = ?
      `, [now, now, workflowId]);

      const workflowState = await redisClient.getWorkflowState(workflowId);
      if (workflowState) {
        workflowState.status = 'failed';
        workflowState.error = errorMessage;
        await redisClient.setWorkflowState(workflowId, workflowState);
      }

      this.activeWorkflows.delete(workflowId);

      console.error(`[WorkflowEngine] Workflow failed: ${workflowId} - ${errorMessage}`);

      this.emit('workflow:failed', {
        workflowId,
        error: errorMessage,
        timestamp: now
      });
    } catch (error) {
      console.error('[WorkflowEngine] Error failing workflow:', error);
    }
  }

  /**
   * Queue task in database (persistent fallback)
   * @param {string} workflowId - Workflow ID
   * @param {string} agentId - Target agent ID
   * @param {Object} task - Task details
   */
  async queueTask(workflowId, agentId, task) {
    const taskId = uuidv4();

    db.run(`
      INSERT INTO agent_task_queue (
        id, workflow_id, agent_id, task_type, task_payload,
        status, priority, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `, [
      taskId,
      workflowId,
      agentId,
      task.task_type,
      JSON.stringify(task),
      'pending',
      task.priority || 5
    ]);

    console.log(`[WorkflowEngine] Task queued in database: ${taskId}`);
    return taskId;
  }

  /**
   * Monitor all active workflows
   * @returns {Array} Active workflow summaries
   */
  async monitorWorkflows() {
    try {
      const activeWorkflows = db.all(`
        SELECT * FROM funding_workflows
        WHERE status IN ('pending', 'in_progress')
        ORDER BY created_at DESC
      `);

      const summaries = [];

      for (const workflow of activeWorkflows) {
        const redisState = await redisClient.getWorkflowState(workflow.id);
        const loanCount = db.get(`
          SELECT COUNT(*) as count FROM loan_options WHERE workflow_id = ?
        `, [workflow.id]);

        summaries.push({
          id: workflow.id,
          lead_id: workflow.lead_id,
          stage: workflow.current_stage,
          status: workflow.status,
          progress: workflow.progress_percent,
          loanCount: loanCount?.count || 0,
          redisState
        });
      }

      return summaries;
    } catch (error) {
      console.error('[WorkflowEngine] Error monitoring workflows:', error);
      return [];
    }
  }
}

// ==============================================================================
// TASK QUEUE — Redis-backed distributed task queue
// ==============================================================================

class TaskQueue {
  constructor() {
    this.queues = new Map(); // Track queue lengths
  }

  /**
   * Push task to queue
   * @param {string} queueName - Queue name
   * @param {Object} task - Task object
   */
  async push(queueName, task) {
    await redisClient.pushTask(queueName, task);
    this.queues.set(queueName, (this.queues.get(queueName) || 0) + 1);
  }

  /**
   * Pop task from queue (blocking)
   * @param {string} queueName - Queue name
   * @param {number} timeout - Timeout in seconds
   * @returns {Object|null} Task or null
   */
  async pop(queueName, timeout = 30) {
    const task = await redisClient.popTask(queueName, timeout);
    if (task) {
      this.queues.set(queueName, Math.max(0, (this.queues.get(queueName) || 0) - 1));
    }
    return task;
  }

  /**
   * Get queue length
   * @param {string} queueName - Queue name
   * @returns {number} Queue length
   */
  async getLength(queueName) {
    return await redisClient.getQueueLength(queueName);
  }

  /**
   * Get all queue metrics
   * @returns {Object} Queue metrics
   */
  async getMetrics() {
    const metrics = {};

    const queueNames = [
      'lending-tasks',
      'compliance-tasks',
      'document-tasks',
      'coordinator-tasks'
    ];

    for (const queueName of queueNames) {
      metrics[queueName] = await this.getLength(queueName);
    }

    return metrics;
  }
}

// ==============================================================================
// AGENT COORDINATOR — Agent lifecycle and delegation
// ==============================================================================

class AgentCoordinator {
  /**
   * Get available agents by type
   * @param {string} agentType - Agent type ('lending', 'compliance', 'document')
   * @returns {Array} Available agents
   */
  async getAvailableAgents(agentType) {
    return db.all(`
      SELECT * FROM agents
      WHERE name LIKE ?
      AND status != 'disabled'
      ORDER BY success_rate DESC
    `, [`%${agentType}%`]);
  }

  /**
   * Assign task to best available agent
   * @param {string} agentType - Agent type
   * @param {Object} task - Task details
   * @returns {string|null} Agent ID or null
   */
  async assignTask(agentType, task) {
    const agents = await this.getAvailableAgents(agentType);

    if (agents.length === 0) {
      console.warn(`[AgentCoordinator] No available agents for type: ${agentType}`);
      return null;
    }

    // Select agent with highest success rate and lowest current load
    const selectedAgent = agents[0];

    // Update agent status
    db.run(`
      UPDATE agents
      SET status = 'running', last_run_at = datetime('now')
      WHERE id = ?
    `, [selectedAgent.id]);

    // Set heartbeat in Redis
    await redisClient.setAgentStatus(selectedAgent.id, 'running', 300);

    console.log(`[AgentCoordinator] Assigned task to agent ${selectedAgent.id}`);
    return selectedAgent.id;
  }

  /**
   * Release agent after task completion
   * @param {string} agentId - Agent ID
   * @param {boolean} success - Whether task succeeded
   */
  async releaseAgent(agentId, success = true) {
    // Update agent status
    db.run(`
      UPDATE agents
      SET status = 'idle', total_runs = total_runs + 1
      WHERE id = ?
    `, [agentId]);

    // Update success rate if needed
    if (!success) {
      const agent = db.get('SELECT total_runs, success_rate FROM agents WHERE id = ?', [agentId]);
      if (agent) {
        const successfulRuns = Math.floor(agent.total_runs * (agent.success_rate / 100));
        const newSuccessRate = (successfulRuns / agent.total_runs) * 100;
        db.run('UPDATE agents SET success_rate = ? WHERE id = ?', [newSuccessRate, agentId]);
      }
    }

    // Clear heartbeat
    await redisClient.clearAgentStatus(agentId);

    console.log(`[AgentCoordinator] Released agent ${agentId}`);
  }
}

// ==============================================================================
// EXPORTS
// ==============================================================================

const workflowEngine = new WorkflowEngine();
const taskQueue = new TaskQueue();
const agentCoordinator = new AgentCoordinator();

module.exports = {
  WorkflowEngine,
  TaskQueue,
  AgentCoordinator,
  workflowEngine,
  taskQueue,
  agentCoordinator
};
