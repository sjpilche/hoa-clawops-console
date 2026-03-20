/**
 * @file openclawBridge.js
 * @description Runs OpenClaw agents via the CLI.
 *
 * Command: openclaw agent --local --json --agent <id> --message "<msg>"
 */

const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs');

const TIMEOUT_MS = parseInt(process.env.MAX_DURATION_PER_RUN || '600', 10) * 1000;

// ── Load founder mandate — workspace-specific if available, else global ───────
let _cachedMandate = null;
const _workspaceMandateCache = {};

function loadFounderMandate() {
  if (_cachedMandate !== null) return _cachedMandate;
  const mandatePath = path.join(process.cwd(), 'founder', 'agent_mandate.md');
  try {
    if (fs.existsSync(mandatePath)) {
      _cachedMandate = '\n\n---\n[FOUNDER MANDATE]\n' + fs.readFileSync(mandatePath, 'utf-8').trim();
      return _cachedMandate;
    }
  } catch {}
  _cachedMandate = '';
  return _cachedMandate;
}

/**
 * Load workspace-specific mandate if it exists, else fall back to global.
 * Workspace mandates live in openclaw-skills/workspaces/{slug}/MANDATE.md
 */
function loadWorkspaceMandate(workspaceSlug) {
  if (!workspaceSlug) return loadFounderMandate();
  if (_workspaceMandateCache[workspaceSlug] !== undefined) return _workspaceMandateCache[workspaceSlug];

  const wsPath = path.join(process.cwd(), 'openclaw-skills', 'workspaces', workspaceSlug, 'MANDATE.md');
  try {
    if (fs.existsSync(wsPath)) {
      _workspaceMandateCache[workspaceSlug] = '\n\n---\n[WORKSPACE MANDATE: ' + workspaceSlug.toUpperCase() + ']\n' + fs.readFileSync(wsPath, 'utf-8').trim();
      return _workspaceMandateCache[workspaceSlug];
    }
  } catch {}
  // Fall back to global
  _workspaceMandateCache[workspaceSlug] = loadFounderMandate();
  return _workspaceMandateCache[workspaceSlug];
}

/** Shell-escape a value by wrapping in double quotes and escaping inner quotes. */
function esc(val) {
  return '"' + String(val).replace(/"/g, '\\"') + '"';
}

class OpenClawBridge extends EventEmitter {
  constructor() {
    super();
    console.log('[OpenClawBridge] Ready (openclaw-cli mode)');
  }

  /** Run an agent. Returns { sessionId, output }. config.workspaceSlug injects workspace mandate. */
  async runAgent(agentId, config = {}) {
    const id = config.openclawId || agentId;
    const message = config.message || 'Start agent task';
    const sessionId = config.sessionId || `session-${Date.now()}-${id}`;

    // Inject workspace mandate if provided, else detect from agent name prefix
    const wsSlug = config.workspaceSlug
      || (id.startsWith('data-rehab') ? 'data-rehab' : null)
      || (id.startsWith('owen') ? 'owen' : null)
      || (id.startsWith('hoa-') ? 'hoa' : null)
      || (id.startsWith('jake') ? 'jake' : null);
    const fullMessage = message + loadWorkspaceMandate(wsSlug);
    // Windows CLI has 8191 char limit. Truncate and sanitize for shell safety.
    const safeMessage = fullMessage
      .replace(/[\r\n]+/g, ' ')       // No newlines (breaks shell args)
      .replace(/[""]/g, "'")           // Smart quotes → simple quotes
      .replace(/`/g, "'")             // Backticks → quotes
      .slice(0, 4000);                 // Stay well under limit
    let cmd = `openclaw agent --local --json --agent ${esc(id)} --message ${esc(safeMessage)}`;
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

  /**
   * Register a new agent workspace.
   * The skill directory (openclaw-skills/<name>/) should already exist with SOUL.md.
   * This returns the expected shape so the API route can store openclaw_id + workspace.
   */
  async createAgent(name, { soulDocument } = {}) {
    const workspace = `openclaw-skills/${name}`;
    const workspacePath = path.join(process.cwd(), workspace);

    // Write SOUL.md if provided and workspace exists (with audit trail)
    if (soulDocument && fs.existsSync(workspacePath)) {
      const soulPath = path.join(workspacePath, 'SOUL.md');
      const existedBefore = fs.existsSync(soulPath);
      const oldSize = existedBefore ? fs.statSync(soulPath).size : 0;

      fs.writeFileSync(soulPath, soulDocument, 'utf-8');
      console.log(`[OpenClawBridge] Wrote SOUL.md to ${workspacePath}`);

      // Audit log — SOUL.md modification is a governance-sensitive action
      try {
        const { run: dbRun } = require('../db/connection');
        dbRun(
          `INSERT INTO audit_log (id, action, resource, details, outcome) VALUES (lower(hex(randomblob(16))), 'soul_modified', ?, ?, 'success')`,
          [
            `agent:${name}`,
            JSON.stringify({ agent: name, existed_before: existedBefore, old_size: oldSize, new_size: soulDocument.length, workspace }),
          ]
        );
      } catch {}
    }

    console.log(`[OpenClawBridge] Registered agent "${name}" → ${workspace}`);
    return { openclawId: name, workspace };
  }

  /**
   * Schedule an agent for cron execution.
   * Scheduling is handled by the schedules table + scheduleRunner.js,
   * so this just returns confirmation.
   */
  async scheduleAgent(agentId, { cron, message, name, timezone } = {}) {
    console.log(`[OpenClawBridge] Schedule registered for "${agentId}": ${cron} (${timezone || 'UTC'})`);
    return { scheduled: true, cron, timezone: timezone || 'UTC' };
  }

  /**
   * Remove an agent's schedule.
   */
  async unscheduleAgent(agentId) {
    console.log(`[OpenClawBridge] Unscheduled agent "${agentId}"`);
    return { unscheduled: true };
  }

  /**
   * Write/update SOUL.md for an agent.
   */
  async writeSoulDocument(agentId, content) {
    const soulPath = path.join(process.cwd(), 'openclaw-skills', agentId, 'SOUL.md');
    if (fs.existsSync(path.dirname(soulPath))) {
      fs.writeFileSync(soulPath, content, 'utf-8');
      console.log(`[OpenClawBridge] Updated SOUL.md for "${agentId}"`);
      return { updated: true };
    }
    throw new Error(`Workspace not found for agent "${agentId}"`);
  }

  /**
   * Remove an agent workspace.
   */
  async removeAgent(agentId) {
    console.log(`[OpenClawBridge] Agent "${agentId}" removed from registry`);
    return { removed: true };
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
