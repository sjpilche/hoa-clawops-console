/**
 * @file idleTrainer.js
 * @description Idle Training System v2 — Two-layer architecture with QA gate.
 *
 * HOW IT WORKS:
 *   Layer 1 (Heartbeat Triage): decides WHAT to train, IF to train
 *     - Check gates (capacity, peak hours, daily cap, overdue work)
 *     - Priority: reflection > internal corpus > YouTube > maintenance > rest
 *   Layer 2 (Deep Training): executes the training via queue
 *     - Reflection: learn from brain episodes where agent failed
 *     - Internal corpus: learn from brain episodes where agent succeeded
 *     - YouTube: search + Ollama knowledge extraction (original flow)
 *     - Maintenance: prune stale skills, expire old queue items
 *   QA Gate: ALL skills go to skill_candidates first, never direct to agent_skills
 *     - Separate Ollama prompt grades candidates (neutral reviewer, not agent persona)
 *     - score >= 0.7 → promoted | score < 0.4 → rejected | middle → re-eval
 *
 * COST: $0 — YouTube (Piped/Invidious) + Ollama local inference
 * RAM: Yields to real work immediately. Respects peak hours + daily cap.
 */

'use strict';

const os = require('os');
const { get, run, all } = require('../db/connection');
const { chat } = require('./llmClient');

const OLLAMA_MODEL = process.env.OLLAMA_DEFAULT_MODEL || 'llama3.2:3b';

// ════════════════════════════════════════════════════════════════════════════
// SYSTEM CAPACITY + GATING
// ════════════════════════════════════════════════════════════════════════════

function getSystemCapacity() {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const ramPercent = Math.round(((totalMem - freeMem) / totalMem) * 100);

  let totalIdle = 0;
  let totalTick = 0;
  for (const cpu of cpus) {
    for (const type of Object.keys(cpu.times)) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  }
  const cpuPercent = Math.round(100 - (totalIdle / totalTick) * 100);

  const runningAgents = get("SELECT COUNT(*) AS c FROM agents WHERE status = 'running'")?.c || 0;
  const activeRuns = get("SELECT COUNT(*) AS c FROM runs WHERE status = 'running'")?.c || 0;

  return {
    cpuPercent,
    ramPercent,
    freeMemMB: Math.round(freeMem / 1024 / 1024),
    runningAgents,
    activeRuns,
    hasCapacity: cpuPercent < 60 && ramPercent < 95 && runningAgents === 0 && activeRuns === 0,
  };
}

/**
 * Full gating check — goes beyond capacity to include business rules.
 * @returns {{ allowed: boolean, reason?: string, capacity: object }}
 */
function checkTrainingGates() {
  // 1. System capacity
  const capacity = getSystemCapacity();
  if (!capacity.hasCapacity) {
    return { allowed: false, reason: `System busy — CPU: ${capacity.cpuPercent}%, RAM: ${capacity.ramPercent}%, running: ${capacity.runningAgents}, active: ${capacity.activeRuns}`, capacity };
  }

  // 2. No actively running work (stale 'pending' runs are not real work — they're old unconfirmed)
  const runningRuns = get("SELECT COUNT(*) AS c FROM runs WHERE status = 'running'")?.c || 0;
  if (runningRuns > 0) {
    return { allowed: false, reason: `${runningRuns} runs actively executing — yielding to real work`, capacity };
  }

  // 3. Overdue follow-ups check (don't train while leads are waiting)
  try {
    const overdue = get("SELECT COUNT(*) AS c FROM cfo_leads WHERE cadence_active=1 AND next_touch_due < datetime('now')")?.c || 0;
    if (overdue > 5) {
      return { allowed: false, reason: `${overdue} overdue follow-ups — pipeline work takes priority`, capacity };
    }
  } catch { /* cadence columns may not exist yet */ }

  // 4. Daily training cap (10 sessions/day)
  const today = new Date().toISOString().slice(0, 10);
  const sessionsToday = get("SELECT COUNT(*) AS c FROM training_sessions WHERE DATE(created_at) = ?", [today])?.c || 0;
  if (sessionsToday >= 10) {
    return { allowed: false, reason: `Daily training cap reached (${sessionsToday}/10)`, capacity };
  }

  // 5. Peak hours — no training 8 AM to 6 PM (agents should be available for real work)
  const hour = new Date().getHours();
  if (hour >= 8 && hour < 18) {
    return { allowed: false, reason: `Peak hours (${hour}:00) — training window is 6PM-8AM`, capacity };
  }

  return { allowed: true, capacity };
}

// ════════════════════════════════════════════════════════════════════════════
// AGENT SELECTION
// ════════════════════════════════════════════════════════════════════════════

function pickTrainee() {
  return get(`
    SELECT a.id, a.name, a.description, a.config,
           COALESCE(sk.skill_count, 0) AS skill_count,
           ts.last_trained_at
    FROM agents a
    LEFT JOIN (
      SELECT agent_id, COUNT(*) AS skill_count FROM agent_skills GROUP BY agent_id
    ) sk ON sk.agent_id = a.id
    LEFT JOIN (
      SELECT agent_id, MAX(created_at) AS last_trained_at FROM training_sessions GROUP BY agent_id
    ) ts ON ts.agent_id = a.id
    WHERE a.status = 'idle'
      AND (ts.last_trained_at IS NULL OR ts.last_trained_at < datetime('now', '-4 hours'))
      AND EXISTS (SELECT 1 FROM schedules s WHERE s.agent_id = a.id AND s.enabled = 1)
    ORDER BY
      COALESCE(sk.skill_count, 0) ASC,
      ts.last_trained_at ASC NULLS FIRST
    LIMIT 1
  `);
}

// ════════════════════════════════════════════════════════════════════════════
// TRAINING QUEUE + HEARTBEAT TRIAGE
// ════════════════════════════════════════════════════════════════════════════

// Activity weights per agent group — controls mix of training types
const ACTIVITY_WEIGHTS = {
  'jake-marketing':  { reflection: 0.3, internal_corpus: 0.3, youtube: 0.3, maintenance: 0.1 },
  'hoa-marketing':   { reflection: 0.25, internal_corpus: 0.35, youtube: 0.3, maintenance: 0.1 },
  'hoa-pipeline':    { reflection: 0.2, internal_corpus: 0.4, youtube: 0.2, maintenance: 0.2 },
  'jake-pipeline':   { reflection: 0.25, internal_corpus: 0.35, youtube: 0.2, maintenance: 0.2 },
  'core':            { reflection: 0.4, internal_corpus: 0.4, youtube: 0.1, maintenance: 0.1 },
  'mgmt-research':   { reflection: 0.2, internal_corpus: 0.3, youtube: 0.3, maintenance: 0.2 },
  'default':         { reflection: 0.25, internal_corpus: 0.25, youtube: 0.35, maintenance: 0.15 },
};

/**
 * Determine the best activity type for an agent based on available material.
 * Priority: reflection > internal corpus > YouTube > maintenance > rest
 */
function triageAgent(agent) {
  const config = agent.config ? JSON.parse(agent.config) : {};
  const group = config.group || 'default';
  const reflector = require('./trainingReflector');

  // Determine source_agent for internal corpus queries
  const sourceAgent = agent.name.includes('jake') ? 'jake' : agent.name.includes('cfo') ? 'cfo' : null;

  // 1. Check reflection material (failures)
  const reflectionCheck = reflector.hasReflectionMaterial(agent.name, agent.id);
  if (reflectionCheck.available) {
    return {
      activity_type: 'reflection',
      priority: 9,
      topic: `Reflect on ${reflectionCheck.episodes} failed episodes, ${reflectionCheck.runs} failed runs`,
      source_type: 'brain_episode',
      source_ref: JSON.stringify({ episodes: reflectionCheck.episodes, runs: reflectionCheck.runs, feedback: reflectionCheck.feedback }),
    };
  }

  // 2. Check internal corpus material (successes)
  const corpusCheck = reflector.hasInternalCorpusMaterial(agent.name, sourceAgent);
  if (corpusCheck.available) {
    return {
      activity_type: 'internal_corpus',
      priority: 7,
      topic: `Study ${corpusCheck.episodes} successful episodes, ${corpusCheck.outreach} winning emails`,
      source_type: 'brain_kb',
      source_ref: JSON.stringify({ episodes: corpusCheck.episodes, outreach: corpusCheck.outreach, content: corpusCheck.content }),
    };
  }

  // 3. Check for stale skills needing maintenance
  const staleSkills = get(
    "SELECT COUNT(*) AS c FROM agent_skills WHERE agent_id = ? AND skill_level < 3 AND last_trained < datetime('now', '-30 days')",
    [agent.id]
  )?.c || 0;
  if (staleSkills > 0) {
    return {
      activity_type: 'maintenance',
      priority: 4,
      topic: `Prune ${staleSkills} stale low-level skills`,
      source_type: 'maintenance_task',
      source_ref: JSON.stringify({ stale_count: staleSkills }),
    };
  }

  // 4. Rest/no-op checks — "sometimes the best training decision is don't train"
  const skillCount = get("SELECT COUNT(*) AS c FROM agent_skills WHERE agent_id = ?", [agent.id])?.c || 0;

  // 4a. Learning saturation: 6+ skills and no reflection/corpus material → rest
  if (skillCount >= 6) {
    console.log(`[IdleTrainer] Rest: ${agent.name} has ${skillCount} skills, no reflection/corpus material — saturated`);
    return { activity_type: 'rest', priority: 0, topic: `Rest — ${skillCount} skills, learning saturated`, source_type: null, source_ref: null };
  }

  // 4b. Curriculum exhaustion: all topics trained in last 30 days → rest
  const agentConfig = agent.config ? JSON.parse(agent.config) : {};
  const agentGroup = agentConfig.group || 'default';
  let pool = CURRICULUM.default;
  for (const [key, topics] of Object.entries(CURRICULUM)) {
    if (agentGroup.includes(key) || agent.name.includes(key.split('-')[0])) { pool = topics; break; }
  }
  const recentTopics = all(
    "SELECT DISTINCT topic FROM training_sessions WHERE agent_id = ? AND created_at > datetime('now', '-30 days')",
    [agent.id]
  ).map(r => r.topic);
  const untrained = pool.filter(t => !recentTopics.includes(t));
  if (untrained.length === 0) {
    console.log(`[IdleTrainer] Rest: ${agent.name} exhausted all ${pool.length} curriculum topics in last 30 days`);
    return { activity_type: 'rest', priority: 0, topic: 'Rest — curriculum exhausted', source_type: null, source_ref: null };
  }

  // 4c. Anti-overtraining: 20% random rest chance to prevent training ADHD
  if (Math.random() < 0.2) {
    console.log(`[IdleTrainer] Rest: ${agent.name} — random cooldown (20% chance)`);
    return { activity_type: 'rest', priority: 0, topic: 'Rest — random cooldown', source_type: null, source_ref: null };
  }

  // 5. Fall through to YouTube training
  const topic = getTrainingTopic(agent);
  return {
    activity_type: 'youtube',
    priority: 3,
    topic,
    source_type: 'youtube',
    source_ref: null,
  };
}

/**
 * Populate training queue for all eligible agents.
 * Called at the start of each training cycle.
 */
function populateTrainingQueue() {
  // Expire old queue items (24h TTL)
  run("UPDATE training_queue SET status = 'expired' WHERE status = 'pending' AND created_at < datetime('now', '-24 hours')");

  // Find eligible agents
  const agents = all(`
    SELECT a.id, a.name, a.description, a.config
    FROM agents a
    LEFT JOIN (
      SELECT agent_id, MAX(created_at) AS last_trained_at FROM training_sessions GROUP BY agent_id
    ) ts ON ts.agent_id = a.id
    WHERE a.status = 'idle'
      AND (ts.last_trained_at IS NULL OR ts.last_trained_at < datetime('now', '-4 hours'))
      AND EXISTS (SELECT 1 FROM schedules s WHERE s.agent_id = a.id AND s.enabled = 1)
      AND NOT EXISTS (SELECT 1 FROM training_queue tq WHERE tq.agent_id = a.id AND tq.status = 'pending')
    ORDER BY ts.last_trained_at ASC NULLS FIRST
    LIMIT 10
  `);

  let queued = 0;
  for (const agent of agents) {
    const triage = triageAgent(agent);
    run(
      `INSERT INTO training_queue (agent_id, agent_name, activity_type, priority, topic, source_type, source_ref)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [agent.id, agent.name, triage.activity_type, triage.priority, triage.topic, triage.source_type, triage.source_ref]
    );
    queued++;
    console.log(`[IdleTrainer] Queued: ${agent.name} → ${triage.activity_type} (priority ${triage.priority})`);
  }

  return queued;
}

// ════════════════════════════════════════════════════════════════════════════
// CURRICULUM (unchanged from v1)
// ════════════════════════════════════════════════════════════════════════════

const CURRICULUM = {
  'jake-marketing': [
    'construction industry cold email techniques that actually work',
    'how CFOs evaluate new software vendors decision process',
    'B2B SaaS copywriting that converts construction companies',
    'ERP migration horror stories and how to sell the fix',
    'LinkedIn outreach strategies for construction executives',
    'construction company pain points with QuickBooks and spreadsheets',
    'how to write follow-up emails that don\'t sound desperate',
    'construction accounting automation trends 2026',
    'selling to small business owners psychology and tactics',
    'data cleanup services marketing and positioning',
  ],
  'hoa-marketing': [
    'HOA board member pain points and frustrations',
    'special assessment financing how HOAs fund big projects',
    'condominium reserve study basics for marketers',
    'how to market financial services to non-profit boards',
    'Florida condo safety laws and funding requirements',
    'HOA management company evaluation criteria',
    'community association financial planning best practices',
    'writing content that HOA board members actually read',
    'social media marketing for B2B community services',
    'property management industry digital transformation',
  ],
  'hoa-pipeline': [
    'web scraping best practices and anti-detection techniques',
    'contact enrichment strategies without paid tools',
    'Google Maps data extraction techniques',
    'email verification and deliverability optimization',
    'building prospect lists from public records',
    'phone number discovery from business websites',
    'LinkedIn profile scraping ethical approaches',
    'data quality improvement for sales pipelines',
  ],
  'jake-pipeline': [
    'construction company website patterns for scraping',
    'finding decision makers at general contractors',
    'permit data as a sales intelligence signal',
    'Indeed job postings as buying signals for automation tools',
    'construction industry hiring patterns and what they mean',
    'building a construction CRM from scratch',
    'email deliverability for cold outreach campaigns',
    'construction bid results as market intelligence',
  ],
  'core': [
    'AI agent orchestration patterns and best practices',
    'autonomous business systems that generate revenue',
    'micro-SaaS ideas validated by real internet signals',
    'how to build software products in a weekend',
    'indie hacker revenue strategies and pricing psychology',
    'automated market research using free APIs',
    'building autonomous sales pipelines with AI',
    'competitive intelligence gathering techniques',
  ],
  'mgmt-research': [
    'property management company evaluation techniques',
    'commercial real estate technology trends',
    'community association institute CAI research methods',
    'management company portfolio analysis approaches',
    'online review analysis for competitive intelligence',
    'property management industry consolidation trends',
  ],
  'default': [
    'productivity automation techniques for business',
    'AI tools that save small businesses money',
    'no-code automation workflows that actually work',
    'free tools for business intelligence gathering',
    'how successful startups find their first customers',
    'writing persuasive business communication',
    'time management and prioritization for AI systems',
    'building trust in automated business processes',
  ],
};

const QUIP_PROMPTS = {
  'jake': 'You are Jake, a salty construction CFO who just finished a training session. Write ONE short funny quip (under 100 chars) about what you learned. Be sarcastic but insightful. Construction humor.',
  'hoa': 'You are an HOA marketing specialist who just finished training. Write ONE short funny quip (under 100 chars). HOA board meeting humor.',
  'default': 'You are an AI agent who just finished training. Write ONE short funny quip (under 100 chars) about leveling up. Be witty.',
};

function getTrainingTopic(agent) {
  const config = agent.config ? JSON.parse(agent.config) : {};
  const group = config.group || 'default';

  let pool = CURRICULUM.default;
  for (const [key, topics] of Object.entries(CURRICULUM)) {
    if (group.includes(key) || agent.name.includes(key.split('-')[0])) {
      pool = topics;
      break;
    }
  }

  const recentTopics = all(
    "SELECT topic FROM training_sessions WHERE agent_id = ? ORDER BY created_at DESC LIMIT 5",
    [agent.id]
  ).map(r => r.topic);

  const available = pool.filter(t => !recentTopics.includes(t));
  return available.length > 0
    ? available[Math.floor(Math.random() * available.length)]
    : pool[Math.floor(Math.random() * pool.length)];
}

// ════════════════════════════════════════════════════════════════════════════
// YOUTUBE SEARCH (unchanged from v1)
// ════════════════════════════════════════════════════════════════════════════

async function searchYouTube(query) {
  const encoded = encodeURIComponent(query);

  try {
    const instances = [
      'https://pipedapi.kavin.rocks',
      'https://pipedapi.adminforge.de',
      'https://vid.puffyan.us',
      'https://invidious.fdn.fr',
      'https://invidious.nerdvpn.de',
    ];

    for (const instance of instances) {
      try {
        const isPiped = instance.includes('piped');
        const url = isPiped
          ? `${instance}/search?q=${encoded}&filter=videos`
          : `${instance}/api/v1/search?q=${encoded}&type=video&sort_by=relevance&page=1`;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);

        const res = await fetch(url, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json', 'User-Agent': 'ClawOps/1.0' },
        });
        clearTimeout(timer);

        if (!res.ok) continue;
        const data = await res.json();

        const items = isPiped ? (data.items || []) : (Array.isArray(data) ? data : []);
        const videos = items.filter(v => v.type === 'stream' || v.videoId || v.url);

        if (videos.length > 0) {
          const video = videos[0];
          const videoId = video.videoId || (video.url || '').replace('/watch?v=', '');
          return {
            url: `https://www.youtube.com/watch?v=${videoId}`,
            title: video.title || 'Unknown video',
            author: video.uploaderName || video.author || 'unknown',
            lengthSeconds: video.duration || video.lengthSeconds || 0,
            viewCount: video.views || video.viewCount || 0,
            description: (video.shortDescription || video.description || '').slice(0, 500),
          };
        }
      } catch { continue; }
    }
  } catch {}

  return {
    url: `https://www.youtube.com/results?search_query=${encoded}`,
    title: `YouTube search: ${query}`,
    author: null,
    lengthSeconds: 0,
    viewCount: 0,
    description: '',
  };
}

// ════════════════════════════════════════════════════════════════════════════
// OLLAMA HELPER
// ════════════════════════════════════════════════════════════════════════════

function ollamaChat(systemPrompt, userMessage, timeoutMs = 90000) {
  return chat(systemPrompt, userMessage, {
    model: OLLAMA_MODEL, provider: 'ollama', temperature: 0.7, maxTokens: 512, timeoutMs,
  });
}

// ════════════════════════════════════════════════════════════════════════════
// ACTIVITY HANDLERS — each produces a skill candidate
// ════════════════════════════════════════════════════════════════════════════

/**
 * Store a skill candidate (NOT directly in agent_skills — must pass QA first).
 */
function createSkillCandidate(agentId, agentName, skillName, summary, takeaways, sourceActivity, sourceRef, confidence) {
  run(
    `INSERT INTO skill_candidates (agent_id, agent_name, skill_name, summary, takeaways, source_activity, source_ref, confidence)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [agentId, agentName, skillName, summary, JSON.stringify(takeaways), sourceActivity, sourceRef || null, confidence]
  );
  console.log(`[IdleTrainer] Candidate created: ${agentName} → "${skillName}" (${sourceActivity}, confidence: ${confidence})`);
}

/**
 * Run reflection training — learn from failures.
 */
async function runReflection(agent, queueItem) {
  const reflector = require('./trainingReflector');

  const episodes = reflector.getFailedEpisodes(agent.name, 5);
  const failedRuns = reflector.getFailedRuns(agent.id, 5);
  const feedback = reflector.getNegativeFeedback(agent.name, 5);

  if (episodes.length === 0 && failedRuns.length === 0 && feedback.length === 0) {
    return { summary: 'No failure material found', skillName: null };
  }

  const result = await reflector.generateReflection(agent, { episodes, runs: failedRuns, feedback });

  if (result.skill_name) {
    createSkillCandidate(
      agent.id, agent.name, result.skill_name, result.summary,
      result.takeaways, 'reflection',
      JSON.stringify({ episode_count: episodes.length, run_count: failedRuns.length, feedback_count: feedback.length }),
      result.confidence
    );
  }

  return { summary: result.summary, skillName: result.skill_name, takeaways: result.takeaways };
}

/**
 * Run internal corpus training — learn from successes.
 */
async function runInternalCorpus(agent, queueItem) {
  const reflector = require('./trainingReflector');
  const sourceAgent = agent.name.includes('jake') ? 'jake' : agent.name.includes('cfo') ? 'cfo' : null;

  const episodes = reflector.getSuccessfulEpisodes(agent.name, 5);
  const outreach = sourceAgent ? reflector.getWinningOutreach(sourceAgent, 5) : [];
  const content = sourceAgent ? reflector.getWinningContent(sourceAgent, 5) : [];

  const result = await reflector.generateInternalCorpusLesson(agent, { episodes, outreach, content });

  if (!result) {
    return { summary: 'No internal corpus material found', skillName: null };
  }

  if (result.skill_name) {
    createSkillCandidate(
      agent.id, agent.name, result.skill_name, result.summary,
      result.takeaways, 'internal_corpus',
      JSON.stringify({ episode_count: episodes.length, outreach_count: outreach.length, content_count: content.length }),
      result.confidence
    );
  }

  return { summary: result.summary, skillName: result.skill_name, takeaways: result.takeaways };
}

/**
 * Run YouTube training — original flow, but results go to candidates.
 */
async function runYouTubeTraining(agent, topic) {
  const video = await searchYouTube(topic);
  console.log(`[IdleTrainer] YouTube: "${video.title}" by ${video.author || 'unknown'}`);

  let summary, takeaways, skillName;
  try {
    const learnPrompt = `You are ${agent.name}, an AI agent specializing in: ${agent.description || 'business automation'}.
You just studied this topic: "${topic}"
Video found: "${video.title}" by ${video.author || 'unknown creator'}
Video description: ${video.description || 'N/A'}

Based on this topic and video, generate a training report. Return ONLY valid JSON:
{
  "summary": "2-3 sentence summary of what you learned and how it applies to your role",
  "takeaways": ["takeaway 1", "takeaway 2", "takeaway 3"],
  "skill_name": "short_snake_case_skill_name",
  "confidence": 0.6
}`;

    const raw = await ollamaChat('You are a training report generator. Return only valid JSON.', learnPrompt);

    let cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
    const brace = cleaned.indexOf('{');
    if (brace > 0) cleaned = cleaned.slice(brace);

    let data;
    try { data = JSON.parse(cleaned); } catch {
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (m) try { data = JSON.parse(m[0]); } catch {}
    }

    if (data) {
      summary = data.summary || `Studied ${topic}`;
      takeaways = data.takeaways || [topic];
      skillName = (data.skill_name || topic.split(' ').slice(0, 3).join('_')).toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 50);
    } else {
      summary = `Studied "${topic}" via "${video.title}". Knowledge extracted but format was unstructured.`;
      takeaways = [topic];
      skillName = topic.split(' ').slice(0, 3).join('_').toLowerCase().replace(/[^a-z0-9_]/g, '_');
    }
  } catch (err) {
    console.error(`[IdleTrainer] Ollama failed for ${agent.name}:`, err.message);
    summary = `Attempted to study "${topic}" but Ollama was unavailable.`;
    takeaways = [];
    skillName = null;
  }

  // Store as candidate (NOT directly in agent_skills)
  if (skillName) {
    createSkillCandidate(
      agent.id, agent.name, skillName, summary,
      takeaways, 'youtube',
      JSON.stringify({ video_url: video.url, video_title: video.title }),
      0.6
    );
  }

  return { summary, skillName, takeaways, video };
}

/**
 * Run maintenance — prune stale skills, expire old queue items.
 */
function runMaintenance(agent) {
  const actions = [];

  // 1. Prune skills below level 2 that haven't been trained in 60 days
  const pruned = all(
    "SELECT id, skill_name, skill_level FROM agent_skills WHERE agent_id = ? AND skill_level < 2 AND last_trained < datetime('now', '-60 days')",
    [agent.id]
  );
  for (const skill of pruned) {
    run('DELETE FROM agent_skills WHERE id = ?', [skill.id]);
    console.log(`[IdleTrainer] Pruned stale skill: ${agent.name} → "${skill.skill_name}" (level ${skill.skill_level})`);
  }
  if (pruned.length > 0) actions.push(`pruned ${pruned.length} stale skills`);

  // 2. Merge duplicate skills — keep highest level, delete others
  const skills = all("SELECT id, skill_name, skill_level FROM agent_skills WHERE agent_id = ? ORDER BY skill_name", [agent.id]);
  let merged = 0;
  const seen = new Map(); // prefix → { id, skill_name, skill_level }
  for (const skill of skills) {
    // Normalize: strip trailing _v1/_v2, numbers, and compare first 3 tokens
    const prefix = skill.skill_name.replace(/_v\d+$/, '').replace(/_\d+$/, '').split('_').slice(0, 3).join('_');
    const existing = seen.get(prefix);
    if (existing) {
      // Keep the higher-level one
      const [keep, remove] = skill.skill_level > existing.skill_level
        ? [skill, existing] : [existing, skill];
      run('DELETE FROM agent_skills WHERE id = ?', [remove.id]);
      console.log(`[IdleTrainer] Merged duplicate: "${remove.skill_name}" (lv${remove.skill_level}) into "${keep.skill_name}" (lv${keep.skill_level})`);
      seen.set(prefix, keep);
      merged++;
    } else {
      seen.set(prefix, skill);
    }
  }
  if (merged > 0) actions.push(`merged ${merged} duplicate skills`);

  // 3. Clean orphaned candidates — ungraded for 14+ days
  const orphaned = get(
    "SELECT COUNT(*) AS c FROM skill_candidates WHERE status = 'candidate' AND qa_verdict IS NULL AND created_at < datetime('now', '-14 days')"
  )?.c || 0;
  if (orphaned > 0) {
    run("DELETE FROM skill_candidates WHERE status = 'candidate' AND qa_verdict IS NULL AND created_at < datetime('now', '-14 days')");
    console.log(`[IdleTrainer] Cleaned ${orphaned} orphaned candidates (ungraded 14+ days)`);
    actions.push(`cleaned ${orphaned} orphaned candidates`);
  }

  // 4. Flag unused promoted skills (informational — no delete)
  const unused = all(
    `SELECT as2.skill_name FROM agent_skills as2
     WHERE as2.agent_id = ? AND as2.promoted_from IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM runs r WHERE r.agent_id = as2.agent_id AND r.status = 'completed' AND r.created_at > datetime('now', '-14 days')
       )`,
    [agent.id]
  );
  if (unused.length > 0) {
    console.log(`[IdleTrainer] Unused promoted skills for ${agent.name}: ${unused.map(u => u.skill_name).join(', ')} (agent inactive 14+ days)`);
    actions.push(`flagged ${unused.length} unused promoted skills`);
  }

  // 5. Clean up expired/failed queue items older than 7 days
  run("DELETE FROM training_queue WHERE status IN ('expired', 'failed') AND created_at < datetime('now', '-7 days')");

  const summary = actions.length > 0
    ? `Maintenance: ${actions.join(', ')}`
    : 'Maintenance: nothing to clean up';
  return { summary, skillName: null };
}

// ════════════════════════════════════════════════════════════════════════════
// CORE TRAINING SESSION (v2)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Run a single training session from the queue.
 * @param {string|null} specificAgentId - Force a specific agent
 * @returns {object} Training result
 */
async function runTrainingSession(specificAgentId = null) {
  const startTime = Date.now();

  // 1. Check all gates
  const gates = checkTrainingGates();
  if (!gates.allowed) {
    return { skipped: true, reason: gates.reason };
  }

  // 2. Pick agent — from queue or direct
  let agent, queueItem = null;

  if (specificAgentId) {
    agent = get('SELECT * FROM agents WHERE id = ?', [specificAgentId]);
  } else {
    // Pull from queue (highest priority first)
    queueItem = get("SELECT * FROM training_queue WHERE status = 'pending' ORDER BY priority DESC, created_at ASC LIMIT 1");
    if (queueItem) {
      agent = get('SELECT * FROM agents WHERE id = ?', [queueItem.agent_id]);
      run("UPDATE training_queue SET status = 'claimed', claimed_at = datetime('now') WHERE id = ?", [queueItem.id]);
    } else {
      agent = pickTrainee();
    }
  }

  if (!agent) {
    return { skipped: true, reason: 'No eligible agents for training (all trained recently or queue empty)' };
  }

  // Determine activity type
  const activityType = queueItem ? queueItem.activity_type : triageAgent(agent).activity_type;
  const topic = queueItem ? queueItem.topic : triageAgent(agent).topic;

  console.log(`[IdleTrainer] Training ${agent.name} — activity: ${activityType} — CPU: ${gates.capacity.cpuPercent}%, RAM: ${gates.capacity.ramPercent}%`);

  // 3. Re-check capacity before Ollama call (real work may have started)
  const recheck = getSystemCapacity();
  if (!recheck.hasCapacity) {
    if (queueItem) run("UPDATE training_queue SET status = 'pending', claimed_at = NULL WHERE id = ?", [queueItem.id]);
    return { skipped: true, reason: 'Capacity changed mid-training — yielding to real work' };
  }

  // 4. Handle rest/no-op — skip Ollama entirely
  if (activityType === 'rest') {
    console.log(`[IdleTrainer] ${agent.name} resting — ${topic}`);
    if (queueItem) run("UPDATE training_queue SET status = 'completed', completed_at = datetime('now') WHERE id = ?", [queueItem.id]);
    return { skipped: false, agent: agent.name, activityType: 'rest', topic, skillName: null, quip: 'Taking a breather — even AI needs downtime.', durationMs: Date.now() - startTime, capacity: { cpu: gates.capacity.cpuPercent, ram: gates.capacity.ramPercent } };
  }

  // 5. Execute activity
  let result;
  try {
    switch (activityType) {
      case 'reflection':
        result = await runReflection(agent, queueItem);
        break;
      case 'internal_corpus':
        result = await runInternalCorpus(agent, queueItem);
        break;
      case 'maintenance':
        result = runMaintenance(agent);
        break;
      case 'youtube':
      default:
        result = await runYouTubeTraining(agent, topic);
        break;
    }
  } catch (err) {
    console.error(`[IdleTrainer] Activity ${activityType} failed for ${agent.name}:`, err.message);
    if (queueItem) run("UPDATE training_queue SET status = 'failed' WHERE id = ?", [queueItem.id]);
    result = { summary: `${activityType} failed: ${err.message}`, skillName: null };
  }

  // 5. Generate funny quip
  let quip;
  try {
    const quipType = agent.name.includes('jake') ? 'jake' : agent.name.includes('hoa') ? 'hoa' : 'default';
    const quipSystem = QUIP_PROMPTS[quipType];
    const activityLabel = { reflection: 'reviewing past mistakes', internal_corpus: 'studying winning plays', youtube: 'watching videos', maintenance: 'cleaning house' }[activityType] || 'training';
    quip = await ollamaChat(quipSystem, `I just finished ${activityLabel}. Topic: "${topic}". Write ONE quip under 100 chars.`);
    quip = quip.replace(/^["']|["']$/g, '').trim().slice(0, 150);
  } catch {
    quip = `Just leveled up on ${(topic || 'something useful').split(' ').slice(0, 4).join(' ')}... watch out.`;
  }

  const durationMs = Date.now() - startTime;

  // 6. Store training session
  run(`
    INSERT INTO training_sessions (agent_id, agent_name, topic, source_type, source_url, source_title, summary, key_takeaways, skill_gained, confidence, cpu_percent, ram_percent, quip, duration_ms, activity_type, queue_item_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    agent.id, agent.name, topic,
    activityType === 'youtube' ? 'youtube' : activityType,
    result.video?.url || null, result.video?.title || null,
    result.summary, JSON.stringify(result.takeaways || []), result.skillName, 0.6,
    gates.capacity.cpuPercent, gates.capacity.ramPercent, quip, durationMs,
    activityType, queueItem?.id || null,
  ]);

  // 7. Mark queue item completed
  if (queueItem) {
    run("UPDATE training_queue SET status = 'completed', completed_at = datetime('now') WHERE id = ?", [queueItem.id]);
  }

  // 8. Discord notification
  const activityEmoji = { reflection: '\ud83d\udcad', internal_corpus: '\ud83c\udfc6', youtube: '\ud83c\udfac', maintenance: '\ud83e\uddf9', rest: '\ud83d\ude34' }[activityType] || '\ud83c\udf93';
  const activityColor = { reflection: 0xe67e22, internal_corpus: 0x2ecc71, youtube: 0x9b59b6, maintenance: 0x95a5a6, rest: 0x7f8c8d }[activityType] || 0x9b59b6;

  try {
    const discord = require('./discordNotifier');
    await discord.postWebhook({
      embeds: [{
        title: `${activityEmoji} ${agent.name} — ${activityType.replace('_', ' ')} Training`,
        color: activityColor,
        fields: [
          { name: '\ud83d\udcda Topic', value: (topic || 'N/A').slice(0, 200), inline: false },
          { name: '\ud83d\udca1 Learned', value: (result.summary || 'N/A').slice(0, 200), inline: false },
          { name: '\ud83c\udfaf Skill Candidate', value: result.skillName ? `${result.skillName} (pending QA)` : 'No skill generated', inline: true },
          { name: '\u23f1\ufe0f Duration', value: `${(durationMs / 1000).toFixed(1)}s`, inline: true },
        ],
        footer: { text: quip },
        timestamp: new Date().toISOString(),
      }],
    });
  } catch { /* Discord optional */ }

  console.log(`[IdleTrainer] ${agent.name} completed ${activityType} training in ${(durationMs / 1000).toFixed(1)}s — "${quip}"`);

  return {
    skipped: false,
    agent: agent.name,
    activityType,
    topic,
    video: result.video || null,
    summary: result.summary,
    takeaways: result.takeaways || [],
    skillName: result.skillName,
    quip,
    durationMs,
    capacity: { cpu: gates.capacity.cpuPercent, ram: gates.capacity.ramPercent },
  };
}

// ════════════════════════════════════════════════════════════════════════════
// BATCH TRAINING CYCLE (v2)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Full training cycle: populate queue → train from queue → QA grade → promote.
 * @param {number} maxAgents - Max agents to train this cycle
 * @returns {object} Cycle summary
 */
async function runTrainingCycle(maxAgents = 3) {
  console.log('[IdleTrainer] === Starting Training Cycle v2 ===');

  // Phase 0: Record post-training benchmarks for previously promoted skills (7+ days old)
  try {
    const benchmark = require('./trainingBenchmark');
    const postResult = benchmark.recordPostTrainingBenchmarks();
    if (postResult.recorded > 0) {
      console.log(`[IdleTrainer] Benchmarks: ${postResult.recorded} post-training recorded (${postResult.improved} improved, ${postResult.regressed} regressed)`);
    }
  } catch (err) {
    console.error('[IdleTrainer] Post-training benchmarks failed:', err.message);
  }

  // Phase 1: Populate queue
  const queued = populateTrainingQueue();
  console.log(`[IdleTrainer] Queue populated: ${queued} items`);

  // Phase 2: Train from queue
  const results = [];
  for (let i = 0; i < maxAgents; i++) {
    const result = await runTrainingSession();
    results.push(result);
    if (result.skipped) break;
    await new Promise(r => setTimeout(r, 2000)); // Cooldown between agents
  }

  const trained = results.filter(r => !r.skipped);
  const skipped = results.filter(r => r.skipped);

  // Phase 3: Record pre-training benchmarks BEFORE QA promotion
  try {
    const benchmark = require('./trainingBenchmark');
    const preRecorded = benchmark.recordPreTrainingBenchmarks();
    if (preRecorded > 0) {
      console.log(`[IdleTrainer] Benchmarks: ${preRecorded} pre-training snapshots recorded`);
    }
  } catch (err) {
    console.error('[IdleTrainer] Pre-training benchmarks failed:', err.message);
  }

  // Phase 4: QA grading + promotion
  let qaResult = { graded: 0, promoted: 0, rejected: 0, skipped: 0 };
  try {
    const qa = require('./trainingQA');
    qaResult = await qa.runQACycle(10);
    console.log(`[IdleTrainer] QA: ${qaResult.graded} graded, ${qaResult.promoted} promoted, ${qaResult.rejected} rejected`);
  } catch (err) {
    console.error('[IdleTrainer] QA cycle failed:', err.message);
  }

  const summaryLines = [
    `Idle Training v2: ${trained.length} trained, ${skipped.length} skipped, ${queued} queued`,
    `  QA Gate: ${qaResult.graded} graded → ${qaResult.promoted} promoted, ${qaResult.rejected} rejected`,
    ...trained.map(r => `  ${r.activityType === 'reflection' ? '\ud83d\udcad' : r.activityType === 'internal_corpus' ? '\ud83c\udfc6' : r.activityType === 'maintenance' ? '\ud83e\uddf9' : '\ud83c\udfac'} ${r.agent}: "${r.skillName || 'no skill'}" (${r.activityType}) — ${r.quip}`),
    ...skipped.map(r => `  \u23ed\ufe0f Skipped: ${r.reason}`),
  ];

  return {
    summary: summaryLines.join('\n'),
    trained: trained.length,
    skipped: skipped.length,
    queued,
    qa: qaResult,
    results,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// STATS (enhanced for v2)
// ════════════════════════════════════════════════════════════════════════════

function getTrainingStats() {
  const totalSessions = get('SELECT COUNT(*) AS c FROM training_sessions')?.c || 0;
  const totalSkills = get('SELECT COUNT(*) AS c FROM agent_skills')?.c || 0;
  const uniqueAgents = get('SELECT COUNT(DISTINCT agent_id) AS c FROM training_sessions')?.c || 0;
  const maxLevel = get('SELECT MAX(skill_level) AS m FROM agent_skills')?.m || 0;
  const recentQuip = get('SELECT quip, agent_name FROM training_sessions ORDER BY created_at DESC LIMIT 1');
  const topSkilled = all(`
    SELECT agent_name, COUNT(*) AS skills, SUM(skill_level) AS total_levels
    FROM agent_skills GROUP BY agent_id ORDER BY total_levels DESC LIMIT 5
  `);

  // v2 additions
  let candidates = { total: 0, pending: 0, approved: 0, rejected: 0 };
  try {
    const qa = require('./trainingQA');
    candidates = qa.getCandidateStats();
  } catch { /* migration may not have run yet */ }

  const byActivity = all(`
    SELECT activity_type, COUNT(*) AS count FROM training_sessions
    WHERE activity_type IS NOT NULL GROUP BY activity_type ORDER BY count DESC
  `);

  const queueDepth = get("SELECT COUNT(*) AS c FROM training_queue WHERE status = 'pending'")?.c || 0;

  return {
    totalSessions,
    totalSkills,
    uniqueAgents,
    maxLevel,
    recentQuip: recentQuip ? `${recentQuip.agent_name}: "${recentQuip.quip}"` : null,
    topSkilled,
    candidates,
    byActivity,
    queueDepth,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════════════════════

module.exports = {
  getSystemCapacity,
  checkTrainingGates,
  pickTrainee,
  searchYouTube,
  populateTrainingQueue,
  triageAgent,
  runTrainingSession,
  runTrainingCycle,
  getTrainingStats,
  CURRICULUM,
  ACTIVITY_WEIGHTS,
};
