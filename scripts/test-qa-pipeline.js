#!/usr/bin/env node
/**
 * Test the QA grading + promotion pipeline end-to-end.
 * 1. Inserts a test skill candidate
 * 2. Runs QA grading via Ollama
 * 3. Runs promotion
 * 4. Verifies result in agent_skills
 */
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const { initDatabase } = require(require('path').join(__dirname, '..', 'server/db/connection'));

async function main() {
  await initDatabase();
  const { run, get, all } = require(require('path').join(__dirname, '..', 'server/db/connection'));
  const qa = require(require('path').join(__dirname, '..', 'server/services/trainingQA'));

  // Step 1: Find a real agent
  const agent = get("SELECT id, name FROM agents WHERE name='jake-outreach-agent'");
  if (!agent) { console.error('jake-outreach-agent not found in DB'); process.exit(1); }
  console.log(`\nUsing agent: ${agent.name} (${agent.id})`);

  // Step 2: Insert a realistic test candidate
  console.log('\n=== Step 1: Inserting test skill candidate ===');
  run(
    `INSERT INTO skill_candidates (agent_id, agent_name, skill_name, summary, takeaways, source_activity, confidence, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      agent.id,
      agent.name,
      'erp_specific_subject_lines',
      'Emails mentioning the prospect specific ERP system (QuickBooks, Sage, etc.) in the subject line had 3x higher open rates. Generic subjects underperformed. Pattern: name the pain + name the tool in under 7 words.',
      JSON.stringify([
        'Use prospect ERP name in subject line',
        'Keep subject under 7 words',
        'Combine ERP name with specific pain point like AR aging or job costing',
      ]),
      'internal_corpus',
      0.85,
      'candidate',
    ]
  );

  const candidate = get("SELECT * FROM skill_candidates WHERE skill_name='erp_specific_subject_lines' ORDER BY id DESC LIMIT 1");
  console.log(`  Inserted candidate #${candidate.id}: ${candidate.skill_name} (status: ${candidate.status})`);

  // Step 3: Run QA grading
  console.log('\n=== Step 2: Running QA grading via Ollama ===');
  const gradeResult = await qa.gradeCandidate(candidate);
  console.log('  QA result:', JSON.stringify(gradeResult, null, 2));

  // Update the candidate with the grade
  run(
    "UPDATE skill_candidates SET qa_score = ?, qa_verdict = ?, qa_notes = ?, qa_graded_at = datetime('now') WHERE id = ?",
    [gradeResult.qa_score, gradeResult.qa_verdict, gradeResult.qa_notes, candidate.id]
  );

  // Step 4: Run promotion
  console.log('\n=== Step 3: Running promotion cycle ===');
  const promoteResult = qa.promoteApproved();
  console.log('  Promotion result:', JSON.stringify(promoteResult));

  // Step 5: Verify
  console.log('\n=== Step 4: Verification ===');
  const updatedCandidate = get('SELECT status, qa_score, qa_verdict, promoted_at FROM skill_candidates WHERE id = ?', [candidate.id]);
  console.log(`  Candidate status: ${updatedCandidate.status} | QA: ${updatedCandidate.qa_score} (${updatedCandidate.qa_verdict})`);

  if (updatedCandidate.status === 'approved') {
    const skill = get("SELECT * FROM agent_skills WHERE agent_id = ? AND skill_name = 'erp_specific_subject_lines'", [agent.id]);
    if (skill) {
      console.log(`  PROMOTED to agent_skills: level ${skill.skill_level}, promoted_from=${skill.promoted_from}, source=${skill.source_activity}`);
    }
  } else if (updatedCandidate.status === 'rejected') {
    console.log('  REJECTED by QA — score too low');
  } else {
    console.log('  Still candidate — score in middle range (0.4-0.7), needs re-eval');
  }

  // Stats
  const stats = qa.getCandidateStats();
  console.log('\n=== Candidate Stats ===');
  console.log(`  Total: ${stats.total} | Pending: ${stats.pending} | Approved: ${stats.approved} | Rejected: ${stats.rejected} | Avg score: ${stats.avgScore}`);

  console.log('\nDone.');
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
