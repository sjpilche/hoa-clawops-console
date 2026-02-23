/**
 * @file smartRouter.js
 * @description Instant responses for common chat messages.
 *
 * Matches natural language patterns and answers directly from the DB.
 * Returns null if no match → caller should fall through to OpenClaw LLM.
 *
 * Cost: $0, Speed: <50ms.
 */

const { all, get, run: dbRun } = require('../db/connection');
const http = require('http');

// ── Pattern matchers ─────────────────────────────────────────

const PATTERNS = [
  { test: /\b(debrief|daily.?report|end.?of.?day|eod|war.?room|assessment)\b/i, handler: handleDebrief },
  { test: /\b(stats|status|dashboard|how.*(doing|going)|what.?s up|sitrep|report)\b/i, handler: handleStats },
  { test: /\b(how many|count|total).*(lead|hoa|prospect|communit)/i, handler: handleHoaLeads },
  { test: /\b(how many|count|total).*(cfo|contractor|dbpr)/i, handler: handleCfoLeads },
  { test: /\b(cost|spend|spent|budget|money|bill|expense)/i, handler: handleCosts },
  { test: /\b(run|trigger|fire|kick|start|launch|execute)\b.+\b(discover|hoa.?discover)/i, handler: (msg) => handleRunAgent('hoa-discovery', msg) },
  { test: /\b(run|trigger|fire|kick|start|launch|execute)\b.+\b(lead.?scout|cfo.?lead|contractor|dbpr)/i, handler: (msg) => handleRunAgent('cfo-lead-scout', msg) },
  { test: /\b(run|trigger|fire|kick|start|launch|execute)\b.+\b(content.?writ|blog|write.*blog)/i, handler: (msg) => handleRunAgent('hoa-content-writer', msg) },
  { test: /\b(run|trigger|fire|kick|start|launch|execute)\b.+\b(social.?media|social post)/i, handler: (msg) => handleRunAgent('hoa-social-media', msg) },
  { test: /\b(run|trigger|fire|kick|start|launch|execute)\b.+\b(network|linkedin)/i, handler: (msg) => handleRunAgent('hoa-networker', msg) },
  { test: /\b(run|trigger|fire|kick|start|launch|execute)\b.+\b(email.?campaign|nurture|email seq)/i, handler: (msg) => handleRunAgent('hoa-email-campaigns', msg) },
  { test: /\b(run|trigger|fire|kick|start|launch|execute)\b.+\b(facebook|fb post)/i, handler: (msg) => handleRunAgent('hoa-facebook-poster', msg) },
  { test: /\b(run|trigger|fire|kick|start|launch|execute)\b.+\b(outreach|cold.?email)/i, handler: (msg) => handleRunAgent('cfo-outreach-agent', msg) },
  { test: /\b(run|trigger|fire|kick|start|launch|execute)\b.+\b(publish|cms)/i, handler: (msg) => handleRunAgent('hoa-cms-publisher', msg) },
  { test: /\b(run|trigger|fire|kick|start|launch|execute)\b.+\b(debrief|daily.?report|eod|assessment)/i, handler: (msg) => handleRunAgent('daily-debrief', msg) },
  { test: /\b(recent|latest|last).*(run|agent|execution)/i, handler: handleRecentRuns },
  { test: /\b(agent|list.*agent|what agent|which agent|show.*agent)/i, handler: handleListAgents },
  { test: /\b(trad|position|p.?n.?l|portfolio|stock|market)/i, handler: handleTrader },
  { test: /\b(content.?queue|pending.*post|queued|scheduled.*post)/i, handler: handleContent },
  { test: /\b(pipeline|system.?health|system.?status|everything.?ok)\b/i, handler: handlePipeline },
  { test: /\b(what can you|command|how do i)\b/i, handler: handleHelp },
];

/**
 * Try to match a message to a fast handler.
 * @param {string} message - User's chat message
 * @returns {string|null} - Response text, or null if no match
 */
async function route(message) {
  for (const { test, handler } of PATTERNS) {
    if (test.test(message)) {
      try {
        return await handler(message);
      } catch (err) {
        console.error('[SmartRouter] Handler error:', err.message);
        return null; // Fall through to LLM
      }
    }
  }
  return null;
}

// ── Handlers ─────────────────────────────────────────────────

async function handleDebrief() {
  const { collectDebrief } = require('./debriefCollector');
  const data = await collectDebrief();

  const r = data.runs;
  const l = data.leads;
  const t = data.trading;
  const c = data.costs;

  const failedRuns = r.runs.filter(x => x.status === 'failed');
  const failedStr = failedRuns.length > 0
    ? failedRuns.map(x => `  ${x.agent}: ${x.error || 'unknown error'}`).join('\n')
    : '  None';

  const agentBreakdown = r.runs.length > 0
    ? r.runs.map(x => `  ${x.agent} → ${x.status} ($${x.cost.toFixed(4)}, ${x.durationSec || '?'}s)`).join('\n')
    : '  No runs today';

  const tradingStr = t.status === 'online'
    ? `${t.positions} positions | $${t.totalValue.toFixed(2)} value | ${t.unrealizedPnl >= 0 ? '+' : ''}$${t.unrealizedPnl.toFixed(2)} P&L\n${t.topPositions.map(p => `  ${p.symbol}: $${p.marketValue.toFixed(0)} (${p.unrealizedPnl >= 0 ? '+' : ''}$${p.unrealizedPnl.toFixed(2)})`).join('\n')}`
    : 'Trader offline';

  const idle = data.agentUtilization.idle;
  const idleStr = idle.length > 5
    ? `${idle.slice(0, 5).join(', ')} +${idle.length - 5} more`
    : idle.join(', ') || 'None';

  return `**DAILY DEBRIEF — ${data.date}**

**Runs:** ${r.total} today (${r.completed} ok, ${r.failed} failed) | $${c.today.toFixed(4)} cost
Yesterday: ${r.yesterday.count} runs, $${r.yesterday.cost.toFixed(4)}
${agentBreakdown}

**Failures:**
${failedStr}

**Leads:** ${l.hoa.newToday} new HOA (${l.hoa.total} total) | ${l.cfo.newToday} new CFO (${l.cfo.total} total)
Cost/lead: ${l.costPerLead}

**Trading:**
${tradingStr}

**Costs:** $${c.today.toFixed(4)} today | $${c.thisWeek.toFixed(2)} this week | $${c.projectedMonthly.toFixed(2)}/mo projected

**Agent Utilization:** ${data.agentUtilization.usedToday}/${data.agentUtilization.total} active
Idle: ${idleStr}

_Want the full AI assessment? Say "run debrief" to get the war room report._`;
}

async function handleStats() {
  const runs = get(`SELECT COUNT(*) as total, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as ok, SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as fail FROM runs`);
  const costs = get(`SELECT COALESCE(SUM(cost_usd), 0) as spend, COALESCE(SUM(CASE WHEN created_at > date('now','-7 days') THEN cost_usd ELSE 0 END), 0) as week FROM runs`);
  const hoa = get(`SELECT COUNT(*) as c FROM hoa_communities`);
  const cfo = get(`SELECT COUNT(*) as c FROM cfo_leads`);
  const recent = all(`SELECT agent_id, status, cost_usd, created_at FROM runs ORDER BY created_at DESC LIMIT 3`);

  const rate = runs.total > 0 ? ((runs.ok / runs.total) * 100).toFixed(0) : 0;
  const recentList = recent.map(r => `  ${r.agent_id} → ${r.status} ($${(r.cost_usd||0).toFixed(4)})`).join('\n');

  return `**Dashboard**
${runs.total} runs | ${rate}% success | ${runs.fail} failed
$${costs.spend.toFixed(2)} total spend | $${costs.week.toFixed(2)} last 7 days
${hoa.c} HOA leads | ${cfo.c} CFO leads | $${((hoa.c + cfo.c) > 0 ? (costs.spend / (hoa.c + cfo.c)).toFixed(4) : '0')} per lead

**Last 3 runs:**
${recentList}`;
}

async function handleHoaLeads() {
  const total = get(`SELECT COUNT(*) as c FROM hoa_communities`);
  const byState = all(`SELECT COALESCE(state, 'Unknown') as state, COUNT(*) as c FROM hoa_communities WHERE state IS NOT NULL AND state != '' GROUP BY state ORDER BY c DESC LIMIT 5`);
  const byCity = all(`SELECT COALESCE(city, 'Unknown') as city, COUNT(*) as c FROM hoa_communities WHERE city IS NOT NULL AND city != '' GROUP BY city ORDER BY c DESC LIMIT 5`);
  const stateList = byState.map(r => `  ${r.state}: ${r.c}`).join('\n');
  const cityList = byCity.map(r => `  ${r.city}: ${r.c}`).join('\n');
  return `**${total.c} HOA communities**\n${stateList ? `By state:\n${stateList}` : ''}\n${cityList ? `\nTop cities:\n${cityList}` : ''}`.trim();
}

async function handleCfoLeads() {
  const total = get(`SELECT COUNT(*) as c FROM cfo_leads`);
  const bySource = all(`SELECT source, COUNT(*) as c FROM cfo_leads GROUP BY source ORDER BY c DESC`);
  const srcList = bySource.map(r => `  ${r.source}: ${r.c}`).join('\n');
  return `**${total.c} CFO leads**\n${srcList || '  No source breakdown available'}`;
}

async function handleCosts() {
  const costs = get(`SELECT COALESCE(SUM(cost_usd), 0) as total, COALESCE(AVG(cost_usd), 0) as avg, COUNT(*) as runs FROM runs`);
  const week = get(`SELECT COALESCE(SUM(cost_usd), 0) as c FROM runs WHERE created_at > date('now','-7 days')`);
  const top = all(`SELECT r.agent_id, COALESCE(a.name, r.agent_id) as display_name, SUM(r.cost_usd) as c, COUNT(*) as runs FROM runs r LEFT JOIN agents a ON r.agent_id = a.id OR r.agent_id = a.name GROUP BY r.agent_id ORDER BY c DESC LIMIT 5`);
  const topList = top.map(r => `  ${r.display_name}: $${(r.c||0).toFixed(4)} (${r.runs} runs)`).join('\n');
  return `**Costs**
Total: $${costs.total.toFixed(2)} across ${costs.runs} runs
Last 7 days: $${week.c.toFixed(2)}
Avg per run: $${costs.avg.toFixed(4)}

**Top spenders:**
${topList}`;
}

async function handleRunAgent(agentId, message) {
  // Extract any extra context from the message for the agent
  const cleanMsg = message.replace(/\b(run|trigger|fire|kick|start|launch|execute)\b/gi, '').trim();

  try {
    const token = await getAuthToken();
    const result = await apiPost('/api/runs', { agent_id: agentId, message: cleanMsg || 'Execute default task' }, token);
    if (result.run?.id) {
      return `**Fired up ${agentId}** (run ${result.run.id.substring(0, 8)}...)\nMessage: "${cleanMsg || 'default task'}"\nStatus: pending → will execute shortly.`;
    }
    return `**Triggered ${agentId}** — ${JSON.stringify(result).substring(0, 200)}`;
  } catch (err) {
    return `**Failed to run ${agentId}:** ${err.message}`;
  }
}

async function handleRecentRuns() {
  const runs = all(`SELECT id, agent_id, status, cost_usd, created_at, completed_at FROM runs ORDER BY created_at DESC LIMIT 10`);
  if (!runs.length) return 'No runs yet.';
  const list = runs.map(r => `  ${r.agent_id} | ${r.status} | $${(r.cost_usd||0).toFixed(4)} | ${r.created_at}`).join('\n');
  return `**Last 10 runs:**\n${list}`;
}

async function handleListAgents() {
  const agents = all(`SELECT id, name, status FROM agents ORDER BY name`);
  if (!agents.length) return 'No agents in DB. Run `node scripts/seed-all-agents.js` to seed them.';
  const list = agents.map(a => `  ${a.name} (${a.status})`).join('\n');
  return `**${agents.length} agents:**\n${list}\n\nSay "run [agent-name] [task]" to fire one up.`;
}

async function handleTrader() {
  try {
    const data = await httpGet('http://localhost:3002/api/positions');
    const pos = Array.isArray(data) ? data : (data.positions || []);
    if (!pos.length) return '**Trader:** No open positions.';
    const getPnl = (p) => parseFloat(p.unrealizedPnl ?? p.unrealized_pl) || 0;
    const getVal = (p) => parseFloat(p.marketValue ?? p.market_value) || 0;
    const pnl = pos.reduce((s, p) => s + getPnl(p), 0);
    const val = pos.reduce((s, p) => s + getVal(p), 0);
    const top = pos.slice(0, 5).map(p => `  ${p.symbol}: $${getVal(p).toFixed(0)} (${getPnl(p) >= 0 ? '+' : ''}$${getPnl(p).toFixed(2)})`).join('\n');
    return `**Trading: ${pos.length} positions**
Total value: $${val.toFixed(2)}
Unrealized P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}

**Top 5:**
${top}`;
  } catch {
    return '**Trader:** Offline or not responding.';
  }
}

async function handleContent() {
  const summary = all(`SELECT platform, status, COUNT(*) as c FROM content_queue GROUP BY platform, status`);
  const pending = all(`SELECT platform, content FROM content_queue WHERE status='pending' ORDER BY created_at DESC LIMIT 3`);
  const sumList = summary.map(r => `  ${r.platform}/${r.status}: ${r.c}`).join('\n');
  const pendList = pending.map(r => `  [${r.platform}] ${(r.content||'').substring(0, 60)}...`).join('\n');
  return `**Content Queue:**\n${sumList || '  Empty'}\n\n**Next up:**\n${pendList || '  Nothing pending'}`;
}

async function handlePipeline() {
  const runs = get(`SELECT COUNT(*) as total, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as ok, SUM(CASE WHEN status='running' THEN 1 ELSE 0 END) as active FROM runs`);
  const hoa = get(`SELECT COUNT(*) as c FROM hoa_communities`);
  const cfo = get(`SELECT COUNT(*) as c FROM cfo_leads`);
  const content = all(`SELECT status, COUNT(*) as c FROM content_queue GROUP BY status`);
  let trader = 'offline';
  try { const h = await httpGet('http://localhost:3002/health'); trader = h.status === 'ok' ? 'online' : 'degraded'; } catch {}

  const contentStr = content.map(r => `${r.status}: ${r.c}`).join(', ') || 'empty';
  return `**System Health**
API: online | Trader: ${trader}
Runs: ${runs.total} total, ${runs.active || 0} active, ${runs.ok} completed
HOA leads: ${hoa.c} | CFO leads: ${cfo.c}
Content queue: ${contentStr}`;
}

function handleHelp() {
  return `**What I can do instantly (no LLM, free):**
"what's up" / "stats" → Full dashboard
"how many HOA leads" → Lead counts
"costs" / "spend" → Cost breakdown
"recent runs" → Last 10 executions
"agents" → List all agents
"trader" / "positions" → Trading P&L
"content queue" → Pending posts
"pipeline" / "health" → System status

**Actions I can trigger:**
"run discovery for [city]" → hoa-discovery
"run lead scout for [county]" → cfo-lead-scout
"run social media" → hoa-social-media
"run networker" → hoa-networker
"run blog writer" → hoa-content-writer
"run outreach" → cfo-outreach-agent
"run publisher" → hoa-cms-publisher
"run facebook poster" → hoa-facebook-poster
"run email campaigns" → hoa-email-campaigns

**Daily Debrief:**
"debrief" → instant raw data snapshot ($0)
"run debrief" → full AI war room assessment (~$0.01)

**Complex/creative requests** go to the AI agent automatically.`;
}

// ── HTTP helpers ─────────────────────────────────────────────

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, { timeout: 5000 }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { reject(new Error('bad json')); } });
    }).on('error', reject);
  });
}

function apiPost(urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, 'http://localhost:3001');
    const req = http.request({
      hostname: url.hostname, port: url.port, path: url.pathname,
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      timeout: 10000,
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ raw: d }); } });
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

let _cachedToken = null;
async function getAuthToken() {
  if (_cachedToken) return _cachedToken;
  const result = await apiPost('/api/auth/login', { email: 'admin@clawops.local', password: 'changeme123' });
  _cachedToken = result.token;
  return _cachedToken;
}

module.exports = { route };
