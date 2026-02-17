/**
 * @file contentQueue.js
 * @description Content queue routes — manage and publish social media posts.
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

router.use(authenticate);

// ─── Facebook Graph API helper ─────────────────────────────────────────────

async function postToFacebook(content) {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const token = process.env.FACEBOOK_ACCESS_TOKEN;
  const version = process.env.FACEBOOK_GRAPH_API_VERSION || 'v22.0';

  if (!pageId || !token) {
    throw new Error('FACEBOOK_PAGE_ID or FACEBOOK_ACCESS_TOKEN not set in .env.local');
  }

  const url = `https://graph.facebook.com/${version}/${pageId}/feed`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: content,
      access_token: token,
    }),
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.error?.message || `Facebook API error: ${response.status}`);
  }

  return data; // { id: "page_id_post_id" }
}

// ─── GET /api/content-queue ────────────────────────────────────────────────

router.get('/', (req, res) => {
  try {
    const { status, platform, limit = 50 } = req.query;

    let query = 'SELECT * FROM content_queue WHERE 1=1';
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

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'content is required' });
    }

    const id = uuidv4();
    db.run(
      `INSERT INTO content_queue (id, platform, post_type, content, topic, source_agent, status, scheduled_for)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [id, platform, post_type, content.trim(), topic || null, source_agent || null, scheduled_for || null]
    );

    const post = db.get('SELECT * FROM content_queue WHERE id = ?', [id]);
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
    const post = db.get('SELECT * FROM content_queue WHERE id = ?', [req.params.id]);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }
    db.run('DELETE FROM content_queue WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Post deleted from queue' });
  } catch (error) {
    console.error('[ContentQueue] Error deleting post:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── POST /api/content-queue/:id/publish ──────────────────────────────────

router.post('/:id/publish', async (req, res) => {
  try {
    const post = db.get('SELECT * FROM content_queue WHERE id = ?', [req.params.id]);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }
    if (post.status === 'posted') {
      return res.status(400).json({ success: false, error: 'Post already published' });
    }

    console.log(`[ContentQueue] Publishing post ${post.id} to Facebook...`);

    try {
      const fbResult = await postToFacebook(post.content);

      db.run(
        `UPDATE content_queue
         SET status = 'posted', posted_at = datetime('now'), facebook_post_id = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [fbResult.id, post.id]
      );

      console.log(`[ContentQueue] ✅ Posted to Facebook: ${fbResult.id}`);
      res.json({ success: true, facebook_post_id: fbResult.id, message: 'Published to Facebook successfully' });
    } catch (fbError) {
      db.run(
        `UPDATE content_queue
         SET status = 'failed', error_message = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [fbError.message, post.id]
      );

      console.error(`[ContentQueue] ❌ Facebook publish failed:`, fbError.message);
      res.status(502).json({ success: false, error: fbError.message });
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
    // Find all pending posts that are scheduled for now or earlier (or have no schedule = post immediately)
    const duePosts = db.all(
      `SELECT * FROM content_queue
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
        const fbResult = await postToFacebook(post.content);
        db.run(
          `UPDATE content_queue
           SET status = 'posted', posted_at = datetime('now'), facebook_post_id = ?, updated_at = datetime('now')
           WHERE id = ?`,
          [fbResult.id, post.id]
        );
        published++;
        results.push({ id: post.id, status: 'posted', facebook_post_id: fbResult.id });
        console.log(`[ContentQueue] ✅ Published post ${post.id}: ${fbResult.id}`);
      } catch (fbError) {
        db.run(
          `UPDATE content_queue
           SET status = 'failed', error_message = ?, updated_at = datetime('now')
           WHERE id = ?`,
          [fbError.message, post.id]
        );
        failed++;
        results.push({ id: post.id, status: 'failed', error: fbError.message });
        console.error(`[ContentQueue] ❌ Failed post ${post.id}:`, fbError.message);
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
      `INSERT INTO content_queue (id, platform, post_type, content, topic, source_agent, status, scheduled_for)
       VALUES (?, 'facebook', ?, ?, ?, 'hoa-social-media', 'pending', ?)`,
      [id, post_type, content.trim(), topic, scheduled_for || null]
    );

    const post = db.get('SELECT * FROM content_queue WHERE id = ?', [id]);
    console.log(`[ContentQueue] ✅ Generated and queued post: ${id}`);
    res.status(201).json({ success: true, post });
  } catch (error) {
    console.error('[ContentQueue] Error generating content:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
