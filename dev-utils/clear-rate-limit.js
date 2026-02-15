#!/usr/bin/env node

/**
 * Quick script to clear rate limiting via the admin API endpoint
 *
 * Usage:
 *   node clear-rate-limit.js
 *
 * This sends an authenticated request to the clear-rate-limit endpoint
 * using your stored JWT token.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// Get token from localStorage simulation
// In a real browser, this would be: localStorage.getItem('clawops_token')
// For Node.js, we'll read from a file if it exists, or prompt user to paste token

console.log('🔓 ClawOps Rate Limit Clearer\n');
console.log('This will clear authentication rate limiting for all IP addresses.\n');

// Try to find token in common locations
let token = null;

// Option 1: Read from environment variable
if (process.env.CLAWOPS_TOKEN) {
  token = process.env.CLAWOPS_TOKEN;
  console.log('✓ Using token from CLAWOPS_TOKEN environment variable');
}

// Option 2: Prompt user to get from browser
if (!token) {
  console.log('How to get your token:');
  console.log('1. Open ClawOps in your browser');
  console.log('2. Open browser console (F12)');
  console.log('3. Run: localStorage.getItem("clawops_token")');
  console.log('4. Copy the token (without quotes)');
  console.log('5. Set environment variable: CLAWOPS_TOKEN=<your-token>');
  console.log('6. Run this script again\n');

  console.log('Or you can use the browser console directly:');
  console.log('---');
  console.log(`
fetch('/api/auth/clear-rate-limit', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('clawops_token'),
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({})
})
.then(r => r.json())
.then(data => {
  console.log('✓ Rate limit cleared!', data);
  alert('Rate limit cleared! You can now create agents.');
})
.catch(err => {
  console.error('✗ Failed:', err);
  alert('Failed to clear rate limit: ' + err.message);
});
  `);
  console.log('---\n');

  process.exit(0);
}

// Make request to clear rate limit
const postData = JSON.stringify({});

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/auth/clear-rate-limit',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData),
    'Authorization': `Bearer ${token}`,
  },
};

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const result = JSON.parse(data);

      if (res.statusCode === 200) {
        console.log('✅ Success!');
        console.log(`   ${result.message}`);
        console.log(`   Cleared: ${result.cleared} IP address(es)\n`);
        console.log('You can now create agents in the ClawOps console!');
      } else {
        console.error('❌ Failed:', result.error || result.message);
        console.error(`   Status: ${res.statusCode}`);
        if (result.code) {
          console.error(`   Code: ${result.code}`);
        }
      }
    } catch (error) {
      console.error('❌ Failed to parse response:', data);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request failed:', error.message);
  console.error('\nMake sure:');
  console.error('1. The server is running (npm run dev:server)');
  console.error('2. The server is listening on port 3001');
  console.error('3. Your token is valid (not expired)');
});

req.write(postData);
req.end();
