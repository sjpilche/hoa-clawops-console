/**
 * @file livempaint.js (routes)
 * @description Livempaint contacts — read from Azure SQL, sortable/filterable,
 *              with PATCH to reassign client_type.
 *
 * ENDPOINTS:
 *   GET  /api/livempaint         — List contacts with filter/sort/pagination
 *   GET  /api/livempaint/stats   — Summary counts by segment + outreach status
 *   PATCH /api/livempaint/:id    — Update client_type for a contact
 */

'use strict';

const { Router }    = require('express');
const sql           = require('mssql');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

// ── Azure SQL connection (shared pool, lazy init) ─────────────────────────────
let _pool = null;
let _poolFailed = false;

async function getPool() {
  if (_pool) return _pool;
  if (_poolFailed) throw new Error('Azure SQL unavailable — check AZURE_SQL_* env vars');

  try {
    _pool = await sql.connect({
      server:   process.env.AZURE_SQL_SERVER,
      database: process.env.AZURE_SQL_DATABASE,
      user:     process.env.AZURE_SQL_USER,
      password: process.env.AZURE_SQL_PASSWORD,
      options:  { encrypt: true, trustServerCertificate: false, connectTimeout: 15000 },
      pool:     { max: 5, min: 0, idleTimeoutMillis: 30000 },
    });
    console.log('[Livempaint] Connected to Azure SQL');
    return _pool;
  } catch (err) {
    _poolFailed = true;
    throw err;
  }
}

// Valid client_type values for reassignment
const VALID_TYPES = [
  'Property Manager',
  'General Contractor',
  'Subcontractor',
  'HOA Board',
  'Owner',
  'Law Firm',
  'Unknown',
];

// Valid sort columns (whitelist to prevent SQL injection)
const SORT_COLS = {
  score:   'pilot_fit_score',
  name:    'full_name',
  company: 'company_name',
  state:   'state',
  email:   'email',
  status:  'outreach_status',
};

/**
 * GET /api/livempaint
 * Query params:
 *   client_type    — filter by segment (exact match)
 *   outreach_status — filter by status (new | contacted | replied | unsubscribed)
 *   state          — filter by 2-letter state code
 *   search         — searches full_name, company_name, email (LIKE)
 *   sort           — sort column key (score | name | company | state | email | status)
 *   dir            — asc | desc (default desc for score, asc for others)
 *   limit          — page size (default 50, max 200)
 *   offset         — pagination offset (default 0)
 */
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();

    const {
      client_type,
      outreach_status,
      state,
      search,
      sort    = 'score',
      dir,
      limit   = 50,
      offset  = 0,
    } = req.query;

    const pageSize  = Math.min(parseInt(limit)  || 50, 200);
    const pageStart = Math.max(parseInt(offset) || 0, 0);
    const sortCol   = SORT_COLS[sort] || 'pilot_fit_score';
    const sortDir   = (dir === 'asc' ? 'ASC' : 'DESC');

    // Build WHERE clause
    const conditions = [];
    const request = pool.request();

    if (client_type && client_type !== 'all') {
      conditions.push('client_type = @client_type');
      request.input('client_type', sql.NVarChar, client_type);
    }
    if (outreach_status && outreach_status !== 'all') {
      conditions.push('outreach_status = @outreach_status');
      request.input('outreach_status', sql.NVarChar, outreach_status);
    }
    if (state && state !== 'all') {
      conditions.push('state = @state');
      request.input('state', sql.NVarChar, state.toUpperCase());
    }
    if (search && search.trim()) {
      conditions.push("(full_name LIKE @search OR company_name LIKE @search OR email LIKE @search)");
      request.input('search', sql.NVarChar, `%${search.trim()}%`);
    }

    // Only contacts with a valid email
    conditions.push("email LIKE '%@%.%'");
    conditions.push("LEN(email) > 8");

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT
        id, first_name, last_name, full_name, title, department,
        email, company_name, office_label, client_type,
        website, city, state, zip,
        outreach_status, pilot_fit_score,
        source, created_at, updated_at
      FROM livempaint_leads
      ${where}
      ORDER BY ${sortCol} ${sortDir}
      OFFSET ${pageStart} ROWS FETCH NEXT ${pageSize} ROWS ONLY
    `;

    // Count query (reuse same request isn't possible — need new one)
    const countReq = pool.request();
    if (client_type && client_type !== 'all') countReq.input('client_type', sql.NVarChar, client_type);
    if (outreach_status && outreach_status !== 'all') countReq.input('outreach_status', sql.NVarChar, outreach_status);
    if (state && state !== 'all') countReq.input('state', sql.NVarChar, state.toUpperCase());
    if (search && search.trim()) countReq.input('search', sql.NVarChar, `%${search.trim()}%`);

    const countQuery = `SELECT COUNT(*) AS total FROM livempaint_leads ${where}`;

    const [dataResult, countResult] = await Promise.all([
      request.query(query),
      countReq.query(countQuery),
    ]);

    res.json({
      contacts: dataResult.recordset,
      total:    countResult.recordset[0]?.total || 0,
      limit:    pageSize,
      offset:   pageStart,
    });
  } catch (err) {
    console.error('[Livempaint] GET error:', err.message);
    res.status(503).json({ error: err.message });
  }
});

/**
 * GET /api/livempaint/stats
 * Returns counts by client_type and outreach_status for the summary cards.
 */
router.get('/stats', async (req, res) => {
  try {
    const pool = await getPool();

    const [byType, byStatus, byState] = await Promise.all([
      pool.request().query(`
        SELECT client_type, COUNT(*) AS cnt
        FROM livempaint_leads
        WHERE email LIKE '%@%.%' AND LEN(email) > 8
        GROUP BY client_type
        ORDER BY cnt DESC
      `),
      pool.request().query(`
        SELECT outreach_status, COUNT(*) AS cnt
        FROM livempaint_leads
        WHERE email LIKE '%@%.%' AND LEN(email) > 8
        GROUP BY outreach_status
        ORDER BY cnt DESC
      `),
      pool.request().query(`
        SELECT TOP 15 state, COUNT(*) AS cnt
        FROM livempaint_leads
        WHERE email LIKE '%@%.%' AND LEN(email) > 8 AND state IS NOT NULL
        GROUP BY state
        ORDER BY cnt DESC
      `),
    ]);

    // Total valid email count
    const totalRes = await pool.request().query(`
      SELECT COUNT(*) AS total FROM livempaint_leads
      WHERE email LIKE '%@%.%' AND LEN(email) > 8
    `);

    res.json({
      total:    totalRes.recordset[0]?.total || 0,
      byType:   byType.recordset,
      byStatus: byStatus.recordset,
      topStates: byState.recordset,
    });
  } catch (err) {
    console.error('[Livempaint] stats error:', err.message);
    res.status(503).json({ error: err.message });
  }
});

/**
 * PATCH /api/livempaint/:id
 * Body: { client_type: "Property Manager" }
 * Updates the client_type for a single contact.
 */
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { client_type } = req.body;

    if (!client_type || !VALID_TYPES.includes(client_type)) {
      return res.status(400).json({
        error: `Invalid client_type. Must be one of: ${VALID_TYPES.join(', ')}`,
      });
    }

    const pool = await getPool();
    const result = await pool.request()
      .input('client_type', sql.NVarChar, client_type)
      .input('id', sql.Int, parseInt(id))
      .query(`
        UPDATE livempaint_leads
        SET client_type = @client_type
        WHERE id = @id
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json({ success: true, id: parseInt(id), client_type });
  } catch (err) {
    console.error('[Livempaint] PATCH error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
