/**
 * Direct test — runs the Reddit scanner, ingests signals, shows results.
 * Usage: node scripts/test-opportunity-scanner.js
 */
require('dotenv').config({ path: '.env.local' });
const { initDatabase, all, get } = require('../server/db/connection');

(async () => {
  await initDatabase();
  
  const tables = all("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'opp_%'");
  console.log('Opportunity tables:', tables.map(t => t.name));
  
  const scanners = all("SELECT * FROM opp_scanner_state");
  console.log('\nScanner state:', scanners.length, 'scanners');
  scanners.forEach(s => console.log('  ', s.scanner_name, '| enabled:', s.enabled, '| items:', s.items_found_total));
  
  console.log('\n--- Running Reddit Scanner ---');
  const redditScanner = require('../server/services/scanners/redditScanner');
  const { ingestSignal, getScannerState, updateScannerState } = require('../server/services/signalIngest');
  
  const state = getScannerState('reddit');
  console.log('Reddit cursor:', state.last_cursor);
  
  const result = await redditScanner.scan(state.last_cursor ? JSON.parse(state.last_cursor) : null);
  console.log('Signals found:', result.signals.length);
  
  let ingested = 0, dupes = 0;
  for (const sig of result.signals) {
    const r = await ingestSignal('reddit', sig);
    if (r.inserted) ingested++;
    else dupes++;
  }
  console.log('Ingested:', ingested, '| Dupes:', dupes);
  
  updateScannerState('reddit', JSON.stringify(result.nextCursor), ingested, 0);
  
  const totalSignals = get("SELECT COUNT(*) AS c FROM opp_signals");
  console.log('\nTotal signals in DB:', totalSignals.c);
  
  const samples = all("SELECT source, title, url FROM opp_signals ORDER BY scraped_at DESC LIMIT 5");
  samples.forEach(s => console.log('  [', s.source, ']', (s.title || '').substring(0, 70)));

  // Now try HN scanner
  console.log('\n--- Running HN Scanner ---');
  const hnScanner = require('../server/services/scanners/hnScanner');
  const hnState = getScannerState('hn');
  const hnResult = await hnScanner.scan(hnState.last_cursor ? JSON.parse(hnState.last_cursor) : null);
  console.log('HN signals found:', hnResult.signals.length);
  
  let hnIngested = 0, hnDupes = 0;
  for (const sig of hnResult.signals) {
    const r = await ingestSignal('hn', sig);
    if (r.inserted) hnIngested++;
    else hnDupes++;
  }
  console.log('HN ingested:', hnIngested, '| Dupes:', hnDupes);
  updateScannerState('hn', JSON.stringify(hnResult.nextCursor), hnIngested, 0);

  const final = get("SELECT COUNT(*) AS c FROM opp_signals");
  console.log('\n=== TOTAL SIGNALS IN DB:', final.c, '===');
  
  process.exit(0);
})();
