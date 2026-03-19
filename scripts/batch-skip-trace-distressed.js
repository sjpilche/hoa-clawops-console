#!/usr/bin/env node

/**
 * Batch skip-trace for Cook County distressed owners.
 *
 * Runs the DC Site Intel /owners/skip-trace-batch endpoint to enrich
 * owners with distress signals but no phone numbers.
 *
 * Usage:
 *   node scripts/batch-skip-trace-distressed.js [--limit 50] [--provider batch_skip_tracing]
 */

const http = require('http');
const https = require('https');
const url = require('url');

const DCSI_HOST = process.env.DCSI_HOST || 'localhost';
const DCSI_PORT = process.env.DCSI_PORT || '8095';
const DCSI_PROTOCOL = process.env.DCSI_PROTOCOL || 'http';

// Parse command-line args
const args = process.argv.slice(2);
let limit = 50;
let provider = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--limit' && args[i + 1]) {
    limit = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--provider' && args[i + 1]) {
    provider = args[i + 1];
    i++;
  }
}

console.log(`[batch-skip-trace] Calling DC Site Intel /owners/skip-trace-batch`);
console.log(`  Host: ${DCSI_HOST}:${DCSI_PORT}`);
console.log(`  Limit: ${limit} owners`);
if (provider) console.log(`  Provider: ${provider}`);

/**
 * Call DC Site Intel batch skip-trace endpoint.
 */
async function runBatchSkipTrace() {
  return new Promise((resolve, reject) => {
    // Build query string
    const query = new URLSearchParams({
      limit,
      include_retry: 'false',
    });
    if (provider) {
      query.append('provider', provider);
    }

    const endpoint = `http://${DCSI_HOST}:${DCSI_PORT}/api/owners/skip-trace-batch?${query.toString()}`;
    console.log(`\nPOST ${endpoint}\n`);

    const urlObj = new URL(endpoint);
    const protocol = urlObj.protocol === 'https:' ? https : http;

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Length': 0,
        'Accept': 'application/json',
      },
      timeout: 300000, // 5 minutes
    };

    const req = protocol.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const result = JSON.parse(data);
            console.log('\n✓ Skip-trace batch completed successfully');
            console.log(`\nResult:`);
            console.log(JSON.stringify(result, null, 2));
            resolve(result);
          } catch (err) {
            console.error('Failed to parse response JSON:', err);
            reject(err);
          }
        } else {
          console.error(`\n✗ HTTP ${res.statusCode}: ${res.statusMessage}`);
          console.error(data);
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });

    req.on('error', (err) => {
      console.error('Request error:', err);
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

/**
 * Main.
 */
(async () => {
  try {
    await runBatchSkipTrace();
    console.log('\n[batch-skip-trace] Done.');
    process.exit(0);
  } catch (err) {
    console.error('\n[batch-skip-trace] Error:', err.message);
    process.exit(1);
  }
})();
