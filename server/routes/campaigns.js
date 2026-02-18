const router = require('express').Router();
const { v4: uuid } = require('uuid');
const { authenticate } = require('../middleware/auth');
const { get, all, run } = require('../db/connection');
const agentTemplateRegistry = require('../services/agentTemplateRegistry');
const campaignMetrics = require('../services/campaignMetrics');
const campaignTableManager = require('../services/campaignTableManager');

/**
 * GET /api/campaigns
 * List all campaigns with optional filters
 * Query params:
 *   - status: filter by status (active, paused, archived)
 *   - type: filter by type (lead-gen, marketing, trading, outreach)
 *   - company: filter by company name
 */
router.get('/', authenticate, (req, res) => {
  try {
    const { status, type, company } = req.query;

    let sql = 'SELECT * FROM campaigns WHERE 1=1';
    const params = [];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }

    if (company) {
      sql += ' AND company LIKE ?';
      params.push(`%${company}%`);
    }

    sql += ' ORDER BY created_at DESC';

    const campaigns = all(sql, params);

    // Enhance each campaign with stats
    const enhancedCampaigns = campaigns.map(campaign => {
      const agentCount = get(
        'SELECT COUNT(*) as count FROM campaign_agents WHERE campaign_id = ?',
        [campaign.id]
      );

      const leadCount = get(
        'SELECT COUNT(*) as count FROM leads WHERE campaign_id = ?',
        [campaign.id]
      );

      const lastActivity = get(
        'SELECT created_at FROM campaign_activity_log WHERE campaign_id = ? ORDER BY created_at DESC LIMIT 1',
        [campaign.id]
      );

      return {
        ...campaign,
        agentCount: agentCount?.count || 0,
        leadCount: leadCount?.count || 0,
        lastActivity: lastActivity?.created_at || null,
      };
    });

    res.json(enhancedCampaigns);
  } catch (error) {
    console.error('[Campaigns] List error:', error);
    res.status(500).json({ error: 'Failed to list campaigns' });
  }
});

/**
 * POST /api/campaigns
 * Create a new campaign
 * Body: { name, company, type, color, icon, description }
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const { name, company, type = 'marketing', color = '#3B82F6', icon = '🎯', description = '' } = req.body;

    if (!name || !company) {
      return res.status(400).json({ error: 'name and company are required' });
    }

    // Generate slug from name
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    // Validate slug for table naming
    try {
      campaignTableManager.validateSlug(slug);
    } catch (error) {
      return res.status(400).json({ error: `Invalid campaign name for table creation: ${error.message}` });
    }

    // Check if slug already exists
    const existing = get('SELECT id FROM campaigns WHERE slug = ?', [slug]);
    if (existing) {
      return res.status(409).json({ error: 'A campaign with this name already exists' });
    }

    const id = uuid();

    // Create campaign record
    run(`
      INSERT INTO campaigns (id, name, company, slug, type, status, color, icon, description, config)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, '{}')
    `, [id, name, company, slug, type, color, icon, description]);

    // Create campaign-specific tables
    console.log(`[Campaign Creation] Creating tables for campaign: ${slug}`);
    await campaignTableManager.createCampaignTables(slug);

    // Log activity
    await campaignMetrics.logActivity(
      id,
      null,
      'campaign_created',
      'success',
      `Campaign created: ${name}`,
      { slug, type, company }
    );

    const campaign = get('SELECT * FROM campaigns WHERE id = ?', [id]);
    res.status(201).json(campaign);
  } catch (error) {
    console.error('[Campaigns] Create error:', error);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

/**
 * GET /api/campaigns/overview
 * Get cross-campaign summary stats
 */
router.get('/overview', authenticate, (req, res) => {
  try {
    const totalCampaigns = get('SELECT COUNT(*) as count FROM campaigns WHERE status != ?', ['archived']);
    const totalAgentRuns = get('SELECT COUNT(*) as count FROM runs WHERE campaign_id IS NOT NULL');
    const totalLeads = get('SELECT COUNT(*) as count FROM leads WHERE campaign_id IS NOT NULL');
    const totalEmails = get('SELECT COUNT(*) as count FROM content_queue WHERE status = ? AND campaign_id IS NOT NULL', ['posted']);
    const totalCost = get('SELECT SUM(cost_usd) as total FROM runs WHERE campaign_id IS NOT NULL');

    res.json({
      totalCampaigns: totalCampaigns?.count || 0,
      totalAgentRuns: totalAgentRuns?.count || 0,
      totalLeads: totalLeads?.count || 0,
      totalEmails: totalEmails?.count || 0,
      totalCost: totalCost?.total || 0,
    });
  } catch (error) {
    console.error('[Campaigns] Get overview error:', error);
    res.status(500).json({ error: 'Failed to get overview' });
  }
});

/**
 * GET /api/campaigns/templates
 * Get all available agent templates
 */
router.get('/templates', authenticate, (req, res) => {
  try {
    const templates = agentTemplateRegistry.getTemplates();
    res.json(templates);
  } catch (error) {
    console.error('[Campaigns] Get templates error:', error);
    res.status(500).json({ error: 'Failed to get agent templates' });
  }
});

/**
 * GET /api/campaigns/:id
 * Get campaign detail with agents and recent metrics
 */
router.get('/:id', authenticate, (req, res) => {
  try {
    const campaign = get('SELECT * FROM campaigns WHERE id = ?', [req.params.id]);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Get assigned agents
    const agents = all(
      'SELECT * FROM campaign_agents WHERE campaign_id = ? ORDER BY created_at',
      [req.params.id]
    );

    // Get recent metrics (last 7 days)
    const metrics = all(
      `SELECT * FROM campaign_metrics
       WHERE campaign_id = ?
       ORDER BY date DESC
       LIMIT 7`,
      [req.params.id]
    );

    // Get recent activity
    const activity = all(
      `SELECT * FROM campaign_activity_log
       WHERE campaign_id = ?
       ORDER BY created_at DESC
       LIMIT 20`,
      [req.params.id]
    );

    res.json({
      ...campaign,
      agents,
      metrics,
      activity,
    });
  } catch (error) {
    console.error('[Campaigns] Get detail error:', error);
    res.status(500).json({ error: 'Failed to get campaign' });
  }
});

/**
 * PUT /api/campaigns/:id
 * Update campaign
 * Body: { name, description, color, icon, status, config }
 * Note: slug is immutable after creation
 */
router.put('/:id', authenticate, (req, res) => {
  try {
    const { name, description, color, icon, status, config } = req.body;

    const campaign = get('SELECT * FROM campaigns WHERE id = ?', [req.params.id]);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }
    if (color !== undefined) {
      updates.push('color = ?');
      params.push(color);
    }
    if (icon !== undefined) {
      updates.push('icon = ?');
      params.push(icon);
    }
    if (status !== undefined) {
      if (!['active', 'paused', 'archived'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      updates.push('status = ?');
      params.push(status);
    }
    if (config !== undefined) {
      updates.push('config = ?');
      params.push(JSON.stringify(config));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(req.params.id);

    run(`UPDATE campaigns SET ${updates.join(', ')} WHERE id = ?`, params);

    const updated = get('SELECT * FROM campaigns WHERE id = ?', [req.params.id]);
    res.json(updated);
  } catch (error) {
    console.error('[Campaigns] Update error:', error);
    res.status(500).json({ error: 'Failed to update campaign' });
  }
});

/**
 * DELETE /api/campaigns/:id
 * Archive campaign (soft delete)
 */
router.delete('/:id', authenticate, (req, res) => {
  try {
    const campaign = get('SELECT * FROM campaigns WHERE id = ?', [req.params.id]);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    run('UPDATE campaigns SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
      'archived',
      req.params.id,
    ]);

    res.json({ message: 'Campaign archived successfully' });
  } catch (error) {
    console.error('[Campaigns] Delete error:', error);
    res.status(500).json({ error: 'Failed to archive campaign' });
  }
});

/**
 * POST /api/campaigns/:id/duplicate
 * Clone campaign configuration and agent assignments
 * Does NOT clone data (leads, runs, metrics)
 * Body: { newName, newCompany }
 */
router.post('/:id/duplicate', authenticate, (req, res) => {
  try {
    const { newName, newCompany } = req.body;

    if (!newName || !newCompany) {
      return res.status(400).json({ error: 'newName and newCompany are required' });
    }

    const source = get('SELECT * FROM campaigns WHERE id = ?', [req.params.id]);
    if (!source) {
      return res.status(404).json({ error: 'Source campaign not found' });
    }

    // Generate slug for new campaign
    const newSlug = newName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    // Check if slug exists
    const existing = get('SELECT id FROM campaigns WHERE slug = ?', [newSlug]);
    if (existing) {
      return res.status(409).json({ error: 'A campaign with this name already exists' });
    }

    const newId = uuid();

    // Clone campaign
    run(`
      INSERT INTO campaigns (id, name, company, slug, type, status, color, icon, description, config)
      VALUES (?, ?, ?, ?, ?, 'paused', ?, ?, ?, ?)
    `, [newId, newName, newCompany, newSlug, source.type, source.color, source.icon, source.description, source.config]);

    // Clone agent assignments (but not run history)
    const agents = all('SELECT * FROM campaign_agents WHERE campaign_id = ?', [req.params.id]);
    for (const agent of agents) {
      run(`
        INSERT INTO campaign_agents (id, campaign_id, agent_type, agent_name, prompt_spec_path, status, schedule, config)
        VALUES (?, ?, ?, ?, ?, 'idle', ?, ?)
      `, [uuid(), newId, agent.agent_type, agent.agent_name, agent.prompt_spec_path, agent.schedule, agent.config]);
    }

    const newCampaign = get('SELECT * FROM campaigns WHERE id = ?', [newId]);
    res.status(201).json(newCampaign);
  } catch (error) {
    console.error('[Campaigns] Duplicate error:', error);
    res.status(500).json({ error: 'Failed to duplicate campaign' });
  }
});

/**
 * GET /api/campaigns/:id/available-agents
 * Get agent templates that haven't been assigned to this campaign yet
 */
router.get('/:id/available-agents', authenticate, (req, res) => {
  try {
    const allTemplates = agentTemplateRegistry.getTemplates();

    // Get already assigned agents for this campaign
    const assigned = all(
      'SELECT agent_type FROM campaign_agents WHERE campaign_id = ?',
      [req.params.id]
    );

    const assignedTypes = new Set(assigned.map(a => a.agent_type));

    res.json({
      available: allTemplates.filter(t => !assignedTypes.has(t.id)),
      assigned: allTemplates.filter(t => assignedTypes.has(t.id)),
    });
  } catch (error) {
    console.error('[Campaigns] Get available agents error:', error);
    res.status(500).json({ error: 'Failed to get available agents' });
  }
});

/**
 * GET /api/campaigns/:id/agents
 * List agents assigned to this campaign
 */
router.get('/:id/agents', authenticate, (req, res) => {
  try {
    const agents = all(
      'SELECT * FROM campaign_agents WHERE campaign_id = ? ORDER BY created_at',
      [req.params.id]
    );
    res.json(agents);
  } catch (error) {
    console.error('[Campaigns] List agents error:', error);
    res.status(500).json({ error: 'Failed to list agents' });
  }
});

/**
 * POST /api/campaigns/:id/agents
 * Assign an agent to this campaign
 * Body: { agentType, agentName, schedule, config }
 */
router.post('/:id/agents', authenticate, (req, res) => {
  try {
    const { agentType, agentName, schedule = 'manual', config = {} } = req.body;

    if (!agentType || !agentName) {
      return res.status(400).json({ error: 'agentType and agentName are required' });
    }

    const id = uuid();
    const promptSpecPath = `openclaw-skills/${agentType}/SOUL.md`;

    run(`
      INSERT INTO campaign_agents (id, campaign_id, agent_type, agent_name, prompt_spec_path, status, schedule, config)
      VALUES (?, ?, ?, ?, ?, 'idle', ?, ?)
    `, [id, req.params.id, agentType, agentName, promptSpecPath, schedule, JSON.stringify(config)]);

    const agent = get('SELECT * FROM campaign_agents WHERE id = ?', [id]);
    res.status(201).json(agent);
  } catch (error) {
    console.error('[Campaigns] Assign agent error:', error);
    res.status(500).json({ error: 'Failed to assign agent' });
  }
});

/**
 * PUT /api/campaigns/:id/agents/:agentId
 * Update agent config/schedule/status
 */
router.put('/:id/agents/:agentId', authenticate, (req, res) => {
  try {
    const { schedule, config, status } = req.body;

    const agent = get('SELECT * FROM campaign_agents WHERE id = ? AND campaign_id = ?', [
      req.params.agentId,
      req.params.id,
    ]);

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const updates = [];
    const params = [];

    if (schedule !== undefined) {
      updates.push('schedule = ?');
      params.push(schedule);
    }
    if (config !== undefined) {
      updates.push('config = ?');
      params.push(JSON.stringify(config));
    }
    if (status !== undefined) {
      if (!['idle', 'running', 'paused', 'error', 'disabled'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      updates.push('status = ?');
      params.push(status);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    params.push(req.params.agentId);

    run(`UPDATE campaign_agents SET ${updates.join(', ')} WHERE id = ?`, params);

    const updated = get('SELECT * FROM campaign_agents WHERE id = ?', [req.params.agentId]);
    res.json(updated);
  } catch (error) {
    console.error('[Campaigns] Update agent error:', error);
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

/**
 * DELETE /api/campaigns/:id/agents/:agentId
 * Remove agent from campaign
 */
router.delete('/:id/agents/:agentId', authenticate, (req, res) => {
  try {
    const agent = get('SELECT * FROM campaign_agents WHERE id = ? AND campaign_id = ?', [
      req.params.agentId,
      req.params.id,
    ]);

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    run('DELETE FROM campaign_agents WHERE id = ?', [req.params.agentId]);

    res.json({ message: 'Agent removed from campaign' });
  } catch (error) {
    console.error('[Campaigns] Remove agent error:', error);
    res.status(500).json({ error: 'Failed to remove agent' });
  }
});

/**
 * GET /api/campaigns/:id/metrics
 * Get campaign metrics with date range
 * Query params: days (default 7), startDate, endDate
 */
router.get('/:id/metrics', authenticate, (req, res) => {
  try {
    const { days = 7 } = req.query;
    const metrics = campaignMetrics.getMetrics(req.params.id, parseInt(days));
    res.json(metrics);
  } catch (error) {
    console.error('[Campaigns] Get metrics error:', error);
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

/**
 * GET /api/campaigns/:id/activity
 * Get campaign activity feed
 * Query params: limit (default 20), event_type, severity
 */
router.get('/:id/activity', authenticate, (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const activity = campaignMetrics.getActivity(req.params.id, parseInt(limit));
    res.json(activity);
  } catch (error) {
    console.error('[Campaigns] Get activity error:', error);
    res.status(500).json({ error: 'Failed to get activity' });
  }
});

module.exports = router;
