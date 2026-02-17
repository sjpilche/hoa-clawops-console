// =============================================================================
// LLM Client — Unified interface for Claude, OpenAI, and Grok
// =============================================================================
// Each analyst can use a different LLM. This normalizes the API differences.
// API keys come from environment variables (never hardcoded).
// =============================================================================

import { LLMProvider, LLMRequest, LLMResponse } from '../types';

export class LLMClient {
  private apiKeys: Record<LLMProvider, string>;

  constructor() {
    this.apiKeys = {
      claude: process.env.ANTHROPIC_API_KEY || '',
      openai: process.env.OPENAI_API_KEY || '',
      grok: process.env.GROK_API_KEY || '',
    };
  }

  async call(request: LLMRequest): Promise<LLMResponse> {
    const start = Date.now();

    switch (request.provider) {
      case 'claude':
        return this.callClaude(request, start);
      case 'openai':
        return this.callOpenAI(request, start);
      case 'grok':
        return this.callGrok(request, start);
      default:
        throw new Error(`Unknown provider: ${request.provider}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Claude (Anthropic)
  // ---------------------------------------------------------------------------
  private async callClaude(req: LLMRequest, start: number): Promise<LLMResponse> {
    const apiKey = this.apiKeys.claude;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: req.model || 'claude-sonnet-4-20250514',
        max_tokens: req.maxTokens || 4096,
        temperature: req.temperature ?? 0.3,
        system: req.systemPrompt,
        messages: [{ role: 'user', content: req.userPrompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Claude API error ${response.status}: ${err}`);
    }

    const data = await response.json();
    const text = data.content?.map((c: any) => c.text || '').join('') || '';

    return {
      content: text,
      promptTokens: data.usage?.input_tokens || 0,
      completionTokens: data.usage?.output_tokens || 0,
      latencyMs: Date.now() - start,
    };
  }

  // ---------------------------------------------------------------------------
  // OpenAI (GPT-4o, etc.)
  // ---------------------------------------------------------------------------
  private async callOpenAI(req: LLMRequest, start: number): Promise<LLMResponse> {
    const apiKey = this.apiKeys.openai;
    if (!apiKey) throw new Error('OPENAI_API_KEY not set');

    const body: any = {
      model: req.model || 'gpt-4o',
      max_tokens: req.maxTokens || 4096,
      temperature: req.temperature ?? 0.3,
      messages: [
        { role: 'system', content: req.systemPrompt },
        { role: 'user', content: req.userPrompt },
      ],
    };

    if (req.responseFormat === 'json') {
      body.response_format = { type: 'json_object' };
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${err}`);
    }

    const data = await response.json();

    return {
      content: data.choices?.[0]?.message?.content || '',
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      latencyMs: Date.now() - start,
    };
  }

  // ---------------------------------------------------------------------------
  // Grok (xAI) — uses OpenAI-compatible API
  // ---------------------------------------------------------------------------
  private async callGrok(req: LLMRequest, start: number): Promise<LLMResponse> {
    const apiKey = this.apiKeys.grok;
    if (!apiKey) throw new Error('GROK_API_KEY not set');

    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: req.model || 'grok-3',
        max_tokens: req.maxTokens || 4096,
        temperature: req.temperature ?? 0.3,
        messages: [
          { role: 'system', content: req.systemPrompt },
          { role: 'user', content: req.userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Grok API error ${response.status}: ${err}`);
    }

    const data = await response.json();

    return {
      content: data.choices?.[0]?.message?.content || '',
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      latencyMs: Date.now() - start,
    };
  }

  // ---------------------------------------------------------------------------
  // Cost estimation
  // ---------------------------------------------------------------------------
  estimateCost(provider: LLMProvider, model: string, promptTokens: number, completionTokens: number): number {
    // Approximate pricing per 1M tokens as of early 2026
    const pricing: Record<string, { input: number; output: number }> = {
      'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
      'claude-haiku-4-5-20251001': { input: 0.80, output: 4.0 },
      'gpt-4o': { input: 2.50, output: 10.0 },
      'gpt-4o-mini': { input: 0.15, output: 0.60 },
      'grok-3': { input: 3.0, output: 15.0 },
      'grok-3-mini': { input: 0.30, output: 0.50 },
    };

    const rates = pricing[model] || { input: 5.0, output: 15.0 };
    return (promptTokens * rates.input + completionTokens * rates.output) / 1_000_000;
  }
}
