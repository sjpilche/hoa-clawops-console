/**
 * @file opportunityScorer.js
 * @description ICE + RPS + ALS scoring engine for opportunity clusters.
 *
 * Scoring only triggers when a cluster reaches signal_count >= 3 (proven signal).
 * Uses GPT-4o via OpenClaw bridge for deep scoring (~$0.01/cluster).
 * Falls back to Ollama for budget mode ($0).
 *
 * COMPOSITE = (ICE × 0.4) + (RPS × 0.35) + (ALS × 0.25) — scale 0-100
 *
 * ICE = Impact × Confidence × Ease
 * RPS = Revenue Potential Score
 * ALS = Agent Leverage Score (bonus for Steve's verticals)
 */

'use strict';

const { get, run, all } = require('../db/connection');

// ── Score clusters that qualify ─────────────────────────────────────────────

/**
 * Get clusters ready for scoring (signal_count >= 3, not yet scored).
 * @param {number} limit
 * @returns {object[]}
 */
function getUnscoredClusters(limit = 20) {
  return all(`
    SELECT c.*,
      (SELECT GROUP_CONCAT(DISTINCT s.source) FROM opp_signals s WHERE s.cluster_id = c.id) AS sources,
      (SELECT GROUP_CONCAT(s.title, ' ||| ') FROM opp_signals s WHERE s.cluster_id = c.id ORDER BY s.platform_score DESC LIMIT 5) AS top_titles,
      (SELECT AVG(s.severity) FROM opp_signals s WHERE s.cluster_id = c.id) AS avg_severity
    FROM opp_clusters c
    WHERE c.signal_count >= 3
      AND c.scored_by IS NULL
      AND c.status = 'raw'
    ORDER BY c.signal_count DESC, c.avg_platform_score DESC
    LIMIT ?
  `, [limit]);
}

// ── GPT-4o scoring via OpenClaw bridge ──────────────────────────────────────

const SCORING_PROMPT = `You are an opportunity scoring engine for an autonomous business builder.
Score this pain cluster on three dimensions. Return ONLY valid JSON:

{
  "ice_score": 0-100,
  "ice_breakdown": { "impact": 0-100, "confidence": 0-100, "ease": 0-100 },
  "rps_score": 0-100,
  "rps_breakdown": { "market_size": 0-100, "willingness_to_pay": 0-100, "competitor_gaps": 0-100, "b2b_multiplier": 1.0-3.0 },
  "als_score": 0-100,
  "als_breakdown": { "existing_agent_fit": 0-100, "infrastructure_reuse": 0-100, "founder_expertise": 0-100 },
  "composite_score": 0-100,
  "reasoning": "2-3 sentences explaining the score",
  "recommended_template": "saas|cli|landing|api-wrapper|chrome-ext",
  "recommended_name": "Short product name suggestion",
  "target_customer": "Who would pay for this",
  "price_range": "$X-$Y/month"
}

SCORING RULES:
- ICE: Impact (how many people?), Confidence (how real is this pain?), Ease (can we build in <1 week?)
- RPS: Market size, willingness to pay, gaps in existing tools. B2B=2x, construction/finance/HOA=3x multiplier
- ALS: Does this fit Steve's agent fleet? (construction CFO, HOA funding, data cleanup, marketing automation)
  - construction/CFO/HOA/data → ALS 80-100 (perfect fit)
  - B2B SaaS/automation → ALS 50-70 (adjacent)
  - Consumer/social → ALS 10-30 (poor fit)
- Composite = (ICE × 0.4) + (RPS × 0.35) + (ALS × 0.25)

FOUNDER CONTEXT:
Steve Pilcher is a construction CFO who built an autonomous AI agent system. His sweet spots:
1. Construction company data cleanup (QB/BC/Excel migrations)
2. HOA project funding pipelines
3. CFO marketing automation for construction
4. Any B2B workflow automation agents can handle

Score HIGH if the opportunity aligns with these businesses.`;

/**
 * Score a single cluster via GPT-4o (or Ollama fallback).
 * @param {object} cluster - Row from getUnscoredClusters()
 * @param {boolean} useLLM - true = GPT-4o via OpenClaw, false = Ollama ($0)
 * @returns {{ composite: number, costUsd: number } | null}
 */
async function scoreCluster(cluster, useLLM = true) {
  const input = [
    `Pain Summary: ${cluster.pain_summary}`,
    `Category: ${cluster.pain_category || 'unknown'}`,
    `Signal Count: ${cluster.signal_count}`,
    `Sources: ${cluster.sources || 'unknown'}`,
    `Avg Platform Score: ${Math.round(cluster.avg_platform_score || 0)}`,
    `Avg Severity: ${(cluster.avg_severity || 0).toFixed(1)}/5`,
    `Velocity: ${(cluster.velocity || 0).toFixed(1)} signals/week`,
    `Top Signals:\n${(cluster.top_titles || '').split(' ||| ').map(t => `  - ${t}`).join('\n')}`,
  ].join('\n');

  let rawOutput = '';
  let costUsd = 0;
  let scoredBy = 'ollama';

  if (useLLM) {
    try {
      const openclawBridge = require('./openclawBridge');
      const result = await openclawBridge.runAgent('opportunity-scorer', {
        openclawId: 'opportunity-scorer',
        message: `${SCORING_PROMPT}\n\n--- CLUSTER TO SCORE ---\n${input}`,
        sessionId: `opp-score-${cluster.id}-${Date.now()}`,
      });

      const parsed = openclawBridge.constructor.parseOutput(result.output);
      rawOutput = parsed.text || result.output || '';
      costUsd = parsed.costUsd || 0;
      scoredBy = 'gpt4o';
    } catch (err) {
      console.warn(`[OppScorer] OpenClaw failed, falling back to Ollama:`, err.message);
      useLLM = false;
    }
  }

  if (!useLLM) {
    // Ollama fallback ($0)
    const { chat } = require('./llmClient');
    const model = process.env.OLLAMA_DEFAULT_MODEL || 'llama3.2:3b';
    rawOutput = await chat(SCORING_PROMPT, input, {
      model, provider: 'ollama', temperature: 0.3, maxTokens: 1024, timeoutMs: 60000,
    });
    scoredBy = 'ollama';
  }

  // Parse scores from output
  let cleaned = rawOutput.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
  const firstBrace = cleaned.indexOf('{');
  if (firstBrace > 0) cleaned = cleaned.slice(firstBrace);

  let scores;
  try { scores = JSON.parse(cleaned); } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) try { scores = JSON.parse(m[0]); } catch {}
  }

  if (!scores || typeof scores.composite_score !== 'number') {
    console.warn(`[OppScorer] Could not parse scores for cluster ${cluster.id}`);
    return null;
  }

  // Clamp scores to 0-100
  const clamp = (v) => Math.min(100, Math.max(0, Math.round(v || 0)));

  const ice = clamp(scores.ice_score);
  const rps = clamp(scores.rps_score);
  const als = clamp(scores.als_score);
  const composite = clamp(scores.composite_score);

  // Persist
  run(`
    UPDATE opp_clusters
    SET ice_score = ?, rps_score = ?, als_score = ?, composite_score = ?,
        scored_by = ?, scored_at = datetime('now'), score_reasoning = ?,
        status = 'scored', updated_at = datetime('now')
    WHERE id = ?
  `, [ice, rps, als, composite, scoredBy, scores.reasoning || null, cluster.id]);

  return { composite, costUsd, scoredBy, reasoning: scores.reasoning, recommended_template: scores.recommended_template };
}

/**
 * Batch score all qualifying clusters.
 * @param {object} opts - { limit, useLLM, budget_cap_usd }
 * @returns {{ scored: number, skipped: number, total_cost: number, top_cluster: object|null }}
 */
async function scoreBatch(opts = {}) {
  const { limit = 10, useLLM = true, budget_cap_usd = 0.50 } = opts;
  const clusters = getUnscoredClusters(limit);

  let scored = 0;
  let skipped = 0;
  let totalCost = 0;
  let topCluster = null;

  for (const cluster of clusters) {
    // Budget guard
    if (useLLM && totalCost >= budget_cap_usd) {
      console.log(`[OppScorer] Budget cap reached ($${totalCost.toFixed(4)}), switching to Ollama`);
    }

    const useGpt = useLLM && totalCost < budget_cap_usd;
    const result = await scoreCluster(cluster, useGpt);

    if (!result) {
      skipped++;
      continue;
    }

    totalCost += result.costUsd;
    scored++;

    if (!topCluster || result.composite > (topCluster.composite || 0)) {
      topCluster = {
        id: cluster.id,
        pain_summary: cluster.pain_summary,
        composite: result.composite,
        reasoning: result.reasoning,
        template: result.recommended_template,
      };
    }

    // Discord alert for hot clusters
    if (result.composite >= 75) {
      try {
        const discord = require('./discordNotifier');
        await discord.postWebhook({
          embeds: [{
            title: `\ud83d\udd25 Hot Opportunity — Score ${result.composite}/100`,
            color: 0xff6b35,
            fields: [
              { name: 'Pain', value: cluster.pain_summary, inline: false },
              { name: 'Signals', value: `${cluster.signal_count} from ${cluster.sources}`, inline: true },
              { name: 'Template', value: result.recommended_template || 'TBD', inline: true },
              { name: 'Reasoning', value: (result.reasoning || '').slice(0, 200), inline: false },
            ],
            timestamp: new Date().toISOString(),
          }],
        });
      } catch {}
    }
  }

  return { scored, skipped, total_cost: totalCost, top_cluster: topCluster, clusters_checked: clusters.length };
}

// ── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  getUnscoredClusters,
  scoreCluster,
  scoreBatch,
  SCORING_PROMPT,
};
