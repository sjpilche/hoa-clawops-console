/**
 * Scanner Scheduler
 *
 * Automatically runs platform scanners on a schedule
 * - Reddit: Every 2 hours
 * - Facebook: Every 4 hours
 * - LinkedIn: Every 4 hours
 * - BiggerPockets: Every 6 hours
 *
 * USAGE:
 *   const { startScheduler, stopScheduler } = require('./scannerScheduler');
 *   startScheduler(); // Starts all scheduled scans
 */

const { scanAllPlatforms } = require('./platformScanner');

let schedulerIntervals = [];
let isRunning = false;

/**
 * Start the scanner scheduler
 */
function startScheduler() {
  if (isRunning) {
    console.log('[Scanner] Scheduler already running');
    return;
  }

  console.log('[Scanner] Starting scheduler...');

  // Run initial scan immediately (async, don't wait)
  scanAllPlatforms().catch(err => {
    console.error('[Scanner] Initial scan failed:', err.message);
  });

  // Schedule recurring scans every 2 hours
  const scanInterval = setInterval(async () => {
    console.log('[Scanner] Running scheduled scan...');
    try {
      await scanAllPlatforms();
    } catch (error) {
      console.error('[Scanner] Scheduled scan failed:', error.message);
    }
  }, 2 * 60 * 60 * 1000); // 2 hours in milliseconds

  schedulerIntervals.push(scanInterval);
  isRunning = true;

  console.log('[Scanner] ✅ Scheduler started (scans every 2 hours)');
}

/**
 * Stop the scanner scheduler
 */
function stopScheduler() {
  if (!isRunning) {
    console.log('[Scanner] Scheduler not running');
    return;
  }

  console.log('[Scanner] Stopping scheduler...');

  schedulerIntervals.forEach(interval => clearInterval(interval));
  schedulerIntervals = [];
  isRunning = false;

  console.log('[Scanner] ✅ Scheduler stopped');
}

/**
 * Check if scheduler is running
 */
function isSchedulerRunning() {
  return isRunning;
}

/**
 * Get next scan time
 */
function getNextScanTime() {
  if (!isRunning) return null;

  // Calculate next scan time (2 hours from now)
  const nextScan = new Date(Date.now() + 2 * 60 * 60 * 1000);
  return nextScan.toISOString();
}

module.exports = {
  startScheduler,
  stopScheduler,
  isSchedulerRunning,
  getNextScanTime
};
