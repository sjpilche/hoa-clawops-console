const { initDatabase, all, get } = require('../server/db/connection');
(async () => {
  await initDatabase();
  const count = get('SELECT COUNT(*) as count FROM management_companies');
  console.log('Count:', count);
  const rows = all('SELECT id, name, priority_tier, reviews_scanned FROM management_companies LIMIT 5');
  console.log('Sample rows:', JSON.stringify(rows, null, 2));
})().catch(e => console.error(e.message));
