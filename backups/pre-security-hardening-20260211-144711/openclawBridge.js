/**
 * @file openclawBridge.js
 * @description THE critical integration layer between ClawOps Console and OpenClaw.
 *
 * This service is the SINGLE POINT OF CONTACT with OpenClaw.
 * All OpenClaw interactions go through here — no direct calls from routes.
 *
 * MODES:
 * - shell: Execute openclaw commands directly via WSL (CURRENT, STABLE)
 * - gateway: WebSocket RPC to OpenClaw Gateway (FUTURE, EXPERIMENTAL)
 */

const { spawn } = require('child_process');
const { EventEmitter } = require('events');

class OpenClawBridge extends EventEmitter {
  constructor() {
    super();
    this.mode = process.env.OPENCLAW_MODE || 'shell';
    this.openclawPath = '/home/sjpilche/projects/openclaw-v1';
    this.activeSessions = new Map();

    console.log(`[OpenClawBridge] Mode: ${this.mode}`);
  }

  /**
   * Execute OpenClaw command via WSL shell
   * @private
   */
  async _executeShellCommand(args, options = {}) {
    return new Promise((resolve, reject) => {
      const command = `bash`;
      const shellArgs = [
        '-c',
        `cd ${this.openclawPath} && source ~/.nvm/nvm.sh && openclaw ${args}`,
      ];

      console.log(`[OpenClawBridge] Executing: openclaw ${args}`);

      // Use wsl.exe with full path for Windows compatibility
      const wslPath = process.env.SystemRoot
        ? `${process.env.SystemRoot}\\System32\\wsl.exe`
        : 'wsl';

      const proc = spawn(wslPath, [command, ...shellArgs], {
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        if (options.stream) {
          this.emit('agent:log', { log: output, timestamp: new Date().toISOString() });
        }
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr, exitCode: code });
        } else {
          reject(new Error(`OpenClaw command failed (exit ${code}): ${stderr || stdout}`));
        }
      });

      proc.on('error', (error) => {
        reject(new Error(`Failed to spawn openclaw: ${error.message}`));
      });

      // Store process for potential cancellation
      if (options.sessionId) {
        this.activeSessions.set(options.sessionId, { process: proc, status: 'running' });
      }
    });
  }

  /**
   * Test connection to OpenClaw.
   * For shell mode, this tests if openclaw command is available.
   */
  async testConnection() {
    try {
      console.log('[OpenClawBridge] Testing OpenClaw availability...');

      const result = await this._executeShellCommand('--version');
      console.log('[OpenClawBridge] ✅ OpenClaw is available');
      console.log('[OpenClawBridge] Version:', result.stdout.trim());
      return true;
    } catch (error) {
      console.error('[OpenClawBridge] ❌ OpenClaw test failed:', error.message);
      return false;
    }
  }

  /**
   * Trigger an agent run.
   * @param {string} agentId - The agent configuration ID from our database
   * @param {Object} config - Run configuration
   * @param {string} config.sessionId - Session ID for conversation continuity
   * @param {string} config.message - The task/message for the agent
   * @param {boolean} config.json - Return structured JSON output
   * @returns {Object} - Run result { sessionId, status, output }
   */
  async runAgent(agentId, config = {}) {
    try {
      const sessionId = config.sessionId || `session-${Date.now()}-${agentId}`;
      const message = config.message || 'Start agent task';

      console.log(`[OpenClawBridge] Running agent ${agentId} with session ${sessionId}...`);

      // Build openclaw command
      const args = [
        'agent',
        '--local',
        `--session-id "${sessionId}"`,
        `--message "${message.replace(/"/g, '\\"')}"`,
        config.json !== false ? '--json' : '',
      ]
        .filter(Boolean)
        .join(' ');

      // Track session
      this.activeSessions.set(sessionId, {
        agentId,
        startTime: new Date().toISOString(),
        status: 'running',
      });

      this.emit('agent:status', {
        sessionId,
        agentId,
        status: 'running',
        timestamp: new Date().toISOString(),
      });

      // Execute the agent
      const result = await this._executeShellCommand(args, { sessionId, stream: true });

      // Update session status
      if (this.activeSessions.has(sessionId)) {
        this.activeSessions.get(sessionId).status = 'completed';
        this.activeSessions.get(sessionId).completedAt = new Date().toISOString();
      }

      this.emit('agent:status', {
        sessionId,
        agentId,
        status: 'completed',
        timestamp: new Date().toISOString(),
      });

      this.emit('agent:result', {
        sessionId,
        agentId,
        result: result.stdout,
        timestamp: new Date().toISOString(),
      });

      return {
        sessionId,
        runId: sessionId,
        status: 'completed',
        output: result.stdout,
        startedAt: this.activeSessions.get(sessionId)?.startTime,
        completedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error(`[OpenClawBridge] Failed to run agent ${agentId}:`, error.message);

      // Update session to failed
      if (this.activeSessions.has(config.sessionId || '')) {
        this.activeSessions.get(config.sessionId).status = 'failed';
        this.activeSessions.get(config.sessionId).error = error.message;
      }

      this.emit('agent:status', {
        sessionId: config.sessionId,
        agentId,
        status: 'failed',
        error: error.message,
        timestamp: new Date().toISOString(),
      });

      throw new Error(`OpenClaw agent run failed: ${error.message}`);
    }
  }

  /**
   * Stop a running agent by session ID.
   * @param {string} sessionId - The session/run ID to stop
   */
  async stopAgent(sessionId) {
    try {
      console.log(`[OpenClawBridge] Stopping session ${sessionId}...`);

      if (!this.activeSessions.has(sessionId)) {
        throw new Error(`Session ${sessionId} not found`);
      }

      const session = this.activeSessions.get(sessionId);

      if (session.process) {
        // Kill the process
        session.process.kill('SIGTERM');
        session.status = 'stopped';
        session.stoppedAt = new Date().toISOString();

        this.emit('agent:status', {
          sessionId,
          status: 'stopped',
          timestamp: new Date().toISOString(),
        });
      }

      return {
        status: 'stopped',
        sessionId,
        stoppedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error(`[OpenClawBridge] Failed to stop session ${sessionId}:`, error.message);
      throw error;
    }
  }

  /**
   * Stop ALL running agents. This is the KILL SWITCH.
   * @returns {Object} - { status: 'stopped', count: number }
   */
  async stopAll() {
    try {
      console.log('[OpenClawBridge] 🛑 KILL SWITCH ACTIVATED — Stopping all agents...');

      const activeSessions = Array.from(this.activeSessions.keys());
      const results = await Promise.allSettled(
        activeSessions.map((sessionId) => this.stopAgent(sessionId))
      );

      const stopped = results.filter((r) => r.status === 'fulfilled').length;

      console.log(`[OpenClawBridge] ✅ Kill switch complete. Stopped ${stopped} agents.`);

      return {
        status: 'stopped',
        count: stopped,
        total: activeSessions.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('[OpenClawBridge] Kill switch error:', error.message);
      throw error;
    }
  }

  /**
   * Get list of available agents/tasks from OpenClaw.
   * For shell mode, returns empty array (agents are configured in our DB).
   */
  async listAgents() {
    return [];
  }

  /**
   * Get status of a running agent session.
   * @param {string} sessionId - Session ID to check
   * @returns {Object} - Session status
   */
  async getSessionStatus(sessionId) {
    if (this.activeSessions.has(sessionId)) {
      return this.activeSessions.get(sessionId);
    }
    return { status: 'unknown', message: 'Session not found' };
  }

  /**
   * Check if OpenClaw is available.
   * @returns {boolean}
   */
  isConnected() {
    // For shell mode, always return true (we check on each command)
    return true;
  }

  /**
   * Disconnect (cleanup).
   */
  disconnect() {
    console.log('[OpenClawBridge] Cleaning up...');
    // Stop all running sessions
    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (session.process && session.status === 'running') {
        session.process.kill('SIGTERM');
      }
    }
    this.activeSessions.clear();
  }
}

// Export singleton instance
module.exports = new OpenClawBridge();
