/**
 * Discovery API Routes
 *
 * GET  /api/discovery/stats         → Pipeline stats for the dashboard
 * GET  /api/discovery/next-target   → Next geo-target to process
 * GET  /api/discovery/communities   → Paginated community browser with search/filter/geo-target
 * GET  /api/discovery/geo-targets   → All geo-targets with community counts
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const { getPipelineStats, getNextGeoTarget } = require('../services/googleMapsDiscovery');

// Always read fresh from disk — communities DB is written by the scraper process
function openFreshDb() {
  const initSqlJs = require('sql.js');
  const fs = require('fs');
  const DB_PATH = path.join(__dirname, '../../hoa_leads.sqlite');
  return initSqlJs().then(SQL => {
    const buf = fs.readFileSync(DB_PATH);
    return new SQL.Database(buf);
  });
}

// Pipeline stats for DiscoveryDashboard
router.get('/stats', async (req, res) => {
  try {
    const stats = await getPipelineStats();
    res.json(stats);
  } catch (err) {
    console.error('[Discovery] Stats error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Next geo-target to process
router.get('/next-target', async (req, res) => {
  try {
    const target = await getNextGeoTarget();
    if (!target) {
      return res.json({ message: 'All geo-targets are up to date', target: null });
    }
    res.json({
      target,
      cities: JSON.parse(target.cities || '[]'),
      zipCodes: JSON.parse(target.zip_codes || '[]'),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// All geo-targets with community counts (for filter dropdown)
router.get('/geo-targets', async (req, res) => {
  try {
    const db = await openFreshDb();
    const result = db.exec(`
      SELECT g.id, g.name, g.priority, g.is_active, g.last_sweep_at,
        COUNT(cgt.community_id) as community_count
      FROM geo_targets g
      LEFT JOIN community_geo_targets cgt ON cgt.geo_target_id = g.id
      GROUP BY g.id
      ORDER BY g.priority ASC
    `);
    const geoTargets = [];
    if (result[0]) {
      const cols = result[0].columns;
      result[0].values.forEach(row => {
        const obj = {};
        cols.forEach((col, i) => { obj[col] = row[i]; });
        geoTargets.push(obj);
      });
    }
    db.close();
    res.json(geoTargets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Browsable community list with search + filter + geo-target filter
// GET /api/discovery/communities?search=&state=&geoTargetId=&maxRating=&sortBy=&page=&limit=
router.get('/communities', async (req, res) => {
  try {
    const db = await openFreshDb();

    const search = (req.query.search || '').trim();
    const state = (req.query.state || '').trim().toUpperCase();
    const geoTargetId = (req.query.geoTargetId || '').trim();
    const maxRating = parseFloat(req.query.maxRating) || 5;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(10, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;
    const sortBy = req.query.sortBy || 'google_rating';
    const sortDir = req.query.sortDir === 'asc' ? 'ASC' : 'DESC';

    const allowedSort = ['google_rating', 'name', 'city', 'discovered_at', 'review_count'];
    const safeSort = allowedSort.includes(sortBy) ? sortBy : 'google_rating';

    // Build base query — join to junction table when geo-target filter is active
    let fromClause, conditions, params;

    if (geoTargetId) {
      // Filter by geo-target via junction table
      fromClause = `FROM hoa_communities c
        INNER JOIN community_geo_targets cgt ON cgt.community_id = c.id AND cgt.geo_target_id = ?`;
      conditions = ["(c.is_management_company = 0 OR c.is_management_company IS NULL)"];
      params = [geoTargetId];
    } else {
      fromClause = `FROM hoa_communities c`;
      conditions = ["(c.is_management_company = 0 OR c.is_management_company IS NULL)"];
      params = [];
    }

    if (search) {
      conditions.push("(LOWER(c.name) LIKE ? OR LOWER(c.city) LIKE ? OR LOWER(c.address) LIKE ?)");
      const q = `%${search.toLowerCase()}%`;
      params.push(q, q, q);
    }
    if (state) {
      conditions.push("c.state = ?");
      params.push(state);
    }
    if (maxRating < 5) {
      conditions.push("c.google_rating <= ?");
      params.push(maxRating);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const selectCols = geoTargetId
      ? `c.id, c.name, c.address, c.city, c.state, c.zip_code, c.phone,
         c.google_rating, c.review_count, c.website_url,
         c.google_maps_url, c.source, c.discovered_at, c.geo_target_id,
         cgt.geo_target_id as matched_geo_target`
      : `c.id, c.name, c.address, c.city, c.state, c.zip_code, c.phone,
         c.google_rating, c.review_count, c.website_url,
         c.google_maps_url, c.source, c.discovered_at, c.geo_target_id,
         (SELECT GROUP_CONCAT(geo_target_id, ', ') FROM community_geo_targets WHERE community_id = c.id) as geo_targets_list`;

    // Count
    const countResult = db.exec(`SELECT COUNT(*) ${fromClause} ${where}`, params);
    const total = countResult[0]?.values[0][0] || 0;

    // Data
    const dataResult = db.exec(
      `SELECT ${selectCols} ${fromClause} ${where}
       ORDER BY c.${safeSort} ${sortDir} NULLS LAST
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    let communities = [];
    if (dataResult[0]) {
      const cols = dataResult[0].columns;
      communities = dataResult[0].values.map(row => {
        const obj = {};
        cols.forEach((col, i) => { obj[col] = row[i]; });
        return obj;
      });
    }

    // States for filter dropdown
    const statesResult = db.exec(
      "SELECT DISTINCT state FROM hoa_communities WHERE state IS NOT NULL AND (is_management_company = 0 OR is_management_company IS NULL) ORDER BY state"
    );
    const states = statesResult[0]?.values.map(r => r[0]) || [];

    // Geo-targets for filter dropdown (only those with communities)
    const geoResult = db.exec(`
      SELECT g.id, g.name, COUNT(cgt.community_id) as count
      FROM geo_targets g
      INNER JOIN community_geo_targets cgt ON cgt.geo_target_id = g.id
      GROUP BY g.id
      ORDER BY g.priority ASC
    `);
    const geoTargets = [];
    if (geoResult[0]) {
      const cols = geoResult[0].columns;
      geoResult[0].values.forEach(row => {
        const obj = {};
        cols.forEach((col, i) => { obj[col] = row[i]; });
        geoTargets.push(obj);
      });
    }

    db.close();

    res.json({
      communities,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      states,
      geoTargets,
    });
  } catch (err) {
    console.error('[Discovery] Communities error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
