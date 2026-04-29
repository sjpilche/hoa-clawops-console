/**
 * @file llmClient.js
 * @description Unified LLM client — extracted from Page Agent (@page-agent/llms).
 *
 * Supports:
 *   - Ollama native (/api/chat) — $0, local
 *   - OpenAI-compatible (/v1/chat/completions) — GPT-4o, Grok, Claude, etc.
 *   - Auto-detection: if baseURL contains ':11434', uses Ollama native format
 *
 * Features carried over from Page Agent:
 *   - Retry with classification (network, rate-limit, auth, context-length)
 *   - Token usage tracking (prompt, completion, cached, reasoning)
 *   - Model-specific patches (Claude tool_choice, Qwen temperature, etc.)
 *   - Error typing for caller decision-making
 *
 * USAGE:
 *   const { chat, chatJSON, InvokeError } = require('./llmClient');
 *
 *   // Simple chat
 *   const text = await chat('You are a helpful assistant', 'Hello');
 *
 *   // With options
 *   const result = await chat(systemPrompt, userMessage, {
 *     provider: 'ollama',      // 'ollama' | 'openai' (auto-detected if omitted)
 *     model: 'llama3.2:3b',
 *     temperature: 0.7,
 *     maxTokens: 2048,
 *     timeoutMs: 120000,
 *     maxRetries: 2,
 *     raw: true,               // return full result object instead of just text
 *   });
 *
 *   // JSON mode (parses JSON from response, strips markdown fences)
 *   const data = await chatJSON(systemPrompt, userMessage, { model: 'llama3.2:3b' });
 */

'use strict';

const http = require('http');
const https = require('https');

// ── Config defaults ────────────────────────────────────────────────────────

const OLLAMA_HOST = process.env.OLLAMA_HOST || '127.0.0.1';
const OLLAMA_PORT = parseInt(process.env.OLLAMA_PORT || '11434', 10);
const OLLAMA_DEFAULT_MODEL = process.env.OLLAMA_DEFAULT_MODEL || 'llama3.2:3b';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const DEFAULT_TIMEOUT = 120000;
// Ollama on CPU-only hardware (no GPU) is much slower than cloud providers.
// Big models (gemma4:26b, qwen3:14b) routinely need 3-10 minutes per call.
// Override with OLLAMA_TIMEOUT_MS env var.
const OLLAMA_TIMEOUT = parseInt(process.env.OLLAMA_TIMEOUT_MS) || 600000; // 10 min
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_TEMPERATURE = 0.7;

// ── Error types (from Page Agent) ──────────────────────────────────────────

const InvokeErrorType = {
  NETWORK_ERROR: 'network_error',
  RATE_LIMIT: 'rate_limit',
  SERVER_ERROR: 'server_error',
  AUTH_ERROR: 'auth_error',
  CONTEXT_LENGTH: 'context_length',
  CONTENT_FILTER: 'content_filter',
  TIMEOUT: 'timeout',
  PARSE_ERROR: 'parse_error',
  UNKNOWN: 'unknown',
};

const RETRYABLE = new Set([
  InvokeErrorType.NETWORK_ERROR,
  InvokeErrorType.RATE_LIMIT,
  InvokeErrorType.SERVER_ERROR,
  InvokeErrorType.TIMEOUT,
  InvokeErrorType.UNKNOWN,
]);

class InvokeError extends Error {
  constructor(type, message, rawError, rawResponse) {
    super(message);
    this.name = 'InvokeError';
    this.type = type;
    this.retryable = RETRYABLE.has(type);
    this.rawError = rawError;
    this.rawResponse = rawResponse;
  }
}

// ── HTTP helper ────────────────────────────────────────────────────────────

function httpPost(url, body, headers = {}, timeoutMs = DEFAULT_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === 'https:' ? https : http;
    const payload = JSON.stringify(body);

    const req = transport.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...headers,
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode, data, headers: res.headers });
      });
    });

    req.on('error', (err) => {
      reject(new InvokeError(InvokeErrorType.NETWORK_ERROR, `Network error: ${err.message}`, err));
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new InvokeError(InvokeErrorType.TIMEOUT, `Request timed out after ${timeoutMs / 1000}s`));
    });

    req.write(payload);
    req.end();
  });
}

// ── Model patches (from Page Agent utils.ts) ───────────────────────────────

function normalizeModelName(model) {
  let n = model.toLowerCase();
  if (n.includes('/')) n = n.split('/')[1];
  return n.replace(/[_.]/g, '');
}

function applyModelPatch(body) {
  const name = normalizeModelName(body.model || '');

  if (name.startsWith('qwen')) {
    body.temperature = Math.max(body.temperature || 0, 1.0);
  }

  if (name.startsWith('claude')) {
    body.thinking = { type: 'disabled' };
    if (body.tool_choice === 'required') {
      body.tool_choice = { type: 'any' };
    } else if (body.tool_choice?.function?.name) {
      body.tool_choice = { type: 'tool', name: body.tool_choice.function.name };
    }
  }

  if (name.startsWith('grok')) {
    delete body.tool_choice;
    body.thinking = { type: 'disabled', effort: 'minimal' };
    body.reasoning = { enabled: false, effort: 'low' };
  }
}

// ── Provider implementations ───────────────────────────────────────────────

/**
 * Call Ollama native /api/chat endpoint.
 */
async function callOllama(messages, opts) {
  const model = opts.model || OLLAMA_DEFAULT_MODEL;
  const host = opts.host || OLLAMA_HOST;
  const port = opts.port || OLLAMA_PORT;
  const url = `http://${host}:${port}/api/chat`;

  const body = {
    model,
    stream: false,
    messages,
    options: {
      temperature: opts.temperature ?? DEFAULT_TEMPERATURE,
      num_predict: opts.maxTokens || 2048,
    },
  };

  const startMs = Date.now();
  // Ollama needs longer timeouts than cloud providers (CPU inference is slow).
  const res = await httpPost(url, body, {}, opts.timeoutMs || OLLAMA_TIMEOUT);
  const durationMs = Date.now() - startMs;

  let parsed;
  try { parsed = JSON.parse(res.data); } catch {
    throw new InvokeError(InvokeErrorType.PARSE_ERROR, 'Failed to parse Ollama response', null, res.data);
  }

  if (res.status >= 400) {
    throw new InvokeError(
      res.status === 429 ? InvokeErrorType.RATE_LIMIT : InvokeErrorType.SERVER_ERROR,
      `Ollama ${res.status}: ${parsed?.error || res.data}`,
      null, parsed
    );
  }

  const text = parsed?.message?.content || parsed?.response || '';
  const estimatedTokens = Math.ceil(text.length / 4);

  return {
    text,
    model,
    provider: 'ollama',
    durationMs,
    usage: {
      promptTokens: parsed?.prompt_eval_count || Math.ceil(estimatedTokens * 0.4),
      completionTokens: parsed?.eval_count || Math.ceil(estimatedTokens * 0.6),
      totalTokens: (parsed?.prompt_eval_count || 0) + (parsed?.eval_count || 0) || estimatedTokens,
    },
    costUsd: 0,
    rawResponse: parsed,
  };
}

/**
 * Call OpenAI-compatible /chat/completions endpoint.
 * Works with: OpenAI, Grok, Claude (via proxy), Ollama /v1 mode, vLLM, etc.
 */
async function callOpenAI(messages, opts) {
  const model = opts.model || 'gpt-4o';
  const baseURL = opts.baseURL || OPENAI_BASE_URL;
  const apiKey = opts.apiKey || OPENAI_API_KEY;
  const url = `${baseURL.replace(/\/+$/, '')}/chat/completions`;

  const body = {
    model,
    temperature: opts.temperature ?? DEFAULT_TEMPERATURE,
    messages,
    max_tokens: opts.maxTokens || 2048,
  };

  applyModelPatch(body);

  const headers = {};
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const startMs = Date.now();
  const res = await httpPost(url, body, headers, opts.timeoutMs || DEFAULT_TIMEOUT);
  const durationMs = Date.now() - startMs;

  let parsed;
  try { parsed = JSON.parse(res.data); } catch {
    throw new InvokeError(InvokeErrorType.PARSE_ERROR, 'Failed to parse API response', null, res.data);
  }

  // Classify HTTP errors (from Page Agent OpenAIClient)
  if (res.status === 401 || res.status === 403) {
    throw new InvokeError(InvokeErrorType.AUTH_ERROR, `Auth failed: ${parsed?.error?.message || res.status}`, null, parsed);
  }
  if (res.status === 429) {
    throw new InvokeError(InvokeErrorType.RATE_LIMIT, `Rate limit: ${parsed?.error?.message || '429'}`, null, parsed);
  }
  if (res.status >= 500) {
    throw new InvokeError(InvokeErrorType.SERVER_ERROR, `Server error ${res.status}: ${parsed?.error?.message || ''}`, null, parsed);
  }
  if (res.status >= 400) {
    // Check for context length errors
    const msg = parsed?.error?.message || '';
    if (msg.includes('context_length') || msg.includes('maximum context') || msg.includes('too many tokens')) {
      throw new InvokeError(InvokeErrorType.CONTEXT_LENGTH, msg, null, parsed);
    }
    if (msg.includes('content_filter') || msg.includes('safety')) {
      throw new InvokeError(InvokeErrorType.CONTENT_FILTER, msg, null, parsed);
    }
    throw new InvokeError(InvokeErrorType.UNKNOWN, `HTTP ${res.status}: ${msg}`, null, parsed);
  }

  const choice = parsed?.choices?.[0];
  const text = choice?.message?.content || '';

  return {
    text,
    model,
    provider: 'openai',
    durationMs,
    usage: {
      promptTokens: parsed?.usage?.prompt_tokens || 0,
      completionTokens: parsed?.usage?.completion_tokens || 0,
      totalTokens: parsed?.usage?.total_tokens || 0,
      cachedTokens: parsed?.usage?.prompt_tokens_details?.cached_tokens,
      reasoningTokens: parsed?.usage?.completion_tokens_details?.reasoning_tokens,
    },
    finishReason: choice?.finish_reason,
    costUsd: 0, // Caller can compute from usage + model pricing
    rawResponse: parsed,
  };
}

// ── Retry wrapper (from Page Agent withRetry) ──────────────────────────────

async function withRetry(fn, maxRetries, label) {
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(100 * Math.pow(2, attempt - 1), 5000);
      console.log(`[LLM] Retry ${attempt}/${maxRetries} for ${label} (waiting ${delay}ms)`);
      await new Promise(r => setTimeout(r, delay));
    }

    try {
      return await fn();
    } catch (err) {
      // Don't retry non-retryable errors
      if (err instanceof InvokeError && !err.retryable) throw err;
      lastError = err;
      console.error(`[LLM] Attempt ${attempt + 1} failed:`, err.message);
    }
  }

  throw lastError;
}

// ── Auto-detect provider ───────────────────────────────────────────────────

function detectProvider(opts) {
  if (opts.provider) return opts.provider;
  if (opts.baseURL && opts.baseURL.includes(':11434')) return 'ollama';
  if (opts.model && (opts.model.includes('llama') || opts.model.includes('deepseek') || opts.model.includes('mistral') || opts.model.includes('qwen'))) {
    return 'ollama';
  }
  return 'openai';
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Send a chat completion. Returns text string (or full result if opts.raw=true).
 *
 * @param {string} systemPrompt - System message
 * @param {string} userMessage - User message
 * @param {object} [opts] - Options
 * @param {string} [opts.provider] - 'ollama' | 'openai' (auto-detected)
 * @param {string} [opts.model] - Model name
 * @param {number} [opts.temperature] - Temperature (default 0.7)
 * @param {number} [opts.maxTokens] - Max output tokens (default 2048)
 * @param {number} [opts.timeoutMs] - Timeout (default 120000)
 * @param {number} [opts.maxRetries] - Retries (default 2)
 * @param {boolean} [opts.raw] - Return full result object
 * @param {string} [opts.baseURL] - OpenAI base URL
 * @param {string} [opts.apiKey] - API key
 * @returns {Promise<string|object>}
 */
async function chat(systemPrompt, userMessage, opts = {}) {
  const provider = detectProvider(opts);
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const label = `${provider}/${opts.model || 'default'}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  const result = await withRetry(
    () => provider === 'ollama' ? callOllama(messages, opts) : callOpenAI(messages, opts),
    maxRetries,
    label
  );

  return opts.raw ? result : result.text;
}

/**
 * Chat + parse JSON from response. Strips markdown code fences.
 * Returns parsed object, or null on parse failure.
 */
async function chatJSON(systemPrompt, userMessage, opts = {}) {
  const raw = await chat(systemPrompt, userMessage, { ...opts, raw: true });
  const text = raw.text || '';

  let cleaned = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');

  // Find the first JSON structure
  let start = -1;
  if (firstBrace >= 0 && firstBracket >= 0) start = Math.min(firstBrace, firstBracket);
  else if (firstBrace >= 0) start = firstBrace;
  else if (firstBracket >= 0) start = firstBracket;

  if (start > 0) cleaned = cleaned.slice(start);

  let parsed = null;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Try to extract JSON with regex fallback
    const m = cleaned.match(/[\[{][\s\S]*[\]}]/);
    if (m) try { parsed = JSON.parse(m[0]); } catch {}
  }

  if (opts.raw) {
    return { ...raw, parsed };
  }
  return parsed;
}

/**
 * Multi-turn chat with full message array.
 */
async function chatMessages(messages, opts = {}) {
  const provider = detectProvider(opts);
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const label = `${provider}/${opts.model || 'default'}`;

  const result = await withRetry(
    () => provider === 'ollama' ? callOllama(messages, opts) : callOpenAI(messages, opts),
    maxRetries,
    label
  );

  return opts.raw ? result : result.text;
}

/**
 * Check if Ollama is reachable and list models.
 */
async function pingOllama(host, port) {
  const h = host || OLLAMA_HOST;
  const p = port || OLLAMA_PORT;

  return new Promise((resolve) => {
    const req = http.get(`http://${h}:${p}/api/tags`, { timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ ok: true, models: (parsed.models || []).map(m => m.name) });
        } catch {
          resolve({ ok: true, models: [] });
        }
      });
    });
    req.on('error', () => resolve({ ok: false, models: [] }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, models: [] }); });
  });
}

/**
 * Check if a specific Ollama model is available.
 */
async function isModelAvailable(model) {
  const result = await pingOllama();
  return result.ok && result.models.some(m => m.startsWith(model.split(':')[0]));
}

// ── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  chat,
  chatJSON,
  chatMessages,
  pingOllama,
  isModelAvailable,
  InvokeError,
  InvokeErrorType,

  // Re-export constants for callers
  OLLAMA_DEFAULT_MODEL,
  OLLAMA_HOST,
  OLLAMA_PORT,
};
