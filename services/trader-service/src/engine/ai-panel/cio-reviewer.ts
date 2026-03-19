/**
 * CIO Reviewer — Final AI approval gate before any order touches Alpaca
 *
 * After the CapitalAllocator approves a trade by score, the CIO Reviewer
 * reads the full rationale (analysts, conviction, regime, portfolio state)
 * and gives a written approve / reject / reduce decision.
 *
 * Only fires on allocator-approved candidates — typically 0–3 per day.
 * Cost: ~$0.005–0.01/day using GPT-4o-mini.
 *
 * Configure via env:
 *   CIO_MODEL=gpt-4o-mini      (default — cheap, fast)
 *   CIO_MODEL=gpt-4o           (more deliberate)
 *   CIO_MODEL=grok-3           (Grok equivalent)
 *   CIO_ENABLED=false          (disable gate — all allocator approvals pass through)
 */

import { LLMClient } from './llm-client';
import { LLMProvider } from './index';
import { TradeDecision, TradeCandidate, RegimeSnapshot } from '../allocation/types';
import { AnalystReport } from './index';
import { RebalanceTrade } from './index';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CIOAction = 'approve' | 'reject' | 'reduce';

export interface CIOTradeDecision {
  symbol: string;
  action: CIOAction;
  /** Only relevant when action=reduce. 1–99 = reduce to this % of original size. */
  sizePercent: number;
  rationale: string;
}

export interface CIOReviewResult {
  approved: RebalanceTrade[];
  rejected: { trade: RebalanceTrade; rationale: string }[];
  reduced: { trade: RebalanceTrade; originalValue: number; rationale: string }[];
  overallComment: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  skipped: boolean; // true when CIO_ENABLED=false or no trades to review
}

// ---------------------------------------------------------------------------
// CIOReviewer
// ---------------------------------------------------------------------------

export class CIOReviewer {
  private llm: LLMClient;
  private model: string;
  private provider: LLMProvider;
  private enabled: boolean;

  constructor() {
    this.llm = new LLMClient();
    this.enabled = process.env.CIO_ENABLED !== 'false';

    const modelEnv = process.env.CIO_MODEL || 'gpt-4o-mini';
    // Determine provider from model name
    if (modelEnv.startsWith('grok')) {
      this.provider = 'grok';
    } else if (modelEnv.startsWith('claude')) {
      this.provider = 'claude';
    } else {
      this.provider = 'openai';
    }
    this.model = modelEnv;
  }

  /**
   * Review all allocator-approved trades and return final approve/reject/reduce
   * decisions with written rationale.
   */
  async review(params: {
    trades: RebalanceTrade[];
    candidates: TradeCandidate[];
    decisions: TradeDecision[];
    reports: AnalystReport[];
    regime: RegimeSnapshot;
    portfolioValue: number;
    cashAvailable: number;
  }): Promise<CIOReviewResult> {
    const { trades, candidates, decisions, reports, regime, portfolioValue, cashAvailable } = params;

    const empty: CIOReviewResult = {
      approved: trades,
      rejected: [],
      reduced: [],
      overallComment: 'CIO review skipped.',
      model: this.model,
      promptTokens: 0,
      completionTokens: 0,
      costUsd: 0,
      skipped: true,
    };

    if (!this.enabled || trades.length === 0) return empty;

    // Build a concise trade brief for the LLM
    const tradeBriefs = trades.map(trade => {
      const candidate = candidates.find(c => c.symbol === trade.symbol);
      const decision = decisions.find(d => d.candidateId === candidate?.candidateId);

      // Gather analyst opinions on this symbol
      const analystOpinions = reports
        .flatMap(r => r.picks || [])
        .filter((p: any) => p.symbol === trade.symbol)
        .map((p: any) => `  - ${p.analystName || 'Analyst'}: ${p.action || trade.side}, conviction ${p.conviction ?? '?'}/5, "${p.thesis || p.reason || ''}"`)
        .join('\n');

      const scoreBreakdown = decision
        ? [
            `strategyEdge=${decision.strategyEdgeScore ?? '?'}`,
            `setupQuality=${decision.setupQualityScore ?? '?'}`,
            `symbolQuality=${decision.symbolQualityScore ?? '?'}`,
            `regimeFit=${decision.regimeFitScore ?? '?'}`,
            `analystQuality=${decision.analystQualityScore ?? '?'}`,
            `TOTAL=${decision.allocatorScore ?? '?'}`,
          ].join(', ')
        : 'scores unavailable';

      return `
TRADE: ${trade.side.toUpperCase()} ${trade.symbol}
  Size: ${trade.estimatedShares} shares ($${trade.estimatedValue.toFixed(2)})
  Allocator score: ${scoreBreakdown}
  Candidate thesis: ${candidate?.thesis || 'N/A'}
  Candidate risks: ${candidate?.risks || 'N/A'}
  Analyst consensus (${reports.length} analysts):
${analystOpinions || '  (no direct analyst picks for this symbol)'}`;
    }).join('\n---\n');

    const systemPrompt = `You are the Chief Investment Officer of a small algorithmic trading fund.
Your job is to give a final approval on trades AFTER they have already passed a quantitative scoring system.
You are the last line of defense before orders hit the market.

Be concise but decisive. Your goal is to catch:
- Thesis quality problems the scores missed (vague rationale, contradictory signals)
- Concentration risk (too many correlated bets at once)
- Regime mismatch (is this trade appropriate for current market conditions?)
- Any obvious red flags in the analyst reasoning

Do NOT second-guess the quant scores — trust them as inputs. Your role is qualitative review.

Respond ONLY with valid JSON in this exact format:
{
  "decisions": [
    {
      "symbol": "AAPL",
      "action": "approve",
      "sizePercent": 100,
      "rationale": "one sentence"
    }
  ],
  "overallComment": "one sentence on the batch"
}

action must be one of: "approve", "reject", "reduce"
sizePercent: only matters if action=reduce (e.g. 50 = cut size in half). Use 100 for approve/reject.`;

    const userPrompt = `CURRENT MARKET REGIME: ${regime.label.toUpperCase()} (VIX: ${regime.vix ?? 'N/A'}, Fear&Greed: ${regime.fearGreedScore ?? 'N/A'}, SPY trend: ${regime.spyTrend ?? 'N/A'})
PORTFOLIO VALUE: $${portfolioValue.toFixed(2)} | CASH AVAILABLE: $${cashAvailable.toFixed(2)}
TRADES TO REVIEW (${trades.length}):

${tradeBriefs}

Review each trade and return your JSON decision.`;

    try {
      const response = await this.llm.call({
        provider: this.provider,
        model: this.model,
        systemPrompt,
        userPrompt,
        maxTokens: 800,
        temperature: 0.2,
        responseFormat: 'json',
      });

      const parsed = JSON.parse(response.content) as {
        decisions: { symbol: string; action: string; sizePercent: number; rationale: string }[];
        overallComment: string;
      };

      const costUsd = this.llm.estimateCost(
        this.provider,
        this.model,
        response.promptTokens,
        response.completionTokens,
      );

      // Apply decisions back to trades
      const approved: RebalanceTrade[] = [];
      const rejected: CIOReviewResult['rejected'] = [];
      const reduced: CIOReviewResult['reduced'] = [];

      for (const trade of trades) {
        const cioDecision = parsed.decisions.find(d => d.symbol === trade.symbol);

        if (!cioDecision || cioDecision.action === 'approve') {
          approved.push(trade);
          const rationale = cioDecision?.rationale || '(no specific comment)';
          console.log(`  ✅ CIO APPROVED  ${trade.symbol}: ${rationale}`);
        } else if (cioDecision.action === 'reject') {
          rejected.push({ trade, rationale: cioDecision.rationale });
          console.log(`  ❌ CIO REJECTED  ${trade.symbol}: ${cioDecision.rationale}`);
        } else if (cioDecision.action === 'reduce') {
          const pct = Math.max(1, Math.min(99, cioDecision.sizePercent || 50)) / 100;
          const reducedTrade: RebalanceTrade = {
            ...trade,
            estimatedShares: Math.floor(trade.estimatedShares * pct),
            estimatedValue: trade.estimatedValue * pct,
            deltaWeight: trade.deltaWeight * pct,
            targetWeight: trade.currentWeight + trade.deltaWeight * pct,
          };
          reduced.push({ trade: reducedTrade, originalValue: trade.estimatedValue, rationale: cioDecision.rationale });
          approved.push(reducedTrade); // reduced trades still execute, just smaller
          console.log(`  ⬇️  CIO REDUCED   ${trade.symbol} to ${cioDecision.sizePercent}%: ${cioDecision.rationale}`);
        }
      }

      console.log(`\n🎯 CIO Summary: ${approved.length} approved, ${rejected.length} rejected, ${reduced.length} reduced | $${costUsd.toFixed(4)}`);
      if (parsed.overallComment) console.log(`   "${parsed.overallComment}"`);

      return {
        approved,
        rejected,
        reduced,
        overallComment: parsed.overallComment || '',
        model: this.model,
        promptTokens: response.promptTokens,
        completionTokens: response.completionTokens,
        costUsd,
        skipped: false,
      };
    } catch (err: any) {
      // CIO failure is non-fatal — let all allocator-approved trades through
      console.warn(`⚠️  CIO review failed (passing all through): ${err.message}`);
      return { ...empty, skipped: false, overallComment: `CIO error: ${err.message}` };
    }
  }
}
