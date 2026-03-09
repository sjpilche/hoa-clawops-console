require('dotenv').config({ path: '.env.local' });
const sql = require('mssql');

const config = {
  server: process.env.AZURE_SQL_SERVER,
  database: process.env.AZURE_SQL_DATABASE,
  user: process.env.AZURE_SQL_USER,
  password: process.env.AZURE_SQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: false, connectTimeout: 20000 },
};

async function main() {
  const pool = await sql.connect(config);

  // What contact channels do we actually have?
  const { recordset: channels } = await pool.request().query(`
    SELECT
      client_type,
      COUNT(*) AS total,
      SUM(CASE WHEN email LIKE '%@%.%' AND LEN(email) > 8
               AND email NOT LIKE '%unknown%' AND email NOT LIKE '%seebelow%'
               AND email NOT LIKE '%not.com' AND email NOT LIKE '%donotuse%'
          THEN 1 ELSE 0 END) AS has_email,
      SUM(CASE WHEN 1=0 THEN 1 ELSE 0 END) AS has_phone,
      SUM(CASE WHEN website IS NOT NULL AND LEN(website) > 5 THEN 1 ELSE 0 END) AS has_website,
      SUM(CASE WHEN city IS NOT NULL THEN 1 ELSE 0 END) AS has_location
    FROM livempaint_leads
    WHERE outreach_status = 'new'
    GROUP BY client_type
    ORDER BY total DESC
  `);

  console.log('\n=== Contact Channels Available (new/unsent only) ===');
  console.log(' Segment'.padEnd(28), 'Total'.padEnd(8), 'Email'.padEnd(8), 'Phone'.padEnd(8), 'Website'.padEnd(10), 'Location');
  console.log(' ' + '-'.repeat(70));
  channels.forEach(r =>
    console.log(
      ' ' + (r.client_type || 'Unknown').padEnd(27),
      String(r.total).padEnd(8),
      String(r.has_email).padEnd(8),
      String(r.has_phone).padEnd(8),
      String(r.has_website).padEnd(10),
      r.has_location
    )
  );

  // Check what columns actually exist on livempaint_leads
  const { recordset: cols } = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'livempaint_leads'
    ORDER BY ORDINAL_POSITION
  `);
  console.log('\n=== livempaint_leads columns ===');
  cols.forEach(c => console.log(' ', c.COLUMN_NAME.padEnd(25), c.DATA_TYPE));

  // What does the source livempaint2004 have that we didn't pull?
  // Re-check contact table for phone numbers
  const paintConfig = {
    server: 'liveempirepaint.database.windows.net',
    database: 'LIVEempirepaint2004',
    user: 'lcabarcas',
    password: '!NSGColorado00',
    options: { encrypt: true, trustServerCertificate: false, connectTimeout: 20000 },
  };
  const S = 'LIVEempirepaint2004';

  try {
    const paintPool = await sql.connect(paintConfig);
    console.log('\nConnected to livempaint2004 — checking for phone numbers...');

    // Check contact table for phone columns
    const { recordset: contactCols } = await paintPool.request().query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'contact' AND TABLE_SCHEMA = '${S}'
      ORDER BY ORDINAL_POSITION
    `);
    console.log('\ncontact table columns:', contactCols.map(c => c.COLUMN_NAME).join(', '));

    // Check office table for phone
    const { recordset: officeCols } = await paintPool.request().query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'office' AND TABLE_SCHEMA = '${S}'
      ORDER BY ORDINAL_POSITION
    `);
    console.log('office table columns:', officeCols.map(c => c.COLUMN_NAME).join(', '));

    // Check client table for phone
    const { recordset: clientCols } = await paintPool.request().query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'client' AND TABLE_SCHEMA = '${S}'
      ORDER BY ORDINAL_POSITION
    `);
    console.log('client table columns:', clientCols.map(c => c.COLUMN_NAME).join(', '));

    // How many contacts have phone numbers?
    const { recordset: phoneCounts } = await paintPool.request().query(`
      SELECT
        SUM(CASE WHEN c.phone IS NOT NULL AND LEN(c.phone) > 6 THEN 1 ELSE 0 END) AS contact_phones,
        SUM(CASE WHEN o.phone IS NOT NULL AND LEN(o.phone) > 6 THEN 1 ELSE 0 END) AS office_phones,
        COUNT(*) AS total
      FROM [${S}].[contact] c
      JOIN [${S}].[office] o ON c.office_id = o.id
      JOIN [${S}].[client] cl ON o.client_id = cl.id
      WHERE c.is_active = 1 AND cl.is_active = 1
        AND c.email IS NOT NULL AND LEN(c.email) > 5
    `);
    const pc = phoneCounts[0];
    console.log(`\nPhone coverage: contact.phone=${pc.contact_phones} | office.phone=${pc.office_phones} | total contacts=${pc.total}`);

    await paintPool.close();
  } catch (e) {
    console.log('livempaint2004 check failed:', e.message);
  }

  await pool.close();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
