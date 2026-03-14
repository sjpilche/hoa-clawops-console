/**
 * @file trainingQA.js
 * @description QA grading + promotion pipeline for the Idle Training System.
 *
 * KEY DESIGN: Uses a DIFFERENT Ollama system prompt than the generation model.
 * Generation uses the agent's persona ("You are Jake..."), grading uses a
 * neutral QA reviewer voice. This prevents self-grading — the #1 way
 * bullshit becomes policy.
 *
 * Promotion path:
 *   skill_candidates (status=candidate)
 *     → QA grading (Ollama, neutral reviewer)
 *     → score >= 0.7 → PROMOTED to agent_skills
 *     → score < 0.4  → AUTO-REJECTED
 *     → 0.4-0.7      → stays candidate (re-evaluate next cycle)
 *
 * COST: $0 — Ollama local inference only.
 */

'use strict';

const { get, run, all } = require('../db/connection');
const { chat } = require('./llmClient');

const OLLAMA_MODEL = process.env.OLLAMA_DEFAULT_MODEL || 'llama3.2:3b';

// Low temperature for consistent grading — uses llmClient for retry + error classification
function ollamaChat(systemPrompt, userMessage, timeoutMs = 90000) {
  return chat(systemPrompt, userMessage, {
    model: OLLAMA_MODEL, provider: 'ollama', temperature: 0.3, maxTokens: 512, timeoutMs,
  });
}

// ── QA Grading System Prompt ─────────────────────────────────────────────────
// Deliberately different voice than agent generation prompts.

const QA_SYSTEM_PROMPT = `You are a Training Quality Reviewer for an AI agent fleet. You are NOT the agent that learned this — you are an independent quality gate.

Your job: grade training outputs on 3 dimensions. Be strict. Vague platitudes fail. Generic advice fails. Only concrete, role-specific, actionable knowledge passes.

Return ONLY valid JSON:
{
  "concreteness": 0.0-1.0,
  "relevance": 0.0-1.0,
  "novelty": 0.0-1.0,
  "qa_score": 0.0-1.0,
  "qa_verdict": "pass|fail|pass_with_notes",
  "qa_notes": "Brief explanation of why"
}

Scoring guide:
- CONCRETENESS: Is the takeaway specific and actionable? "Use shorter subject lines" = 0.3. "Subject lines under 7 words with the prospect's ERP name get 2.3x open rates" = 0.9.
- RELEVANCE: Does this help THIS SPECIFIC agent's role? A cold email tactic for a content writer = 0.2. A writing hook technique for a content writer = 0.9.
- NOVELTY: Is this genuinely new knowledge? If the agent already has 5 email skills, another generic email skill = 0.2. A new technique for a specific ERP vertical = 0.8.

qa_score = average of the 3 dimension scores.
qa_verdict: "pass" if qa_score >= 0.7, "fail" if qa_score < 0.4, "pass_with_notes" if 0.4-0.7 and at least one dimension scores >= 0.8.`;

// ── Core functions ───────────────────────────────────────────────────────────

/**
 * Grade a single skill candidate via Ollama.
 * @param {object} candidate - Row from skill_candidates table
 * @returns {{ qa_score, qa_verdict, qa_notes, concreteness, relevance, novelty }}
 */
async function gradeCandidate(candidate) {
  // Get agent's existing skills for novelty check
  const existingSkills = all(
    'SELECT skill_name, skill_level FROM agent_skills WHERE agent_id = ?',
    [candidate.agent_id]
  ).map(s => `${s.skill_name} (level ${s.skill_level})`);

  const existingCandidates = all(
    "SELECT skill_name FROM skill_candidates WHERE agent_id = ? AND status = 'approved' AND id != ?",
    [candidate.agent_id, candidate.id]
  ).map(s => s.skill_name);

  const agent = get('SELECT name, description FROM agents WHERE id = ?', [candidate.agent_id]);

  const userMessage = `Agent: ${candidate.agent_name} (${agent?.description || 'AI agent'})
Claimed skill: ${candidate.skill_name}
Summary of learning: ${candidate.summary}
Source: ${candidate.source_activity}
Takeaways: ${candidate.takeaways || '[]'}

Existing skills for this agent (for novelty check):
${existingSkills.length > 0 ? existingSkills.join(', ') : 'None yet'}
${existingCandidates.length > 0 ? `Already approved candidates: ${existingCandidates.join(', ')}` : ''}

Grade this training output.`;

  try {
    const raw = await ollamaChat(QA_SYSTEM_PROMPT, userMessage);

    // Parse JSON response
    let cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
    const brace = cleaned.indexOf('{');
    if (brace > 0) cleaned = cleaned.slice(brace);

    let data;
    try { data = JSON.parse(cleaned); } catch {
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (m) try { data = JSON.parse(m[0]); } catch {}
    }

    if (data && typeof data.qa_score === 'number') {
      return {
        qa_score: Math.max(0, Math.min(1, data.qa_score)),
        qa_verdict: data.qa_verdict || (data.qa_score >= 0.7 ? 'pass' : data.qa_score < 0.4 ? 'fail' : 'pass_with_notes'),
        qa_notes: (data.qa_notes || '').slice(0, 500),
        concreteness: data.concreteness || 0,
        relevance: data.relevance || 0,
        novelty: data.novelty || 0,
      };
    }

    // Fallback: could not parse grading
    return { qa_score: 0.5, qa_verdict: 'pass_with_notes', qa_notes: 'QA grader returned unparseable response — defaulting to pass_with_notes' };
  } catch (err) {
    console.error(`[TrainingQA] Grading failed for candidate ${candidate.id}:`, err.message);
    return { qa_score: 0.5, qa_verdict: 'pass_with_notes', qa_notes: `Grading error: ${err.message}` };
  }
}

/**
 * Batch-grade ungraded skill candidates.
 * @param {number} limit - Max candidates to grade this cycle
 * @returns {{ graded, passed, failed, pending }}
 */
async function batchGradeCandidates(limit = 10) {
  const candidates = all(
    "SELECT * FROM skill_candidates WHERE status = 'candidate' AND qa_verdict IS NULL ORDER BY created_at ASC LIMIT ?",
    [limit]
  );

  let passed = 0, failed = 0, pending = 0;

  for (const candidate of candidates) {
    const result = await gradeCandidate(candidate);

    run(
      "UPDATE skill_candidates SET qa_score = ?, qa_verdict = ?, qa_notes = ?, qa_graded_at = datetime('now') WHERE id = ?",
      [result.qa_score, result.qa_verdict, result.qa_notes, candidate.id]
    );

    if (result.qa_verdict === 'pass') passed++;
    else if (result.qa_verdict === 'fail') failed++;
    else pending++;

    console.log(`[TrainingQA] Graded "${candidate.skill_name}" for ${candidate.agent_name}: ${result.qa_verdict} (${result.qa_score.toFixed(2)}) — ${result.qa_notes}`);
  }

  return { graded: candidates.length, passed, failed, pending };
}

/**
 * Promote approved candidates to agent_skills.
 * Only promotes candidates with qa_verdict='pass' or 'pass_with_notes' AND qa_score >= 0.7.
 * @returns {{ promoted, rejected, skipped }}
 */
function promoteApproved() {
  // Auto-reject low scores
  const rejects = all(
    "SELECT * FROM skill_candidates WHERE status = 'candidate' AND qa_verdict = 'fail' AND qa_score < 0.4"
  );
  for (const r of rejects) {
    run("UPDATE skill_candidates SET status = 'rejected' WHERE id = ?", [r.id]);
    console.log(`[TrainingQA] Auto-rejected: "${r.skill_name}" for ${r.agent_name} (score: ${r.qa_score})`);
  }

  // Promote passing candidates
  const winners = all(
    "SELECT * FROM skill_candidates WHERE status = 'candidate' AND qa_verdict IN ('pass', 'pass_with_notes') AND qa_score >= 0.7"
  );

  let promoted = 0;
  for (const w of winners) {
    const existing = get(
      'SELECT * FROM agent_skills WHERE agent_id = ? AND skill_name = ?',
      [w.agent_id, w.skill_name]
    );

    if (existing) {
      // Level up existing skill
      const newLevel = Math.min(10, existing.skill_level + 1);
      run(
        "UPDATE agent_skills SET skill_level = ?, times_trained = times_trained + 1, last_trained = datetime('now'), notes = ?, promoted_from = ?, source_activity = ? WHERE id = ?",
        [newLevel, w.summary.slice(0, 200), w.id, w.source_activity, existing.id]
      );
      console.log(`[TrainingQA] PROMOTED (level up): ${w.agent_name} "${w.skill_name}" → level ${newLevel}`);
    } else {
      // New skill
      run(
        "INSERT INTO agent_skills (agent_id, agent_name, skill_name, skill_level, notes, promoted_from, source_activity) VALUES (?, ?, ?, 1, ?, ?, ?)",
        [w.agent_id, w.agent_name, w.skill_name, w.summary.slice(0, 200), w.id, w.source_activity]
      );
      console.log(`[TrainingQA] PROMOTED (new skill): ${w.agent_name} "${w.skill_name}"`);
    }

    run("UPDATE skill_candidates SET status = 'approved', promoted_at = datetime('now') WHERE id = ?", [w.id]);
    promoted++;
  }

  // Count skipped (middle range — stays as candidate for re-evaluation)
  const skipped = all(
    "SELECT COUNT(*) AS c FROM skill_candidates WHERE status = 'candidate' AND qa_verdict IS NOT NULL AND qa_score >= 0.4 AND qa_score < 0.7"
  )[0]?.c || 0;

  return { promoted, rejected: rejects.length, skipped };
}

/**
 * Full QA cycle: grade ungraded → promote/reject.
 * Called at the end of each training cycle.
 * @param {number} gradeLimit - Max candidates to grade
 * @returns {{ graded, promoted, rejected, skipped }}
 */
async function runQACycle(gradeLimit = 10) {
  console.log('[TrainingQA] Starting QA cycle...');

  const gradeResult = await batchGradeCandidates(gradeLimit);
  const promoteResult = promoteApproved();

  // Discord notification for promotions
  if (promoteResult.promoted > 0) {
    try {
      const discord = require('./discordNotifier');
      const recentPromotions = all(
        "SELECT agent_name, skill_name, qa_score FROM skill_candidates WHERE status = 'approved' ORDER BY promoted_at DESC LIMIT ?",
        [promoteResult.promoted]
      );

      await discord.postWebhook({
        embeds: [{
          title: `🎓 Skills Promoted — ${promoteResult.promoted} passed QA`,
          color: 0x2ecc71,
          description: recentPromotions.map(p =>
            `**${p.agent_name}**: ${p.skill_name} (QA: ${(p.qa_score * 100).toFixed(0)}%)`
          ).join('\n'),
          footer: { text: `${promoteResult.rejected} rejected · ${promoteResult.skipped} pending re-eval` },
          timestamp: new Date().toISOString(),
        }],
      });
    } catch { /* Discord optional */ }
  }

  if (promoteResult.rejected > 0) {
    try {
      const discord = require('./discordNotifier');
      const recentRejects = all(
        "SELECT agent_name, skill_name, qa_score, qa_notes FROM skill_candidates WHERE status = 'rejected' ORDER BY qa_graded_at DESC LIMIT ?",
        [promoteResult.rejected]
      );

      await discord.postWebhook({
        embeds: [{
          title: `❌ Skills Rejected — ${promoteResult.rejected} failed QA`,
          color: 0xe74c3c,
          description: recentRejects.map(r =>
            `**${r.agent_name}**: ${r.skill_name} — ${r.qa_notes || 'below threshold'}`
          ).join('\n'),
          timestamp: new Date().toISOString(),
        }],
      });
    } catch { /* Discord optional */ }
  }

  return {
    graded: gradeResult.graded,
    promoted: promoteResult.promoted,
    rejected: promoteResult.rejected,
    skipped: promoteResult.skipped,
  };
}

/**
 * Get candidate stats for the dashboard.
 */
function getCandidateStats() {
  const total = get('SELECT COUNT(*) AS c FROM skill_candidates')?.c || 0;
  const pending = get("SELECT COUNT(*) AS c FROM skill_candidates WHERE status = 'candidate' AND qa_verdict IS NULL")?.c || 0;
  const graded = get("SELECT COUNT(*) AS c FROM skill_candidates WHERE qa_verdict IS NOT NULL AND status = 'candidate'")?.c || 0;
  const approved = get("SELECT COUNT(*) AS c FROM skill_candidates WHERE status = 'approved'")?.c || 0;
  const rejected = get("SELECT COUNT(*) AS c FROM skill_candidates WHERE status = 'rejected'")?.c || 0;
  const avgScore = get("SELECT AVG(qa_score) AS avg FROM skill_candidates WHERE qa_score IS NOT NULL")?.avg || 0;

  return { total, pending, graded, approved, rejected, avgScore: Math.round(avgScore * 100) / 100 };
}

module.exports = {
  gradeCandidate,
  batchGradeCandidates,
  promoteApproved,
  runQACycle,
  getCandidateStats,
};
