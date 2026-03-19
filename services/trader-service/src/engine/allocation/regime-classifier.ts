// =============================================================================
// Regime Classifier — Market regime detection from existing data
// =============================================================================
// Classifies current market conditions into one of:
//   risk_on | risk_off | high_volatility | neutral | unknown
//
// Uses data already fetched by market-data.ts — NO additional API calls.
// =============================================================================

import { RegimeInput, RegimeSnapshot, RegimeLabel } from './types';

/**
 * Classify the current market regime from structured inputs.
 *
 * Classification rules (evaluated in order):
 *   1. VIX > 30          → high_volatility (overrides everything)
 *   2. VIX > 25 OR F&G < 35 OR (SPY below 50d AND VIX > 20) → risk_off
 *   3. VIX < 18 AND F&G > 55 AND SPY above 50d               → risk_on
 *   4. Otherwise          → neutral
 */
export function classifyRegime(input: RegimeInput): RegimeSnapshot {
  const available = [input.vix, input.fearGreedScore, input.spyPrice].filter(v => v != null).length;
  const confidence = available / 3;

  if (confidence === 0) {
    return buildSnapshot(input, 'unknown', 0);
  }

  const spyTrend: 'above_50d' | 'below_50d' | 'unknown' =
    (input.spyPrice != null && input.spy50dMA != null)
      ? (input.spyPrice > input.spy50dMA ? 'above_50d' : 'below_50d')
      : 'unknown';

  let label: RegimeLabel;

  if (input.vix != null && input.vix > 30) {
    label = 'high_volatility';
  } else if (
    (input.vix != null && input.vix > 25) ||
    (input.fearGreedScore != null && input.fearGreedScore < 35) ||
    (spyTrend === 'below_50d' && input.vix != null && input.vix > 20)
  ) {
    label = 'risk_off';
  } else if (
    (input.vix == null || input.vix < 18) &&
    (input.fearGreedScore == null || input.fearGreedScore > 55) &&
    (spyTrend !== 'below_50d')
  ) {
    label = 'risk_on';
  } else {
    label = 'neutral';
  }

  return buildSnapshot(input, label, confidence);
}

function buildSnapshot(input: RegimeInput, label: RegimeLabel, confidence: number): RegimeSnapshot {
  const spyTrend: 'above_50d' | 'below_50d' | 'unknown' =
    (input.spyPrice != null && input.spy50dMA != null)
      ? (input.spyPrice > input.spy50dMA ? 'above_50d' : 'below_50d')
      : 'unknown';

  return {
    timestamp: new Date(),
    label,
    vix: input.vix ?? null,
    fearGreedScore: input.fearGreedScore ?? null,
    spyTrend,
    spyPrice: input.spyPrice ?? null,
    spy50dMA: input.spy50dMA ?? null,
    spy200dMA: input.spy200dMA ?? null,
    tenYearYield: input.tenYearYield ?? null,
    confidence,
    rawInputs: { ...input },
  };
}

/**
 * Parse regime inputs from the raw market data text that market-data.ts returns.
 * Extracts VIX, Fear & Greed score, SPY price, and MA levels from the text blocks.
 *
 * This is intentionally regex-based since the text is machine-formatted by our code.
 */
export function parseRegimeFromText(marketDataText: string): RegimeInput {
  const input: RegimeInput = {};

  // VIX: appears in index lines as "^VIX ... Price: $18.42"
  const vixMatch = marketDataText.match(/\^VIX[^$]*\$([0-9]+\.?[0-9]*)/);
  if (vixMatch) {
    input.vix = parseFloat(vixMatch[1]);
  }

  // Fear & Greed: appears as "Current Score: 62" or "Score: 62/100"
  const fgMatch = marketDataText.match(/(?:Fear.*?Greed|F&G).*?(?:Score|score)[:\s]*([0-9]+)/i);
  if (fgMatch) {
    input.fearGreedScore = parseFloat(fgMatch[1]);
  }

  // SPY: appears in index lines as "^GSPC ... Price: $5,234.18" or "SPY ... Price: $523.45"
  const spyMatch = marketDataText.match(/(?:\^GSPC|SPY)[^$]*\$([0-9,]+\.?[0-9]*)/);
  if (spyMatch) {
    input.spyPrice = parseFloat(spyMatch[1].replace(/,/g, ''));
  }

  // 50d MA: appears as "50d MA: ABOVE" or "50d: $5,123.45"
  // For SPY/^GSPC specifically
  const spy50dMatch = marketDataText.match(/(?:\^GSPC|SPY)[\s\S]{0,500}?50d.*?(?:MA)?[:\s]*\$?([0-9,]+\.?[0-9]*)/i);
  if (spy50dMatch && spy50dMatch[1] !== 'ABOVE' && spy50dMatch[1] !== 'BELOW') {
    input.spy50dMA = parseFloat(spy50dMatch[1].replace(/,/g, ''));
  }

  // 200d MA
  const spy200dMatch = marketDataText.match(/(?:\^GSPC|SPY)[\s\S]{0,500}?200d.*?(?:MA)?[:\s]*\$?([0-9,]+\.?[0-9]*)/i);
  if (spy200dMatch && spy200dMatch[1] !== 'ABOVE' && spy200dMatch[1] !== 'BELOW') {
    input.spy200dMA = parseFloat(spy200dMatch[1].replace(/,/g, ''));
  }

  // 10Y yield: "^TNX ... Price: $4.23"
  const tnxMatch = marketDataText.match(/\^TNX[^$]*\$([0-9]+\.?[0-9]*)/);
  if (tnxMatch) {
    input.tenYearYield = parseFloat(tnxMatch[1]);
  }

  return input;
}
