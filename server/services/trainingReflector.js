/**
 * @file trainingReflector.js
 * @description Reflection + Internal Corpus learning for the Idle Training System.
 *
 * REFLECTION: Agents learn from their own failures.
 *   - Queries brain_fallback_episodes for low-scoring outcomes (bounced, lost)
 *   - Queries runs table for failed runs
 *   - Ollama generates "what went wrong and what to do differently"
 *
 * INTERNAL CORPUS: Agents learn from their own successes.
 *   - Queries brain_fallback_episodes for high-scoring outcomes (replied, booked)
 *   - Queries cfo_outreach_sequences for approved high-reply emails
 *   - Ollama extracts actionable tactics from winning patterns
 *
 * This is the highest-value improvement over "watch YouTube → instant skill"
 * because it turns real production data into learning.
 *
 * COST: $0 — Ollama only.
 */

'use strict';

const { get, all } = require('../db/connection');
const { chat } = require('./llmClient');

const OLLAMA_MODEL = process.env.OLLAMA_DEFAULT_MODEL || 'llama3.2:3b';

function ollamaChat(systemPrompt, userMessage, timeoutMs = 90000) {
  return chat(systemPrompt, userMessage, {
    model: OLLAMA_MODEL, provider: 'ollama', temperature: 0.5, maxTokens: 512, timeoutMs,
  });
}

// ── Reflection: Learn from failures ──────────────────────────────────────────

/**
 * Get failed episodes for an agent from brain fallback (always local SQLite).
 * @param {string} agentName - Agent name (e.g., 'jake-outreach-agent')
 * @param {number} limit - Max episodes to return
 * @returns {object[]} - Failed episodes with outcome details
 */
function getFailedEpisodes(agentName, limit = 5) {
  return all(`
    SELECT id, agent_name, market, erp_context, contact_title,
           action_taken, outcome, outcome_type, outcome_score,
           days_to_outcome, lead_id, created_at
    FROM brain_fallback_episodes
    WHERE agent_name = ?
      AND outcome_score < 0.3
      AND created_at > datetime('now', '-30 days')
    ORDER BY created_at DESC
    LIMIT ?
  `, [agentName, limit]);
}

/**
 * Get failed runs for an agent.
 * @param {string} agentId - Agent ID (UUID)
 * @param {number} limit - Max runs to return
 * @returns {object[]} - Failed runs with error messages
 */
function getFailedRuns(agentId, limit = 5) {
  return all(`
    SELECT id, status, error_msg, result_data, duration_ms, created_at
    FROM runs
    WHERE agent_id = ?
      AND status = 'failed'
      AND created_at > datetime('now', '-30 days')
    ORDER BY created_at DESC
    LIMIT ?
  `, [agentId, limit]);
}

/**
 * Get negative feedback for an agent from brain fallback.
 * @param {string} agentName - Agent name
 * @param {number} limit - Max feedback entries
 * @returns {object[]} - Rejected/edited feedback
 */
function getNegativeFeedback(agentName, limit = 5) {
  return all(`
    SELECT id, agent_name, output_type, signal, notes, market, created_at
    FROM brain_fallback_feedback
    WHERE agent_name = ?
      AND signal IN ('rejected', 'edited', 'bounced')
      AND created_at > datetime('now', '-30 days')
    ORDER BY created_at DESC
    LIMIT ?
  `, [agentName, limit]);
}

// ── Error taxonomy for structured postmortem ─────────────────────────────────

const ERROR_PATTERNS = {
  network_error: [/time[d\s-]*out/i, /ECONNREFUSED/i, /ENOTFOUND/i, /DNS/i, /socket hang up/i, /aborted/i, /ETIMEDOUT/i],
  data_error: [/parse/i, /JSON/i, /missing field/i, /empty response/i, /undefined/i, /null/i, /NaN/i],
  validation_error: [/score too low/i, /dedup/i, /duplicate/i, /already exists/i, /bad format/i, /invalid/i],
  external_error: [/rate limit/i, /429/i, /503/i, /502/i, /service unavailable/i, /quota/i, /API.*error/i],
  logic_error: [/wrong/i, /incorrect/i, /mismatch/i, /unexpected/i, /failed.*assertion/i],
};

/**
 * Classify an error message into a category.
 * @param {string} errorMsg
 * @returns {string} - network_error, data_error, validation_error, external_error, logic_error, or unknown
 */
function classifyError(errorMsg) {
  if (!errorMsg) return 'unknown';
  for (const [category, patterns] of Object.entries(ERROR_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(errorMsg)) return category;
    }
  }
  return 'unknown';
}

/**
 * Generate a structured reflection report from failures with error taxonomy.
 * Failures are pre-classified before sending to Ollama. Infrastructure failures
 * (network/external >60% of total) are flagged as systemic and don't produce
 * skill candidates — you can't train your way out of a timeout.
 *
 * @param {object} agent - Agent row from DB
 * @param {{ episodes: object[], runs: object[], feedback: object[] }} failures
 * @returns {{ summary, takeaways, skill_name, confidence, error_category?, is_systemic?, root_cause? }}
 */
async function generateReflection(agent, failures) {
  const { episodes = [], runs = [], feedback = [] } = failures;

  // Pre-classify all failures into error taxonomy
  const taxonomy = { network_error: 0, data_error: 0, validation_error: 0, external_error: 0, logic_error: 0, unknown: 0 };
  const failureDetails = [];

  if (episodes.length > 0) {
    failureDetails.push('## Failed Outcomes (Brain Episodes)');
    for (const ep of episodes) {
      const category = classifyError(ep.outcome);
      taxonomy[category]++;
      failureDetails.push(`- [${category}] ${ep.outcome} (score: ${ep.outcome_score}, type: ${ep.outcome_type})`);
      failureDetails.push(`  Action: ${ep.action_taken}`);
      failureDetails.push(`  Market: ${ep.market || 'unknown'}, ERP: ${ep.erp_context || 'unknown'}`);
    }
  }

  if (runs.length > 0) {
    failureDetails.push('\n## Failed Runs');
    for (const r of runs) {
      const category = classifyError(r.error_msg);
      taxonomy[category]++;
      failureDetails.push(`- [${category}] Error: ${r.error_msg || 'unknown'} (${r.created_at})`);
    }
  }

  if (feedback.length > 0) {
    failureDetails.push('\n## Negative Feedback');
    for (const f of feedback) {
      const category = classifyError(f.notes);
      taxonomy[category]++;
      failureDetails.push(`- [${category}] ${f.signal}: ${f.notes || 'no notes'} (${f.output_type})`);
    }
  }

  // Build taxonomy summary
  const taxonomyLine = Object.entries(taxonomy).filter(([, v]) => v > 0).map(([k, v]) => `${k}: ${v}`).join(', ');
  const totalFailures = Object.values(taxonomy).reduce((a, b) => a + b, 0);

  // Check if failures are predominantly infrastructure (not trainable)
  const infraCount = taxonomy.network_error + taxonomy.external_error;
  if (infraCount > totalFailures * 0.6) {
    const dominantCategory = taxonomy.network_error >= taxonomy.external_error ? 'network_error' : 'external_error';
    console.log(`[TrainingReflector] Systemic ${dominantCategory} for ${agent.name} (${infraCount}/${totalFailures}) — no skill candidate`);
    return {
      summary: `${infraCount} of ${totalFailures} failures are infrastructure-related (${dominantCategory}). Not a training issue — fix infrastructure. [${taxonomyLine}]`,
      takeaways: ['Fix infrastructure: check network connectivity, API rate limits, service health', 'Do not create skills for infrastructure failures'],
      skill_name: null,
      confidence: 0.9,
      error_category: dominantCategory,
      is_systemic: true,
    };
  }

  const systemPrompt = `You are a performance analyst doing a STRUCTURED POSTMORTEM of an AI agent's failures. Classify the root cause, determine if systemic or one-off, and produce ONE concrete improvement.

Return ONLY valid JSON:
{
  "error_category": "network_error|data_error|validation_error|external_error|logic_error",
  "is_systemic": false,
  "root_cause": "specific root cause in one sentence",
  "summary": "2-3 sentences: what pattern caused these failures and what specific change would prevent them",
  "takeaways": ["concrete takeaway 1", "concrete takeaway 2", "concrete takeaway 3"],
  "skill_name": "short_snake_case_name_for_the_improvement",
  "confidence": 0.6-0.9
}

Error taxonomy pre-analysis: ${taxonomyLine}

Be specific. "Write better emails" is useless. "Use prospect's ERP name in subject line — bounces correlated with generic subjects" is useful.
If failures are infrastructure (timeouts, API down), set is_systemic=true and don't suggest a skill fix.`;

  const userMessage = `Agent: ${agent.name} (${agent.description || 'AI agent'})

Error Taxonomy: ${taxonomyLine} (${totalFailures} total failures)

Here are their recent failures:

${failureDetails.join('\n')}

Analyze the pattern. What is the root cause? Is it systemic or actionable?`;

  const raw = await ollamaChat(systemPrompt, userMessage);

  // Parse JSON
  let cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
  const brace = cleaned.indexOf('{');
  if (brace > 0) cleaned = cleaned.slice(brace);

  let data;
  try { data = JSON.parse(cleaned); } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) try { data = JSON.parse(m[0]); } catch {}
  }

  if (data) {
    // If Ollama says systemic + infra category, don't create a skill
    const ollamaSystemic = data.is_systemic === true && ['network_error', 'external_error'].includes(data.error_category);
    return {
      summary: data.summary || 'Reflection on recent failures',
      takeaways: data.takeaways || [],
      skill_name: ollamaSystemic ? null : (data.skill_name || 'failure_pattern_fix').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 50),
      confidence: data.confidence || 0.7,
      error_category: data.error_category || 'unknown',
      is_systemic: data.is_systemic || false,
      root_cause: data.root_cause || null,
    };
  }

  return {
    summary: `Reflected on ${episodes.length} failed episodes and ${runs.length} failed runs. Pattern unclear — needs more data. [${taxonomyLine}]`,
    takeaways: ['Review individual failures manually'],
    skill_name: 'general_failure_review',
    confidence: 0.4,
    error_category: 'unknown',
    is_systemic: false,
  };
}

// ── Internal Corpus: Learn from successes ────────────────────────────────────

/**
 * Get high-scoring episodes for an agent (successful outcomes).
 * @param {string} agentName - Agent name
 * @param {number} limit - Max episodes
 * @returns {object[]}
 */
function getSuccessfulEpisodes(agentName, limit = 5) {
  return all(`
    SELECT id, agent_name, market, erp_context, contact_title,
           action_taken, outcome, outcome_type, outcome_score,
           days_to_outcome, created_at
    FROM brain_fallback_episodes
    WHERE agent_name = ?
      AND outcome_score >= 0.8
      AND created_at > datetime('now', '-60 days')
    ORDER BY outcome_score DESC, created_at DESC
    LIMIT ?
  `, [agentName, limit]);
}

/**
 * Get approved outreach with replies (for outreach agents).
 * @param {string} sourceAgent - 'jake' or 'cfo'
 * @param {number} limit
 * @returns {object[]}
 */
function getWinningOutreach(sourceAgent, limit = 5) {
  return all(`
    SELECT s.email_subject, s.email_body, l.company_name, l.erp_type, l.city, l.state
    FROM cfo_outreach_sequences s
    JOIN cfo_leads l ON s.lead_id = l.id
    WHERE s.status = 'replied'
      AND s.source_agent = ?
      AND s.replied_at > datetime('now', '-60 days')
    ORDER BY s.replied_at DESC
    LIMIT ?
  `, [sourceAgent, limit]);
}

/**
 * Get approved content pieces (for content agents).
 * @param {string} sourceAgent - 'jake' or 'cfo'
 * @param {number} limit
 * @returns {object[]}
 */
function getWinningContent(sourceAgent, limit = 5) {
  return all(`
    SELECT title, content_type, body, created_at
    FROM cfo_content_pieces
    WHERE source_agent = ?
      AND status = 'approved'
      AND created_at > datetime('now', '-60 days')
    ORDER BY created_at DESC
    LIMIT ?
  `, [sourceAgent, limit]);
}

/**
 * Generate internal corpus lesson from successful patterns.
 * @param {object} agent - Agent row from DB
 * @param {{ episodes: object[], outreach: object[], content: object[] }} materials
 * @returns {{ summary, takeaways, skill_name, confidence }}
 */
async function generateInternalCorpusLesson(agent, materials) {
  const { episodes = [], outreach = [], content = [] } = materials;

  const successDetails = [];

  if (episodes.length > 0) {
    successDetails.push('## Successful Outcomes (Brain Episodes)');
    for (const ep of episodes) {
      successDetails.push(`- ${ep.outcome} (score: ${ep.outcome_score.toFixed(1)})`);
      successDetails.push(`  Action: ${ep.action_taken}`);
      successDetails.push(`  Market: ${ep.market || 'unknown'}, ERP: ${ep.erp_context || 'unknown'}`);
    }
  }

  if (outreach.length > 0) {
    successDetails.push('\n## Emails That Got Replies');
    for (const o of outreach) {
      successDetails.push(`- "${o.email_subject}" → ${o.company_name} (${o.erp_type || 'unknown ERP'})`);
      successDetails.push(`  Body preview: ${(o.email_body || '').slice(0, 150)}...`);
    }
  }

  if (content.length > 0) {
    successDetails.push('\n## Approved Content');
    for (const c of content) {
      successDetails.push(`- "${c.title}" (${c.content_type})`);
      successDetails.push(`  Preview: ${(c.body || '').slice(0, 150)}...`);
    }
  }

  if (successDetails.length === 0) {
    return null; // No internal corpus material available
  }

  const systemPrompt = `You are a performance analyst extracting winning patterns from an AI agent's best work. Your job is to find the SPECIFIC tactics that made these outcomes successful.

Return ONLY valid JSON:
{
  "summary": "2-3 sentences: what pattern made these successful and how to replicate it",
  "takeaways": ["specific tactic 1", "specific tactic 2", "specific tactic 3"],
  "skill_name": "short_snake_case_name_for_the_pattern",
  "confidence": 0.7-0.95
}

Be specific. "These emails were good" is useless. "Subject lines naming the prospect's ERP system + mentioning a specific pain got replies — 4 of 5 replied emails mentioned QuickBooks or Sage by name in the first sentence" is useful.`;

  const userMessage = `Agent: ${agent.name} (${agent.description || 'AI agent'})

Here are their recent successes:

${successDetails.join('\n')}

Extract the ONE most actionable pattern from these wins.`;

  const raw = await ollamaChat(systemPrompt, userMessage);

  let cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
  const brace = cleaned.indexOf('{');
  if (brace > 0) cleaned = cleaned.slice(brace);

  let data;
  try { data = JSON.parse(cleaned); } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) try { data = JSON.parse(m[0]); } catch {}
  }

  if (data) {
    return {
      summary: data.summary || 'Extracted pattern from successful outcomes',
      takeaways: data.takeaways || [],
      skill_name: (data.skill_name || 'winning_pattern').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 50),
      confidence: data.confidence || 0.8,
    };
  }

  return {
    summary: `Studied ${episodes.length} successful episodes and ${outreach.length + content.length} approved outputs. Pattern extraction incomplete.`,
    takeaways: ['Review successful outputs manually'],
    skill_name: 'success_pattern_review',
    confidence: 0.5,
  };
}

// ── Availability checks (used by heartbeat triage) ──────────────────────────

/**
 * Check if an agent has failure material worth reflecting on.
 * @param {string} agentName
 * @param {string} agentId
 * @returns {{ available: boolean, episodes: number, runs: number, feedback: number }}
 */
function hasReflectionMaterial(agentName, agentId) {
  const episodes = get(
    "SELECT COUNT(*) AS c FROM brain_fallback_episodes WHERE agent_name = ? AND outcome_score < 0.3 AND created_at > datetime('now', '-30 days')",
    [agentName]
  )?.c || 0;

  const runs = get(
    "SELECT COUNT(*) AS c FROM runs WHERE agent_id = ? AND status = 'failed' AND created_at > datetime('now', '-30 days')",
    [agentId]
  )?.c || 0;

  const feedback = get(
    "SELECT COUNT(*) AS c FROM brain_fallback_feedback WHERE agent_name = ? AND signal IN ('rejected', 'edited', 'bounced') AND created_at > datetime('now', '-30 days')",
    [agentName]
  )?.c || 0;

  return { available: (episodes + runs + feedback) >= 2, episodes, runs, feedback };
}

/**
 * Check if an agent has successful material worth studying.
 * @param {string} agentName
 * @param {string} sourceAgent - 'jake' or 'cfo' (for outreach/content tables)
 * @returns {{ available: boolean, episodes: number, outreach: number, content: number }}
 */
function hasInternalCorpusMaterial(agentName, sourceAgent) {
  const episodes = get(
    "SELECT COUNT(*) AS c FROM brain_fallback_episodes WHERE agent_name = ? AND outcome_score >= 0.8 AND created_at > datetime('now', '-60 days')",
    [agentName]
  )?.c || 0;

  let outreach = 0, content = 0;
  if (sourceAgent) {
    outreach = get(
      "SELECT COUNT(*) AS c FROM cfo_outreach_sequences WHERE status = 'replied' AND source_agent = ? AND replied_at > datetime('now', '-60 days')",
      [sourceAgent]
    )?.c || 0;

    content = get(
      "SELECT COUNT(*) AS c FROM cfo_content_pieces WHERE status = 'approved' AND source_agent = ? AND created_at > datetime('now', '-60 days')",
      [sourceAgent]
    )?.c || 0;
  }

  return { available: (episodes + outreach + content) >= 1, episodes, outreach, content };
}

module.exports = {
  classifyError,
  getFailedEpisodes,
  getFailedRuns,
  getNegativeFeedback,
  generateReflection,
  getSuccessfulEpisodes,
  getWinningOutreach,
  getWinningContent,
  generateInternalCorpusLesson,
  hasReflectionMaterial,
  hasInternalCorpusMaterial,
};
