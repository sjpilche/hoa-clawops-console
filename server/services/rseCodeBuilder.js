/**
 * @file rseCodeBuilder.js
 * @description Builds working prototypes from RSE build specs using GPT-4o.
 *
 * HOW IT WORKS:
 *   1. Takes an approved rse_build_spec
 *   2. Sends spec + implementation steps + context to GPT-4o
 *   3. GPT-4o generates complete, working code files (no stubs, no TODOs)
 *   4. Runs basic QA → saves files to data/prototypes/ → generates launch copy
 *   5. Updates spec status: approved → building → built
 *
 * COST: ~$0.10-0.15/build (GPT-4o)
 * WHY GPT-4o: DeepSeek 16B on CPU takes 10 min and produces thin stubs.
 *   GPT-4o takes 30s and produces working code with real logic.
 */

'use strict';

const { get, run, all } = require('../db/connection');
const { chat } = require('./llmClient');
const { basicQA, writeLaunchCopy } = require('./softwareFactory');
const path = require('path');
const fs = require('fs');

const BUILD_MODEL = process.env.RSE_BUILD_MODEL || 'gpt-4o';
const BUILD_PROVIDER = process.env.RSE_BUILD_PROVIDER || 'openai';

// ════════════════════════════════════════════════════════════════════════════
// TEMPLATE DEFINITIONS — what GPT-4o should generate per template type
// ════════════════════════════════════════════════════════════════════════════

const TEMPLATE_SPECS = {
  cli: {
    label: 'Node.js CLI Tool',
    required: ['index.js', 'package.json', 'README.md'],
    instructions: `Generate a complete Node.js CLI tool.
Required files: index.js (#!/usr/bin/env node shebang), package.json (with bin field + all deps), README.md
The index.js MUST contain REAL working logic — not console.log stubs.
Use process.argv or a lightweight arg parser. Zero or minimal dependencies.
Must work with just \`npm install && node index.js\`.`,
  },
  saas: {
    label: 'Next.js SaaS App',
    required: ['package.json', 'app/page.tsx', 'README.md'],
    instructions: `Generate a complete Next.js SaaS prototype.
Required files: package.json, app/page.tsx (landing), app/dashboard/page.tsx (core feature), lib/db.ts or lib/api.ts, .env.example, README.md
Stack: Next.js 14, Tailwind CSS. Include responsive landing page, clear pain statement, email signup, one working feature.`,
  },
  'api-wrapper': {
    label: 'Express.js API',
    required: ['server.js', 'package.json', 'README.md'],
    instructions: `Generate a complete Express.js API microservice.
Required files: server.js, package.json (with all deps), Dockerfile, .env.example, README.md
Must include: GET /health, 2-3 REST endpoints with REAL logic (not stubs), input validation, JSON error responses, CORS.
Ready to deploy to Railway or Render.`,
  },
  landing: {
    label: 'Landing Page',
    required: ['index.html', 'README.md'],
    instructions: `Generate a complete landing page.
Required files: index.html (self-contained with inline CSS + JS), README.md
Must include: hero with pain statement, 3 benefit bullets, email capture form, responsive, dark mode support.
Single file, no build step. Ready for Netlify drag-and-drop.`,
  },
  'chrome-ext': {
    label: 'Chrome Extension',
    required: ['manifest.json', 'popup.html', 'popup.js', 'README.md'],
    instructions: `Generate a complete Chrome Extension (Manifest V3).
Required files: manifest.json, popup.html, popup.js, content.js (if needed), README.md
Must include: popup UI with working core feature, minimal permissions, icons placeholder note.
Ready to side-load in chrome://extensions.`,
  },
};

// ════════════════════════════════════════════════════════════════════════════
// TEMPLATE SELECTION
// ════════════════════════════════════════════════════════════════════════════

function selectTemplate(spec) {
  const typeMap = { tool: 'cli', feature: 'saas', integration: 'api-wrapper', automation: 'cli', product: 'saas' };
  let template = typeMap[spec.spec_type] || 'cli';

  try {
    const stack = JSON.parse(spec.tech_stack || '[]');
    if (stack.some(s => /next|react/i.test(s))) template = 'saas';
    else if (stack.some(s => /express|api|server/i.test(s))) template = 'api-wrapper';
    else if (stack.some(s => /chrome|extension/i.test(s))) template = 'chrome-ext';
    else if (stack.some(s => /html|landing/i.test(s))) template = 'landing';
  } catch {}

  return template;
}

function specToProductName(title) {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !['the', 'and', 'for', 'with', 'from', 'that', 'this', 'use', 'using'].includes(w))
    .slice(0, 4)
    .join('-') || `rse-build-${Date.now()}`;
}

// ════════════════════════════════════════════════════════════════════════════
// CODE GENERATION — GPT-4o direct
// ════════════════════════════════════════════════════════════════════════════

async function generateCode(spec, signal, source, template, productName) {
  const tmpl = TEMPLATE_SPECS[template] || TEMPLATE_SPECS.cli;

  let steps = '';
  try {
    steps = JSON.parse(spec.implementation_steps).map((s, i) => `${i + 1}. ${s}`).join('\n');
  } catch { steps = spec.implementation_steps || ''; }

  const systemPrompt = `You are an expert software engineer who builds complete, working prototypes.
You produce REAL code with REAL logic — never stubs, never "// TODO", never placeholder functions.

CRITICAL RULES:
- Return ONLY valid JSON: {"files": [{"name": "path/file.ext", "content": "full file content"}, ...]}
- Every file must have COMPLETE, WORKING content
- All dependencies must be listed in package.json
- Include error handling, input validation, helpful console output
- Use the product name "${productName}" consistently
- Include .env.example with all needed vars (empty values)
- NO hardcoded API keys or secrets
- Code must work out of the box after npm install`;

  const userPrompt = `Build a ${tmpl.label} prototype called "${productName}".

PROBLEM: ${spec.problem_statement}

SOLUTION: ${spec.proposed_solution}

IMPLEMENTATION STEPS:
${steps}

TECH STACK: ${spec.tech_stack || 'Node.js'}
REVENUE MODEL: ${spec.revenue_model || 'TBD'}
${signal ? `\nINSPIRED BY: "${signal.title}" — ${signal.description}` : ''}
${source ? `SOURCE: ${source.name}` : ''}

${tmpl.instructions}

Generate ALL files now. Return ONLY the JSON.`;

  console.log(`[RSE-Builder] Generating ${template} via ${BUILD_MODEL}...`);

  const raw = await chat(systemPrompt, userPrompt, {
    model: BUILD_MODEL,
    provider: BUILD_PROVIDER,
    maxTokens: 8192,
    timeoutMs: 120000,
    temperature: 0.3,
  });

  // Parse JSON from response
  let cleaned = (raw || '').trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
  }
  const firstBrace = cleaned.indexOf('{');
  if (firstBrace > 0) cleaned = cleaned.slice(firstBrace);

  let data;
  try { data = JSON.parse(cleaned); } catch {
    const m = cleaned.match(/\{[\s\S]*"files"[\s\S]*\}/);
    if (m) try { data = JSON.parse(m[0]); } catch {}
  }

  if (!data?.files || !Array.isArray(data.files) || data.files.length === 0) {
    throw new Error('GPT-4o returned no parseable files');
  }

  const validFiles = data.files.filter(f => f.name && f.content && f.content.length > 10);
  if (validFiles.length === 0) throw new Error('GPT-4o returned empty files');

  console.log(`[RSE-Builder] Generated ${validFiles.length} files via ${BUILD_MODEL}`);
  return { files: validFiles, model: BUILD_MODEL, costUsd: 0.10 };
}

// ════════════════════════════════════════════════════════════════════════════
// BUILD FROM SPEC — Full pipeline
// ════════════════════════════════════════════════════════════════════════════

async function buildFromSpec(specId) {
  const spec = get('SELECT * FROM rse_build_specs WHERE id = ?', [specId]);
  if (!spec) throw new Error(`Spec ${specId} not found`);
  if (spec.status === 'killed') throw new Error(`Spec ${specId} is killed`);

  const signal = get('SELECT * FROM rse_signals WHERE id = ?', [spec.signal_id]);
  const source = signal ? get('SELECT name FROM rse_sources WHERE id = ?', [signal.source_id]) : null;

  console.log(`[RSE-Builder] Building from spec ${specId}: "${spec.spec_title}"`);
  run('UPDATE rse_build_specs SET status = \'building\', updated_at = datetime(\'now\') WHERE id = ?', [specId]);

  const template = selectTemplate(spec);
  const productName = specToProductName(spec.spec_title);
  console.log(`[RSE-Builder] Template: ${template}, Product: ${productName}`);

  // Generate code via GPT-4o
  let files, model, buildCost;
  try {
    const result = await generateCode(spec, signal, source, template, productName);
    files = result.files;
    model = result.model;
    buildCost = result.costUsd;
  } catch (err) {
    run('UPDATE rse_build_specs SET status = \'approved\', updated_at = datetime(\'now\') WHERE id = ?', [specId]);
    throw new Error(`Code generation failed: ${err.message}`);
  }

  // Basic QA
  const qa = basicQA(files);
  if (!qa.passed) console.warn(`[RSE-Builder] QA issues:`, qa.issues);

  // Launch copy (non-fatal)
  let copy = null, copyCost = 0;
  try {
    const cluster = { pain_summary: spec.problem_statement, pain_category: signal?.signal_type || 'automation', score_reasoning: spec.revenue_model };
    const copyResult = await writeLaunchCopy(cluster, productName, template);
    copy = copyResult.copy;
    copyCost = copyResult.costUsd;
  } catch (err) {
    console.warn(`[RSE-Builder] Launch copy failed (non-fatal): ${err.message}`);
    copy = { headline: spec.spec_title, subheadline: spec.problem_statement };
  }

  const totalCost = (buildCost || 0) + copyCost;

  // Save files to disk
  const allowedBase = path.resolve(process.cwd(), 'data', 'prototypes');
  const protoDir = path.join(allowedBase, productName.replace(/[^a-zA-Z0-9_-]/g, '_'));
  if (!path.resolve(protoDir).startsWith(allowedBase)) throw new Error('Path traversal blocked');

  try {
    fs.mkdirSync(protoDir, { recursive: true });
    for (const file of files) {
      const safeName = file.name.replace(/\.\.\//g, '').replace(/\.\.\\/g, '');
      const filePath = path.join(protoDir, safeName);
      if (!path.resolve(filePath).startsWith(allowedBase)) continue;
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, file.content, 'utf8');
    }
    if (copy) fs.writeFileSync(path.join(protoDir, '_launch_copy.json'), JSON.stringify(copy, null, 2), 'utf8');
    fs.writeFileSync(path.join(protoDir, '_rse_spec.json'), JSON.stringify({ spec, signal, source: source?.name }, null, 2), 'utf8');
    console.log(`[RSE-Builder] ${files.length} files saved to ${protoDir}`);
  } catch (err) {
    console.error(`[RSE-Builder] Failed to save files: ${err.message}`);
  }

  // Insert prototype record
  run(`INSERT INTO opp_prototypes
    (cluster_id, name, description, template_type, code_summary, scaffold_agent, status, build_cost_usd, total_cost_usd, scaffolded_at)
    VALUES (?, ?, ?, ?, ?, ?, 'scaffolded', ?, ?, datetime('now'))`, [
    0, productName,
    `[RSE] ${spec.spec_title} — ${spec.problem_statement?.slice(0, 200)}`,
    template,
    JSON.stringify({ files_count: files.length, file_names: files.map(f => f.name), qa, source: 'rse', spec_id: specId }),
    `charlie-${model}`,
    totalCost, totalCost,
  ]);

  // Update spec status
  run('UPDATE rse_build_specs SET status = \'built\', assigned_to = ?, updated_at = datetime(\'now\') WHERE id = ?', [
    `charlie-${model}`, specId,
  ]);

  // Discord notification
  try {
    const discord = require('./discordNotifier');
    await discord.sendEmbed({
      title: `🔨 RSE Builder: "${productName}" Built`,
      description: `**Spec:** ${spec.spec_title}\n**Template:** ${template}\n**Files:** ${files.length}\n**QA:** ${qa.passed ? 'Passed' : qa.issues.length + ' issues'}\n**Cost:** $${totalCost.toFixed(3)}\n**Model:** ${model}`,
      color: qa.passed ? 0x2ecc71 : 0xe67e22,
      footer: { text: `From ${source?.name || 'RSE'} signal | data/prototypes/${productName}` },
    });
  } catch {}

  const outputText = `RSE Builder: Built "${productName}" (${template}) — ${files.length} files, QA ${qa.passed ? 'passed' : `${qa.issues.length} issues`}, cost $${totalCost.toFixed(3)}`;
  return { productName, template, filesCount: files.length, qa, copy, costUsd: totalCost, outputText, protoDir };
}

/**
 * Batch build — picks top approved specs.
 */
async function buildBatch(limit = 3) {
  const specs = all(
    `SELECT id, spec_title FROM rse_build_specs WHERE status = 'approved' ORDER BY created_at ASC LIMIT ?`, [limit]
  );

  let built = 0, failed = 0;
  const results = [];

  for (const spec of specs) {
    try {
      const result = await buildFromSpec(spec.id);
      built++;
      results.push({ specId: spec.id, title: spec.spec_title, productName: result.productName, status: 'built' });
    } catch (err) {
      failed++;
      results.push({ specId: spec.id, title: spec.spec_title, status: 'failed', error: err.message });
      console.error(`[RSE-Builder] Failed to build spec ${spec.id}: ${err.message}`);
    }
  }

  return { built, failed, total: specs.length, results };
}

module.exports = { buildFromSpec, buildBatch };
