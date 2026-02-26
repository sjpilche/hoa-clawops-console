/**
 * @file discordBot.js
 * @description Standalone Discord bot running inside the ClawOps server process.
 *
 * Features:
 *   - Auto-refreshing JWT token (never expires mid-session)
 *   - Plain messages → main OpenClaw agent → Discord reply
 *   - !run <agent> → creates + auto-confirms run end-to-end
 *   - !agents, !help commands
 *   - Run result notifications via discordNotifier webhook
 */

'use strict';

const http = require('http');
const https = require('https');

// ── HTTP helper ───────────────────────────────────────────────────────────

function apiRequest(urlStr, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const lib = url.protocol === 'https:' ? https : http;
    const payload = body ? JSON.stringify(body) : null;

    const reqOptions = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };

    const req = lib.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('Request timed out')));
    if (payload) req.write(payload);
    req.end();
  });
}

// ── Token manager — auto-refreshes every 20h ─────────────────────────────

let cachedToken = null;
let tokenExpiresAt = 0;

async function getToken(serverUrl) {
  const now = Date.now();

  // Return cached token if still valid (with 30min buffer)
  if (cachedToken && now < tokenExpiresAt - 30 * 60 * 1000) {
    return cachedToken;
  }

  // Re-login to get a fresh token
  const email = process.env.DEFAULT_ADMIN_EMAIL || 'admin@clawops.local';
  const password = process.env.DEFAULT_ADMIN_PASSWORD || 'changeme123';

  const res = await apiRequest(`${serverUrl}/api/auth/login`, { method: 'POST' }, { email, password });

  if (res.status !== 200 || !res.body?.token?.token) {
    throw new Error(`Token refresh failed (${res.status})`);
  }

  cachedToken = res.body.token.token;
  // expiresAt from server, or default 23h from now
  tokenExpiresAt = res.body.token.expiresAt
    ? new Date(res.body.token.expiresAt).getTime()
    : now + 23 * 60 * 60 * 1000;

  console.log(`[DiscordBot] 🔑 Token refreshed, expires ${new Date(tokenExpiresAt).toISOString()}`);
  return cachedToken;
}

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Per-user thread cache ─────────────────────────────────────────────────

const userThreads = new Map();

async function getOrCreateThread(userId, serverUrl, token) {
  if (userThreads.has(userId)) return userThreads.get(userId);

  const res = await apiRequest(
    `${serverUrl}/api/chat/threads`,
    { method: 'POST', headers: authHeaders(token) },
    { title: `Discord — ${userId}` }
  );

  const threadId = res.body?.thread?.id;
  if (!threadId) throw new Error('Failed to create chat thread');
  userThreads.set(userId, threadId);
  return threadId;
}

// ── Chat with main agent ──────────────────────────────────────────────────

async function chatWithAgent(userId, content, serverUrl) {
  const token = await getToken(serverUrl);

  let threadId;
  try {
    threadId = await getOrCreateThread(userId, serverUrl, token);
  } catch (err) {
    return `❌ Could not connect to ClawOps: ${err.message}`;
  }

  const msgRes = await apiRequest(
    `${serverUrl}/api/chat/threads/${threadId}/messages`,
    { method: 'POST', headers: authHeaders(token) },
    { content, sender_type: 'user' }
  );

  if (msgRes.status === 404) {
    userThreads.delete(userId);
    return '❌ Chat thread expired. Try again.';
  }
  if (msgRes.status >= 400) {
    return `❌ Chat error (${msgRes.status})`;
  }

  // Instant smart-router reply?
  const instant = msgRes.body?.responses?.[0]?.content;
  if (instant) return instant;

  // Poll for async agent response (max 90s)
  const start = Date.now();
  let lastUserMsgTime = null;

  while (Date.now() - start < 90_000) {
    await new Promise((r) => setTimeout(r, 2500));

    const poll = await apiRequest(
      `${serverUrl}/api/chat/threads/${threadId}`,
      { method: 'GET', headers: authHeaders(token) }
    );

    if (poll.status !== 200) break;

    const messages = poll.body?.messages || [];
    if (!lastUserMsgTime) {
      const userMsgs = messages.filter((m) => m.sender_type === 'user');
      if (userMsgs.length) lastUserMsgTime = userMsgs[userMsgs.length - 1].created_at;
    }

    const agentMsgs = messages.filter(
      (m) => (m.sender_type === 'agent' || m.sender_type === 'system') &&
              (!lastUserMsgTime || m.created_at >= lastUserMsgTime)
    );

    if (agentMsgs.length > 0) {
      return agentMsgs[agentMsgs.length - 1].content || '_No response_';
    }
  }

  return '⏳ The agent is still thinking. Check the ClawOps dashboard for the response.';
}

// ── Run agent end-to-end (create + auto-confirm) ──────────────────────────

async function runAgentEndToEnd(agentName, agentMessage, serverUrl) {
  const token = await getToken(serverUrl);
  const headers = authHeaders(token);

  // 1. Find the agent
  const agentsRes = await apiRequest(`${serverUrl}/api/agents`, { headers });
  if (agentsRes.status !== 200) throw new Error('Could not reach ClawOps server');

  const agents = agentsRes.body?.agents || agentsRes.body || [];
  const agent = agents.find(
    (a) => a.name?.toLowerCase() === agentName.toLowerCase() ||
           a.name?.toLowerCase().includes(agentName.toLowerCase())
  );

  if (!agent) {
    const names = agents.slice(0, 10).map((a) => `\`${a.name}\``).join(', ');
    throw new Error(`Agent \`${agentName}\` not found. Available: ${names}…`);
  }

  // 2. Create pending run
  const createRes = await apiRequest(
    `${serverUrl}/api/agents/${agent.id}/run`,
    { method: 'POST', headers },
    { message: agentMessage, trigger: 'discord' }
  );

  if (createRes.status >= 400) {
    throw new Error(`Failed to create run (${createRes.status}): ${JSON.stringify(createRes.body)}`);
  }

  const runId = createRes.body?.run?.id || createRes.body?.id;
  if (!runId) throw new Error('Server returned no run ID');

  // 3. Auto-confirm — fire and execute immediately
  const confirmRes = await apiRequest(
    `${serverUrl}/api/runs/${runId}/confirm`,
    { method: 'POST', headers }
  );

  if (confirmRes.status >= 400) {
    throw new Error(`Run created (${runId}) but confirm failed (${confirmRes.status})`);
  }

  const outputText = confirmRes.body?.run?.outputText || '';
  const durationMs = confirmRes.body?.run?.duration_ms;
  const costUsd = confirmRes.body?.run?.cost_usd;

  return { agent, runId, outputText, durationMs, costUsd };
}

// ── Webhook sender (for proactive messages — no bot channel needed) ───────

async function sendWebhook(content) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl || process.env.DISCORD_ENABLED !== 'true') return;

  const payload = typeof content === 'string'
    ? JSON.stringify({ content })
    : JSON.stringify(content);

  const url = new URL(webhookUrl);
  const lib = url.protocol === 'https:' ? https : http;

  const req = lib.request({
    hostname: url.hostname,
    port: url.port || 443,
    path: url.pathname,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
  }, (res) => res.resume());

  req.on('error', (err) => console.warn('[DiscordBot] Webhook error:', err.message));
  req.setTimeout(5000, () => req.destroy());
  req.write(payload);
  req.end();
}

// ── Morning briefing — 8am MT daily ──────────────────────────────────────

let lastPipelineSnapshot = null;

async function sendMorningBriefing(serverUrl) {
  try {
    const token = await getToken(serverUrl);

    // Run daily-debrief agent for the full briefing
    let briefingText = null;
    try {
      const { outputText } = await runAgentEndToEnd('daily-debrief', 'Morning briefing', serverUrl);
      briefingText = outputText;
    } catch {}

    // Fallback: pull stats directly if agent fails
    if (!briefingText) {
      const statsRes = await apiRequest(`${serverUrl}/api/runs?limit=10`, { headers: authHeaders(token) });
      const leadsRes = await apiRequest(`${serverUrl}/api/hoa-leads?limit=1`, { headers: authHeaders(token) });
      briefingText = `Stats pulled. Check ClawOps dashboard for details.`;
    }

    const truncated = briefingText.slice(0, 1800);
    await sendWebhook(`☀️ **Morning Briefing — ${new Date().toLocaleDateString('en-US', { timeZone: 'America/Denver', weekday: 'long', month: 'short', day: 'numeric' })}**\n\n${truncated}`);
    console.log('[DiscordBot] Morning briefing sent');
  } catch (err) {
    console.warn('[DiscordBot] Morning briefing failed:', err.message);
  }
}

function scheduleMorningBriefing(serverUrl) {
  function msUntilNext8amMT() {
    const now = new Date();
    // Get current time in MT (UTC-7 standard, UTC-6 MDT — use fixed -7 for simplicity)
    const mtOffset = -7 * 60;
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
    const mtNow = new Date(utcMs + mtOffset * 60000);

    const next8am = new Date(mtNow);
    next8am.setHours(8, 0, 0, 0);
    if (mtNow >= next8am) next8am.setDate(next8am.getDate() + 1);

    return next8am.getTime() - mtNow.getTime();
  }

  function scheduleNext() {
    const ms = msUntilNext8amMT();
    const hoursUntil = Math.round(ms / 1000 / 60 / 60 * 10) / 10;
    console.log(`[DiscordBot] Morning briefing scheduled in ${hoursUntil}h`);
    setTimeout(async () => {
      await sendMorningBriefing(serverUrl);
      scheduleNext(); // reschedule for tomorrow
    }, ms);
  }

  scheduleNext();
}

// ── Proactive alerts — poll every 5 min for failures/pipeline drops ───────

async function checkAlerts(serverUrl) {
  try {
    const token = await getToken(serverUrl);

    // Check for recent failed runs (last 10 min)
    const runsRes = await apiRequest(
      `${serverUrl}/api/runs?limit=20`,
      { headers: authHeaders(token) }
    );
    if (runsRes.status !== 200) return;

    const runs = runsRes.body?.runs || runsRes.body || [];
    const tenMinAgo = Date.now() - 10 * 60 * 1000;

    const recentFailures = runs.filter((r) => {
      const completedAt = r.completed_at ? new Date(r.completed_at).getTime() : 0;
      return r.status === 'failed' && completedAt > tenMinAgo;
    });

    for (const run of recentFailures) {
      const agentName = run.agent_name || run.agent_id || 'Unknown agent';
      const errMsg = run.error_msg || 'No error details';
      await sendWebhook(`⚠️ **Run Failed:** \`${agentName}\`\nError: ${errMsg.slice(0, 200)}\nRun ID: \`${run.id}\``);
      console.log(`[DiscordBot] Alert sent for failed run: ${run.id}`);
    }

    // Check for pipeline stall — if no runs completed in last 4 hours, warn
    const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000;
    const completedRecently = runs.some((r) => {
      const completedAt = r.completed_at ? new Date(r.completed_at).getTime() : 0;
      return r.status === 'completed' && completedAt > fourHoursAgo;
    });

    if (!completedRecently && runs.length > 0) {
      // Only alert once — check if we already sent this alert recently
      const lastStallAlert = global.__lastStallAlertAt || 0;
      if (Date.now() - lastStallAlert > 4 * 60 * 60 * 1000) {
        await sendWebhook(`📭 **Pipeline stall** — no completed runs in 4+ hours. System may need attention.`);
        global.__lastStallAlertAt = Date.now();
        console.log('[DiscordBot] Pipeline stall alert sent');
      }
    } else {
      global.__lastStallAlertAt = 0; // reset when pipeline is moving
    }

  } catch (err) {
    // Silent — alert checking should never crash the bot
  }
}

function startAlertPolling(serverUrl) {
  // Check run failures every 5 minutes
  setInterval(() => checkAlerts(serverUrl), 5 * 60 * 1000);
  // Check stale leads every 6 hours
  setInterval(() => checkStaleLeads(serverUrl), 6 * 60 * 60 * 1000);
  // Run stale check once at startup (after 2 min delay so server is warm)
  setTimeout(() => checkStaleLeads(serverUrl), 2 * 60 * 1000);
  console.log('[DiscordBot] Proactive alert polling started (5 min run alerts · 6h stale lead checks)');
}

// ── Stats helpers ─────────────────────────────────────────────────────────

async function fetchStats(serverUrl) {
  const token = await getToken(serverUrl);
  const headers = authHeaders(token);

  const [runsRes, hoaRes, cfoRes] = await Promise.all([
    apiRequest(`${serverUrl}/api/runs?limit=100`, { headers }),
    apiRequest(`${serverUrl}/api/hoa-leads?limit=1`, { headers }),
    apiRequest(`${serverUrl}/api/cfo-marketing/leads?limit=1`, { headers }),
  ]);

  const runs = runsRes.body?.runs || [];
  const hoaTotal = hoaRes.body?.total ?? 0;
  const cfoTotal = cfoRes.body?.total ?? 0;

  const completed = runs.filter((r) => r.status === 'completed' || r.status === 'success');
  const failed = runs.filter((r) => r.status === 'failed');
  const totalCost = runs.reduce((sum, r) => sum + (Number(r.cost_usd) || 0), 0);
  const successRate = runs.length ? Math.round((completed.length / runs.length) * 100) : 0;

  const lastRun = runs.find((r) => r.completed_at);
  const lastRunAge = lastRun
    ? Math.round((Date.now() - new Date(lastRun.completed_at).getTime()) / 60000)
    : null;

  return { runs, completed, failed, totalCost, successRate, hoaTotal, cfoTotal, lastRun, lastRunAge };
}

async function fetchLeadDetails(serverUrl) {
  const token = await getToken(serverUrl);
  const headers = authHeaders(token);

  const [hoaAllRes, cfoAllRes] = await Promise.all([
    apiRequest(`${serverUrl}/api/hoa-leads?limit=1000`, { headers }),
    apiRequest(`${serverUrl}/api/cfo-marketing/leads?limit=1000`, { headers }),
  ]);

  const hoaLeads = hoaAllRes.body?.leads || [];
  const cfoLeads = cfoAllRes.body?.leads || [];
  const hoaTotal = hoaAllRes.body?.total ?? hoaLeads.length;
  const cfoTotal = cfoAllRes.body?.total ?? cfoLeads.length;

  // HOA contacted = status not 'new'
  const hoaContacted = hoaLeads.filter((l) => l.status && l.status !== 'new').length;
  // CFO contacted = status not 'new' / 'scraped'
  const cfoContacted = cfoLeads.filter((l) => l.status && l.status !== 'new' && l.status !== 'scraped').length;

  // Stale = contacted_at or updated_at more than 48h ago AND status is 'new'
  const cutoff48h = Date.now() - 48 * 60 * 60 * 1000;
  const hoaStale = hoaLeads.filter((l) => l.status === 'new' && new Date(l.scraped_at).getTime() < cutoff48h).length;
  const cfoStale = cfoLeads.filter((l) => (l.status === 'new' || l.status === 'scraped') && new Date(l.created_at).getTime() < cutoff48h).length;

  return { hoaTotal, cfoTotal, hoaContacted, cfoContacted, hoaStale, cfoStale, hoaLeads, cfoLeads };
}

// ── Stale lead alert ──────────────────────────────────────────────────────

let lastStaleAlertAt = 0;

async function checkStaleLeads(serverUrl) {
  try {
    // Only alert once every 12 hours max
    if (Date.now() - lastStaleAlertAt < 12 * 60 * 60 * 1000) return;

    const { hoaStale, cfoStale, hoaTotal, cfoTotal } = await fetchLeadDetails(serverUrl);
    const totalStale = hoaStale + cfoStale;
    if (totalStale === 0) return;

    const lines = ['📬 **Stale lead alert** — leads sitting idle 48h+:'];
    if (hoaStale > 0) lines.push(`• ${hoaStale} HOA leads uncontacted (of ${hoaTotal} total)`);
    if (cfoStale > 0) lines.push(`• ${cfoStale} CFO leads uncontacted (of ${cfoTotal} total)`);
    lines.push('Run `!run hoa-email-campaigns` or `!run cfo-outreach-agent` to fix it.');

    await sendWebhook(lines.join('\n'));
    lastStaleAlertAt = Date.now();
    console.log('[DiscordBot] Stale lead alert sent');
  } catch (err) {
    // Silent
  }
}

// ── Weekly Sunday recap ───────────────────────────────────────────────────

async function sendWeeklyRecap(serverUrl) {
  try {
    const { runs, completed, failed, totalCost, hoaTotal, cfoTotal } = await fetchStats(serverUrl);

    // Runs from the last 7 days
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const weekRuns = runs.filter((r) => r.created_at && new Date(r.created_at).getTime() > weekAgo);
    const weekCompleted = weekRuns.filter((r) => r.status === 'completed' || r.status === 'success');
    const weekFailed = weekRuns.filter((r) => r.status === 'failed');
    const weekCost = weekRuns.reduce((sum, r) => sum + (Number(r.cost_usd) || 0), 0);

    // Top agents this week
    const agentCounts = {};
    for (const r of weekCompleted) {
      agentCounts[r.agent_name] = (agentCounts[r.agent_name] || 0) + 1;
    }
    const topAgents = Object.entries(agentCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => `  • ${name}: ${count} runs`)
      .join('\n');

    const date = new Date().toLocaleDateString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric' });

    const msg = [
      `📊 **Weekly Recap — week ending ${date}**`,
      '',
      `Runs: ${weekRuns.length} total · ${weekCompleted.length} ✅ · ${weekFailed.length} ❌`,
      `Spend: $${weekCost.toFixed(4)}`,
      `Pipeline: ${hoaTotal} HOA leads · ${cfoTotal} CFO leads`,
      topAgents ? `\nTop agents:\n${topAgents}` : '',
      '',
      weekFailed.length > weekCompleted.length
        ? '⚠️ More failures than completions this week. Something needs attention.'
        : weekRuns.length === 0
        ? '💤 Zero runs this week. Pipeline is dead. Wake it up Monday.'
        : '✅ Week looks solid.',
    ].filter((l) => l !== undefined).join('\n');

    await sendWebhook(msg);
    console.log('[DiscordBot] Weekly recap sent');
  } catch (err) {
    console.warn('[DiscordBot] Weekly recap failed:', err.message);
  }
}

function scheduleWeeklyRecap(serverUrl) {
  function msUntilSunday9pmMT() {
    const now = new Date();
    const mtOffset = -7 * 60;
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
    const mtNow = new Date(utcMs + mtOffset * 60000);

    const daysUntilSunday = (7 - mtNow.getDay()) % 7 || 7; // always next Sunday
    const nextSunday = new Date(mtNow);
    nextSunday.setDate(mtNow.getDate() + daysUntilSunday);
    nextSunday.setHours(21, 0, 0, 0); // 9pm MT

    return nextSunday.getTime() - mtNow.getTime();
  }

  function scheduleNext() {
    const ms = msUntilSunday9pmMT();
    const hoursUntil = Math.round(ms / 1000 / 60 / 60 * 10) / 10;
    console.log(`[DiscordBot] Weekly recap scheduled in ${hoursUntil}h`);
    setTimeout(async () => {
      await sendWeeklyRecap(serverUrl);
      scheduleNext();
    }, ms);
  }

  scheduleNext();
}

// ── Tier 2 data fetchers ─────────────────────────────────────────────────

async function triggerBlitz(domain, serverUrl) {
  const token = await getToken(serverUrl);
  const body = domain && domain !== 'all' ? { domain } : {};
  const res = await apiRequest(
    `${serverUrl}/api/blitz/run`,
    { method: 'POST', headers: authHeaders(token) },
    body
  );
  if (res.status >= 400) throw new Error(`Blitz failed (${res.status}): ${JSON.stringify(res.body)}`);
  return res.body; // { success, runId, domain, message, totalAgents }
}

async function fetchBrainStats(serverUrl) {
  const token = await getToken(serverUrl);
  const res = await apiRequest(`${serverUrl}/api/brain/stats`, { headers: authHeaders(token) });
  if (res.status !== 200) throw new Error(`Brain stats API returned ${res.status}`);
  return res.body?.stats || res.body;
}

async function fetchBrainEpisodes(market, serverUrl) {
  const token = await getToken(serverUrl);
  const qs = market ? `?market=${encodeURIComponent(market)}&limit=5&min_score=0` : '?limit=5&min_score=0';
  const res = await apiRequest(`${serverUrl}/api/brain/episodes${qs}`, { headers: authHeaders(token) });
  if (res.status !== 200) throw new Error(`Brain episodes API returned ${res.status}`);
  return res.body?.episodes || [];
}

async function fetchBrainKnowledge(market, serverUrl) {
  const token = await getToken(serverUrl);
  const qs = market ? `?market=${encodeURIComponent(market)}&limit=3` : '?limit=3';
  const res = await apiRequest(`${serverUrl}/api/brain/knowledge${qs}`, { headers: authHeaders(token) });
  if (res.status !== 200) throw new Error(`Brain knowledge API returned ${res.status}`);
  return res.body?.examples || [];
}

// ── Tier 3 data fetchers ─────────────────────────────────────────────────

async function fetchTrader() {
  // Trader service runs on its own port (3002)
  const traderUrl = process.env.TRADER_URL || 'http://localhost:3002';
  const res = await apiRequest(`${traderUrl}/api/positions`);
  if (res.status !== 200) throw new Error(`Trader service returned ${res.status}`);
  return res.body; // { status, positions: [{ symbol, qty, market_value, unrealized_pl }] }
}

async function fetchOutreach(status, serverUrl) {
  const token = await getToken(serverUrl);
  const qs = status ? `?status=${encodeURIComponent(status)}&limit=20` : '?limit=20';
  const res = await apiRequest(`${serverUrl}/api/cfo-marketing/outreach${qs}`, { headers: authHeaders(token) });
  if (res.status !== 200) throw new Error(`Outreach API returned ${res.status}`);
  // Returns array directly or wrapped — handle both
  return Array.isArray(res.body) ? res.body : (res.body?.outreach || res.body?.sequences || []);
}

async function bulkSendOutreach(serverUrl) {
  const token = await getToken(serverUrl);
  const res = await apiRequest(
    `${serverUrl}/api/cfo-marketing/outreach/bulk-send`,
    { method: 'POST', headers: authHeaders(token) }
  );
  if (res.status >= 400) throw new Error(`Bulk send failed (${res.status}): ${JSON.stringify(res.body)}`);
  return res.body; // { sent, failed, total, details[] }
}

async function fetchContentQueue(status, serverUrl) {
  const token = await getToken(serverUrl);
  const qs = status ? `?status=${encodeURIComponent(status)}&limit=10` : '?status=pending&limit=10';
  const res = await apiRequest(`${serverUrl}/api/content-queue${qs}`, { headers: authHeaders(token) });
  if (res.status !== 200) throw new Error(`Content queue API returned ${res.status}`);
  return Array.isArray(res.body) ? res.body : (res.body?.items || res.body?.posts || []);
}

async function publishContentItem(id, serverUrl) {
  const token = await getToken(serverUrl);
  const res = await apiRequest(
    `${serverUrl}/api/content-queue/${id}/publish`,
    { method: 'POST', headers: authHeaders(token) }
  );
  if (res.status >= 400) throw new Error(`Publish failed (${res.status}): ${JSON.stringify(res.body)}`);
  return res.body; // { success, external_post_id, platform }
}

async function publishAllDueContent(serverUrl) {
  const token = await getToken(serverUrl);
  const res = await apiRequest(
    `${serverUrl}/api/content-queue/publish-due`,
    { method: 'POST', headers: authHeaders(token) }
  );
  if (res.status >= 400) throw new Error(`Publish-due failed (${res.status}): ${JSON.stringify(res.body)}`);
  return res.body; // { success, published, failed, results[] }
}

async function fetchEngageQueue(serverUrl) {
  const token = await getToken(serverUrl);
  const res = await apiRequest(
    `${serverUrl}/api/lead-gen/networker/queue?status=pending_review&min_relevance=60&limit=5`,
    { headers: authHeaders(token) }
  );
  if (res.status !== 200) throw new Error(`Engage queue API returned ${res.status}`);
  return Array.isArray(res.body) ? res.body : (res.body?.opportunities || res.body?.items || []);
}

async function patchEngageItem(id, action, serverUrl) {
  const token = await getToken(serverUrl);
  const res = await apiRequest(
    `${serverUrl}/api/lead-gen/networker/queue/${id}`,
    { method: 'PATCH', headers: authHeaders(token) },
    { action } // 'approve' or 'reject'
  );
  if (res.status >= 400) throw new Error(`Engage action failed (${res.status}): ${JSON.stringify(res.body)}`);
  return res.body;
}

async function fetchContactStats(serverUrl) {
  const token = await getToken(serverUrl);
  const res = await apiRequest(`${serverUrl}/api/hoa-contacts/stats`, { headers: authHeaders(token) });
  if (res.status !== 200) throw new Error(`Contacts stats API returned ${res.status}`);
  return res.body; // { total, by_status, by_state, avg_confidence, with_email, with_phone }
}

// ── Tier 1 data fetchers ──────────────────────────────────────────────────

async function fetchCosts(serverUrl) {
  const token = await getToken(serverUrl);
  const res = await apiRequest(`${serverUrl}/api/costs/summary`, { headers: authHeaders(token) });
  if (res.status !== 200) throw new Error(`Costs API returned ${res.status}`);
  return res.body?.summary || res.body;
}

async function fetchSchedules(serverUrl) {
  const token = await getToken(serverUrl);
  const res = await apiRequest(`${serverUrl}/api/schedules`, { headers: authHeaders(token) });
  if (res.status !== 200) throw new Error(`Schedules API returned ${res.status}`);
  return res.body?.schedules || [];
}

async function fetchPipeline(serverUrl) {
  const token = await getToken(serverUrl);
  const [pipelinesRes, activeRunsRes, healthRes] = await Promise.all([
    apiRequest(`${serverUrl}/api/pipelines`, { headers: authHeaders(token) }),
    apiRequest(`${serverUrl}/api/pipelines/runs/active`, { headers: authHeaders(token) }),
    apiRequest(`${serverUrl}/api/health`, { headers: authHeaders(token) }),
  ]);
  return {
    pipelines: pipelinesRes.body?.pipelines || [],
    activeRuns: activeRunsRes.body?.runs || [],
    health: healthRes.body || {},
  };
}

async function fetchFunnel(serverUrl) {
  const token = await getToken(serverUrl);
  const [statsRes, funnelRes] = await Promise.all([
    apiRequest(`${serverUrl}/api/cfo-marketing/leads/stats`, { headers: authHeaders(token) }),
    apiRequest(`${serverUrl}/api/cfo-marketing/leads/funnel`, { headers: authHeaders(token) }),
  ]);
  return {
    stats: statsRes.body || {},
    funnel: funnelRes.body || {},
  };
}

// ── Command handlers ──────────────────────────────────────────────────────

const HELP_TEXT = `**Todd — ClawOps Chief of Staff** ⚔️
**Intelligence**
\`!stats\` · \`!leads\` · \`!status\` · \`!costs [7d|30d]\` · \`!funnel\`
\`!pipeline\` · \`!schedules\` · \`!trader\` · \`!contacts\`

**Action**
\`!run <agent> [msg]\` · \`!blitz [hoa|cfo|jake|mgmt]\` · \`!find <county>\`
\`!outreach [draft|approved|sent]\` · \`!send\` (bulk send approved outreach)
\`!content [pending|all]\` · \`!publish <id|all>\`
\`!engage\` · \`!approve <id>\` · \`!reject <id>\`

**Intel**
\`!brain [market]\` · \`!agents\` · \`!brief\` · \`!help\`

_Plain messages → main agent · Auto: 8am briefing · Sunday recap · failure + stale alerts_`;

async function handleCommand(message, prefix, serverUrl) {
  if (!message.content.startsWith(prefix)) return false;

  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const cmd = args[0]?.toLowerCase();

  if (cmd === 'help') {
    await message.reply(HELP_TEXT);
    return true;
  }

  if (cmd === 'stats') {
    if (message.channel.sendTyping) message.channel.sendTyping().catch(() => {});
    try {
      const { runs, completed, failed, totalCost, successRate, hoaTotal, cfoTotal, lastRunAge } = await fetchStats(serverUrl);
      const lastRunStr = lastRunAge === null
        ? 'never'
        : lastRunAge < 60
        ? `${lastRunAge}m ago`
        : `${Math.round(lastRunAge / 60)}h ago`;

      const msg = [
        '**ClawOps Dashboard** ⚔️',
        `Pipeline: **${hoaTotal}** HOA leads · **${cfoTotal}** CFO leads`,
        `Runs (last 100): **${completed.length}** ✅ · **${failed.length}** ❌ · ${successRate}% success`,
        `Total spend: **$${totalCost.toFixed(4)}**`,
        `Last completed run: ${lastRunStr}`,
      ].join('\n');

      await message.reply(msg);
    } catch (err) {
      await message.reply(`❌ Stats failed: ${err.message}`);
    }
    return true;
  }

  if (cmd === 'leads') {
    if (message.channel.sendTyping) message.channel.sendTyping().catch(() => {});
    try {
      const { hoaTotal, cfoTotal, hoaContacted, cfoContacted, hoaStale, cfoStale } = await fetchLeadDetails(serverUrl);
      const hoaRate = hoaTotal ? Math.round((hoaContacted / hoaTotal) * 100) : 0;
      const cfoRate = cfoTotal ? Math.round((cfoContacted / cfoTotal) * 100) : 0;

      const hoaLine = `HOA: **${hoaTotal}** total · ${hoaContacted} contacted (${hoaRate}%)${hoaStale > 0 ? ` · ⚠️ ${hoaStale} idle 48h+` : ''}`;
      const cfoLine = `CFO: **${cfoTotal}** total · ${cfoContacted} contacted (${cfoRate}%)${cfoStale > 0 ? ` · ⚠️ ${cfoStale} idle 48h+` : ''}`;

      let verdict = '';
      if (hoaRate < 10 || cfoRate < 10) verdict = '\nOutreach rate is low. Email agents need to run.';
      else if (hoaStale + cfoStale > 20) verdict = '\nToo many leads sitting idle. Run outreach.';
      else verdict = '\nContact rates look healthy.';

      await message.reply(`**Lead Pipeline**\n${hoaLine}\n${cfoLine}${verdict}`);
    } catch (err) {
      await message.reply(`❌ Leads failed: ${err.message}`);
    }
    return true;
  }

  if (cmd === 'status') {
    if (message.channel.sendTyping) message.channel.sendTyping().catch(() => {});
    try {
      const token = await getToken(serverUrl);
      const res = await apiRequest(`${serverUrl}/api/runs?limit=5`, { headers: authHeaders(token) });
      const runs = res.body?.runs || [];

      if (runs.length === 0) {
        await message.reply('No runs found. Pipeline is empty.');
        return true;
      }

      const lines = ['**Last 5 Runs**'];
      for (const r of runs) {
        const icon = (r.status === 'completed' || r.status === 'success') ? '✅'
          : r.status === 'failed' ? '❌'
          : r.status === 'running' ? '🔄'
          : '⏳';
        const dur = r.duration_ms ? `${Math.round(r.duration_ms / 1000)}s` : '—';
        const cost = r.cost_usd ? `$${Number(r.cost_usd).toFixed(4)}` : '$0.00';
        lines.push(`${icon} \`${r.agent_name || r.agent_id}\` · ${dur} · ${cost}`);
        if (r.status === 'failed' && r.error_msg) {
          lines.push(`   ↳ ${r.error_msg.slice(0, 80)}`);
        }
      }

      await message.reply(lines.join('\n'));
    } catch (err) {
      await message.reply(`❌ Status failed: ${err.message}`);
    }
    return true;
  }

  if (cmd === 'costs') {
    if (message.channel.sendTyping) message.channel.sendTyping().catch(() => {});
    try {
      const s = await fetchCosts(serverUrl);
      const window = args[1]?.toLowerCase();

      // Choose the right spend figure based on optional arg
      let windowSpend, windowLabel;
      if (window === '30d') {
        windowSpend = s.cost_last_30d;
        windowLabel = '30d';
      } else if (window === '7d') {
        windowSpend = s.cost_last_7d;
        windowLabel = '7d';
      } else {
        windowSpend = s.cost_last_24h;
        windowLabel = '24h';
      }

      const lines = [
        '**Cost Breakdown** 💰',
        `Spend (${windowLabel}): **$${Number(windowSpend || 0).toFixed(4)}** · 7d: $${Number(s.cost_last_7d || 0).toFixed(4)} · 30d: $${Number(s.cost_last_30d || 0).toFixed(4)}`,
        `All-time: $${Number(s.total_cost || 0).toFixed(4)} across ${s.total_runs || 0} runs`,
        `Avg per run: $${Number(s.avg_cost_per_run || 0).toFixed(4)}`,
      ];

      if (s.most_expensive_agent) {
        const a = s.most_expensive_agent;
        lines.push(`Biggest spender: \`${a.agent_name}\` — $${Number(a.total_cost || 0).toFixed(4)} total · $${Number(a.avg_cost || 0).toFixed(4)}/run · ${a.run_count} runs`);
      }
      if (s.costliest_run) {
        const r = s.costliest_run;
        lines.push(`Single costliest run: \`${r.agent_name}\` — $${Number(r.cost_usd || 0).toFixed(4)} (${r.tokens_used?.toLocaleString() || '?'} tokens)`);
      }
      if (s.total_runs > 0 && s.total_cost > 0) {
        // Rough cost-per-lead estimate using what we know
        lines.push(`_Use \`!leads\` to cross-reference lead counts for cost-per-lead._`);
      }

      await message.reply(lines.join('\n'));
    } catch (err) {
      await message.reply(`❌ Costs failed: ${err.message}`);
    }
    return true;
  }

  if (cmd === 'funnel') {
    if (message.channel.sendTyping) message.channel.sendTyping().catch(() => {});
    try {
      const { stats, funnel } = await fetchFunnel(serverUrl);
      const p = stats.pipeline || {};
      const total = stats.total_leads || 0;

      // Conversion rates
      const pct = (n, d) => d ? `${Math.round((n / d) * 100)}%` : '0%';
      const contacted = p.contacted || 0;
      const replied = p.replied || 0;
      const pilot = p.pilot || 0;
      const won = p.closed_won || 0;
      const lost = p.closed_lost || 0;
      const fresh = p.new || 0;

      const lines = [
        '**CFO Lead Funnel**',
        `New: **${fresh}** → Contacted: **${contacted}** (${pct(contacted, total)}) → Replied: **${replied}** (${pct(replied, contacted)}) → Pilot: **${pilot}** (${pct(pilot, replied)})`,
        `Closed won: **${won}** · Closed lost: ${lost}`,
      ];

      if (stats.pilot_pipeline_value) {
        lines.push(`Pipeline value: **$${Number(stats.pilot_pipeline_value).toLocaleString()}**`);
      }

      // Top ERP types
      if (stats.erp_breakdown?.length) {
        const top = stats.erp_breakdown.slice(0, 3).map((e) => `${e.erp_type}: ${e.n}`).join(' · ');
        lines.push(`Top ERP targets: ${top}`);
      }

      // Verdict
      if (contacted === 0 && total > 0) {
        lines.push('⚠️ Zero leads contacted. Run `!run cfo-outreach-agent`.');
      } else if (replied === 0 && contacted > 10) {
        lines.push('📭 No replies yet. Check subject lines or try a different angle.');
      } else if (pilot > 0) {
        lines.push(`🔥 ${pilot} in pilot stage — that's real pipeline.`);
      }

      await message.reply(lines.join('\n'));
    } catch (err) {
      await message.reply(`❌ Funnel failed: ${err.message}`);
    }
    return true;
  }

  if (cmd === 'pipeline') {
    if (message.channel.sendTyping) message.channel.sendTyping().catch(() => {});
    try {
      const { pipelines, activeRuns, health } = await fetchPipeline(serverUrl);
      const lines = ['**System Health** 🔧'];

      // Health components
      const c = health.components || {};
      const dbStatus = c.database?.status === 'healthy' ? '✅' : '⚠️';
      const ocStatus = c.openclaw?.status === 'healthy' ? '✅' : '❌';
      const memUsed = c.memory?.used_percent ? `${Math.round(c.memory.used_percent)}%` : '?';
      const uptime = health.uptime_seconds
        ? `${Math.round(health.uptime_seconds / 3600)}h`
        : '?';

      lines.push(`Server: ✅ up ${uptime} · DB: ${dbStatus} · OpenClaw: ${ocStatus} · RAM: ${memUsed} used`);

      if (c.database?.tables) {
        const t = c.database.tables;
        lines.push(`DB: ${t.agents || 0} agents · ${t.runs || 0} runs · ${t.messages || 0} messages`);
      }

      // Active pipeline runs
      if (activeRuns.length > 0) {
        lines.push(`Active runs: ${activeRuns.map((r) => `\`${r.pipeline_name}\``).join(', ')}`);
      } else {
        lines.push('No pipelines actively running.');
      }

      // Pipeline inventory
      if (pipelines.length > 0) {
        const enabled = pipelines.filter((p) => p.is_active);
        lines.push(`Pipelines: ${enabled.length} active of ${pipelines.length} total`);
        const recent = pipelines
          .filter((p) => p.last_run_at)
          .sort((a, b) => new Date(b.last_run_at) - new Date(a.last_run_at))
          .slice(0, 2);
        for (const p of recent) {
          const ago = Math.round((Date.now() - new Date(p.last_run_at).getTime()) / 3600000);
          lines.push(`  • \`${p.name}\` — last run ${ago}h ago · ${p.successful_runs}/${p.total_runs} success`);
        }
      }

      // Overall verdict
      const overallStatus = health.status || 'unknown';
      if (overallStatus === 'healthy') lines.push('✅ All systems nominal.');
      else if (overallStatus === 'degraded') lines.push('⚠️ System degraded — check dashboard.');
      else lines.push('❌ System unhealthy — intervention needed.');

      await message.reply(lines.join('\n'));
    } catch (err) {
      await message.reply(`❌ Pipeline check failed: ${err.message}`);
    }
    return true;
  }

  if (cmd === 'schedules') {
    if (message.channel.sendTyping) message.channel.sendTyping().catch(() => {});
    try {
      const schedules = await fetchSchedules(serverUrl);
      if (schedules.length === 0) {
        await message.reply('No scheduled jobs found. Nothing is running on autopilot.');
        return true;
      }

      const enabled = schedules.filter((s) => s.enabled);
      const disabled = schedules.filter((s) => !s.enabled);
      const lines = [`**Scheduled Jobs** (${enabled.length} active · ${disabled.length} paused)`];

      const now = Date.now();
      for (const s of schedules.slice(0, 10)) {
        const icon = s.enabled ? '🟢' : '⏸️';
        let nextStr = '—';
        if (s.nextRunAt) {
          const ms = new Date(s.nextRunAt).getTime() - now;
          if (ms < 0) nextStr = 'overdue';
          else if (ms < 3600000) nextStr = `${Math.round(ms / 60000)}m`;
          else nextStr = `${Math.round(ms / 3600000)}h`;
        }
        let lastStr = 'never';
        if (s.lastRunAt) {
          const ago = Math.round((now - new Date(s.lastRunAt).getTime()) / 3600000);
          lastStr = `${ago}h ago`;
        }
        lines.push(`${icon} \`${s.agentName || s.name}\` · next: ${nextStr} · last: ${lastStr}`);
      }

      if (schedules.length > 10) lines.push(`_...and ${schedules.length - 10} more. See dashboard for full list._`);

      await message.reply(lines.join('\n'));
    } catch (err) {
      await message.reply(`❌ Schedules failed: ${err.message}`);
    }
    return true;
  }

  if (cmd === 'blitz') {
    const domain = args[1]?.toLowerCase() || 'all';
    const validDomains = ['hoa', 'cfo', 'jake', 'mgmt', 'all'];
    if (!validDomains.includes(domain)) {
      await message.reply(`❌ Unknown domain \`${domain}\`. Use: hoa, cfo, jake, mgmt, or all.`);
      return true;
    }

    await message.react('⚡');
    if (message.channel.sendTyping) message.channel.sendTyping().catch(() => {});
    try {
      const result = await triggerBlitz(domain === 'all' ? null : domain, serverUrl);
      const domainLabel = domain === 'all' ? 'all domains' : `\`${domain}\``;
      await message.reply(
        `⚡ **Blitz launched** — ${domainLabel}\n` +
        `${result.totalAgents || '?'} agents firing in parallel · Run ID: \`${result.runId || '?'}\`\n` +
        `Results will post here as runs complete.`
      );
    } catch (err) {
      await message.reply(`❌ Blitz failed: ${err.message}`);
    }
    return true;
  }

  if (cmd === 'brain') {
    if (message.channel.sendTyping) message.channel.sendTyping().catch(() => {});
    const market = args.slice(1).join(' ') || null;
    try {
      const [brainStats, episodes, knowledge] = await Promise.all([
        fetchBrainStats(serverUrl),
        fetchBrainEpisodes(market, serverUrl),
        fetchBrainKnowledge(market, serverUrl),
      ]);

      const lines = [`**Collective Brain** 🧠${market ? ` — ${market}` : ''}`];

      // Stats overview
      if (brainStats) {
        const obs = brainStats.observations ?? brainStats.total_observations ?? '?';
        const eps = brainStats.episodes ?? brainStats.total_episodes ?? '?';
        const kb = brainStats.knowledge ?? brainStats.total_knowledge ?? '?';
        lines.push(`${obs} observations · ${eps} episodes · ${kb} KB entries`);
      }

      // Top episodes
      if (episodes.length > 0) {
        lines.push('');
        lines.push(`Top episodes${market ? ` (${market})` : ''}:`);
        for (const ep of episodes.slice(0, 3)) {
          const title = ep.title || ep.market || ep.context || 'Episode';
          const score = ep.score != null ? ` · score ${ep.score}` : '';
          const summary = ep.summary || ep.description || ep.content || '';
          lines.push(`• **${title}**${score}`);
          if (summary) lines.push(`  ${summary.slice(0, 120)}${summary.length > 120 ? '…' : ''}`);
        }
      } else {
        lines.push('No episodes found' + (market ? ` for "${market}"` : '') + '. System is still learning.');
      }

      // Knowledge base samples
      if (knowledge.length > 0) {
        lines.push('');
        lines.push('KB examples:');
        for (const k of knowledge.slice(0, 2)) {
          const label = k.type || k.market || k.erp_type || 'entry';
          const content = k.content || k.text || k.example || '';
          lines.push(`• [${label}] ${content.slice(0, 100)}${content.length > 100 ? '…' : ''}`);
        }
      }

      const chunks = lines.join('\n').match(/[\s\S]{1,1900}/g) || [lines.join('\n')];
      for (let i = 0; i < chunks.length; i++) {
        if (i === 0) await message.reply({ content: chunks[i], allowedMentions: { repliedUser: false } });
        else await message.channel.send(chunks[i]);
      }
    } catch (err) {
      await message.reply(`❌ Brain query failed: ${err.message}`);
    }
    return true;
  }

  if (cmd === 'find') {
    if (!args[1]) {
      await message.reply('Usage: `!find <county>` — e.g. `!find Lee` or `!find Sarasota`');
      return true;
    }
    const county = args.slice(1).join(' ');

    await message.react('⏳');
    if (message.channel.sendTyping) message.channel.sendTyping().catch(() => {});
    try {
      const { runId, outputText, durationMs, costUsd } = await runAgentEndToEnd(
        'cfo-lead-scout',
        JSON.stringify({ county }),
        serverUrl
      );
      const duration = durationMs ? `${Math.round(durationMs / 1000)}s` : '?';
      const cost = costUsd != null ? `$${Number(costUsd).toFixed(4)}` : '$0.00';

      let reply = `✅ **cfo-lead-scout** — ${county} County · ${duration} · ${cost}\nRun ID: \`${runId}\``;
      if (outputText) reply += `\n\n${outputText.slice(0, 1500)}${outputText.length > 1500 ? '…' : ''}`;

      const chunks = reply.match(/[\s\S]{1,1900}/g) || [reply];
      for (let i = 0; i < chunks.length; i++) {
        if (i === 0) await message.reply({ content: chunks[i], allowedMentions: { repliedUser: false } });
        else await message.channel.send(chunks[i]);
      }
    } catch (err) {
      await message.reply(`❌ Find failed: ${err.message}`);
    }
    return true;
  }

  // ── trader ──────────────────────────────────────────────────────────────
  if (cmd === 'trader' || cmd === 'trade') {
    if (message.channel.sendTyping) message.channel.sendTyping().catch(() => {});
    try {
      const data = await fetchTrader();
      const positions = data.positions || [];
      const status = data.status || 'unknown';

      if (positions.length === 0) {
        await message.reply(`**Trader** — ${status}\nNo open positions.`);
        return true;
      }

      const totalValue = positions.reduce((s, p) => s + parseFloat(p.market_value || 0), 0);
      const totalPnL = positions.reduce((s, p) => s + parseFloat(p.unrealized_pl || 0), 0);
      const pnlSign = totalPnL >= 0 ? '+' : '';
      const pnlIcon = totalPnL >= 0 ? '📈' : '📉';

      const lines = [
        `**Trader** ${pnlIcon} ${status}`,
        `Portfolio: **$${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}** · Unrealized P&L: **${pnlSign}$${Math.abs(totalPnL).toFixed(2)}**`,
        `Positions (${positions.length}):`,
      ];

      for (const p of positions.slice(0, 8)) {
        const val = parseFloat(p.market_value || 0).toFixed(2);
        const pl = parseFloat(p.unrealized_pl || 0);
        const plSign = pl >= 0 ? '+' : '';
        const plIcon = pl >= 0 ? '↑' : '↓';
        lines.push(`  ${plIcon} \`${p.symbol}\` ${p.qty} shares · $${val} · ${plSign}$${Math.abs(pl).toFixed(2)}`);
      }
      if (positions.length > 8) lines.push(`  _...and ${positions.length - 8} more_`);

      await message.reply(lines.join('\n'));
    } catch (err) {
      // Trader service may not be running
      await message.reply(`❌ Trader offline: ${err.message}\n_Is the trader service running on port 3002?_`);
    }
    return true;
  }

  // ── outreach ─────────────────────────────────────────────────────────────
  if (cmd === 'outreach') {
    if (message.channel.sendTyping) message.channel.sendTyping().catch(() => {});
    const filter = args[1]?.toLowerCase() || 'draft';
    try {
      const items = await fetchOutreach(filter, serverUrl);

      if (items.length === 0) {
        await message.reply(`No ${filter} outreach sequences. Run \`!run cfo-outreach-agent\` to generate some.`);
        return true;
      }

      const lines = [`**CFO Outreach — ${filter}** (${items.length} found)`];
      for (const item of items.slice(0, 8)) {
        const company = item.company_name || item.lead_id || 'Unknown';
        const subject = item.email_subject || '(no subject)';
        const score = item.pilot_fit_score ? ` · score ${item.pilot_fit_score}` : '';
        const hasEmail = item.contact_email ? '✉️' : '⚠️ no email';
        lines.push(`• \`${item.id}\` **${company}**${score} · ${hasEmail}`);
        lines.push(`  _"${subject.slice(0, 60)}${subject.length > 60 ? '…' : ''}"_`);
      }
      if (items.length > 8) lines.push(`_...and ${items.length - 8} more_`);
      if (filter === 'draft') lines.push('\nApprove with dashboard, then run `!send` to bulk-send all approved.');

      await message.reply(lines.join('\n'));
    } catch (err) {
      await message.reply(`❌ Outreach failed: ${err.message}`);
    }
    return true;
  }

  if (cmd === 'send') {
    await message.react('📤');
    if (message.channel.sendTyping) message.channel.sendTyping().catch(() => {});
    try {
      const result = await bulkSendOutreach(serverUrl);
      const sent = result.sent ?? 0;
      const failed = result.failed ?? 0;
      const total = result.total ?? (sent + failed);

      if (total === 0) {
        await message.reply('No approved outreach to send. Use the dashboard to approve sequences first, then `!send`.');
        return true;
      }

      const lines = [
        `📤 **Bulk Send Complete**`,
        `Sent: **${sent}** ✅ · Failed: **${failed}** ❌ · Total: ${total}`,
      ];
      if (failed > 0 && result.details) {
        const failures = result.details.filter((d) => !d.success).slice(0, 3);
        for (const f of failures) {
          lines.push(`  ❌ ${f.company_name || f.id}: ${(f.error || 'unknown error').slice(0, 60)}`);
        }
      }

      await message.reply(lines.join('\n'));
    } catch (err) {
      await message.reply(`❌ Send failed: ${err.message}`);
    }
    return true;
  }

  // ── content ──────────────────────────────────────────────────────────────
  if (cmd === 'content') {
    if (message.channel.sendTyping) message.channel.sendTyping().catch(() => {});
    const filter = args[1]?.toLowerCase() || 'pending';
    try {
      const items = await fetchContentQueue(filter, serverUrl);

      if (items.length === 0) {
        await message.reply(`No ${filter} content in queue. Run \`!run hoa-content-writer\` to generate some.`);
        return true;
      }

      const lines = [`**Content Queue — ${filter}** (${items.length} items)`];
      for (const item of items.slice(0, 6)) {
        const platform = item.platform || 'facebook';
        const type = item.post_type || 'page';
        const preview = (item.content || '').slice(0, 80);
        const scheduled = item.scheduled_for
          ? `scheduled ${new Date(item.scheduled_for).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
          : 'unscheduled';
        lines.push(`• \`${item.id}\` [${platform}/${type}] ${scheduled}`);
        if (preview) lines.push(`  _"${preview}${item.content?.length > 80 ? '…' : ''}"_`);
      }
      if (items.length > 6) lines.push(`_...and ${items.length - 6} more_`);
      lines.push('\n`!publish <id>` to post one · `!publish all` to post all due now');

      await message.reply(lines.join('\n'));
    } catch (err) {
      await message.reply(`❌ Content queue failed: ${err.message}`);
    }
    return true;
  }

  if (cmd === 'publish') {
    if (!args[1]) {
      await message.reply('Usage: `!publish <id>` or `!publish all`');
      return true;
    }
    const target = args[1].toLowerCase();
    await message.react('📣');
    if (message.channel.sendTyping) message.channel.sendTyping().catch(() => {});
    try {
      if (target === 'all') {
        const result = await publishAllDueContent(serverUrl);
        const published = result.published ?? 0;
        const failed = result.failed ?? 0;
        await message.reply(
          `📣 **Published** — ${published} posted · ${failed} failed\n` +
          (published === 0 ? 'Nothing was due. Check `!content` for unscheduled items.' : '')
        );
      } else {
        const result = await publishContentItem(target, serverUrl);
        await message.reply(
          `📣 **Posted** — ID \`${target}\`\n` +
          `External post ID: \`${result.external_post_id || '?'}\` on ${result.platform || 'facebook'}`
        );
      }
    } catch (err) {
      await message.reply(`❌ Publish failed: ${err.message}`);
    }
    return true;
  }

  // ── engage ───────────────────────────────────────────────────────────────
  if (cmd === 'engage') {
    if (message.channel.sendTyping) message.channel.sendTyping().catch(() => {});
    try {
      const items = await fetchEngageQueue(serverUrl);

      if (items.length === 0) {
        await message.reply('No pending engagement opportunities (relevance 60+). Run `!run hoa-networker` to find some.');
        return true;
      }

      const lines = [`**Engagement Queue** — top ${items.length} opportunities`];
      for (const item of items) {
        const platform = item.platform || '?';
        const score = item.relevance_score || 0;
        const community = item.community || 'unknown';
        const title = item.post_title || item.post_summary || 'No title';
        const preview = item.draft_response || '';
        lines.push(`• \`${item.id}\` [${platform}/${community}] score **${score}**`);
        lines.push(`  _"${title.slice(0, 70)}${title.length > 70 ? '…' : ''}"_`);
        if (preview) lines.push(`  Draft: "${preview.slice(0, 80)}${preview.length > 80 ? '…' : ''}"`);
      }
      lines.push('\n`!approve <id>` · `!reject <id>`');

      const chunks = lines.join('\n').match(/[\s\S]{1,1900}/g) || [lines.join('\n')];
      for (let i = 0; i < chunks.length; i++) {
        if (i === 0) await message.reply({ content: chunks[i], allowedMentions: { repliedUser: false } });
        else await message.channel.send(chunks[i]);
      }
    } catch (err) {
      await message.reply(`❌ Engage queue failed: ${err.message}`);
    }
    return true;
  }

  if (cmd === 'approve' && args[1]) {
    if (message.channel.sendTyping) message.channel.sendTyping().catch(() => {});
    try {
      await patchEngageItem(args[1], 'approve', serverUrl);
      await message.reply(`✅ Opportunity \`${args[1]}\` approved and queued for posting.`);
    } catch (err) {
      await message.reply(`❌ Approve failed: ${err.message}`);
    }
    return true;
  }

  if (cmd === 'reject' && args[1]) {
    if (message.channel.sendTyping) message.channel.sendTyping().catch(() => {});
    try {
      await patchEngageItem(args[1], 'reject', serverUrl);
      await message.reply(`🗑️ Opportunity \`${args[1]}\` rejected.`);
    } catch (err) {
      await message.reply(`❌ Reject failed: ${err.message}`);
    }
    return true;
  }

  // ── contacts ─────────────────────────────────────────────────────────────
  if (cmd === 'contacts') {
    if (message.channel.sendTyping) message.channel.sendTyping().catch(() => {});
    try {
      const stats = await fetchContactStats(serverUrl);
      const total = stats.total || 0;
      const withEmail = stats.with_email ?? stats.withEmail ?? 0;
      const withPhone = stats.with_phone ?? stats.withPhone ?? 0;
      const avgConf = stats.avg_confidence ? Math.round(stats.avg_confidence) : null;
      const byStatus = stats.by_status || {};

      const lines = [`**HOA Contacts** — ${total} total`];
      lines.push(`Email: **${withEmail}** (${total ? Math.round((withEmail / total) * 100) : 0}%) · Phone: **${withPhone}** (${total ? Math.round((withPhone / total) * 100) : 0}%)`);
      if (avgConf !== null) lines.push(`Avg confidence: ${avgConf}/100`);

      // Status breakdown
      const statusKeys = Object.keys(byStatus).slice(0, 5);
      if (statusKeys.length > 0) {
        lines.push('By status: ' + statusKeys.map((k) => `${k}: ${byStatus[k]}`).join(' · '));
      }

      // Enrichment verdict
      const unenriched = (byStatus['new'] || 0);
      if (unenriched > 50) {
        lines.push(`⚠️ ${unenriched} contacts need enrichment. Run \`!run hoa-contact-enricher\`.`);
      } else if (withEmail < total * 0.3) {
        lines.push('Email coverage is low. Run `!run hoa-contact-enricher` to fill gaps.');
      } else {
        lines.push('Enrichment coverage looks solid.');
      }

      await message.reply(lines.join('\n'));
    } catch (err) {
      await message.reply(`❌ Contacts failed: ${err.message}`);
    }
    return true;
  }

  if (cmd === 'brief') {
    await message.react('⏳');
    if (message.channel.sendTyping) message.channel.sendTyping().catch(() => {});
    try {
      const { outputText } = await runAgentEndToEnd('daily-debrief', 'Quick briefing', serverUrl);
      const chunks = outputText.match(/[\s\S]{1,1900}/g) || [outputText || '_No output_'];
      for (let i = 0; i < chunks.length; i++) {
        if (i === 0) await message.reply({ content: chunks[i], allowedMentions: { repliedUser: false } });
        else await message.channel.send(chunks[i]);
      }
    } catch (err) {
      await message.reply(`❌ Briefing failed: ${err.message}`);
    }
    return true;
  }

  if (cmd === 'agents') {
    try {
      const token = await getToken(serverUrl);
      const res = await apiRequest(`${serverUrl}/api/agents`, { headers: authHeaders(token) });
      if (res.status === 200) {
        const agents = res.body?.agents || res.body || [];
        const names = agents.map((a) => `\`${a.name}\``).join(', ');
        await message.reply(`**Available agents (${agents.length}):**\n${names || '_None_'}`);
      } else {
        await message.reply('❌ Could not reach ClawOps server.');
      }
    } catch (err) {
      await message.reply(`❌ ${err.message}`);
    }
    return true;
  }

  if (cmd === 'run' && args[1]) {
    const agentName = args[1];
    const agentMessage = args.slice(2).join(' ') || `Run ${agentName}`;

    await message.react('⏳');
    if (message.channel.sendTyping) message.channel.sendTyping().catch(() => {});

    try {
      const { agent, runId, outputText, durationMs, costUsd } = await runAgentEndToEnd(agentName, agentMessage, serverUrl);

      const duration = durationMs ? `${Math.round(durationMs / 1000)}s` : '?';
      const cost = costUsd != null ? `$${Number(costUsd).toFixed(4)}` : '$0.00';

      let reply = `✅ **${agent.name}** completed in ${duration} (${cost})\nRun ID: \`${runId}\``;
      if (outputText) reply += `\n\n${outputText.slice(0, 1500)}${outputText.length > 1500 ? '…' : ''}`;

      // Chunk if needed
      const chunks = reply.match(/[\s\S]{1,1900}/g) || [reply];
      for (let i = 0; i < chunks.length; i++) {
        if (i === 0) {
          await message.reply({ content: chunks[i], allowedMentions: { repliedUser: false } });
        } else {
          await message.channel.send(chunks[i]);
        }
      }
    } catch (err) {
      await message.reply(`❌ ${err.message}`);
    }
    return true;
  }

  return false;
}

// ── Bot startup ───────────────────────────────────────────────────────────

async function startDiscordBot() {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    console.log('[DiscordBot] No DISCORD_BOT_TOKEN set — bot not started');
    return;
  }

  let Client, GatewayIntentBits, Events;
  try {
    ({ Client, GatewayIntentBits, Events } = require('discord.js'));
  } catch {
    console.warn('[DiscordBot] discord.js not found — run: npm install discord.js');
    return;
  }

  const serverUrl = process.env.OPENCLAW_SERVER_URL || 'http://localhost:3001';
  const prefix = process.env.DISCORD_COMMAND_PREFIX || '!';

  // Pre-fetch a token at startup so it's ready
  try {
    await getToken(serverUrl);
  } catch (err) {
    console.warn('[DiscordBot] Initial token fetch failed:', err.message);
  }

  // Schedule token refresh every 20 hours
  setInterval(async () => {
    try {
      await getToken(serverUrl);
    } catch (err) {
      console.warn('[DiscordBot] Token refresh failed:', err.message);
    }
  }, 20 * 60 * 60 * 1000);

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
  });

  client.once(Events.ClientReady, (c) => {
    console.log(`[DiscordBot] ✅ Logged in as ${c.user.tag}`);
    global.__discordBotInfo = {
      connected: true,
      id: c.user.id,
      username: c.user.tag,
    };

    // Start morning briefing scheduler (8am MT)
    scheduleMorningBriefing(serverUrl);

    // Start weekly Sunday recap (9pm MT)
    scheduleWeeklyRecap(serverUrl);

    // Start proactive alert polling (every 5 min runs · every 6h stale leads)
    startAlertPolling(serverUrl);
  });

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    try {
      const wasCommand = await handleCommand(message, prefix, serverUrl);
      if (wasCommand) return;
    } catch (err) {
      console.error('[DiscordBot] Command error:', err.message);
      return;
    }

    // Plain message → main agent
    try {
      if (message.channel.sendTyping) message.channel.sendTyping().catch(() => {});

      const response = await chatWithAgent(message.author.id, message.content, serverUrl);

      const chunks = response.match(/[\s\S]{1,1900}/g) || [response];
      for (let i = 0; i < chunks.length; i++) {
        if (i === 0) {
          await message.reply({ content: chunks[i], allowedMentions: { repliedUser: false } });
        } else {
          await message.channel.send(chunks[i]);
        }
      }
    } catch (err) {
      console.error('[DiscordBot] Chat error:', err.message);
      await message.reply(`❌ Error: ${err.message}`).catch(() => {});
    }
  });

  client.on(Events.Error, (err) => {
    if (err.message?.includes('disallowed intents')) {
      console.error('[DiscordBot] ❌ Enable "Message Content Intent" at discord.com/developers/applications');
    } else {
      console.error('[DiscordBot] Client error:', err.message);
    }
  });

  // Auto-reconnect on disconnect
  client.on(Events.ShardDisconnect, (event) => {
    console.warn(`[DiscordBot] Disconnected (code ${event.code}) — reconnecting in 10s…`);
    global.__discordBotInfo = { connected: false, reconnecting: true };
    setTimeout(async () => {
      try {
        await client.login(botToken);
        console.log('[DiscordBot] Reconnected successfully.');
      } catch (err) {
        console.error('[DiscordBot] Reconnect failed:', err.message);
      }
    }, 10_000);
  });

  try {
    await client.login(botToken);
  } catch (err) {
    console.error('[DiscordBot] Login failed:', err.message);
    global.__discordBotInfo = { connected: false, error: err.message };
  }
}

module.exports = { startDiscordBot };
