#!/usr/bin/env node
/**
 * Test all 10 scanners — runs HTTP-only scanners directly,
 * skips Playwright scanners unless --playwright flag is passed.
 *
 * Usage:
 *   node scripts/test-all-scanners.js              # HTTP scanners only
 *   node scripts/test-all-scanners.js --playwright  # All 10 including Playwright
 *   node scripts/test-all-scanners.js github        # Single scanner by name
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });

const path = require('path');

// Resolve modules from project root
const resolve = (p) => path.join(__dirname, '..', p);

const HTTP_SCANNERS = ['reddit', 'hn', 'ph', 'github', 'trends', 'stackoverflow'];
const PLAYWRIGHT_SCANNERS = ['twitter', 'forum', 'indeed', 'indiehackers'];

const SCANNER_MAP = {
  reddit:         () => require(resolve('server/services/scanners/redditScanner')),
  hn:             () => require(resolve('server/services/scanners/hnScanner')),
  ph:             () => require(resolve('server/services/scanners/phScanner')),
  github:         () => require(resolve('server/services/scanners/githubScanner')),
  trends:         () => require(resolve('server/services/scanners/trendsScanner')),
  stackoverflow:  () => require(resolve('server/services/scanners/stackoverflowScanner')),
  twitter:        () => require(resolve('server/services/scanners/twitterScanner')),
  forum:          () => require(resolve('server/services/scanners/forumScanner')),
  indeed:         () => require(resolve('server/services/scanners/indeedScanner')),
  indiehackers:   () => require(resolve('server/services/scanners/indieHackersScanner')),
};

async function testScanner(name) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Testing: ${name}`);
  console.log(`${'═'.repeat(60)}`);

  const start = Date.now();
  try {
    const mod = SCANNER_MAP[name]();
    const result = await mod.scan(null);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    console.log(`  ✅ ${name}: ${result.signals.length} signals, ${result.errors || 0} errors in ${elapsed}s`);
    if (result.signals.length > 0) {
      const s = result.signals[0];
      console.log(`  Sample: "${(s.title || '').slice(0, 80)}" [score: ${s.platform_score}]`);
    }
    if (result.nextCursor) {
      console.log(`  Cursor: ${typeof result.nextCursor === 'string' ? result.nextCursor.slice(0, 100) : JSON.stringify(result.nextCursor).slice(0, 100)}`);
    }
    return { name, signals: result.signals.length, errors: result.errors || 0, elapsed };
  } catch (err) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.error(`  ❌ ${name}: FAILED in ${elapsed}s — ${err.message}`);
    return { name, signals: 0, errors: 1, elapsed, error: err.message };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const includePlaywright = args.includes('--playwright');
  const singleScanner = args.find(a => !a.startsWith('--'));

  let scanners;
  if (singleScanner) {
    if (!SCANNER_MAP[singleScanner]) {
      console.error(`Unknown scanner: ${singleScanner}`);
      console.error(`Available: ${Object.keys(SCANNER_MAP).join(', ')}`);
      process.exit(1);
    }
    scanners = [singleScanner];
  } else {
    scanners = [...HTTP_SCANNERS];
    if (includePlaywright) scanners.push(...PLAYWRIGHT_SCANNERS);
  }

  console.log(`\n🔍 Testing ${scanners.length} scanners: ${scanners.join(', ')}`);
  console.log(`   ${includePlaywright ? '(including Playwright scanners)' : '(HTTP only — add --playwright for all 10)'}`);

  const results = [];
  for (const name of scanners) {
    results.push(await testScanner(name));
    // Small delay between scanners to be nice to APIs
    await new Promise(r => setTimeout(r, 1000));
  }

  // Summary
  console.log(`\n${'═'.repeat(60)}`);
  console.log('  SUMMARY');
  console.log(`${'═'.repeat(60)}`);

  let totalSignals = 0;
  let totalErrors = 0;
  for (const r of results) {
    const status = r.error ? '❌' : '✅';
    console.log(`  ${status} ${r.name.padEnd(16)} ${String(r.signals).padStart(4)} signals  ${String(r.errors).padStart(2)} errors  ${r.elapsed}s`);
    totalSignals += r.signals;
    totalErrors += r.errors;
  }

  console.log(`${'─'.repeat(60)}`);
  console.log(`  TOTAL: ${totalSignals} signals, ${totalErrors} errors from ${results.length} scanners`);
  console.log(`${'═'.repeat(60)}\n`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
