/**
 * @file dreamTeamNightly.js
 * @description Dream Team nightly learning cycle — scorecards, self-assessment,
 * pattern proposals, Ralph QA gate, Todd overnight actions, morning report.
 *
 * NIGHTLY SCHEDULE:
 *   11:00 PM  collectDailyData()       — snapshot day's performance ($0)
 *   11:15 PM  scoreAgents()            — GPT-4o-mini grades A-F (~$0.015)
 *   11:30 PM  selfAssessAndPropose()   — each agent proposes patterns (~$0.015)
 *   11:45 PM  ralphQAGate()            — Ralph reviews proposals (~$0.006)
 *   12:00 AM  toddOvernightActions()   — Todd makes changes (~$0.006)
 *   6:30 AM   buildMorningReport()     — accountability report (~$0.006)
 *
 * TOTAL COST: ~$0.05-0.07/night
 */

'use strict';

const { get, run, all } = require('../db/connection');
const { chat } = require('./llmClient');

const MODEL = process.env.DT_MODEL || 'gpt-4o-mini';
const PROVIDER = process.env.DT_PROVIDER || 'openai';

function llm(system, user, maxTokens = 1024) {
  return chat(system, user, { model: MODEL, provider: PROVIDER, temperature: 0.3, maxTokens, timeoutMs: 30000 });
}

// ════════════════════════════════════════════════════════════════════════════
// DREAM TEAM ROSTER + METRICS DEFINITIONS
// ════════════════════════════════════════════════════════════════════════════

const DREAM_TEAM = {
  todd: {
    label: 'Todd',
    dims: [
      { name: 'Routing Accuracy', weight: 0.30, query: (d) => `${d.runs_completed} runs completed, ${d.runs_failed} failed` },
      { name: 'Briefing Completeness', weight: 0.25, query: (d) => `Morning digest ${d.digest_posted ? 'posted' : 'MISSED'}` },
      { name: 'Blocker Detection', weight: 0.25, query: (d) => `${d.failed_runs_flagged}/${d.runs_failed} failures flagged` },
      { name: 'Cost Management', weight: 0.20, query: (d) => `$${d.total_cost.toFixed(4)} spent (budget $5)` },
    ],
  },
  scout: {
    label: 'Scout',
    dims: [
      { name: 'Lead Volume', weight: 0.25, query: (d) => `${d.leads_discovered} leads found` },
      { name: 'Enrichment Hit Rate', weight: 0.30, query: (d) => `${d.enrichment_with_email}/${d.enrichment_attempted} emails found (${d.enrichment_rate}%)` },
      { name: 'Data Quality', weight: 0.25, query: (d) => `${d.leads_complete}/${d.leads_discovered} with full data` },
      { name: 'Signal Freshness', weight: 0.20, query: (d) => `${d.brain_observations} observations written` },
    ],
  },
  charlie: {
    label: 'Charlie',
    dims: [
      { name: 'Build Completion', weight: 0.30, query: (d) => `${d.builds_completed}/${d.builds_attempted} builds succeeded` },
      { name: 'QA Pass Rate', weight: 0.30, query: (d) => `${d.qa_passes}/${d.qa_submissions} passed Ralph first try` },
      { name: 'Build Speed', weight: 0.20, query: (d) => `avg ${d.avg_build_duration_s}s per build` },
      { name: 'Cost Efficiency', weight: 0.20, query: (d) => `$${d.avg_build_cost.toFixed(3)}/build avg` },
    ],
  },
  ralph: {
    label: 'Ralph',
    dims: [
      { name: 'Review Volume', weight: 0.25, query: (d) => `${d.reviews_completed} reviews done` },
      { name: 'False Pass Rate', weight: 0.25, query: (d) => `${d.false_passes} items passed then failed later` },
      { name: 'Review Speed', weight: 0.25, query: (d) => `avg ${d.avg_review_duration_s}s per review` },
      { name: 'Pattern Documentation', weight: 0.25, query: (d) => `${d.brain_observations} observations written` },
    ],
  },
  quill: {
    label: 'Quill',
    dims: [
      { name: 'Output Volume', weight: 0.20, query: (d) => `${d.content_drafted} pieces drafted` },
      { name: 'QA Pass Rate', weight: 0.30, query: (d) => `${d.qa_passes}/${d.qa_submissions} passed Ralph` },
      { name: 'Reply Rate', weight: 0.30, query: (d) => `${d.emails_replied}/${d.emails_sent} got replies (${d.reply_rate}%)` },
      { name: 'Voice Consistency', weight: 0.20, query: (d) => `${d.voice_rejections} voice rejections` },
    ],
  },
};

function getGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

// ════════════════════════════════════════════════════════════════════════════
// PHASE 1: DATA COLLECTION (11 PM)
// ════════════════════════════════════════════════════════════════════════════

function collectDailyData() {
  const today = new Date().toISOString().slice(0, 10);

  // Check if already collected
  const existing = get('SELECT id FROM dt_daily_snapshots WHERE snapshot_date = ?', [today]);
  if (existing) return JSON.parse(get('SELECT data FROM dt_daily_snapshots WHERE snapshot_date = ?', [today])?.data || '{}');

  const data = {
    date: today,

    // Run stats
    runs_completed: get("SELECT COUNT(*) c FROM runs WHERE DATE(completed_at)=? AND status='completed'", [today])?.c || 0,
    runs_failed: get("SELECT COUNT(*) c FROM runs WHERE DATE(completed_at)=? AND status='failed'", [today])?.c || 0,
    total_cost: get("SELECT COALESCE(SUM(cost_usd),0) t FROM runs WHERE DATE(created_at)=? AND status='completed'", [today])?.t || 0,

    // Lead stats
    leads_discovered: get("SELECT COUNT(*) c FROM cfo_leads WHERE DATE(created_at)=?", [today])?.c || 0,
    leads_enriched: get("SELECT COUNT(*) c FROM cfo_leads WHERE DATE(enriched_at)=?", [today])?.c || 0,
    leads_complete: get("SELECT COUNT(*) c FROM cfo_leads WHERE DATE(created_at)=? AND contact_email IS NOT NULL", [today])?.c || 0,

    // Content stats
    content_drafted: get("SELECT COUNT(*) c FROM cfo_content_pieces WHERE DATE(created_at)=?", [today])?.c || 0,
    emails_drafted: get("SELECT COUNT(*) c FROM cfo_outreach_sequences WHERE DATE(created_at)=? AND status='draft'", [today])?.c || 0,
    emails_sent: get("SELECT COUNT(*) c FROM cfo_outreach_sequences WHERE DATE(sent_at)=?", [today])?.c || 0,
    emails_replied: get("SELECT COUNT(*) c FROM cfo_outreach_sequences WHERE DATE(replied_at)=?", [today])?.c || 0,

    // RSE stats
    rse_videos: get("SELECT COUNT(*) c FROM rse_transcripts WHERE DATE(created_at)=?", [today])?.c || 0,
    rse_signals: get("SELECT COUNT(*) c FROM rse_signals WHERE DATE(created_at)=?", [today])?.c || 0,

    // Brain stats
    brain_observations: 0, // Will be filled from brain if available

    // Morning digest
    digest_posted: get("SELECT COUNT(*) c FROM runs WHERE DATE(completed_at)=? AND result_data LIKE '%Morning digest%'", [today])?.c > 0,

    // Agent-specific run counts
    agent_runs: all("SELECT r.agent_id, a.name, COUNT(*) c, SUM(CASE WHEN r.status='completed' THEN 1 ELSE 0 END) ok, SUM(CASE WHEN r.status='failed' THEN 1 ELSE 0 END) fail FROM runs r JOIN agents a ON a.id=r.agent_id WHERE DATE(r.created_at)=? GROUP BY r.agent_id", [today]),
  };

  // Derived metrics
  data.enrichment_attempted = data.leads_enriched || 1;
  data.enrichment_with_email = get("SELECT COUNT(*) c FROM cfo_leads WHERE DATE(enriched_at)=? AND contact_email IS NOT NULL", [today])?.c || 0;
  data.enrichment_rate = data.enrichment_attempted > 0 ? Math.round((data.enrichment_with_email / data.enrichment_attempted) * 100) : 0;
  data.reply_rate = data.emails_sent > 0 ? Math.round((data.emails_replied / data.emails_sent) * 100) : 0;
  data.failed_runs_flagged = data.runs_failed; // Assume all flagged for now

  // Build per-agent summaries
  data.builds_attempted = 0;
  data.builds_completed = 0;
  data.qa_submissions = 0;
  data.qa_passes = 0;
  data.reviews_completed = 0;
  data.false_passes = 0;
  data.voice_rejections = 0;
  data.avg_build_duration_s = 0;
  data.avg_build_cost = 0;
  data.avg_review_duration_s = 0;

  run('INSERT OR REPLACE INTO dt_daily_snapshots (snapshot_date, data) VALUES (?, ?)', [today, JSON.stringify(data)]);
  console.log(`[DreamTeam] Data collected for ${today}`);
  return data;
}

// ════════════════════════════════════════════════════════════════════════════
// PHASE 2: SCORECARD GRADING (11:15 PM)
// ════════════════════════════════════════════════════════════════════════════

async function scoreAgents(snapshot) {
  const today = new Date().toISOString().slice(0, 10);
  const scorecards = [];

  for (const [agentName, config] of Object.entries(DREAM_TEAM)) {
    // Check if already scored
    const existing = get('SELECT id FROM dt_scorecards WHERE agent_name = ? AND score_date = ?', [agentName, today]);
    if (existing) {
      scorecards.push(get('SELECT * FROM dt_scorecards WHERE id = ?', [existing.id]));
      continue;
    }

    // Get yesterday's score for trend
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const prevCard = get('SELECT composite_score FROM dt_scorecards WHERE agent_name = ? AND score_date = ?', [agentName, yesterday]);

    // Build metrics summary for LLM
    const metricsSummary = config.dims.map(d => `${d.name}: ${d.query(snapshot)}`).join('\n');

    // Get active patterns for context
    const activePatterns = all('SELECT pattern_text FROM dt_learned_patterns WHERE agent_name = ? AND status = \'active\'', [agentName]);
    const patternsContext = activePatterns.length > 0
      ? `\nActive learned patterns (${activePatterns.length}):\n${activePatterns.map(p => `- ${p.pattern_text}`).join('\n')}`
      : '\nNo active learned patterns yet.';

    const scorePrompt = `Score this Dream Team agent's performance today.

AGENT: ${config.label} (${agentName})
DATE: ${today}

TODAY'S METRICS:
${metricsSummary}
${patternsContext}

Score each dimension 0-100 based on the metrics. Be honest — if there's no data for a dimension, score 50 (baseline).
Return ONLY valid JSON:
{
  "dim1_score": <0-100>,
  "dim2_score": <0-100>,
  "dim3_score": <0-100>,
  "dim4_score": <0-100>,
  "assessment": "1-2 sentence performance summary",
  "recommendations": ["improvement 1", "improvement 2"]
}`;

    let scores;
    try {
      const raw = await llm('You are a strict performance evaluator for an AI agent team. Score honestly — no inflation.', scorePrompt);
      scores = parseJson(raw);
    } catch (err) {
      console.warn(`[DreamTeam] Scoring failed for ${agentName}: ${err.message}`);
      scores = { dim1_score: 50, dim2_score: 50, dim3_score: 50, dim4_score: 50, assessment: 'Scoring failed', recommendations: [] };
    }

    const d1 = clamp(scores.dim1_score, 0, 100);
    const d2 = clamp(scores.dim2_score, 0, 100);
    const d3 = clamp(scores.dim3_score, 0, 100);
    const d4 = clamp(scores.dim4_score, 0, 100);
    const composite = Math.round(d1 * config.dims[0].weight + d2 * config.dims[1].weight + d3 * config.dims[2].weight + d4 * config.dims[3].weight);
    const grade = getGrade(composite);
    const prev = prevCard?.composite_score || null;
    const trend = prev === null ? 'stable' : composite > prev + 5 ? 'up' : composite < prev - 5 ? 'down' : 'stable';

    run(`INSERT INTO dt_scorecards
      (agent_name, score_date, dim1_name, dim1_score, dim2_name, dim2_score, dim3_name, dim3_score, dim4_name, dim4_score,
       composite_score, grade, prev_composite, trend, assessment, recommendations)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      agentName, today,
      config.dims[0].name, d1, config.dims[1].name, d2, config.dims[2].name, d3, config.dims[3].name, d4,
      composite, grade, prev, trend,
      scores.assessment || '', JSON.stringify(scores.recommendations || []),
    ]);

    const card = get('SELECT * FROM dt_scorecards WHERE agent_name = ? AND score_date = ?', [agentName, today]);
    scorecards.push(card);
    console.log(`[DreamTeam] ${config.label}: ${grade} (${composite}) — ${scores.assessment}`);
  }

  return scorecards;
}

// ════════════════════════════════════════════════════════════════════════════
// PHASE 3: SELF-ASSESSMENT + PATTERN PROPOSALS (11:30 PM)
// ════════════════════════════════════════════════════════════════════════════

async function selfAssessAndPropose(scorecards) {
  const proposals = [];

  for (const card of scorecards) {
    const config = DREAM_TEAM[card.agent_name];
    if (!config) continue;

    const prompt = `You are ${config.label}, reviewing your scorecard for today.

SCORECARD:
  ${card.dim1_name}: ${card.dim1_score}/100
  ${card.dim2_name}: ${card.dim2_score}/100
  ${card.dim3_name}: ${card.dim3_score}/100
  ${card.dim4_name}: ${card.dim4_score}/100
  COMPOSITE: ${card.composite_score}/100 (${card.grade})
  TREND: ${card.trend}

Based on your performance, propose 0-2 learned patterns — specific behavioral changes that would improve your weakest dimensions.

A learned pattern is a CONCRETE instruction like:
- "When enriching Florida leads, try direct domain guess before Bing — 31% vs 18% hit rate"
- "Cold emails with project-specific subjects get 2.3x more replies"
- "Skip LinkedIn search for companies with <10 employees — hit rate is 0%"

NOT vague advice like "try harder" or "be more thorough."

Return ONLY valid JSON:
{
  "self_assessment": "2-3 sentences on what went well and what didn't",
  "patterns": [
    {
      "pattern_text": "Specific actionable instruction",
      "category": "timing|quality|workflow|outreach|enrichment|building|scoring",
      "evidence": "What data supports this pattern"
    }
  ]
}

If your score is A (90+) and stable, return {"self_assessment": "...", "patterns": []} — no changes needed.`;

    try {
      const raw = await llm(`You are ${config.label}, a Dream Team agent doing your nightly self-review. Be specific and data-driven.`, prompt);
      const result = parseJson(raw);

      if (result?.patterns?.length > 0) {
        for (const p of result.patterns.slice(0, 2)) {
          run(`INSERT INTO dt_learned_patterns
            (agent_name, pattern_text, category, source_type, source_scorecard_id, evidence, status)
            VALUES (?, ?, ?, 'self_assessment', ?, ?, 'proposed')`, [
            card.agent_name, p.pattern_text, p.category || 'workflow', card.id, p.evidence || '',
          ]);
          const patternId = get('SELECT last_insert_rowid() as id')?.id;
          run('INSERT INTO dt_pattern_audit (pattern_id, action, actor, reason) VALUES (?, \'proposed\', ?, ?)', [
            patternId, card.agent_name, result.self_assessment,
          ]);
          proposals.push({ agent: card.agent_name, pattern: p.pattern_text, patternId });
        }
      }

      console.log(`[DreamTeam] ${config.label} self-review: ${result?.patterns?.length || 0} patterns proposed`);
    } catch (err) {
      console.warn(`[DreamTeam] Self-review failed for ${card.agent_name}: ${err.message}`);
    }
  }

  return proposals;
}

// ════════════════════════════════════════════════════════════════════════════
// PHASE 4: RALPH QA GATE (11:45 PM)
// ════════════════════════════════════════════════════════════════════════════

// Anti-drift blocklist
const DRIFT_BLOCKLIST = [
  /lower.*quality/i, /reduce.*threshold/i, /skip.*qa/i, /skip.*review/i,
  /remove.*escalation/i, /disable.*escalation/i, /bypass.*ralph/i,
  /auto.?approve.*all/i, /expand.*authority/i, /increase.*budget/i,
  /delete.*data/i, /send.*email.*directly/i, /push.*code.*directly/i,
  /ignore.*error/i, /skip.*error.?handling/i, /remove.*validation/i,
];

async function ralphQAGate(proposals) {
  if (proposals.length === 0) return { approved: 0, rejected: 0 };

  let approved = 0, rejected = 0;

  // First: blocklist check (no LLM needed)
  for (const p of proposals) {
    const blocked = DRIFT_BLOCKLIST.some(rx => rx.test(p.pattern));
    if (blocked) {
      run('UPDATE dt_learned_patterns SET status = \'archived\', qa_verdict = \'REJECT\', qa_notes = \'Anti-drift blocklist match\', qa_reviewed_at = datetime(\'now\') WHERE id = ?', [p.patternId]);
      run('INSERT INTO dt_pattern_audit (pattern_id, action, actor, reason) VALUES (?, \'rejected\', \'ralph\', \'Anti-drift blocklist match\')', [p.patternId]);
      rejected++;
      console.log(`[DreamTeam] Ralph BLOCKED: "${p.pattern}" (drift blocklist)`);
      continue;
    }
  }

  // Then: LLM review for remaining
  const remaining = proposals.filter(p => {
    const pat = get('SELECT status FROM dt_learned_patterns WHERE id = ?', [p.patternId]);
    return pat?.status === 'proposed';
  });

  if (remaining.length === 0) return { approved, rejected };

  const patternList = remaining.map((p, i) => `${i + 1}. [${p.agent}] "${p.pattern}"`).join('\n');

  const prompt = `You are Ralph, QA Supervisor. Review these proposed learned patterns.

PROPOSED PATTERNS:
${patternList}

For each pattern, decide PASS or REJECT.
REJECT if: it would lower quality, bypass safety checks, expand authority, or conflict with another agent's active patterns.
PASS if: it's a specific, data-backed behavioral improvement.

Return ONLY valid JSON:
{
  "verdicts": [
    {"index": 1, "verdict": "PASS|REJECT", "reason": "one sentence"}
  ]
}`;

  try {
    const raw = await llm('You are Ralph, the skeptical QA supervisor. Protect quality standards. Reject anything that weakens the system.', prompt);
    const result = parseJson(raw);

    if (result?.verdicts) {
      for (const v of result.verdicts) {
        const p = remaining[v.index - 1];
        if (!p) continue;

        if (v.verdict === 'PASS') {
          run('UPDATE dt_learned_patterns SET qa_verdict = \'PASS\', qa_notes = ?, qa_reviewed_at = datetime(\'now\') WHERE id = ?', [v.reason, p.patternId]);
          run('INSERT INTO dt_pattern_audit (pattern_id, action, actor, reason) VALUES (?, \'qa_passed\', \'ralph\', ?)', [p.patternId, v.reason]);
          approved++;
          console.log(`[DreamTeam] Ralph PASSED: [${p.agent}] "${p.pattern}"`);
        } else {
          run('UPDATE dt_learned_patterns SET status = \'archived\', qa_verdict = \'REJECT\', qa_notes = ?, qa_reviewed_at = datetime(\'now\') WHERE id = ?', [v.reason, p.patternId]);
          run('INSERT INTO dt_pattern_audit (pattern_id, action, actor, reason) VALUES (?, \'rejected\', \'ralph\', ?)', [p.patternId, v.reason]);
          rejected++;
          console.log(`[DreamTeam] Ralph REJECTED: [${p.agent}] "${p.pattern}" — ${v.reason}`);
        }
      }
    }
  } catch (err) {
    console.warn(`[DreamTeam] Ralph QA gate failed: ${err.message}`);
  }

  return { approved, rejected };
}

// ════════════════════════════════════════════════════════════════════════════
// PHASE 5: TODD OVERNIGHT ACTIONS (12:00 AM)
// ════════════════════════════════════════════════════════════════════════════

async function toddOvernightActions(scorecards) {
  const today = new Date().toISOString().slice(0, 10);
  const actions = [];

  // 1. Activate Ralph-approved patterns
  const approvedPatterns = all('SELECT * FROM dt_learned_patterns WHERE status = \'proposed\' AND qa_verdict = \'PASS\'');
  for (const p of approvedPatterns) {
    // Check pattern cap (max 10 active per agent)
    const activeCount = get('SELECT COUNT(*) c FROM dt_learned_patterns WHERE agent_name = ? AND status = \'active\'', [p.agent_name])?.c || 0;
    if (activeCount >= 10) {
      // Archive oldest lowest-confidence pattern
      const oldest = get('SELECT id FROM dt_learned_patterns WHERE agent_name = ? AND status = \'active\' ORDER BY confidence ASC, created_at ASC LIMIT 1', [p.agent_name]);
      if (oldest) {
        run('UPDATE dt_learned_patterns SET status = \'archived\' WHERE id = ?', [oldest.id]);
        run('INSERT INTO dt_pattern_audit (pattern_id, action, actor, reason) VALUES (?, \'archived\', \'todd\', \'Pattern cap reached — archived oldest/lowest confidence\')', [oldest.id]);
      }
    }

    // Get pre-activation score
    const currentScore = get('SELECT composite_score FROM dt_scorecards WHERE agent_name = ? ORDER BY score_date DESC LIMIT 1', [p.agent_name]);

    run('UPDATE dt_learned_patterns SET status = \'active\', activated_at = datetime(\'now\'), pre_activation_score = ? WHERE id = ?', [
      currentScore?.composite_score || null, p.id,
    ]);
    run('INSERT INTO dt_pattern_audit (pattern_id, action, actor, reason) VALUES (?, \'activated\', \'todd\', \'Approved by Ralph, activated by Todd\')', [p.id]);

    actions.push({ type: 'pattern_activate', target: `${p.agent_name}: ${p.pattern_text}`, reason: 'Ralph-approved' });
    console.log(`[DreamTeam] Todd activated: [${p.agent_name}] "${p.pattern_text}"`);
  }

  // 2. Check for score-based auto-suspensions
  const activePatterns = all('SELECT * FROM dt_learned_patterns WHERE status = \'active\' AND activated_at IS NOT NULL AND activated_at < datetime(\'now\', \'-3 days\')');
  for (const p of activePatterns) {
    if (!p.pre_activation_score) continue;
    const currentScore = get('SELECT composite_score FROM dt_scorecards WHERE agent_name = ? ORDER BY score_date DESC LIMIT 1', [p.agent_name]);
    if (currentScore && (p.pre_activation_score - currentScore.composite_score) >= 15) {
      run('UPDATE dt_learned_patterns SET status = \'suspended\', suspended_at = datetime(\'now\'), suspension_reason = \'Score dropped 15+ points\', post_activation_score = ? WHERE id = ?', [
        currentScore.composite_score, p.id,
      ]);
      run('INSERT INTO dt_pattern_audit (pattern_id, action, actor, reason) VALUES (?, \'suspended\', \'system\', ?)', [
        p.id, `Score dropped from ${p.pre_activation_score} to ${currentScore.composite_score} after activation`,
      ]);
      actions.push({ type: 'pattern_suspend', target: `${p.agent_name}: ${p.pattern_text}`, reason: `Score dropped ${p.pre_activation_score} → ${currentScore.composite_score}` });
      console.log(`[DreamTeam] Auto-suspended: [${p.agent_name}] "${p.pattern_text}" (score drop)`);
    }
  }

  // 3. Confidence decay (weekly)
  if (new Date().getDay() === 0) { // Sunday
    run('UPDATE dt_learned_patterns SET confidence = MAX(0, confidence - 0.05), updated_at = datetime(\'now\') WHERE status = \'active\'');
    const archived = run('UPDATE dt_learned_patterns SET status = \'archived\' WHERE status = \'active\' AND confidence < 0.3');
    console.log(`[DreamTeam] Weekly confidence decay applied`);
  }

  // Save actions
  for (const a of actions) {
    run('INSERT INTO dt_overnight_actions (action_date, action_type, target, reason, status) VALUES (?, ?, ?, ?, \'executed\')', [
      today, a.type, a.target, a.reason,
    ]);
  }

  return actions;
}

// ════════════════════════════════════════════════════════════════════════════
// PHASE 6: MORNING REPORT (6:30 AM)
// ════════════════════════════════════════════════════════════════════════════

async function buildMorningReport() {
  const today = new Date().toISOString().slice(0, 10);

  // Check if already reported
  const existing = get('SELECT id FROM dt_morning_reports WHERE report_date = ?', [today]);
  if (existing) return get('SELECT * FROM dt_morning_reports WHERE id = ?', [existing.id]);

  const scorecards = all('SELECT * FROM dt_scorecards WHERE score_date = ? ORDER BY composite_score DESC', [today]);
  const actions = all('SELECT * FROM dt_overnight_actions WHERE action_date = ?', [today]);
  const newPatterns = all('SELECT lp.*, pa.action AS audit_action FROM dt_learned_patterns lp LEFT JOIN dt_pattern_audit pa ON pa.pattern_id = lp.id AND pa.action IN (\'activated\',\'rejected\') WHERE DATE(lp.created_at) = ?', [today]);

  // Build report text
  const lines = [`DREAM TEAM OVERNIGHT REPORT — ${today}`, '━'.repeat(50), '', 'SCORECARDS:'];

  for (const card of scorecards) {
    lines.push(`  ${card.agent_name.charAt(0).toUpperCase() + card.agent_name.slice(1)}:`.padEnd(12) +
      `${card.grade} (${card.composite_score})`.padEnd(10) + ' — ' +
      `${card.dim1_name}: ${card.dim1_score} | ${card.dim2_name}: ${card.dim2_score} | ${card.dim3_name}: ${card.dim3_score} | ${card.dim4_name}: ${card.dim4_score}`);
  }

  if (actions.length > 0) {
    lines.push('', 'OVERNIGHT CHANGES (by Todd):');
    actions.forEach((a, i) => lines.push(`  ${i + 1}. [${a.action_type}] ${a.target} — ${a.reason}`));
  }

  if (newPatterns.length > 0) {
    lines.push('', 'PATTERNS:');
    for (const p of newPatterns) {
      const status = p.qa_verdict === 'PASS' ? 'APPROVED' : p.qa_verdict === 'REJECT' ? 'REJECTED' : 'PENDING';
      lines.push(`  [${p.agent_name}] ${status}: "${p.pattern_text}"`);
    }
  }

  // Find lowest scorer for priority
  const lowest = scorecards.length > 0 ? scorecards[scorecards.length - 1] : null;
  if (lowest && lowest.grade !== 'A') {
    lines.push('', `TOP PRIORITY: ${lowest.agent_name}'s ${lowest.grade} grade. Focus: improve weakest dimension.`);
  }

  const reportText = lines.join('\n');

  run(`INSERT INTO dt_morning_reports
    (report_date, report_text, scorecards_json, actions_json, patterns_json)
    VALUES (?, ?, ?, ?, ?)`, [
    today, reportText,
    JSON.stringify(scorecards),
    JSON.stringify(actions),
    JSON.stringify(newPatterns),
  ]);

  // Post to Discord
  try {
    const discord = require('./discordNotifier');
    await discord.sendEmbed({
      title: `🏆 Dream Team Report — ${today}`,
      description: scorecards.map(c =>
        `**${c.agent_name.charAt(0).toUpperCase() + c.agent_name.slice(1)}**: ${c.grade} (${c.composite_score}) ${c.trend === 'up' ? '📈' : c.trend === 'down' ? '📉' : '➡️'}`
      ).join('\n') +
      (actions.length > 0 ? `\n\n**Overnight changes:** ${actions.length}` : '') +
      (newPatterns.length > 0 ? `\n**Patterns learned:** ${newPatterns.filter(p => p.qa_verdict === 'PASS').length} approved` : ''),
      color: 0xf1c40f,
      footer: { text: `Cost: ~$0.05 | Full report at /rse → Dream Team` },
    });
  } catch {}

  console.log(`[DreamTeam] Morning report generated for ${today}`);
  return get('SELECT * FROM dt_morning_reports WHERE report_date = ?', [today]);
}

// ════════════════════════════════════════════════════════════════════════════
// GET ACTIVE PATTERNS FOR INJECTION (called by collectiveBrain.buildAgentContext)
// ════════════════════════════════════════════════════════════════════════════

function getActivePatterns(agentName) {
  return all(
    'SELECT pattern_text, category, confidence FROM dt_learned_patterns WHERE agent_name = ? AND status = \'active\' ORDER BY confidence DESC LIMIT 10',
    [agentName]
  );
}

// ════════════════════════════════════════════════════════════════════════════
// FULL NIGHTLY CYCLE (called by handler)
// ════════════════════════════════════════════════════════════════════════════

async function runFullCycle() {
  console.log('[DreamTeam] === Starting nightly cycle ===');
  const startTime = Date.now();

  const snapshot = collectDailyData();
  const scorecards = await scoreAgents(snapshot);
  const proposals = await selfAssessAndPropose(scorecards);
  const qaResult = await ralphQAGate(proposals);
  const actions = await toddOvernightActions(scorecards);
  const report = await buildMorningReport();

  const durationMs = Date.now() - startTime;
  console.log(`[DreamTeam] === Nightly cycle complete in ${(durationMs / 1000).toFixed(1)}s ===`);

  return {
    scorecards: scorecards.length,
    proposals: proposals.length,
    approved: qaResult.approved,
    rejected: qaResult.rejected,
    actions: actions.length,
    durationMs,
    reportDate: report?.report_date,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════════

function clamp(val, min, max) { return Math.max(min, Math.min(max, typeof val === 'number' ? val : 50)); }

function parseJson(raw) {
  if (!raw) return null;
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  try { return JSON.parse(cleaned); } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) try { return JSON.parse(m[0]); } catch {}
  }
  return null;
}

module.exports = {
  collectDailyData,
  scoreAgents,
  selfAssessAndPropose,
  ralphQAGate,
  toddOvernightActions,
  buildMorningReport,
  getActivePatterns,
  runFullCycle,
  DREAM_TEAM,
};
