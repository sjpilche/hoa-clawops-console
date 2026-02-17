/**
 * @file githubPublisher.js
 * @description Publishes blog post markdown to two destinations:
 *
 * PRIMARY: HOAProjectIntake articles webhook
 *   → POST /api/v1/articles/webhook/push (HMAC-signed)
 *   → Stores in Azure SQL DB on Render
 *   → Shows in SEOArticles page at hoaprojectfunding.com/SEOArticles
 *
 * SECONDARY: sjpilche/hoaprojectfunding.com GitHub repo JSON
 *   → src/data/posts/{slug}.json + src/data/posts/index.json
 *   → Netlify auto-deploys the Blog page
 *
 * This is NOT an LLM agent — it's deterministic Node.js code.
 * Called by runs.js when agent config has { special_handler: 'github_publisher' }
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO = 'sjpilche/hoaprojectfunding.com';
const GITHUB_API = 'https://api.github.com';

// ─── HMAC Signature (matches hoaprojectintake webhookSecurity.js) ──────────
function buildWebhookHeaders(body, secret) {
  const timestamp = Date.now().toString();
  const payloadString = timestamp + JSON.stringify(body);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payloadString)
    .digest('hex');

  return {
    'Content-Type': 'application/json',
    'x-webhook-signature': signature,
    'x-webhook-timestamp': timestamp,
  };
}

// ─── Parse YAML frontmatter ─────────────────────────────────────────────────
function parseFrontmatter(md) {
  const match = md.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return {};
  const yaml = match[1];
  const result = {};

  yaml.split('\n').forEach(line => {
    if (line.startsWith('  -') || !line.trim()) return;
    const m = line.match(/^([\w_]+):\s*(.+)/);
    if (m) result[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  });

  return result;
}

// ─── GitHub API helpers ─────────────────────────────────────────────────────
async function getFileSha(filePath, token) {
  const res = await fetch(`${GITHUB_API}/repos/${REPO}/contents/${filePath}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub API error fetching ${filePath}: ${res.status}`);

  const data = await res.json();
  return { sha: data.sha, content: data.content };
}

async function pushFileToGitHub(filePath, content, message, token) {
  const existing = await getFileSha(filePath, token);
  const body = {
    message,
    content: Buffer.from(content, 'utf8').toString('base64'),
  };
  if (existing?.sha) body.sha = existing.sha;

  const res = await fetch(`${GITHUB_API}/repos/${REPO}/contents/${filePath}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub push failed for ${filePath} (${res.status}): ${err}`);
  }

  return await res.json();
}

// ─── Find latest post file ──────────────────────────────────────────────────
function findLatestPost(message) {
  const postsDir = path.join(__dirname, '../../outputs/blog-posts');

  if (!fs.existsSync(postsDir)) {
    throw new Error(`Blog posts directory not found: ${postsDir}`);
  }

  const files = fs.readdirSync(postsDir)
    .filter(f => f.endsWith('.md'))
    .map(f => ({
      name: f,
      path: path.join(postsDir, f),
      mtime: fs.statSync(path.join(postsDir, f)).mtime,
    }))
    .sort((a, b) => b.mtime - a.mtime);

  if (files.length === 0) {
    throw new Error('No markdown posts found in outputs/blog-posts/. Run hoa-content-writer first.');
  }

  // Try to match a specific slug if mentioned in the message
  if (message && message.length > 10) {
    const slugMatch = message.match(/slug[:\s]+([a-z0-9-]+)/i);
    if (slugMatch) {
      const matched = files.find(f => f.name.includes(slugMatch[1]));
      if (matched) return matched;
    }
  }

  return files[0]; // Most recent
}

// ─── Estimate read time ─────────────────────────────────────────────────────
function estimateReadTime(text) {
  const words = (text || '').split(/\s+/).filter(Boolean).length;
  return `${Math.ceil(words / 200)} min read`;
}

// ─── Map topic_category to ArticleDetail category names ────────────────────
const CATEGORY_MAP = {
  compliance: 'Compliance',
  framework: 'Board Governance',
  project: 'Project Planning',
  authority: 'Best Practices',
};

// ─── PRIMARY: Push to HOAProjectIntake articles webhook ─────────────────────
async function pushToIntakeWebhook(postData, markdown) {
  const webhookSecret = process.env.CONTENT_WEBHOOK_SECRET;
  const apiUrl = process.env.CONTENT_API_URL || 'https://hoaprojectfunding-api.onrender.com';

  if (!webhookSecret) {
    console.warn('[GitHubPublisher] CONTENT_WEBHOOK_SECRET not set — skipping intake webhook');
    return { skipped: true };
  }

  const category = CATEGORY_MAP[postData.topic_category] || 'Financing';
  const readTime = estimateReadTime(markdown);

  const article = {
    external_id: postData.slug,           // unique key for upsert
    type: 'internal',
    status: 'published',
    title: postData.title,
    slug: postData.slug,
    excerpt: postData.meta_description,
    body: markdown,                        // full markdown
    category,
    tags: [postData.primary_keyword, 'HOA Funding', 'HOA Loans'].filter(Boolean),
    author: postData.author || 'HOA Project Funding',
    read_time: readTime,
    featured: false,
    published_at: new Date(postData.date + 'T08:00:00Z').toISOString(),
    source: 'hoa-content-writer',
    source_url: null,
  };

  const body = { articles: [article] };
  const headers = buildWebhookHeaders(body, webhookSecret);

  console.log(`[GitHubPublisher] Pushing to intake webhook: ${apiUrl}/api/v1/articles/webhook/push`);

  const res = await fetch(`${apiUrl}/api/v1/articles/webhook/push`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Intake webhook failed (${res.status}): ${err}`);
  }

  const result = await res.json();
  console.log(`[GitHubPublisher] ✅ Intake webhook: upserted=${result.upserted}, errors=${result.errors?.length || 0}`);
  return result;
}

// ─── SECONDARY: Push to GitHub JSON (hoaprojectfunding.com blog) ───────────
async function pushToGitHub(postData, markdown) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.warn('[GitHubPublisher] GITHUB_TOKEN not set — skipping GitHub push');
    return { skipped: true };
  }

  const postJson = {
    slug: postData.slug,
    title: postData.title,
    date: postData.date,
    topic_category: postData.topic_category,
    primary_keyword: postData.primary_keyword,
    meta_title: postData.meta_title,
    meta_description: postData.meta_description,
    word_count: postData.word_count,
    author: postData.author,
    content: markdown,
  };

  // Get current index
  const indexData = await getFileSha('public/data/posts/index.json', token);
  let currentIndex = [];
  if (indexData?.content) {
    try {
      const decoded = Buffer.from(indexData.content.replace(/\n/g, ''), 'base64').toString('utf8');
      currentIndex = JSON.parse(decoded);
      if (!Array.isArray(currentIndex)) currentIndex = [];
    } catch (_) {
      currentIndex = [];
    }
  }

  // Push post JSON
  console.log(`[GitHubPublisher] Pushing to GitHub: public/data/posts/${postData.slug}.json`);
  await pushFileToGitHub(
    `public/data/posts/${postData.slug}.json`,
    JSON.stringify(postJson, null, 2),
    `content: publish '${postData.title}'`,
    token
  );

  // Update index
  const indexEntry = {
    slug: postData.slug,
    title: postData.title,
    date: postData.date,
    topic_category: postData.topic_category,
    meta_description: postData.meta_description,
    word_count: postData.word_count,
    author: postData.author,
  };

  const updatedIndex = currentIndex.filter(p => p.slug !== postData.slug);
  updatedIndex.push(indexEntry);
  updatedIndex.sort((a, b) => new Date(b.date) - new Date(a.date));

  console.log('[GitHubPublisher] Updating GitHub post index...');
  await pushFileToGitHub(
    'public/data/posts/index.json',
    JSON.stringify(updatedIndex, null, 2),
    `content: update post index (add ${postData.slug})`,
    token
  );

  return { posts: updatedIndex.length };
}

// ─── MAIN ───────────────────────────────────────────────────────────────────
async function publishPost(message) {
  console.log('[GitHubPublisher] Starting publish run...');

  // 1. Find the latest post file
  const postFile = findLatestPost(message);
  console.log(`[GitHubPublisher] Publishing: ${postFile.name}`);

  // 2. Read and parse
  const markdown = fs.readFileSync(postFile.path, 'utf8');
  const fm = parseFrontmatter(markdown);

  const slug = fm.slug;
  const title = fm.title || 'Untitled';

  if (!slug) throw new Error(`Post ${postFile.name} is missing 'slug' in frontmatter.`);
  if (!title) throw new Error(`Post ${postFile.name} is missing 'title' in frontmatter.`);

  const postData = {
    slug,
    title,
    date: fm.date || new Date().toISOString().split('T')[0],
    topic_category: fm.topic_category || 'authority',
    primary_keyword: fm.primary_keyword || '',
    meta_title: fm.meta_title || title,
    meta_description: fm.meta_description || '',
    word_count: parseInt(fm.word_count) || 0,
    author: fm.author || 'HOA Project Funding',
  };

  console.log(`[GitHubPublisher] Slug: ${slug} | Title: ${title}`);

  // 3. Push to both destinations
  const [intakeResult, githubResult] = await Promise.allSettled([
    pushToIntakeWebhook(postData, markdown),
    pushToGitHub(postData, markdown),
  ]);

  // 4. Build summary
  const intakeOk = intakeResult.status === 'fulfilled' && !intakeResult.value?.skipped;
  const githubOk = githubResult.status === 'fulfilled' && !githubResult.value?.skipped;

  const intakeStatus = intakeResult.status === 'fulfilled'
    ? (intakeResult.value?.skipped ? '⚠️  Skipped (no CONTENT_WEBHOOK_SECRET)' : `✅ Published to database (upserted: ${intakeResult.value?.upserted || 1})`)
    : `❌ Failed: ${intakeResult.reason?.message}`;

  const githubStatus = githubResult.status === 'fulfilled'
    ? (githubResult.value?.skipped ? '⚠️  Skipped (no GITHUB_TOKEN)' : `✅ Pushed to GitHub (${githubResult.value?.posts} posts in index)`)
    : `❌ Failed: ${githubResult.reason?.message}`;

  if (!intakeOk && !githubOk) {
    throw new Error('Both publish destinations failed. Check logs above for details.');
  }

  const liveUrl = `https://hoaprojectfunding.com/BlogPost?slug=${slug}`;
  const articlesUrl = 'https://hoaprojectfunding.com/SEOArticles';

  console.log(`[GitHubPublisher] ✅ Done: ${slug}`);

  return `✅ BLOG POST PUBLISHED
==========================================
Title:    ${title}
Slug:     ${slug}
Category: ${postData.topic_category}
Words:    ${postData.word_count}
Date:     ${postData.date}

DESTINATIONS:
  1. HOAProjectIntake DB (Render/Azure SQL):
     ${intakeStatus}
     📋 Articles page: ${articlesUrl}

  2. GitHub / Netlify Blog:
     ${githubStatus}
     📖 Blog post: ${liveUrl}

Source file: ${postFile.name}
Netlify deploys automatically on GitHub push (~60s).`;
}

module.exports = { publishPost };
