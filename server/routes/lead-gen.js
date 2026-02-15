/**
 * @file lead-gen.js
 * @description API endpoints for Lead Generation Networker
 *
 * Endpoints:
 * - GET    /api/lead-gen/networker/queue           List engagement opportunities
 * - GET    /api/lead-gen/networker/queue/:id       Get single opportunity
 * - PATCH  /api/lead-gen/networker/queue/:id       Approve/reject/edit draft
 * - POST   /api/lead-gen/networker/queue/:id/post  Post approved response
 * - GET    /api/lead-gen/networker/communities     List tracked communities
 * - GET    /api/lead-gen/networker/stats           Dashboard metrics
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');

const router = express.Router();

// ==============================================================================
// ENGAGEMENT QUEUE ENDPOINTS
// ==============================================================================

/**
 * GET /api/lead-gen/networker/queue
 * List engagement opportunities with filters
 *
 * Query params:
 * - status: pending_review, approved, rejected, posted, expired
 * - platform: facebook, reddit, linkedin, etc.
 * - min_relevance: minimum relevance score (1-100)
 * - limit: max results (default 50)
 */
router.get('/networker/queue', async (req, res) => {
  try {
    const { status, platform, min_relevance, limit = 50 } = req.query;

    let sql = 'SELECT * FROM lg_engagement_queue WHERE 1=1';
    const params = [];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    if (platform) {
      sql += ' AND platform = ?';
      params.push(platform);
    }

    if (min_relevance) {
      sql += ' AND relevance_score >= ?';
      params.push(parseInt(min_relevance));
    }

    sql += ' ORDER BY relevance_score DESC, created_at DESC LIMIT ?';
    params.push(parseInt(limit));

    const opportunities = await db.all(sql, params);

    res.json({
      success: true,
      count: opportunities.length,
      opportunities
    });
  } catch (error) {
    console.error('[Lead Gen API] Error fetching queue:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/lead-gen/networker/queue/:id
 * Get single engagement opportunity with full details
 */
router.get('/networker/queue/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const opportunity = await db.get(
      'SELECT * FROM lg_engagement_queue WHERE id = ?',
      [id]
    );

    if (!opportunity) {
      return res.status(404).json({
        success: false,
        error: 'Opportunity not found'
      });
    }

    res.json({
      success: true,
      opportunity
    });
  } catch (error) {
    console.error('[Lead Gen API] Error fetching opportunity:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PATCH /api/lead-gen/networker/queue/:id
 * Approve, reject, or edit a draft response
 *
 * Body:
 * - action: 'approve', 'reject', 'edit'
 * - draft_response: (optional) edited response text
 * - notes: (optional) your notes
 */
router.patch('/networker/queue/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { action, draft_response, notes } = req.body;

    if (!action || !['approve', 'reject', 'edit'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid action. Must be: approve, reject, or edit'
      });
    }

    const opportunity = await db.get(
      'SELECT * FROM lg_engagement_queue WHERE id = ?',
      [id]
    );

    if (!opportunity) {
      return res.status(404).json({
        success: false,
        error: 'Opportunity not found'
      });
    }

    let newStatus = opportunity.status;
    let approvedAt = opportunity.approved_at;

    switch (action) {
      case 'approve':
        newStatus = 'approved';
        approvedAt = new Date().toISOString();
        break;
      case 'reject':
        newStatus = 'rejected';
        break;
      case 'edit':
        // Keep current status, just update draft
        break;
    }

    const updates = {
      status: newStatus,
      approved_at: approvedAt,
      draft_response: draft_response || opportunity.draft_response,
      notes: notes || opportunity.notes
    };

    await db.run(
      `UPDATE lg_engagement_queue
       SET status = ?, approved_at = ?, draft_response = ?, notes = ?
       WHERE id = ?`,
      [updates.status, updates.approved_at, updates.draft_response, updates.notes, id]
    );

    const updated = await db.get('SELECT * FROM lg_engagement_queue WHERE id = ?', [id]);

    res.json({
      success: true,
      message: `Opportunity ${action}ed successfully`,
      opportunity: updated
    });
  } catch (error) {
    console.error('[Lead Gen API] Error updating opportunity:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/lead-gen/networker/queue/:id/post
 * Post an approved response to the platform
 *
 * NOTE: This triggers the agent to actually post the response.
 * The agent will update the record with posted_at timestamp.
 */
router.post('/networker/queue/:id/post', async (req, res) => {
  try {
    const { id } = req.params;

    const opportunity = await db.get(
      'SELECT * FROM lg_engagement_queue WHERE id = ?',
      [id]
    );

    if (!opportunity) {
      return res.status(404).json({
        success: false,
        error: 'Opportunity not found'
      });
    }

    if (opportunity.status !== 'approved') {
      return res.status(400).json({
        success: false,
        error: 'Opportunity must be approved before posting'
      });
    }

    // TODO: Trigger agent to post response
    // For now, we'll mark it as posted immediately
    // In production, this would queue a task for the agent

    await db.run(
      `UPDATE lg_engagement_queue
       SET status = 'posted', posted_at = datetime('now')
       WHERE id = ?`,
      [id]
    );

    const updated = await db.get('SELECT * FROM lg_engagement_queue WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'Response posted successfully',
      opportunity: updated
    });
  } catch (error) {
    console.error('[Lead Gen API] Error posting response:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==============================================================================
// COMMUNITY ENDPOINTS
// ==============================================================================

/**
 * GET /api/lead-gen/networker/communities
 * List all tracked communities with stats
 *
 * Query params:
 * - platform: filter by platform
 * - status: filter by our_status
 * - active_only: true/false (default true)
 */
router.get('/networker/communities', async (req, res) => {
  try {
    const { platform, status, active_only = 'true' } = req.query;

    let sql = 'SELECT * FROM lg_community_accounts WHERE 1=1';
    const params = [];

    if (platform) {
      sql += ' AND platform = ?';
      params.push(platform);
    }

    if (status) {
      sql += ' AND our_status = ?';
      params.push(status);
    }

    if (active_only === 'true') {
      sql += ' AND is_active = 1';
    }

    sql += ' ORDER BY avg_engagement DESC, posts_made DESC';

    const communities = await db.all(sql, params);

    res.json({
      success: true,
      count: communities.length,
      communities
    });
  } catch (error) {
    console.error('[Lead Gen API] Error fetching communities:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==============================================================================
// STATS & DASHBOARD ENDPOINTS
// ==============================================================================

/**
 * GET /api/lead-gen/networker/stats
 * Dashboard metrics and performance stats
 */
router.get('/networker/stats', async (req, res) => {
  try {
    // Pending review count
    const pendingCount = await db.get(
      "SELECT COUNT(*) as count FROM lg_engagement_queue WHERE status = 'pending_review'"
    );

    // Posted today count
    const postedToday = await db.get(
      `SELECT COUNT(*) as count FROM lg_engagement_queue
       WHERE status = 'posted'
       AND DATE(posted_at) = DATE('now')`
    );

    // Total clicks
    const totalClicks = await db.get(
      'SELECT SUM(engagement_clicks) as total FROM lg_engagement_queue WHERE engagement_clicks > 0'
    );

    // Average engagement by platform
    const platformStats = await db.all(
      `SELECT
        platform,
        COUNT(*) as posts,
        AVG(engagement_likes) as avg_likes,
        AVG(engagement_replies) as avg_replies,
        SUM(engagement_clicks) as total_clicks
       FROM lg_engagement_queue
       WHERE status = 'posted'
       GROUP BY platform
       ORDER BY total_clicks DESC`
    );

    // Top performing communities (last 30 days)
    const topCommunities = await db.all(
      `SELECT
        e.platform,
        e.community,
        COUNT(*) as posts,
        AVG(e.engagement_likes + e.engagement_replies) as avg_engagement,
        SUM(e.engagement_clicks) as clicks
       FROM lg_engagement_queue e
       WHERE e.status = 'posted'
       AND e.posted_at >= datetime('now', '-30 days')
       GROUP BY e.platform, e.community
       ORDER BY avg_engagement DESC
       LIMIT 10`
    );

    // Response rate by template
    const templatePerformance = await db.all(
      `SELECT
        recommended_template,
        COUNT(*) as used_count,
        AVG(engagement_likes + engagement_replies) as avg_engagement
       FROM lg_engagement_queue
       WHERE status = 'posted' AND recommended_template IS NOT NULL
       GROUP BY recommended_template
       ORDER BY avg_engagement DESC`
    );

    res.json({
      success: true,
      stats: {
        pending_review: pendingCount?.count || 0,
        posted_today: postedToday?.count || 0,
        total_clicks: totalClicks?.total || 0,
        platform_stats: platformStats,
        top_communities: topCommunities,
        template_performance: templatePerformance
      }
    });
  } catch (error) {
    console.error('[Lead Gen API] Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==============================================================================
// HELPER ENDPOINTS
// ==============================================================================

/**
 * POST /api/lead-gen/networker/queue
 * Create new engagement opportunity (used by agent)
 *
 * Body: Full opportunity object
 */
router.post('/networker/queue', async (req, res) => {
  try {
    const {
      platform,
      community,
      post_url,
      post_title,
      post_summary,
      post_author,
      post_age_hours,
      relevance_score,
      recommended_template,
      draft_response,
      includes_link,
      link_url
    } = req.body;

    // Validation
    if (!platform || !post_url || !draft_response) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: platform, post_url, draft_response'
      });
    }

    await db.run(
      `INSERT INTO lg_engagement_queue (
        platform, community, post_url, post_title, post_summary,
        post_author, post_age_hours, relevance_score, recommended_template,
        draft_response, includes_link, link_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        platform,
        community || null,
        post_url,
        post_title || null,
        post_summary || null,
        post_author || null,
        post_age_hours || null,
        relevance_score || null,
        recommended_template || null,
        draft_response,
        includes_link ? 1 : 0,
        link_url || null
      ]
    );

    res.json({
      success: true,
      message: 'Engagement opportunity created',
      id: db.getDb().lastInsertRowid
    });
  } catch (error) {
    console.error('[Lead Gen API] Error creating opportunity:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
