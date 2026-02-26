/**
 * @file collectiveBrain.js
 * @description Cross-agent collective intelligence — 4-layer learning system.
 *
 * LAYER 1: Shared Scratchpad   — agents pass structured observations to each other
 * LAYER 2: Feedback Signals    — human approvals/rejections teach agents in-context
 * LAYER 3: Episodic Memory     — market-specific outcome patterns accumulate over time
 * LAYER 4: Knowledge Base      — distilled best outputs teach all future agent runs
 *
 * All data lives in Azure SQL. Local SQLite is the operational DB; Azure is the brain.
 *
 * Usage:
 *   const brain = require('./collectiveBrain');
 *
 *   // Layer 1 — write an observation after discovery
 *   await brain.observe(sessionId, 'jake-construction-discovery', 'lead_signal', {
 *     subject: 'Suncoast Builders',
 *     content: '48 employees, QuickBooks heavy, new CFO hire, Tampa Bay',
 *     metadata: { company_id: 261, erp: 'QuickBooks', employees: 48 }
 *   });
 *
 *   // Layer 1 — read observations before outreach
 *   const obs = await brain.getObservations(sessionId, ['lead_signal', 'market_insight']);
 *
 *   // Layer 2 — inject feedback into a prompt
 *   const feedbackBlock = await brain.getFeedbackPromptBlock('jake-outreach-agent', 5);
 *
 *   // Layer 3 — retrieve similar winning episodes before writing outreach
 *   const episodes = await brain.getSimilarEpisodes({ market: 'Tampa Bay, FL', erp: 'QuickBooks', limit: 3 });
 *
 *   // Layer 4 — get knowledge base examples before generating content
 *   const examples = await brain.getKnowledgeExamples('outreach_email', { market: 'Tampa Bay, FL', limit: 3 });
 */

'use strict';

const sql = require('mssql');

// ═══════════════════════════════════════════════════════════════════════════
// CONNECTION
// ═══════════════════════════════════════════════════════════════════════════

let _pool = null;
let _azureDown = false; // tracks whether Azure was reachable on last attempt

async function getPool() {
  if (_pool) return _pool;
  _pool = await sql.connect({
    server:   process.env.AZURE_SQL_SERVER,
    database: process.env.AZURE_SQL_DATABASE,
    user:     process.env.AZURE_SQL_USER,
    password: process.env.AZURE_SQL_PASSWORD,
    options:  { encrypt: true, trustServerCertificate: false, connectTimeout: 15000 },
    pool:     { max: 5, min: 0, idleTimeoutMillis: 30000 },
  });
  _azureDown = false;
  console.log('[CollectiveBrain] ✅ Connected to Azure SQL');
  return _pool;
}

// ═══════════════════════════════════════════════════════════════════════════
// SQLITE FALLBACK — mirrors brain writes when Azure is unavailable
// ═══════════════════════════════════════════════════════════════════════════

function getFallbackDb() {
  return require('../db/connection');
}

function writeFallbackObservation(data) {
  try {
    const { run } = getFallbackDb();
    run(
      `INSERT INTO brain_fallback_observations (session_id, agent_name, obs_type, subject, content, confidence, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [data.session_id, data.agent_name, data.obs_type, data.subject || null,
       data.content, data.confidence ?? 0.8, data.metadata ? JSON.stringify(data.metadata) : null]
    );
  } catch (e) { console.warn('[CollectiveBrain] SQLite fallback write failed:', e.message); }
}

function writeFallbackFeedback(data) {
  try {
    const { run } = getFallbackDb();
    run(
      `INSERT INTO brain_fallback_feedback (agent_name, output_type, output_id, signal, before_text, after_text, market, notes, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.agent_name, data.output_type, data.output_id || null, data.signal,
       data.before_text || null, data.after_text || null, data.market || null,
       data.notes || null, data.metadata ? JSON.stringify(data.metadata) : null]
    );
  } catch (e) { console.warn('[CollectiveBrain] SQLite fallback feedback write failed:', e.message); }
}

function writeFallbackEpisode(data) {
  try {
    const { run } = getFallbackDb();
    run(
      `INSERT INTO brain_fallback_episodes (agent_name, market, erp_context, contact_title, action_taken, outcome, outcome_type, outcome_score, days_to_outcome, lead_id, run_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.agent_name, data.market || null, data.erp_context || null,
       data.contact_title || null, data.action_taken, data.outcome,
       data.outcome_type, data.outcome_score ?? 0.5, data.days_to_outcome || null,
       data.lead_id || null, data.run_id || null]
    );
  } catch (e) { console.warn('[CollectiveBrain] SQLite fallback episode write failed:', e.message); }
}

/**
 * Drain SQLite fallback rows into Azure on reconnect.
 * Called at the start of buildAgentContext() — non-blocking, fire-and-forget.
 */
async function drainFallback() {
  if (_azureDown) return; // don't even try if last attempt failed
  try {
    const { all, run: dbRun } = getFallbackDb();
    const pool = await getPool();

    // Drain observations
    const obs = all('SELECT * FROM brain_fallback_observations WHERE synced = 0 LIMIT 50');
    for (const o of obs) {
      try {
        await pool.request()
          .input('session_id', sql.NVarChar, o.session_id)
          .input('agent_name', sql.NVarChar, o.agent_name)
          .input('obs_type',   sql.NVarChar, o.obs_type)
          .input('subject',    sql.NVarChar, o.subject || null)
          .input('content',    sql.NVarChar, o.content)
          .input('confidence', sql.Float,    o.confidence)
          .input('metadata',   sql.NVarChar, o.metadata || null)
          .query(`INSERT INTO shared_observations (session_id,agent_name,obs_type,subject,content,confidence,metadata)
                  VALUES (@session_id,@agent_name,@obs_type,@subject,@content,@confidence,@metadata)`);
        dbRun('UPDATE brain_fallback_observations SET synced=1 WHERE id=?', [o.id]);
      } catch {}
    }

    // Drain feedback
    const fb = all('SELECT * FROM brain_fallback_feedback WHERE synced = 0 LIMIT 50');
    for (const f of fb) {
      try {
        await pool.request()
          .input('agent_name',  sql.NVarChar, f.agent_name)
          .input('output_type', sql.NVarChar, f.output_type)
          .input('output_id',   sql.NVarChar, f.output_id || null)
          .input('signal',      sql.NVarChar, f.signal)
          .input('before_text', sql.NVarChar, f.before_text || null)
          .input('after_text',  sql.NVarChar, f.after_text  || null)
          .input('notes',       sql.NVarChar, f.notes       || null)
          .input('market',      sql.NVarChar, f.market      || null)
          .input('metadata',    sql.NVarChar, f.metadata    || null)
          .query(`INSERT INTO agent_feedback (agent_name,output_type,output_id,signal,before_text,after_text,notes,market,metadata)
                  VALUES (@agent_name,@output_type,@output_id,@signal,@before_text,@after_text,@notes,@market,@metadata)`);
        dbRun('UPDATE brain_fallback_feedback SET synced=1 WHERE id=?', [f.id]);
      } catch {}
    }

    // Drain episodes
    const ep = all('SELECT * FROM brain_fallback_episodes WHERE synced = 0 LIMIT 50');
    for (const e of ep) {
      try {
        await pool.request()
          .input('agent_name',      sql.NVarChar, e.agent_name)
          .input('market',          sql.NVarChar, e.market          || null)
          .input('erp_context',     sql.NVarChar, e.erp_context     || null)
          .input('contact_title',   sql.NVarChar, e.contact_title   || null)
          .input('action_taken',    sql.NVarChar, e.action_taken)
          .input('outcome',         sql.NVarChar, e.outcome)
          .input('outcome_type',    sql.NVarChar, e.outcome_type)
          .input('outcome_score',   sql.Float,    e.outcome_score)
          .input('days_to_outcome', sql.Int,      e.days_to_outcome || null)
          .input('lead_id',         sql.NVarChar, e.lead_id         || null)
          .input('run_id',          sql.NVarChar, e.run_id          || null)
          .query(`INSERT INTO agent_episodes
                    (agent_name,market,erp_context,contact_title,action_taken,outcome,outcome_type,outcome_score,days_to_outcome,lead_id,run_id)
                  VALUES
                    (@agent_name,@market,@erp_context,@contact_title,@action_taken,@outcome,@outcome_type,@outcome_score,@days_to_outcome,@lead_id,@run_id)`);
        dbRun('UPDATE brain_fallback_episodes SET synced=1 WHERE id=?', [e.id]);
      } catch {}
    }

    const total = obs.length + fb.length + ep.length;
    if (total > 0) console.log(`[CollectiveBrain] ✅ Drained ${total} fallback rows to Azure`);
  } catch { /* non-fatal — Azure still down */ }
}

/**
 * Fire-and-forget wrapper — brain writes never block the pipeline.
 * On Azure failure, writes to SQLite fallback instead.
 */
function fireAndForget(fn, fallbackFn) {
  fn().then(() => { _azureDown = false; }).catch(err => {
    _azureDown = true;
    _pool = null; // reset pool so next attempt reconnects
    console.warn('[CollectiveBrain] Azure unavailable — writing to SQLite fallback:', err.message);
    if (fallbackFn) {
      try { fallbackFn(); } catch (fe) { console.warn('[CollectiveBrain] Fallback write also failed:', fe.message); }
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MIGRATION — run once at startup
// ═══════════════════════════════════════════════════════════════════════════

async function ensureTables() {
  const pool = await getPool();
  const r = pool.request();

  await r.query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'shared_observations')
    CREATE TABLE shared_observations (
      id         NVARCHAR(36)  NOT NULL PRIMARY KEY DEFAULT NEWID(),
      session_id NVARCHAR(128) NOT NULL,
      agent_name NVARCHAR(64)  NOT NULL,
      obs_type   NVARCHAR(32)  NOT NULL,
      subject    NVARCHAR(256),
      content    NVARCHAR(MAX) NOT NULL,
      confidence FLOAT         DEFAULT 1.0,
      metadata   NVARCHAR(MAX),
      expires_at DATETIME2,
      created_at DATETIME2     NOT NULL DEFAULT GETUTCDATE()
    );
  `);

  await r.query(`
    IF NOT EXISTS (SELECT * FROM sys.objects WHERE name='idx_obs_session' AND type='UQ')
    CREATE INDEX idx_obs_session ON shared_observations(session_id);
  `);

  await r.query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'agent_feedback')
    CREATE TABLE agent_feedback (
      id          NVARCHAR(36)  NOT NULL PRIMARY KEY DEFAULT NEWID(),
      agent_name  NVARCHAR(64)  NOT NULL,
      output_type NVARCHAR(32)  NOT NULL,
      output_id   NVARCHAR(36),
      signal      NVARCHAR(16)  NOT NULL,
      before_text NVARCHAR(MAX),
      after_text  NVARCHAR(MAX),
      notes       NVARCHAR(512),
      market      NVARCHAR(128),
      metadata    NVARCHAR(MAX),
      created_at  DATETIME2     NOT NULL DEFAULT GETUTCDATE()
    );
  `);

  await r.query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'agent_episodes')
    CREATE TABLE agent_episodes (
      id             NVARCHAR(36)  NOT NULL PRIMARY KEY DEFAULT NEWID(),
      agent_name     NVARCHAR(64)  NOT NULL,
      market         NVARCHAR(128),
      company_type   NVARCHAR(64),
      erp_context    NVARCHAR(64),
      contact_title  NVARCHAR(64),
      action_taken   NVARCHAR(MAX) NOT NULL,
      outcome        NVARCHAR(MAX) NOT NULL,
      outcome_type   NVARCHAR(32)  NOT NULL,
      outcome_score  FLOAT         DEFAULT 0.0,
      days_to_outcome INT,
      lead_id        NVARCHAR(36),
      run_id         NVARCHAR(36),
      created_at     DATETIME2     NOT NULL DEFAULT GETUTCDATE()
    );
  `);

  await r.query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'agent_knowledge_base')
    CREATE TABLE agent_knowledge_base (
      id            NVARCHAR(36)  NOT NULL PRIMARY KEY DEFAULT NEWID(),
      source_agent  NVARCHAR(64)  NOT NULL,
      content_type  NVARCHAR(32)  NOT NULL,
      title         NVARCHAR(512),
      content       NVARCHAR(MAX) NOT NULL,
      quality_score FLOAT         DEFAULT 1.0,
      market        NVARCHAR(128),
      erp_context   NVARCHAR(64),
      tags          NVARCHAR(512),
      use_count     INT           DEFAULT 0,
      source_id     NVARCHAR(36),
      distilled_at  DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
      created_at    DATETIME2     NOT NULL DEFAULT GETUTCDATE()
    );
  `);

  console.log('[CollectiveBrain] ✅ Tables ready');
}

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 1 — SHARED SCRATCHPAD
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Write a structured observation to the shared scratchpad.
 * Called by discovery, enricher, and outreach agents after each meaningful finding.
 * Fire-and-forget — never blocks the pipeline.
 *
 * @param {string} sessionId  - Pipeline run session ID (groups related observations)
 * @param {string} agentName  - Which agent is writing
 * @param {string} obsType    - 'lead_signal'|'market_insight'|'contact_found'|'risk_flag'|'content_gap'
 * @param {object} opts
 * @param {string} opts.subject   - Company name, market, topic
 * @param {string} opts.content   - The observation in plain English
 * @param {number} [opts.confidence=1.0]
 * @param {object} [opts.metadata]
 */
function observe(sessionId, agentName, obsType, { subject, content, confidence = 1.0, metadata } = {}) {
  fireAndForget(
    async () => {
      const pool = await getPool();
      await pool.request()
        .input('session_id', sql.NVarChar, sessionId)
        .input('agent_name', sql.NVarChar, agentName)
        .input('obs_type',   sql.NVarChar, obsType)
        .input('subject',    sql.NVarChar, subject || null)
        .input('content',    sql.NVarChar, content)
        .input('confidence', sql.Float,    confidence)
        .input('metadata',   sql.NVarChar, metadata ? JSON.stringify(metadata) : null)
        .query(`INSERT INTO shared_observations (session_id,agent_name,obs_type,subject,content,confidence,metadata)
                VALUES (@session_id,@agent_name,@obs_type,@subject,@content,@confidence,@metadata)`);
    },
    () => writeFallbackObservation({ session_id: sessionId, agent_name: agentName, obs_type: obsType, subject, content, confidence, metadata })
  );
}

/**
 * Read observations from the shared scratchpad for a given session.
 * Called by agents before starting work — gives them context from upstream agents.
 *
 * @param {string}   sessionId
 * @param {string[]} [types]    - Filter by obs_type (omit for all)
 * @param {number}   [limit=50]
 * @returns {Promise<object[]>}
 */
async function getObservations(sessionId, types = [], limit = 50) {
  try {
    const pool = await getPool();
    const req = pool.request()
      .input('session_id', sql.NVarChar, sessionId)
      .input('limit',      sql.Int,      limit);

    let query = `
      SELECT TOP (@limit) agent_name, obs_type, subject, content, confidence, metadata, created_at
      FROM shared_observations
      WHERE session_id = @session_id
    `;

    if (types.length > 0) {
      const placeholders = types.map((_, i) => `@t${i}`).join(',');
      types.forEach((t, i) => req.input(`t${i}`, sql.NVarChar, t));
      query += ` AND obs_type IN (${placeholders})`;
    }

    query += ' ORDER BY created_at ASC';
    const result = await req.query(query);
    return result.recordset;
  } catch (err) {
    console.warn('[CollectiveBrain] getObservations error:', err.message);
    return [];
  }
}

/**
 * Format observations as a prompt block for injection into agent context.
 * @param {string}   sessionId
 * @param {string[]} [types]
 * @returns {Promise<string>}  - Ready-to-inject text block, empty string if no obs
 */
async function getObservationsPromptBlock(sessionId, types = []) {
  const obs = await getObservations(sessionId, types, 30);
  if (obs.length === 0) return '';

  const lines = obs.map(o => {
    const meta = o.metadata ? (() => { try { return JSON.parse(o.metadata); } catch { return {}; } })() : {};
    const metaStr = Object.keys(meta).length > 0
      ? ' | ' + Object.entries(meta).map(([k,v]) => `${k}:${v}`).join(', ')
      : '';
    return `• [${o.obs_type}] ${o.subject ? o.subject + ': ' : ''}${o.content}${metaStr}`;
  });

  return `\n\nPIPELINE CONTEXT — Findings from earlier agents in this run:\n${lines.join('\n')}\n`;
}

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 2 — FEEDBACK SIGNALS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Record a human feedback signal (called from cfoMarketing.js approval routes).
 * Fire-and-forget.
 *
 * @param {string} agentName
 * @param {string} outputType  - 'outreach'|'content'|'social'
 * @param {string} outputId    - ID of the content/outreach row
 * @param {string} signal      - 'approved'|'rejected'|'edited'|'converted'|'bounced'
 * @param {object} [opts]
 */
function recordFeedback(agentName, outputType, outputId, signal, opts = {}) {
  fireAndForget(
    async () => {
      const pool = await getPool();
      await pool.request()
        .input('agent_name',  sql.NVarChar, agentName)
        .input('output_type', sql.NVarChar, outputType)
        .input('output_id',   sql.NVarChar, outputId || null)
        .input('signal',      sql.NVarChar, signal)
        .input('before_text', sql.NVarChar, opts.beforeText || null)
        .input('after_text',  sql.NVarChar, opts.afterText  || null)
        .input('notes',       sql.NVarChar, opts.notes      || null)
        .input('market',      sql.NVarChar, opts.market     || null)
        .input('metadata',    sql.NVarChar, opts.metadata   ? JSON.stringify(opts.metadata) : null)
        .query(`INSERT INTO agent_feedback (agent_name,output_type,output_id,signal,before_text,after_text,notes,market,metadata)
                VALUES (@agent_name,@output_type,@output_id,@signal,@before_text,@after_text,@notes,@market,@metadata)`);
    },
    () => writeFallbackFeedback({
      agent_name: agentName, output_type: outputType, output_id: outputId, signal,
      before_text: opts.beforeText, after_text: opts.afterText, notes: opts.notes,
      market: opts.market, metadata: opts.metadata,
    })
  );
}

/**
 * Build a feedback context block to inject into an agent's prompt before it runs.
 * The LLM sees its own history and self-corrects — no fine-tuning needed.
 *
 * @param {string} agentName
 * @param {number} [limit=6]
 * @returns {Promise<string>}  - Ready-to-inject text, empty string if no history
 */
async function getFeedbackPromptBlock(agentName, limit = 6) {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('agent_name', sql.NVarChar, agentName)
      .input('limit',      sql.Int,      limit)
      .query(`
        SELECT TOP (@limit) signal, notes, before_text, after_text, market, created_at
        FROM agent_feedback
        WHERE agent_name = @agent_name
        ORDER BY created_at DESC
      `);

    const rows = result.recordset;
    if (rows.length === 0) return '';

    const approved = rows.filter(r => r.signal === 'approved').length;
    const rejected = rows.filter(r => r.signal === 'rejected').length;
    const edited   = rows.filter(r => r.signal === 'edited').length;

    const lines = [`\n\nYOUR RECENT PERFORMANCE (learn from this before you write):`];
    lines.push(`Last ${rows.length} outputs: ${approved} approved ✅  ${rejected} rejected ❌  ${edited} edited ✏️`);
    lines.push('');

    rows.forEach(r => {
      const icon = { approved: '✅', rejected: '❌', edited: '✏️', converted: '🎯', bounced: '💀' }[r.signal] || '•';
      const date = new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const mkt  = r.market ? ` (${r.market})` : '';
      if (r.signal === 'edited' && r.before_text && r.after_text) {
        lines.push(`${icon} ${date}${mkt}: Changed from "${r.before_text.slice(0,80)}..." → "${r.after_text.slice(0,80)}..."`);
      } else {
        const note = r.notes ? ` — ${r.notes}` : '';
        const preview = (r.before_text || '').slice(0, 100);
        lines.push(`${icon} ${date}${mkt}${note}${preview ? ': "' + preview + '..."' : ''}`);
      }
    });

    // Summarize the pattern
    if (rejected > 0) {
      const rejectNotes = rows.filter(r => r.signal === 'rejected' && r.notes).map(r => r.notes);
      if (rejectNotes.length > 0) {
        lines.push('');
        lines.push(`⚠️  AVOID: ${rejectNotes.join(' | ')}`);
      }
    }

    lines.push('Apply these lessons to your output now.\n');
    return lines.join('\n');
  } catch (err) {
    console.warn('[CollectiveBrain] getFeedbackPromptBlock error:', err.message);
    return '';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 3 — EPISODIC MEMORY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Record an outcome episode after a lead interaction.
 * Call this when: email sent, reply received, call booked, no response after 14 days.
 * Fire-and-forget.
 */
function recordEpisode(agentName, { market, companyType, erpContext, contactTitle,
    actionTaken, outcome, outcomeType, outcomeScore = 0, daysToOutcome, leadId, runId } = {}) {
  fireAndForget(
    async () => {
      const pool = await getPool();
      await pool.request()
        .input('agent_name',      sql.NVarChar, agentName)
        .input('market',          sql.NVarChar, market          || null)
        .input('company_type',    sql.NVarChar, companyType     || null)
        .input('erp_context',     sql.NVarChar, erpContext      || null)
        .input('contact_title',   sql.NVarChar, contactTitle    || null)
        .input('action_taken',    sql.NVarChar, actionTaken)
        .input('outcome',         sql.NVarChar, outcome)
        .input('outcome_type',    sql.NVarChar, outcomeType)
        .input('outcome_score',   sql.Float,    outcomeScore)
        .input('days_to_outcome', sql.Int,      daysToOutcome   || null)
        .input('lead_id',         sql.NVarChar, leadId          || null)
        .input('run_id',          sql.NVarChar, runId           || null)
        .query(`INSERT INTO agent_episodes
                  (agent_name,market,company_type,erp_context,contact_title,action_taken,outcome,outcome_type,outcome_score,days_to_outcome,lead_id,run_id)
                VALUES
                  (@agent_name,@market,@company_type,@erp_context,@contact_title,@action_taken,@outcome,@outcome_type,@outcome_score,@days_to_outcome,@lead_id,@run_id)`);
    },
    () => writeFallbackEpisode({
      agent_name: agentName, market, erp_context: erpContext, contact_title: contactTitle,
      action_taken: actionTaken, outcome, outcome_type: outcomeType,
      outcome_score: outcomeScore, days_to_outcome: daysToOutcome, lead_id: leadId, run_id: runId,
    })
  );
}

/**
 * Retrieve similar winning episodes for use as examples before an agent runs.
 * Matches on market + ERP context — gives market-specific pattern learning.
 *
 * @param {object} opts
 * @returns {Promise<object[]>}
 */
async function getSimilarEpisodes({ market, erpContext, companyType, outcomeType, minScore = 0.5, limit = 5 } = {}) {
  try {
    const pool = await getPool();
    const req = pool.request().input('min_score', sql.Float, minScore).input('limit', sql.Int, limit);

    let where = 'WHERE outcome_score >= @min_score';
    if (market)      { req.input('market', sql.NVarChar, market);           where += ' AND market = @market'; }
    if (erpContext)  { req.input('erp',    sql.NVarChar, erpContext);        where += ' AND erp_context = @erp'; }
    if (companyType) { req.input('ctype',  sql.NVarChar, companyType);       where += ' AND company_type = @ctype'; }
    if (outcomeType) { req.input('otype',  sql.NVarChar, outcomeType);       where += ' AND outcome_type = @otype'; }

    const result = await req.query(`
      SELECT TOP (@limit) market, company_type, erp_context, contact_title,
             action_taken, outcome, outcome_type, outcome_score, days_to_outcome
      FROM agent_episodes
      ${where}
      ORDER BY outcome_score DESC, created_at DESC
    `);
    return result.recordset;
  } catch (err) {
    console.warn('[CollectiveBrain] getSimilarEpisodes error:', err.message);
    return [];
  }
}

/**
 * Format episodes as a prompt block.
 * @returns {Promise<string>}
 */
async function getEpisodesPromptBlock(opts = {}) {
  const episodes = await getSimilarEpisodes({ ...opts, limit: opts.limit || 3 });
  if (episodes.length === 0) return '';

  const lines = ['\n\nWINNING PATTERNS from past outreach in this market:'];
  episodes.forEach((ep, i) => {
    const ctx = [ep.market, ep.erp_context, ep.contact_title].filter(Boolean).join(' | ');
    const score = Math.round(ep.outcome_score * 100);
    lines.push(`\n[Example ${i+1} — ${score}% score | ${ctx}]`);
    lines.push(`Approach: ${ep.action_taken.slice(0, 300)}`);
    lines.push(`Result: ${ep.outcome} (${ep.outcome_type}${ep.days_to_outcome ? `, ${ep.days_to_outcome} days` : ''})`);
  });
  lines.push('\nModel your approach after these winning patterns.\n');
  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 4 — KNOWLEDGE BASE (Distillation)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Add an approved output to the knowledge base.
 * Called by the nightly distillation job — not directly by agents.
 */
async function addToKnowledgeBase({ sourceAgent, contentType, title, content, qualityScore = 1.0,
    market, erpContext, tags, sourceId } = {}) {
  try {
    const pool = await getPool();
    // Dedup — don't add the same source_id twice
    if (sourceId) {
      const exists = await pool.request()
        .input('source_id', sql.NVarChar, sourceId)
        .query('SELECT id FROM agent_knowledge_base WHERE source_id = @source_id');
      if (exists.recordset.length > 0) return { skipped: true };
    }

    await pool.request()
      .input('source_agent',  sql.NVarChar, sourceAgent)
      .input('content_type',  sql.NVarChar, contentType)
      .input('title',         sql.NVarChar, title         || null)
      .input('content',       sql.NVarChar, content)
      .input('quality_score', sql.Float,    qualityScore)
      .input('market',        sql.NVarChar, market        || null)
      .input('erp_context',   sql.NVarChar, erpContext     || null)
      .input('tags',          sql.NVarChar, tags ? JSON.stringify(tags) : null)
      .input('source_id',     sql.NVarChar, sourceId      || null)
      .query(`INSERT INTO agent_knowledge_base
                (source_agent,content_type,title,content,quality_score,market,erp_context,tags,source_id)
              VALUES
                (@source_agent,@content_type,@title,@content,@quality_score,@market,@erp_context,@tags,@source_id)`);
    return { inserted: true };
  } catch (err) {
    console.warn('[CollectiveBrain] addToKnowledgeBase error:', err.message);
    return { error: err.message };
  }
}

/**
 * Retrieve the best examples from the knowledge base before an agent runs.
 * Optionally filtered by market + ERP context for market-specific learning.
 *
 * @param {string} contentType  - 'outreach_email'|'blog_post'|'social_post'
 * @param {object} opts
 * @returns {Promise<object[]>}
 */
async function getKnowledgeExamples(contentType, { market, erpContext, limit = 3 } = {}) {
  try {
    const pool = await getPool();
    const req = pool.request()
      .input('content_type', sql.NVarChar, contentType)
      .input('limit',        sql.Int,      limit);

    let where = 'WHERE content_type = @content_type';
    if (market)     { req.input('market', sql.NVarChar, market);     where += ' AND (market = @market OR market IS NULL)'; }
    if (erpContext) { req.input('erp',    sql.NVarChar, erpContext);  where += ' AND (erp_context = @erp OR erp_context IS NULL)'; }

    const result = await req.query(`
      SELECT TOP (@limit) source_agent, title, content, quality_score, market, erp_context, tags, use_count
      FROM agent_knowledge_base
      ${where}
      ORDER BY
        CASE WHEN market IS NOT NULL THEN 1 ELSE 2 END,  -- market-specific first
        quality_score DESC,
        use_count ASC                                     -- prefer less-used examples
    `);

    // Increment use_count for retrieved rows (background)
    const ids = result.recordset.map(r => r.id).filter(Boolean);
    if (ids.length > 0) {
      fireAndForget(async () => {
        const p = await getPool();
        for (const id of ids) {
          await p.request().input('id', sql.NVarChar, id)
            .query('UPDATE agent_knowledge_base SET use_count = use_count + 1 WHERE id = @id');
        }
      });
    }

    return result.recordset;
  } catch (err) {
    console.warn('[CollectiveBrain] getKnowledgeExamples error:', err.message);
    return [];
  }
}

/**
 * Format knowledge base examples as a prompt block.
 * @returns {Promise<string>}
 */
async function getKnowledgePromptBlock(contentType, opts = {}) {
  const examples = await getKnowledgeExamples(contentType, opts);
  if (examples.length === 0) return '';

  const lines = ['\n\nKNOWLEDGE BASE — Your best approved examples (match this quality and voice):'];
  examples.forEach((ex, i) => {
    const ctx = [ex.market, ex.erp_context].filter(Boolean).join(' | ');
    const agent = ex.source_agent !== opts.currentAgent ? ` from ${ex.source_agent}` : '';
    lines.push(`\n[Example ${i+1}${agent}${ctx ? ' | ' + ctx : ''}]`);
    if (ex.title) lines.push(`Title: ${ex.title}`);
    lines.push(ex.content.slice(0, 600) + (ex.content.length > 600 ? '...' : ''));
  });
  lines.push('\nWrite at this quality level. Match the voice, specificity, and structure.\n');
  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// NIGHTLY DISTILLATION JOB — Layer 4 feed
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run the nightly distillation job.
 * Queries approved, zero-edit outputs from local SQLite and upserts into Azure knowledge base.
 * Called from scheduleRunner on a nightly cron.
 *
 * @returns {Promise<{inserted: number, skipped: number}>}
 */
async function runDistillation() {
  const { all } = require('../db/connection');
  let inserted = 0;
  let skipped  = 0;

  // ── Distill approved outreach emails ──
  const outreach = all(`
    SELECT id, email_subject, email_body, source_agent, status
    FROM cfo_outreach_sequences
    WHERE status = 'approved'
      AND email_body IS NOT NULL AND email_body != ''
    ORDER BY created_at DESC
    LIMIT 50
  `);

  for (const o of outreach) {
    const agentName = o.source_agent === 'jake' ? 'jake-outreach-agent' : 'cfo-outreach-agent';
    const result = await addToKnowledgeBase({
      sourceAgent:  agentName,
      contentType:  'outreach_email',
      title:        o.email_subject,
      content:      `Subject: ${o.email_subject || ''}\n\n${o.email_body}`,
      qualityScore: 1.0,
      sourceId:     `outreach_${o.id}`,
    });
    if (result.inserted) inserted++;
    else skipped++;
  }

  // ── Distill approved content pieces ──
  const content = all(`
    SELECT id, title, content_markdown, channel, source_agent
    FROM cfo_content_pieces
    WHERE status = 'approved'
      AND content_markdown IS NOT NULL AND content_markdown != ''
    ORDER BY created_at DESC
    LIMIT 30
  `);

  for (const c of content) {
    const agentName = c.source_agent === 'jake' ? 'jake-content-engine' : 'cfo-content-engine';
    const contentType = c.channel === 'blog' ? 'blog_post' : 'social_post';
    const result = await addToKnowledgeBase({
      sourceAgent:  agentName,
      contentType,
      title:        c.title,
      content:      c.content_markdown,
      qualityScore: 1.0,
      sourceId:     `content_${c.id}`,
    });
    if (result.inserted) inserted++;
    else skipped++;
  }

  console.log(`[CollectiveBrain] Distillation: ${inserted} new, ${skipped} already in KB`);
  return { inserted, skipped };
}

// ═══════════════════════════════════════════════════════════════════════════
// BRAIN STATUS — for dashboard / API
// ═══════════════════════════════════════════════════════════════════════════

async function getStats() {
  try {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT
        (SELECT COUNT(*) FROM shared_observations) AS observations_total,
        (SELECT COUNT(*) FROM shared_observations WHERE created_at > DATEADD(day,-7,GETUTCDATE())) AS observations_7d,
        (SELECT COUNT(*) FROM agent_feedback) AS feedback_total,
        (SELECT COUNT(*) FROM agent_feedback WHERE signal='approved') AS feedback_approved,
        (SELECT COUNT(*) FROM agent_feedback WHERE signal='rejected') AS feedback_rejected,
        (SELECT COUNT(*) FROM agent_episodes) AS episodes_total,
        (SELECT AVG(outcome_score) FROM agent_episodes) AS episodes_avg_score,
        (SELECT COUNT(*) FROM agent_knowledge_base) AS kb_total,
        (SELECT SUM(use_count) FROM agent_knowledge_base) AS kb_total_uses
    `);
    return r.recordset[0];
  } catch (err) {
    console.warn('[CollectiveBrain] getStats error:', err.message);
    return {};
  }
}

/**
 * Build the full context injection for an agent before it runs.
 * Combines all 4 layers into a single prompt block.
 *
 * @param {string} agentName
 * @param {string} sessionId
 * @param {object} opts - { market, erpContext, contentType, obsTypes }
 * @returns {Promise<string>}  - Full context block ready to prepend to agent message
 */
async function buildAgentContext(agentName, sessionId, opts = {}) {
  // Opportunistically drain SQLite fallback rows to Azure (non-blocking if Azure down)
  drainFallback().catch(() => {});

  const [obsBlock, feedbackBlock, episodesBlock, knowledgeBlock] = await Promise.all([
    getObservationsPromptBlock(sessionId, opts.obsTypes || []),
    getFeedbackPromptBlock(agentName, 6),
    opts.market ? getEpisodesPromptBlock({ market: opts.market, erpContext: opts.erpContext, limit: 3 }) : Promise.resolve(''),
    opts.contentType ? getKnowledgePromptBlock(opts.contentType, { market: opts.market, erpContext: opts.erpContext, currentAgent: agentName }) : Promise.resolve(''),
  ]);

  const blocks = [obsBlock, feedbackBlock, episodesBlock, knowledgeBlock].filter(b => b.trim());
  if (blocks.length === 0) return '';

  return '\n\n━━━ COLLECTIVE BRAIN CONTEXT ━━━' + blocks.join('') + '━━━ END CONTEXT ━━━\n\n';
}

module.exports = {
  ensureTables,
  // Layer 1
  observe,
  getObservations,
  getObservationsPromptBlock,
  // Layer 2
  recordFeedback,
  getFeedbackPromptBlock,
  // Layer 3
  recordEpisode,
  getSimilarEpisodes,
  getEpisodesPromptBlock,
  // Layer 4
  addToKnowledgeBase,
  getKnowledgeExamples,
  getKnowledgePromptBlock,
  runDistillation,
  // Composite
  buildAgentContext,
  getStats,
  // Fallback
  drainFallback,
};
