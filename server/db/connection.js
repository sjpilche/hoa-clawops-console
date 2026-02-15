/**
 * @file connection.js
 * @description SQLite database connection and helper functions.
 *
 * WHY sql.js?
 * We wanted better-sqlite3 (faster, native), but it requires native compilation
 * which can fail on some setups. sql.js is a pure JavaScript SQLite compiled
 * from C to WebAssembly — it works everywhere with zero native dependencies.
 *
 * TRADE-OFF: sql.js is slower than better-sqlite3 for large datasets,
 * but for a local tool with one user, it's more than fast enough.
 *
 * HOW IT WORKS:
 * - On startup, we load the database file from disk (or create a new one)
 * - All writes are persisted to disk immediately via saveDatabase()
 * - The schema is applied automatically on first run
 *
 * @usage
 *   const { getDb, run, get, all } = require('./connection');
 *   const rows = all('SELECT * FROM agents WHERE status = ?', ['running']);
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

// The database instance — initialized once, reused everywhere
let db = null;

// Where to store the database file
const DB_PATH = path.resolve(process.env.DB_PATH || './data/clawops.db');

/**
 * Initialize the database connection.
 * Call this ONCE at server startup (in index.js).
 *
 * What it does:
 * 1. Creates the data/ directory if it doesn't exist
 * 2. Loads existing database from disk, or creates a new one
 * 3. Applies the schema (CREATE TABLE IF NOT EXISTS = safe to re-run)
 * 4. Enables WAL mode for better concurrent read performance
 */
async function initDatabase() {
  // Step 1: Ensure data directory exists
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log(`[Database] Created data directory: ${dataDir}`);
  }

  // Step 2: Initialize sql.js engine
  const SQL = await initSqlJs();

  // Step 3: Load existing database or create new
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log(`[Database] Loaded existing database from ${DB_PATH}`);
  } else {
    db = new SQL.Database();
    console.log(`[Database] Created new database at ${DB_PATH}`);
  }

  // Step 4: Apply schema
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.run(schema);
  console.log('[Database] Schema applied successfully');

  // Step 4.5: Run SQL migrations
  const migrationsDir = path.join(__dirname, 'migrations');
  if (fs.existsSync(migrationsDir)) {
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      try {
        const migrationPath = path.join(migrationsDir, file);
        const migrationSql = fs.readFileSync(migrationPath, 'utf-8');
        db.run(migrationSql);
        console.log(`[Database] Applied migration: ${file}`);
      } catch (err) {
        console.log(`[Database] Migration ${file} already applied or skipped`);
      }
    }
  }

  // Step 5: Migrations — add columns that may not exist in older databases
  const migrations = [
    // v1.0 migrations
    { sql: 'ALTER TABLE agents ADD COLUMN instructions TEXT DEFAULT ""', desc: 'instructions column' },
    // v2.0 migrations — multi-domain platform
    { sql: 'ALTER TABLE agents ADD COLUMN domain_id TEXT REFERENCES domains(id)', desc: 'domain_id column' },
    { sql: "ALTER TABLE agents ADD COLUMN extension_ids TEXT DEFAULT '[]'", desc: 'extension_ids column' },
    { sql: 'ALTER TABLE agents ADD COLUMN layer INTEGER DEFAULT 0', desc: 'layer column' },
    { sql: "ALTER TABLE agents ADD COLUMN orchestration_role TEXT DEFAULT 'worker'", desc: 'orchestration_role column' },
  ];

  for (const migration of migrations) {
    try {
      db.run(migration.sql);
      console.log(`[Database] Migration: added ${migration.desc} to agents`);
    } catch {
      // Column already exists — this is fine
    }
  }

  // Step 6: Enable WAL mode (Write-Ahead Logging) for better performance
  db.run('PRAGMA journal_mode=WAL');
  db.run('PRAGMA foreign_keys=ON');

  // Step 7: Save to disk
  saveDatabase();

  console.log('[Database] Ready');
  return db;
}

/**
 * Save the in-memory database to disk.
 * sql.js works in-memory, so we need to explicitly write to disk.
 * This is called after every write operation to ensure persistence.
 */
function saveDatabase() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

/**
 * Get the raw database instance.
 * Use this only when you need direct access. Prefer the helper functions below.
 */
function getDb() {
  if (!db) {
    throw new Error(
      '[Database] Not initialized! Call initDatabase() first in server/index.js. ' +
      'This usually means the server startup sequence is wrong.'
    );
  }
  return db;
}

/**
 * Execute a SQL statement that modifies data (INSERT, UPDATE, DELETE).
 * Automatically saves to disk after execution.
 *
 * @param {string} sql - SQL statement with ? placeholders
 * @param {Array} params - Values to bind to the placeholders
 * @returns {Object} - { changes: number } — how many rows were affected
 *
 * @example
 *   run('INSERT INTO agents (id, name) VALUES (?, ?)', [uuid, 'My Agent']);
 */
function run(sql, params = []) {
  const database = getDb();
  database.run(sql, params);
  saveDatabase();
  return { changes: database.getRowsModified() };
}

/**
 * Query for a single row. Returns the first matching row or null.
 *
 * @param {string} sql - SQL query with ? placeholders
 * @param {Array} params - Values to bind
 * @returns {Object|null} - Row as key-value object, or null if not found
 *
 * @example
 *   const agent = get('SELECT * FROM agents WHERE id = ?', [agentId]);
 *   if (!agent) throw new Error('Agent not found');
 */
function get(sql, params = []) {
  const database = getDb();
  const stmt = database.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

/**
 * Query for multiple rows. Returns an array (empty if no matches).
 *
 * @param {string} sql - SQL query with ? placeholders
 * @param {Array} params - Values to bind
 * @returns {Array<Object>} - Array of row objects
 *
 * @example
 *   const running = all('SELECT * FROM agents WHERE status = ?', ['running']);
 *   console.log(`${running.length} agents currently running`);
 */
function all(sql, params = []) {
  const database = getDb();
  const stmt = database.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

module.exports = {
  initDatabase,
  getDb,
  run,
  get,
  all,
  saveDatabase,
};
