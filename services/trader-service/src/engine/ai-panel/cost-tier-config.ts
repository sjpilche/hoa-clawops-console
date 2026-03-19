// =============================================================================
// Cost Tier System — Analyst → LLM Assignment with Fallbacks
// =============================================================================
// Panel runs every 30 minutes (not 3min) — Ollama latency is acceptable.
//
// Tier 0: Ollama — Value Hunter, Momentum Scanner, Risk Sentinel ($0/call)
// Tier 2: Grok-3-mini (~$0.003/call) — Special Situations (needs real-time X)
//
// Cost at 13 runs/market day:
//   Ollama × 3:     $0.00/day
//   Grok-3-mini:    ~$0.04/day
//   Monthly:        ~$0.80/month
// =============================================================================

import { AnalystConfig, LLMProvider } from './index';
import {
  VALUE_HUNTER,
  MOMENTUM_SCANNER,
  SPECIAL_SITUATIONS,
  RISK_SENTINEL,
  DEFAULT_PANEL_CONFIG,
} from './analyst-prompts';

// -----------------------------------------------------------------------------
// Cost Tier Definitions
// -----------------------------------------------------------------------------

export type CostTier = 0 | 1 | 2;

export interface TieredAnalystConfig extends AnalystConfig {
  costTier: CostTier;
  fallbackProvider: LLMProvider;
  fallbackModel: string;
}

// -----------------------------------------------------------------------------
// Tiered Analyst Configs
// -----------------------------------------------------------------------------

/** Value Hunter — Tier 0 (Ollama, $0/call). Panel runs every 30min so
 *  local inference latency is acceptable. Falls back to GPT-4o-mini. */
export const TIERED_VALUE_HUNTER: TieredAnalystConfig = {
  ...VALUE_HUNTER,
  provider: 'ollama',
  model: process.env.OLLAMA_VALUE_MODEL || process.env.OLLAMA_DEFAULT_MODEL || 'llama3.2:3b',
  costTier: 0,
  fallbackProvider: 'openai',
  fallbackModel: 'gpt-4o-mini',
};

/** Momentum Scanner — Tier 0 (Ollama, $0/call). Technical pattern recognition
 *  works well with local models at 30min cadence. Falls back to GPT-4o-mini. */
export const TIERED_MOMENTUM_SCANNER: TieredAnalystConfig = {
  ...MOMENTUM_SCANNER,
  provider: 'ollama',
  model: process.env.OLLAMA_DEFAULT_MODEL || 'llama3.2:3b',
  costTier: 0,
  fallbackProvider: 'openai',
  fallbackModel: 'gpt-4o-mini',
};

/** Special Situations — Tier 2 (grok-3-mini, ~$0.003/call). Needs real-time X/Twitter
 *  for early catalyst detection. Cannot use Ollama (no live web access). */
export const TIERED_SPECIAL_SITUATIONS: TieredAnalystConfig = {
  ...SPECIAL_SITUATIONS,
  provider: 'grok',
  model: 'grok-3-mini',
  costTier: 2,
  fallbackProvider: 'grok',
  fallbackModel: 'grok-3-mini',
};

/** Risk Sentinel — Tier 0 (Ollama, $0/call). Defensive/risk analysis is
 *  well within local model capability. Falls back to GPT-4o-mini. */
export const TIERED_RISK_SENTINEL: TieredAnalystConfig = {
  ...RISK_SENTINEL,
  provider: 'ollama',
  model: process.env.OLLAMA_RISK_MODEL || process.env.OLLAMA_DEFAULT_MODEL || 'llama3.2:3b',
  costTier: 0,
  fallbackProvider: 'openai',
  fallbackModel: 'gpt-4o-mini',
};

// -----------------------------------------------------------------------------
// All tiered analysts, grouped by execution order
// -----------------------------------------------------------------------------

/** Tier 0 analysts — run sequentially via Ollama (free, ~5-15s each at 30min cadence) */
export const TIER_0_ANALYSTS: TieredAnalystConfig[] = [
  TIERED_VALUE_HUNTER,
  TIERED_MOMENTUM_SCANNER,
  TIERED_RISK_SENTINEL,
];

/** Tier 1 analysts — none currently (all moved to Ollama Tier 0) */
export const TIER_1_ANALYSTS: TieredAnalystConfig[] = [];

/** Tier 2 analysts — run in parallel via premium API */
export const TIER_2_ANALYSTS: TieredAnalystConfig[] = [
  TIERED_SPECIAL_SITUATIONS,
];

/** All tiered analysts in execution order (Tier 0 first, then 1+2 in parallel) */
export const ALL_TIERED_ANALYSTS: TieredAnalystConfig[] = [
  ...TIER_0_ANALYSTS,
  ...TIER_1_ANALYSTS,
  ...TIER_2_ANALYSTS,
];

// -----------------------------------------------------------------------------
// Execution helpers
// -----------------------------------------------------------------------------

/**
 * Get analysts grouped by tier for the runner to execute correctly:
 * - Tier 0: sequential (Ollama — one at a time to avoid RAM pressure)
 * - Tier 2: parallel (Grok API — fast, one call)
 */
export function getAnalystsByExecutionGroup(): {
  sequential: TieredAnalystConfig[];
  parallel: TieredAnalystConfig[];
} {
  return {
    sequential: TIER_0_ANALYSTS,
    parallel: [...TIER_1_ANALYSTS, ...TIER_2_ANALYSTS],
  };
}

/**
 * Build fallback config for an analyst when primary provider fails
 */
export function getFallbackConfig(analyst: TieredAnalystConfig): TieredAnalystConfig {
  return {
    ...analyst,
    provider: analyst.fallbackProvider,
    model: analyst.fallbackModel,
  };
}

// -----------------------------------------------------------------------------
// Cost estimation per run
// -----------------------------------------------------------------------------

/** Estimated cost per full panel run (4 analysts, 30min interval = 13 runs/market day) */
export const ESTIMATED_COST_PER_RUN = {
  tier0: 0,             // Ollama × 3: $0/call
  tier1: 0,             // No Tier 1 analysts
  tier2: 0.003,         // grok-3-mini: ~$0.003/call
  total: 0.003,         // ~$0.003/run (10× cheaper than before)
  daily13Runs: 0.039,   // 13 runs/day × $0.003
  monthlyEstimate: 0.82, // ~$0.82/month (21 trading days)
};

// -----------------------------------------------------------------------------
// Panel config (replaces both DEFAULT_PANEL_CONFIG and GROK_PANEL_CONFIG)
// -----------------------------------------------------------------------------

export const TIERED_PANEL_CONFIG = {
  ...DEFAULT_PANEL_CONFIG,
  minScoreToAct: 40,          // Lowered from 50: single-analyst conviction 2/5 = score 40. Start trading to learn.
  minTradeThreshold: 0.015,   // Lowered from 0.02 — allow trades with 1.5%+ weight change
};

// -----------------------------------------------------------------------------
// .env.trader overrides (checked at runtime)
// -----------------------------------------------------------------------------
// OLLAMA_DEFAULT_MODEL=llama3.2:3b    — default model for Tier 0 analysts
// OLLAMA_VALUE_MODEL=qwen2.5:7b       — override for Value Hunter specifically
// OLLAMA_RISK_MODEL=llama3.2:3b       — override for Risk Sentinel specifically
// PANEL_COST_MODE=free|hybrid|premium — override tier assignments (future)
