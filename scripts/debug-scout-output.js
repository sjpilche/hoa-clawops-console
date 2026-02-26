/**
 * Debug raw OpenClaw output for jake-lead-scout.
 */
'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

async function main() {
  const { initDatabase } = require('../server/db/connection');
  await initDatabase();

  const openclawBridge = require('../server/services/openclawBridge');

  const result = await openclawBridge.runAgent('jake-lead-scout', {
    openclawId: 'jake-lead-scout',
    message: JSON.stringify({ region: 'Denver, CO', trade: 'GC', limit: 3 }),
    sessionId: `debug-${Date.now()}`,
  });

  // Dump the raw output
  console.log('\n=== RAW OUTPUT (first 3000 chars) ===');
  console.log(result.output.slice(0, 3000));

  console.log('\n=== PARSED ===');
  const parsed = openclawBridge.constructor.parseOutput(result.output);
  console.log('tokensUsed:', parsed.tokensUsed);
  console.log('costUsd:', parsed.costUsd);
  console.log('text length:', parsed.text ? parsed.text.length : 0);
  console.log('text preview:', parsed.text ? parsed.text.slice(0, 500) : '(none)');

  // Parse the JSON ourselves
  try {
    const raw = JSON.parse(result.output);
    console.log('\n=== JSON STRUCTURE ===');
    console.log('payloads count:', raw.payloads?.length || 0);
    if (raw.payloads) {
      raw.payloads.forEach((p, i) => {
        console.log(`  payload[${i}]:`, Object.keys(p || {}), 'text?', !!p?.text, 'content?', !!p?.content);
        if (p?.text) console.log('    text preview:', p.text.slice(0, 200));
      });
    }
    console.log('meta keys:', Object.keys(raw.meta || {}));
  } catch (e) {
    console.log('Not JSON:', e.message);
    console.log('Raw start:', result.output.slice(0, 200));
  }
}

main().catch(console.error);
