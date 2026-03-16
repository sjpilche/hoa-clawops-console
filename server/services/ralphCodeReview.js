/**
 * @file ralphCodeReview.js
 * @description Ralph Code Reviewer — automated quality checks for new/modified code.
 *
 * Extends Ralph's QA role from content/outreach review to CODE review.
 * Runs deterministic checks ($0) to catch common bugs before they hit production:
 *   - SQL injection patterns (template literals with user input)
 *   - Missing error handling (async without try/catch)
 *   - Schema mismatches (column names that don't exist)
 *   - Hardcoded secrets or paths
 *   - Missing input validation
 *   - Common Node.js anti-patterns
 *
 * Optional: Ollama deep review ($0) for logic errors, race conditions.
 *
 * Usage:
 *   const ralph = require('./ralphCodeReview');
 *   const result = ralph.reviewFile('server/services/myService.js');
 *   const batch = ralph.reviewChangedFiles();  // reviews git diff
 *
 * Handler: ralph_code_review (registered in runs.js)
 * Schedule: On-demand or after each deploy
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

// ── Severity Levels ──────────────────────────────────────────────────────────
const CRITICAL = 'CRITICAL';
const HIGH = 'HIGH';
const MEDIUM = 'MEDIUM';
const LOW = 'LOW';

// ── Known DB Schema (columns that actually exist) ────────────────────────────
// Prevents the content_queue column name bug from happening again.
const KNOWN_TABLES = {
  cfo_leads: ['id', 'company_name', 'contact_name', 'contact_email', 'contact_title',
    'contact_linkedin', 'website', 'state', 'city', 'status', 'source', 'source_agent',
    'pilot_fit_score', 'pilot_fit_reason', 'urgency_score', 'urgency_signals',
    'phone', 'enrichment_status', 'enrichment_method', 'dossier', 'pipeline_stage',
    'stage_entered_at', 'days_in_stage', 'next_action', 'stalled', 'notes',
    'erp_type', 'revenue_range', 'employee_count',
    'last_touch_number', 'cadence_active', 'next_touch_due',
    'deal_value_cents', 'deal_closed_at', 'deal_closed_by', 'revenue_stage',
    'engagement_score', 'last_engaged_at', 'days_to_first_reply', 'days_to_close',
    'attributed_sequence_id', 'attributed_touch_number', 'revenue_stage_changed_at',
    'performance_score', 'target_keyword', 'calendar_id',
    'created_at', 'updated_at'],
  content_queue: ['id', 'platform', 'post_type', 'content', 'topic', 'source_agent',
    'status', 'scheduled_for', 'posted_at', 'facebook_post_id', 'error_message',
    'created_at', 'updated_at'],
  cfo_outreach_sequences: ['id', 'lead_id', 'sequence_type', 'email_subject', 'email_body',
    'pilot_offer', 'status', 'sent_at', 'replied_at', 'delivery_status', 'delivery_error',
    'sequence_position', 'source_agent', 'qa_status', 'qa_score', 'qa_notes', 'created_at'],
  cfo_content_pieces: ['id', 'pillar', 'channel', 'title', 'content_markdown', 'cta',
    'source_agent', 'status', 'qa_status', 'qa_score', 'qa_notes', 'published_at',
    'performance_score', 'leads_generated', 'email_clicks', 'social_shares',
    'newsletter_clicks', 'page_views', 'scored_at', 'target_keyword', 'calendar_id',
    'created_at', 'updated_at'],
  newsletter_subscribers: ['id', 'email', 'name', 'product', 'source', 'source_detail',
    'status', 'lead_id', 'welcome_step', 'welcome_next_at', 'total_opens', 'total_clicks',
    'subscribed_at', 'unsubscribed_at', 'created_at'],
  revenue_events: ['id', 'lead_id', 'lead_table', 'event_type', 'revenue_stage_before',
    'revenue_stage_after', 'value_cents', 'agent_name', 'sequence_id', 'touch_number',
    'channel', 'metadata', 'created_at'],
};

// ── Check Functions ──────────────────────────────────────────────────────────

/**
 * Check for SQL injection patterns.
 */
function checkSqlInjection(code, filename) {
  const issues = [];
  const lines = code.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Template literal directly in SQL with user-controlled value
    // Only flag if the line actually constructs a SQL query (contains SQL keywords as function args)
    if (/`[^`]*\$\{(?!safeTable|escXml|safeCol|columnMap)[^}]*\}[^`]*`/.test(line)) {
      // Must be on a line that calls a db function (run, get, all, prepare, exec, query)
      // The template literal must be inside the SQL string (first arg), not params array
      // Pattern: get(`SQL with ${var}`, [...]) — dangerous
      // Pattern: get("SQL", [`%${var}%`]) — safe (var is in params)
      const isSqlContext = /(?:^|\s|;)(?:run|get|all|prepare|exec|query|db\.run|dbRun|dbGet)\s*\(/.test(line);
      // Check if the template literal is inside params (after a comma, inside [])
      const isInParams = /,\s*\[.*\$\{/.test(line);
      if (isSqlContext && !isInParams) {
        const match = line.match(/\$\{([^}]+)\}/);
        if (match && !/table|Table|TABLE|safeTable|safeCol|columnMap/.test(match[1])) {
          issues.push({
            severity: CRITICAL,
            line: lineNum,
            file: filename,
            rule: 'sql-injection',
            message: `Template literal in SQL query: \${${match[1]}}. Use parameterized queries (?) instead.`,
          });
        }
      }
    }

    // String concatenation in SQL
    if (/(?:SELECT|INSERT|UPDATE|DELETE|WHERE)\s.*\+\s*(?:req\.|params\.|body\.|query\.)/.test(line)) {
      issues.push({
        severity: CRITICAL,
        line: lineNum,
        file: filename,
        rule: 'sql-concat',
        message: 'String concatenation with user input in SQL query. Use parameterized queries.',
      });
    }
  }

  return issues;
}

/**
 * Check for missing error handling.
 */
function checkErrorHandling(code, filename) {
  const issues = [];
  const lines = code.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // async function without try/catch nearby
    if (/^(?:async\s+)?function\s+\w+/.test(line.trim()) && line.includes('async')) {
      // Look ahead 3 lines for try {
      const ahead = lines.slice(i + 1, i + 5).join('\n');
      if (!ahead.includes('try') && !ahead.includes('catch')) {
        // Check if the function body has any awaits
        const body = lines.slice(i + 1, Math.min(i + 50, lines.length)).join('\n');
        const closingBrace = body.indexOf('\n}');
        const functionBody = body.slice(0, closingBrace > 0 ? closingBrace : 200);
        if (functionBody.includes('await') && !functionBody.includes('try')) {
          issues.push({
            severity: MEDIUM,
            line: lineNum,
            file: filename,
            rule: 'async-no-trycatch',
            message: 'Async function with await but no try/catch. Uncaught errors will crash the handler.',
          });
        }
      }
    }

    // Empty catch blocks
    if (/catch\s*\(\s*\)\s*\{\s*\}/.test(line) || /catch\s*\{?\s*\}/.test(line)) {
      issues.push({
        severity: LOW,
        line: lineNum,
        file: filename,
        rule: 'empty-catch',
        message: 'Empty catch block — errors silently swallowed. Add at least a console.warn.',
      });
    }
  }

  return issues;
}

/**
 * Check for schema mismatches — column names that don't exist in known tables.
 */
function checkSchemaMismatch(code, filename) {
  const issues = [];

  for (const [table, columns] of Object.entries(KNOWN_TABLES)) {
    // Find SQL referencing this table
    const tableRegex = new RegExp(`(?:FROM|INTO|UPDATE|JOIN)\\s+${table}`, 'gi');
    if (!tableRegex.test(code)) continue;

    // Extract column references after INSERT INTO table (col1, col2, ...)
    const insertRegex = new RegExp(`INSERT\\s+(?:OR\\s+\\w+\\s+)?INTO\\s+${table}\\s*\\(([^)]+)\\)`, 'gi');
    let match;
    while ((match = insertRegex.exec(code)) !== null) {
      const cols = match[1].split(',').map(c => c.trim().toLowerCase());
      for (const col of cols) {
        if (col && !columns.includes(col) && col !== '?' && !col.startsWith('--')) {
          const lineNum = code.slice(0, match.index).split('\n').length;
          issues.push({
            severity: CRITICAL,
            line: lineNum,
            file: filename,
            rule: 'schema-mismatch',
            message: `Column "${col}" not found in ${table}. Known columns: ${columns.slice(0, 5).join(', ')}...`,
          });
        }
      }
    }
  }

  return issues;
}

/**
 * Check for hardcoded secrets and paths.
 */
function checkSecrets(code, filename) {
  const issues = [];
  const lines = code.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Skip comments
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

    // Hardcoded API keys
    if (/(?:api_key|apikey|secret|token|password)\s*[:=]\s*['"][A-Za-z0-9_-]{20,}['"]/i.test(line)) {
      issues.push({
        severity: CRITICAL,
        line: lineNum,
        file: filename,
        rule: 'hardcoded-secret',
        message: 'Possible hardcoded secret/API key. Use environment variables instead.',
      });
    }

    // Hardcoded Windows paths
    if (/C:\\Users\\|C:\/Users\//i.test(line) && !line.includes('// ') && !line.includes('* ')) {
      issues.push({
        severity: HIGH,
        line: lineNum,
        file: filename,
        rule: 'hardcoded-path',
        message: 'Hardcoded Windows user path. Use __dirname, process.cwd(), or environment variable.',
      });
    }
  }

  return issues;
}

/**
 * Check for missing input validation on route handlers.
 */
function checkInputValidation(code, filename) {
  const issues = [];

  // Only check route files
  if (!filename.includes('routes/')) return issues;

  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // POST/PUT handler without body validation
    if (/router\.(post|put)\s*\(/.test(line)) {
      const body = lines.slice(i + 1, i + 15).join('\n');
      if (body.includes('req.body') && !body.includes('status(400)') && !body.includes('!req.body')) {
        issues.push({
          severity: MEDIUM,
          line: lineNum,
          file: filename,
          rule: 'no-input-validation',
          message: 'POST/PUT handler accesses req.body without validation. Add input checks.',
        });
      }
    }
  }

  return issues;
}

/**
 * Check for common Node.js anti-patterns.
 */
function checkAntiPatterns(code, filename) {
  const issues = [];
  const lines = code.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // console.log in production code (not in if/catch/warn)
    // Skip — too noisy for this codebase which uses console.log extensively

    // Synchronous file operations in request handlers
    if (/readFileSync|writeFileSync/.test(line) && filename.includes('routes/')) {
      issues.push({
        severity: MEDIUM,
        line: lineNum,
        file: filename,
        rule: 'sync-fs-in-route',
        message: 'Synchronous file I/O in route handler. Use async fs operations to avoid blocking.',
      });
    }

    // eval() usage
    if (/\beval\s*\(/.test(line)) {
      issues.push({
        severity: CRITICAL,
        line: lineNum,
        file: filename,
        rule: 'eval-usage',
        message: 'eval() detected — never use eval with user input. Use JSON.parse or a safe alternative.',
      });
    }
  }

  return issues;
}

// ── Main Review Functions ────────────────────────────────────────────────────

/**
 * Review a single file and return all findings.
 */
function reviewFile(filePath) {
  const fullPath = path.resolve(ROOT, filePath);
  if (!fs.existsSync(fullPath)) {
    return { file: filePath, error: 'File not found', issues: [] };
  }

  const code = fs.readFileSync(fullPath, 'utf-8');
  const issues = [
    ...checkSqlInjection(code, filePath),
    ...checkErrorHandling(code, filePath),
    ...checkSchemaMismatch(code, filePath),
    ...checkSecrets(code, filePath),
    ...checkInputValidation(code, filePath),
    ...checkAntiPatterns(code, filePath),
  ];

  // Sort by severity
  const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);

  const score = Math.max(0, 100 - (
    issues.filter(i => i.severity === CRITICAL).length * 25 +
    issues.filter(i => i.severity === HIGH).length * 15 +
    issues.filter(i => i.severity === MEDIUM).length * 5 +
    issues.filter(i => i.severity === LOW).length * 2
  ));

  return {
    file: filePath,
    score,
    passed: score >= 70,
    issues,
    summary: {
      critical: issues.filter(i => i.severity === CRITICAL).length,
      high: issues.filter(i => i.severity === HIGH).length,
      medium: issues.filter(i => i.severity === MEDIUM).length,
      low: issues.filter(i => i.severity === LOW).length,
    },
  };
}

/**
 * Review all changed files (git diff against main).
 */
function reviewChangedFiles() {
  let changedFiles;
  try {
    const { execSync } = require('child_process');
    const diff = execSync('git diff --name-only HEAD', { cwd: ROOT, encoding: 'utf-8' });
    const untracked = execSync('git ls-files --others --exclude-standard', { cwd: ROOT, encoding: 'utf-8' });
    changedFiles = [...diff.split('\n'), ...untracked.split('\n')]
      .map(f => f.trim())
      .filter(f => f.endsWith('.js') && (f.startsWith('server/') || f.startsWith('scripts/')));
  } catch {
    return { error: 'git not available', results: [] };
  }

  const results = changedFiles.map(f => reviewFile(f));
  const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);
  const criticalCount = results.reduce((sum, r) => sum + (r.summary?.critical || 0), 0);
  const avgScore = results.length > 0
    ? Math.round(results.reduce((sum, r) => sum + (r.score || 0), 0) / results.length)
    : 100;

  return {
    filesReviewed: results.length,
    totalIssues,
    criticalCount,
    avgScore,
    passed: criticalCount === 0 && avgScore >= 70,
    results,
  };
}

/**
 * Review specific service files (the ones we built today).
 */
function reviewNewServices() {
  const newFiles = [
    'server/services/revenueTracker.js',
    'server/services/brainReader.js',
    'server/services/marketingLearner.js',
    'server/services/seoGenerator.js',
    'server/services/linkedinPoster.js',
    'server/services/twitterPoster.js',
    'server/services/newsletterBroadcast.js',
    'server/routes/revenue.js',
    'server/routes/leadCapture.js',
  ];

  return newFiles.map(f => reviewFile(f));
}

/**
 * Format review results as a readable report.
 */
function formatReport(results) {
  const lines = ['# Ralph Code Review Report', ''];

  if (Array.isArray(results)) {
    // Multiple files
    const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);
    lines.push(`**Files reviewed:** ${results.length}`);
    lines.push(`**Total issues:** ${totalIssues}`);
    lines.push('');

    for (const r of results) {
      if (r.issues.length === 0) {
        lines.push(`**${r.file}** — Score: ${r.score}/100 ✅`);
      } else {
        lines.push(`**${r.file}** — Score: ${r.score}/100 ${r.passed ? '✅' : '❌'}`);
        for (const issue of r.issues) {
          lines.push(`  [${issue.severity}] Line ${issue.line}: ${issue.message} (${issue.rule})`);
        }
      }
      lines.push('');
    }
  } else {
    // Single result
    lines.push(`**${results.file}** — Score: ${results.score}/100 ${results.passed ? '✅' : '❌'}`);
    for (const issue of results.issues) {
      lines.push(`  [${issue.severity}] Line ${issue.line}: ${issue.message} (${issue.rule})`);
    }
  }

  return lines.join('\n');
}

module.exports = {
  reviewFile,
  reviewChangedFiles,
  reviewNewServices,
  formatReport,
  // Exposed for testing
  checkSqlInjection,
  checkErrorHandling,
  checkSchemaMismatch,
  checkSecrets,
  checkInputValidation,
  checkAntiPatterns,
  KNOWN_TABLES,
};
