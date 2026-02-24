/**
 * Verify Azure SQL sync — check what data made it to empcapmaster2
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });
const sql = require('mssql');

const config = {
  server: process.env.AZURE_SQL_SERVER,
  database: process.env.AZURE_SQL_DATABASE,
  user: process.env.AZURE_SQL_USER,
  password: process.env.AZURE_SQL_PASSWORD,
  options: {
    encrypt: true,
    trustServerCertificate: false,
  },
};

(async () => {
  console.log('\n=== AZURE SQL SYNC VERIFICATION ===\n');
  console.log(`Server: ${config.server}`);
  console.log(`Database: ${config.database}\n`);

  try {
    const pool = await sql.connect(config);

    // Check mgmt_companies table
    try {
      const companies = await pool.request().query('SELECT COUNT(*) as count FROM dbo.mgmt_companies');
      console.log(`mgmt_companies: ${companies.recordset[0].count} rows`);

      const sample = await pool.request().query('SELECT TOP 3 name, priority_tier, portfolio_scraped, contacts_pulled FROM dbo.mgmt_companies ORDER BY communities_managed DESC');
      for (const row of sample.recordset) {
        console.log(`  ${row.name} (${row.priority_tier}) — scraped=${row.portfolio_scraped}, contacts=${row.contacts_pulled}`);
      }
    } catch (e) {
      console.log(`mgmt_companies: ${e.message}`);
    }

    // Check mgmt_company_contacts table
    try {
      const contacts = await pool.request().query('SELECT COUNT(*) as count FROM dbo.mgmt_company_contacts');
      console.log(`\nmgmt_company_contacts: ${contacts.recordset[0].count} rows`);

      const sample = await pool.request().query('SELECT TOP 5 mgmt_company_name, full_name, title, email, contact_type FROM dbo.mgmt_company_contacts');
      for (const row of sample.recordset) {
        console.log(`  ${row.mgmt_company_name}: ${row.full_name || '(no name)'} — ${row.title || row.contact_type} — ${row.email || '(no email)'}`);
      }
    } catch (e) {
      console.log(`mgmt_company_contacts: ${e.message}`);
    }

    // Check mgmt_review_signals table
    try {
      const signals = await pool.request().query('SELECT COUNT(*) as count FROM dbo.mgmt_review_signals');
      console.log(`\nmgmt_review_signals: ${signals.recordset[0].count} rows`);
    } catch (e) {
      console.log(`mgmt_review_signals: ${e.message}`);
    }

    // Check prospector_runs for mgmt agents
    try {
      const runs = await pool.request().query(`
        SELECT agent_id, COUNT(*) as run_count, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
        FROM dbo.prospector_runs
        WHERE agent_id LIKE 'mgmt_%'
        GROUP BY agent_id
      `);
      console.log('\nProspector runs (mgmt agents):');
      for (const row of runs.recordset) {
        console.log(`  ${row.agent_id}: ${row.run_count} runs (${row.completed} completed)`);
      }
    } catch (e) {
      console.log(`prospector_runs: ${e.message}`);
    }

    await pool.close();
    console.log('\n=== SYNC CHECK COMPLETE ===\n');
  } catch (e) {
    console.error('Connection error:', e.message);
  }

  process.exit(0);
})();
