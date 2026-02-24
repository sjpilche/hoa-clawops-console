#!/usr/bin/env node
/**
 * ClawOps CLI — the agent's hands.
 *
 * Commands:
 *   run <agent-id> <message>        — Trigger agent run
 *   status [run-id]                 — Check runs (latest 10 or specific)
 *   leads [hoa|cfo]                 — Lead counts + breakdown
 *   stats                           — System dashboard (runs, costs, ROI)
 *   agents                          — List all registered agents
 *   query <SQL>                     — Read-only database query
 *   email <to> <subject> <body>     — Send email via Gmail SMTP
 *   facebook <message>              — Queue Facebook post
 *   trader                          — Trading positions + P&L
 *   content [pending|all]           — Content queue status
 *   pipeline                        — Full pipeline health check
 */

const http = require('http');
const path = require('path');

const API = 'http://localhost:3001';
const TRADER = 'http://localhost:3002';

// ── Helpers ──────────────────────────────────────────────────

function fetch(baseUrl, method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, baseUrl);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    };
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ raw: data, status: res.statusCode }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

let _token = null;
async function getToken() {
  if (_token) return _token;
  const auth = await fetch(API, 'POST', '/api/auth/login', {
    email: 'admin@clawops.local', password: 'changeme123',
  });
  _token = auth.token;
  return _token;
}

async function authedFetch(method, urlPath, body) {
  const token = await getToken();
  return fetch(API, method, urlPath, body, token);
}

function dbQuery(sql) {
  const dbPath = path.resolve(__dirname, '../../../data/clawops.db');
  const initSqlJs = require(path.resolve(__dirname, '../../../node_modules/sql.js'));
  const fs = require('fs');
  return initSqlJs().then((SQL) => {
    const buf = fs.readFileSync(dbPath);
    const db = new SQL.Database(buf);
    const result = db.exec(sql);
    db.close();
    if (!result.length) return [];
    const cols = result[0].columns;
    return result[0].values.map((row) =>
      Object.fromEntries(cols.map((c, i) => [c, row[i]]))
    );
  });
}

function out(data) { console.log(JSON.stringify(data, null, 2)); }

// ── Commands ─────────────────────────────────────────────────

async function cmdRun(agentId, message) {
  const result = await authedFetch('POST', '/api/runs', { agent_id: agentId, message });
  out(result);
}

async function cmdStatus(runId) {
  if (runId) {
    const rows = await dbQuery(`SELECT id, agent_id, status, result_data, cost_usd, created_at, completed_at FROM runs WHERE id = '${runId.replace(/'/g, "''")}'`);
    out(rows[0] || { error: 'Run not found' });
  } else {
    out(await dbQuery(`SELECT id, agent_id, status, cost_usd, created_at FROM runs ORDER BY created_at DESC LIMIT 10`));
  }
}

async function cmdLeads(type) {
  if (type === 'cfo') {
    const [total, breakdown] = await Promise.all([
      dbQuery(`SELECT COUNT(*) as count FROM cfo_leads`),
      dbQuery(`SELECT COUNT(*) as total, state, source, erp_type FROM cfo_leads GROUP BY state, source, erp_type ORDER BY total DESC`),
    ]);
    out({ total: total[0]?.count, breakdown });
  } else {
    const [total, breakdown] = await Promise.all([
      dbQuery(`SELECT COUNT(*) as count FROM hoa_communities`),
      dbQuery(`SELECT COUNT(*) as total, state FROM hoa_communities GROUP BY state ORDER BY total DESC`),
    ]);
    out({ total: total[0]?.count, breakdown });
  }
}

async function cmdStats() {
  const [runs, costs, recent, hoaLeads, cfoLeads] = await Promise.all([
    dbQuery(`SELECT COUNT(*) as total, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed, SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed FROM runs`),
    dbQuery(`SELECT COALESCE(SUM(cost_usd), 0) as total_spend, COALESCE(AVG(cost_usd), 0) as avg_cost, COALESCE(SUM(CASE WHEN created_at > date('now','-7 days') THEN cost_usd ELSE 0 END), 0) as spend_7d FROM runs`),
    dbQuery(`SELECT agent_id, status, cost_usd, created_at FROM runs ORDER BY created_at DESC LIMIT 5`),
    dbQuery(`SELECT COUNT(*) as count FROM hoa_communities`),
    dbQuery(`SELECT COUNT(*) as count FROM cfo_leads`),
  ]);
  const r = runs[0], c = costs[0];
  out({
    runs: { total: r.total, completed: r.completed, failed: r.failed, successRate: r.total ? `${((r.completed/r.total)*100).toFixed(1)}%` : '0%' },
    costs: { totalSpend: `$${c.total_spend.toFixed(2)}`, last7Days: `$${c.spend_7d.toFixed(2)}`, avgPerRun: `$${c.avg_cost.toFixed(4)}` },
    leads: { hoa: hoaLeads[0]?.count || 0, cfo: cfoLeads[0]?.count || 0 },
    costPerLead: (hoaLeads[0]?.count + cfoLeads[0]?.count) > 0 ? `$${(c.total_spend / (hoaLeads[0]?.count + cfoLeads[0]?.count)).toFixed(4)}` : 'N/A',
    recentRuns: recent,
  });
}

async function cmdAgents() {
  out(await dbQuery(`SELECT id, name, type, status, openclaw_id FROM agents ORDER BY name`));
}

async function cmdQuery(sql) {
  if (!/^\s*(SELECT|PRAGMA)/i.test(sql)) { out({ error: 'Only SELECT/PRAGMA allowed' }); return; }
  out(await dbQuery(sql));
}

async function cmdEmail(to, subject, ...bodyParts) {
  const body = bodyParts.join(' ');
  const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
  const dotenv = require(path.resolve(__dirname, '../../../node_modules/dotenv'));
  dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') });

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  const info = await transporter.sendMail({
    from: `"ClawOps" <${process.env.SMTP_USER}>`,
    to,
    subject,
    text: body,
  });

  out({ sent: true, messageId: info.messageId, to, subject });
}

async function cmdFacebook(message) {
  const result = await authedFetch('POST', '/api/content-queue', {
    content: message,
    platform: 'facebook',
    post_type: 'page',
    status: 'pending',
    source_agent: 'main',
  });
  out({ queued: true, ...result });
}

async function cmdTrader() {
  try {
    const [status, positions] = await Promise.all([
      fetch(TRADER, 'GET', '/health'),
      fetch(TRADER, 'GET', '/api/positions'),
    ]);
    const pos = Array.isArray(positions) ? positions : (positions.positions || []);
    const totalPnl = pos.reduce((sum, p) => sum + (parseFloat(p.unrealized_pl) || 0), 0);
    const totalValue = pos.reduce((sum, p) => sum + (parseFloat(p.market_value) || 0), 0);
    out({
      status: status.status || 'unknown',
      positions: pos.length,
      totalValue: `$${totalValue.toFixed(2)}`,
      unrealizedPnL: `$${totalPnl.toFixed(2)}`,
      topPositions: pos.slice(0, 10).map(p => ({
        symbol: p.symbol,
        qty: p.qty,
        value: `$${parseFloat(p.market_value || 0).toFixed(2)}`,
        pnl: `$${parseFloat(p.unrealized_pl || 0).toFixed(2)}`,
      })),
    });
  } catch (err) {
    out({ error: `Trader offline: ${err.message}` });
  }
}

async function cmdContent(filter) {
  const where = filter === 'pending' ? `WHERE status='pending'` : '';
  const rows = await dbQuery(`SELECT platform, status, COUNT(*) as count FROM content_queue ${where} GROUP BY platform, status`);
  const pending = await dbQuery(`SELECT id, platform, content, scheduled_for FROM content_queue WHERE status='pending' ORDER BY created_at DESC LIMIT 5`);
  out({ summary: rows, pendingItems: pending });
}

async function cmdPipeline() {
  const [runs, leads, cfo, content, agents] = await Promise.all([
    dbQuery(`SELECT COUNT(*) as total, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as ok, SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as fail, SUM(CASE WHEN status='running' THEN 1 ELSE 0 END) as active FROM runs`),
    dbQuery(`SELECT COUNT(*) as count FROM hoa_communities`),
    dbQuery(`SELECT COUNT(*) as count FROM cfo_leads`),
    dbQuery(`SELECT status, COUNT(*) as count FROM content_queue GROUP BY status`),
    dbQuery(`SELECT COUNT(*) as count FROM agents WHERE status='active'`),
  ]);
  let traderOk = false;
  try { const h = await fetch(TRADER, 'GET', '/health'); traderOk = h.status === 'ok'; } catch {}

  const r = runs[0];
  out({
    system: {
      api: '🟢 online',
      trader: traderOk ? '🟢 online' : '🔴 offline',
      agents: `${agents[0]?.count || 0} active`,
    },
    pipeline: {
      hoaLeads: leads[0]?.count || 0,
      cfoLeads: cfo[0]?.count || 0,
      totalRuns: r.total,
      activeRuns: r.active || 0,
      successRate: r.total ? `${((r.ok/r.total)*100).toFixed(0)}%` : '0%',
    },
    content: content.reduce((acc, c) => { acc[c.status] = c.count; return acc; }, {}),
  });
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  const [,, command, ...args] = process.argv;
  try {
    switch (command) {
      case 'run':      await cmdRun(args[0], args.slice(1).join(' ') || 'Start agent task'); break;
      case 'status':   await cmdStatus(args[0]); break;
      case 'leads':    await cmdLeads(args[0] || 'hoa'); break;
      case 'stats':    await cmdStats(); break;
      case 'agents':   await cmdAgents(); break;
      case 'query':    await cmdQuery(args.join(' ')); break;
      case 'email':    await cmdEmail(args[0], args[1], ...args.slice(2)); break;
      case 'facebook': await cmdFacebook(args.join(' ')); break;
      case 'trader':   await cmdTrader(); break;
      case 'content':  await cmdContent(args[0]); break;
      case 'pipeline': await cmdPipeline(); break;
      default: out({
        commands: {
          'run <agent> <msg>': 'Trigger agent run',
          'status [run-id]': 'Recent runs or specific run',
          'leads [hoa|cfo]': 'Lead counts',
          'stats': 'Full dashboard',
          'agents': 'Registered agents',
          'query <SQL>': 'Read-only DB query',
          'email <to> <subj> <body>': 'Send email via Gmail',
          'facebook <message>': 'Queue Facebook post',
          'trader': 'Trading positions + P&L',
          'content [pending]': 'Content queue',
          'pipeline': 'Full system health',
        },
      });
    }
  } catch (err) {
    out({ error: err.message });
  }
}

main();
