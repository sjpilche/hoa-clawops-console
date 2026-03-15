/**
 * @file ralphQA.js
 * @description Ralph QA Gate — automated quality review for outreach drafts and content.
 *
 * Ralph is the QA/Supervisor agent. Per coordination_protocol.md, every output
 * must pass through Ralph before external use. This service implements that gate
 * with deterministic checks ($0) and optional LLM deep review (~$0.01).
 *
 * Workflow:
 *   1. Draft created by outreach/content agent → qa_status = 'pending'
 *   2. Ralph reviews: content guard + structure checks + optional LLM
 *   3. Result: qa_status = 'passed' (score >= 70) or 'failed' (score < 70)
 *   4. Only 'passed' drafts can be moved to 'approved' by Steve
 *
 * Usage:
 *   const ralph = require('./ralphQA');
 *   await ralph.reviewOutreachBatch(10);  // review up to 10 pending drafts
 *   await ralph.reviewSingleOutreach(sequenceId);
 */

'use strict';

const { get, all, run } = require('../db/connection');
const { checkContent } = require('./contentGuard');

// ══════════════════════════════════════════════════════════════
// SCORING RUBRIC — deterministic quality checks ($0)
// ══════════════════════════════════════════════════════════════

/**
 * Score an outreach email draft on multiple quality dimensions.
 * Returns 0-100 score with per-dimension breakdown.
 */
function scoreOutreachDraft(subject, body, lead) {
  const dimensions = {};
  let totalScore = 0;
  let maxScore = 0;

  // 1. Subject line quality (20 points)
  maxScore += 20;
  if (subject) {
    let subjectScore = 0;
    if (subject.length >= 10 && subject.length <= 80) subjectScore += 5;  // good length
    if (!/^(re:|fwd:|hello|hi |hey )/i.test(subject)) subjectScore += 5; // not generic
    if (lead?.company_name && subject.toLowerCase().includes(lead.company_name.toLowerCase().slice(0, 10))) subjectScore += 5; // personalized
    if (!/[!]{2,}|\bURGENT\b|\bFREE\b/i.test(subject)) subjectScore += 5; // no spam
    dimensions.subject = subjectScore;
    totalScore += subjectScore;
  } else {
    dimensions.subject = 0;
  }

  // 2. Body personalization (25 points)
  maxScore += 25;
  if (body) {
    let personScore = 0;
    const lowerBody = body.toLowerCase();
    if (lead?.contact_name && lowerBody.includes(lead.contact_name.toLowerCase().split(' ')[0])) personScore += 8;
    if (lead?.company_name && lowerBody.includes(lead.company_name.toLowerCase().slice(0, 10))) personScore += 8;
    if (lead?.city && lowerBody.includes(lead.city.toLowerCase())) personScore += 4;
    if (lead?.erp_type && lead.erp_type !== 'unknown' && lowerBody.includes(lead.erp_type.toLowerCase())) personScore += 5;
    dimensions.personalization = personScore;
    totalScore += personScore;
  } else {
    dimensions.personalization = 0;
  }

  // 3. Structure (20 points)
  maxScore += 20;
  if (body) {
    let structScore = 0;
    const wordCount = body.split(/\s+/).filter(Boolean).length;
    if (wordCount >= 80 && wordCount <= 300) structScore += 8;  // right length
    else if (wordCount >= 50 && wordCount <= 500) structScore += 4;
    if (body.includes('\n')) structScore += 4;                    // has paragraphs
    if (/\?/.test(body)) structScore += 4;                        // asks a question
    if (/\b(calendly|schedule|call|meeting|chat|15 min|30 min)\b/i.test(body)) structScore += 4; // has CTA
    dimensions.structure = structScore;
    totalScore += structScore;
  } else {
    dimensions.structure = 0;
  }

  // 4. Content safety (20 points)
  maxScore += 20;
  const guard = checkContent(body || '', subject || '');
  let safetyScore = 20;
  for (const flag of guard.flags) {
    if (flag.severity === 'high') safetyScore -= 10;
    else if (flag.severity === 'medium') safetyScore -= 5;
    else safetyScore -= 2;
  }
  safetyScore = Math.max(0, safetyScore);
  dimensions.safety = safetyScore;
  totalScore += safetyScore;

  // 5. Tone (15 points)
  maxScore += 15;
  if (body) {
    let toneScore = 0;
    const lowerBody = body.toLowerCase();
    // Jake persona checks
    if (!/\b(dear sir|dear madam|to whom)\b/i.test(lowerBody)) toneScore += 5; // not stuffy
    if (!/\b(we are pleased|we would like to|I am writing to)\b/i.test(lowerBody)) toneScore += 5; // not corporate
    if (/\b(I've seen|I noticed|I was looking at|caught my eye)\b/i.test(lowerBody)) toneScore += 5; // research-based opening
    dimensions.tone = toneScore;
    totalScore += toneScore;
  } else {
    dimensions.tone = 0;
  }

  const score = Math.round((totalScore / maxScore) * 100);

  return {
    score,
    dimensions,
    totalScore,
    maxScore,
    contentGuardFlags: guard.flags,
    wordCount: body ? body.split(/\s+/).filter(Boolean).length : 0,
  };
}

// ══════════════════════════════════════════════════════════════
// REVIEW FUNCTIONS
// ══════════════════════════════════════════════════════════════

/**
 * Review a single outreach sequence by ID.
 */
function reviewSingleOutreach(sequenceId) {
  const seq = get('SELECT s.*, l.company_name, l.contact_name, l.city, l.state, l.erp_type FROM cfo_outreach_sequences s LEFT JOIN cfo_leads l ON s.lead_id = l.id WHERE s.id = ?', [sequenceId]);
  if (!seq) return { error: 'Sequence not found' };

  const result = scoreOutreachDraft(seq.email_subject, seq.email_body, seq);
  const passed = result.score >= 70;
  const notes = buildQANotes(result);

  run(
    `UPDATE cfo_outreach_sequences SET qa_status = ?, qa_score = ?, qa_notes = ?, qa_reviewed_at = datetime('now') WHERE id = ?`,
    [passed ? 'passed' : 'failed', result.score, notes, sequenceId]
  );

  // If failed with high-severity content guard flags, also set status to 'flagged'
  if (result.contentGuardFlags.some(f => f.severity === 'high')) {
    run(`UPDATE cfo_outreach_sequences SET status = 'flagged' WHERE id = ? AND status = 'draft'`, [sequenceId]);
  }

  return {
    sequenceId,
    score: result.score,
    passed,
    dimensions: result.dimensions,
    flags: result.contentGuardFlags,
    notes,
  };
}

/**
 * Review a batch of pending outreach sequences.
 */
function reviewOutreachBatch(limit = 20) {
  // Find drafts that haven't been QA'd yet
  const pending = all(
    `SELECT s.id FROM cfo_outreach_sequences s WHERE (s.qa_status IS NULL OR s.qa_status = 'pending') AND s.status IN ('draft', 'flagged') ORDER BY s.created_at DESC LIMIT ?`,
    [limit]
  );

  let reviewed = 0, passed = 0, failed = 0;
  const results = [];

  for (const row of pending) {
    const result = reviewSingleOutreach(row.id);
    if (result.error) continue;
    reviewed++;
    if (result.passed) passed++;
    else failed++;
    results.push(result);
  }

  return {
    reviewed,
    passed,
    failed,
    results,
    summary: `Ralph QA: ${reviewed} drafts reviewed — ${passed} passed, ${failed} failed`,
  };
}

/**
 * Review a single content piece by ID.
 */
function reviewSingleContent(contentId) {
  const piece = get('SELECT * FROM cfo_content_pieces WHERE id = ?', [contentId]);
  if (!piece) return { error: 'Content piece not found' };

  const body = piece.content_markdown || '';
  const guard = checkContent(body, piece.title || '');
  const wordCount = body.split(/\s+/).filter(Boolean).length;

  let score = 70; // base
  if (wordCount >= 300 && wordCount <= 2000) score += 10;
  if (piece.title && piece.title.length > 10) score += 5;
  if (piece.cta && piece.cta.length > 5) score += 5;
  if (body.includes('#')) score += 5; // has headings
  if (/\b(construction|contractor|GC|CFO|controller)\b/i.test(body)) score += 5; // industry-relevant
  for (const flag of guard.flags) {
    if (flag.severity === 'high') score -= 20;
    else if (flag.severity === 'medium') score -= 10;
    else score -= 5;
  }
  score = Math.max(0, Math.min(100, score));

  const passed = score >= 70;
  const notes = guard.flags.length > 0
    ? `Flags: ${guard.flags.map(f => `${f.type}:${f.match}`).join(', ')}`
    : 'Clean — no issues found';

  run(
    `UPDATE cfo_content_pieces SET qa_status = ?, qa_score = ?, qa_notes = ?, qa_reviewed_at = datetime('now') WHERE id = ?`,
    [passed ? 'passed' : 'failed', score, notes, contentId]
  );

  return { contentId, score, passed, notes };
}

/**
 * Review a batch of pending content pieces.
 */
function reviewContentBatch(limit = 20) {
  const pending = all(
    `SELECT id FROM cfo_content_pieces WHERE (qa_status IS NULL OR qa_status = 'pending') AND status = 'draft' ORDER BY created_at DESC LIMIT ?`,
    [limit]
  );

  let reviewed = 0, passed = 0, failed = 0;
  for (const row of pending) {
    const result = reviewSingleContent(row.id);
    if (result.error) continue;
    reviewed++;
    if (result.passed) passed++;
    else failed++;
  }

  return {
    reviewed,
    passed,
    failed,
    summary: `Ralph Content QA: ${reviewed} pieces reviewed — ${passed} passed, ${failed} failed`,
  };
}

/**
 * Get QA queue stats.
 */
function getQAStats() {
  const outreach = get(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN qa_status IS NULL OR qa_status = 'pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN qa_status = 'passed' THEN 1 ELSE 0 END) AS passed,
      SUM(CASE WHEN qa_status = 'failed' THEN 1 ELSE 0 END) AS failed,
      AVG(CASE WHEN qa_score IS NOT NULL THEN qa_score END) AS avg_score
    FROM cfo_outreach_sequences WHERE status IN ('draft', 'flagged', 'approved')
  `);

  const content = get(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN qa_status IS NULL OR qa_status = 'pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN qa_status = 'passed' THEN 1 ELSE 0 END) AS passed,
      SUM(CASE WHEN qa_status = 'failed' THEN 1 ELSE 0 END) AS failed,
      AVG(CASE WHEN qa_score IS NOT NULL THEN qa_score END) AS avg_score
    FROM cfo_content_pieces WHERE status IN ('draft', 'approved')
  `);

  return { outreach, content };
}

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

function buildQANotes(result) {
  const parts = [];
  const { dimensions, contentGuardFlags, wordCount } = result;

  // Highlight weak dimensions
  if (dimensions.subject < 10) parts.push('Weak subject line — too generic or wrong length');
  if (dimensions.personalization < 12) parts.push('Low personalization — missing company/contact/city refs');
  if (dimensions.structure < 10) parts.push('Structure issues — check length, paragraphs, CTA');
  if (dimensions.safety < 15) parts.push('Safety flags — check content guard results');
  if (dimensions.tone < 8) parts.push('Tone issues — sounds too corporate, not Jake persona');

  if (contentGuardFlags.length > 0) {
    parts.push(`Content flags: ${contentGuardFlags.map(f => `${f.type}:${f.match}`).join(', ')}`);
  }

  if (wordCount > 400) parts.push(`Too long (${wordCount} words) — target 100-250`);
  if (wordCount < 50) parts.push(`Too short (${wordCount} words) — needs more substance`);

  return parts.length > 0 ? parts.join(' | ') : 'Clean — all dimensions solid';
}

module.exports = {
  scoreOutreachDraft,
  reviewSingleOutreach,
  reviewOutreachBatch,
  reviewSingleContent,
  reviewContentBatch,
  getQAStats,
};
