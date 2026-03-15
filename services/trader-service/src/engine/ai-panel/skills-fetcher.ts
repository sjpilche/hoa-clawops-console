// =============================================================================
// Skills Fetcher - Calls OpenClaw skills before analyst panel runs
// =============================================================================
// Fetches data from 7 skills in parallel (30s timeout each):
//   1. tradingview-claw — Chart technicals, RSI, MACD, MA levels
//   2. minara — Polymarket probability data
//   3. ai-news-oracle — Real-time news + sentiment
//   4. dexter — SEC filings, fundamentals
//   5. stock-analysis — AI-powered stock analysis & scoring
//   6. polyclaw — Prediction market aggregation
//   7. alpaca-mcp-server — Live account state from Alpaca
//
// Results are injected into analyst context before any order intent is formed.
// =============================================================================

import { spawn } from 'child_process';
import path from 'path';

const SKILLS_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '', '.openclaw', 'skills');

export interface SkillsContext {
  technicals: string;       // tradingview-claw
  polymarket: string;       // minara
  news: string;             // ai-news-oracle
  fundamentals: string;     // dexter
  stockAnalysis: string;    // stock-analysis
  predictions: string;      // polyclaw
  accountState: string;     // alpaca-mcp-server
  fetchedAt: Date;
  errors: string[];
}

/**
 * Run an OpenClaw skill via CLI and return its output
 */
async function runSkill(skillName: string, args: string[], timeoutMs = 30000): Promise<string> {
  return new Promise((resolve) => {
    const proc = spawn(
      'openclaw',
      ['skill', 'run', skillName, ...args],
      { shell: true, timeout: timeoutMs }
    );

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (d) => { stdout += d.toString(); });
    proc.stderr?.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (code === 0 && stdout.trim()) {
        resolve(stdout.trim());
      } else {
        resolve('');
      }
    });

    proc.on('error', () => resolve(''));

    setTimeout(() => {
      proc.kill();
      resolve('');
    }, timeoutMs);
  });
}

// ---------------------------------------------------------------------------
// Individual skill fetchers
// ---------------------------------------------------------------------------

async function fetchTechnicals(symbols: string[]): Promise<string> {
  const result = await runSkill('tradingview-claw', ['scan', '--symbols', symbols.join(','), '--format', 'text']);
  return result || '(tradingview-claw unavailable — using Alpaca bar data only)';
}

async function fetchPolymarket(): Promise<string> {
  const result = await runSkill('minara', ['insights', '--market', 'equities', '--format', 'text']);
  return result || '(minara unavailable — no Polymarket probability data)';
}

async function fetchNews(): Promise<string> {
  const result = await runSkill('ai-news-oracle', ['latest', '--sources', 'all', '--format', 'text']);
  return result || '(ai-news-oracle unavailable — no real-time news context)';
}

async function fetchFundamentals(symbols: string[]): Promise<string> {
  const result = await runSkill('dexter', ['research', '--symbols', symbols.join(','), '--format', 'text']);
  return result || '(dexter unavailable — no SEC/fundamental data)';
}

async function fetchStockAnalysis(symbols: string[]): Promise<string> {
  const result = await runSkill('stock-analysis', ['analyze', '--symbols', symbols.join(','), '--format', 'text']);
  return result || '(stock-analysis unavailable — no AI stock scoring)';
}

async function fetchPredictions(): Promise<string> {
  const result = await runSkill('polyclaw', ['predict', '--market', 'equities', '--format', 'text']);
  return result || '(polyclaw unavailable — no prediction market data)';
}

async function fetchAccountState(): Promise<string> {
  const result = await runSkill('alpaca-mcp-server', ['account', '--format', 'text']);
  return result || '(alpaca-mcp-server unavailable — using cached portfolio data)';
}

// ---------------------------------------------------------------------------
// Main fetcher — all 7 skills in parallel
// ---------------------------------------------------------------------------

/**
 * Fetch all skill data in parallel before panel run.
 * Non-fatal: if a skill fails, it logs the error and continues with a placeholder.
 */
export async function fetchAllSkillsContext(symbols: string[]): Promise<SkillsContext> {
  console.log('🔌 Fetching OpenClaw skills data (7 skills)...');
  console.log(`   Skills dir: ${SKILLS_DIR}`);
  console.log(`   Symbols: ${symbols.join(', ')}`);

  const errors: string[] = [];

  const [technicals, polymarket, news, fundamentals, stockAnalysis, predictions, accountState] = await Promise.all([
    fetchTechnicals(symbols).catch((e) => {
      errors.push(`tradingview-claw: ${e.message}`);
      return '(tradingview-claw error)';
    }),
    fetchPolymarket().catch((e) => {
      errors.push(`minara: ${e.message}`);
      return '(minara error)';
    }),
    fetchNews().catch((e) => {
      errors.push(`ai-news-oracle: ${e.message}`);
      return '(ai-news-oracle error)';
    }),
    fetchFundamentals(symbols).catch((e) => {
      errors.push(`dexter: ${e.message}`);
      return '(dexter error)';
    }),
    fetchStockAnalysis(symbols).catch((e) => {
      errors.push(`stock-analysis: ${e.message}`);
      return '(stock-analysis error)';
    }),
    fetchPredictions().catch((e) => {
      errors.push(`polyclaw: ${e.message}`);
      return '(polyclaw error)';
    }),
    fetchAccountState().catch((e) => {
      errors.push(`alpaca-mcp-server: ${e.message}`);
      return '(alpaca-mcp-server error)';
    }),
  ]);

  const skillStatus = (name: string, data: string) => data.startsWith('(') ? 'unavailable' : 'ok';

  console.log(`   ✓ tradingview-claw:   ${skillStatus('tvc', technicals)}`);
  console.log(`   ✓ minara:             ${skillStatus('min', polymarket)}`);
  console.log(`   ✓ ai-news-oracle:     ${skillStatus('ano', news)}`);
  console.log(`   ✓ dexter:             ${skillStatus('dex', fundamentals)}`);
  console.log(`   ✓ stock-analysis:     ${skillStatus('sa', stockAnalysis)}`);
  console.log(`   ✓ polyclaw:           ${skillStatus('pc', predictions)}`);
  console.log(`   ✓ alpaca-mcp-server:  ${skillStatus('alp', accountState)}`);

  if (errors.length > 0) {
    console.warn(`   ⚠️  ${errors.length} skill(s) unavailable (non-fatal)`);
  }

  return { technicals, polymarket, news, fundamentals, stockAnalysis, predictions, accountState, fetchedAt: new Date(), errors };
}

/**
 * Format all skill data into a single context block for analyst prompts
 */
export function formatSkillsContext(ctx: SkillsContext): string {
  return [
    '=== LIVE SKILL DATA (fetched before this panel run) ===',
    '',
    '--- TradingView Technicals (tradingview-claw) ---',
    ctx.technicals,
    '',
    '--- Polymarket Probabilities (minara) ---',
    ctx.polymarket,
    '',
    '--- Real-Time News & Sentiment (ai-news-oracle) ---',
    ctx.news,
    '',
    '--- Fundamentals & SEC Research (dexter) ---',
    ctx.fundamentals,
    '',
    '--- AI Stock Scoring (stock-analysis) ---',
    ctx.stockAnalysis,
    '',
    '--- Prediction Markets (polyclaw) ---',
    ctx.predictions,
    '',
    '--- Live Account State (alpaca-mcp-server) ---',
    ctx.accountState,
    '',
    `Fetched at: ${ctx.fetchedAt.toISOString()}`,
    '=== END SKILL DATA ===',
  ].join('\n');
}
