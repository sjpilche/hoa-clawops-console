'use strict';
const { initDatabase, run, all } = require('../server/db/connection');

(async () => {
  await initDatabase();
  const bySource = all("SELECT source, COUNT(*) as cnt FROM cfo_leads GROUP BY source ORDER BY cnt DESC");
  console.log('\nLeads by source:', JSON.stringify(bySource, null, 2));
  const total = all("SELECT COUNT(*) as cnt FROM cfo_leads")[0];
  console.log('Total leads:', total.cnt);
  const sample = all("SELECT company_name, notes, pilot_fit_score FROM cfo_leads WHERE source='dbpr_scrape' LIMIT 5");
  console.log('\nDBPR sample:', JSON.stringify(sample, null, 2));
})();
