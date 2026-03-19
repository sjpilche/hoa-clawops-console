// =============================================================================
// Candidate Normalizer — Convert all signal types into TradeCandidate
// =============================================================================
// Both strategy signals and AI panel picks become the same TradeCandidate
// so the allocator can rank and size them uniformly.
// =============================================================================

import { v4 as uuidv4 } from 'uuid';
import { TradeCandidate, RegimeLabel } from './types';
import { Signal } from '../strategy/types';
import { AggregatedPick, AnalystReport, AnalystPick } from '../ai-panel/index';

/**
 * Convert a strategy Signal into a TradeCandidate.
 */
export function signalToCandidate(
  signal: Signal,
  regimeLabel: RegimeLabel,
  regimeSnapshotId?: number,
): TradeCandidate {
  return {
    candidateId: uuidv4(),
    source: 'strategy',
    sourceId: signal.strategyId,
    sourceName: signal.strategyId,  // overwrite with human name if available
    runId: signal.signalId,         // use signalId as runId for strategy path

    symbol: signal.symbol,
    side: signal.side,
    signalStrength: signal.strength,

    signalPrice: signal.price,
    strategyFeatures: signal.features,

    regimeLabel,
    regimeSnapshotId,

    analystCount: 1,
    compositeScore: signal.strength * 100,  // 0-1 → 0-100

    createdAt: signal.timestamp || new Date(),
  };
}

/**
 * Convert an AI panel AggregatedPick into a TradeCandidate.
 * Merges information from all contributing analyst reports.
 */
export function aggregatedPickToCandidate(
  pick: AggregatedPick,
  reports: AnalystReport[],
  runId: string,
  regimeLabel: RegimeLabel,
  regimeSnapshotId?: number,
): TradeCandidate {
  // Find the individual analyst picks for this symbol to get rich metadata
  const analystPicks: { pick: AnalystPick; report: AnalystReport }[] = [];
  for (const report of reports) {
    for (const p of report.picks) {
      if (p.symbol === pick.symbol && p.side === pick.side) {
        analystPicks.push({ pick: p, report });
      }
    }
  }

  // Use the first analyst's pick for metadata (thesis, risks, catalysts, etc.)
  const primary = analystPicks[0]?.pick;

  // Combine all analysts' IDs for sourceId
  const analystIds = analystPicks.map(a => a.report.analystId);
  const sourceId = analystIds.join(',');
  const sourceName = analystPicks.map(a => a.report.analystName).join(' + ');

  return {
    candidateId: uuidv4(),
    source: 'ai_panel',
    sourceId,
    sourceName,
    runId,

    symbol: pick.symbol,
    side: pick.side,
    signalStrength: pick.avgConviction / 5,  // conviction 1-5 → 0-1

    opportunityType: primary?.opportunityType,
    horizon: primary?.horizon,
    thesis: pick.theses?.join(' | '),
    risks: primary?.risks,
    catalysts: primary?.catalysts,
    targetPrice: primary?.targetPrice,
    stopLoss: primary?.stopLoss,

    regimeLabel,
    regimeSnapshotId,

    analystCount: pick.analystCount,
    avgConviction: pick.avgConviction,
    maxConviction: pick.maxConviction,
    compositeScore: pick.compositeScore,

    createdAt: new Date(),
  };
}
