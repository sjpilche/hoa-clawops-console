'use strict';
const { initDatabase, run, all } = require('../server/db/connection');

(async () => {
  await initDatabase();
  const count = all("SELECT COUNT(*) as cnt FROM cfo_leads WHERE source='dbpr_scrape'")[0];
  console.log(`Found ${count.cnt} DBPR leads`);

  if (count.cnt === 0) { console.log('Nothing to delete.'); process.exit(0); }

  const { confirmOrDryRun } = require('./lib/confirm');
  const dryRun = await confirmOrDryRun(`DELETE ${count.cnt} DBPR leads from cfo_leads`, process.argv);
  if (dryRun) { process.exit(0); }

  run("DELETE FROM cfo_leads WHERE source='dbpr_scrape'");
  const after = all("SELECT COUNT(*) as cnt FROM cfo_leads")[0];
  console.log(`Deleted. Remaining leads: ${after.cnt}`);
  process.exit(0);
})();
