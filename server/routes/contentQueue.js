/**
 * @file contentQueue.js
 * @description Content queue routes with campaign-level isolation — manage and publish social media posts.
 *
 * ENDPOINTS:
 *   GET    /api/content-queue              — List all queued posts
 *   POST   /api/content-queue              — Add a post to the queue
 *   DELETE /api/content-queue/:id          — Remove a post from the queue
 *   POST   /api/content-queue/:id/publish  — Publish a specific post to Facebook now
 *   POST   /api/content-queue/publish-due  — Publish all posts due now (called by scheduler)
 *   POST   /api/content-queue/generate     — Run the social-media agent to generate content
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { authenticate } = require('../middleware/auth');
const { optionalCampaignContext } = require('../middleware/campaignContext');
const { optionalCampaignTableContext } = require('../middleware/campaignTableContext');

router.use(authenticate);
router.use(optionalCampaignContext);
router.use(optionalCampaignTableContext);

// ─── Facebook Posting Helper ──────────────────────────────────────────────────

// Resolves the right page credentials based on source_agent ('jake' vs 'hoa'/default)
function getFacebookCreds(sourceAgent) {
  const version = process.env.FACEBOOK_GRAPH_API_VERSION || 'v22.0';
  const isJake = sourceAgent && (sourceAgent.startsWith('jake') || sourceAgent.startsWith('cfo'));

  const pageId = isJake
    ? process.env.JAKE_FACEBOOK_PAGE_ID
    : process.env.FACEBOOK_PAGE_ID;
  const token = isJake
    ? process.env.JAKE_FACEBOOK_ACCESS_TOKEN
    : process.env.FACEBOOK_ACCESS_TOKEN;
  const pageName = isJake
    ? (process.env.JAKE_FACEBOOK_PAGE_NAME || 'Jake - Construction AI CFO')
    : (process.env.FACEBOOK_PAGE_NAME || 'HOA Project Funding');

  if (!pageId || !token) {
    const which = isJake ? 'JAKE_FACEBOOK_PAGE_ID / JAKE_FACEBOOK_ACCESS_TOKEN' : 'FACEBOOK_PAGE_ID / FACEBOOK_ACCESS_TOKEN';
    throw new Error(`${which} not set in .env.local`);
  }

  return { pageId, token, version, pageName };
}

async function postToFacebook(content, sourceAgent) {
  const { pageId, token, version } = getFacebookCreds(sourceAgent);
  const url = `https://graph.facebook.com/${version}/${pageId}/feed`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: content, access_token: token }),
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.error?.message || `Facebook API error: ${response.status}`);
  }

  return data; // { id: "page_id_post_id" }
}

// Publish post (Facebook only)
async function publishPost(content, platform, sourceAgent) {
  const supported = {
    facebook: () => postToFacebook(content, sourceAgent),
  };

  if (!supported[platform]) {
    throw new Error(`Unsupported platform: ${platform}. Currently supported: facebook`);
  }

  return supported[platform]();
}

// ─── GET /api/content-queue ────────────────────────────────────────────────

router.get('/', (req, res) => {
  try {
    const { status, platform, limit = 50 } = req.query;
    const tableName = req.campaignTables?.content_queue || 'content_queue';

    let query = `SELECT * FROM ${tableName} WHERE 1=1`;
    const params = [];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    if (platform) {
      query += ' AND platform = ?';
      params.push(platform);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit));

    const posts = db.all(query, params);
    res.json({ success: true, count: posts.length, posts });
  } catch (error) {
    console.error('[ContentQueue] Error listing queue:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── POST /api/content-queue ───────────────────────────────────────────────

router.post('/', (req, res) => {
  try {
    const { content, topic, platform = 'facebook', post_type = 'page', scheduled_for, source_agent } = req.body;
    const tableName = req.campaignTables?.content_queue || 'content_queue';

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'content is required' });
    }

    const id = uuidv4();
    db.run(
      `INSERT INTO ${tableName} (id, platform, post_type, content, topic, source_agent, status, scheduled_for)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [id, platform, post_type, content.trim(), topic || null, source_agent || null, scheduled_for || null]
    );

    const post = db.get(`SELECT * FROM ${tableName} WHERE id = ?`, [id]);
    console.log(`[ContentQueue] ✅ Added post to queue: ${id} (${platform}/${post_type})`);
    res.status(201).json({ success: true, post });
  } catch (error) {
    console.error('[ContentQueue] Error adding to queue:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── DELETE /api/content-queue/:id ────────────────────────────────────────

router.delete('/:id', (req, res) => {
  try {
    const tableName = req.campaignTables?.content_queue || 'content_queue';
    const post = db.get(`SELECT * FROM ${tableName} WHERE id = ?`, [req.params.id]);

    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    db.run(`DELETE FROM ${tableName} WHERE id = ?`, [req.params.id]);
    res.json({ success: true, message: 'Post deleted from queue' });
  } catch (error) {
    console.error('[ContentQueue] Error deleting post:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── POST /api/content-queue/:id/publish ──────────────────────────────────

router.post('/:id/publish', async (req, res) => {
  try {
    const tableName = req.campaignTables?.content_queue || 'content_queue';
    const post = db.get(`SELECT * FROM ${tableName} WHERE id = ?`, [req.params.id]);

    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }
    if (post.status === 'posted') {
      return res.status(400).json({ success: false, error: 'Post already published' });
    }

    console.log(`[ContentQueue] Publishing post ${post.id} to Facebook...`);

    try {
      const result = await publishPost(post.content, post.platform, post.source_agent);

      db.run(
        `UPDATE ${tableName}
         SET status = 'posted', posted_at = datetime('now'), external_post_id = ?, metadata = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [result.id, JSON.stringify(result), post.id]
      );

      console.log(`[ContentQueue] ✅ Posted to ${post.platform}: ${result.id}`);
      res.json({ success: true, external_post_id: result.id, platform: post.platform, message: `Published to ${post.platform} successfully` });
    } catch (publishError) {
      db.run(
        `UPDATE ${tableName}
         SET status = 'failed', error_message = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [publishError.message, post.id]
      );

      console.error(`[ContentQueue] ❌ ${post.platform} publish failed:`, publishError.message);
      res.status(502).json({ success: false, error: publishError.message });
    }
  } catch (error) {
    console.error('[ContentQueue] Error publishing post:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── POST /api/content-queue/publish-due ──────────────────────────────────
// Called by the scheduler agent to publish any posts that are due

router.post('/publish-due', async (req, res) => {
  try {
    const tableName = req.campaignTables?.content_queue || 'content_queue';

    // Find all pending posts that are scheduled for now or earlier (or have no schedule = post immediately)
    const duePosts = db.all(
      `SELECT * FROM ${tableName}
       WHERE status = 'pending'
         AND (scheduled_for IS NULL OR scheduled_for <= datetime('now'))
       ORDER BY scheduled_for ASC, created_at ASC`,
      []
    );

    if (duePosts.length === 0) {
      return res.json({ success: true, message: 'No posts due', published: 0, failed: 0 });
    }

    console.log(`[ContentQueue] Publishing ${duePosts.length} due post(s)...`);

    let published = 0;
    let failed = 0;
    const results = [];

    for (const post of duePosts) {
      try {
        const result = await publishPost(post.content, post.platform, post.source_agent);
        db.run(
          `UPDATE ${tableName}
           SET status = 'posted', posted_at = datetime('now'), external_post_id = ?, metadata = ?, updated_at = datetime('now')
           WHERE id = ?`,
          [result.id, JSON.stringify(result), post.id]
        );
        published++;
        results.push({ id: post.id, status: 'posted', platform: post.platform, external_post_id: result.id });
        console.log(`[ContentQueue] ✅ Published post ${post.id} to ${post.platform}: ${result.id}`);
      } catch (publishError) {
        db.run(
          `UPDATE ${tableName}
           SET status = 'failed', error_message = ?, updated_at = datetime('now')
           WHERE id = ?`,
          [publishError.message, post.id]
        );
        failed++;
        results.push({ id: post.id, status: 'failed', platform: post.platform, error: publishError.message });
        console.error(`[ContentQueue] ❌ Failed to post ${post.id} to ${post.platform}:`, publishError.message);
      }
    }

    res.json({ success: true, published, failed, results });
  } catch (error) {
    console.error('[ContentQueue] Error in publish-due:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── POST /api/content-queue/generate ─────────────────────────────────────
// Ask the hoa-social-media agent to generate a post and drop it in the queue

router.post('/generate', async (req, res) => {
  try {
    const { topic, post_type = 'page', scheduled_for } = req.body;
    const tableName = req.campaignTables?.content_queue || 'content_queue';

    if (!topic) {
      return res.status(400).json({ success: false, error: 'topic is required' });
    }

    const openclawBridge = require('../services/openclawBridge');

    const prompt = post_type === 'group'
      ? `Generate a Facebook GROUP discussion post about: "${topic}". No links, peer-to-peer tone, asks a question to spark discussion. Return ONLY the post text, nothing else.`
      : `Generate a Facebook company PAGE post about: "${topic}". Include a clear CTA to www.hoaprojectfunding.com and 3-5 hashtags. Return ONLY the post text, nothing else.`;

    console.log(`[ContentQueue] Generating ${post_type} post for topic: "${topic}"`);

    const result = await openclawBridge.runAgent('hoa-social-media', {
      openclawId: 'hoa-social-media',
      message: prompt,
    });

    // The bridge wraps output as JSON: { type: 'result', result: '...actual text...' }
    // Parse it out if needed, otherwise fall back to raw output
    let content = result?.output || result?.result || result?.content || '';
    try {
      const parsed = JSON.parse(content);
      if (parsed?.result) content = parsed.result;
    } catch (_) { /* not JSON, use as-is */ }

    if (!content || content.trim().length === 0) {
      return res.status(500).json({ success: false, error: 'Agent returned empty content' });
    }

    // Save to queue
    const id = uuidv4();
    db.run(
      `INSERT INTO ${tableName} (id, platform, post_type, content, topic, source_agent, status, scheduled_for)
       VALUES (?, 'facebook', ?, ?, ?, 'hoa-social-media', 'pending', ?)`,
      [id, post_type, content.trim(), topic, scheduled_for || null]
    );

    const post = db.get(`SELECT * FROM ${tableName} WHERE id = ?`, [id]);
    console.log(`[ContentQueue] ✅ Generated and queued post: ${id}`);
    res.status(201).json({ success: true, post });
  } catch (error) {
    console.error('[ContentQueue] Error generating content:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── POST /api/content-queue/generate-jake ────────────────────────────────
// Ask jake-social-scheduler to generate a post for the Jake Facebook page

router.post('/generate-jake', async (req, res) => {
  try {
    const { topic, scheduled_for } = req.body;
    const tableName = req.campaignTables?.content_queue || 'content_queue';

    if (!topic) {
      return res.status(400).json({ success: false, error: 'topic is required' });
    }

    const openclawBridge = require('../services/openclawBridge');

    const prompt = `Generate a Facebook page post for Jake - Construction AI CFO about: "${topic}".
Audience: small GC owners and construction CFOs.
Tone: direct, peer-to-peer, no fluff — like Jake is talking to a fellow CFO.
Include a clear CTA. Keep it under 300 words. Return ONLY the post text, nothing else.`;

    console.log(`[ContentQueue] Generating Jake Facebook post for topic: "${topic}"`);

    const result = await openclawBridge.runAgent('jake-social-scheduler', {
      openclawId: 'jake-social-scheduler',
      message: prompt,
    });

    let content = result?.output || result?.result || result?.content || '';
    try {
      const parsed = JSON.parse(content);
      if (parsed?.result) content = parsed.result;
      else if (parsed?.payloads?.[0]?.text) content = parsed.payloads[0].text;
    } catch (_) { /* not JSON, use as-is */ }

    if (!content || content.trim().length === 0) {
      return res.status(500).json({ success: false, error: 'Agent returned empty content' });
    }

    const id = uuidv4();
    db.run(
      `INSERT INTO ${tableName} (id, platform, post_type, content, topic, source_agent, status, scheduled_for)
       VALUES (?, 'facebook', 'page', ?, ?, 'jake-social-scheduler', 'pending', ?)`,
      [id, content.trim(), topic, scheduled_for || null]
    );

    const post = db.get(`SELECT * FROM ${tableName} WHERE id = ?`, [id]);
    console.log(`[ContentQueue] ✅ Generated Jake post and queued: ${id}`);
    res.status(201).json({ success: true, post });
  } catch (error) {
    console.error('[ContentQueue] Error generating Jake content:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
