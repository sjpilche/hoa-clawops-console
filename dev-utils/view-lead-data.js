/**
 * View actual lead data from the database
 */
require('dotenv').config({ path: '.env.local' });
const sql = require('mssql');

const config = {
  server: process.env.AZURE_SQL_SERVER,
  database: process.env.AZURE_SQL_DATABASE,
  user: process.env.AZURE_SQL_USER,
  password: process.env.AZURE_SQL_PASSWORD,
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
    connectTimeout: 30000,
  },
};

async function viewLeadData() {
  console.log('📊 Lead Data Summary from empcapmaster2');
  console.log('='.repeat(60) + '\n');

  try {
    const pool = await sql.connect(config);
    console.log('✅ Connected!\n');

    // 1. Main leads table
    console.log('📋 Table: dbo.leads');
    console.log('-'.repeat(60));

    const leadsCount = await pool.request().query(`
      SELECT COUNT(*) as total FROM dbo.leads
    `);
    console.log(`Total Leads: ${leadsCount.recordset[0].total.toLocaleString()}`);

    const leadsColumns = await pool.request().query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'leads' AND TABLE_SCHEMA = 'dbo'
      ORDER BY ORDINAL_POSITION
    `);
    console.log(`Columns: ${leadsColumns.recordset.map(c => c.COLUMN_NAME).join(', ')}`);

    const leadsSample = await pool.request().query(`
      SELECT TOP 5 * FROM dbo.leads
    `);
    console.log(`\nSample Data (first 5 leads):`);
    leadsSample.recordset.forEach((lead, idx) => {
      console.log(`\n  Lead ${idx + 1}:`);
      Object.entries(lead).forEach(([key, value]) => {
        let displayValue = value;
        if (value === null) displayValue = 'NULL';
        else if (typeof value === 'string' && value.length > 100) displayValue = value.substring(0, 100) + '...';
        else if (value instanceof Date) displayValue = value.toISOString().split('T')[0];
        console.log(`    ${key}: ${displayValue}`);
      });
    });

    // 2. HOA contacts table (emails)
    console.log('\n\n' + '='.repeat(60));
    console.log('📋 Table: dbo.hoa_contact');
    console.log('-'.repeat(60));

    const contactsCount = await pool.request().query(`
      SELECT COUNT(*) as total FROM dbo.hoa_contact
    `);
    console.log(`Total Contacts: ${contactsCount.recordset[0].total.toLocaleString()}`);

    const contactsWithEmail = await pool.request().query(`
      SELECT COUNT(*) as total FROM dbo.hoa_contact
      WHERE email IS NOT NULL AND email != ''
    `);
    console.log(`Contacts with Email: ${contactsWithEmail.recordset[0].total.toLocaleString()}`);

    const contactsSample = await pool.request().query(`
      SELECT TOP 10 name, title, email, phone, company
      FROM dbo.hoa_contact
      WHERE email IS NOT NULL AND email != ''
    `);
    console.log(`\nSample Contacts with Emails (first 10):`);
    contactsSample.recordset.forEach((contact, idx) => {
      console.log(`\n  ${idx + 1}. ${contact.name || 'N/A'}`);
      console.log(`     Email: ${contact.email}`);
      console.log(`     Title: ${contact.title || 'N/A'}`);
      console.log(`     Phone: ${contact.phone || 'N/A'}`);
      console.log(`     Company: ${contact.company || 'N/A'}`);
    });

    // 3. Reserve study leads
    console.log('\n\n' + '='.repeat(60));
    console.log('📋 Table: dbo.rs_leads');
    console.log('-'.repeat(60));

    const rsLeadsCount = await pool.request().query(`
      SELECT COUNT(*) as total FROM dbo.rs_leads
    `);
    console.log(`Total RS Leads: ${rsLeadsCount.recordset[0].total.toLocaleString()}`);

    const rsLeadsSample = await pool.request().query(`
      SELECT TOP 5 * FROM dbo.rs_leads
    `);
    console.log(`\nSample RS Leads (first 5):`);
    rsLeadsSample.recordset.forEach((lead, idx) => {
      console.log(`\n  Lead ${idx + 1}:`);
      Object.entries(lead).forEach(([key, value]) => {
        let displayValue = value;
        if (value === null) displayValue = 'NULL';
        else if (value instanceof Date) displayValue = value.toISOString().split('T')[0];
        console.log(`    ${key}: ${displayValue}`);
      });
    });

    // 4. Marketing outreach queue
    console.log('\n\n' + '='.repeat(60));
    console.log('📋 Table: dbo.mkt_outreach_queue');
    console.log('-'.repeat(60));

    const mktCount = await pool.request().query(`
      SELECT COUNT(*) as total FROM dbo.mkt_outreach_queue
    `);
    console.log(`Total Marketing Queue Items: ${mktCount.recordset[0].total.toLocaleString()}`);

    // Summary
    console.log('\n\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Leads: ${leadsCount.recordset[0].total.toLocaleString()}`);
    console.log(`Total Contacts: ${contactsCount.recordset[0].total.toLocaleString()}`);
    console.log(`Contacts with Email: ${contactsWithEmail.recordset[0].total.toLocaleString()}`);
    console.log(`RS Leads: ${rsLeadsCount.recordset[0].total.toLocaleString()}`);
    console.log(`Marketing Queue: ${mktCount.recordset[0].total.toLocaleString()}`);

    await pool.close();
    console.log('\n✅ Complete!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

viewLeadData().catch(console.error);
