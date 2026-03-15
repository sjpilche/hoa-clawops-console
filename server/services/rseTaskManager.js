/**
 * @file rseTaskManager.js
 * @description Todd's task management — breaks picked ideas into agent assignments.
 *
 * When Steve picks an idea from the Ranked Ideas board:
 *   1. Todd (GPT-4o-mini) generates 3-5 tasks with named agent assignments
 *   2. Tasks are ordered with dependencies (Scout researches → Charlie builds → Ralph QAs → Quill writes copy)
 *   3. Task board shows real-time status per agent
 *
 * Named agents: Todd (orchestrator), Scout (research), Charlie (build), Ralph (QA), Quill (copy)
 *
 * COST: ~$0.005/idea breakdown (GPT-4o-mini)
 */

'use strict';

const { get, run, all } = require('../db/connection');
const { chat } = require('./llmClient');

const TASK_MODEL = process.env.RSE_TASK_MODEL || 'gpt-4o-mini';
const TASK_PROVIDER = process.env.RSE_TASK_PROVIDER || 'openai';

// ════════════════════════════════════════════════════════════════════════════
// AGENT ROSTER — what each named agent can do
// ════════════════════════════════════════════════════════════════════════════

const AGENT_CAPABILITIES = `
AVAILABLE AGENTS (assign tasks ONLY to these 5):

SCOUT (Research & Intelligence):
  - Market research, competitive analysis, finding existing tools
  - Lead discovery, contact enrichment
  - Web scraping, data gathering
  Task types: research

CHARLIE (Engineering & Builder):
  - Code generation, prototype scaffolding
  - API integrations, tool building
  - 5 templates: SaaS (Next.js), CLI (Node.js), API (Express), Landing page, Chrome extension
  Task types: build

RALPH (QA & Quality Gate):
  - Code review, security audit
  - Content review (brand voice, accuracy)
  - Gives PASS, PASS WITH NOTES, or REJECT
  Task types: qa

QUILL (Content & Launch Copy):
  - Landing page copy, Product Hunt launch text
  - Cold outreach emails, LinkedIn posts
  - README heroes, marketing briefs
  Task types: copy

TODD (Chief of Staff — you):
  - Deployment, monitoring setup
  - Coordination, escalation to Steve
  - Only assign to yourself for deploy/monitor/escalate steps
  Task types: deploy, monitor
`;

const BREAKDOWN_SYSTEM = `You are Todd, Chief of Staff for ClawOps.
Steve has picked an idea from the Revenue Signal Engine to pursue.
Your job: break it into 3-5 concrete tasks assigned to named agents.

${AGENT_CAPABILITIES}

RULES:
- Each task must have exactly ONE assigned agent
- Tasks must be ordered logically (research before build, build before QA)
- Set depends_on to the task number that must complete first (or null for first task)
- Scout should ALWAYS go first to research what already exists
- Charlie builds ONLY after Scout confirms the approach
- Ralph QAs ONLY after Charlie builds
- Quill writes copy ONLY after Ralph approves
- Todd deploys/monitors ONLY after Quill finishes
- Keep task titles short (max 10 words)
- Keep descriptions actionable (1-2 sentences, specific)

Return ONLY valid JSON:
{
  "tasks": [
    {
      "order": 1,
      "assigned_to": "scout",
      "task_type": "research",
      "title": "Research existing QB MCP integrations",
      "description": "Search for existing MCP servers that connect to QuickBooks. Check npm, GitHub, and Claude MCP registry. Report what exists and what gaps remain.",
      "depends_on": null
    },
    {
      "order": 2,
      "assigned_to": "charlie",
      "task_type": "build",
      "title": "Scaffold API wrapper prototype",
      "description": "Build an Express.js API wrapper that connects to QB API. Include auth flow, invoice endpoint, and AR aging endpoint.",
      "depends_on": 1
    }
  ]
}`;

// ════════════════════════════════════════════════════════════════════════════
// TASK BREAKDOWN
// ════════════════════════════════════════════════════════════════════════════

/**
 * Break a picked idea into tasks assigned to named agents.
 * @param {number} evaluationId — ID from rse_evaluations
 */
async function breakdownIdea(evaluationId) {
  const idea = get(`
    SELECT ev.*, sig.title AS signal_title, sig.description AS signal_desc, sig.tags,
           s.name AS source_name, bs.spec_title, bs.proposed_solution, bs.implementation_steps,
           bs.tech_stack, bs.revenue_model
    FROM rse_evaluations ev
    JOIN rse_signals sig ON sig.id = ev.signal_id
    JOIN rse_sources s ON s.id = sig.source_id
    LEFT JOIN rse_build_specs bs ON bs.id = ev.spec_id
    WHERE ev.id = ?
  `, [evaluationId]);

  if (!idea) throw new Error(`Evaluation ${evaluationId} not found`);

  // Check if tasks already exist
  const existing = all('SELECT id FROM rse_tasks WHERE evaluation_id = ?', [evaluationId]);
  if (existing.length > 0) {
    console.log(`[RSE-TaskMgr] Tasks already exist for evaluation ${evaluationId}, skipping`);
    return { created: 0, existing: existing.length };
  }

  let steps = '';
  if (idea.implementation_steps) {
    try { steps = JSON.parse(idea.implementation_steps).map((s, i) => `${i + 1}. ${s}`).join('\n'); } catch { steps = idea.implementation_steps; }
  }

  const userPrompt = `Steve picked this idea to build. Break it into tasks for the team.

IDEA: ${idea.one_liner}
SCORE: ${idea.composite_score}/10
REVENUE PATH: ${idea.revenue_path || 'TBD'}
FIRST STEP: ${idea.first_step || 'TBD'}
RISK: ${idea.risk || 'None identified'}
ESTIMATED HOURS: ${idea.estimated_hours || 'Unknown'}

SIGNAL: ${idea.signal_title}
${idea.signal_desc ? `DETAIL: ${idea.signal_desc}` : ''}
SOURCE: ${idea.source_name}

${idea.spec_title ? `BUILD SPEC: ${idea.spec_title}
SOLUTION: ${idea.proposed_solution}
STEPS:\n${steps}
TECH STACK: ${idea.tech_stack}
REVENUE MODEL: ${idea.revenue_model}` : '(No build spec — Scout needs to research approach first)'}

Break this into 3-5 tasks. Assign each to Scout, Charlie, Ralph, Quill, or Todd.`;

  console.log(`[RSE-TaskMgr] Todd breaking down: "${idea.one_liner}"`);

  const raw = await chat(BREAKDOWN_SYSTEM, userPrompt, {
    model: TASK_MODEL, provider: TASK_PROVIDER, temperature: 0.3, maxTokens: 1024, timeoutMs: 30000,
  });

  const data = parseJson(raw);
  if (!data?.tasks || !Array.isArray(data.tasks) || data.tasks.length === 0) {
    throw new Error('Todd returned no parseable tasks');
  }

  // Validate and insert tasks
  const validAgents = ['scout', 'charlie', 'ralph', 'quill', 'todd'];
  const taskIds = {};
  let created = 0;

  for (const task of data.tasks) {
    const agent = (task.assigned_to || '').toLowerCase();
    if (!validAgents.includes(agent)) continue;

    // Resolve depends_on to actual task ID
    let dependsOn = null;
    if (task.depends_on && taskIds[task.depends_on]) {
      dependsOn = taskIds[task.depends_on];
    }

    const status = dependsOn ? 'blocked' : 'pending';

    run(`INSERT INTO rse_tasks
      (evaluation_id, assigned_to, task_type, order_index, title, description, depends_on, status, priority)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      evaluationId,
      agent,
      task.task_type || 'research',
      task.order || created + 1,
      task.title,
      task.description || '',
      dependsOn,
      status,
      task.order === 1 ? 8 : 5,
    ]);

    // Get the inserted ID for dependency resolution
    const inserted = get('SELECT last_insert_rowid() as id');
    taskIds[task.order] = inserted?.id;
    created++;

    console.log(`[RSE-TaskMgr]   → ${agent.toUpperCase()}: ${task.title} [${status}]`);
  }

  // Update evaluation status to 'building'
  run('UPDATE rse_evaluations SET status = \'building\' WHERE id = ?', [evaluationId]);

  return { created, evaluationId, ideaTitle: idea.one_liner };
}

// ════════════════════════════════════════════════════════════════════════════
// TASK BOARD QUERIES
// ════════════════════════════════════════════════════════════════════════════

/**
 * Get all tasks grouped by idea.
 */
function getTaskBoard() {
  const tasks = all(`
    SELECT t.*, ev.one_liner AS idea_title, ev.composite_score, ev.status AS idea_status
    FROM rse_tasks t
    JOIN rse_evaluations ev ON ev.id = t.evaluation_id
    ORDER BY t.evaluation_id DESC, t.order_index ASC
  `);

  // Group by evaluation
  const grouped = {};
  for (const t of tasks) {
    if (!grouped[t.evaluation_id]) {
      grouped[t.evaluation_id] = {
        evaluation_id: t.evaluation_id,
        idea_title: t.idea_title,
        composite_score: t.composite_score,
        idea_status: t.idea_status,
        tasks: [],
      };
    }
    grouped[t.evaluation_id].tasks.push(t);
  }

  return Object.values(grouped);
}

/**
 * Update task status + unblock dependents.
 */
function updateTaskStatus(taskId, status, resultSummary = null) {
  run('UPDATE rse_tasks SET status = ?, result_summary = ?, completed_at = CASE WHEN ? IN (\'completed\',\'failed\',\'skipped\') THEN datetime(\'now\') ELSE completed_at END, started_at = CASE WHEN ? = \'in_progress\' THEN datetime(\'now\') ELSE started_at END WHERE id = ?', [
    status, resultSummary, status, status, taskId,
  ]);

  // Unblock dependent tasks when this one completes
  if (status === 'completed') {
    run('UPDATE rse_tasks SET status = \'pending\' WHERE depends_on = ? AND status = \'blocked\'', [taskId]);
  }

  // Check if all tasks for this idea are complete
  const task = get('SELECT evaluation_id FROM rse_tasks WHERE id = ?', [taskId]);
  if (task) {
    const remaining = get('SELECT COUNT(*) c FROM rse_tasks WHERE evaluation_id = ? AND status NOT IN (\'completed\',\'skipped\',\'failed\')', [task.evaluation_id]);
    if (remaining?.c === 0) {
      run('UPDATE rse_evaluations SET status = \'shipped\' WHERE id = ?', [task.evaluation_id]);
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// JSON PARSING
// ════════════════════════════════════════════════════════════════════════════

function parseJson(raw) {
  if (!raw) return null;
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }
  try { return JSON.parse(cleaned); } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) try { return JSON.parse(m[0]); } catch {}
  }
  return null;
}

module.exports = {
  breakdownIdea,
  getTaskBoard,
  updateTaskStatus,
};
