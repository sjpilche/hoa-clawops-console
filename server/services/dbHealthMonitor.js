/**
 * @file dbHealthMonitor.js
 * @description Database health monitor — daily integrity checks.
 *
 * Catches schema drift, orphaned records, missing tables, and data anomalies
 * BEFORE they cause runtime errors.
 *
 * Checks:
 *   1. Table existence — do all expected tables exist?
 *   2. Column existence — do all referenced columns exist?
 *   3. Orphaned records — foreign key integrity
 *   4. Data anomalies — null where shouldn't be, impossible values
 *   5. Stale data — leads stuck in stages, schedules that never fired
 *   6. Size/growth — table row counts and DB file size
 *
 * Handler: db_health_monitor (registered in runs.js)
 * Schedule: Daily 2:30 AM (after brain distillation, before opportunity scanner)
 *
 * Usage:
 *   const monitor = require('./dbHealthMonitor');
 *   const report = monitor.runHealthCheck();
 */

'use strict';

const { get, all } = require('../db/connection');
const fs = require('fs');
const path = require('path');

// ── Expected Tables ──────────────────────────────────────────────────────────
// Every table the system depends on. If any are missing, agents will crash.

const EXPECTED_TABLES = [
  // Core
  'agents', 'runs', 'schedules', 'audit_log', 'users',
  // Leads & Marketing
  'cfo_leads', 'cfo_content_pieces', 'cfo_outreach_sequences', 'lg_engagement_queue',
  'content_queue', 'enrichment_attempts',
  // Brain
  'brain_fallback_observations', 'brain_fallback_feedback', 'brain_fallback_episodes',
  // Pipeline
  'agent_pipelines', 'pipeline_runs', 'cadence_touches',
  // Discovery
  'geo_targets', 'discovery_runs',
  // Playwright
  'playwright_browser_restarts', 'playwright_circuit_events',
  // Revenue (new)
  'revenue_events', 'engagement_events', 'outreach_variants',
  // Content Calendar (new)
  'content_calendar',
  // Newsletter (new)
  'newsletter_subscribers', 'newsletter_broadcasts',
  // Marketing Learnings (new)
  'marketing_learnings',
  // Opportunity
  'opp_signals', 'opp_clusters', 'opp_prototypes', 'opp_traction',
  // RSE
  'rse_sources', 'rse_transcripts', 'rse_signals',
];

// ── Expected Columns (critical ones only) ────────────────────────────────────
const EXPECTED_COLUMNS = {
  cfo_leads: ['id', 'company_name', 'contact_email', 'status', 'source_agent',
    'revenue_stage', 'engagement_score', 'urgency_score', 'pipeline_stage'],
  cfo_outreach_sequences: ['id', 'lead_id', 'email_subject', 'email_body', 'status',
    'sequence_position', 'source_agent'],
  cfo_content_pieces: ['id', 'title', 'content_markdown', 'status', 'source_agent',
    'qa_status', 'performance_score'],
  content_queue: ['id', 'platform', 'content', 'status', 'scheduled_for'],
  revenue_events: ['id', 'lead_id', 'event_type', 'revenue_stage_after'],
  newsletter_subscribers: ['id', 'email', 'status', 'welcome_step'],
  content_calendar: ['id', 'scheduled_date', 'topic', 'status', 'assigned_agent'],
};

// ── Severity ─────────────────────────────────────────────────────────────────
const CRITICAL = 'CRITICAL';
const HIGH = 'HIGH';
const MEDIUM = 'MEDIUM';
const LOW = 'LOW';
const INFO = 'INFO';

// ── Check Functions ──────────────────────────────────────────────────────────

/**
 * Check that all expected tables exist.
 */
function checkTableExistence() {
  const issues = [];
  const existing = (all("SELECT name FROM sqlite_master WHERE type='table'") || [])
    .map(r => r.name);

  for (const table of EXPECTED_TABLES) {
    if (!existing.includes(table)) {
      issues.push({
        severity: CRITICAL,
        check: 'table_missing',
        message: `Table "${table}" does not exist. Agents referencing this table will crash.`,
      });
    }
  }

  return { issues, tableCount: existing.length };
}

/**
 * Check that critical columns exist on key tables.
 */
function checkColumnExistence() {
  const issues = [];

  for (const [table, columns] of Object.entries(EXPECTED_COLUMNS)) {
    try {
      const tableInfo = all(`PRAGMA table_info(${table})`) || [];
      const existingCols = tableInfo.map(c => c.name);

      for (const col of columns) {
        if (!existingCols.includes(col)) {
          issues.push({
            severity: HIGH,
            check: 'column_missing',
            message: `Column "${col}" missing from "${table}". ALTER TABLE migration may not have run.`,
          });
        }
      }
    } catch {
      // Table doesn't exist — already caught by checkTableExistence
    }
  }

  return { issues };
}

/**
 * Check for orphaned records (broken foreign keys).
 */
function checkOrphanedRecords() {
  const issues = [];

  // Outreach sequences pointing to non-existent leads
  try {
    const orphanedSeqs = get(`
      SELECT COUNT(*) as n FROM cfo_outreach_sequences s
      LEFT JOIN cfo_leads l ON l.id = s.lead_id
      WHERE l.id IS NULL
    `);
    if (orphanedSeqs?.n > 0) {
      issues.push({
        severity: MEDIUM,
        check: 'orphaned_sequences',
        message: `${orphanedSeqs.n} outreach sequences reference non-existent leads.`,
      });
    }
  } catch {}

  // Revenue events pointing to non-existent leads
  try {
    const orphanedEvents = get(`
      SELECT COUNT(*) as n FROM revenue_events re
      LEFT JOIN cfo_leads l ON l.id = re.lead_id AND re.lead_table = 'cfo_leads'
      WHERE l.id IS NULL AND re.lead_table = 'cfo_leads'
    `);
    if (orphanedEvents?.n > 0) {
      issues.push({
        severity: LOW,
        check: 'orphaned_revenue_events',
        message: `${orphanedEvents.n} revenue events reference non-existent leads.`,
      });
    }
  } catch {}

  // Runs pointing to non-existent agents
  try {
    const orphanedRuns = get(`
      SELECT COUNT(*) as n FROM runs r
      LEFT JOIN agents a ON a.id = r.agent_id
      WHERE a.id IS NULL AND r.agent_id IS NOT NULL
    `);
    if (orphanedRuns?.n > 0) {
      issues.push({
        severity: LOW,
        check: 'orphaned_runs',
        message: `${orphanedRuns.n} runs reference non-existent agents (likely deleted or re-seeded).`,
      });
    }
  } catch {}

  return { issues };
}

/**
 * Check for data anomalies.
 */
function checkDataAnomalies() {
  const issues = [];

  // Leads with impossible status values
  try {
    const validStatuses = ['new', 'contacted', 'replied', 'nurture', 'meeting_booked',
      'diagnostic', 'pilot', 'committed', 'closed_won', 'closed_lost', 'client',
      'dead', 'bounced', 'unsubscribed', 'bad_contact'];
    const badStatus = all(`
      SELECT status, COUNT(*) as n FROM cfo_leads
      WHERE status NOT IN (${validStatuses.map(() => '?').join(',')})
      GROUP BY status
    `, validStatuses);
    for (const row of (badStatus || [])) {
      issues.push({
        severity: MEDIUM,
        check: 'invalid_lead_status',
        message: `${row.n} leads have unknown status: "${row.status}".`,
      });
    }
  } catch {}

  // Revenue stage mismatches (revenue_stage doesn't match status)
  try {
    const wonButNotClosed = get(`
      SELECT COUNT(*) as n FROM cfo_leads
      WHERE revenue_stage = 'closed_won' AND status NOT IN ('closed_won', 'client')
    `);
    if (wonButNotClosed?.n > 0) {
      issues.push({
        severity: MEDIUM,
        check: 'stage_mismatch',
        message: `${wonButNotClosed.n} leads have revenue_stage=closed_won but status is not closed_won/client.`,
      });
    }
  } catch {}

  // Leads with engagement_score > 100
  try {
    const overscored = get('SELECT COUNT(*) as n FROM cfo_leads WHERE engagement_score > 100');
    if (overscored?.n > 0) {
      issues.push({
        severity: LOW,
        check: 'engagement_overflow',
        message: `${overscored.n} leads have engagement_score > 100 (should be capped).`,
      });
    }
  } catch {}

  // Null emails on contacted leads (can't contact without email)
  try {
    const noEmail = get(`
      SELECT COUNT(*) as n FROM cfo_leads
      WHERE status IN ('contacted', 'replied', 'meeting_booked') AND contact_email IS NULL
    `);
    if (noEmail?.n > 0) {
      issues.push({
        severity: MEDIUM,
        check: 'contacted_without_email',
        message: `${noEmail.n} leads are "contacted" but have no email address.`,
      });
    }
  } catch {}

  return { issues };
}

/**
 * Check for stale data — things stuck that shouldn't be.
 */
function checkStaleData() {
  const issues = [];

  // Leads stalled in a stage for too long
  try {
    const stalledLeads = get(`
      SELECT COUNT(*) as n FROM cfo_leads
      WHERE stalled = 1 AND status NOT IN ('dead', 'bounced', 'unsubscribed', 'closed_won', 'closed_lost')
    `);
    if (stalledLeads?.n > 10) {
      issues.push({
        severity: MEDIUM,
        check: 'many_stalled_leads',
        message: `${stalledLeads.n} leads are flagged as stalled. Pipeline director may not be running.`,
      });
    }
  } catch {}

  // Schedules that haven't run in 7+ days
  try {
    const staleSchedules = all(`
      SELECT name, last_run_at FROM schedules
      WHERE enabled = 1 AND last_run_at < datetime('now', '-7 days')
      ORDER BY last_run_at ASC LIMIT 5
    `) || [];
    for (const s of staleSchedules) {
      issues.push({
        severity: HIGH,
        check: 'stale_schedule',
        message: `Schedule "${s.name}" hasn't run since ${s.last_run_at}. May be broken or server was down.`,
      });
    }
  } catch {}

  // Content pieces stuck in draft for 7+ days
  try {
    const staleDrafts = get(`
      SELECT COUNT(*) as n FROM cfo_content_pieces
      WHERE status = 'draft' AND created_at < datetime('now', '-7 days')
    `);
    if (staleDrafts?.n > 5) {
      issues.push({
        severity: LOW,
        check: 'stale_drafts',
        message: `${staleDrafts.n} content drafts are 7+ days old without QA review.`,
      });
    }
  } catch {}

  // Outreach stuck in 'approved' (approved but never sent)
  try {
    const unsent = get(`
      SELECT COUNT(*) as n FROM cfo_outreach_sequences
      WHERE status = 'approved' AND created_at < datetime('now', '-3 days')
    `);
    if (unsent?.n > 10) {
      issues.push({
        severity: MEDIUM,
        check: 'approved_never_sent',
        message: `${unsent.n} approved outreach emails haven't been sent (3+ days old). Check outreach-sender schedule.`,
      });
    }
  } catch {}

  // Calendar entries that are past due but not assigned
  try {
    const pastDue = get(`
      SELECT COUNT(*) as n FROM content_calendar
      WHERE status = 'planned' AND scheduled_date < date('now')
    `);
    if (pastDue?.n > 3) {
      issues.push({
        severity: LOW,
        check: 'calendar_past_due',
        message: `${pastDue.n} content calendar entries are past their scheduled date but still "planned".`,
      });
    }
  } catch {}

  return { issues };
}

/**
 * Check database size and table row counts.
 */
function checkSizeAndGrowth() {
  const stats = {};

  // DB file size
  try {
    const dbPath = path.resolve(process.env.DB_PATH || './data/clawops.db');
    if (fs.existsSync(dbPath)) {
      const size = fs.statSync(dbPath).size;
      stats.db_size_mb = Math.round(size / 1024 / 1024 * 10) / 10;
    }
  } catch {}

  // Row counts for key tables
  const tables = ['agents', 'runs', 'schedules', 'cfo_leads', 'cfo_content_pieces',
    'cfo_outreach_sequences', 'revenue_events', 'engagement_events', 'outreach_variants',
    'newsletter_subscribers', 'content_calendar', 'marketing_learnings',
    'brain_fallback_episodes', 'audit_log'];

  stats.row_counts = {};
  for (const table of tables) {
    try {
      const row = get(`SELECT COUNT(*) as n FROM ${table}`);
      stats.row_counts[table] = row?.n || 0;
    } catch {
      stats.row_counts[table] = -1; // table doesn't exist
    }
  }

  const issues = [];

  // Warn if audit_log is huge (performance concern)
  if ((stats.row_counts.audit_log || 0) > 50000) {
    issues.push({
      severity: LOW,
      check: 'large_audit_log',
      message: `audit_log has ${stats.row_counts.audit_log} rows. Consider archiving old entries.`,
    });
  }

  // Warn if DB > 500MB
  if ((stats.db_size_mb || 0) > 500) {
    issues.push({
      severity: MEDIUM,
      check: 'large_database',
      message: `Database is ${stats.db_size_mb} MB. Consider cleanup or archival.`,
    });
  }

  return { issues, stats };
}

// ── Main Health Check ────────────────────────────────────────────────────────

/**
 * Run all health checks and return a complete report.
 */
function runHealthCheck() {
  const startTime = Date.now();
  const allIssues = [];

  const tableCheck = checkTableExistence();
  allIssues.push(...tableCheck.issues);

  const columnCheck = checkColumnExistence();
  allIssues.push(...columnCheck.issues);

  const orphanCheck = checkOrphanedRecords();
  allIssues.push(...orphanCheck.issues);

  const anomalyCheck = checkDataAnomalies();
  allIssues.push(...anomalyCheck.issues);

  const staleCheck = checkStaleData();
  allIssues.push(...staleCheck.issues);

  const sizeCheck = checkSizeAndGrowth();
  allIssues.push(...sizeCheck.issues);

  // Sort by severity
  const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
  allIssues.sort((a, b) => order[a.severity] - order[b.severity]);

  const summary = {
    critical: allIssues.filter(i => i.severity === CRITICAL).length,
    high: allIssues.filter(i => i.severity === HIGH).length,
    medium: allIssues.filter(i => i.severity === MEDIUM).length,
    low: allIssues.filter(i => i.severity === LOW).length,
  };

  const healthy = summary.critical === 0 && summary.high === 0;

  return {
    healthy,
    durationMs: Date.now() - startTime,
    tableCount: tableCheck.tableCount,
    dbStats: sizeCheck.stats,
    summary,
    issues: allIssues,
  };
}

/**
 * Format the health check as a readable report.
 */
function formatReport(report) {
  const lines = [
    `# Database Health Report`,
    `Status: ${report.healthy ? 'HEALTHY' : 'ISSUES FOUND'}`,
    `Tables: ${report.tableCount} | DB: ${report.dbStats?.db_size_mb || '?'} MB`,
    `Issues: ${report.summary.critical} critical, ${report.summary.high} high, ${report.summary.medium} medium, ${report.summary.low} low`,
    '',
  ];

  if (report.issues.length > 0) {
    for (const issue of report.issues) {
      lines.push(`[${issue.severity}] ${issue.message} (${issue.check})`);
    }
    lines.push('');
  }

  // Row counts
  if (report.dbStats?.row_counts) {
    lines.push('Table Row Counts:');
    for (const [table, count] of Object.entries(report.dbStats.row_counts)) {
      const status = count === -1 ? 'MISSING' : count.toLocaleString();
      lines.push(`  ${table}: ${status}`);
    }
  }

  return lines.join('\n');
}

module.exports = {
  runHealthCheck,
  formatReport,
  checkTableExistence,
  checkColumnExistence,
  checkOrphanedRecords,
  checkDataAnomalies,
  checkStaleData,
  checkSizeAndGrowth,
};
