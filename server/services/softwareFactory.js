/**
 * @file softwareFactory.js
 * @description Software Factory — Tier 2 of the Opportunity Engine.
 *
 * Takes high-scoring clusters (composite >= 75) and builds deployable prototypes.
 * Uses DeepSeek Coder V2 via Ollama ($0) for code generation, falling back to
 * GPT-4o via OpenClaw (~$0.10) if coder model is unavailable.
 *
 * PIPELINE:
 *   1. selectTemplate(cluster) → choose from 5 templates based on pain type
 *   2. scaffoldPrototype(cluster, template) → generate all code files
 *   3. qaCheck(prototype) → basic automated checks (Ralph does deep QA)
 *   4. writeLaunchCopy(prototype) → Quill writes landing/launch text
 *   5. deploy(prototype) → push to GitHub, trigger deploy
 *
 * COST: ~$0.00 with Ollama (DeepSeek Coder), ~$0.10-0.18 with GPT-4o fallback
 */

'use strict';

const { get, run, all } = require('../db/connection');
const path = require('path');
const fs = require('fs');
const { chat, chatJSON, isModelAvailable } = require('./llmClient');

// ── Config ──────────────────────────────────────────────────────────────────

const CODER_MODEL = process.env.OLLAMA_CODER_MODEL || 'deepseek-coder-v2:16b';
const TEXT_MODEL = process.env.OLLAMA_DEFAULT_MODEL || 'llama3.2:3b';

const TEMPLATES = ['saas', 'cli', 'landing', 'api-wrapper', 'chrome-ext'];

// ── Template Selection ──────────────────────────────────────────────────────

const TEMPLATE_SELECTION_PROMPT = `You are a template selector for a software factory.
Given a pain summary and category, choose the best prototype template.
Return ONLY valid JSON: {"template": "saas|cli|landing|api-wrapper|chrome-ext", "reasoning": "one sentence"}

Rules:
- saas: Recurring workflow pain, needs dashboard/auth, B2B opportunities
- cli: Developer tool, data processing, one-shot automation
- landing: Validate demand before building (email capture, waitlist)
- api-wrapper: Existing API that needs a simpler interface or middleware
- chrome-ext: Browser-based workflow pain, web scraping helper, page enhancer

If the pain is in construction/finance/HOA → prefer saas or api-wrapper (better monetization)
If the pain is developer workflow → prefer cli or chrome-ext (faster validation)
If uncertain about demand → prefer landing (cheapest to validate)`;

/**
 * Select the best template for a cluster.
 * @param {object} cluster - opp_clusters row
 * @returns {{ template: string, reasoning: string }}
 */
async function selectTemplate(cluster) {
  // If scorer already recommended a template, use it
  if (cluster.score_reasoning) {
    try {
      const scoreData = JSON.parse(cluster.score_reasoning);
      if (scoreData.recommended_template && TEMPLATES.includes(scoreData.recommended_template)) {
        return { template: scoreData.recommended_template, reasoning: 'From scorer recommendation' };
      }
    } catch {}
  }

  const input = `Pain: ${cluster.pain_summary}\nCategory: ${cluster.pain_category}\nSignals: ${cluster.signal_count}\nScore: ${cluster.composite_score}`;

  const data = await chatJSON(TEMPLATE_SELECTION_PROMPT, input, {
    model: TEXT_MODEL, provider: 'ollama', maxTokens: 256,
  });

  try {
    if (data && TEMPLATES.includes(data.template)) return data;
  } catch {}

  // Fallback: landing page (safest, cheapest validation)
  return { template: 'landing', reasoning: 'Fallback — validate demand before building' };
}

// ── Code Generation ─────────────────────────────────────────────────────────

const TEMPLATE_PROMPTS = {
  saas: `Generate a complete Next.js SaaS prototype. Return ALL files as JSON:
{"files": [{"name": "package.json", "content": "..."}, {"name": "app/page.tsx", "content": "..."}, ...]}

Required files: package.json, app/page.tsx (landing with signup CTA), app/dashboard/page.tsx (one core feature), app/api/checkout/route.ts (Stripe Checkout session), lib/supabase.ts (client), .env.example, README.md
Stack: Next.js 14, Supabase (auth + DB), Tailwind CSS, Stripe Checkout
Must include: responsive landing page, clear pain statement, email signup, one working feature screen.
Stripe: app/api/checkout/route.ts creates a Stripe Checkout session using STRIPE_SECRET_KEY from env. Price comes from STRIPE_PRICE_ID env var.
.env.example must include: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, STRIPE_SECRET_KEY, STRIPE_PRICE_ID
Keep it minimal — proving the concept, not production ready.`,

  cli: `Generate a complete Node.js CLI tool. Return ALL files as JSON:
{"files": [{"name": "index.js", "content": "..."}, {"name": "package.json", "content": "..."}, ...]}

Required files: index.js (with #!/usr/bin/env node shebang), package.json (with bin field), README.md
Must include: --help flag, argument parsing (process.argv, no deps), clear error messages, example usage in README.
Zero or minimal dependencies. Must work with just \`node index.js\`.`,

  landing: `Generate a complete landing page. Return ALL files as JSON:
{"files": [{"name": "index.html", "content": "..."}, {"name": "README.md", "content": "..."}]}

Required files: index.html (self-contained with inline CSS), README.md
Must include: hero with pain statement headline, 3 benefit bullets, email capture form (Formspree action), Stripe payment link button (href="STRIPE_PAYMENT_LINK_URL"), responsive design, dark mode.
Add both: free email signup AND paid "Get Started" button pointing to Stripe payment link.
Single file, no build step. Ready for Netlify drag-and-drop deploy.`,

  'api-wrapper': `Generate a complete Express.js API microservice. Return ALL files as JSON:
{"files": [{"name": "server.js", "content": "..."}, {"name": "package.json", "content": "..."}, {"name": "Dockerfile", "content": "..."}, ...]}

Required files: server.js, package.json, Dockerfile, .env.example, README.md
Must include: GET /health, 2-3 REST endpoints for the core feature, input validation, JSON error responses, CORS headers.
Ready to deploy to Railway or Render.`,

  'chrome-ext': `Generate a complete Chrome Extension (Manifest V3). Return ALL files as JSON:
{"files": [{"name": "manifest.json", "content": "..."}, {"name": "popup.html", "content": "..."}, {"name": "popup.js", "content": "..."}, ...]}

Required files: manifest.json (Manifest V3), popup.html, popup.js, README.md
Must include: popup UI with core feature, minimal permissions (NOT <all_urls>), icons placeholder note.
Ready to side-load in chrome://extensions.`,
};

/**
 * Generate prototype code for a cluster + template.
 * @param {object} cluster
 * @param {string} template
 * @param {string} productName
 * @returns {{ files: Array<{name: string, content: string}>, model: string, costUsd: number }}
 */
async function scaffoldPrototype(cluster, template, productName) {
  const templatePrompt = TEMPLATE_PROMPTS[template];
  if (!templatePrompt) throw new Error(`Unknown template: ${template}`);

  const contextPrompt = `You are a software factory that generates complete, working prototypes.
The prototype must solve this specific pain point:

PAIN: ${cluster.pain_summary}
CATEGORY: ${cluster.pain_category || 'general'}
PRODUCT NAME: ${productName}

${templatePrompt}

CRITICAL RULES:
- Return ONLY valid JSON with a "files" array
- Every file must have complete content — NO placeholders, NO "// TODO", NO "implement here"
- Code must work out of the box
- Use the product name "${productName}" in package.json, README, and UI copy
- Reference the specific pain point in landing copy / README hero
- Include .env.example with all needed vars (values empty)
- No hardcoded API keys or secrets`;

  let model = CODER_MODEL;
  let costUsd = 0;
  let raw = '';

  // Try DeepSeek Coder first ($0)
  const coderAvailable = await isModelAvailable(CODER_MODEL);
  if (coderAvailable) {
    console.log(`[SoftwareFactory] Generating ${template} prototype via ${CODER_MODEL}...`);
    raw = await chat(contextPrompt, 'Generate the complete prototype now. Return ONLY the JSON.', {
      model: CODER_MODEL, provider: 'ollama', maxTokens: 8192, timeoutMs: 300000, temperature: 0.3,
    });
  } else {
    // Fallback to GPT-4o via OpenClaw
    console.log(`[SoftwareFactory] ${CODER_MODEL} not available, falling back to GPT-4o...`);
    try {
      const openclawBridge = require('./openclawBridge');
      const result = await openclawBridge.runAgent('charlie', {
        openclawId: 'charlie',
        message: contextPrompt + '\n\nGenerate the complete prototype now. Return ONLY the JSON.',
        sessionId: `factory-${cluster.id}-${Date.now()}`,
      });
      const parsed = openclawBridge.constructor.parseOutput(result.output);
      raw = parsed.text || result.output || '';
      costUsd = parsed.costUsd || 0;
      model = 'gpt-4o';
    } catch (err) {
      throw new Error(`Both Ollama and GPT-4o failed: ${err.message}`);
    }
  }

  // Parse JSON from output
  let cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
  const firstBrace = cleaned.indexOf('{');
  if (firstBrace > 0) cleaned = cleaned.slice(firstBrace);

  let data;
  try { data = JSON.parse(cleaned); } catch {
    const m = cleaned.match(/\{[\s\S]*"files"[\s\S]*\}/);
    if (m) try { data = JSON.parse(m[0]); } catch {}
  }

  if (!data?.files || !Array.isArray(data.files) || data.files.length === 0) {
    throw new Error('Code generation returned no parseable files');
  }

  // Validate files have content
  const validFiles = data.files.filter(f => f.name && f.content && f.content.length > 10);
  if (validFiles.length === 0) {
    throw new Error('Code generation returned empty files');
  }

  console.log(`[SoftwareFactory] Generated ${validFiles.length} files via ${model}`);
  return { files: validFiles, model, costUsd };
}

// ── Basic QA (automated pre-check before Ralph's deep review) ───────────────

/**
 * Run basic automated QA checks on generated files.
 * @param {Array<{name: string, content: string}>} files
 * @returns {{ passed: boolean, issues: string[] }}
 */
function basicQA(files) {
  const issues = [];

  // Check for hardcoded secrets
  const secretPatterns = [
    /sk-[a-zA-Z0-9]{20,}/,     // OpenAI keys
    /ghp_[a-zA-Z0-9]{36}/,     // GitHub tokens
    /sk_live_[a-zA-Z0-9]+/,    // Stripe live keys
    /password\s*[:=]\s*['"][^'"]+['"]/i, // Hardcoded passwords
  ];

  for (const file of files) {
    for (const pattern of secretPatterns) {
      if (pattern.test(file.content)) {
        issues.push(`SECURITY: Possible hardcoded secret in ${file.name}`);
      }
    }

    // Check for eval/innerHTML
    if (/\beval\s*\(/.test(file.content)) {
      issues.push(`SECURITY: eval() found in ${file.name}`);
    }

    // Check for empty files
    if (file.content.trim().length < 20) {
      issues.push(`QUALITY: ${file.name} appears to be nearly empty`);
    }
  }

  // Check for required files
  const fileNames = files.map(f => f.name.toLowerCase());
  if (!fileNames.some(f => f === 'readme.md' || f === 'readme')) {
    issues.push('QUALITY: Missing README.md');
  }

  return { passed: issues.length === 0, issues };
}

// ── Launch Copy Generation ──────────────────────────────────────────────────

const LAUNCH_COPY_PROMPT = `You are a launch copywriter for a software factory.
Write a complete launch copy package for this prototype. Return ONLY valid JSON:

{
  "headline": "8 words max, pain-focused",
  "subheadline": "One sentence: what it does + who it's for",
  "cta_button": "action verb + outcome",
  "ph_tagline": "Max 60 chars",
  "ph_description": "3-4 sentences: pain → solution → differentiation → CTA",
  "tweets": ["hook tweet", "what we built tweet", "cta tweet"],
  "cold_outreach_subject": "Max 8 words",
  "cold_outreach_body": "Max 100 words, blunt, one CTA",
  "readme_hero": "# Product Name\\n> One-sentence pitch\\n\\n- Feature 1\\n- Feature 2\\n- Feature 3"
}

Rules:
- Lead with pain, not product
- NEVER use "revolutionary", "game-changing", "disruptive", "leverage", "synergy"
- PH description: use "AI" max once
- Headlines readable in 3 seconds
- Cold outreach: Jake CFO voice — blunt, street-level, calls out the pain directly`;

/**
 * Generate launch copy for a prototype.
 * @param {object} cluster
 * @param {string} productName
 * @param {string} template
 * @returns {{ copy: object, costUsd: number }}
 */
async function writeLaunchCopy(cluster, productName, template) {
  const input = `Product: ${productName}\nPain: ${cluster.pain_summary}\nCategory: ${cluster.pain_category}\nTemplate: ${template}\nTarget: ${cluster.score_reasoning || 'General audience'}`;

  // Try Ollama first, fallback to GPT-4o via OpenClaw
  let copy = null;
  let costUsd = 0;
  try {
    copy = await chatJSON(LAUNCH_COPY_PROMPT, input, {
      model: TEXT_MODEL, provider: 'ollama', maxTokens: 1024,
    });
  } catch {
    // Fallback to GPT-4o
    const openclawBridge = require('./openclawBridge');
    const result = await openclawBridge.runAgent('quill', {
      openclawId: 'quill',
      message: LAUNCH_COPY_PROMPT + '\n\n' + input,
      sessionId: `factory-copy-${cluster.id}-${Date.now()}`,
    });
    const parsed = openclawBridge.constructor.parseOutput(result.output);
    const raw = parsed.text || result.output || '';
    costUsd = parsed.costUsd || 0;

    let cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
    const firstBrace = cleaned.indexOf('{');
    if (firstBrace > 0) cleaned = cleaned.slice(firstBrace);
    try { copy = JSON.parse(cleaned); } catch {
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (m) try { copy = JSON.parse(m[0]); } catch {}
    }
  }

  return { copy: copy || { headline: productName, subheadline: cluster.pain_summary }, costUsd };
}

// ── Slug / Name Generation ──────────────────────────────────────────────────

function generateProductName(painSummary) {
  // Simple: take first 3 meaningful words, kebab-case
  const words = painSummary
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3 && !['that', 'this', 'with', 'from', 'they', 'have', 'been', 'when', 'what', 'were'].includes(w));

  const slug = words.slice(0, 3).join('-');
  return slug || `prototype-${Date.now()}`;
}

// ── Full Factory Pipeline ───────────────────────────────────────────────────

/**
 * Run the full factory pipeline for a scored cluster.
 * @param {number} clusterId
 * @returns {{ prototype: object, outputText: string, costUsd: number }}
 */
async function buildPrototype(clusterId) {
  const cluster = get('SELECT * FROM opp_clusters WHERE id = ?', [clusterId]);
  if (!cluster) throw new Error(`Cluster ${clusterId} not found`);
  if (cluster.composite_score < 75) throw new Error(`Cluster score ${cluster.composite_score} < 75 threshold`);

  console.log(`[SoftwareFactory] Building prototype for cluster ${clusterId}: ${cluster.pain_summary}`);

  // Step 1: Select template
  const { template, reasoning: templateReasoning } = await selectTemplate(cluster);
  console.log(`[SoftwareFactory] Template: ${template} — ${templateReasoning}`);

  // Step 2: Generate product name
  const productName = generateProductName(cluster.pain_summary);
  console.log(`[SoftwareFactory] Product name: ${productName}`);

  // Step 3: Scaffold code
  const { files, model, costUsd: buildCost } = await scaffoldPrototype(cluster, template, productName);

  // Step 4: Basic automated QA
  const qa = basicQA(files);
  if (!qa.passed) {
    console.warn(`[SoftwareFactory] Basic QA issues:`, qa.issues);
    // Don't block — Ralph will do deep QA. Just log.
  }

  // Step 5: Generate launch copy
  const { copy, costUsd: copyCost } = await writeLaunchCopy(cluster, productName, template);

  const totalCost = buildCost + copyCost;

  // Step 6: Save prototype files to disk (with path validation)
  const allowedBase = path.resolve(process.cwd(), 'data', 'prototypes');
  const protoDir = path.join(allowedBase, productName.replace(/[^a-zA-Z0-9_-]/g, '_'));
  // Path traversal guard — reject if resolved path escapes the prototypes directory
  if (!path.resolve(protoDir).startsWith(allowedBase)) {
    console.error(`[SoftwareFactory] Path traversal blocked: ${protoDir} escapes ${allowedBase}`);
    throw new Error('Prototype output path validation failed — path traversal attempt blocked');
  }
  // ── Code review scan — check for dangerous patterns before writing ──
  const DANGEROUS_PATTERNS = [
    { pattern: /\beval\s*\(/, label: 'eval()' },
    { pattern: /\bexec\s*\(/, label: 'exec()' },
    { pattern: /\bexecSync\s*\(/, label: 'execSync()' },
    { pattern: /require\s*\(\s*['"]child_process['"]/, label: "require('child_process')" },
    { pattern: /\bspawn\s*\(/, label: 'spawn()' },
    { pattern: /process\.env/, label: 'process.env access' },
    { pattern: /fs\.unlinkSync|fs\.rmdirSync|fs\.rmSync/, label: 'filesystem deletion' },
    { pattern: /\bfetch\s*\(\s*['"]http/, label: 'network fetch' },
  ];

  const codeFlags = [];
  for (const file of files) {
    for (const { pattern, label } of DANGEROUS_PATTERNS) {
      if (file.content && pattern.test(file.content)) {
        codeFlags.push({ file: file.name, pattern: label });
      }
    }
  }

  if (codeFlags.length > 0) {
    const flagSummary = codeFlags.map(f => `${f.file}: ${f.pattern}`).join(', ');
    console.warn(`[SoftwareFactory] CODE REVIEW FLAGS: ${flagSummary}`);
    // Log to audit for Steve's review — don't block (LLM-generated code often includes harmless patterns)
    try {
      const { run: dbRun } = require('../db/connection');
      dbRun(
        `INSERT INTO audit_log (id, action, resource, details, outcome) VALUES (lower(hex(randomblob(16))), 'code_review_flag', ?, ?, 'failure')`,
        [`prototype:${productName}`, JSON.stringify({ product: productName, flags: codeFlags })]
      );
    } catch {}
    // Discord alert for suspicious code
    try {
      const discord = require('./discordNotifier');
      discord.sendEmbed({
        title: 'Software Factory: Code Review Flag',
        description: `Prototype "${productName}" contains suspicious patterns:\n${codeFlags.map(f => `- \`${f.file}\`: ${f.pattern}`).join('\n')}\n\nFiles saved but review recommended before deploy.`,
        color: 0xff9500,
        footer: { text: 'software-factory' },
      });
    } catch {}
  }

  try {
    fs.mkdirSync(protoDir, { recursive: true });
    for (const file of files) {
      // Sanitize individual file names — no ../ allowed
      const safeName = file.name.replace(/\.\.\//g, '').replace(/\.\.\\/g, '');
      const filePath = path.join(protoDir, safeName);
      if (!path.resolve(filePath).startsWith(allowedBase)) {
        console.warn(`[SoftwareFactory] Skipping file with suspicious path: ${file.name}`);
        continue;
      }
      const fileDir = path.dirname(filePath);
      fs.mkdirSync(fileDir, { recursive: true });
      fs.writeFileSync(filePath, file.content, 'utf8');
    }
    // Save launch copy
    fs.writeFileSync(path.join(protoDir, '_launch_copy.json'), JSON.stringify(copy, null, 2), 'utf8');
    console.log(`[SoftwareFactory] Files saved to ${protoDir}`);
  } catch (err) {
    console.error(`[SoftwareFactory] Failed to save files:`, err.message);
  }

  // Step 7: Insert prototype record
  run(`
    INSERT INTO opp_prototypes (cluster_id, name, description, template_type, code_summary, scaffold_agent, status, build_cost_usd, total_cost_usd)
    VALUES (?, ?, ?, ?, ?, ?, 'scaffolded', ?, ?)
  `, [
    clusterId,
    productName,
    cluster.pain_summary,
    template,
    `${files.length} files generated via ${model}. Basic QA: ${qa.passed ? 'PASSED' : qa.issues.length + ' issues'}`,
    model === 'gpt-4o' ? 'charlie-gpt4o' : 'charlie-deepseek',
    buildCost,
    totalCost,
  ]);

  const protoId = get('SELECT last_insert_rowid() AS id')?.id;

  // Update cluster status
  run("UPDATE opp_clusters SET status = 'prototyping', updated_at = datetime('now') WHERE id = ?", [clusterId]);

  // Discord notification
  try {
    const discord = require('./discordNotifier');
    await discord.postWebhook({
      embeds: [{
        title: `\ud83c\udfed Prototype Built: ${productName}`,
        color: 0x6366f1,
        fields: [
          { name: 'Pain', value: cluster.pain_summary, inline: false },
          { name: 'Template', value: template, inline: true },
          { name: 'Files', value: `${files.length}`, inline: true },
          { name: 'Model', value: model, inline: true },
          { name: 'Cost', value: `$${totalCost.toFixed(4)}`, inline: true },
          { name: 'QA Issues', value: qa.passed ? 'None' : qa.issues.join('\n'), inline: false },
        ],
        timestamp: new Date().toISOString(),
      }],
    });
  } catch {}

  const outputText = [
    `Software Factory: Built "${productName}" (${template}) for cluster #${clusterId}`,
    `  Pain: ${cluster.pain_summary}`,
    `  Files: ${files.length} generated via ${model}`,
    `  Cost: $${totalCost.toFixed(4)} (build: $${buildCost.toFixed(4)}, copy: $${copyCost.toFixed(4)})`,
    `  Basic QA: ${qa.passed ? 'PASSED' : `${qa.issues.length} issues — needs Ralph review`}`,
    `  Saved to: data/prototypes/${productName}/`,
    `  Next: Ralph deep QA → Quill polish → deploy`,
  ].join('\n');

  return {
    prototype: { id: protoId, name: productName, template, files: files.length, model, qa },
    outputText,
    costUsd: totalCost,
    copy,
  };
}

// ── Pre-Build Demand Validation ──────────────────────────────────────────────

/**
 * Generate a lightweight validation landing page (no LLM needed).
 * Deploys immediately to capture emails for 48 hours before committing to a full build.
 */
function generateValidationPage(cluster, productName) {
  const painSummary = cluster.pain_summary || 'A common pain point that needs a better solution';
  const category = cluster.category || 'Productivity';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${productName} — Coming Soon</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .container { max-width: 600px; padding: 2rem; text-align: center; }
    h1 { font-size: 2.5rem; margin-bottom: 1rem; background: linear-gradient(135deg, #818cf8, #34d399); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .pain { font-size: 1.25rem; color: #94a3b8; margin-bottom: 2rem; line-height: 1.6; }
    .badge { display: inline-block; background: #1e293b; border: 1px solid #334155; padding: 0.25rem 0.75rem; border-radius: 999px; font-size: 0.875rem; color: #818cf8; margin-bottom: 1.5rem; }
    form { display: flex; gap: 0.5rem; max-width: 400px; margin: 0 auto 1rem; }
    input[type="email"] { flex: 1; padding: 0.75rem 1rem; border-radius: 0.5rem; border: 1px solid #334155; background: #1e293b; color: #e2e8f0; font-size: 1rem; }
    button { padding: 0.75rem 1.5rem; border-radius: 0.5rem; border: none; background: #6366f1; color: white; font-size: 1rem; font-weight: 600; cursor: pointer; }
    button:hover { background: #4f46e5; }
    .note { font-size: 0.875rem; color: #64748b; }
    .count { margin-top: 2rem; font-size: 0.875rem; color: #475569; }
  </style>
</head>
<body>
  <div class="container">
    <div class="badge">${category}</div>
    <h1>${productName}</h1>
    <p class="pain">${painSummary}</p>
    <p class="pain" style="font-size:1rem; margin-bottom:1.5rem;">We're building a solution. Get notified when it launches.</p>
    <form action="https://formspree.io/f/xpznqwjl" method="POST">
      <input type="email" name="email" placeholder="your@email.com" required>
      <input type="hidden" name="_subject" value="Validation: ${productName}">
      <input type="hidden" name="product" value="${productName}">
      <button type="submit">Notify Me</button>
    </form>
    <p class="note">No spam. Just a launch notification.</p>
    <div class="count" id="visitors"></div>
  </div>
  <script>
    // Simple visitor counter via localStorage (per-browser, not server-side)
    const key = 'v_${productName.replace(/[^a-zA-Z0-9]/g, '_')}';
    let count = parseInt(localStorage.getItem(key) || '0') + 1;
    localStorage.setItem(key, count);
  </script>
</body>
</html>`;

  return [
    { name: 'index.html', content: html },
    { name: 'README.md', content: `# ${productName} — Validation Landing Page\n\nDemand validation for: ${painSummary}\n\nThis page captures email interest before we commit to a full build.\n` },
  ];
}

/**
 * Deploy a validation landing page for a cluster.
 * Sets cluster status to 'validating' with a 48-hour timer.
 */
async function validateDemand(clusterId) {
  const cluster = get('SELECT * FROM opp_clusters WHERE id = ?', [clusterId]);
  if (!cluster) throw new Error(`Cluster ${clusterId} not found`);

  const productName = generateProductName(cluster.pain_summary);
  const validationName = `val-${productName}`;
  const files = generateValidationPage(cluster, productName);

  // Save validation files to disk
  const allowedBase = path.resolve(process.cwd(), 'data', 'prototypes');
  const valDir = path.join(allowedBase, validationName.replace(/[^a-zA-Z0-9_-]/g, '_'));
  if (!path.resolve(valDir).startsWith(allowedBase)) {
    throw new Error('Path traversal attempt blocked');
  }

  fs.mkdirSync(valDir, { recursive: true });
  for (const file of files) {
    fs.writeFileSync(path.join(valDir, file.name), file.content, 'utf8');
  }

  // Deploy immediately via prototypeDeployer
  let deployResult = null;
  try {
    const { createRepo, pushFilesToRepo, deployToVercel, healthCheck } = require('./prototypeDeployer');
    const repoName = validationName.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 100);
    await createRepo(repoName, `Demand validation: ${cluster.pain_summary}`);
    await pushFilesToRepo(repoName, valDir);
    const { url, source } = await deployToVercel(repoName);
    deployResult = { url, source, repoName };
  } catch (err) {
    console.warn(`[SoftwareFactory] Validation deploy failed: ${err.message}`);
  }

  // Mark cluster as validating with 48-hour deadline
  const validationDeadline = new Date(Date.now() + 48 * 3600000).toISOString();
  run(`UPDATE opp_clusters SET
    status = 'validating',
    updated_at = datetime('now')
    WHERE id = ?`, [clusterId]);

  // Insert a lightweight prototype record for tracking
  run(`INSERT INTO opp_prototypes (cluster_id, name, description, template_type, status, deploy_url, repo_url, deployed_at, build_cost_usd, total_cost_usd)
    VALUES (?, ?, ?, 'landing', 'validating', ?, ?, datetime('now'), 0, 0)`,
    [clusterId, validationName, `Demand validation: ${cluster.pain_summary}`,
     deployResult?.url || null, deployResult ? `https://github.com/${deployResult.repoName}` : null]);

  // Discord notification
  try {
    const discord = require('./discordNotifier');
    await discord.sendEmbed({
      title: `Validation Deployed: ${productName}`,
      description: cluster.pain_summary,
      color: 0x818cf8,
      fields: [
        { name: 'URL', value: deployResult?.url || 'Deploy failed', inline: false },
        { name: 'Deadline', value: validationDeadline.slice(0, 16), inline: true },
        { name: 'Gate', value: '5% email capture rate', inline: true },
      ],
    });
  } catch {}

  return {
    clusterId,
    productName,
    validationUrl: deployResult?.url || null,
    deadline: validationDeadline,
    outputText: `Validation page deployed for "${productName}" — checking demand in 48h`,
    costUsd: 0,
  };
}

/**
 * Check validation results for clusters that have been validating 48+ hours.
 * Promotes to 'scored' (ready for full build) or marks as 'validated_low_demand'.
 */
async function checkValidationResults() {
  const expired = all(`
    SELECT c.*, p.id as proto_id, p.deploy_url, p.name as proto_name
    FROM opp_clusters c
    JOIN opp_prototypes p ON p.cluster_id = c.id AND p.status = 'validating'
    WHERE c.status = 'validating'
    AND p.deployed_at <= datetime('now', '-48 hours')
  `);

  const results = [];
  for (const cluster of expired) {
    // Check traction (signups via Formspree won't be tracked here — use page views as proxy)
    const traction = get(
      "SELECT SUM(page_views) as views, SUM(signups) as signups FROM opp_traction WHERE prototype_id = ?",
      [cluster.proto_id]
    );

    const views = traction?.views || 0;
    const signups = traction?.signups || 0;
    const captureRate = views > 0 ? (signups / views) * 100 : 0;

    if (captureRate >= 5 || signups >= 3) {
      // Demand validated — promote to scored for full build
      run("UPDATE opp_clusters SET status = 'scored', updated_at = datetime('now') WHERE id = ?", [cluster.id]);
      run("UPDATE opp_prototypes SET status = 'validated', updated_at = datetime('now') WHERE id = ?", [cluster.proto_id]);
      results.push({ cluster: cluster.id, name: cluster.proto_name, result: 'PASSED', captureRate, signups, views });

      try {
        const discord = require('./discordNotifier');
        await discord.sendEmbed({
          title: `Demand Validated: ${cluster.proto_name}`,
          description: `${signups} signups from ${views} views (${captureRate.toFixed(1)}%) — proceeding to full build`,
          color: 0x22c55e,
        });
      } catch {}
    } else {
      // Low demand — skip full build
      run("UPDATE opp_clusters SET status = 'validated_low_demand', updated_at = datetime('now') WHERE id = ?", [cluster.id]);
      run("UPDATE opp_prototypes SET status = 'killed', updated_at = datetime('now') WHERE id = ?", [cluster.proto_id]);
      results.push({ cluster: cluster.id, name: cluster.proto_name, result: 'FAILED', captureRate, signups, views });
    }
  }

  return { checked: results.length, passed: results.filter(r => r.result === 'PASSED').length, results };
}

/**
 * Run factory batch: pick the top unbuilt scored cluster and build it.
 * First checks for validation results, then validates or builds.
 * @returns {{ built: boolean, outputText: string, costUsd: number }}
 */
async function runFactoryBatch() {
  // Step 0: Check validation results for any expired validations
  const validationResults = await checkValidationResults();
  if (validationResults.checked > 0) {
    console.log(`[SoftwareFactory] Validation check: ${validationResults.passed}/${validationResults.checked} passed`);
  }

  // Step 1: Find top scored cluster ready for building
  const cluster = get(`
    SELECT * FROM opp_clusters
    WHERE composite_score >= 75 AND status = 'scored'
    ORDER BY composite_score DESC
    LIMIT 1
  `);

  if (!cluster) {
    // Step 2: No scored clusters — try validating a high-scoring unvalidated cluster
    const unvalidated = get(`
      SELECT * FROM opp_clusters
      WHERE composite_score >= 75 AND status NOT IN ('scored', 'validating', 'validated_low_demand', 'prototyping', 'launched', 'monitoring', 'killed', 'scaled')
      ORDER BY composite_score DESC
      LIMIT 1
    `);

    if (unvalidated) {
      const valResult = await validateDemand(unvalidated.id);
      return {
        built: false,
        outputText: valResult.outputText,
        costUsd: 0,
      };
    }

    return {
      built: false,
      outputText: `Software Factory: No clusters ready. ${validationResults.checked > 0 ? `Checked ${validationResults.checked} validations (${validationResults.passed} passed).` : 'No clusters scored >= 75.'}`,
      costUsd: 0,
    };
  }

  return buildPrototype(cluster.id);
}

// ── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  selectTemplate,
  scaffoldPrototype,
  basicQA,
  writeLaunchCopy,
  buildPrototype,
  runFactoryBatch,
  generateProductName,
  validateDemand,
  checkValidationResults,
  TEMPLATES,
};
