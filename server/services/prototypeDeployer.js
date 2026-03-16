/**
 * @file prototypeDeployer.js
 * @description Deployment pipeline for Software Factory prototypes.
 *
 * Flow: data/prototypes/{name}/ → create GitHub repo → push code → deploy to Vercel
 *
 * Leverages existing GitHub API patterns from githubPublisher.js.
 * Stores deploy_url in opp_prototypes table, runs health check.
 *
 * Handler: prototype_deployer
 * Cost: $0 (GitHub + Vercel free tier)
 */

'use strict';

const { get, run, all } = require('../db/connection');
const fs = require('fs');
const path = require('path');

const GITHUB_API = 'https://api.github.com';
const GITHUB_ORG = process.env.GITHUB_ORG || process.env.GITHUB_USERNAME || 'sjpilche';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID;

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

// ── GitHub Operations ────────────────────────────────────────────────────────

async function githubFetch(endpoint, options = {}) {
  if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN not configured');

  const url = endpoint.startsWith('http') ? endpoint : `${GITHUB_API}${endpoint}`;
  const resp = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`GitHub API ${resp.status}: ${body.slice(0, 200)}`);
  }

  return resp.json();
}

/**
 * Create a new GitHub repo (or return existing one).
 */
async function createRepo(name, description) {
  try {
    // Check if exists
    const existing = await githubFetch(`/repos/${GITHUB_ORG}/${name}`).catch(() => null);
    if (existing) {
      console.log(`[Deployer] Repo ${GITHUB_ORG}/${name} already exists`);
      return existing;
    }
  } catch {}

  console.log(`[Deployer] Creating repo ${GITHUB_ORG}/${name}...`);
  return githubFetch('/user/repos', {
    method: 'POST',
    body: JSON.stringify({
      name,
      description: description?.slice(0, 350) || 'Auto-generated prototype',
      private: false,
      auto_init: true, // Creates main branch with README
    }),
  });
}

/**
 * Push all files from a local directory to a GitHub repo.
 * Uses the Git Data API (create tree + commit) for atomic push.
 */
async function pushFilesToRepo(repoName, localDir) {
  const repoPath = `${GITHUB_ORG}/${repoName}`;

  // Get the current commit SHA for main branch
  const ref = await githubFetch(`/repos/${repoPath}/git/ref/heads/main`);
  const latestCommitSha = ref.object.sha;
  const commit = await githubFetch(`/repos/${repoPath}/git/commits/${latestCommitSha}`);
  const baseTreeSha = commit.tree.sha;

  // Read all files from local dir
  const files = readDirRecursive(localDir);
  if (files.length === 0) throw new Error(`No files found in ${localDir}`);

  // Create blobs for each file
  const treeItems = [];
  for (const file of files) {
    const blob = await githubFetch(`/repos/${repoPath}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({
        content: file.content,
        encoding: 'utf-8',
      }),
    });

    treeItems.push({
      path: file.path,
      mode: '100644',
      type: 'blob',
      sha: blob.sha,
    });
  }

  // Create tree
  const tree = await githubFetch(`/repos/${repoPath}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: treeItems,
    }),
  });

  // Create commit
  const newCommit = await githubFetch(`/repos/${repoPath}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message: 'Deploy prototype from Software Factory',
      tree: tree.sha,
      parents: [latestCommitSha],
    }),
  });

  // Update ref
  await githubFetch(`/repos/${repoPath}/git/refs/heads/main`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: newCommit.sha }),
  });

  console.log(`[Deployer] Pushed ${files.length} files to ${repoPath}`);
  return { fileCount: files.length, commitSha: newCommit.sha };
}

/**
 * Read all files from a directory recursively.
 */
function readDirRecursive(dir, basePath = '') {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = basePath ? `${basePath}/${entry.name}` : entry.name;

    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '_launch_copy.json') {
      continue; // Skip hidden files, node_modules, internal files
    }

    if (entry.isDirectory()) {
      results.push(...readDirRecursive(fullPath, relPath));
    } else {
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        results.push({ path: relPath, content });
      } catch {}
    }
  }

  return results;
}

// ── Vercel Deployment ────────────────────────────────────────────────────────

/**
 * Import a GitHub repo into Vercel for automatic deployments.
 */
async function deployToVercel(repoName) {
  if (!VERCEL_TOKEN) {
    console.warn('[Deployer] VERCEL_TOKEN not configured — skipping Vercel deploy');
    return { url: `https://github.com/${GITHUB_ORG}/${repoName}`, source: 'github-only' };
  }

  const teamParam = VERCEL_TEAM_ID ? `?teamId=${VERCEL_TEAM_ID}` : '';

  try {
    // Check if project already exists
    const existingResp = await fetch(
      `https://api.vercel.com/v9/projects/${repoName}${teamParam}`,
      { headers: { Authorization: `Bearer ${VERCEL_TOKEN}` } }
    );

    if (existingResp.ok) {
      const existing = await existingResp.json();
      const deployUrl = existing.targets?.production?.url || `${repoName}.vercel.app`;
      console.log(`[Deployer] Vercel project already exists: ${deployUrl}`);
      return { url: `https://${deployUrl}`, source: 'vercel-existing' };
    }
  } catch {}

  // Create new Vercel project linked to GitHub repo
  try {
    const resp = await fetch(`https://api.vercel.com/v10/projects${teamParam}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${VERCEL_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: repoName,
        gitRepository: {
          type: 'github',
          repo: `${GITHUB_ORG}/${repoName}`,
        },
        framework: null, // Auto-detect
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.warn(`[Deployer] Vercel create failed: ${err.slice(0, 200)}`);
      return { url: `https://github.com/${GITHUB_ORG}/${repoName}`, source: 'github-only' };
    }

    const project = await resp.json();
    const deployUrl = `${repoName}.vercel.app`;
    console.log(`[Deployer] Vercel project created: ${deployUrl}`);
    return { url: `https://${deployUrl}`, source: 'vercel' };
  } catch (err) {
    console.warn(`[Deployer] Vercel deploy error: ${err.message}`);
    return { url: `https://github.com/${GITHUB_ORG}/${repoName}`, source: 'github-only' };
  }
}

// ── Stripe Product Auto-Creation ─────────────────────────────────────────────

/**
 * Create a Stripe product + price for a prototype.
 * Returns { productId, priceId } or null if Stripe isn't configured.
 */
async function createStripeProduct(name, description, priceCents = 999) {
  if (!STRIPE_SECRET_KEY) {
    console.warn('[Deployer] STRIPE_SECRET_KEY not configured — skipping Stripe product creation');
    return null;
  }

  try {
    // Create product
    const productResp = await fetch('https://api.stripe.com/v1/products', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        name,
        description: (description || 'Auto-generated SaaS product').slice(0, 500),
        'metadata[source]': 'software_factory',
        'metadata[auto_generated]': 'true',
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!productResp.ok) {
      console.warn(`[Deployer] Stripe product create failed: ${(await productResp.text()).slice(0, 200)}`);
      return null;
    }

    const product = await productResp.json();

    // Create price (one-time payment)
    const priceResp = await fetch('https://api.stripe.com/v1/prices', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        product: product.id,
        unit_amount: String(priceCents),
        currency: 'usd',
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!priceResp.ok) {
      console.warn(`[Deployer] Stripe price create failed: ${(await priceResp.text()).slice(0, 200)}`);
      return { productId: product.id, priceId: null };
    }

    const price = await priceResp.json();
    console.log(`[Deployer] Stripe product created: ${product.id}, price: ${price.id} ($${(priceCents / 100).toFixed(2)})`);
    return { productId: product.id, priceId: price.id };
  } catch (err) {
    console.warn(`[Deployer] Stripe error: ${err.message}`);
    return null;
  }
}

/**
 * Inject env vars into prototype's .env or .env.local file before pushing.
 * Replaces placeholder values with real ones (e.g., STRIPE_PRICE_ID).
 */
function injectEnvVars(localDir, vars) {
  const envPath = path.join(localDir, '.env.local');
  const envExamplePath = path.join(localDir, '.env.example');

  // Start from .env.example if it exists, otherwise create fresh
  let envContent = '';
  if (fs.existsSync(envExamplePath)) {
    envContent = fs.readFileSync(envExamplePath, 'utf8');
  } else if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  }

  // Inject/replace each var
  for (const [key, value] of Object.entries(vars)) {
    if (!value) continue;
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      envContent += `\n${key}=${value}`;
    }
  }

  fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf8');
  console.log(`[Deployer] Injected ${Object.keys(vars).length} env vars into .env.local`);
}

// ── Health Check ─────────────────────────────────────────────────────────────

async function healthCheck(url) {
  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      redirect: 'follow',
    });
    return { healthy: resp.ok, status: resp.status };
  } catch {
    return { healthy: false, status: 0 };
  }
}

// ── Main Pipeline ────────────────────────────────────────────────────────────

/**
 * Deploy a single prototype: GitHub repo → push files → Vercel → health check.
 *
 * @param {number} prototypeId — ID from opp_prototypes
 */
async function deployPrototype(prototypeId) {
  const proto = get('SELECT p.*, c.pain_summary FROM opp_prototypes p JOIN opp_clusters c ON p.cluster_id = c.id WHERE p.id = ?', [prototypeId]);
  if (!proto) throw new Error(`Prototype ${prototypeId} not found`);

  const localDir = path.resolve(process.cwd(), 'data', 'prototypes', proto.name.replace(/[^a-zA-Z0-9_-]/g, '_'));
  if (!fs.existsSync(localDir)) throw new Error(`Prototype files not found at ${localDir}`);

  console.log(`[Deployer] Deploying "${proto.name}" from ${localDir}...`);

  run("UPDATE opp_prototypes SET status = 'deploying', updated_at = datetime('now') WHERE id = ?", [prototypeId]);

  try {
    // Step 1: Create GitHub repo
    const repoName = `proto-${proto.name}`.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 100);
    await createRepo(repoName, proto.pain_summary || proto.description);

    // Step 2: Create Stripe product (before push so we can inject env vars)
    let stripeResult = null;
    if (proto.template_type === 'saas' || proto.template_type === 'landing') {
      stripeResult = await createStripeProduct(
        proto.name,
        proto.pain_summary || proto.description,
        999 // $9.99 default — can be overridden per prototype
      );

      // Inject Stripe IDs into prototype env before pushing
      if (stripeResult) {
        injectEnvVars(localDir, {
          STRIPE_PRICE_ID: stripeResult.priceId || '',
          STRIPE_PRODUCT_ID: stripeResult.productId || '',
        });
      }
    }

    // Step 3: Push files (with Stripe env vars injected)
    const { fileCount, commitSha } = await pushFilesToRepo(repoName, localDir);

    // Step 4: Deploy to Vercel
    const { url: deployUrl, source } = await deployToVercel(repoName);

    // Step 5: Update prototype record
    const ghRepoPath = `${GITHUB_ORG}/${repoName}`;
    run(`UPDATE opp_prototypes SET
      status = 'deployed',
      deploy_url = ?,
      repo_url = ?,
      github_repo = ?,
      stripe_product_id = ?,
      deployed_at = datetime('now'),
      updated_at = datetime('now')
      WHERE id = ?`,
      [deployUrl, `https://github.com/${ghRepoPath}`, ghRepoPath, stripeResult?.productId || null, prototypeId]);

    // Step 5: Health check (wait 15s for deploy to propagate)
    let health = { healthy: false, status: 0 };
    if (source !== 'github-only') {
      await new Promise(r => setTimeout(r, 15000));
      health = await healthCheck(deployUrl);
      if (health.healthy) {
        run("UPDATE opp_prototypes SET status = 'monitoring', updated_at = datetime('now') WHERE id = ?", [prototypeId]);
      }
    }

    // Step 6: Discord notification
    try {
      const discord = require('./discordNotifier');
      await discord.sendEmbed({
        title: `Deployed: ${proto.name}`,
        description: proto.pain_summary || proto.description,
        color: health.healthy ? 0x22c55e : 0xf59e0b,
        fields: [
          { name: 'URL', value: deployUrl, inline: false },
          { name: 'Files', value: `${fileCount}`, inline: true },
          { name: 'Source', value: source, inline: true },
          { name: 'Health', value: health.healthy ? `OK (${health.status})` : 'Pending', inline: true },
        ],
      });
    } catch {}

    return {
      prototypeId,
      name: proto.name,
      deployUrl,
      githubRepo: `${GITHUB_ORG}/${repoName}`,
      fileCount,
      commitSha,
      source,
      healthy: health.healthy,
    };
  } catch (error) {
    run("UPDATE opp_prototypes SET status = 'deploy_failed', updated_at = datetime('now') WHERE id = ?", [prototypeId]);
    throw error;
  }
}

/**
 * Deploy all scaffolded prototypes that haven't been deployed yet.
 */
async function deployPending(limit = 3) {
  const pending = all(`
    SELECT id FROM opp_prototypes
    WHERE status = 'scaffolded'
    ORDER BY created_at ASC
    LIMIT ?
  `, [limit]);

  const results = [];
  for (const proto of pending) {
    try {
      const result = await deployPrototype(proto.id);
      results.push(result);
    } catch (error) {
      results.push({ prototypeId: proto.id, error: error.message });
    }
  }

  return { deployed: results.filter(r => !r.error).length, failed: results.filter(r => r.error).length, results };
}

module.exports = {
  deployPrototype,
  deployPending,
  createRepo,
  pushFilesToRepo,
  healthCheck,
  createStripeProduct,
};
