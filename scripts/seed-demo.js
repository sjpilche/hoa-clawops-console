/**
 * @file seed-demo.js
 * @description Populate the database with a default admin user and demo agents.
 *
 * RUN: node scripts/seed-demo.js
 *
 * This script:
 * 1. Creates the default admin user (from .env.local settings)
 * 2. Creates a few demo agents so the UI isn't empty
 * 3. Is safe to run multiple times (uses INSERT OR IGNORE)
 */

require('dotenv').config({ path: '.env.local' });

const { initDatabase, run, get } = require('../server/db/connection');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

async function seed() {
  console.log('\n🌱 Seeding database...\n');

  await initDatabase();

  // --- Create default admin user ---
  const email = process.env.DEFAULT_ADMIN_EMAIL || 'admin@clawops.local';
  const password = process.env.DEFAULT_ADMIN_PASSWORD || 'changeme123';

  const existingUser = get('SELECT id FROM users WHERE email = ?', [email]);
  if (!existingUser) {
    const hashedPassword = bcrypt.hashSync(password, 12);
    const userId = uuidv4();
    run(
      'INSERT INTO users (id, email, password, name, role) VALUES (?, ?, ?, ?, ?)',
      [userId, email, hashedPassword, 'Admin', 'admin']
    );
    console.log(`✅ Created admin user: ${email}`);
  } else {
    console.log(`ℹ️  Admin user already exists: ${email}`);
  }

  // --- Create demo agents ---
  const demoAgents = [
    {
      name: 'AP Invoice Extractor',
      description: 'Extracts accounts payable invoices from Sage 300',
      target_system: 'Sage 300',
      permissions: 'read-only',
      domains: ['sage300.example.com'],
    },
    {
      name: 'Job Cost Reporter',
      description: 'Pulls job cost data from Procore for variance analysis',
      target_system: 'Procore',
      permissions: 'read-only',
      domains: ['app.procore.com'],
    },
    {
      name: 'Change Order Monitor',
      description: 'Monitors change orders and flags discrepancies',
      target_system: 'Sage 300',
      permissions: 'read-only',
      domains: ['sage300.example.com'],
    },
  ];

  for (const agent of demoAgents) {
    const existing = get('SELECT id FROM agents WHERE name = ?', [agent.name]);
    if (!existing) {
      run(
        `INSERT INTO agents (id, name, description, target_system, permissions, domains)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          agent.name,
          agent.description,
          agent.target_system,
          agent.permissions,
          JSON.stringify(agent.domains),
        ]
      );
      console.log(`✅ Created agent: ${agent.name}`);
    } else {
      console.log(`ℹ️  Agent already exists: ${agent.name}`);
    }
  }

  console.log('\n✅ Seed complete!\n');
  console.log(`   Login with: ${email} / ${password}`);
  console.log('   Run: npm run dev\n');
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
