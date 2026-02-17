/**
 * Triggers the hoa-content-writer agent via the ClawOps API.
 * Creates a run, confirms it, waits for completion, saves output to outputs/blog-posts/
 * Run: node scripts/run-content-writer.js
 */
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3001/api';

async function login() {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@clawops.local', password: 'changeme123' }),
  });
  const data = await res.json();
  const token = data.token?.token || data.token;
  if (!token) throw new Error('Login failed: ' + JSON.stringify(data));
  return token;
}

async function triggerRun(token) {
  const res = await fetch(`${BASE}/schedules/sched-content-writer-weekly/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!data.success) throw new Error('Trigger failed: ' + JSON.stringify(data));
  console.log('Run created:', data.run.id);
  return data.run.id;
}

async function confirmRun(token, runId) {
  console.log('Confirming run', runId, '— calling GPT-4o, please wait...');
  const res = await fetch(`${BASE}/runs/${runId}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data;
}

function extractContent(raw) {
  let content = raw?.run?.outputText || raw?.run?.output || raw?.outputText || raw?.output || raw?.result || '';
  try {
    const parsed = JSON.parse(content);
    if (parsed?.result) content = parsed.result;
  } catch (_) {}
  return content;
}

function saveOutput(content) {
  const dir = path.join(__dirname, '..', 'outputs', 'blog-posts');
  fs.mkdirSync(dir, { recursive: true });

  // Try to extract slug from frontmatter
  const slugMatch = content.match(/^slug:\s*["']?([^"'\n]+)["']?/m);
  const slug = slugMatch ? slugMatch[1].trim() : `blog-${Date.now()}`;
  const date = new Date().toISOString().split('T')[0];
  const filename = `${date}-${slug}.md`;
  const filepath = path.join(dir, filename);

  fs.writeFileSync(filepath, content);
  console.log('\n✅ Saved to:', filepath);
  return filepath;
}

async function main() {
  const token = await login();
  console.log('✅ Authenticated');

  const runId = await triggerRun(token);
  const result = await confirmRun(token, runId);

  console.log('Run status:', result?.run?.status || result?.status || 'unknown');
  console.log('Cost:', result?.run?.cost_usd || 'unknown');

  const content = extractContent(result);

  if (!content || content.trim().length < 100) {
    console.error('No content returned. Full response:');
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const filepath = saveOutput(content);

  // Print summary block if present
  const summaryMatch = content.match(/BLOG POST SUMMARY[\s\S]+$/);
  if (summaryMatch) {
    console.log('\n' + summaryMatch[0]);
  } else {
    console.log('\n--- FIRST 800 CHARS ---');
    console.log(content.substring(0, 800));
  }
}

main().catch(e => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});
