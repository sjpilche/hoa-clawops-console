// =============================================================================
// Cost Tier System — Analyst → LLM Assignment with Fallbacks
// =============================================================================
// Tier 0: Ollama (free, local) — Value Hunter + Risk Sentinel
// Tier 1: GPT-4o-mini (~$0.003/call) — Momentum Scanner
// Tier 2: Grok (~$0.015/call) — Special Situations (needs real-time X)
//
// RAM-safe execution on 16GB Dell OptiPlex:
//   1. Tier 0 analysts run SEQUENTIALLY (same Ollama model, no thrashing)
//   2. Tier 1 + 2 analysts run IN PARALLEL (API calls, zero RAM impact)
//   Total wall time: ~6s (Ollama) + ~3s (API) ≈ 9s per panel run
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

/** Value Hunter — Tier 0 (Ollama, $0/run). Fundamental analysis doesn't need
 *  real-time social data, so local LLM is fine. Falls back to GPT-4o-mini. */
export const TIERED_VALUE_HUNTER: TieredAnalystConfig = {
  ...VALUE_HUNTER,
  provider: 'ollama',
  model: process.env.OLLAMA_VALUE_MODEL || process.env.OLLAMA_DEFAULT_MODEL || 'llama3.2:3b',
  costTier: 0,
  fallbackProvider: 'openai',
  fallbackModel: 'gpt-4o-mini',
};

/** Momentum Scanner — Tier 1 (GPT-4o-mini, ~$0.003/call). Technical analysis
 *  needs decent pattern recognition but not bleeding-edge. Falls back to Ollama. */
export const TIERED_MOMENTUM_SCANNER: TieredAnalystConfig = {
  ...MOMENTUM_SCANNER,
  provider: 'openai',
  model: 'gpt-4o-mini',
  costTier: 1,
  fallbackProvider: 'ollama',
  fallbackModel: process.env.OLLAMA_DEFAULT_MODEL || 'llama3.2:3b',
};

/** Special Situations — Tier 2 (Grok, ~$0.015/call). Needs real-time X/Twitter
 *  for early catalyst detection. Falls back to Grok standard model. */
export const TIERED_SPECIAL_SITUATIONS: TieredAnalystConfig = {
  ...SPECIAL_SITUATIONS,
  provider: 'grok',
  model: 'grok-4-1-fast-non-reasoning',
  costTier: 2,
  fallbackProvider: 'grok',
  fallbackModel: 'grok-3-mini-fast',
};

/** Risk Sentinel — Tier 0 (Ollama, $0/run). Defensive analysis is conservative
 *  by nature — local LLM handles it well. Falls back to GPT-4o-mini. */
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

/** Tier 0 analysts — run sequentially on Ollama (same model = no reload) */
export const TIER_0_ANALYSTS: TieredAnalystConfig[] = [
  TIERED_VALUE_HUNTER,
  TIERED_RISK_SENTINEL,
];

/** Tier 1 analysts — run in parallel via cheap API */
export const TIER_1_ANALYSTS: TieredAnalystConfig[] = [
  TIERED_MOMENTUM_SCANNER,
];

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
 * - Tier 0: sequential (RAM-safe Ollama)
 * - Tier 1+2: parallel (API calls)
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

/** Estimated cost per full panel run (4 analysts) */
export const ESTIMATED_COST_PER_RUN = {
  tier0: 0,           // Ollama: free
  tier1: 0.003,       // GPT-4o-mini: ~$0.003/call
  tier2: 0.015,       // Grok: ~$0.015/call
  total: 0.018,       // ~$0.018/run
  daily130Runs: 2.34, // 130 runs/day × $0.018
  monthlyEstimate: 70, // ~$70/month
};

// -----------------------------------------------------------------------------
// Panel config (replaces both DEFAULT_PANEL_CONFIG and GROK_PANEL_CONFIG)
// -----------------------------------------------------------------------------

export const TIERED_PANEL_CONFIG = {
  ...DEFAULT_PANEL_CONFIG,
  minScoreToAct: 50,          // Lowered: with 4 analysts, composite scoring is richer
  minTradeThreshold: 0.02,    // Lowered from 0.05 — allow trades with 2%+ weight change
};

// -----------------------------------------------------------------------------
// .env.trader overrides (checked at runtime)
// -----------------------------------------------------------------------------
// OLLAMA_DEFAULT_MODEL=llama3.2:3b    — default model for Tier 0 analysts
// OLLAMA_VALUE_MODEL=qwen2.5:7b       — override for Value Hunter specifically
// OLLAMA_RISK_MODEL=llama3.2:3b       — override for Risk Sentinel specifically
// PANEL_COST_MODE=free|hybrid|premium — override tier assignments (future)
