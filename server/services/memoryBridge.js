/**
 * @file memoryBridge.js
 * @description Bridges Layer 0 (file memory) with Layers 1-4 (DB memory).
 *
 * Activates the file-based memory system that was fully designed but never
 * connected to runtime data. Three jobs:
 *
 *   1. updateProjectMemory()  — Refreshes pipeline state snapshots in project_memory/
 *   2. createDailyLog()       — Creates today's daily log from actual run data
 *   3. compressWeeklyLogs()   — Compresses 7 daily logs into a weekly summary
 *
 * Called from: morning_digest handler (daily), brain_distillation handler (weekly compression)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { all, get } = require('../db/connection');

const MEMORY_DIR = path.join(process.cwd(), 'memory');
const DAILY_LOGS_DIR = path.join(MEMORY_DIR, 'daily_logs');
const WEEKLY_DIR = path.join(DAILY_LOGS_DIR, 'weekly');
const ARCHIVE_DIR = path.join(DAILY_LOGS_DIR, '_archive');
const PROJECT_DIR = path.join(MEMORY_DIR, 'project_memory');

// Ensure directories exist
for (const dir of [DAILY_LOGS_DIR, WEEKLY_DIR, ARCHIVE_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ═══════════════════════════════════════════════════════════════
// 1. UPDATE PROJECT MEMORY — refreshes pipeline snapshots
// ═══════════════════════════════════════════════════════════════

function updateProjectMemory() {
  const today = new Date().toISOString().slice(0, 10);
  let updated = 0;

  // ── Jake Pipeline ──
  try {
    const jakePath = path.join(PROJECT_DIR, 'jake_pipeline.md');
    if (fs.existsSync(jakePath)) {
      const content = fs.readFileSync(jakePath, 'utf8');

      // Query live stats
      const total = get('SELECT COUNT(*) AS c FROM cfo_leads')?.c || 0;
      const enriched = get("SELECT COUNT(*) AS c FROM cfo_leads WHERE enrichment_status = 'enriched'")?.c || 0;
      const partial = get("SELECT COUNT(*) AS c FROM cfo_leads WHERE enrichment_status = 'partial'")?.c || 0;
      const failed = get("SELECT COUNT(*) AS c FROM cfo_leads WHERE enrichment_status = 'failed'")?.c || 0;
      const pending = get("SELECT COUNT(*) AS c FROM cfo_leads WHERE enrichment_status = 'pending'")?.c || 0;
      const outreachSent = get("SELECT COUNT(*) AS c FROM cfo_outreach_sequences WHERE status = 'sent'")?.c || 0;
      const replied = get("SELECT COUNT(*) AS c FROM cfo_leads WHERE status = 'replied'")?.c || 0;
      const meetings = get("SELECT COUNT(*) AS c FROM cfo_leads WHERE status = 'meeting_booked'")?.c || 0;
      const pilots = get("SELECT COUNT(*) AS c FROM cfo_leads WHERE status = 'pilot'")?.c || 0;
      const hitRate = total > 0 ? Math.round((enriched / total) * 100) : 0;

      const newSnapshot = `## Current Pipeline State

**Snapshot: ${today}** *(auto-updated by memoryBridge)*

| Stage | Count | Notes |
|-------|-------|-------|
| Discovered (total) | ${total} | Google Maps + LLM scout |
| Enriched — email found | ${enriched} | ${hitRate}% hit rate |
| Enriched — partial (no email) | ${partial} | LinkedIn/phone only |
| Enrichment failed | ${failed} | Domain guess failed |
| Enrichment pending | ${pending} | Queued for next enricher run |
| Outreach sent | ${outreachSent} | — |
| Replied | ${replied} | — |
| Meeting booked | ${meetings} | — |
| Pilot / closed | ${pilots} | — |
| **Total pipeline value** | **${meetings > 0 || pilots > 0 ? '$' + ((meetings + pilots) * 10000) + ' potential' : '$0 realized'}** | ${enriched} enriched leads in pipeline |`;

      // Replace the Current Pipeline State section
      const updated_content = content.replace(
        /## Current Pipeline State[\s\S]*?(?=\n---\n)/,
        newSnapshot + '\n'
      );

      // Update header timestamp
      const final_content = updated_content
        .replace(/\*Last updated:.*?\*/, `*Last updated: ${today} by memoryBridge*`);

      fs.writeFileSync(jakePath, final_content, 'utf8');
      updated++;
    }
  } catch (err) {
    console.warn('[MemoryBridge] Failed to update jake_pipeline.md:', err.message);
  }

  // ── HOA Pipeline ──
  try {
    const hoaPath = path.join(PROJECT_DIR, 'hoa_pipeline.md');
    if (fs.existsSync(hoaPath)) {
      const content = fs.readFileSync(hoaPath, 'utf8');

      // HOA uses separate SQLite DB — query what we can from main DB
      const hoaLeads = get("SELECT COUNT(*) AS c FROM lg_engagement_queue")?.c || 0;
      const hoaDrafted = get("SELECT COUNT(*) AS c FROM lg_engagement_queue WHERE status = 'approved'")?.c || 0;
      const hoaPending = get("SELECT COUNT(*) AS c FROM lg_engagement_queue WHERE status = 'pending_review'")?.c || 0;
      const contentPieces = get("SELECT COUNT(*) AS c FROM cfo_content_pieces WHERE source_agent = 'hoa'")?.c || 0;

      const newSnapshot = `## Current Pipeline State

**Snapshot: ${today}** *(auto-updated by memoryBridge)*

| Stage | Count | Notes |
|-------|-------|-------|
| Engagement queue total | ${hoaLeads} | All platforms |
| Pending review | ${hoaPending} | Needs Steve approval |
| Approved / posted | ${hoaDrafted} | — |
| Content pieces (HOA) | ${contentPieces} | Blog + social |
| **Pipeline value** | **$0 realized** | Revenue model: platform referrals |`;

      const updated_content = content.replace(
        /## Current Pipeline State[\s\S]*?(?=\n---\n)/,
        newSnapshot + '\n'
      );

      const final_content = updated_content
        .replace(/\*Last updated:.*?\*/, `*Last updated: ${today} by memoryBridge*`);

      fs.writeFileSync(hoaPath, final_content, 'utf8');
      updated++;
    }
  } catch (err) {
    console.warn('[MemoryBridge] Failed to update hoa_pipeline.md:', err.message);
  }

  console.log(`[MemoryBridge] Updated ${updated} project memory files`);
  return { updated };
}

// ═══════════════════════════════════════════════════════════════
// 2. CREATE DAILY LOG — from actual run data
// ═══════════════════════════════════════════════════════════════

function createDailyLog(date) {
  const today = date || new Date().toISOString().slice(0, 10);
  const logPath = path.join(DAILY_LOGS_DIR, `${today}.md`);

  // Don't overwrite — append if exists
  if (fs.existsSync(logPath)) {
    console.log(`[MemoryBridge] Daily log already exists for ${today}`);
    return { created: false, path: logPath };
  }

  // Query today's actual data
  const runs = all(
    `SELECT r.status, r.duration_ms, r.cost_usd, r.created_at, a.name AS agent_name
     FROM runs r LEFT JOIN agents a ON r.agent_id = a.id
     WHERE DATE(r.created_at) = ? ORDER BY r.created_at ASC`,
    [today]
  );

  const totalRuns = runs.length;
  const totalCost = runs.reduce((s, r) => s + (r.cost_usd || 0), 0);
  const failedRuns = runs.filter(r => r.status === 'failed').length;

  // Pipeline stats for today
  const jakeLeadsToday = get("SELECT COUNT(*) AS c FROM cfo_leads WHERE DATE(created_at) = ?", [today])?.c || 0;
  const jakeEnrichedToday = get("SELECT COUNT(*) AS c FROM cfo_leads WHERE DATE(enriched_at) = ?", [today])?.c || 0;
  const outreachToday = get("SELECT COUNT(*) AS c FROM cfo_outreach_sequences WHERE DATE(created_at) = ? AND status IN ('draft','sent')", [today])?.c || 0;
  const repliedToday = get("SELECT COUNT(*) AS c FROM cfo_outreach_sequences WHERE DATE(replied_at) = ?", [today])?.c || 0;
  const contentToday = get("SELECT COUNT(*) AS c FROM cfo_content_pieces WHERE DATE(created_at) = ?", [today])?.c || 0;

  // Build run table
  const runRows = runs.slice(0, 20).map(r => {
    const time = r.created_at ? new Date(r.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—';
    const dur = r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s` : '—';
    return `| ${time} | ${r.agent_name || 'unknown'} | ${r.status} | ${dur} | $${(r.cost_usd || 0).toFixed(4)} |`;
  }).join('\n');

  const logContent = `# Daily Log — ${today}
*Auto-generated by memoryBridge at ${new Date().toISOString().slice(11, 16)} UTC*

---

## Agent Runs Summary

| Time | Agent | Status | Duration | Cost |
|------|-------|--------|----------|------|
${runRows || '| — | No runs today | — | — | — |'}

**Total runs today:** ${totalRuns}
**Total cost today:** $${totalCost.toFixed(4)}
**Failed runs:** ${failedRuns}

---

## Pipeline Changes

### Jake Pipeline
- Leads added: ${jakeLeadsToday}
- Leads enriched: ${jakeEnrichedToday}
- Outreach drafts: ${outreachToday}
- Replies received: ${repliedToday}

### Content
- Pieces created: ${contentToday}

---

## Memory Writes Today

| Time | File Written | Type | Summary |
|------|-------------|------|---------|
| ${new Date().toISOString().slice(11, 16)} | daily_logs/${today}.md | daily_log | Auto-generated daily log |

---
*Log created by: memoryBridge at ${new Date().toISOString().slice(11, 16)} UTC*
`;

  fs.writeFileSync(logPath, logContent, 'utf8');
  console.log(`[MemoryBridge] Created daily log: ${today}.md (${totalRuns} runs, $${totalCost.toFixed(4)} cost)`);
  return { created: true, path: logPath, runs: totalRuns, cost: totalCost };
}

// ═══════════════════════════════════════════════════════════════
// 3. COMPRESS WEEKLY LOGS — 7 daily logs → 1 weekly summary
// ═══════════════════════════════════════════════════════════════

function compressWeeklyLogs() {
  // Find daily logs older than 7 days that haven't been compressed
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const files = fs.readdirSync(DAILY_LOGS_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .filter(f => {
      const dateStr = f.replace('.md', '');
      return new Date(dateStr) < cutoff;
    })
    .sort();

  if (files.length === 0) {
    console.log('[MemoryBridge] No daily logs to compress (all < 7 days old)');
    return { compressed: 0, archived: 0 };
  }

  // Group by ISO week
  const weeks = {};
  for (const file of files) {
    const dateStr = file.replace('.md', '');
    const d = new Date(dateStr);
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay()); // Sunday start
    const weekKey = weekStart.toISOString().slice(0, 10);
    if (!weeks[weekKey]) weeks[weekKey] = [];
    weeks[weekKey].push(file);
  }

  let compressed = 0;
  let archived = 0;

  for (const [weekStart, weekFiles] of Object.entries(weeks)) {
    if (weekFiles.length === 0) continue;

    // Read all daily logs for this week
    let totalRuns = 0, totalCost = 0, totalFailed = 0;
    const highlights = [];

    for (const file of weekFiles) {
      const content = fs.readFileSync(path.join(DAILY_LOGS_DIR, file), 'utf8');

      // Extract stats from daily log (parse the summary lines)
      const runsMatch = content.match(/Total runs today:\*\* (\d+)/);
      const costMatch = content.match(/Total cost today:\*\* \$([0-9.]+)/);
      const failMatch = content.match(/Failed runs:\*\* (\d+)/);
      if (runsMatch) totalRuns += parseInt(runsMatch[1]);
      if (costMatch) totalCost += parseFloat(costMatch[1]);
      if (failMatch) totalFailed += parseInt(failMatch[1]);

      // Extract pipeline changes as highlights
      const pipelineMatch = content.match(/## Pipeline Changes([\s\S]*?)(?=\n---\n)/);
      if (pipelineMatch) {
        const lines = pipelineMatch[1].split('\n').filter(l => l.startsWith('- ') && !l.includes(': 0'));
        if (lines.length > 0) highlights.push(`**${file.replace('.md', '')}:** ${lines.join('; ')}`);
      }
    }

    // Calculate week number
    const d = new Date(weekStart);
    const weekNum = Math.ceil(((d - new Date(d.getFullYear(), 0, 1)) / 86400000 + 1) / 7);
    const weekLabel = `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;

    // Write weekly summary
    const weeklyContent = `# Weekly Summary — ${weekLabel}
*Compressed from ${weekFiles.length} daily logs on ${new Date().toISOString().slice(0, 10)} by memoryBridge*

---

## Week Metrics

| Metric | Value |
|--------|-------|
| Total runs | ${totalRuns} |
| Total cost | $${totalCost.toFixed(4)} |
| Failed runs | ${totalFailed} |
| Daily logs compressed | ${weekFiles.length} |
| Date range | ${weekFiles[0].replace('.md', '')} to ${weekFiles[weekFiles.length - 1].replace('.md', '')} |

---

## Key Events

${highlights.length > 0 ? highlights.join('\n') : '*No significant pipeline changes this week.*'}

---

## Compression Confidence: 0.9

*Original daily logs archived to \`daily_logs/_archive/\`*
`;

    const weeklyPath = path.join(WEEKLY_DIR, `${weekLabel}.md`);
    fs.writeFileSync(weeklyPath, weeklyContent, 'utf8');
    compressed++;

    // Archive original daily logs
    for (const file of weekFiles) {
      const src = path.join(DAILY_LOGS_DIR, file);
      const dst = path.join(ARCHIVE_DIR, file);
      fs.renameSync(src, dst);
      archived++;
    }

    console.log(`[MemoryBridge] Compressed ${weekFiles.length} logs → ${weekLabel}.md, archived originals`);
  }

  return { compressed, archived };
}

module.exports = { updateProjectMemory, createDailyLog, compressWeeklyLogs };
