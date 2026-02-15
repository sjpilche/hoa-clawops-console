/**
 * Health Check Endpoint
 *
 * Provides system health status including:
 * - Database connectivity
 * - OpenClaw CLI availability
 * - Disk space
 * - Memory usage
 * - Environment validation
 */

const express = require('express');
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { get, all } = require('../db/connection');

const router = express.Router();

/**
 * Check database connectivity and size
 */
function checkDatabase() {
  const dbPath = path.resolve(process.env.DB_PATH || './data/clawops.db');

  try {
    // Test database connection
    const result = get('SELECT 1 as healthy');

    // Get database file size
    const stats = fs.statSync(dbPath);
    const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);

    // Get table counts
    const agentCount = get('SELECT COUNT(*) as count FROM agents').count;
    const runCount = get('SELECT COUNT(*) as count FROM runs').count;
    const messageCount = get('SELECT COUNT(*) as count FROM messages').count;

    return {
      status: 'healthy',
      connected: true,
      path: dbPath,
      size_mb: parseFloat(sizeInMB),
      tables: {
        agents: agentCount,
        runs: runCount,
        messages: messageCount,
      },
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      connected: false,
      error: error.message,
    };
  }
}

/**
 * Check OpenClaw CLI availability
 */
function checkOpenClaw() {
  const mode = process.env.OPENCLAW_MODE || 'shell';
  const openclawPath = process.env.OPENCLAW_PATH || '/home/user/openclaw';

  try {
    if (mode === 'shell') {
      // Check if WSL is available
      const wslCheck = execSync('wsl --version', { timeout: 3000, encoding: 'utf-8' });

      // Check if OpenClaw directory exists in WSL
      const pathCheck = execSync(`wsl test -d "${openclawPath}" && echo "exists" || echo "not_found"`, {
        timeout: 3000,
        encoding: 'utf-8',
      }).trim();

      return {
        status: pathCheck === 'exists' ? 'healthy' : 'warning',
        mode: mode,
        path: openclawPath,
        wsl_available: true,
        path_exists: pathCheck === 'exists',
        version: wslCheck.includes('WSL') ? wslCheck.split('\n')[0] : 'unknown',
      };
    } else {
      // Docker mode or other - just report configuration
      return {
        status: 'info',
        mode: mode,
        path: openclawPath,
        message: `Running in ${mode} mode`,
      };
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      mode: mode,
      error: error.message,
      wsl_available: false,
    };
  }
}

/**
 * Check disk space
 */
function checkDiskSpace() {
  try {
    const dataDir = path.resolve('./data');

    // Ensure data directory exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Get disk usage (platform-specific)
    let availableGB = 0;
    let totalGB = 0;
    let usedPercent = 0;

    if (process.platform === 'win32') {
      // Windows: Use wmic
      try {
        const drive = path.parse(dataDir).root;
        const output = execSync(`wmic logicaldisk where "DeviceID='${drive.replace('\\', '')}'" get Size,FreeSpace /format:csv`, {
          timeout: 3000,
          encoding: 'utf-8',
        });

        const lines = output.split('\n').filter(line => line.trim() && !line.startsWith('Node'));
        if (lines.length > 0) {
          const parts = lines[0].split(',');
          if (parts.length >= 3) {
            const freeSpace = parseInt(parts[1]);
            const totalSpace = parseInt(parts[2]);
            availableGB = (freeSpace / (1024 ** 3)).toFixed(2);
            totalGB = (totalSpace / (1024 ** 3)).toFixed(2);
            usedPercent = (((totalSpace - freeSpace) / totalSpace) * 100).toFixed(1);
          }
        }
      } catch (error) {
        // Fallback: Just report that we couldn't get disk info
        availableGB = 'unknown';
        totalGB = 'unknown';
        usedPercent = 'unknown';
      }
    } else {
      // Linux/macOS: Use df
      const output = execSync(`df -BG "${dataDir}" | tail -1`, {
        timeout: 3000,
        encoding: 'utf-8',
      });

      const parts = output.trim().split(/\s+/);
      totalGB = parseFloat(parts[1].replace('G', ''));
      const usedGB = parseFloat(parts[2].replace('G', ''));
      availableGB = parseFloat(parts[3].replace('G', ''));
      usedPercent = parseFloat(parts[4].replace('%', ''));
    }

    // Determine status based on available space
    let status = 'healthy';
    if (typeof availableGB === 'number') {
      if (availableGB < 1) {
        status = 'critical';
      } else if (availableGB < 5) {
        status = 'warning';
      }
    }

    return {
      status,
      available_gb: availableGB,
      total_gb: totalGB,
      used_percent: usedPercent,
      data_directory: dataDir,
    };
  } catch (error) {
    return {
      status: 'unknown',
      error: error.message,
    };
  }
}

/**
 * Check memory usage
 */
function checkMemory() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const usedPercent = ((usedMem / totalMem) * 100).toFixed(1);

  // Determine status
  let status = 'healthy';
  if (usedPercent > 90) {
    status = 'critical';
  } else if (usedPercent > 80) {
    status = 'warning';
  }

  return {
    status,
    total_mb: (totalMem / (1024 * 1024)).toFixed(0),
    free_mb: (freeMem / (1024 * 1024)).toFixed(0),
    used_mb: (usedMem / (1024 * 1024)).toFixed(0),
    used_percent: parseFloat(usedPercent),
  };
}

/**
 * Check environment configuration
 */
function checkEnvironment() {
  const requiredVars = [
    'NODE_ENV',
    'JWT_SECRET',
    'DB_PATH',
    'OPENCLAW_MODE',
    'OPENCLAW_PATH',
  ];

  const missing = [];
  const configured = [];

  for (const varName of requiredVars) {
    if (process.env[varName]) {
      configured.push(varName);
    } else {
      missing.push(varName);
    }
  }

  // Check JWT_SECRET strength
  const jwtSecret = process.env.JWT_SECRET || '';
  const jwtStrong = jwtSecret.length >= 128;

  const status = missing.length === 0 && jwtStrong ? 'healthy' : 'warning';

  return {
    status,
    node_env: process.env.NODE_ENV || 'unknown',
    configured_vars: configured.length,
    missing_vars: missing,
    jwt_secret_length: jwtSecret.length,
    jwt_strong: jwtStrong,
  };
}

/**
 * GET /api/health
 *
 * Returns comprehensive system health status
 */
router.get('/', (req, res) => {
  const startTime = Date.now();

  // Collect all health checks
  const health = {
    status: 'healthy', // Will be downgraded if any component is unhealthy
    timestamp: new Date().toISOString(),
    uptime_seconds: Math.floor(process.uptime()),
    version: process.env.npm_package_version || '1.0.0',
    node_version: process.version,
    platform: process.platform,
    components: {
      database: checkDatabase(),
      openclaw: checkOpenClaw(),
      disk: checkDiskSpace(),
      memory: checkMemory(),
      environment: checkEnvironment(),
    },
  };

  // Determine overall status (worst component status wins)
  const statuses = Object.values(health.components).map(c => c.status);
  if (statuses.includes('critical') || statuses.includes('unhealthy')) {
    health.status = 'unhealthy';
  } else if (statuses.includes('warning')) {
    health.status = 'degraded';
  }

  // Add response time
  health.response_time_ms = Date.now() - startTime;

  // Set HTTP status code based on health
  const httpStatus = health.status === 'unhealthy' ? 503 : 200;

  res.status(httpStatus).json(health);
});

/**
 * GET /api/health/ready
 *
 * Kubernetes-style readiness probe (simple pass/fail)
 */
router.get('/ready', (req, res) => {
  try {
    // Check database
    get('SELECT 1');

    // Check environment
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      throw new Error('JWT_SECRET not configured');
    }

    res.status(200).json({ ready: true });
  } catch (error) {
    res.status(503).json({ ready: false, error: error.message });
  }
});

/**
 * GET /api/health/live
 *
 * Kubernetes-style liveness probe (is process alive?)
 */
router.get('/live', (req, res) => {
  res.status(200).json({
    alive: true,
    uptime_seconds: Math.floor(process.uptime()),
  });
});

module.exports = router;
