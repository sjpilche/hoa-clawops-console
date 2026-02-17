/**
 * seed-hoa-contact-finder.js
 * Creates the hoa-contact-finder agent in the DB.
 * Run once: node scripts/seed-hoa-contact-finder.js
 */

require('dotenv').config({ path: '.env.local' });
const { initDatabase, get, run } = require('../server/db/connection');
const fs = require('fs');
const path = require('path');

async function seed() {
  await initDatabase();

  // ── 1. Run migration to create tables ──────────────────────────────────────
  console.log('📦 Running database migration...');
  const migrationPath = path.join(__dirname, '../server/db/migrations/013_hoa_contacts.sql');

  if (fs.existsSync(migrationPath)) {
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    // Split by semicolons and run each statement
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      try {
        run(statement);
      } catch (err) {
        // Ignore "table already exists" errors
        if (!err.message.includes('already exists')) {
          console.warn('Migration warning:', err.message);
        }
      }
    }
    console.log('✅ Migration complete');
  } else {
    console.warn('⚠️  Migration file not found:', migrationPath);
  }

  // ── 2. Upsert agent ─────────────────────────────────────────────────────────
  const agentId = 'hoa-contact-finder';
  const existing = get('SELECT id FROM agents WHERE id = ?', [agentId]);

  const config = {
    special_handler: 'hoa_contact_scraper',
    soul_path: 'openclaw-skills/hoa-contact-finder/SOUL.md',
    data_sources: ['ca_sos', 'cacm', 'mock'],
    supported_states: ['CA'],
  };

  if (!existing) {
    run(
      `INSERT INTO agents (id, name, description, status, config, instructions)
       VALUES (?, ?, ?, 'active', ?, ?)`,
      [
        agentId,
        'HOA Contact Finder',
        'Scrapes public sources to find HOA board member contact information for lead generation. Phase 1: California only.',
        JSON.stringify(config),
        `You are the HOA Contact Finder agent. Your job is to find HOA board member contact information from public sources.

SUPPORTED OPERATIONS:
1. Search for HOAs in a specific city
2. Return HOA name, contact person, email, phone, address, unit count, management company

CURRENT COVERAGE:
- California (CA) only
- Data sources: CA Secretary of State, CACM directory, property management websites

USAGE:
Send a message with search parameters as JSON:
{"city": "San Diego", "state": "CA", "zip_code": "92101"}

The system will scrape public records and return qualified leads.`,
      ]
    );
    console.log('✅ Agent created: hoa-contact-finder');
  } else {
    // Update config if agent exists
    run(
      `UPDATE agents SET config = ?, updated_at = datetime('now') WHERE id = ?`,
      [JSON.stringify(config), agentId]
    );
    console.log('ℹ️  Agent already exists (config updated): hoa-contact-finder');
  }

  // ── 3. Create SOUL.md directory if it doesn't exist ─────────────────────────
  const soulDir = path.join(__dirname, '../openclaw-skills/hoa-contact-finder');
  if (!fs.existsSync(soulDir)) {
    fs.mkdirSync(soulDir, { recursive: true });
    console.log('✅ Created directory:', soulDir);
  }

  // ── 4. Show stats ───────────────────────────────────────────────────────────
  const contactCount = get('SELECT COUNT(*) as count FROM hoa_contacts');
  const searchCount = get('SELECT COUNT(*) as count FROM hoa_search_history');

  console.log('\n📊 Database stats:');
  console.log(`   HOA contacts: ${contactCount.count}`);
  console.log(`   Search history: ${searchCount.count}`);

  console.log('\n🎉 Done! HOA Contact Finder is ready.');
  console.log('\n📝 Next steps:');
  console.log('   1. Restart the server: npm run dev');
  console.log('   2. Navigate to /hoa-leads in the UI');
  console.log('   3. Click "New Search" and enter a city (e.g., San Diego)');
  console.log('   4. The system will generate mock data for testing');
  console.log('   5. To enable real scrapers, set use_mock: false in the search params');

  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
