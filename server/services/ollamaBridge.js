/**
 * @file ollamaBridge.js
 * @description Local Ollama execution bridge — mirrors openclawBridge interface.
 *
 * Agents tagged with `use_ollama: true` in their config JSON route here instead
 * of through the OpenClaw CLI. Zero API cost — runs llama3.2:3b (or any model
 * loaded in the local Ollama instance at localhost:11434).
 *
 * INTERFACE COMPATIBILITY:
 *   runAgent(agentId, config) → { sessionId, status, output }
 *   output format matches OpenClaw bridge: { payloads: [{ text }], meta: { durationMs, agentMeta: { usage } } }
 *
 * BEST SUITED FOR:
 *   - Daily debrief, morning digest (text formatting only)
 *   - Reply classifier (regex already handles this — Ollama for edge cases)
 *   - Follow-up drafts (quality acceptable for position 2 emails)
 *   - Analytics summaries, content repurposing
 *
 * NOT suitable for: lead scout (needs web_search tool), contact enricher ($0 anyway),
 *   meeting booker (high-stakes, needs GPT-4o quality).
 */

'use strict';

const { chat: llmChat, pingOllama } = require('./llmClient');

const DEFAULT_MODEL = process.env.OLLAMA_DEFAULT_MODEL || 'llama3.2:3b';
const CODER_MODEL = process.env.OLLAMA_CODER_MODEL || 'deepseek-coder-v2:16b';
// Ollama on CPU-only hardware (no usable VRAM) routinely needs 3-10 min
// per call for 14B+ models. Override via OLLAMA_TIMEOUT_MS env var.
const TIMEOUT_MS = parseInt(process.env.OLLAMA_TIMEOUT_MS) || 600000;

// ── Check if Ollama is reachable ──────────────────────────────────────────────
async function ping() {
  return pingOllama();
}

// ── Load founder mandate — injected into every agent's system prompt ──────────
let _cachedMandate = null;
function loadFounderMandate() {
  if (_cachedMandate !== null) return _cachedMandate;
  const path = require('path');
  const fs = require('fs');
  const mandatePath = path.join(process.cwd(), 'founder', 'agent_mandate.md');
  try {
    if (fs.existsSync(mandatePath)) {
      _cachedMandate = '\n\n---\n## FOUNDER MANDATE (Always Active)\n' + fs.readFileSync(mandatePath, 'utf-8').trim();
      return _cachedMandate;
    }
  } catch {}
  _cachedMandate = '';
  return _cachedMandate;
}

// ── Read agent SOUL.md for system prompt ─────────────────────────────────────
function loadSoulMd(agentName) {
  const path = require('path');
  const fs = require('fs');

  // Try standard workspace path relative to project root
  const candidates = [
    path.join(process.cwd(), 'openclaw-skills', agentName, 'SOUL.md'),
    path.join(process.cwd(), 'openclaw-skills', agentName.replace(/-/g, '_'), 'SOUL.md'),
  ];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8').trim() + loadFounderMandate();
    } catch {}
  }

  return `You are ${agentName}, a specialized AI agent. Complete your task carefully and return a useful result.` + loadFounderMandate();
}

// ── Format output to match OpenClaw bridge format ─────────────────────────────
function formatOutput(text, durationMs, model) {
  // Rough token estimate: ~4 chars per token
  const estimatedTokens = Math.ceil((text || '').length / 4);
  return JSON.stringify({
    payloads: [{ text: text || '' }],
    meta: {
      durationMs,
      agentMeta: {
        model,
        usage: {
          input: Math.ceil(estimatedTokens * 0.4),
          output: Math.ceil(estimatedTokens * 0.6),
          total: estimatedTokens,
        },
      },
    },
  });
}

// ── Main bridge class (same interface as openclawBridge) ──────────────────────
class OllamaBridge {
  constructor() {
    const host = process.env.OLLAMA_HOST || '127.0.0.1';
    const port = process.env.OLLAMA_PORT || '11434';
    console.log(`[OllamaBridge] Ready — local Ollama at ${host}:${port}`);
  }

  /**
   * Run an agent via Ollama. Returns { sessionId, status, output }.
   * Output format matches OpenClaw JSON format for seamless parseOutput() compatibility.
   */
  async runAgent(agentId, config = {}) {
    const model = config.ollamaModel || DEFAULT_MODEL;
    const message = config.message || 'Start agent task';
    const sessionId = config.sessionId || `ollama-${Date.now()}-${agentId}`;
    const startTime = Date.now();

    // Load SOUL.md as system prompt (same as OpenClaw does)
    const systemPrompt = loadSoulMd(agentId);

    console.log(`[OllamaBridge] Running "${agentId}" via ${model} — ${message.substring(0, 60)}`);

    const text = await llmChat(systemPrompt, message, {
      model, provider: 'ollama', temperature: 0.7, maxTokens: 2048, timeoutMs: TIMEOUT_MS,
    });
    const durationMs = Date.now() - startTime;

    console.log(`[OllamaBridge] ✅ "${agentId}" — ${durationMs}ms, ~${Math.ceil(text.length / 4)} tokens`);

    return {
      sessionId,
      status: 'completed',
      output: formatOutput(text, durationMs, model),
    };
  }

  /** Check Ollama availability + loaded models. */
  async testConnection() {
    const result = await ping();
    if (result.ok) {
      console.log(`[OllamaBridge] Connected — models: ${result.models.join(', ')}`);
    }
    return result.ok;
  }

  /** List available models. */
  async listModels() {
    const result = await ping();
    return result.models || [];
  }

  /** Reuse OpenClaw's parseOutput — format is identical. */
  static parseOutput(jsonString) {
    const openclawBridge = require('./openclawBridge');
    return openclawBridge.constructor.parseOutput(jsonString);
  }
}

// ── Exports ───────────────────────────────────────────────────────────────────
const bridge = new OllamaBridge();

module.exports = bridge;
module.exports.ping = ping;
module.exports.OllamaBridge = OllamaBridge;
module.exports.CODER_MODEL = CODER_MODEL;
