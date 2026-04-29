/**
 * @file tests/testDb.js
 * @description Test database helper — creates fresh in-memory SQLite instances.
 *
 * Usage in tests:
 *   import { setupTestDb, teardownTestDb, testGet, testAll, testRun } from '../tests/testDb.js';
 *
 *   beforeEach(async () => { await setupTestDb(); });
 *   afterEach(() => { teardownTestDb(); });
 *
 *   it('should insert a lead', () => {
 *     testRun("INSERT INTO cfo_leads (id, company_name) VALUES (1, 'Test Co')");
 *     const lead = testGet('SELECT * FROM cfo_leads WHERE id = 1');
 *     expect(lead.company_name).toBe('Test Co');
 *   });
 */

import { vi } from 'vitest';
import fs from 'fs';
import path from 'path';

let SQL = null;
let db = null;

/**
 * Initialize a fresh in-memory SQLite database with full schema.
 */
export async function setupTestDb() {
  if (!SQL) {
    const initSqlJs = (await import('sql.js')).default;
    SQL = await initSqlJs();
  }

  // Create fresh in-memory database
  db = new SQL.Database();

  // Load base schema — sql.js handles multi-statement SQL natively;
  // the previous split-on-';' approach corrupted multi-line CREATE TABLEs.
  const schemaPath = path.resolve(__dirname, '../server/db/schema.sql');
  if (fs.existsSync(schemaPath)) {
    try { db.run(fs.readFileSync(schemaPath, 'utf-8')); }
    catch (e) { console.warn('[testDb] schema.sql warning:', e.message); }
  }

  // Apply each migration file in order, exactly as production does.
  const migrationsDir = path.resolve(__dirname, '../server/db/migrations');
  if (fs.existsSync(migrationsDir)) {
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    for (const file of files) {
      try { db.run(fs.readFileSync(path.join(migrationsDir, file), 'utf-8')); }
      catch { /* migration may be partially applied or contain ALTER TABLE that already ran */ }
    }
  }

  // Apply the in-process JS migrations (ALTER TABLE column adds) so the
  // schema matches what server/index.js produces at boot.
  const { applyJsMigrations } = require('../server/db/connection.js');
  applyJsMigrations(db);

  // Mock the connection module so all services use our test DB
  vi.doMock('../server/db/connection', () => ({
    get: (sql, params = []) => {
      const stmt = db.prepare(sql);
      if (params.length) stmt.bind(params);
      const result = stmt.step() ? stmt.getAsObject() : null;
      stmt.free();
      return result;
    },
    all: (sql, params = []) => {
      const stmt = db.prepare(sql);
      if (params.length) stmt.bind(params);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return rows;
    },
    run: (sql, params = []) => {
      db.run(sql, params);
    },
    initDatabase: async () => {},
    saveDatabase: () => {},
  }));

  return db;
}

/**
 * Tear down the test database.
 */
export function teardownTestDb() {
  if (db) {
    db.close();
    db = null;
  }
  vi.restoreAllMocks();
}

/**
 * Direct query helpers (bypass mock, use test DB directly).
 */
export function testGet(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const result = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return result;
}

export function testAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

export function testRun(sql, params = []) {
  db.run(sql, params);
}

/**
 * Seed test data helpers.
 */
export function seedTestLead(overrides = {}) {
  const defaults = {
    id: Math.floor(Math.random() * 99999999),
    company_name: 'Test Construction Co',
    contact_name: 'John Doe',
    contact_email: 'john@test.com',
    status: 'new',
    source: 'test',
    source_agent: 'jake',
    revenue_stage: 'discovered',
    engagement_score: 0,
  };
  const lead = { ...defaults, ...overrides };
  testRun(
    `INSERT INTO cfo_leads (id, company_name, contact_name, contact_email, status, source, source_agent, revenue_stage, engagement_score, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [lead.id, lead.company_name, lead.contact_name, lead.contact_email, lead.status, lead.source, lead.source_agent, lead.revenue_stage, lead.engagement_score]
  );
  return lead;
}

export function seedTestSequence(leadId, overrides = {}) {
  const defaults = {
    lead_id: leadId,
    sequence_type: 'blitz',
    email_subject: 'Test Subject',
    email_body: 'Test body',
    source_agent: 'jake',
    status: 'sent',
    sequence_position: 1,
  };
  const seq = { ...defaults, ...overrides };
  testRun(
    `INSERT INTO cfo_outreach_sequences (lead_id, sequence_type, email_subject, email_body, source_agent, status, sequence_position, sent_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [seq.lead_id, seq.sequence_type, seq.email_subject, seq.email_body, seq.source_agent, seq.status, seq.sequence_position]
  );
  const inserted = testGet('SELECT id FROM cfo_outreach_sequences WHERE lead_id = ? ORDER BY id DESC LIMIT 1', [leadId]);
  return { ...seq, id: inserted?.id };
}

export function seedTestAgent(overrides = {}) {
  const defaults = {
    id: require('crypto').randomUUID(),
    name: 'test-agent',
    description: 'Test agent',
    status: 'idle',
  };
  const agent = { ...defaults, ...overrides };
  testRun(
    `INSERT OR IGNORE INTO agents (id, name, description, status) VALUES (?, ?, ?, ?)`,
    [agent.id, agent.name, agent.description, agent.status]
  );
  return agent;
}
