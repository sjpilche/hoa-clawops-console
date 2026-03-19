/**
 * @file toddChat.js
 * @description Todd (Chief of Staff) chat service — LLM-powered with real system context.
 *
 * Replaces the broken OpenClaw CLI bridge for chat. Todd now:
 *   1. Gets his SOUL.md as system prompt
 *   2. Gets injected with real-time system state (runs, costs, leads, agent health, blockers)
 *   3. Gets collective brain context (learned patterns, feedback signals)
 *   4. Gets conversation history for multi-turn context
 *   5. Runs on Ollama ($0/message) via llmClient
 *
 * COST: $0 (Ollama local inference)
 */

const fs = require('fs');
const path = require('path');
const { chatMessages } = require('./llmClient');
const { all, get } = require('../db/connection');

// ════════════════════════════════════════════════════════════════════════════
// SOUL — Todd's system prompt (loaded once, cached)
// ════════════════════════════════════════════════════════════════════════════

let _soulCache = null;

function getToddSoul() {
  if (_soulCache) return _soulCache;
  try {
    const soulPath = path.resolve(__dirname, '../../openclaw-skills/todd/SOUL.md');
    _soulCache = fs.readFileSync(soulPath, 'utf-8');
  } catch {
    _soulCache = FALLBACK_SOUL;
  }
  return _soulCache;
}

// ════════════════════════════════════════════════════════════════════════════
// SYSTEM CONTEXT — real-time data injected into every Todd response
// ════════════════════════════════════════════════════════════════════════════

function gatherSystemContext() {
  const sections = [];
  sections.push(`TIME: ${new Date().toISOString()}`);

  try {
    // Compact run summary (last 24h) — just counts
    const summary = get(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as ok,
             SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as fail,
             SUM(CASE WHEN status='running' THEN 1 ELSE 0 END) as active,
             COALESCE(SUM(cost_usd), 0) as cost
      FROM runs WHERE created_at > datetime('now', '-24 hours')
    `);
    if (summary) {
      sections.push(`RUNS 24H: ${summary.total} total, ${summary.ok} ok, ${summary.fail} failed, ${summary.active} running, $${summary.cost.toFixed(2)}`);
    }

    // Top 3 failures only
    if (summary && summary.fail > 0) {
      const failures = all(`
        SELECT COALESCE(a.name, r.agent_id) as n, r.created_at as t
        FROM runs r LEFT JOIN agents a ON r.agent_id = a.id
        WHERE r.status='failed' AND r.created_at > datetime('now', '-24 hours')
        ORDER BY r.created_at DESC LIMIT 3
      `);
      sections.push('FAILED: ' + failures.map(f => f.n).join(', '));
    }
  } catch {}

  try {
    const hoa = get('SELECT COUNT(*) as c FROM hoa_communities') || { c: 0 };
    const cfo = get('SELECT COUNT(*) as c FROM cfo_leads') || { c: 0 };
    sections.push(`LEADS: ${hoa.c} HOA | ${cfo.c} CFO`);
  } catch {}

  try {
    const todayCost = get("SELECT COALESCE(SUM(cost_usd), 0) as c FROM runs WHERE created_at > date('now')") || { c: 0 };
    sections.push(`COST TODAY: $${todayCost.c.toFixed(2)}`);
  } catch {}

  try {
    const pendingOutreach = get("SELECT COUNT(*) as c FROM cfo_outreach_sequences WHERE status = 'draft'") || { c: 0 };
    if (pendingOutreach.c > 0) sections.push(`OUTREACH PENDING: ${pendingOutreach.c} drafts need approval`);
  } catch {}

  try {
    const sched = get("SELECT COUNT(*) as c FROM schedules WHERE enabled = 1") || { c: 0 };
    sections.push(`SCHEDULES: ${sched.c} active`);
  } catch {}

  return sections.join('\n');
}

// ════════════════════════════════════════════════════════════════════════════
// COLLECTIVE BRAIN CONTEXT — injected when available
// ════════════════════════════════════════════════════════════════════════════

async function getBrainContext() {
  try {
    const { buildAgentContext } = require('./collectiveBrain');
    return await buildAgentContext('todd', 'chat-session', {});
  } catch {
    return '';
  }
}

// ════════════════════════════════════════════════════════════════════════════
// TODD CHAT — main entry point
// ════════════════════════════════════════════════════════════════════════════

/**
 * Get a Todd response for a chat message.
 * @param {string} message - User's message
 * @param {Array} conversationHistory - Previous messages [{role, content}]
 * @returns {Promise<string>} - Todd's response
 */
async function getToddResponse(message, conversationHistory = []) {
  const systemContext = gatherSystemContext();

  // Compact system prompt — must fit in 8b model's working memory
  const systemPrompt = `You are Todd, Steve's Chief of Staff at ClawOps (AI automation business).

RULES: Be direct. Bullets only. Use the data below. Have opinions. Suggest actions. Challenge bad priorities. Never approve spending/emails without Steve's OK.

IMPORTANT: Steve cusses. A lot. This is normal. NEVER comment on language, flag profanity, lecture about tone, or refuse to engage. Just answer the damn question. Match his energy — be real, be blunt, skip the corporate filter.

Always end with: NEXT ACTION: [specific thing Steve should do now]

${systemContext}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.slice(-10),
    { role: 'user', content: message },
  ];

  const raw = await chatMessages(messages, {
    model: process.env.TODD_MODEL || 'qwen3:14b',
    provider: process.env.TODD_PROVIDER || 'ollama',
    temperature: 0.7,
    maxTokens: 1024,
    timeoutMs: 180000,
  });

  // Strip <think>...</think> tags from reasoning models (qwen3, deepseek-r1)
  return raw.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();
}

// ════════════════════════════════════════════════════════════════════════════
// FALLBACK SOUL (if SOUL.md not found)
// ════════════════════════════════════════════════════════════════════════════

const FALLBACK_SOUL = `# Todd — Chief of Staff
I am Todd, Chief of Staff for ClawOps. I route work, monitor pipeline health, surface blockers,
and keep the agent fleet honest. I communicate in bullets, not paragraphs. I am calm when the
pipeline is broken and decisive when it matters.

My mission: Keep Steve's business moving forward every day by routing the right work to the
right agent, surfacing blockers before they cost money, and making sure nothing falls through
the cracks. Revenue-first: every recommendation should answer "how does this make money?"`;

module.exports = {
  getToddResponse,
  gatherSystemContext,
};
