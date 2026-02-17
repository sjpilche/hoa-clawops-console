/**
 * Platform Scanner API Routes
 *
 * Endpoints for managing the platform scanner
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { scanAllPlatforms, getMonitoredCommunities } = require('../services/platformScanner');
const { isSchedulerRunning, getNextScanTime } = require('../services/scannerScheduler');

/**
 * GET /api/scanner/status
 * Get scanner status and configuration
 */
router.get('/status', authenticate, (req, res) => {
  try {
    const status = {
      scheduler_running: isSchedulerRunning(),
      next_scan_time: getNextScanTime(),
      monitored_communities: getMonitoredCommunities(),
      platforms: {
        reddit: {
          enabled: !!process.env.REDDIT_CLIENT_ID,
          configured: !!(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET)
        },
        facebook: {
          enabled: false, // Requires manual login
          configured: false
        },
        linkedin: {
          enabled: false,
          configured: false
        },
        biggerpockets: {
          enabled: false,
          configured: false
        }
      }
    };

    res.json(status);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get scanner status',
      message: error.message
    });
  }
});

/**
 * POST /api/scanner/scan
 * Manually trigger a scan of all platforms
 */
router.post('/scan', authenticate, async (req, res) => {
  try {
    console.log('[Scanner API] Manual scan triggered by user');

    // Run scan asynchronously (don't wait for it to complete)
    scanAllPlatforms()
      .then(results => {
        console.log('[Scanner API] Manual scan completed:', results);
      })
      .catch(error => {
        console.error('[Scanner API] Manual scan failed:', error.message);
      });

    res.json({
      message: 'Scan started',
      status: 'running'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to start scan',
      message: error.message
    });
  }
});

/**
 * GET /api/scanner/communities
 * Get list of monitored communities
 */
router.get('/communities', authenticate, (req, res) => {
  try {
    const communities = getMonitoredCommunities();
    res.json(communities);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get communities',
      message: error.message
    });
  }
});

module.exports = router;
