/**
 * @file hoaLeads.js
 * @description API routes for viewing HOA Lead Agent results from Azure SQL
 */

const express = require('express');
const router = express.Router();
const sql = require('mssql');

// Azure SQL configuration
const azureConfig = {
  server: process.env.AZURE_SQL_SERVER || 'empirecapital.database.windows.net',
  database: process.env.AZURE_SQL_DATABASE || 'empcapmaster2',
  user: process.env.AZURE_SQL_USER || 'CloudSA1f77fc9b',
  password: process.env.AZURE_SQL_PASSWORD,
  options: {
    encrypt: true,
    trustServerCertificate: false,
    enableArithAbort: true,
    connectTimeout: 30000,
    requestTimeout: 30000,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let pool = null;

/**
 * Get or create Azure SQL connection pool
 */
async function getPool() {
  if (!pool) {
    pool = await sql.connect(azureConfig);
  }
  return pool;
}

/**
 * GET /api/hoa-leads - Get all HOA leads with filtering/pagination
 */
router.get('/', async (req, res) => {
  try {
    const {
      state,
      has_email,
      min_score,
      limit = 100,
      offset = 0,
      source_type = 'hoa_lead_agent'
    } = req.query;

    const pool = await getPool();
    const request = pool.request();

    // Build WHERE clause
    let whereConditions = ['source_type = @source_type'];
    request.input('source_type', sql.NVarChar, source_type);

    if (state) {
      whereConditions.push('state = @state');
      request.input('state', sql.NVarChar, state);
    }

    if (has_email === 'true') {
      whereConditions.push('email IS NOT NULL');
    }

    if (min_score) {
      whereConditions.push('confidence_score >= @min_score');
      request.input('min_score', sql.Int, parseInt(min_score));
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM hoa_contacts
      ${whereClause}
    `;
    const countResult = await request.query(countQuery);
    const total = countResult.recordset[0].total;

    // Get paginated results
    request.input('limit', sql.Int, parseInt(limit));
    request.input('offset', sql.Int, parseInt(offset));

    const dataQuery = `
      SELECT
        id,
        hoa_name,
        contact_person,
        title,
        email,
        phone,
        city,
        state,
        zip,
        source_url,
        source_type,
        confidence_score,
        status,
        notes,
        scraped_at,
        updated_at
      FROM hoa_contacts
      ${whereClause}
      ORDER BY confidence_score DESC, scraped_at DESC
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY
    `;

    const dataResult = await request.query(dataQuery);

    res.json({
      success: true,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset),
      leads: dataResult.recordset,
    });
  } catch (error) {
    console.error('Error fetching HOA leads:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/hoa-leads/stats - Get statistics about HOA leads
 */
router.get('/stats', async (req, res) => {
  try {
    const pool = await getPool();

    // Overall stats
    const overallStats = await pool.request().query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN email IS NOT NULL THEN 1 ELSE 0 END) as with_email,
        SUM(CASE WHEN confidence_score >= 80 THEN 1 ELSE 0 END) as high_value,
        AVG(confidence_score) as avg_score
      FROM hoa_contacts
      WHERE source_type = 'hoa_lead_agent'
    `);

    // By state
    const byState = await pool.request().query(`
      SELECT state, COUNT(*) as count
      FROM hoa_contacts
      WHERE source_type = 'hoa_lead_agent' AND state IS NOT NULL
      GROUP BY state
      ORDER BY count DESC
    `);

    // By status
    const byStatus = await pool.request().query(`
      SELECT status, COUNT(*) as count
      FROM hoa_contacts
      WHERE source_type = 'hoa_lead_agent'
      GROUP BY status
      ORDER BY count DESC
    `);

    // Recent activity (last 7 days)
    const recentActivity = await pool.request().query(`
      SELECT
        CAST(scraped_at AS DATE) as date,
        COUNT(*) as count
      FROM hoa_contacts
      WHERE source_type = 'hoa_lead_agent'
        AND scraped_at >= DATEADD(day, -7, GETDATE())
      GROUP BY CAST(scraped_at AS DATE)
      ORDER BY date DESC
    `);

    res.json({
      success: true,
      stats: {
        overall: overallStats.recordset[0],
        byState: byState.recordset,
        byStatus: byStatus.recordset,
        recentActivity: recentActivity.recordset,
      },
    });
  } catch (error) {
    console.error('Error fetching HOA lead stats:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/hoa-leads/:id - Get single lead by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    const result = await pool
      .request()
      .input('id', sql.Int, parseInt(id))
      .query(`
        SELECT *
        FROM hoa_contacts
        WHERE id = @id AND source_type = 'hoa_lead_agent'
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Lead not found',
      });
    }

    res.json({
      success: true,
      lead: result.recordset[0],
    });
  } catch (error) {
    console.error('Error fetching HOA lead:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * PATCH /api/hoa-leads/:id - Update lead status or notes
 */
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const pool = await getPool();
    const request = pool.request();
    request.input('id', sql.Int, parseInt(id));

    const updates = [];
    if (status) {
      updates.push('status = @status');
      request.input('status', sql.NVarChar, status);
    }
    if (notes !== undefined) {
      updates.push('notes = @notes');
      request.input('notes', sql.NVarChar, notes);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No updates provided',
      });
    }

    updates.push('updated_at = GETDATE()');

    const updateQuery = `
      UPDATE hoa_contacts
      SET ${updates.join(', ')}
      WHERE id = @id AND source_type = 'hoa_lead_agent'
    `;

    await request.query(updateQuery);

    res.json({
      success: true,
      message: 'Lead updated successfully',
    });
  } catch (error) {
    console.error('Error updating HOA lead:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/hoa-leads/export/csv - Export leads as CSV
 */
router.get('/export/csv', async (req, res) => {
  try {
    const { state, has_email, min_score } = req.query;

    const pool = await getPool();
    const request = pool.request();

    // Build WHERE clause (same as main GET route)
    let whereConditions = ['source_type = @source_type'];
    request.input('source_type', sql.NVarChar, 'hoa_lead_agent');

    if (state) {
      whereConditions.push('state = @state');
      request.input('state', sql.NVarChar, state);
    }
    if (has_email === 'true') {
      whereConditions.push('email IS NOT NULL');
    }
    if (min_score) {
      whereConditions.push('confidence_score >= @min_score');
      request.input('min_score', sql.Int, parseInt(min_score));
    }

    const whereClause = whereConditions.join(' AND ');

    const result = await request.query(`
      SELECT
        hoa_name,
        contact_person,
        title,
        email,
        phone,
        city,
        state,
        zip,
        source_url,
        confidence_score,
        status,
        scraped_at
      FROM hoa_contacts
      WHERE ${whereClause}
      ORDER BY confidence_score DESC, scraped_at DESC
    `);

    // Generate CSV
    const headers = [
      'Company Name',
      'Contact Person',
      'Title',
      'Email',
      'Phone',
      'City',
      'State',
      'ZIP',
      'Website',
      'Score',
      'Status',
      'Date Collected'
    ];

    const csvRows = [headers.join(',')];

    result.recordset.forEach(row => {
      const values = [
        `"${(row.hoa_name || '').replace(/"/g, '""')}"`,
        `"${(row.contact_person || '').replace(/"/g, '""')}"`,
        `"${(row.title || '').replace(/"/g, '""')}"`,
        row.email || '',
        row.phone || '',
        row.city || '',
        row.state || '',
        row.zip || '',
        row.source_url || '',
        row.confidence_score || '',
        row.status || '',
        row.scraped_at ? new Date(row.scraped_at).toISOString().split('T')[0] : ''
      ];
      csvRows.push(values.join(','));
    });

    const csv = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=hoa-leads-${Date.now()}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting HOA leads:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
