const { initDatabase, all } = require('../server/db/connection');

async function checkSchema() {
  await initDatabase();

  console.log('\n📋 content_queue table schema:\n');
  const schema = all("PRAGMA table_info(content_queue)");

  schema.forEach(col => {
    console.log(`  ${col.name.padEnd(20)} ${col.type.padEnd(15)} ${col.notnull ? 'NOT NULL' : ''} ${col.dflt_value ? `DEFAULT ${col.dflt_value}` : ''}`);
  });

  console.log('\n📊 Sample rows:\n');
  const rows = all("SELECT * FROM content_queue LIMIT 3");
  console.log(`Found ${rows.length} rows\n`);

  if (rows.length > 0) {
    console.log('Columns:', Object.keys(rows[0]).join(', '));
  }
}

checkSchema();
