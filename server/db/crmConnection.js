/**
 * @file crmConnection.js
 * @description Azure SQL connection pool for CRM data (leads, outreach, cadence).
 *
 * Reuses the same Azure SQL credentials as collectiveBrain.js.
 * Provides the same API shape as connection.js (get, all, run) for easy migration.
 *
 * Falls back to SQLite if Azure is unreachable — services keep working.
 */

const sql = require('mssql');

let _pool = null;
let _azureDown = false;
let _lastRetry = 0;
const RETRY_INTERVAL_MS = 60000; // retry Azure every 60s after failure

async function getPool() {
  if (_pool) return _pool;

  // Don't hammer Azure if it's down — retry once per minute
  if (_azureDown && Date.now() - _lastRetry < RETRY_INTERVAL_MS) return null;

  try {
    _lastRetry = Date.now();
    _pool = await sql.connect({
      server: process.env.AZURE_SQL_SERVER,
      database: process.env.AZURE_SQL_DATABASE,
      user: process.env.AZURE_SQL_USER,
      password: process.env.AZURE_SQL_PASSWORD,
      options: { encrypt: true, trustServerCertificate: false, connectTimeout: 15000 },
      pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
    });
    _azureDown = false;
    console.log('[CRM] Connected to Azure SQL');
    return _pool;
  } catch (err) {
    _azureDown = true;
    _pool = null;
    console.warn('[CRM] Azure SQL unavailable, falling back to SQLite:', err.message);
    return null;
  }
}

/**
 * Execute a parameterized query against Azure SQL.
 * Parameters use @p0, @p1, @p2... naming convention.
 *
 * @param {string} query - SQL query with @p0, @p1 etc. placeholders
 * @param {Array} params - Values to bind
 * @returns {Array<Object>} - Array of row objects
 */
async function crmQuery(query, params = []) {
  const pool = await getPool();
  if (!pool) return null; // caller should fall back to SQLite

  const request = pool.request();
  params.forEach((val, i) => {
    request.input(`p${i}`, val);
  });
  const result = await request.query(query);
  return result.recordset;
}

/**
 * Get a single row.
 * @returns {Object|null}
 */
async function crmGet(query, params = []) {
  const rows = await crmQuery(query, params);
  if (rows === null) return null; // Azure down
  return rows[0] || null;
}

/**
 * Get all matching rows.
 * @returns {Array<Object>}
 */
async function crmAll(query, params = []) {
  const rows = await crmQuery(query, params);
  return rows || []; // return empty array if Azure down (safe default)
}

/**
 * Execute an INSERT/UPDATE/DELETE.
 * @returns {{ rowsAffected: number }|null}
 */
async function crmRun(query, params = []) {
  const pool = await getPool();
  if (!pool) return null;

  const request = pool.request();
  params.forEach((val, i) => {
    request.input(`p${i}`, val);
  });
  const result = await request.query(query);
  return { rowsAffected: result.rowsAffected?.[0] || 0 };
}

/**
 * Check if Azure CRM is available.
 */
function isAvailable() {
  if (process.env.DISABLE_AZURE === '1') return false;
  return !_azureDown && _pool !== null;
}

/**
 * Initialize the CRM connection (call at server startup).
 */
async function initCrm() {
  try {
    await getPool();
    return true;
  } catch {
    return false;
  }
}

module.exports = { crmQuery, crmGet, crmAll, crmRun, isAvailable, initCrm, getPool };
