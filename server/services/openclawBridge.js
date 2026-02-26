/**
 * @file openclawBridge.js
 * @description Runs OpenClaw agents via the CLI.
 *
 * Command: openclaw agent --local --json --agent <id> --message "<msg>"
 */

const { spawn } = require('child_process');
const { EventEmitter } = require('events');

const TIMEOUT_MS = parseInt(process.env.MAX_DURATION_PER_RUN || '600', 10) * 1000;

/** Shell-escape a value by wrapping in double quotes and escaping inner quotes. */
function esc(val) {
  return '"' + String(val).replace(/"/g, '\\"') + '"';
}

class OpenClawBridge extends EventEmitter {
  constructor() {
    super();
    console.log('[OpenClawBridge] Ready (openclaw-cli mode)');
  }

  /** Run an agent. Returns { sessionId, output }. */
  async runAgent(agentId, config = {}) {
    const id = config.openclawId || agentId;
    const message = config.message || 'Start agent task';
    const sessionId = config.sessionId || `session-${Date.now()}-${id}`;

    let cmd = `openclaw agent --local --json --agent ${esc(id)} --message ${esc(message)}`;
    if (config.sessionId) cmd += ` --session-id ${esc(config.sessionId)}`;

    console.log(`[OpenClawBridge] Running "${id}" — ${message.substring(0, 60)}`);
    const stdout = await this._run(cmd, sessionId);

    return { sessionId, status: 'completed', output: stdout };
  }

  /** Continue a multi-turn conversation. */
  async sendMessage(agentId, sessionId, message) {
    const cmd = `openclaw agent --local --json --agent ${esc(agentId)} --session-id ${esc(sessionId)} --message ${esc(message)}`;

    console.log(`[OpenClawBridge] Continuing "${agentId}" session ${sessionId.substring(0, 12)}...`);
    const stdout = await this._run(cmd, sessionId);

    return { sessionId, status: 'completed', output: stdout };
  }

  /** List registered agents. */
  async listAgents() {
    try {
      const stdout = await this._run('openclaw agents list --json');
      return JSON.parse(stdout);
    } catch (err) {
      console.warn('[OpenClawBridge] listAgents failed:', err.message);
      return [];
    }
  }

  /** Verify CLI is installed. */
  async testConnection() {
    try {
      const stdout = await this._run('openclaw --version', null, 10000);
      console.log('[OpenClawBridge] CLI version:', stdout.trim());
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Run a shell command string and return stdout.
   * @private
   */
  _run(cmd, sessionId, timeoutMs = TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';

      const timer = setTimeout(() => {
        proc.kill('SIGKILL');
        reject(new Error(`OpenClaw timed out after ${timeoutMs / 1000}s`));
      }, timeoutMs);

      proc.stdout.on('data', (d) => { stdout += d; });
      proc.stderr.on('data', (d) => { stderr += d; });

      proc.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve(stdout);
        else reject(new Error(`OpenClaw exit ${code}: ${stderr || stdout}`));
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        reject(new Error(`Failed to spawn openclaw: ${err.message}`));
      });
    });
  }

  /** Parse JSON output from `openclaw agent --json`. */
  static parseOutput(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      const meta = parsed.meta || {};
      const am = meta.agentMeta || {};
      const usage = am.usage || {};
      const base = {
        durationMs: meta.durationMs || null,
        tokensUsed: usage.total || ((usage.input || 0) + (usage.output || 0)),
        costUsd: (usage.input || 0) * 0.0000025 + (usage.output || 0) * 0.00001,
        sessionId: am.sessionId || null,
        model: am.model || null,
      };

      // Find the first payload with text across all payloads (not just index 0)
      const payloads = Array.isArray(parsed.payloads) ? parsed.payloads : [];
      const textPayload = payloads.find(p => p?.text);
      if (textPayload) {
        return { ...base, text: textPayload.text };
      }

      // No text payload — agent may have produced tool calls only.
      // Scan all payload content (including tool_result content) for JSON with "leads" array.
      const allContent = payloads.map(p => {
        if (typeof p?.content === 'string') return p.content;
        if (Array.isArray(p?.content)) return p.content.map(c => c?.text || '').join('\n');
        return '';
      }).join('\n');

      if (allContent.includes('"leads"')) {
        return { ...base, text: allContent };
      }

      // payloads empty or all tool calls with no leads data
      if (base.tokensUsed > 0) {
        return { ...base, text: `[Agent completed — ${base.tokensUsed} tokens, no text output]` };
      }

      return { text: jsonString, durationMs: null, tokensUsed: 0, costUsd: 0, sessionId: null, model: null };
    } catch {
      return { text: jsonString, durationMs: null, tokensUsed: 0, costUsd: 0, sessionId: null, model: null };
    }
  }
}

module.exports = new OpenClawBridge();
