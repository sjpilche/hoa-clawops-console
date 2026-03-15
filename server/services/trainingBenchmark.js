/**
 * @file trainingBenchmark.js
 * @description Pure SQL benchmarking for the Training System.
 *
 * Computes before/after performance metrics from existing DB tables.
 * No LLM calls — just SQL queries against cfo_outreach_sequences,
 * cfo_content_pieces, cfo_leads, and runs.
 *
 * Used in the promotion pipeline: snapshot current metrics before promoting
 * a skill, then snapshot again 7 days later to measure impact.
 *
 * COST: $0 — pure SQLite reads/writes.
 */

'use strict';

const { get, run, all } = require('../db/connection');

// ── Metric computation (all pure SQL) ────────────────────────────────────────

/**
 * Compute reply rate for outreach agents.
 * @param {string} sourceAgent - 'jake' or 'cfo'
 * @param {number} days - Look-back window
 * @returns {{ reply_rate, bounce_rate, sent_count }}
 */
function computeOutreachMetrics(sourceAgent, days = 14) {
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const sent = get(
    "SELECT COUNT(*) AS c FROM cfo_outreach_sequences WHERE source_agent = ? AND status IN ('sent','replied','bounced') AND created_at >= ?",
    [sourceAgent, since]
  )?.c || 0;

  const replied = get(
    "SELECT COUNT(*) AS c FROM cfo_outreach_sequences WHERE source_agent = ? AND status = 'replied' AND created_at >= ?",
    [sourceAgent, since]
  )?.c || 0;

  const bounced = get(
    "SELECT COUNT(*) AS c FROM cfo_outreach_sequences WHERE source_agent = ? AND status = 'bounced' AND created_at >= ?",
    [sourceAgent, since]
  )?.c || 0;

  return {
    reply_rate: sent > 0 ? Math.round((replied / sent) * 1000) / 10 : 0,
    bounce_rate: sent > 0 ? Math.round((bounced / sent) * 1000) / 10 : 0,
    sent_count: sent,
  };
}

/**
 * Compute content approval rate for content agents.
 * @param {string} sourceAgent - 'jake' or 'cfo'
 * @param {number} days - Look-back window
 * @returns {{ approval_rate, total_pieces }}
 */
function computeContentMetrics(sourceAgent, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const total = get(
    "SELECT COUNT(*) AS c FROM cfo_content_pieces WHERE source_agent = ? AND created_at >= ?",
    [sourceAgent, since]
  )?.c || 0;

  const approved = get(
    "SELECT COUNT(*) AS c FROM cfo_content_pieces WHERE source_agent = ? AND status = 'approved' AND created_at >= ?",
    [sourceAgent, since]
  )?.c || 0;

  return {
    approval_rate: total > 0 ? Math.round((approved / total) * 1000) / 10 : 0,
    total_pieces: total,
  };
}

/**
 * Compute enrichment hit rate for pipeline agents.
 * @param {string} sourceAgent - 'jake' or 'cfo'
 * @param {number} days - Look-back window
 * @returns {{ enrichment_rate, total_leads }}
 */
function computeEnrichmentMetrics(sourceAgent, days = 14) {
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const total = get(
    "SELECT COUNT(*) AS c FROM cfo_leads WHERE source_agent = ? AND created_at >= ?",
    [sourceAgent, since]
  )?.c || 0;

  const enriched = get(
    "SELECT COUNT(*) AS c FROM cfo_leads WHERE source_agent = ? AND enrichment_status = 'enriched' AND created_at >= ?",
    [sourceAgent, since]
  )?.c || 0;

  return {
    enrichment_rate: total > 0 ? Math.round((enriched / total) * 1000) / 10 : 0,
    total_leads: total,
  };
}

/**
 * Compute run success rate for any agent.
 * @param {string} agentId - Agent UUID
 * @param {number} days - Look-back window
 * @returns {{ success_rate, total_runs }}
 */
function computeRunMetrics(agentId, days = 14) {
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const total = get(
    "SELECT COUNT(*) AS c FROM runs WHERE agent_id = ? AND created_at >= ?",
    [agentId, since]
  )?.c || 0;

  const completed = get(
    "SELECT COUNT(*) AS c FROM runs WHERE agent_id = ? AND status = 'completed' AND created_at >= ?",
    [agentId, since]
  )?.c || 0;

  return {
    success_rate: total > 0 ? Math.round((completed / total) * 1000) / 10 : 0,
    total_runs: total,
  };
}

// ── Agent-specific metric selection ──────────────────────────────────────────

/**
 * Compute all relevant metrics for an agent based on their role.
 * @param {string} agentName
 * @param {string} agentId
 * @returns {object[]} Array of { metric_name, metric_value, sample_size }
 */
function computeMetrics(agentName, agentId) {
  const metrics = [];
  const sourceAgent = agentName.includes('jake') ? 'jake' : agentName.includes('cfo') ? 'cfo' : null;

  // Always compute run success rate
  const runMetrics = computeRunMetrics(agentId);
  metrics.push({ metric_name: 'run_success_rate', metric_value: runMetrics.success_rate, sample_size: runMetrics.total_runs });

  // Outreach agents
  if (agentName.includes('outreach') || agentName.includes('follow-up')) {
    if (sourceAgent) {
      const om = computeOutreachMetrics(sourceAgent);
      metrics.push({ metric_name: 'email_reply_rate', metric_value: om.reply_rate, sample_size: om.sent_count });
      metrics.push({ metric_name: 'email_bounce_rate', metric_value: om.bounce_rate, sample_size: om.sent_count });
    }
  }

  // Content agents
  if (agentName.includes('content') || agentName.includes('writer')) {
    if (sourceAgent) {
      const cm = computeContentMetrics(sourceAgent);
      metrics.push({ metric_name: 'content_approval_rate', metric_value: cm.approval_rate, sample_size: cm.total_pieces });
    }
  }

  // Pipeline agents
  if (agentName.includes('enricher') || agentName.includes('discovery') || agentName.includes('scout')) {
    if (sourceAgent) {
      const em = computeEnrichmentMetrics(sourceAgent);
      metrics.push({ metric_name: 'enrichment_hit_rate', metric_value: em.enrichment_rate, sample_size: em.total_leads });
    }
  }

  return metrics;
}

// ── Benchmark recording ──────────────────────────────────────────────────────

/**
 * Record a benchmark snapshot for a skill candidate.
 * @param {string} agentId
 * @param {number} candidateId - FK to skill_candidates
 * @param {string} type - 'pre_training' or 'post_training'
 * @param {object[]} metrics - Array from computeMetrics()
 */
function recordBenchmark(agentId, candidateId, type, metrics) {
  for (const m of metrics) {
    run(
      'INSERT INTO training_benchmarks (agent_id, skill_candidate_id, benchmark_type, metric_name, metric_value, sample_size) VALUES (?, ?, ?, ?, ?, ?)',
      [agentId, candidateId, type, m.metric_name, m.metric_value, m.sample_size]
    );
  }
  console.log(`[Benchmark] Recorded ${type} for candidate ${candidateId}: ${metrics.length} metrics`);
}

/**
 * Compare pre/post benchmarks for a skill candidate.
 * @param {number} candidateId
 * @returns {{ improved: boolean, metrics: object[] }}
 */
function compareBenchmarks(candidateId) {
  const pre = all(
    "SELECT metric_name, metric_value, sample_size FROM training_benchmarks WHERE skill_candidate_id = ? AND benchmark_type = 'pre_training'",
    [candidateId]
  );

  const post = all(
    "SELECT metric_name, metric_value, sample_size FROM training_benchmarks WHERE skill_candidate_id = ? AND benchmark_type = 'post_training'",
    [candidateId]
  );

  if (pre.length === 0 || post.length === 0) {
    return { improved: null, metrics: [], reason: 'Missing pre or post benchmarks' };
  }

  const comparisons = [];
  let improvementCount = 0;

  for (const preMetric of pre) {
    const postMetric = post.find(p => p.metric_name === preMetric.metric_name);
    if (postMetric) {
      const delta = postMetric.metric_value - preMetric.metric_value;
      // For bounce_rate, lower is better
      const isImprovement = preMetric.metric_name.includes('bounce')
        ? delta < 0
        : delta > 0;

      if (isImprovement) improvementCount++;
      comparisons.push({
        metric: preMetric.metric_name,
        before: preMetric.metric_value,
        after: postMetric.metric_value,
        delta: Math.round(delta * 10) / 10,
        improved: isImprovement,
      });
    }
  }

  return {
    improved: improvementCount > comparisons.length / 2,
    metrics: comparisons,
  };
}

/**
 * Record pre-training benchmarks for all pending promotions.
 * Called before QA promotion cycle.
 */
function recordPreTrainingBenchmarks() {
  const candidates = all(
    "SELECT sc.id, sc.agent_id, a.name AS agent_name FROM skill_candidates sc JOIN agents a ON sc.agent_id = a.id WHERE sc.status = 'candidate' AND sc.qa_verdict IN ('pass', 'pass_with_notes') AND sc.qa_score >= 0.7 AND NOT EXISTS (SELECT 1 FROM training_benchmarks tb WHERE tb.skill_candidate_id = sc.id AND tb.benchmark_type = 'pre_training')"
  );

  let recorded = 0;
  for (const c of candidates) {
    const metrics = computeMetrics(c.agent_name, c.agent_id);
    if (metrics.length > 0) {
      recordBenchmark(c.agent_id, c.id, 'pre_training', metrics);
      recorded++;
    }
  }

  return recorded;
}

/**
 * Record post-training benchmarks for candidates promoted 7+ days ago.
 * Called at the START of each training cycle (cheap SQL, no Ollama).
 * Compares pre vs post and logs improvement/regression.
 * @returns {{ recorded: number, improved: number, regressed: number, results: object[] }}
 */
function recordPostTrainingBenchmarks() {
  // Find promoted candidates 7+ days old without post-training benchmarks
  const candidates = all(
    `SELECT sc.id, sc.agent_id, sc.agent_name, sc.skill_name, sc.promoted_at
     FROM skill_candidates sc
     WHERE sc.status = 'approved'
       AND sc.promoted_at IS NOT NULL
       AND sc.promoted_at < datetime('now', '-7 days')
       AND EXISTS (SELECT 1 FROM training_benchmarks tb WHERE tb.skill_candidate_id = sc.id AND tb.benchmark_type = 'pre_training')
       AND NOT EXISTS (SELECT 1 FROM training_benchmarks tb WHERE tb.skill_candidate_id = sc.id AND tb.benchmark_type = 'post_training')`
  );

  let recorded = 0, improved = 0, regressed = 0;
  const results = [];

  for (const c of candidates) {
    const metrics = computeMetrics(c.agent_name, c.agent_id);
    if (metrics.length === 0) continue;

    recordBenchmark(c.agent_id, c.id, 'post_training', metrics);
    recorded++;

    const comparison = compareBenchmarks(c.id);
    if (comparison.improved === true) improved++;
    else if (comparison.improved === false) regressed++;

    results.push({
      agent: c.agent_name,
      skill: c.skill_name,
      improved: comparison.improved,
      metrics: comparison.metrics,
    });

    const emoji = comparison.improved === true ? '📈' : comparison.improved === false ? '📉' : '➡️';
    console.log(`[Benchmark] Post-training ${emoji} ${c.agent_name} "${c.skill_name}": ${comparison.metrics.map(m => `${m.metric}:${m.before}→${m.after}`).join(', ')}`);
  }

  // Discord alert for regressions
  if (regressed > 0) {
    try {
      const discord = require('./discordNotifier');
      const regressedResults = results.filter(r => r.improved === false);
      discord.postWebhook({
        embeds: [{
          title: `📉 Training Regression Detected — ${regressed} skills underperforming`,
          color: 0xe74c3c,
          description: regressedResults.map(r =>
            `**${r.agent}**: ${r.skill} — ${r.metrics.filter(m => !m.improved).map(m => `${m.metric}: ${m.before}→${m.after}`).join(', ')}`
          ).join('\n'),
          footer: { text: `${improved} improved · ${regressed} regressed · ${recorded - improved - regressed} neutral` },
          timestamp: new Date().toISOString(),
        }],
      });
    } catch { /* Discord optional */ }
  }

  return { recorded, improved, regressed, results };
}

module.exports = {
  computeOutreachMetrics,
  computeContentMetrics,
  computeEnrichmentMetrics,
  computeRunMetrics,
  computeMetrics,
  recordBenchmark,
  compareBenchmarks,
  recordPreTrainingBenchmarks,
  recordPostTrainingBenchmarks,
};
