/**
 * @file campaignMetrics.js
 * @description Campaign metrics aggregation and activity logging service.
 */

const { v4: uuid } = require('uuid');
const { get, all, run } = require('../db/connection');

class CampaignMetricsService {
  /**
   * Roll up metrics for a specific campaign and date
   */
  async rollupMetrics(campaignId, date) {
    try {
      const dateStr = date.toISOString().split('T')[0];

      // Count leads generated on this date
      const leads = get(`
        SELECT COUNT(*) as count FROM leads
        WHERE campaign_id = ? AND DATE(created_at) = ?
      `, [campaignId, dateStr]);

      // Count emails sent
      const emails = get(`
        SELECT COUNT(*) as count FROM content_queue
        WHERE campaign_id = ? AND status = 'posted' AND DATE(posted_at) = ?
      `, [campaignId, dateStr]);

      // Count agent runs and sum costs
      const runs = get(`
        SELECT COUNT(*) as count, SUM(cost_usd) as cost, SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors
        FROM runs
        WHERE campaign_id = ? AND DATE(started_at) = ?
      `, [campaignId, dateStr]);

      // Count replies/responses (if applicable)
      const replies = get(`
        SELECT COUNT(*) as count FROM content_queue
        WHERE campaign_id = ? AND reply_count > 0 AND DATE(updated_at) = ?
      `, [campaignId, dateStr]) || { count: 0 };

      // Upsert metrics
      const existing = get(
        'SELECT id FROM campaign_metrics WHERE campaign_id = ? AND date = ?',
        [campaignId, dateStr]
      );

      if (existing) {
        run(`
          UPDATE campaign_metrics
          SET leads_generated = ?, emails_sent = ?, agent_runs = ?, agent_errors = ?, replies_received = ?, cost_estimate = ?
          WHERE id = ?
        `, [
          leads?.count || 0,
          emails?.count || 0,
          runs?.count || 0,
          runs?.errors || 0,
          replies?.count || 0,
          runs?.cost || 0,
          existing.id
        ]);
      } else {
        run(`
          INSERT INTO campaign_metrics (id, campaign_id, date, leads_generated, emails_sent, agent_runs, agent_errors, replies_received, cost_estimate)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          uuid(),
          campaignId,
          dateStr,
          leads?.count || 0,
          emails?.count || 0,
          runs?.count || 0,
          runs?.errors || 0,
          replies?.count || 0,
          runs?.cost || 0
        ]);
      }

      console.log(`[CampaignMetrics] Rolled up metrics for campaign ${campaignId} on ${dateStr}`);
    } catch (error) {
      console.error('[CampaignMetrics] Rollup error:', error);
      throw error;
    }
  }

  /**
   * Roll up metrics for all active campaigns
   */
  async rollupAllCampaigns(date) {
    try {
      const campaigns = all('SELECT id FROM campaigns WHERE status = ?', ['active']);
      console.log(`[CampaignMetrics] Rolling up metrics for ${campaigns.length} campaigns`);

      for (const campaign of campaigns) {
        await this.rollupMetrics(campaign.id, date);
      }

      console.log('[CampaignMetrics] Daily rollup complete');
    } catch (error) {
      console.error('[CampaignMetrics] Rollup all error:', error);
    }
  }

  /**
   * Log activity event for a campaign
   */
  logActivity(campaignId, agentId, eventType, severity, title, detail) {
    try {
      run(`
        INSERT INTO campaign_activity_log (id, campaign_id, agent_id, event_type, severity, title, detail, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `, [
        uuid(),
        campaignId,
        agentId || null,
        eventType,
        severity,
        title,
        JSON.stringify(detail || {})
      ]);

      console.log(`[CampaignMetrics] Activity logged: ${title} (${severity})`);
    } catch (error) {
      console.error('[CampaignMetrics] Log activity error:', error);
    }
  }

  /**
   * Get metrics for a campaign within a date range
   */
  getMetrics(campaignId, days = 7) {
    try {
      const metrics = all(`
        SELECT * FROM campaign_metrics
        WHERE campaign_id = ? AND date >= date('now', '-${days} days')
        ORDER BY date DESC
      `, [campaignId]);

      return metrics;
    } catch (error) {
      console.error('[CampaignMetrics] Get metrics error:', error);
      return [];
    }
  }

  /**
   * Get recent activity for a campaign
   */
  getActivity(campaignId, limit = 10) {
    try {
      const activity = all(`
        SELECT * FROM campaign_activity_log
        WHERE campaign_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `, [campaignId, limit]);

      return activity.map(event => ({
        ...event,
        detail: event.detail ? JSON.parse(event.detail) : null
      }));
    } catch (error) {
      console.error('[CampaignMetrics] Get activity error:', error);
      return [];
    }
  }
}

// Export singleton instance
module.exports = new CampaignMetricsService();
