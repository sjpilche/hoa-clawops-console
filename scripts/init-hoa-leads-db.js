/**
 * @file init-hoa-leads-db.js
 * @description Initialize the hoa_leads.sqlite database for the Minutes Lead Engine
 *
 * This creates a SEPARATE database from clawops.db to keep the systems independent.
 * Run this once before starting the Minutes Lead Engine agents.
 *
 * Usage: node scripts/init-hoa-leads-db.js
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

// Where to create the new database
const DB_PATH = path.resolve('./hoa_leads.sqlite');
const SCHEMA_PATH = path.resolve('c:/Users/SPilcher/Downloads/files (6)/schema.sql');

async function initHoaLeadsDatabase() {
  console.log('\n🦁 HOA MINUTES LEAD ENGINE - DATABASE INITIALIZATION\n');
  console.log('='.repeat(60));

  try {
    // Step 1: Check if database already exists
    if (fs.existsSync(DB_PATH)) {
      console.log(`⚠️  Database already exists at: ${DB_PATH}`);
      console.log('Delete it first if you want to start fresh:');
      console.log(`   del "${DB_PATH}"`);
      console.log('');
      process.exit(1);
    }

    // Step 2: Initialize sql.js engine
    console.log('📦 Loading sql.js engine...');
    const SQL = await initSqlJs();
    console.log('✅ sql.js loaded');

    // Step 3: Create new database
    console.log('🗄️  Creating new database...');
    const db = new SQL.Database();
    console.log(`✅ Database created in memory`);

    // Step 4: Read schema file
    console.log('📄 Reading schema from:', SCHEMA_PATH);
    if (!fs.existsSync(SCHEMA_PATH)) {
      console.error('❌ Schema file not found!');
      console.error('Expected:', SCHEMA_PATH);
      process.exit(1);
    }

    const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
    console.log(`✅ Schema loaded (${schema.length} characters)`);

    // Step 5: Apply schema
    console.log('⚙️  Applying schema...');
    db.run(schema);
    console.log('✅ Schema applied successfully');

    // Step 6: Verify tables created
    const tables = [];
    const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    while (stmt.step()) {
      const row = stmt.getAsObject();
      tables.push(row.name);
    }
    stmt.free();

    console.log('');
    console.log('📊 Tables created:');
    tables.forEach(table => console.log(`   ✅ ${table}`));

    // Step 7: Verify views created
    const views = [];
    const viewStmt = db.prepare("SELECT name FROM sqlite_master WHERE type='view' ORDER BY name");
    while (viewStmt.step()) {
      const row = viewStmt.getAsObject();
      views.push(row.name);
    }
    viewStmt.free();

    console.log('');
    console.log('👁️  Views created:');
    views.forEach(view => console.log(`   ✅ ${view}`));

    // Step 8: Save to disk
    console.log('');
    console.log('💾 Saving database to disk...');
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
    console.log(`✅ Database saved to: ${DB_PATH}`);

    // Step 9: Verify file size
    const stats = fs.statSync(DB_PATH);
    console.log(`📏 File size: ${(stats.size / 1024).toFixed(2)} KB`);

    console.log('');
    console.log('='.repeat(60));
    console.log('✅ DATABASE INITIALIZATION COMPLETE!');
    console.log('='.repeat(60));
    console.log('');
    console.log('Next steps:');
    console.log('1. ✅ Database ready at: hoa_leads.sqlite');
    console.log('2. ⏭️  Create Agent 1 (HOA Discovery)');
    console.log('3. ⏭️  Run first discovery: node scripts/run-hoa-discovery.js');
    console.log('');

    db.close();
    process.exit(0);

  } catch (error) {
    console.error('');
    console.error('❌ DATABASE INITIALIZATION FAILED');
    console.error('='.repeat(60));
    console.error('Error:', error.message);
    console.error('');
    if (error.stack) {
      console.error('Stack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run initialization
initHoaLeadsDatabase();
