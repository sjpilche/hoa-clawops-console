// =============================================================================
// Analyst Runner
// =============================================================================
// Takes an analyst config, builds the prompt with live data, calls the LLM,
// and parses + validates the response into a structured AnalystReport.
// =============================================================================

import { AnalystConfig, AnalystReport, AnalystPick, PortfolioSnapshot } from '../types';
import { LLMClient } from './llm-client';
import { formatPortfolioForPrompt } from './market-data';

const llm = new LLMClient();

/** Run a single analyst and return their report */
export async function runAnalyst(
  config: AnalystConfig,
  portfolio: PortfolioSnapshot,
  marketContext: string,
  universe: string,
): Promise<AnalystReport> {
  const startTime = Date.now();

  // Build the user prompt by filling in placeholders
  const userPrompt = config.userPromptTemplate
    .replace('{portfolio}', formatPortfolioForPrompt(portfolio))
    .replace('{market_data}', marketContext)
    .replace('{universe}', universe);

  console.log(`\n🔍 Running analyst: ${config.name} (${config.provider}/${config.model})`);

  let rawResponse = '';
  let promptTokens = 0;
  let completionTokens = 0;

  try {
    const response = await llm.call({
      provider: config.provider,
      model: config.model,
      systemPrompt: config.systemPrompt,
      userPrompt,
      temperature: config.temperature,
      maxTokens: 4096,
      responseFormat: 'json',
    });

    rawResponse = response.content;
    promptTokens = response.promptTokens;
    completionTokens = response.completionTokens;
  } catch (error) {
    console.error(`❌ Analyst ${config.name} failed:`, error);
    return createErrorReport(config, startTime, String(error));
  }

  // Parse the JSON response
  const parsed = parseAnalystResponse(rawResponse, config);

  const costEstimate = llm.estimateCost(
    config.provider,
    config.model,
    promptTokens,
    completionTokens,
  );

  const report: AnalystReport = {
    analystId: config.id,
    analystName: config.name,
    provider: config.provider,
    timestamp: new Date(),
    scanFocus: config.focusArea,
    picks: parsed.picks.slice(0, config.maxPicks),  // Enforce max picks
    marketCommentary: parsed.marketCommentary,
    rawResponse,
    promptTokens,
    completionTokens,
    costEstimateUSD: costEstimate,
    latencyMs: Date.now() - startTime,
  };

  console.log(
    `  ✅ ${config.name}: ${report.picks.length} picks | ` +
    `${report.latencyMs}ms | ~$${report.costEstimateUSD.toFixed(4)}`
  );

  for (const pick of report.picks) {
    const emoji = pick.side === 'buy' ? '🟢' : '🔴';
    console.log(
      `     ${emoji} ${pick.symbol} (${pick.side}) conviction=${pick.conviction} ` +
      `type=${pick.opportunityType} — ${pick.thesis.slice(0, 80)}...`
    );
  }

  return report;
}

/** Run all analysts in parallel and collect reports */
export async function runAllAnalysts(
  analysts: AnalystConfig[],
  portfolio: PortfolioSnapshot,
  marketContext: string,
  universe: string,
): Promise<AnalystReport[]> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 AI ANALYST PANEL — Running ${analysts.length} analysts`);
  console.log(`${'='.repeat(60)}`);

  // Run all analysts in parallel for speed
  const reports = await Promise.allSettled(
    analysts.map(config => runAnalyst(config, portfolio, marketContext, universe))
  );

  const successfulReports: AnalystReport[] = [];

  for (let i = 0; i < reports.length; i++) {
    const result = reports[i];
    if (result.status === 'fulfilled') {
      successfulReports.push(result.value);
    } else {
      console.error(`❌ Analyst ${analysts[i].name} failed:`, result.reason);
      successfulReports.push(
        createErrorReport(analysts[i], Date.now(), String(result.reason))
      );
    }
  }

  const totalCost = successfulReports.reduce((sum, r) => sum + r.costEstimateUSD, 0);
  const totalPicks = successfulReports.reduce((sum, r) => sum + r.picks.length, 0);

  console.log(`\n📋 Panel Summary: ${totalPicks} total picks | ~$${totalCost.toFixed(4)} LLM cost`);

  return successfulReports;
}

// =============================================================================
// Response Parsing & Validation
// =============================================================================

interface ParsedResponse {
  marketCommentary: string;
  picks: AnalystPick[];
}

function parseAnalystResponse(raw: string, config: AnalystConfig): ParsedResponse {
  // Strip markdown code fences if present
  let cleaned = raw.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  try {
    const data = JSON.parse(cleaned);

    const marketCommentary = typeof data.marketCommentary === 'string'
      ? data.marketCommentary
      : 'No commentary provided';

    const picks: AnalystPick[] = [];

    if (Array.isArray(data.picks)) {
      for (const raw of data.picks) {
        const pick = validatePick(raw, config.id);
        if (pick) picks.push(pick);
      }
    }

    return { marketCommentary, picks };
  } catch (err) {
    console.warn(`⚠️  Failed to parse ${config.name} response as JSON:`, err);
    console.warn(`   Raw response (first 200 chars): ${raw.slice(0, 200)}`);
    return { marketCommentary: 'Parse error', picks: [] };
  }
}

function validatePick(raw: any, analystId: string): AnalystPick | null {
  // Validate required fields
  if (!raw || typeof raw !== 'object') return null;
  if (!raw.symbol || typeof raw.symbol !== 'string') return null;
  if (!['buy', 'sell'].includes(raw.side)) return null;

  // Sanitize symbol
  const symbol = raw.symbol.toUpperCase().replace(/[^A-Z]/g, '');
  if (symbol.length === 0 || symbol.length > 5) return null;

  // Validate conviction (clamp to 1-5)
  const conviction = Math.max(1, Math.min(5, Math.round(Number(raw.conviction) || 3)));

  // Validate opportunity type
  const validTypes = [
    'deep_value', 'momentum_breakout', 'special_situation',
    'mean_reversion', 'macro_rotation', 'earnings_drift', 'event_catalyst',
  ];
  const opportunityType = validTypes.includes(raw.opportunityType)
    ? raw.opportunityType
    : 'deep_value';

  // Validate horizon
  const validHorizons = ['intraday', '1_week', '2_weeks', '1_month', '3_months'];
  const horizon = validHorizons.includes(raw.horizon) ? raw.horizon : '1_week';

  return {
    symbol,
    side: raw.side,
    conviction: conviction as 1 | 2 | 3 | 4 | 5,
    opportunityType,
    horizon,
    targetPrice: typeof raw.targetPrice === 'number' ? raw.targetPrice : undefined,
    stopLoss: typeof raw.stopLoss === 'number' ? raw.stopLoss : undefined,
    thesis: typeof raw.thesis === 'string' ? raw.thesis : 'No thesis provided',
    risks: typeof raw.risks === 'string' ? raw.risks : 'No risks identified',
    catalysts: Array.isArray(raw.catalysts) ? raw.catalysts.filter((c: any) => typeof c === 'string') : [],
    dataPoints: typeof raw.dataPoints === 'object' && raw.dataPoints ? raw.dataPoints : {},
  };
}

function createErrorReport(config: AnalystConfig, startTime: number, error: string): AnalystReport {
  return {
    analystId: config.id,
    analystName: config.name,
    provider: config.provider,
    timestamp: new Date(),
    scanFocus: config.focusArea,
    picks: [],
    marketCommentary: `Error: ${error}`,
    rawResponse: error,
    promptTokens: 0,
    completionTokens: 0,
    costEstimateUSD: 0,
    latencyMs: Date.now() - startTime,
  };
}
