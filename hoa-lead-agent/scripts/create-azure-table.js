/**
 * @file create-azure-table.js
 * @description Creates the hoa_contacts table in Azure SQL Database
 */

require('dotenv').config();
const sql = require('mssql');

const config = {
  server: process.env.AZURE_SQL_SERVER || 'empirecapital.database.windows.net',
  database: process.env.AZURE_SQL_DATABASE || 'empcapmaster2',
  user: process.env.AZURE_SQL_USER || 'CloudSA1f77fc9b',
  password: process.env.AZURE_SQL_PASSWORD,
  options: {
    encrypt: true,
    trustServerCertificate: false,
    enableArithAbort: true,
  },
};

async function createTable() {
  console.log('🔄 Connecting to Azure SQL Database...');
  console.log(`   Server: ${config.server}`);
  console.log(`   Database: ${config.database}`);

  try {
    const pool = await sql.connect(config);
    console.log('✅ Connected to Azure SQL\n');

    console.log('📝 Creating hoa_contacts table...');

    // Create the table
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='hoa_contacts' and xtype='U')
      BEGIN
        CREATE TABLE hoa_contacts (
          id INT PRIMARY KEY IDENTITY(1,1),

          -- HOA Information
          hoa_name NVARCHAR(255) NOT NULL,
          entity_number NVARCHAR(50),

          -- Contact Information
          contact_person NVARCHAR(255),
          title NVARCHAR(100),
          email NVARCHAR(255),
          phone NVARCHAR(50),

          -- Property Information
          property_address NVARCHAR(500),
          city NVARCHAR(100) NOT NULL,
          state NVARCHAR(2) DEFAULT 'CA',
          zip NVARCHAR(20),
          unit_count INT,

          -- Management Company
          management_company NVARCHAR(255),

          -- Source & Quality
          source_url NVARCHAR(1000) NOT NULL,
          source_type NVARCHAR(50) NOT NULL,
          confidence_score INT DEFAULT 50,

          -- Status
          status NVARCHAR(50) DEFAULT 'new',
          notes NVARCHAR(MAX),

          -- Deduplication
          fingerprint NVARCHAR(255) NOT NULL,

          -- Metadata
          scraped_at DATETIME DEFAULT GETDATE(),
          updated_at DATETIME DEFAULT GETDATE(),
          last_contacted_at DATETIME
        );

        -- Indexes
        CREATE INDEX idx_hoa_contacts_status ON hoa_contacts(status);
        CREATE INDEX idx_hoa_contacts_city ON hoa_contacts(city);
        CREATE INDEX idx_hoa_contacts_state ON hoa_contacts(state);
        CREATE INDEX idx_hoa_contacts_fingerprint ON hoa_contacts(fingerprint);
        CREATE INDEX idx_hoa_contacts_scraped ON hoa_contacts(scraped_at DESC);
        CREATE INDEX idx_hoa_contacts_confidence ON hoa_contacts(confidence_score DESC);
        CREATE INDEX idx_hoa_contacts_email ON hoa_contacts(email);

        PRINT 'Table hoa_contacts created successfully';
      END
      ELSE
      BEGIN
        PRINT 'Table hoa_contacts already exists';
      END
    `);

    console.log('✅ Table created successfully!\n');

    // Check if table exists
    const result = await pool.request().query(`
      SELECT COUNT(*) as count FROM hoa_contacts
    `);

    console.log(`📊 Current row count: ${result.recordset[0].count}`);

    await pool.close();
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createTable();
