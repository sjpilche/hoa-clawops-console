// =============================================================================
// Panel Aggregator
// =============================================================================
// This is the "portfolio manager" that takes all analyst reports and decides
// what to actually trade. It's DETERMINISTIC — same inputs = same outputs.
// The LLMs inform; this code decides.
// =============================================================================

import {
  AnalystReport, AggregatedPick, PanelConsensus, PanelConfig,
  PortfolioSnapshot, PortfolioAction, RebalanceTrade,
} from '../types';

/**
 * Aggregate all analyst reports into consensus picks and portfolio actions.
 *
 * Scoring formula:
 *   compositeScore = (avgConviction / 5) * 40    — conviction weight
 *                  + (analystCount / totalAnalysts) * 30  — consensus weight
 *                  + (maxConviction / 5) * 20     — strong signal bonus
 *                  + opportunityDiversityBonus * 10 — different angles = stronger
 */
export function aggregatePanel(
  reports: AnalystReport[],
  portfolio: PortfolioSnapshot,
  config: PanelConfig,
): PanelConsensus {
  // Step 1: Collect all picks grouped by symbol+side
  const pickMap = new Map<string, {
    picks: AnalystReport['picks'][0][];
    analysts: string[];
  }>();

  for (const report of reports) {
    for (const pick of report.picks) {
      const key = `${pick.symbol}:${pick.side}`;
      if (!pickMap.has(key)) {
        pickMap.set(key, { picks: [], analysts: [] });
      }
      pickMap.get(key)!.picks.push(pick);
      pickMap.get(key)!.analysts.push(report.analystId);
    }
  }

  // Step 2: Score each aggregated pick
  const totalBuyAnalysts = reports.filter(r => r.analystId !== 'risk-sentinel').length;
  const aggregatedPicks: AggregatedPick[] = [];

  for (const [key, { picks, analysts }] of pickMap) {
    const [symbol, side] = key.split(':');
    const convictions = picks.map(p => p.conviction);
    const avgConviction = convictions.reduce((a, b) => a + b, 0) / convictions.length;
    const maxConviction = Math.max(...convictions) as 1 | 2 | 3 | 4 | 5;
    const opportunityTypes = [...new Set(picks.map(p => p.opportunityType))];

    // How many analysts flagged this (relative to total buy-side analysts)
    const relevantTotal = side === 'sell' ? 1 : totalBuyAnalysts; // Sells only come from risk sentinel
    const consensusRatio = Math.min(1, analysts.length / Math.max(1, relevantTotal));

    // Diversity bonus: multiple analysts seeing it for different reasons = stronger
    const diversityBonus = Math.min(1, (opportunityTypes.length - 1) / 2);

    const compositeScore = Math.round(
      (avgConviction / 5) * 40 +
      consensusRatio * 30 +
      (maxConviction / 5) * 20 +
      diversityBonus * 10
    );

    aggregatedPicks.push({
      symbol,
      side: side as 'buy' | 'sell',
      analystCount: analysts.length,
      avgConviction,
      maxConviction,
      opportunityTypes,
      theses: picks.map(p => `[${analysts[picks.indexOf(p)]}] ${p.thesis}`),
      compositeScore,
      targetWeight: 0, // Calculated next
    });
  }

  // Step 3: Sort by composite score descending
  aggregatedPicks.sort((a, b) => b.compositeScore - a.compositeScore);

  // Step 4: Assign target weights
  assignTargetWeights(aggregatedPicks, portfolio, config);

  // Step 5: Generate portfolio actions (what to actually trade)
  const portfolioAction = generatePortfolioAction(aggregatedPicks, portfolio, config);

  return {
    timestamp: new Date(),
    reports,
    aggregatedPicks,
    portfolioAction,
  };
}

// =============================================================================
// Weight Assignment
// =============================================================================

function assignTargetWeights(
  picks: AggregatedPick[],
  portfolio: PortfolioSnapshot,
  config: PanelConfig,
): void {
  const investableWeight = 1 - config.targetCashWeight;

  // Separate buys and sells
  const buys = picks.filter(p => p.side === 'buy' && p.compositeScore >= config.minScoreToAct);
  const sells = picks.filter(p => p.side === 'sell');

  // For buys: allocate proportional to composite score, capped by maxPositions
  const topBuys = buys.slice(0, config.maxPositions);

  if (topBuys.length > 0) {
    const totalScore = topBuys.reduce((sum, p) => sum + p.compositeScore, 0);

    for (const pick of topBuys) {
      // Weight proportional to score, but capped
      const rawWeight = (pick.compositeScore / totalScore) * investableWeight;
      pick.targetWeight = Math.min(rawWeight, config.maxSinglePositionWeight);
    }

    // Normalize if total exceeds investable weight
    const totalWeight = topBuys.reduce((sum, p) => sum + p.targetWeight, 0);
    if (totalWeight > investableWeight) {
      const scale = investableWeight / totalWeight;
      for (const pick of topBuys) {
        pick.targetWeight *= scale;
      }
    }
  }

  // For sells: target weight = 0 (we want out)
  for (const pick of sells) {
    pick.targetWeight = 0;
  }
}

// =============================================================================
// Portfolio Action Generation
// =============================================================================

function generatePortfolioAction(
  picks: AggregatedPick[],
  portfolio: PortfolioSnapshot,
  config: PanelConfig,
): PortfolioAction {
  const trades: RebalanceTrade[] = [];
  const currentWeights = new Map<string, number>();

  // Map current portfolio weights
  for (const pos of portfolio.positions) {
    currentWeights.set(pos.symbol, pos.weight);
  }

  // Process sells first (free up capital)
  const sells = picks.filter(p => p.side === 'sell' && p.compositeScore >= config.minScoreToAct);
  for (const pick of sells) {
    const currentWeight = currentWeights.get(pick.symbol) || 0;
    if (currentWeight <= 0) continue; // Nothing to sell

    const deltaWeight = -currentWeight; // Sell everything

    // Check minimum trade threshold
    if (Math.abs(deltaWeight) < config.minTradeThreshold) continue;

    const pos = portfolio.positions.find(p => p.symbol === pick.symbol);
    trades.push({
      symbol: pick.symbol,
      side: 'sell',
      targetWeight: 0,
      currentWeight,
      deltaWeight,
      estimatedShares: pos?.qty || 0,
      estimatedValue: Math.abs(deltaWeight) * portfolio.totalValue,
      sourceAnalysts: ['risk-sentinel'],
      compositeScore: pick.compositeScore,
    });
  }

  // Process buys
  const buys = picks.filter(p => p.side === 'buy' && p.targetWeight > 0);
  for (const pick of buys) {
    const currentWeight = currentWeights.get(pick.symbol) || 0;
    const deltaWeight = pick.targetWeight - currentWeight;

    // Check minimum trade threshold
    if (Math.abs(deltaWeight) < config.minTradeThreshold) continue;

    const estimatedValue = Math.abs(deltaWeight) * portfolio.totalValue;
    const currentPrice = portfolio.positions.find(p => p.symbol === pick.symbol)?.currentPrice || 0;
    const estimatedShares = currentPrice > 0 ? Math.floor(estimatedValue / currentPrice) : 0;

    // Skip if estimated value is too small to buy even 1 share
    if (estimatedShares === 0 && deltaWeight > 0) continue;

    trades.push({
      symbol: pick.symbol,
      side: deltaWeight > 0 ? 'buy' : 'sell',
      targetWeight: pick.targetWeight,
      currentWeight,
      deltaWeight,
      estimatedShares: Math.abs(estimatedShares),
      estimatedValue,
      sourceAnalysts: pick.theses.map(t => t.split(']')[0].replace('[', '')),
      compositeScore: pick.compositeScore,
    });
  }

  // Check positions we currently hold but NO analyst mentioned
  // These are "orphaned" — no one is advocating for them
  for (const pos of portfolio.positions) {
    const mentioned = picks.some(p => p.symbol === pos.symbol);
    const alreadyTraded = trades.some(t => t.symbol === pos.symbol);

    if (!mentioned && !alreadyTraded && pos.weight > config.minTradeThreshold) {
      // Don't auto-sell orphaned positions, but flag them
      console.log(
        `  ⚠️  Orphaned position: ${pos.symbol} (${(pos.weight * 100).toFixed(1)}%) — ` +
        `no analyst mentioned it. Consider reviewing.`
      );
    }
  }

  // Enforce max daily turnover
  const totalTurnover = trades.reduce((sum, t) => sum + Math.abs(t.deltaWeight), 0);
  if (totalTurnover > config.maxDailyTurnover) {
    console.log(
      `  ⚠️  Turnover ${(totalTurnover * 100).toFixed(1)}% exceeds max ` +
      `${(config.maxDailyTurnover * 100).toFixed(1)}%. Scaling down trades.`
    );
    const scale = config.maxDailyTurnover / totalTurnover;
    for (const trade of trades) {
      trade.deltaWeight *= scale;
      trade.estimatedShares = Math.floor(trade.estimatedShares * scale);
      trade.estimatedValue *= scale;
    }
  }

  // Estimate total cost
  const estimatedCost = trades.length * config.estimatedCostPerTrade * portfolio.totalValue;

  // Generate reasoning
  const reasoning = trades.length === 0
    ? 'No trades needed — either no picks met the minimum score threshold, or changes were too small to justify transaction costs.'
    : `${trades.length} trades to execute. ` +
      `Selling: ${trades.filter(t => t.side === 'sell').map(t => t.symbol).join(', ') || 'nothing'}. ` +
      `Buying: ${trades.filter(t => t.side === 'buy').map(t => t.symbol).join(', ') || 'nothing'}. ` +
      `Estimated turnover: ${(totalTurnover * 100).toFixed(1)}%.`;

  return {
    rebalanceTrades: trades,
    totalTurnover,
    estimatedCost,
    reasoning,
  };
}
