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

const sql        = require('mssql');
const chromaBrain = require('./chromaBrain');

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
      `INSERT INTO brain_fallback_observations (session_id, agent_name, obs_type, subject, content, confidence, metadata, workspace_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.session_id, data.agent_name, data.obs_type, data.subject || null,
       data.content, data.confidence ?? 0.8, data.metadata ? JSON.stringify(data.metadata) : null,
       data.workspace_id || null]
    );
  } catch (e) { console.warn('[CollectiveBrain] SQLite fallback write failed:', e.message); }
}

function writeFallbackFeedback(data) {
  try {
    const { run } = getFallbackDb();
    run(
      `INSERT INTO brain_fallback_feedback (agent_name, output_type, output_id, signal, before_text, after_text, market, notes, metadata, workspace_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.agent_name, data.output_type, data.output_id || null, data.signal,
       data.before_text || null, data.after_text || null, data.market || null,
       data.notes || null, data.metadata ? JSON.stringify(data.metadata) : null,
       data.workspace_id || null]
    );
  } catch (e) { console.warn('[CollectiveBrain] SQLite fallback feedback write failed:', e.message); }
}

function writeFallbackEpisode(data) {
  try {
    const { run } = getFallbackDb();
    run(
      `INSERT INTO brain_fallback_episodes (agent_name, market, erp_context, contact_title, action_taken, outcome, outcome_type, outcome_score, days_to_outcome, lead_id, run_id, signal_source, signal_fit_score, workspace_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.agent_name, data.market || null, data.erp_context || null,
       data.contact_title || null, data.action_taken, data.outcome,
       data.outcome_type, data.outcome_score ?? 0.5, data.days_to_outcome || null,
       data.lead_id || null, data.run_id || null,
       data.signal_source || null, data.signal_fit_score || null,
       data.workspace_id || null]
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
function observe(sessionId, agentName, obsType, { subject, content, confidence = 1.0, metadata, workspaceId = null } = {}) {
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
    () => writeFallbackObservation({ session_id: sessionId, agent_name: agentName, obs_type: obsType, subject, content, confidence, metadata, workspace_id: workspaceId })
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
        AND created_at > DATEADD(day, -14, GETUTCDATE())
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
      market: opts.market, metadata: opts.metadata, workspace_id: opts.workspaceId,
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
    actionTaken, outcome, outcomeType, outcomeScore = 0, daysToOutcome, leadId, runId,
    signalSource, signalFitScore, workspaceId = null } = {}) {
  fireAndForget(
    async () => {
      const pool = await getPool();
      const result = await pool.request()
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
        .input('signal_source',   sql.NVarChar, signalSource    || null)
        .input('signal_fit_score',sql.Int,      signalFitScore  || null)
        .query(`INSERT INTO agent_episodes
                  (agent_name,market,company_type,erp_context,contact_title,action_taken,outcome,outcome_type,outcome_score,days_to_outcome,lead_id,run_id,signal_source,signal_fit_score)
                OUTPUT INSERTED.id
                VALUES
                  (@agent_name,@market,@company_type,@erp_context,@contact_title,@action_taken,@outcome,@outcome_type,@outcome_score,@days_to_outcome,@lead_id,@run_id,@signal_source,@signal_fit_score)`);

      // ── Mirror to Chroma (Layer 3 vector store) ──
      const insertedId = result.recordset?.[0]?.id || leadId || Date.now();
      const chromaContent = [
        `Market: ${market || 'n/a'} | ERP: ${erpContext || 'n/a'} | Title: ${contactTitle || 'n/a'}`,
        `Agent: ${agentName}`,
        `Approach: ${actionTaken}`,
        `Result: ${outcome} (${outcomeType}, score=${outcomeScore}, days=${daysToOutcome || '?'})`,
      ].join('\n');
      chromaBrain.addEpisode({
        id:       `azure_${insertedId}`,
        content:  chromaContent,
        metadata: {
          market:          market          || '',
          erp:             erpContext      || '',
          contact_title:   contactTitle    || '',
          outcome_type:    outcomeType,
          outcome_score:   outcomeScore,
          days_to_outcome: daysToOutcome   || 0,
          agent_name:      agentName,
          lead_id:         String(leadId   || ''),
          product:         agentName.startsWith('hoa') ? 'hoa' : (agentName.startsWith('owen') ? 'owen' : 'jake'),
          signal_source:   signalSource    || '',
          signal_fit_score: signalFitScore || 0,
        },
      }).catch(e => console.warn('[CollectiveBrain] fire-and-forget failed:', e.message));
    },
    () => {
      writeFallbackEpisode({
        agent_name: agentName, market, erp_context: erpContext, contact_title: contactTitle,
        action_taken: actionTaken, outcome, outcome_type: outcomeType,
        outcome_score: outcomeScore, days_to_outcome: daysToOutcome, lead_id: leadId, run_id: runId,
        workspace_id: workspaceId,
        signal_source: signalSource, signal_fit_score: signalFitScore,
      });
      // Mirror to Chroma from fallback path too
      const chromaContent = [
        `Market: ${market || 'n/a'} | ERP: ${erpContext || 'n/a'} | Title: ${contactTitle || 'n/a'}`,
        `Agent: ${agentName}`,
        `Approach: ${actionTaken}`,
        `Result: ${outcome} (${outcomeType}, score=${outcomeScore}, days=${daysToOutcome || '?'})`,
      ].join('\n');
      chromaBrain.addEpisode({
        id:       `fallback_${leadId || Date.now()}`,
        content:  chromaContent,
        metadata: {
          market:          market          || '',
          erp:             erpContext      || '',
          outcome_type:    outcomeType,
          outcome_score:   outcomeScore,
          days_to_outcome: daysToOutcome   || 0,
          agent_name:      agentName,
          product:         agentName.startsWith('hoa') ? 'hoa' : (agentName.startsWith('owen') ? 'owen' : 'jake'),
          signal_source:   signalSource    || '',
          signal_fit_score: signalFitScore || 0,
        },
      }).catch(e => console.warn('[CollectiveBrain] fire-and-forget failed:', e.message));
    }
  );
}

/**
 * Retrieve similar winning episodes for use as examples before an agent runs.
 * Matches on market + ERP context — gives market-specific pattern learning.
 *
 * @param {object} opts
 * @returns {Promise<object[]>}
 */
async function getSimilarEpisodes({ market, erpContext, companyType, outcomeType, minScore = 0.5, limit = 5, productLine } = {}) {
  // Try Azure SQL first (structured query)
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
    // Azure failed — fall back to ChromaBrain semantic search
    console.warn('[CollectiveBrain] getSimilarEpisodes Azure failed, trying ChromaBrain:', err.message);
    try {
      const query = [market, erpContext, companyType, outcomeType].filter(Boolean).join(' ');
      if (!query) return [];
      const chromaResults = await chromaBrain.queryRelevant(query, limit, {
        collection: 'episodes',
        product: productLine || null,
        outcome_score_min: minScore,
      });
      return chromaResults.map(r => ({
        market: r.metadata?.market || '',
        company_type: '',
        erp_context: r.metadata?.erp || '',
        contact_title: r.metadata?.contact_title || '',
        action_taken: r.content?.split('Approach: ')[1]?.split('\n')[0] || r.content?.slice(0, 200) || '',
        outcome: r.content?.split('Result: ')[1]?.split('\n')[0] || '',
        outcome_type: r.metadata?.outcome_type || 'unknown',
        outcome_score: r.metadata?.outcome_score || 0.5,
        days_to_outcome: r.metadata?.days_to_outcome || null,
      }));
    } catch {
      return [];
    }
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

    // Flag new KB entry for Steve's weekly review (tracked in local audit_log)
    try {
      const { run: dbRun } = require('../db/connection');
      dbRun(
        `INSERT INTO audit_log (id, action, resource, details, outcome) VALUES (lower(hex(randomblob(16))), 'kb_entry_pending_review', ?, ?, 'success')`,
        [
          `kb:${sourceId || 'unknown'}`,
          JSON.stringify({ source_agent: sourceAgent, content_type: contentType, title: title || 'Untitled', quality_score: qualityScore, review_status: 'pending' }),
        ]
      );
    } catch {}

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
async function getKnowledgeExamples(contentType, { market, erpContext, limit = 3, productLine } = {}) {
  try {
    const pool = await getPool();
    const req = pool.request()
      .input('limit', sql.Int, limit);

    let where = 'WHERE quality_score > 0';
    if (contentType) { req.input('content_type', sql.NVarChar, contentType); where += ' AND content_type = @content_type'; }
    if (market)      { req.input('market', sql.NVarChar, market);            where += ' AND (market = @market OR market IS NULL)'; }
    if (erpContext)  { req.input('erp',    sql.NVarChar, erpContext);         where += ' AND (erp_context = @erp OR erp_context IS NULL)'; }

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
    WHERE status IN ('approved', 'sent')
      AND (qa_status = 'passed' OR status = 'approved')
      AND email_body IS NOT NULL AND email_body != ''
    ORDER BY created_at DESC
    LIMIT 50
  `);

  for (const o of outreach) {
    const agentName = o.source_agent === 'jake' ? 'jake-outreach-agent' : 'cfo-outreach-agent';
    const kbContent = `Subject: ${o.email_subject || ''}\n\n${o.email_body}`;
    const result = await addToKnowledgeBase({
      sourceAgent:  agentName,
      contentType:  'outreach_email',
      title:        o.email_subject,
      content:      kbContent,
      qualityScore: 1.0,
      sourceId:     `outreach_${o.id}`,
    });
    if (result.inserted) {
      inserted++;
      // Mirror to Chroma knowledge collection
      chromaBrain.addKnowledge({
        id:       `outreach_${o.id}`,
        content:  kbContent,
        metadata: {
          source_agent:  agentName,
          content_type:  'outreach_email',
          title:         o.email_subject || '',
          quality_score: 1.0,
          product:       o.source_agent === 'jake' ? 'jake' : 'cfo',
        },
      }).catch(e => console.warn('[CollectiveBrain] fire-and-forget failed:', e.message));
    } else skipped++;
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
    if (result.inserted) {
      inserted++;
      chromaBrain.addKnowledge({
        id:       `content_${c.id}`,
        content:  `Title: ${c.title || ''}\n\n${c.content_markdown}`,
        metadata: {
          source_agent:  agentName,
          content_type:  contentType,
          title:         c.title || '',
          quality_score: 1.0,
          product:       c.source_agent === 'jake' ? 'jake' : 'cfo',
        },
      }).catch(e => console.warn('[CollectiveBrain] fire-and-forget failed:', e.message));
    } else skipped++;
  }

  // ── Distill high-score episodes (Brain v2 feedback loop) ──────────────────
  // Episodes with outcome_score >= 0.8 and positive outcome_type are promoted
  // to Layer 4 KB with market/erp/tone/wait_days tags so future agents can
  // retrieve winning patterns directly from the knowledge base.
  const episodes = all(`
    SELECT id, agent_name, market, erp_context, contact_title,
           action_taken, outcome, outcome_type, outcome_score, days_to_outcome
    FROM brain_fallback_episodes
    WHERE outcome_score >= 0.8
      AND outcome_type IN ('replied','booked','converted')
      AND synced = 0
    ORDER BY outcome_score DESC
    LIMIT 20
  `);

  for (const ep of episodes) {
    // Build tags object capturing what made this episode win
    const tags = {
      outcome_type:    ep.outcome_type,
      outcome_score:   ep.outcome_score,
      market:          ep.market          || 'unknown',
      erp:             ep.erp_context      || 'unknown',
      contact_title:   ep.contact_title    || 'unknown',
      wait_days:       ep.days_to_outcome  || null,
    };

    const content = [
      `Market: ${ep.market || 'n/a'} | ERP: ${ep.erp_context || 'n/a'} | Title: ${ep.contact_title || 'n/a'}`,
      `Approach: ${ep.action_taken}`,
      `Result: ${ep.outcome} (${ep.outcome_type}, score=${ep.outcome_score}, days=${ep.days_to_outcome || '?'})`,
    ].join('\n');

    const result = await addToKnowledgeBase({
      sourceAgent:  ep.agent_name,
      contentType:  'winning_episode',
      title:        `${ep.outcome_type} in ${ep.market || 'unknown market'} (score=${ep.outcome_score})`,
      content,
      qualityScore: ep.outcome_score,
      market:       ep.market       || null,
      erpContext:   ep.erp_context  || null,
      tags:         Object.keys(tags).map(k => `${k}:${tags[k]}`),
      sourceId:     `episode_${ep.id}`,
    });
    if (result.inserted) {
      inserted++;
      // Mirror winning episode to both collections
      chromaBrain.addEpisode({
        id:       `distilled_${ep.id}`,
        content,
        metadata: {
          market:          ep.market         || '',
          erp:             ep.erp_context    || '',
          contact_title:   ep.contact_title  || '',
          outcome_type:    ep.outcome_type,
          outcome_score:   ep.outcome_score,
          days_to_outcome: ep.days_to_outcome || 0,
          agent_name:      ep.agent_name,
          product:         ep.agent_name?.startsWith('hoa') ? 'hoa' : 'jake',
        },
      }).catch(e => console.warn('[CollectiveBrain] fire-and-forget failed:', e.message));
      chromaBrain.addKnowledge({
        id:       `episode_${ep.id}`,
        content,
        metadata: {
          source_agent:  ep.agent_name,
          content_type:  'winning_episode',
          title:         `${ep.outcome_type} in ${ep.market || 'unknown'} (score=${ep.outcome_score})`,
          quality_score: ep.outcome_score,
          market:        ep.market      || '',
          erp:           ep.erp_context || '',
          outcome_type:  ep.outcome_type,
          outcome_score: ep.outcome_score,
          product:       ep.agent_name?.startsWith('hoa') ? 'hoa' : 'jake',
        },
      }).catch(e => console.warn('[CollectiveBrain] fire-and-forget failed:', e.message));
    } else skipped++;
  }

  // ── KB Quality Decay — downgrade patterns that led to bounces/losses ──
  let decayed = 0;
  try {
    const pool = await getPool();
    // Find recent negative outcomes (bounced, lost, no_response)
    const badOutcomes = await pool.request().query(`
      SELECT DISTINCT action_taken FROM agent_episodes
      WHERE outcome_type IN ('bounced', 'lost', 'no_response')
        AND created_at > DATEADD(day, -7, GETDATE())
        AND outcome_score < 0.3
    `);

    // Decay quality_score of KB entries whose content matches bad approach patterns
    for (const row of badOutcomes.recordset) {
      if (!row.action_taken || row.action_taken.length < 20) continue;
      // Extract key phrases (first 100 chars) to match against KB
      const snippet = row.action_taken.slice(0, 100).replace(/'/g, "''");
      const decay = await pool.request().query(`
        UPDATE agent_knowledge_base
        SET quality_score = quality_score * 0.9
        WHERE content LIKE '%${snippet.slice(0, 50)}%'
          AND quality_score > 0.1
      `);
      if (decay.rowsAffected[0] > 0) decayed += decay.rowsAffected[0];
    }

    if (decayed > 0) console.log(`[CollectiveBrain] KB decay: ${decayed} entries downgraded from negative outcomes`);
  } catch (err) {
    // Non-fatal — decay is an optimization, not critical
    console.warn('[CollectiveBrain] KB decay error (non-fatal):', err.message);
  }

  console.log(`[CollectiveBrain] Distillation: ${inserted} new, ${skipped} already in KB, ${decayed} decayed`);
  return { inserted, skipped, decayed };
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
  drainFallback().catch(e => console.warn('[CollectiveBrain] drainFallback failed:', e.message));

  // Determine workspace context — use explicit workspaceId or derive from agent name
  const workspaceId = opts.workspaceId || null;

  // Determine product line for context segmentation (maps to workspace slug)
  const productLine = opts.productLine
    || (agentName.startsWith('owen') ? 'owen'
    : agentName.startsWith('hoa') ? 'hoa'
    : agentName.startsWith('data-rehab') ? 'data_rehab'
    : 'jake');

  // Always fetch episodes and KB — not just when market/contentType are provided.
  // Agents learn from ALL outcomes, not just market-specific ones.
  const [obsBlock, feedbackBlock, episodesBlock, knowledgeBlock] = await Promise.all([
    getObservationsPromptBlock(sessionId, opts.obsTypes || []),
    getFeedbackPromptBlock(agentName, 6),
    getEpisodesPromptBlock({ market: opts.market || null, erpContext: opts.erpContext || null, limit: 3, productLine }),
    getKnowledgePromptBlock(opts.contentType || null, { market: opts.market || null, erpContext: opts.erpContext || null, currentAgent: agentName, productLine }),
  ]);

  const blocks = [obsBlock, feedbackBlock, episodesBlock, knowledgeBlock].filter(b => b.trim());
  if (blocks.length === 0) return '';

  // Enforce hard token budget — ~2000 tokens ≈ 8000 chars
  // Priority: KB (most refined) > episodes > feedback > observations (most raw)
  const MAX_CONTEXT_CHARS = 8000;
  let assembled = '';
  const priorityOrder = [knowledgeBlock, episodesBlock, feedbackBlock, obsBlock].filter(b => b.trim());
  for (const block of priorityOrder) {
    if (assembled.length + block.length <= MAX_CONTEXT_CHARS) {
      assembled += block;
    } else {
      // Truncate this block to fit remaining budget
      const remaining = MAX_CONTEXT_CHARS - assembled.length;
      if (remaining > 200) { // Only include if meaningful amount fits
        assembled += block.slice(0, remaining - 50) + '\n[... truncated — context budget reached ...]\n';
      }
      break; // No more blocks
    }
  }

  if (!assembled.trim()) return '';

  // ── Signal Performance: Inject source conversion rates for discovery/enrichment agents ──
  let signalBlock = '';
  try {
    const isDiscoveryAgent = /discovery|enricher|lead.scout|signal|scanner/i.test(agentName);
    if (isDiscoveryAgent) {
      const { getSignalPerformanceBlock } = require('./signalPerformance');
      const sourceAgent = agentName.startsWith('owen') ? 'owen'
        : agentName.startsWith('hoa') ? 'hoa'
        : agentName.startsWith('data-rehab') ? 'data_rehab'
        : 'jake';
      signalBlock = getSignalPerformanceBlock(sourceAgent);
    }
  } catch {} // Non-fatal if signal_performance table doesn't exist yet

  // ── Dream Team: Inject active learned patterns ──
  let learnedBlock = '';
  try {
    const { getActivePatterns } = require('./dreamTeamNightly');
    const patterns = getActivePatterns(agentName);
    if (patterns.length > 0) {
      learnedBlock = '\n━━━ LEARNED PATTERNS (updated nightly) ━━━\n' +
        patterns.map(p => `[${p.category}] ${p.pattern_text} (confidence: ${p.confidence.toFixed(2)})`).join('\n') +
        '\n━━━ END LEARNED PATTERNS ━━━\n';
    }
  } catch {} // Non-fatal if Dream Team tables don't exist yet

  // ── Market Intelligence: Inject conversion rates by market ──
  let marketBlock = '';
  try {
    marketBlock = getMarketIntelligenceBlock();
  } catch {} // Non-fatal

  return '\n\n━━━ COLLECTIVE BRAIN CONTEXT ━━━' + assembled + signalBlock + learnedBlock + marketBlock + '━━━ END CONTEXT ━━━\n\n';
}

// ═══════════════════════════════════════════════════════════════════════════
// BRAIN COUNCIL SUMMARY — posts nightly Chroma insights to Discord
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Summarize new Chroma additions from the past 24 hours and post to Discord.
 * Called at 2:30 AM by scheduleRunner, right after distillation.
 *
 * @returns {Promise<{posted: boolean, count: number}>}
 */
async function brainCouncilSummary() {
  const discord = require('./discordNotifier');

  if (!chromaBrain.isReady()) {
    console.log('[BrainCouncil] Chroma not ready — skipping council summary');
    return { posted: false, count: 0 };
  }

  try {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const recent = await chromaBrain.getRecentAdditions(since, 10);

    if (recent.length === 0) {
      console.log('[BrainCouncil] No new Chroma entries in past 24h — skipping council post');
      return { posted: false, count: 0 };
    }

    // Separate episodes from knowledge entries
    const newEpisodes = recent.filter(r => r.collection === 'episodes');
    const newKb       = recent.filter(r => r.collection === 'knowledge');

    // Format top patterns
    const patternLines = recent.slice(0, 5).map((r, i) => {
      const meta = r.metadata;
      if (r.collection === 'episodes') {
        const market  = meta.market        || 'unknown market';
        const erp     = meta.erp           || 'unknown ERP';
        const score   = meta.outcome_score != null ? `${Math.round(meta.outcome_score * 100)}%` : '?';
        const days    = meta.days_to_outcome ? ` in ${meta.days_to_outcome}d` : '';
        const type    = meta.outcome_type  || 'outcome';
        return `${i + 1}. ${market} · ${erp} → **${type}** ${score}${days}`;
      } else {
        const title   = meta.title         || 'KB entry';
        const agent   = meta.source_agent  || 'unknown';
        const quality = meta.quality_score != null ? ` (${Math.round(meta.quality_score * 100)}%)` : '';
        return `${i + 1}. **${title.slice(0, 60)}**${quality} — ${agent}`;
      }
    });

    const chromaStats = await chromaBrain.getStats();

    await discord.postWebhook({
      embeds: [{
        title: '🧠 Brain Council — New Insights',
        description: [
          `**${recent.length}** new entries indexed in Chroma tonight`,
          `(${newEpisodes.length} episodes · ${newKb.length} KB entries)`,
          '',
          '**New Winning Patterns:**',
          ...patternLines,
        ].join('\n'),
        color: 0x9b59b6,
        fields: [
          {
            name: 'Chroma Collections',
            value: `Episodes: ${chromaStats.episodes} · Knowledge: ${chromaStats.knowledge}`,
            inline: true,
          },
          {
            name: 'Top Product',
            value: newEpisodes.filter(e => e.metadata.product === 'jake').length >= newEpisodes.filter(e => e.metadata.product === 'hoa').length ? 'Jake' : 'HOA',
            inline: true,
          },
          {
            name: 'Indexed Since',
            value: new Date(since).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            inline: true,
          },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'Brain Council · ClawOps · Chroma v1' },
      }],
    });

    console.log(`[BrainCouncil] ✅ Posted ${recent.length} new patterns to Discord`);
    return { posted: true, count: recent.length };
  } catch (err) {
    console.warn('[BrainCouncil] Summary failed (non-fatal):', err.message);
    return { posted: false, count: 0 };
  }
}

/**
 * Auto-feedback for stale drafts — records negative signal when outreach drafts
 * sit unapproved for 3+ days. Called nightly by dream team cycle.
 * Teaches agents: "Your drafts aren't getting approved — adjust."
 *
 * @returns {{ stale: number, feedbackRecorded: number }}
 */
function autoFeedbackStaleDrafts() {
  try {
    const { all } = getFallbackDb();
    const staleDrafts = all(`
      SELECT os.id, os.lead_id, os.email_subject, os.source_agent,
             l.company_name, l.city, l.state
      FROM cfo_outreach_sequences os
      LEFT JOIN cfo_leads l ON l.id = os.lead_id
      WHERE os.status = 'draft'
        AND os.created_at <= datetime('now', '-3 days')
        AND os.created_at >= datetime('now', '-14 days')
    `);

    let feedbackRecorded = 0;
    const agentCounts = {};

    for (const draft of staleDrafts) {
      const agentName = draft.source_agent === 'cfo' ? 'cfo-outreach-agent'
        : draft.source_agent === 'owen' ? 'owen-outreach-agent'
        : 'jake-outreach-agent';
      agentCounts[agentName] = (agentCounts[agentName] || 0) + 1;
    }

    // Record one feedback per agent (summarized, not per draft)
    for (const [agentName, count] of Object.entries(agentCounts)) {
      recordFeedback(agentName, 'outreach_email', null, 'stale', {
        notes: `${count} outreach draft(s) sat unapproved for 3+ days. Possible issues: tone, personalization, or relevance. Review and adjust approach.`,
        market: null,
      });
      feedbackRecorded++;
    }

    console.log(`[CollectiveBrain] Auto-feedback: ${staleDrafts.length} stale drafts → ${feedbackRecorded} agent feedback signals`);
    return { stale: staleDrafts.length, feedbackRecorded };
  } catch (err) {
    console.warn('[CollectiveBrain] autoFeedbackStaleDrafts error:', err.message);
    return { stale: 0, feedbackRecorded: 0 };
  }
}

/**
 * Retroactively update an episode when a real outcome arrives (e.g. SendGrid webhook).
 * The original episode was recorded at run time with a placeholder score (output length).
 * This replaces it with the REAL outcome: replied, bounced, opened, etc.
 *
 * @param {string} runId - Original run_id stored on the episode
 * @param {object} update
 * @param {string} update.outcomeType - e.g. 'replied', 'bounced', 'opened', 'delivered'
 * @param {number} update.outcomeScore - 0.0 to 1.0
 * @param {string} [update.outcome] - Human-readable description
 */
function retroUpdateEpisode(runId, { outcomeType, outcomeScore, outcome }) {
  if (!runId) return;
  const { run: dbRun } = require('../db/connection');

  try {
    dbRun(
      `UPDATE brain_fallback_episodes
       SET outcome_type = ?, outcome_score = ?, outcome = ?
       WHERE run_id = ?`,
      [outcomeType, outcomeScore, outcome || outcomeType, runId]
    );
    console.log(`[CollectiveBrain] Retro-updated episode for run ${runId}: ${outcomeType} (${outcomeScore})`);
  } catch (err) {
    console.warn('[CollectiveBrain] retroUpdateEpisode fallback error:', err.message);
  }

  // Also update Azure (fire-and-forget)
  (async () => {
    try {
      const pool = await getPool();
      const sql = require('mssql');
      await pool.request()
        .input('run_id', sql.NVarChar, runId)
        .input('outcome_type', sql.NVarChar, outcomeType)
        .input('outcome_score', sql.Float, outcomeScore)
        .input('outcome', sql.NVarChar, outcome || outcomeType)
        .query(`UPDATE agent_episodes
                SET outcome_type = @outcome_type, outcome_score = @outcome_score, outcome = @outcome
                WHERE run_id = @run_id`);
    } catch {} // Azure may be unavailable — non-fatal
  })();
}

/**
 * Get market intelligence — conversion rates by market for agent context injection.
 * Returns a formatted prompt block showing which markets are performing.
 */
function getMarketIntelligenceBlock() {
  try {
    const { all: dbAll } = require('../db/connection');
    const markets = dbAll(`
      SELECT market,
        COUNT(*) as total,
        ROUND(AVG(outcome_score), 2) as avg_score,
        SUM(CASE WHEN outcome_type IN ('replied', 'booked', 'converted') THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN outcome_type IN ('bounced', 'failed') THEN 1 ELSE 0 END) as losses
      FROM brain_fallback_episodes
      WHERE market IS NOT NULL AND market != ''
      GROUP BY market
      HAVING COUNT(*) >= 3
      ORDER BY avg_score DESC
      LIMIT 10
    `);

    if (!markets || markets.length === 0) return '';

    let block = '\n--- MARKET INTELLIGENCE (from real outcomes) ---\n';
    for (const m of markets) {
      const winRate = m.total > 0 ? Math.round((m.wins / m.total) * 100) : 0;
      block += `• ${m.market}: ${m.total} episodes, avg score ${m.avg_score}, ${winRate}% win rate (${m.wins}W/${m.losses}L)\n`;
    }
    block += 'Focus on high-performing markets. Adjust approach for low-scoring markets.\n---\n';
    return block;
  } catch {
    return '';
  }
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
  autoFeedbackStaleDrafts,
  // Layer 3
  recordEpisode,
  getSimilarEpisodes,
  getEpisodesPromptBlock,
  retroUpdateEpisode,
  // Layer 4
  addToKnowledgeBase,
  getKnowledgeExamples,
  getKnowledgePromptBlock,
  runDistillation,
  // Brain Council (Chroma)
  brainCouncilSummary,
  // Composite
  buildAgentContext,
  getMarketIntelligenceBlock,
  getStats,
  // Fallback
  drainFallback,
};
