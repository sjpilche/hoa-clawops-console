/**
 * @file dreamTeamNightly.js
 * @description Dream Team nightly learning cycle — scorecards, self-assessment,
 * pattern proposals, Ralph QA gate, Todd overnight actions, morning report.
 *
 * NIGHTLY SCHEDULE:
 *   11:00 PM  collectDailyData()       — snapshot day's performance ($0)
 *   11:15 PM  scoreAgents()            — deterministic A-F grading ($0)
 *   11:30 PM  runDiagnostics()         — detect stalls, broken joints ($0)
 *   12:00 AM  toddOvernightActions()   — activate patterns, auto-disable ($0)
 *   6:30 AM   buildMorningReport()     — diagnostics-driven briefing ($0)
 *
 * TOTAL COST: $0/night (no LLM calls)
 */

'use strict';

const { get, run, all } = require('../db/connection');

// ════════════════════════════════════════════════════════════════════════════
// DREAM TEAM ROSTER + METRICS DEFINITIONS
// ════════════════════════════════════════════════════════════════════════════

// ── DETERMINISTIC SCORING ────────────────────────────────────────────────────
// Each dimension has concrete thresholds. No LLM — just math.
// Scores map to: A=90+ B=75+ C=60+ D=40+ F=<40
const DREAM_TEAM = {
  operations: {
    label: 'Operations',
    role: 'System Health',
    dims: [
      {
        name: 'Run Success Rate', weight: 0.35,
        score: (d) => {
          const total = d.runs_completed + d.runs_failed;
          if (total === 0) return { value: 50, detail: 'No runs today' };
          const rate = d.runs_completed / total;
          const s = Math.round(rate * 100);
          return { value: s, detail: `${d.runs_completed}/${total} runs succeeded (${s}%)` };
        },
      },
      {
        name: 'Cost Efficiency', weight: 0.25,
        score: (d) => {
          if (d.runs_completed === 0) return { value: 50, detail: 'No completed runs' };
          const costPerRun = d.total_cost / d.runs_completed;
          // < $0.01/run = A, < $0.05 = B, < $0.10 = C, < $0.25 = D, else F
          const s = costPerRun < 0.01 ? 95 : costPerRun < 0.05 ? 80 : costPerRun < 0.10 ? 65 : costPerRun < 0.25 ? 45 : 25;
          return { value: s, detail: `$${costPerRun.toFixed(4)}/run ($${d.total_cost.toFixed(2)} total)` };
        },
      },
      {
        name: 'Schedule Coverage', weight: 0.20,
        score: (d) => {
          const agentRuns = d.agent_runs || [];
          const activeAgents = agentRuns.length;
          // 10+ agents running = A, 7+ = B, 4+ = C, 1+ = D, 0 = F
          const s = activeAgents >= 10 ? 90 : activeAgents >= 7 ? 78 : activeAgents >= 4 ? 62 : activeAgents >= 1 ? 45 : 20;
          return { value: s, detail: `${activeAgents} agents ran today` };
        },
      },
      {
        name: 'Uptime', weight: 0.20,
        score: (d) => {
          // If we're running and collecting data, uptime is good
          const s = d.runs_completed > 0 ? 90 : 30;
          return { value: s, detail: d.runs_completed > 0 ? 'System active' : 'No activity detected' };
        },
      },
    ],
  },
  pipeline: {
    label: 'Pipeline',
    role: 'Lead Flow & Conversion',
    dims: [
      {
        name: 'Discovery', weight: 0.25,
        score: (d) => {
          const leads = d.leads_discovered;
          // 10+/day = A, 5+ = B, 2+ = C, 1+ = D, 0 = F
          const s = leads >= 10 ? 92 : leads >= 5 ? 78 : leads >= 2 ? 62 : leads >= 1 ? 45 : 25;
          return { value: s, detail: `${leads} new leads discovered today` };
        },
      },
      {
        name: 'Enrichment', weight: 0.25,
        score: (d) => {
          if (d.enrichment_attempted === 0) return { value: 50, detail: 'No enrichment attempts' };
          const rate = d.enrichment_rate;
          // 60%+ = A, 40%+ = B, 25%+ = C, 10%+ = D, else F
          const s = rate >= 60 ? 92 : rate >= 40 ? 78 : rate >= 25 ? 62 : rate >= 10 ? 45 : 25;
          return { value: s, detail: `${d.enrichment_with_email}/${d.enrichment_attempted} emails found (${rate}%)` };
        },
      },
      {
        name: 'Reply Rate (30d)', weight: 0.30,
        score: (d) => {
          if (d.leads_discovered_30d === 0) return { value: 50, detail: 'No leads in 30d window' };
          const rate = d.leads_that_replied_30d / d.leads_discovered_30d;
          // 10%+ = A, 5%+ = B, 2%+ = C, 0.5%+ = D, else F
          const s = rate >= 0.10 ? 95 : rate >= 0.05 ? 80 : rate >= 0.02 ? 65 : rate >= 0.005 ? 45 : 25;
          return { value: s, detail: `${d.leads_that_replied_30d}/${d.leads_discovered_30d} replied (${(rate*100).toFixed(1)}%)` };
        },
      },
      {
        name: 'Revenue Progress', weight: 0.20,
        score: (d) => {
          const meetings = d.meetings_booked_7d || 0;
          const pilots = d.pilots_started_7d || 0;
          const total = meetings + pilots;
          // 3+ = A, 2 = B, 1 = C, 0 with replies = D, 0 without = F
          const s = total >= 3 ? 95 : total >= 2 ? 80 : total >= 1 ? 65 : d.leads_that_replied_30d > 0 ? 45 : 25;
          return { value: s, detail: `${meetings} meetings + ${pilots} pilots this week` };
        },
      },
    ],
  },
  outreach: {
    label: 'Outreach',
    role: 'Email & Content Quality',
    dims: [
      {
        name: 'Email Volume', weight: 0.20,
        score: (d) => {
          const sent = d.emails_sent;
          const s = sent >= 20 ? 90 : sent >= 10 ? 78 : sent >= 5 ? 62 : sent >= 1 ? 45 : 25;
          return { value: s, detail: `${sent} emails sent today` };
        },
      },
      {
        name: 'Reply Rate', weight: 0.35,
        score: (d) => {
          if (d.emails_sent === 0) return { value: 50, detail: 'No emails sent' };
          const rate = d.reply_rate;
          const s = rate >= 10 ? 95 : rate >= 5 ? 80 : rate >= 2 ? 65 : rate >= 0.5 ? 45 : 25;
          return { value: s, detail: `${d.emails_replied}/${d.emails_sent} replied (${rate}%)` };
        },
      },
      {
        name: 'QA Pass Rate', weight: 0.25,
        score: (d) => {
          if (d.qa_submissions === 0) return { value: 50, detail: 'No QA submissions' };
          const rate = d.qa_submissions > 0 ? Math.round(d.qa_passes / d.qa_submissions * 100) : 0;
          const s = rate >= 90 ? 92 : rate >= 75 ? 78 : rate >= 50 ? 60 : rate >= 25 ? 42 : 25;
          return { value: s, detail: `${d.qa_passes}/${d.qa_submissions} passed QA (${rate}%)` };
        },
      },
      {
        name: 'Bounce Rate', weight: 0.20,
        score: (d) => {
          const bounceStr = String(d.bounce_rate_7d || '0').replace('%', '');
          const bounce = parseFloat(bounceStr) || 0;
          // Lower is better: 0% = A, <2% = B, <5% = C, <10% = D, else F
          const s = bounce === 0 ? 92 : bounce < 2 ? 80 : bounce < 5 ? 65 : bounce < 10 ? 45 : 25;
          return { value: s, detail: `${bounce}% bounce rate (7d)` };
        },
      },
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
  data.failed_runs_flagged = data.runs_failed;

  // ── REVENUE METRICS (the ones that actually matter) ──
  data.leads_that_replied_30d = get("SELECT COUNT(*) c FROM cfo_leads WHERE status IN ('replied','meeting_booked','pilot','closed_won') AND updated_at > datetime('now', '-30 days')")?.c || 0;
  data.leads_discovered_30d = get("SELECT COUNT(*) c FROM cfo_leads WHERE created_at > datetime('now', '-30 days')")?.c || 0;
  data.meetings_booked_7d = get("SELECT COUNT(*) c FROM cfo_leads WHERE status = 'meeting_booked' AND updated_at > datetime('now', '-7 days')")?.c || 0;
  data.pilots_started_7d = get("SELECT COUNT(*) c FROM cfo_leads WHERE status = 'pilot' AND updated_at > datetime('now', '-7 days')")?.c || 0;
  data.active_leads = get("SELECT COUNT(*) c FROM cfo_leads WHERE cadence_active = 1")?.c || 0;
  data.replies_today = get("SELECT COUNT(*) c FROM cfo_leads WHERE status = 'replied' AND DATE(updated_at) = ?", [today])?.c || 0;
  data.emails_with_pilot_offer = get("SELECT COUNT(*) c FROM cfo_outreach_sequences WHERE pilot_offer IS NOT NULL AND DATE(created_at) = ?", [today])?.c || 0;
  data.emails_total_today = get("SELECT COUNT(*) c FROM cfo_outreach_sequences WHERE DATE(created_at) = ?", [today])?.c || 0;
  data.content_published_7d = get("SELECT COUNT(*) c FROM cfo_content_pieces WHERE status = 'approved' AND created_at > datetime('now', '-7 days')")?.c || 0;

  // Pipeline velocity
  try {
    data.pipeline_advances_today = get("SELECT COUNT(*) c FROM pipeline_events WHERE DATE(created_at) = ?", [today])?.c || 0;
  } catch { data.pipeline_advances_today = 0; }

  // Market targeting — leads from top-performing markets
  try {
    const topMarkets = all(`
      SELECT city || ', ' || state as market FROM cfo_leads
      WHERE status IN ('replied','meeting_booked','pilot','closed_won') AND city IS NOT NULL
      GROUP BY city, state ORDER BY COUNT(*) DESC LIMIT 5
    `).map(m => m.market);
    if (topMarkets.length > 0) {
      const placeholders = topMarkets.map(() => '?').join(',');
      data.top_market_leads = get(`SELECT COUNT(*) c FROM cfo_leads WHERE DATE(created_at) = ? AND (city || ', ' || state) IN (${placeholders})`, [today, ...topMarkets])?.c || 0;
    } else {
      data.top_market_leads = 0;
    }
  } catch { data.top_market_leads = 0; }

  // Ralph QA effectiveness — bounce rate on Ralph-approved emails
  data.ralph_approved_bounced = get("SELECT COUNT(*) c FROM cfo_outreach_sequences WHERE qa_status = 'passed' AND status = 'bounced'")?.c || 0;
  data.ralph_approved_total = get("SELECT COUNT(*) c FROM cfo_outreach_sequences WHERE qa_status = 'passed' AND status IN ('sent', 'delivered', 'bounced')")?.c || 0;
  data.ralph_bounce_rate = data.ralph_approved_total > 0 ? Math.round((data.ralph_approved_bounced / data.ralph_approved_total) * 100) + '%' : '0%';

  // Overall bounce rate (7d)
  try {
    const sent7d = get("SELECT COUNT(*) c FROM cfo_outreach_sequences WHERE sent_at > datetime('now', '-7 days') AND status IN ('sent','delivered','bounced')")?.c || 0;
    const bounced7d = get("SELECT COUNT(*) c FROM cfo_outreach_sequences WHERE sent_at > datetime('now', '-7 days') AND status = 'bounced'")?.c || 0;
    data.bounce_rate_7d = sent7d > 0 ? Math.round((bounced7d / sent7d) * 100) + '%' : '0%';
  } catch { data.bounce_rate_7d = '0%'; }

  // Build per-agent summaries
  data.builds_attempted = 0;
  data.builds_completed = 0;

  // Ralph QA metrics
  data.qa_submissions = get("SELECT COUNT(*) c FROM cfo_outreach_sequences WHERE DATE(qa_reviewed_at) = ?", [today])?.c || 0;
  data.qa_passes = get("SELECT COUNT(*) c FROM cfo_outreach_sequences WHERE DATE(qa_reviewed_at) = ? AND qa_status = 'passed'", [today])?.c || 0;
  data.reviews_completed = data.qa_submissions;
  data.false_passes = get("SELECT COUNT(*) c FROM ralph_false_passes WHERE DATE(steve_rejected_at) = ?", [today])?.c || 0;
  data.voice_rejections = get("SELECT COUNT(*) c FROM cfo_outreach_sequences WHERE DATE(qa_reviewed_at) = ? AND qa_status = 'failed'", [today])?.c || 0;
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

function scoreAgents(snapshot) {
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

    // Deterministic scoring — each dimension computes its own score from thresholds
    const dimResults = config.dims.map(d => d.score(snapshot));
    const d1 = clamp(dimResults[0].value, 0, 100);
    const d2 = clamp(dimResults[1].value, 0, 100);
    const d3 = clamp(dimResults[2].value, 0, 100);
    const d4 = clamp(dimResults[3].value, 0, 100);
    const composite = Math.round(d1 * config.dims[0].weight + d2 * config.dims[1].weight + d3 * config.dims[2].weight + d4 * config.dims[3].weight);
    const grade = getGrade(composite);
    const prev = prevCard?.composite_score || null;
    const trend = prev === null ? 'new' : composite > prev + 5 ? 'up' : composite < prev - 5 ? 'down' : 'stable';

    // Build assessment from dimension details
    const assessment = dimResults.map((r, i) => `${config.dims[i].name}: ${r.detail}`).join('. ');

    run(`INSERT INTO dt_scorecards
      (agent_name, score_date, dim1_name, dim1_score, dim2_name, dim2_score, dim3_name, dim3_score, dim4_name, dim4_score,
       composite_score, grade, prev_composite, trend, assessment, recommendations)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      agentName, today,
      config.dims[0].name, d1, config.dims[1].name, d2, config.dims[2].name, d3, config.dims[3].name, d4,
      composite, grade, prev, trend, assessment, '[]',
    ]);

    const card = get('SELECT * FROM dt_scorecards WHERE agent_name = ? AND score_date = ?', [agentName, today]);
    scorecards.push(card);
    console.log(`[DreamTeam] ${config.label}: ${grade} (${composite}) — ${assessment.substring(0, 120)}`);
  }

  return scorecards;
}

// (Phases 3-4 removed: selfAssessAndPropose + ralphQAGate cut in deterministic rewrite.
//  Scoring is now threshold-based, no LLM needed. Patterns still managed by Todd actions.)

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

  // 4. Agent performance-based schedule adjustments
  // Check for consecutive F grades → auto-disable schedule + Discord alert
  const agentRuns = all(`
    SELECT r.agent_id, a.name AS agent_name, COUNT(*) AS run_count,
           SUM(CASE WHEN r.status='failed' THEN 1 ELSE 0 END) AS fails
    FROM runs r JOIN agents a ON a.id=r.agent_id
    WHERE DATE(r.created_at) >= DATE('now', '-7 days')
    GROUP BY r.agent_id
    HAVING fails >= 3
  `);

  for (const ar of agentRuns) {
    // Check if agent has consecutive F grades (2+ nights)
    const recentGrades = all(`
      SELECT grade, composite_score FROM dt_scorecards
      WHERE agent_name = ? ORDER BY score_date DESC LIMIT 2
    `, [ar.agent_name]);

    const consecutiveFs = recentGrades.length >= 2 && recentGrades.every(g => g.grade === 'F');

    if (consecutiveFs) {
      // Auto-disable the schedule
      const schedule = get('SELECT id, name FROM schedules WHERE agent_id = ? AND enabled = 1', [ar.agent_id]);
      if (schedule) {
        run('UPDATE schedules SET enabled = 0 WHERE id = ?', [schedule.id]);
        actions.push({
          type: 'schedule_disable',
          target: `${ar.agent_name} (schedule: ${schedule.name})`,
          reason: `2 consecutive F grades + ${ar.fails} failures in 7 days`,
        });
        console.log(`[DreamTeam] Todd AUTO-DISABLED schedule for ${ar.agent_name} — consecutive F grades`);

        // Discord alert
        try {
          const discord = require('./discordNotifier');
          discord.sendEmbed({
            title: `⚠️ Agent Auto-Disabled: ${ar.agent_name}`,
            description: `Todd disabled schedule **${schedule.name}** after 2 consecutive F grades and ${ar.fails} failures in 7 days.\n\nRe-enable manually after investigating.`,
            color: 0xe74c3c,
          }).catch(() => {});
        } catch {}
      }
    }
  }

  // 5. Flag D-grade agents for Steve review
  for (const card of scorecards) {
    if (card.grade === 'D') {
      const prev = get('SELECT grade FROM dt_scorecards WHERE agent_name = ? AND score_date < ? ORDER BY score_date DESC LIMIT 1', [card.agent_name, today]);
      if (prev?.grade === 'D') {
        actions.push({
          type: 'flag_for_review',
          target: card.agent_name,
          reason: `2+ nights at D grade (${card.composite_score}/100) — needs human review`,
        });
        console.log(`[DreamTeam] Todd flagged ${card.agent_name} for Steve review — persistent D grade`);
      }
    }
  }

  // 6. Signal source performance adjustments (if signal_performance table exists)
  try {
    const signalPerf = require('./signalPerformance');
    const perfBlock = signalPerf.getSignalPerformanceBlock();
    if (perfBlock) {
      // Find underperforming signal sources (reply rate < 10% with 5+ leads)
      const weakSources = all(`
        SELECT source, source_agent, leads_inserted, reply_rate
        FROM signal_performance
        WHERE market IS NULL AND leads_inserted >= 5 AND reply_rate < 0.10
        ORDER BY period_end DESC LIMIT 5
      `);

      for (const ws of weakSources) {
        actions.push({
          type: 'signal_quality_alert',
          target: `${ws.source} (${ws.source_agent})`,
          reason: `${ws.leads_inserted} leads, ${(ws.reply_rate * 100).toFixed(1)}% reply rate — below 10% threshold`,
        });
      }

      // Find high-performing sources to recommend scaling
      const strongSources = all(`
        SELECT source, source_agent, leads_inserted, reply_rate
        FROM signal_performance
        WHERE market IS NULL AND leads_inserted >= 3 AND reply_rate > 0.25
        ORDER BY period_end DESC LIMIT 5
      `);

      for (const ss of strongSources) {
        actions.push({
          type: 'signal_scale_recommendation',
          target: `${ss.source} (${ss.source_agent})`,
          reason: `${(ss.reply_rate * 100).toFixed(1)}% reply rate on ${ss.leads_inserted} leads — recommend increasing frequency`,
        });
      }
    }
  } catch (err) {
    console.warn(`[DreamTeam] Signal performance check skipped: ${err.message}`);
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

async function buildMorningReport(diagnostics = []) {
  const today = new Date().toISOString().slice(0, 10);

  // Check if already reported
  const existing = get('SELECT id FROM dt_morning_reports WHERE report_date = ?', [today]);
  if (existing) return get('SELECT * FROM dt_morning_reports WHERE id = ?', [existing.id]);

  const scorecards = all('SELECT * FROM dt_scorecards WHERE score_date = ? ORDER BY composite_score DESC', [today]);
  const actions = all('SELECT * FROM dt_overnight_actions WHERE action_date = ?', [today]);

  const lines = [`OPENCLAW DAILY BRIEFING — ${today}`, '━'.repeat(50)];

  // ── DIAGNOSTICS: the point of this report ──
  const criticals = diagnostics.filter(d => d.level === 'critical');
  const highs = diagnostics.filter(d => d.level === 'high');
  const mediums = diagnostics.filter(d => d.level === 'medium');

  if (diagnostics.length === 0) {
    lines.push('', 'SYSTEM STATUS: All clear. No issues detected.');
  } else {
    if (criticals.length > 0) {
      lines.push('', '!! CRITICAL:');
      for (const d of criticals) {
        lines.push(`  ${d.title}`);
        lines.push(`    ${d.detail}`);
        lines.push(`    -> ${d.action}`);
      }
    }
    if (highs.length > 0) {
      lines.push('', '! NEEDS ATTENTION:');
      for (const d of highs) {
        lines.push(`  ${d.title}`);
        lines.push(`    -> ${d.action}`);
      }
    }
    if (mediums.length > 0) {
      lines.push('', 'MINOR:');
      for (const d of mediums) lines.push(`  ${d.title}`);
    }
  }

  // ── HEALTH GRADES (one line each) ──
  if (scorecards.length > 0) {
    lines.push('', 'HEALTH:');
    for (const card of scorecards) {
      const arrow = card.trend === 'up' ? '+' : card.trend === 'down' ? '-' : '=';
      lines.push(`  ${card.agent_name.padEnd(12)} ${card.grade} (${card.composite_score}) ${arrow}`);
    }
  }

  // ── PIPELINE FUNNEL ──
  try {
    const pipelineByProduct = all(`
      SELECT
        CASE WHEN source_agent = 'owen' THEN 'Owen' WHEN source_agent IN ('hoa','mgmt') THEN 'HOA'
             WHEN attribution_source = 'data_rehab_cross_sell' THEN 'DataRehab' ELSE 'Jake' END AS product,
        COUNT(*) AS total,
        SUM(CASE WHEN revenue_stage IN ('contacted','replied','meeting','pilot','closed','revenue') THEN 1 ELSE 0 END) AS contacted,
        SUM(CASE WHEN revenue_stage IN ('replied','meeting','pilot','closed','revenue') THEN 1 ELSE 0 END) AS replied,
        SUM(CASE WHEN revenue_stage IN ('meeting','pilot','closed','revenue') THEN 1 ELSE 0 END) AS meetings,
        SUM(CASE WHEN revenue_stage IN ('closed','revenue') THEN 1 ELSE 0 END) AS closed
      FROM cfo_leads WHERE created_at >= DATE('now', '-30 days') GROUP BY product ORDER BY total DESC
    `);
    if (pipelineByProduct.length > 0) {
      lines.push('', 'PIPELINE (30d):');
      for (const p of pipelineByProduct) {
        lines.push(`  ${p.product.padEnd(10)} ${p.total} -> ${p.contacted} contacted -> ${p.replied} replied -> ${p.meetings} mtg -> ${p.closed} closed`);
      }
    }
  } catch {}

  // ── PAPER TRADING (compact) ──
  try {
    const pathMod = require('path');
    const Database = require('better-sqlite3');
    const brainDbPath = pathMod.join(__dirname, '../../services/trader-service/data/trader-brain.sqlite');
    const brainDb = new Database(brainDbPath, { readonly: true });
    const last = brainDb.prepare('SELECT * FROM performance_daily ORDER BY date DESC LIMIT 1').get();
    brainDb.close();
    if (last) {
      lines.push('', `TRADING: $${last.portfolio_value.toFixed(2)} | ${last.daily_return >= 0 ? '+' : ''}${last.daily_return.toFixed(2)}% today | DD: -${last.max_drawdown.toFixed(2)}%`);
    }
  } catch {}

  // ── OVERNIGHT ACTIONS ──
  if (actions.length > 0) {
    lines.push('', 'OVERNIGHT:');
    actions.forEach(a => lines.push(`  [${a.action_type}] ${a.target} -- ${a.reason}`));
  }

  // ── REVENUE RADAR ──
  try {
    const { runRevenueScan, formatForReport } = require('./revenueRadar');
    const scan = runRevenueScan();
    if (scan.moneyMoves?.length > 0) lines.push('', formatForReport(scan));
  } catch {}

  // ── BIGGEST LEVER ──
  if (criticals.length > 0) {
    lines.push('', `#1 THING TO FIX: ${criticals[0].title}`);
    lines.push(`   ${criticals[0].action}`);
  } else if (highs.length > 0) {
    lines.push('', `#1 THING TO FIX: ${highs[0].title}`);
    lines.push(`   ${highs[0].action}`);
  }

  const reportText = lines.join('\n');

  run(`INSERT INTO dt_morning_reports
    (report_date, report_text, scorecards_json, actions_json, patterns_json)
    VALUES (?, ?, ?, ?, ?)`, [
    today, reportText, JSON.stringify(scorecards), JSON.stringify(actions), JSON.stringify(diagnostics),
  ]);

  // Post to Discord
  try {
    const discord = require('./discordNotifier');
    let desc = '';

    if (criticals.length > 0) {
      desc += criticals.map(d => `**${d.title}**\n> ${d.action}`).join('\n\n');
    }
    if (highs.length > 0) {
      if (desc) desc += '\n\n';
      desc += highs.map(d => `${d.title}`).join('\n');
    }
    if (diagnostics.length === 0) desc = 'All systems nominal. No issues detected.';

    // Compact health + pipeline
    if (scorecards.length > 0) {
      desc += '\n\n' + scorecards.map(c => `**${c.agent_name}**: ${c.grade}`).join(' | ');
    }
    try {
      const pt = get("SELECT COUNT(*) AS t, SUM(CASE WHEN revenue_stage IN ('replied','meeting','pilot','closed','revenue') THEN 1 ELSE 0 END) AS a FROM cfo_leads WHERE created_at >= DATE('now', '-30 days')");
      if (pt) desc += `\n**Pipeline:** ${pt.t} leads, ${pt.a} active (30d)`;
    } catch {}

    const color = criticals.length > 0 ? 0xe74c3c : highs.length > 0 ? 0xf39c12 : 0x2ecc71;
    await discord.sendEmbed({
      title: `OpenClaw Briefing — ${today}`,
      description: desc,
      color,
      footer: { text: `${diagnostics.length} finding(s) | $0 cost` },
    });
  } catch {}

  console.log(`[DreamTeam] Morning report generated for ${today}`);
  return get('SELECT * FROM dt_morning_reports WHERE report_date = ?', [today]);
}

// ════════════════════════════════════════════════════════════════════════════
// SYSTEM DIAGNOSTICS — detect stalls, broken joints, biggest lever
// ════════════════════════════════════════════════════════════════════════════

function runDiagnostics() {
  const findings = [];
  const sev = (level, category, title, detail, action) =>
    findings.push({ level, category, title, detail, action });

  // ── 1. OUTREACH STALL: leads with emails not being contacted ────────────
  try {
    const queued = get("SELECT COUNT(*) c FROM cfo_leads WHERE status='queued' AND contact_email IS NOT NULL AND contact_email != ''")?.c || 0;
    const sentRecently = get("SELECT COUNT(*) c FROM cfo_outreach_sequences WHERE sent_at > datetime('now','-7 days')")?.c || 0;
    if (queued > 100 && sentRecently === 0) {
      sev('critical', 'outreach', `${queued} leads with emails sitting unsent`,
        `${queued} queued leads have email addresses but 0 emails sent in 7 days. The outreach pipeline is completely stalled.`,
        'Check outreach_sender schedule and confirm-send flow. Leads are aging out.');
    } else if (queued > 100 && sentRecently < 10) {
      sev('high', 'outreach', `${queued} leads queued, only ${sentRecently} sent this week`,
        'Outreach is trickling. At this rate it would take months to contact the backlog.',
        'Increase sending cadence or batch size.');
    }
  } catch {}

  // ── 2. DRAFT STALL: agents running but no drafts appearing ──────────────
  try {
    const recentOutreachRuns = get("SELECT COUNT(*) c FROM runs WHERE agent_id IN (SELECT id FROM agents WHERE name IN ('jake-outreach-agent','jake-follow-up-agent')) AND status='completed' AND created_at > datetime('now','-3 days')")?.c || 0;
    const recentDrafts = get("SELECT COUNT(*) c FROM cfo_outreach_sequences WHERE created_at > datetime('now','-3 days') AND status='draft'")?.c || 0;
    if (recentOutreachRuns > 5 && recentDrafts === 0) {
      sev('high', 'pipeline', `${recentOutreachRuns} outreach runs completed but 0 new drafts`,
        'Outreach agents are running and completing, but nothing is landing in the draft queue. Post-processor may be broken or output format changed.',
        'Check postProcessor.js and recent agent output format.');
    }
  } catch {}

  // ── 3. ENRICHMENT BOTTLENECK: leads without emails ──────────────────────
  try {
    const noEmail = get("SELECT COUNT(*) c FROM cfo_leads WHERE (contact_email IS NULL OR contact_email='') AND status NOT IN ('dead','closed','unsubscribed','bounced')")?.c || 0;
    const enricherRan = get("SELECT COUNT(*) c FROM runs WHERE agent_id IN (SELECT id FROM agents WHERE name LIKE '%enricher%') AND status='completed' AND created_at > datetime('now','-3 days')")?.c || 0;
    if (noEmail > 50) {
      sev(enricherRan > 0 ? 'medium' : 'high', 'enrichment', `${noEmail} leads missing email addresses`,
        `${noEmail} active leads have no email. ${enricherRan > 0 ? 'Enricher is running but not finding emails.' : 'Enricher has not run in 3 days.'}`,
        enricherRan > 0 ? 'Check enrichment hit rate — may need better data sources.' : 'Check enricher schedule and agent health.');
    }
  } catch {}

  // ── 4. ZOMBIE RUNS: stuck in running/pending ────────────────────────────
  try {
    const zombies = get("SELECT COUNT(*) c FROM runs WHERE status='running' AND created_at < datetime('now','-2 hours')")?.c || 0;
    const stalePending = get("SELECT COUNT(*) c FROM runs WHERE status='pending' AND created_at < datetime('now','-1 day')")?.c || 0;
    if (zombies > 0) {
      sev('medium', 'health', `${zombies} runs stuck in 'running' for 2+ hours`,
        'These are likely orphaned processes that will never complete.',
        'Clean up with: UPDATE runs SET status=\'failed\' WHERE status=\'running\' AND created_at < datetime(\'now\',\'-2 hours\')');
    }
    if (stalePending > 5) {
      sev('medium', 'health', `${stalePending} runs stuck in 'pending' for 24+ hours`,
        'Pending runs that were never picked up for execution.',
        'Check processPendingCadenceRuns in scheduleRunner.js');
    }
  } catch {}

  // ── 5. AGENT FAILURE SPIKE ──────────────────────────────────────────────
  try {
    const failSpikes = all(`
      SELECT a.name, COUNT(*) as fails,
        (SELECT COUNT(*) FROM runs r2 WHERE r2.agent_id=a.id AND r2.status='completed' AND r2.created_at > datetime('now','-1 day')) as oks
      FROM runs r JOIN agents a ON a.id=r.agent_id
      WHERE r.status='failed' AND r.created_at > datetime('now','-1 day')
      GROUP BY a.name HAVING fails >= 3 ORDER BY fails DESC LIMIT 5
    `);
    for (const f of failSpikes) {
      const total = f.fails + f.oks;
      const rate = Math.round(f.fails / total * 100);
      if (rate > 30) {
        sev('high', 'health', `${f.name}: ${f.fails}/${total} runs failed (${rate}%)`,
          'This agent is failing at a high rate in the last 24 hours.',
          'Check error_msg on recent failed runs for this agent.');
      }
    }
  } catch {}

  // ── 6. REPLY RATE CHECK: are we getting any signal back? ────────────────
  try {
    const sent30d = get("SELECT COUNT(*) c FROM cfo_outreach_sequences WHERE sent_at > datetime('now','-30 days') AND status IN ('sent','delivered','replied')")?.c || 0;
    const replied30d = get("SELECT COUNT(*) c FROM cfo_outreach_sequences WHERE replied_at > datetime('now','-30 days')")?.c || 0;
    if (sent30d >= 50 && replied30d === 0) {
      sev('high', 'outreach', `${sent30d} emails sent in 30 days, 0 replies`,
        'Zero reply rate suggests emails may be landing in spam, wrong contacts, or poor messaging.',
        'Test deliverability. Check if emails are personalized. Review subject lines.');
    } else if (sent30d >= 50) {
      const rate = (replied30d / sent30d * 100).toFixed(1);
      if (rate < 1) {
        sev('medium', 'outreach', `Reply rate: ${rate}% (${replied30d}/${sent30d} in 30d)`,
          'Below 1% reply rate. Industry average for cold outreach is 3-5%.',
          'Review email copy, targeting, and send timing.');
      }
    }
  } catch {}

  // ── 7. SCHEDULE HEALTH: enabled schedules that haven't fired ────────────
  try {
    const dormant = all(`
      SELECT name, agent_name, cron_expression, last_run_at
      FROM schedules WHERE enabled=1 AND (last_run_at IS NULL OR last_run_at < datetime('now','-3 days'))
    `);
    const dormantCount = dormant.length;
    if (dormantCount > 10) {
      sev('medium', 'health', `${dormantCount} enabled schedules haven't fired in 3+ days`,
        'These schedules are enabled but idle. Some may have cron expressions that only fire on specific days, but others may be broken.',
        'Review schedule list — disable ones that serve no purpose.');
    }
  } catch {}

  // ── 8. COST CHECK ──────────────────────────────────────────────────────
  try {
    const todayCost = get("SELECT COALESCE(SUM(cost_usd),0) as c FROM runs WHERE status='completed' AND DATE(created_at)=DATE('now')")?.c || 0;
    const weekCost = get("SELECT COALESCE(SUM(cost_usd),0) as c FROM runs WHERE status='completed' AND created_at > datetime('now','-7 days')")?.c || 0;
    if (todayCost > 5) {
      sev('medium', 'cost', `$${todayCost.toFixed(2)} spent today`,
        `Higher than normal daily spend. Weekly: $${weekCost.toFixed(2)}.`,
        'Check if any agent is running more frequently than expected.');
    }
  } catch {}

  // Sort: critical > high > medium
  const levelOrder = { critical: 0, high: 1, medium: 2 };
  findings.sort((a, b) => (levelOrder[a.level] || 9) - (levelOrder[b.level] || 9));

  return findings;
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
  const errors = [];

  // Purge old-roster scorecards (pre-deterministic rewrite agents)
  const OLD_ROSTER = ['todd', 'scout', 'charlie', 'ralph', 'quill'];
  try {
    const placeholders = OLD_ROSTER.map(() => '?').join(',');
    run(`DELETE FROM dt_scorecards WHERE agent_name IN (${placeholders})`, OLD_ROSTER);
  } catch {}

  let snapshot, scorecards = [], proposals = [], qaResult = { approved: 0, rejected: 0 }, actions = [], report;

  try { snapshot = collectDailyData(); }
  catch (err) { errors.push(`collect: ${err.message}`); console.error('[DreamTeam] collectDailyData failed:', err.message); snapshot = { date: new Date().toISOString().slice(0, 10) }; }

  // Ensure all numeric fields have defaults so scoring doesn't crash on undefined.toFixed()
  const numericDefaults = {
    runs_completed: 0, runs_failed: 0, total_cost: 0, leads_discovered: 0, leads_enriched: 0,
    leads_complete: 0, content_drafted: 0, emails_drafted: 0, emails_sent: 0, emails_replied: 0,
    rse_videos: 0, rse_signals: 0, brain_observations: 0, enrichment_attempted: 1,
    enrichment_with_email: 0, enrichment_rate: 0, reply_rate: 0, leads_that_replied_30d: 0,
    leads_discovered_30d: 0, meetings_booked_7d: 0, pilots_started_7d: 0, active_leads: 0,
    replies_today: 0, pipeline_advances_today: 0, top_market_leads: 0, qa_submissions: 0,
    qa_passes: 0, reviews_completed: 0, false_passes: 0, voice_rejections: 0,
    ralph_approved_bounced: 0, ralph_approved_total: 0, content_published_7d: 0,
    builds_attempted: 0, builds_completed: 0, avg_build_duration_s: 0, avg_build_cost: 0,
    avg_review_duration_s: 0,
  };
  for (const [k, v] of Object.entries(numericDefaults)) {
    if (snapshot[k] == null) snapshot[k] = v;
  }

  try { scorecards = scoreAgents(snapshot); }
  catch (err) { errors.push(`score: ${err.message}`); console.error('[DreamTeam] scoreAgents failed:', err.message); }

  let diagnostics = [];
  try { diagnostics = runDiagnostics(); }
  catch (err) { errors.push(`diagnostics: ${err.message}`); console.error('[DreamTeam] runDiagnostics failed:', err.message); }

  if (diagnostics.length > 0) {
    console.log(`[DreamTeam] ${diagnostics.length} finding(s): ${diagnostics.filter(d=>d.level==='critical').length} critical, ${diagnostics.filter(d=>d.level==='high').length} high, ${diagnostics.filter(d=>d.level==='medium').length} medium`);
  }

  try { actions = await toddOvernightActions(scorecards); }
  catch (err) { errors.push(`actions: ${err.message}`); console.error('[DreamTeam] toddOvernightActions failed:', err.message); }

  try { report = await buildMorningReport(diagnostics); }
  catch (err) { errors.push(`report: ${err.message}`); console.error('[DreamTeam] buildMorningReport failed:', err.message); }

  const durationMs = Date.now() - startTime;
  if (errors.length) console.warn(`[DreamTeam] Cycle completed with ${errors.length} error(s): ${errors.join('; ')}`);
  console.log(`[DreamTeam] === Nightly cycle complete in ${(durationMs / 1000).toFixed(1)}s ===`);

  return {
    scorecards: scorecards.length,
    diagnostics: diagnostics.length,
    criticals: diagnostics.filter(d => d.level === 'critical').length,
    actions: actions.length,
    durationMs,
    reportDate: report?.report_date,
    errors: errors.length > 0 ? errors : undefined,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════════

function clamp(val, min, max) { return Math.max(min, Math.min(max, typeof val === 'number' ? val : 50)); }

module.exports = {
  collectDailyData,
  scoreAgents,
  toddOvernightActions,
  buildMorningReport,
  runDiagnostics,
  getActivePatterns,
  runFullCycle,
  DREAM_TEAM,
};
