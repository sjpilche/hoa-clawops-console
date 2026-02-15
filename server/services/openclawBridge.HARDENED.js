/**
 * @file openclawBridge.HARDENED.js
 * @description SECURITY-HARDENED OpenClaw integration layer.
 *
 * CHANGES FROM ORIGINAL:
 * - ✅ FIXED: Command injection vulnerability (array-based args, no shell)
 * - ✅ ADDED: Input validation and sanitization
 * - ✅ ADDED: Path configuration from environment
 * - ✅ ADDED: Message length limits
 * - ✅ ADDED: Session ID validation
 * - ✅ ADDED: Timeout handling for stuck processes
 * - ✅ IMPROVED: Better error messages
 *
 * MIGRATION: Replace server/services/openclawBridge.js with this file.
 */

const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const path = require('path');

// Security constants
const MAX_MESSAGE_LENGTH = 10000; // 10KB max message
const MAX_SESSION_ID_LENGTH = 128;
const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const PROCESS_TIMEOUT_MS = 600000; // 10 minutes max per run

class OpenClawBridge extends EventEmitter {
  constructor() {
    super();
    this.mode = process.env.OPENCLAW_MODE || 'shell';

    // SECURITY: Path from environment variable, not hardcoded
    this.openclawPath = process.env.OPENCLAW_PATH || '/home/sjpilche/projects/openclaw-v1';

    this.activeSessions = new Map();

    console.log(`[OpenClawBridge] Mode: ${this.mode}`);
    console.log(`[OpenClawBridge] OpenClaw Path: ${this.openclawPath}`);
  }

  /**
   * SECURITY: Validate session ID to prevent injection
   * @private
   */
  _validateSessionId(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new Error('Session ID must be a non-empty string');
    }

    if (sessionId.length > MAX_SESSION_ID_LENGTH) {
      throw new Error(`Session ID too long (max ${MAX_SESSION_ID_LENGTH} chars)`);
    }

    if (!SESSION_ID_PATTERN.test(sessionId)) {
      throw new Error('Session ID contains invalid characters (allowed: a-z, A-Z, 0-9, _, -)');
    }

    return true;
  }

  /**
   * SECURITY: Validate and sanitize message content
   * @private
   */
  _validateMessage(message) {
    if (!message || typeof message !== 'string') {
      throw new Error('Message must be a non-empty string');
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      throw new Error(`Message too long (max ${MAX_MESSAGE_LENGTH} chars)`);
    }

    // Check for null bytes (common injection technique)
    if (message.includes('\0')) {
      throw new Error('Message contains invalid null bytes');
    }

    return true;
  }

  /**
   * SECURITY-HARDENED: Execute OpenClaw command via WSL shell
   * Uses array-based arguments to prevent command injection.
   * @private
   */
  async _executeShellCommand(args, options = {}) {
    return new Promise((resolve, reject) => {
      // Build command as array of arguments (no string concatenation!)
      const commandArgs = [
        '-c',
        `cd ${this.openclawPath} && source ~/.nvm/nvm.sh && openclaw "$@"`,
        '--', // End of shell options, start of positional parameters
        ...args, // Arguments passed as separate array elements
      ];

      console.log(`[OpenClawBridge] Executing: openclaw ${args.join(' ')}`);

      // Use wsl.exe with full path for Windows compatibility
      const wslPath = process.env.SystemRoot
        ? `${process.env.SystemRoot}\\System32\\wsl.exe`
        : 'wsl';

      // SECURITY: shell: false prevents shell interpretation of arguments
      const proc = spawn(wslPath, ['bash', ...commandArgs], {
        shell: false, // CRITICAL: Disable shell to prevent injection
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'], // Don't pass stdin
      });

      let stdout = '';
      let stderr = '';

      // Set timeout to kill stuck processes
      const timeout = setTimeout(() => {
        console.warn(`[OpenClawBridge] Process timeout after ${PROCESS_TIMEOUT_MS}ms, killing...`);
        proc.kill('SIGKILL');
        reject(new Error(`OpenClaw command timed out after ${PROCESS_TIMEOUT_MS / 1000}s`));
      }, PROCESS_TIMEOUT_MS);

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
        clearTimeout(timeout);

        if (code === 0) {
          resolve({ stdout, stderr, exitCode: code });
        } else {
          reject(new Error(`OpenClaw command failed (exit ${code}): ${stderr || stdout}`));
        }
      });

      proc.on('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to spawn openclaw: ${error.message}`));
      });

      // Store process for potential cancellation
      if (options.sessionId) {
        this.activeSessions.set(options.sessionId, {
          process: proc,
          status: 'running',
          timeout,
        });
      }
    });
  }

  /**
   * Test connection to OpenClaw.
   */
  async testConnection() {
    try {
      console.log('[OpenClawBridge] Testing OpenClaw availability...');

      const result = await this._executeShellCommand(['--version']);
      console.log('[OpenClawBridge] ✅ OpenClaw is available');
      console.log('[OpenClawBridge] Version:', result.stdout.trim());
      return true;
    } catch (error) {
      console.error('[OpenClawBridge] ❌ OpenClaw test failed:', error.message);
      return false;
    }
  }

  /**
   * SECURITY-HARDENED: Trigger an agent run.
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

      // SECURITY: Validate inputs before execution
      this._validateSessionId(sessionId);
      this._validateMessage(message);

      console.log(`[OpenClawBridge] Running agent ${agentId} with session ${sessionId}...`);

      // SECURITY: Build command as array (prevents injection)
      const args = [
        'agent',
        '--local',
        '--session-id',
        sessionId, // Passed as separate argument
        '--message',
        message, // Passed as separate argument (no shell expansion!)
      ];

      if (config.json !== false) {
        args.push('--json');
      }

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
        const session = this.activeSessions.get(sessionId);
        session.status = 'completed';
        session.completedAt = new Date().toISOString();

        // Clear timeout if it exists
        if (session.timeout) {
          clearTimeout(session.timeout);
        }
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
        const session = this.activeSessions.get(config.sessionId);
        session.status = 'failed';
        session.error = error.message;

        // Clear timeout
        if (session.timeout) {
          clearTimeout(session.timeout);
        }
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

        // Clear timeout
        if (session.timeout) {
          clearTimeout(session.timeout);
        }

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

      // Clear any active timeouts
      if (session.timeout) {
        clearTimeout(session.timeout);
      }
    }

    this.activeSessions.clear();
  }
}

// Export singleton instance
module.exports = new OpenClawBridge();
