/**
 * Campaign Context Middleware
 *
 * Extracts campaign_id from request and adds it to req.campaignId
 * Campaign ID can come from:
 * 1. URL param: /api/campaigns/:campaignId/...
 * 2. Header: X-Campaign-ID
 * 3. Query param: ?campaign_id=xxx
 */

/**
 * Strict campaign context - requires campaign_id
 * Use this for routes that MUST have a campaign context
 */
function campaignContext(req, res, next) {
  const campaignId = req.params.campaignId
    || req.headers['x-campaign-id']
    || req.query.campaign_id;

  if (!campaignId) {
    return res.status(400).json({
      error: 'Campaign context required',
      message: 'Please provide campaign_id via URL param, X-Campaign-ID header, or query param',
    });
  }

  req.campaignId = campaignId;
  next();
}

/**
 * Optional campaign context - allows requests without campaign_id
 * Use this for routes that work both with and without campaign context
 * (useful during migration period)
 */
function optionalCampaignContext(req, res, next) {
  req.campaignId = req.params.campaignId
    || req.headers['x-campaign-id']
    || req.query.campaign_id
    || null;
  next();
}

module.exports = {
  campaignContext,
  optionalCampaignContext,
};
