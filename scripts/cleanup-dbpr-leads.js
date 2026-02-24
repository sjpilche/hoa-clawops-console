'use strict';
const { initDatabase, run, all } = require('../server/db/connection');

(async () => {
  await initDatabase();
  // Remove the St. Lucie leads that were labeled as Sarasota
  const count = all("SELECT COUNT(*) as cnt FROM cfo_leads WHERE source='dbpr_scrape'")[0];
  console.log(`Removing ${count.cnt} DBPR leads (wrong county - St. Lucie labeled as Sarasota)`);
  run("DELETE FROM cfo_leads WHERE source='dbpr_scrape'");
  const after = all("SELECT COUNT(*) as cnt FROM cfo_leads")[0];
  console.log(`Remaining leads: ${after.cnt}`);
  process.exit(0);
})();
