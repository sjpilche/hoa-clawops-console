/**
 * @file openclawBridge.js
 * @description OpenClaw integration layer with dual-mode support.
 *
 * MODES:
 * - "openai" (default): Calls OpenAI API directly with SOUL.md as system prompt.
 *   Fastest, most reliable. No CLI dependency.
 * - "shell": Spawns the openclaw CLI binary. Requires openclaw installed globally.
 *
 * Set OPENCLAW_MODE=openai or OPENCLAW_MODE=shell in .env.local
 */

const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs');

// Security constants
const MAX_MESSAGE_LENGTH = 10000; // 10KB max message
const MAX_SESSION_ID_LENGTH = 128;
const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const PROCESS_TIMEOUT_MS = 600000; // 10 minutes max per run

class OpenClawBridge extends EventEmitter {
  constructor() {
    super();
    this.mode = process.env.OPENCLAW_MODE || 'openai';
    this.model = process.env.OPENAI_MODEL || 'gpt-4o';
    this.openaiApiKey = process.env.OPENAI_API_KEY;

    // Skills directory — where SOUL.md files live
    this.skillsDir = path.join(
      process.env.SKILLS_DIR ||
      path.resolve(__dirname, '../../openclaw-skills')
    );

    // Legacy: OpenClaw CLI path (only used in shell mode)
    this.openclawPath = process.env.OPENCLAW_PATH || '';

    this.activeSessions = new Map();

    console.log(`[OpenClawBridge] Mode: ${this.mode}`);
    console.log(`[OpenClawBridge] Model: ${this.model}`);
    console.log(`[OpenClawBridge] Skills dir: ${this.skillsDir}`);
  }

  /**
   * Validate session ID to prevent injection.
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
   * Validate and sanitize message content.
   * @private
   */
  _validateMessage(message) {
    if (!message || typeof message !== 'string') {
      throw new Error('Message must be a non-empty string');
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      throw new Error(`Message too long (max ${MAX_MESSAGE_LENGTH} chars)`);
    }
    if (message.includes('\0')) {
      throw new Error('Message contains invalid null bytes');
    }
    return true;
  }

  /**
   * Load SOUL.md for a given agent.
   * @private
   */
  _loadSoul(openclawId) {
    const soulPath = path.join(this.skillsDir, openclawId, 'SOUL.md');
    try {
      const content = fs.readFileSync(soulPath, 'utf-8');
      return content;
    } catch (err) {
      console.warn(`[OpenClawBridge] No SOUL.md found at ${soulPath}`);
      return null;
    }
  }

  /**
   * Run an agent via the OpenAI API directly.
   * Reads the SOUL.md as system prompt, sends the message as user prompt.
   * @private
   */
  async _runViaOpenAI(openclawId, sessionId, message) {
    if (!this.openaiApiKey) {
      throw new Error('OPENAI_API_KEY is not set in environment');
    }

    console.log(`[OpenClawBridge] Running agent "${openclawId}" via OpenAI (session: ${sessionId.substring(0, 8)}...)`);

    // Load SOUL.md as system prompt
    const soul = this._loadSoul(openclawId);
    const systemPrompt = soul || `You are the ${openclawId} agent. Complete the requested task.`;

    if (soul) {
      console.log(`[OpenClawBridge] Loaded SOUL.md for "${openclawId}" (${soul.length} chars)`);
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message },
    ];

    // Call OpenAI Chat Completions API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: 4096,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const output = data.choices?.[0]?.message?.content || '';
    const usage = data.usage || {};
    const totalTokens = (usage.prompt_tokens || 0) + (usage.completion_tokens || 0);

    // Estimate cost: GPT-4o pricing ($2.50/1M input, $10/1M output)
    const costUsd =
      ((usage.prompt_tokens || 0) * 2.5 / 1_000_000) +
      ((usage.completion_tokens || 0) * 10 / 1_000_000);

    console.log(`[OpenClawBridge] ✅ Agent "${openclawId}" completed (tokens: ${totalTokens})`);

    return {
      output: JSON.stringify({
        type: 'result',
        result: output,
        total_cost_usd: costUsd,
        usage: {
          input_tokens: usage.prompt_tokens || 0,
          output_tokens: usage.completion_tokens || 0,
        },
      }),
      sessionId,
      status: 'completed',
      completedAt: new Date().toISOString(),
    };
  }

  /**
   * Execute OpenClaw CLI command (shell mode).
   * @private
   */
  async _executeShellCommand(args, options = {}) {
    return new Promise((resolve, reject) => {
      console.log(`[OpenClawBridge] Executing: openclaw ${args.join(' ')}`);

      const proc = spawn('openclaw', args, {
        shell: true,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

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
   * Test connection.
   */
  async testConnection() {
    try {
      if (this.mode === 'openai') {
        console.log('[OpenClawBridge] ✅ OpenAI mode — API key configured');
        return !!this.openaiApiKey;
      }
      console.log('[OpenClawBridge] Testing OpenClaw CLI...');
      const result = await this._executeShellCommand(['--version']);
      console.log('[OpenClawBridge] ✅ OpenClaw CLI version:', result.stdout.trim());
      return true;
    } catch (error) {
      console.error('[OpenClawBridge] ❌ Connection test failed:', error.message);
      return false;
    }
  }

  /**
   * Run an agent.
   * Routes to OpenAI direct mode or OpenClaw CLI mode based on this.mode.
   */
  async runAgent(agentId, config = {}) {
    try {
      const sessionId = config.sessionId || `session-${Date.now()}-${agentId}`;
      const message = config.message || 'Start agent task';
      const openclawId = config.openclawId || agentId;

      this._validateSessionId(sessionId);
      this._validateMessage(message);

      // Track session
      this.activeSessions.set(sessionId, {
        agentId,
        openclawId,
        startTime: new Date().toISOString(),
        status: 'running',
      });

      this.emit('agent:status', {
        sessionId,
        agentId,
        status: 'running',
        timestamp: new Date().toISOString(),
      });

      let result;

      if (this.mode === 'openai') {
        // Direct OpenAI API call
        result = await this._runViaOpenAI(openclawId, sessionId, message);
      } else {
        // OpenClaw CLI mode
        console.log(`[OpenClawBridge] Running agent "${openclawId}" via CLI (session: ${sessionId})...`);

        const args = [
          'agent',
          '--agent', openclawId,
          '--local',
          '--session-id', sessionId,
          '--message', message,
        ];
        if (config.json !== false) {
          args.push('--json');
        }

        const cliResult = await this._executeShellCommand(args, { sessionId, stream: true });
        result = {
          sessionId,
          runId: sessionId,
          status: 'completed',
          output: cliResult.stdout,
          completedAt: new Date().toISOString(),
        };
      }

      // Update session status
      if (this.activeSessions.has(sessionId)) {
        const session = this.activeSessions.get(sessionId);
        session.status = 'completed';
        session.completedAt = new Date().toISOString();
        if (session.timeout) clearTimeout(session.timeout);
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
        result: result.output,
        timestamp: new Date().toISOString(),
      });

      return {
        sessionId,
        runId: sessionId,
        status: 'completed',
        output: result.output,
        startedAt: this.activeSessions.get(sessionId)?.startTime,
        completedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error(`[OpenClawBridge] Failed to run agent ${agentId}:`, error.message);

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
   */
  async stopAgent(sessionId) {
    try {
      console.log(`[OpenClawBridge] Stopping session ${sessionId}...`);

      if (!this.activeSessions.has(sessionId)) {
        throw new Error(`Session ${sessionId} not found`);
      }

      const session = this.activeSessions.get(sessionId);

      if (session.process) {
        session.process.kill('SIGTERM');
        session.status = 'stopped';
        session.stoppedAt = new Date().toISOString();
        if (session.timeout) clearTimeout(session.timeout);

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
   * Stop ALL running agents (kill switch).
   */
  async stopAll() {
    try {
      console.log('[OpenClawBridge] KILL SWITCH — Stopping all agents...');

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
   * Get list of available agents (returns empty — agents managed in DB).
   */
  async listAgents() {
    return [];
  }

  /**
   * Get status of a running agent session.
   */
  async getSessionStatus(sessionId) {
    if (this.activeSessions.has(sessionId)) {
      return this.activeSessions.get(sessionId);
    }
    return { status: 'unknown', message: 'Session not found' };
  }

  /**
   * Check if bridge is available.
   */
  isConnected() {
    return true;
  }

  /**
   * Disconnect (cleanup).
   */
  disconnect() {
    console.log('[OpenClawBridge] Cleaning up...');
    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (session.process && session.status === 'running') {
        session.process.kill('SIGTERM');
      }
      if (session.timeout) clearTimeout(session.timeout);
    }
    this.activeSessions.clear();
  }
}

// Export singleton instance
module.exports = new OpenClawBridge();
