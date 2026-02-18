/**
 * @file mgmtResearch.js
 * @description API routes for Management Company Research pipeline (Agents 36-40)
 *
 * Endpoints:
 *   GET /api/mgmt-research/dashboard — Company list + pipeline stats
 *   GET /api/mgmt-research/hot-leads — Hot review leads
 *   GET /api/mgmt-research/queue     — Companies needing processing
 *   GET /api/mgmt-research/signals/:companyId — Review signals for a company
 *   GET /api/mgmt-research/contacts/:companyId — Contacts for a company
 *   GET /api/mgmt-research/targets   — Priority target companies config
 */

const { Router } = require('express');
const { all, get } = require('../db/connection');
const { authenticate } = require('../middleware/auth');
const fs = require('fs');
const path = require('path');

const router = Router();
router.use(authenticate);

/**
 * GET /api/mgmt-research/dashboard
 * Main dashboard — all management companies with pipeline status
 */
router.get('/dashboard', (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const tier = req.query.tier || null;

    let query = `
      SELECT
        mc.id, mc.name, mc.website_url, mc.website, mc.priority_tier,
        mc.cai_designations, mc.communities_managed, mc.communities_scraped,
        mc.communities_mapped, mc.google_rating, mc.bbb_rating,
        mc.company_health, mc.switching_signals, mc.outreach_priority,
        mc.has_vendor_program, mc.portfolio_scraped, mc.contacts_pulled,
        mc.portfolio_mapped, mc.reviews_scanned, mc.source,
        mc.state, mc.service_states,
        mc.discovered_at, mc.updated_at
      FROM management_companies mc
      WHERE 1=1
    `;
    const params = [];

    if (tier) {
      query += ' AND mc.priority_tier = ?';
      params.push(tier);
    }

    query += `
      ORDER BY
        CASE mc.priority_tier
          WHEN 'AAMC_TOP' THEN 1
          WHEN 'DESIGNATED' THEN 2
          WHEN 'MEMBER' THEN 3
          ELSE 4
        END,
        mc.communities_managed DESC
      LIMIT ? OFFSET ?
    `;
    params.push(limit, offset);

    const companies = all(query, params);

    // Pipeline stats
    const stats = get(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN portfolio_scraped = 1 THEN 1 ELSE 0 END) as scraped,
        SUM(CASE WHEN contacts_pulled = 1 THEN 1 ELSE 0 END) as contacts,
        SUM(CASE WHEN portfolio_mapped = 1 THEN 1 ELSE 0 END) as mapped,
        SUM(CASE WHEN reviews_scanned = 1 THEN 1 ELSE 0 END) as scanned,
        SUM(CASE WHEN priority_tier = 'AAMC_TOP' THEN 1 ELSE 0 END) as aamc,
        SUM(CASE WHEN company_health = 'critical' OR company_health = 'deteriorating' THEN 1 ELSE 0 END) as unhealthy
      FROM management_companies
    `);

    res.json({ companies, stats, limit, offset });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/mgmt-research/hot-leads
 * Communities with critical/high urgency review signals
 */
router.get('/hot-leads', (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 50;

    // Aggregate review signals by community
    const hotLeads = all(`
      SELECT
        rs.community_mentioned as community_name,
        rs.community_city as city,
        rs.community_state as state,
        rs.mgmt_company_name as management_company,
        COUNT(*) as total_reviews,
        SUM(rs.signal_score) as combined_signal_score,
        MAX(rs.urgency) as max_urgency,
        GROUP_CONCAT(DISTINCT rs.primary_issue) as issues,
        rs.hoa_community_id
      FROM review_signals rs
      WHERE rs.community_mentioned IS NOT NULL
        AND rs.signal_score >= 10
      GROUP BY rs.community_mentioned, rs.community_city, rs.community_state
      HAVING COUNT(*) >= 1
      ORDER BY combined_signal_score DESC
      LIMIT ?
    `, [limit]);

    res.json({ hot_leads: hotLeads });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/mgmt-research/queue
 * Companies needing pipeline processing
 */
router.get('/queue', (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 50;

    const queue = all(`
      SELECT id, name, website_url, website, priority_tier, communities_managed,
             portfolio_scraped, contacts_pulled, portfolio_mapped, reviews_scanned
      FROM management_companies
      WHERE portfolio_scraped = 0 OR contacts_pulled = 0
        OR portfolio_mapped = 0 OR reviews_scanned = 0
      ORDER BY
        CASE priority_tier
          WHEN 'AAMC_TOP' THEN 1
          WHEN 'DESIGNATED' THEN 2
          WHEN 'MEMBER' THEN 3
          ELSE 4
        END,
        communities_managed DESC
      LIMIT ?
    `, [limit]);

    res.json({ queue, total: queue.length });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/mgmt-research/signals/:companyId
 * Review signals for a specific management company
 */
router.get('/signals/:companyId', (req, res, next) => {
  try {
    const { companyId } = req.params;
    const limit = parseInt(req.query.limit) || 100;

    const signals = all(`
      SELECT * FROM review_signals
      WHERE mgmt_company_id = ?
      ORDER BY signal_score DESC, created_at DESC
      LIMIT ?
    `, [companyId, limit]);

    res.json({ signals });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/mgmt-research/contacts/:companyId
 * Contacts for a specific management company
 */
router.get('/contacts/:companyId', (req, res, next) => {
  try {
    const { companyId } = req.params;

    const contacts = all(`
      SELECT * FROM mgmt_company_contacts
      WHERE mgmt_company_id = ?
      ORDER BY
        CASE contact_type
          WHEN 'c_suite' THEN 1
          WHEN 'vendor_relations' THEN 2
          WHEN 'biz_dev' THEN 3
          WHEN 'operations' THEN 4
          ELSE 5
        END,
        created_at DESC
    `, [companyId]);

    res.json({ contacts });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/mgmt-research/targets
 * Serves the priority targets config file
 */
router.get('/targets', (req, res, next) => {
  try {
    const targetsPath = path.resolve(__dirname, '../../config/mgmt-company-targets.json');
    const data = JSON.parse(fs.readFileSync(targetsPath, 'utf-8'));
    res.json(data);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
