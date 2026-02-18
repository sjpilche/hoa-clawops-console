/**
 * Campaign Table Context Middleware
 * Adds campaign-specific table names to request object
 */

const { get } = require('../db/connection');
const campaignTableManager = require('../services/campaignTableManager');

/**
 * Middleware that adds campaign table names to req object
 * Requires campaignId in req (from campaignContext middleware)
 *
 * Adds to req:
 * - campaignSlug: string
 * - campaignTables: { leads: string, runs: string, content_queue: string, hoa_contacts: string }
 */
function campaignTableContext(req, res, next) {
  if (!req.campaignId) {
    return res.status(400).json({ error: 'Campaign context required' });
  }

  try {
    // Get campaign slug
    const campaign = get('SELECT slug FROM campaigns WHERE id = ?', [req.campaignId]);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Add table names to request
    req.campaignSlug = campaign.slug;
    req.campaignTables = campaignTableManager.getCampaignTables(campaign.slug);

    next();
  } catch (error) {
    console.error('[Campaign Table Context Error]', error);
    res.status(500).json({ error: 'Failed to load campaign context' });
  }
}

/**
 * Optional campaign table context middleware
 * Adds campaign table names if campaign context is available
 * Does NOT error if no campaign context
 */
function optionalCampaignTableContext(req, res, next) {
  if (!req.campaignId) {
    // No campaign context, continue without adding table names
    return next();
  }

  try {
    const campaign = get('SELECT slug FROM campaigns WHERE id = ?', [req.campaignId]);

    if (campaign) {
      req.campaignSlug = campaign.slug;
      req.campaignTables = campaignTableManager.getCampaignTables(campaign.slug);
    }

    next();
  } catch (error) {
    console.error('[Optional Campaign Table Context Error]', error);
    // Continue even if error - backward compatibility
    next();
  }
}

module.exports = { campaignTableContext, optionalCampaignTableContext };
