/**
 * Lead Generation Engagement Queue API
 *
 * Endpoints for managing the approval workflow for community engagement posts
 */

const express = require('express');
const router = express.Router();
const { run, all, get } = require('../db/connection');
const { authenticate } = require('../middleware/auth');

/**
 * GET /api/lead-gen/queue
 * Fetch all pending engagement opportunities
 * Query params: status, platform, min_score, limit, offset
 */
router.get('/queue', authenticate, (req, res) => {
  try {
    const {
      status = 'pending_review',
      platform,
      min_score = 0,
      limit = 50,
      offset = 0
    } = req.query;

    let sql = 'SELECT * FROM lg_engagement_queue WHERE 1=1';
    const params = [];

    // Filter by status
    if (status && status !== 'all') {
      sql += ' AND status = ?';
      params.push(status);
    }

    // Filter by platform
    if (platform && platform !== 'all') {
      sql += ' AND platform = ?';
      params.push(platform);
    }

    // Filter by minimum score
    if (min_score > 0) {
      sql += ' AND relevance_score >= ?';
      params.push(parseInt(min_score));
    }

    // Order by score descending, then by created date
    sql += ' ORDER BY relevance_score DESC, created_at DESC';

    // Pagination
    sql += ' LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const items = all(sql, params);

    // No JSON parsing needed — all columns are plain types
    const parsed = items;

    // Get total count for pagination
    let countSql = 'SELECT COUNT(*) as total FROM lg_engagement_queue WHERE 1=1';
    const countParams = [];

    if (status && status !== 'all') {
      countSql += ' AND status = ?';
      countParams.push(status);
    }
    if (platform && platform !== 'all') {
      countSql += ' AND platform = ?';
      countParams.push(platform);
    }
    if (min_score > 0) {
      countSql += ' AND relevance_score >= ?';
      countParams.push(parseInt(min_score));
    }

    const { total } = get(countSql, countParams);

    res.json({
      success: true,
      data: parsed,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: (parseInt(offset) + parsed.length) < total
      }
    });

  } catch (error) {
    console.error('[Lead Gen Queue] Error fetching queue:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch engagement queue'
    });
  }
});

/**
 * GET /api/lead-gen/queue/stats
 * Get queue statistics (pending, approved, posted counts)
 */
router.get('/queue/stats', authenticate, (req, res) => {
  try {
    const { getQueueStats } = require('../agents/hoaNetworker');
    const stats = getQueueStats();

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('[Lead Gen Queue] Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch queue stats'
    });
  }
});

/**
 * GET /api/lead-gen/queue/:id
 * Get a single queue item by ID
 */
router.get('/queue/:id', authenticate, (req, res) => {
  try {
    const { id } = req.params;

    const item = get('SELECT * FROM lg_engagement_queue WHERE id = ?', [id]);

    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Queue item not found'
      });
    }

    res.json({
      success: true,
      data: item
    });

  } catch (error) {
    console.error('[Lead Gen Queue] Error fetching item:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch queue item'
    });
  }
});

/**
 * PATCH /api/lead-gen/queue/:id
 * Update queue item (edit draft response)
 */
router.patch('/queue/:id', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const { draft_response } = req.body;

    if (!draft_response) {
      return res.status(400).json({
        success: false,
        error: 'draft_response is required'
      });
    }

    // Check if item exists
    const item = get('SELECT id FROM lg_engagement_queue WHERE id = ?', [id]);
    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Queue item not found'
      });
    }

    // Update draft response
    run('UPDATE lg_engagement_queue SET draft_response = ? WHERE id = ?', [
      draft_response,
      id
    ]);

    res.json({
      success: true,
      message: 'Draft response updated'
    });

  } catch (error) {
    console.error('[Lead Gen Queue] Error updating item:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update queue item'
    });
  }
});

/**
 * PUT /api/lead-gen/queue/:id
 * Update queue item — handles draft edits OR engagement data
 */
router.put('/queue/:id', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const { draft_response, engagement_likes, engagement_replies, engagement_clicks } = req.body;

    const item = get('SELECT id FROM lg_engagement_queue WHERE id = ?', [id]);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Queue item not found' });
    }

    if (draft_response !== undefined) {
      run('UPDATE lg_engagement_queue SET draft_response = ? WHERE id = ?', [draft_response, id]);
    }

    if (engagement_likes !== undefined || engagement_replies !== undefined || engagement_clicks !== undefined) {
      run(
        `UPDATE lg_engagement_queue
         SET engagement_likes = COALESCE(?, engagement_likes),
             engagement_replies = COALESCE(?, engagement_replies),
             engagement_clicks = COALESCE(?, engagement_clicks)
         WHERE id = ?`,
        [
          engagement_likes !== undefined ? parseInt(engagement_likes) || 0 : null,
          engagement_replies !== undefined ? parseInt(engagement_replies) || 0 : null,
          engagement_clicks !== undefined ? parseInt(engagement_clicks) || 0 : null,
          id,
        ]
      );
    }

    res.json({ success: true, message: 'Updated' });
  } catch (error) {
    console.error('[Lead Gen Queue] Error in PUT:', error);
    res.status(500).json({ success: false, error: 'Failed to update queue item' });
  }
});

/**
 * POST /api/lead-gen/queue/:id/approve
 * Approve a queue item for posting
 */
router.post('/queue/:id/approve', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if item exists and is pending
    const item = get('SELECT * FROM lg_engagement_queue WHERE id = ?', [id]);
    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Queue item not found'
      });
    }

    if (item.status !== 'pending_review') {
      return res.status(400).json({
        success: false,
        error: `Item already ${item.status}`
      });
    }

    // Update status to approved
    run(`
      UPDATE lg_engagement_queue
      SET status = ?, approved_at = datetime('now')
      WHERE id = ?
    `, ['approved', id]);

    // TODO: Actually post to the platform (implement in platformScanner.js)
    // For now, just mark as approved - posting happens manually or via scheduler

    res.json({
      success: true,
      message: 'Item approved for posting',
      data: { id, status: 'approved' }
    });

  } catch (error) {
    console.error('[Lead Gen Queue] Error approving item:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to approve queue item'
    });
  }
});

/**
 * POST /api/lead-gen/queue/:id/reject
 * Reject a queue item
 */
router.post('/queue/:id/reject', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if item exists
    const item = get('SELECT id FROM lg_engagement_queue WHERE id = ?', [id]);
    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Queue item not found'
      });
    }

    // Update status to rejected
    run(`
      UPDATE lg_engagement_queue
      SET status = ?
      WHERE id = ?
    `, ['rejected', id]);

    res.json({
      success: true,
      message: 'Item rejected'
    });

  } catch (error) {
    console.error('[Lead Gen Queue] Error rejecting item:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reject queue item'
    });
  }
});

/**
 * POST /api/lead-gen/queue/:id/post
 * Mark item as posted (after manual posting to platform)
 */
router.post('/queue/:id/post', authenticate, (req, res) => {
  try {
    const { id } = req.params;

    // Check if item is approved
    const item = get('SELECT status FROM lg_engagement_queue WHERE id = ?', [id]);
    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Queue item not found'
      });
    }

    if (item.status !== 'approved') {
      return res.status(400).json({
        success: false,
        error: 'Item must be approved before posting'
      });
    }

    // Update status to posted
    run(`
      UPDATE lg_engagement_queue
      SET status = ?, posted_at = datetime('now')
      WHERE id = ?
    `, ['posted', id]);

    res.json({
      success: true,
      message: 'Item marked as posted'
    });

  } catch (error) {
    console.error('[Lead Gen Queue] Error marking as posted:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark item as posted'
    });
  }
});

/**
 * DELETE /api/lead-gen/queue/:id
 * Delete a queue item
 */
router.delete('/queue/:id', authenticate, (req, res) => {
  try {
    const { id } = req.params;

    const result = run('DELETE FROM lg_engagement_queue WHERE id = ?', [id]);

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: 'Queue item not found'
      });
    }

    res.json({
      success: true,
      message: 'Queue item deleted'
    });

  } catch (error) {
    console.error('[Lead Gen Queue] Error deleting item:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete queue item'
    });
  }
});

/**
 * GET /api/lead-gen/communities
 * Returns tracked communities from lg_community_accounts
 */
router.get('/communities', authenticate, (req, res) => {
  try {
    const items = all('SELECT * FROM lg_community_accounts WHERE is_active = 1 ORDER BY posts_made DESC, created_at DESC LIMIT 50');
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
