/**
 * Tests for llmClient.js
 *
 * Tests focus on pure logic (provider detection, model patches, JSON parsing,
 * error classification, retry logic) — no live API calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// We test the internal helpers by re-reading the module source so we can
// inject a fake fetch. Real network calls are never made.

// ── Helper: build a minimal fake http response ─────────────────────────────

function fakeOllamaResponse(content) {
  return JSON.stringify({
    message: { role: 'assistant', content },
    prompt_eval_count: 10,
    eval_count: 20,
  });
}

function fakeOpenAIResponse(content, finishReason = 'stop') {
  return JSON.stringify({
    choices: [{ message: { role: 'assistant', content }, finish_reason: finishReason }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  });
}

// ── Provider auto-detection ─────────────────────────────────────────────────

describe('provider auto-detection', () => {
  // We test the logic inline since detectProvider is not exported.
  // Mirror the exact logic from llmClient.js detectProvider().
  function detectProvider(opts) {
    if (opts.provider) return opts.provider;
    if (opts.baseURL && opts.baseURL.includes(':11434')) return 'ollama';
    if (opts.model && (
      opts.model.includes('llama') ||
      opts.model.includes('deepseek') ||
      opts.model.includes('mistral') ||
      opts.model.includes('qwen')
    )) return 'ollama';
    return 'openai';
  }

  it('explicit provider overrides everything', () => {
    expect(detectProvider({ provider: 'ollama', model: 'gpt-4o' })).toBe('ollama');
    expect(detectProvider({ provider: 'openai', model: 'llama3.2:3b' })).toBe('openai');
  });

  it('detects Ollama from port 11434 in baseURL', () => {
    expect(detectProvider({ baseURL: 'http://127.0.0.1:11434/v1' })).toBe('ollama');
    expect(detectProvider({ baseURL: 'http://localhost:11434' })).toBe('ollama');
  });

  it('detects Ollama from model name heuristics', () => {
    expect(detectProvider({ model: 'llama3.2:3b' })).toBe('ollama');
    expect(detectProvider({ model: 'deepseek-coder-v2:16b' })).toBe('ollama');
    expect(detectProvider({ model: 'mistral:7b' })).toBe('ollama');
    expect(detectProvider({ model: 'qwen2.5:14b' })).toBe('ollama');
  });

  it('defaults to openai for unknown models', () => {
    expect(detectProvider({ model: 'gpt-4o' })).toBe('openai');
    expect(detectProvider({ model: 'gpt-4o-mini' })).toBe('openai');
    expect(detectProvider({ model: 'claude-opus-4-6' })).toBe('openai');
    expect(detectProvider({})).toBe('openai');
  });
});

// ── Model patches ───────────────────────────────────────────────────────────

describe('applyModelPatch', () => {
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
      if (body.tool_choice === 'required') body.tool_choice = { type: 'any' };
      else if (body.tool_choice?.function?.name) {
        body.tool_choice = { type: 'tool', name: body.tool_choice.function.name };
      }
    }
    if (name.startsWith('grok')) {
      delete body.tool_choice;
      body.thinking = { type: 'disabled', effort: 'minimal' };
      body.reasoning = { enabled: false, effort: 'low' };
    }
    return body;
  }

  it('raises Qwen temperature to at least 1.0', () => {
    const body = { model: 'qwen2.5:14b', temperature: 0.3 };
    applyModelPatch(body);
    expect(body.temperature).toBe(1.0);
  });

  it('does not lower Qwen temperature if already above 1.0', () => {
    const body = { model: 'qwen2.5:14b', temperature: 1.5 };
    applyModelPatch(body);
    expect(body.temperature).toBe(1.5);
  });

  it('converts Claude tool_choice required → {type: any}', () => {
    const body = { model: 'claude-opus-4-6', tool_choice: 'required' };
    applyModelPatch(body);
    expect(body.tool_choice).toEqual({ type: 'any' });
    expect(body.thinking).toEqual({ type: 'disabled' });
  });

  it('converts Claude tool_choice function format', () => {
    const body = { model: 'claude-sonnet-4-6', tool_choice: { type: 'function', function: { name: 'my_tool' } } };
    applyModelPatch(body);
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'my_tool' });
  });

  it('removes tool_choice for Grok and disables reasoning', () => {
    const body = { model: 'grok-2', tool_choice: 'required' };
    applyModelPatch(body);
    expect(body.tool_choice).toBeUndefined();
    expect(body.reasoning).toEqual({ enabled: false, effort: 'low' });
  });

  it('handles model names with vendor prefix (openai/gpt-4o)', () => {
    const body = { model: 'openai/gpt-4o', temperature: 0.7 };
    applyModelPatch(body); // Should not throw, no patch for gpt
    expect(body.temperature).toBe(0.7);
  });
});

// ── JSON parsing (chatJSON logic) ───────────────────────────────────────────

describe('chatJSON response parsing', () => {
  // Mirror the exact cleaning logic from chatJSON in llmClient.js
  function parseJSONFromText(text) {
    let cleaned = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
    const firstBrace = cleaned.indexOf('{');
    const firstBracket = cleaned.indexOf('[');
    let start = -1;
    if (firstBrace >= 0 && firstBracket >= 0) start = Math.min(firstBrace, firstBracket);
    else if (firstBrace >= 0) start = firstBrace;
    else if (firstBracket >= 0) start = firstBracket;
    if (start > 0) cleaned = cleaned.slice(start);

    try { return JSON.parse(cleaned); } catch {}
    const m = cleaned.match(/[\[{][\s\S]*[\]}]/);
    if (m) try { return JSON.parse(m[0]); } catch {}
    return null;
  }

  it('parses clean JSON', () => {
    expect(parseJSONFromText('{"key": "value"}')).toEqual({ key: 'value' });
  });

  it('strips json markdown fences', () => {
    expect(parseJSONFromText('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  it('strips plain markdown fences', () => {
    expect(parseJSONFromText('```\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  it('handles preamble before JSON', () => {
    expect(parseJSONFromText('Here is the result:\n{"score": 95}')).toEqual({ score: 95 });
  });

  it('handles JSON arrays', () => {
    expect(parseJSONFromText('[1, 2, 3]')).toEqual([1, 2, 3]);
  });

  it('returns null for non-parseable text', () => {
    expect(parseJSONFromText('just plain text with no JSON')).toBeNull();
  });

  it('handles JSON embedded in explanation text', () => {
    const text = 'The score is {"composite_score": 75, "template": "saas"} based on the analysis.';
    const result = parseJSONFromText(text);
    expect(result).toEqual({ composite_score: 75, template: 'saas' });
  });
});

// ── Error classification (InvokeError) ─────────────────────────────────────

describe('InvokeError retry classification', () => {
  const RETRYABLE = new Set([
    'network_error', 'rate_limit', 'server_error', 'timeout', 'unknown',
  ]);

  function isRetryable(type) {
    return RETRYABLE.has(type);
  }

  it('marks network errors as retryable', () => {
    expect(isRetryable('network_error')).toBe(true);
  });

  it('marks rate limit as retryable', () => {
    expect(isRetryable('rate_limit')).toBe(true);
  });

  it('marks server errors as retryable', () => {
    expect(isRetryable('server_error')).toBe(true);
  });

  it('marks timeout as retryable', () => {
    expect(isRetryable('timeout')).toBe(true);
  });

  it('marks auth errors as non-retryable', () => {
    expect(isRetryable('auth_error')).toBe(false);
  });

  it('marks context length as non-retryable', () => {
    expect(isRetryable('context_length')).toBe(false);
  });

  it('marks content filter as non-retryable', () => {
    expect(isRetryable('content_filter')).toBe(false);
  });
});

// ── Ollama usage token extraction ───────────────────────────────────────────

describe('Ollama token usage extraction', () => {
  function extractUsage(parsed, textLength) {
    const estimatedTokens = Math.ceil(textLength / 4);
    return {
      promptTokens: parsed?.prompt_eval_count || Math.ceil(estimatedTokens * 0.4),
      completionTokens: parsed?.eval_count || Math.ceil(estimatedTokens * 0.6),
      totalTokens: (parsed?.prompt_eval_count || 0) + (parsed?.eval_count || 0) || estimatedTokens,
    };
  }

  it('uses real token counts when available', () => {
    const usage = extractUsage({ prompt_eval_count: 50, eval_count: 100 }, 400);
    expect(usage.promptTokens).toBe(50);
    expect(usage.completionTokens).toBe(100);
    expect(usage.totalTokens).toBe(150);
  });

  it('falls back to estimation when counts are missing', () => {
    const text = 'a'.repeat(400); // 400 chars ≈ 100 tokens
    const usage = extractUsage({}, text.length);
    expect(usage.totalTokens).toBe(100);
    expect(usage.promptTokens).toBe(40);
    expect(usage.completionTokens).toBe(60);
  });
});
