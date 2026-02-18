/**
 * Discovery API Routes
 *
 * GET  /api/discovery/stats         → Pipeline stats for the dashboard
 * GET  /api/discovery/next-target   → Next geo-target to process
 * GET  /api/discovery/geo-targets   → All geo-targets with community counts
 */

const express = require('express');
const router = express.Router();
const { getPipelineStats, getNextGeoTarget } = require('../services/googleMapsDiscovery');

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

module.exports = router;
