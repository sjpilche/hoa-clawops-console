/**
 * @file hoaContacts.js
 * @description API routes for HOA Contact Finder with campaign-level isolation
 *
 * ENDPOINTS:
 * - GET /api/hoa-contacts - List contacts with filtering
 * - GET /api/hoa-contacts/stats - Get statistics
 * - GET /api/hoa-contacts/:id - Get single contact
 * - PATCH /api/hoa-contacts/:id - Update contact (status, notes)
 * - DELETE /api/hoa-contacts/:id - Delete contact
 * - GET /api/hoa-contacts/export - Export to CSV
 * - GET /api/hoa-contacts/search-history - Get search history
 */

const express = require('express');
const { run, all, get } = require('../db/connection');
const { authenticate: authenticateToken } = require('../middleware/auth');
const { optionalCampaignContext } = require('../middleware/campaignContext');
const { optionalCampaignTableContext } = require('../middleware/campaignTableContext');

const router = express.Router();

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/hoa-contacts - List contacts with filtering
// ═══════════════════════════════════════════════════════════════════════════
router.get('/', authenticateToken, optionalCampaignContext, optionalCampaignTableContext, (req, res) => {
  try {
    const {
      status = 'new',          // Filter by status
      city,                    // Filter by city
      state = 'CA',           // Filter by state
      min_confidence = 0,     // Minimum confidence score
      limit = 50,             // Results per page
      offset = 0,             // Pagination offset
    } = req.query;

    // Use campaign-specific table if campaign context exists, otherwise use shared table
    const tableName = req.campaignTables?.hoa_contacts || 'hoa_contacts';

    let query = `
      SELECT *
      FROM ${tableName}
      WHERE 1=1
    `;
    const params = [];

    // Apply filters
    if (status && status !== 'all') {
      query += ` AND status = ?`;
      params.push(status);
    }

    if (city) {
      query += ` AND city LIKE ?`;
      params.push(`%${city}%`);
    }

    if (state) {
      query += ` AND state = ?`;
      params.push(state);
    }

    if (min_confidence) {
      query += ` AND confidence_score >= ?`;
      params.push(parseInt(min_confidence));
    }

    // Order and paginate
    query += ` ORDER BY scraped_at DESC, confidence_score DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    const contacts = all(query, params);

    // Get total count for pagination
    let countQuery = `SELECT COUNT(*) as total FROM ${tableName} WHERE 1=1`;
    const countParams = [];

    if (status && status !== 'all') {
      countQuery += ` AND status = ?`;
      countParams.push(status);
    }
    if (city) {
      countQuery += ` AND city LIKE ?`;
      countParams.push(`%${city}%`);
    }
    if (state) {
      countQuery += ` AND state = ?`;
      countParams.push(state);
    }
    if (min_confidence) {
      countQuery += ` AND confidence_score >= ?`;
      countParams.push(parseInt(min_confidence));
    }

    const { total } = get(countQuery, countParams);

    res.json({
      success: true,
      contacts,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + contacts.length < total,
      },
    });
  } catch (error) {
    console.error('[HOA Contacts] List error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch contacts',
      details: error.message,
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/hoa-contacts/stats - Get statistics
// ═══════════════════════════════════════════════════════════════════════════
router.get('/stats', authenticateToken, optionalCampaignContext, optionalCampaignTableContext, (req, res) => {
  try {
    const tableName = req.campaignTables?.hoa_contacts || 'hoa_contacts';

    const stats = {
      total: get(`SELECT COUNT(*) as count FROM ${tableName}`).count,
      by_status: all(`
        SELECT status, COUNT(*) as count
        FROM ${tableName}
        GROUP BY status
      `),
      by_state: all(`
        SELECT state, COUNT(*) as count
        FROM ${tableName}
        GROUP BY state
        ORDER BY count DESC
      `),
      by_city: all(`
        SELECT city, state, COUNT(*) as count
        FROM ${tableName}
        GROUP BY city, state
        ORDER BY count DESC
        LIMIT 10
      `),
      avg_confidence: get(`SELECT AVG(confidence_score) as avg FROM ${tableName}`).avg,
      with_email: get(`SELECT COUNT(*) as count FROM ${tableName} WHERE email IS NOT NULL`).count,
      with_phone: get(`SELECT COUNT(*) as count FROM ${tableName} WHERE phone IS NOT NULL`).count,
      recent_searches: all(`
        SELECT *
        FROM hoa_search_history
        ORDER BY started_at DESC
        LIMIT 5
      `),
    };

    res.json({ success: true, stats });
  } catch (error) {
    console.error('[HOA Contacts] Stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics',
      details: error.message,
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/hoa-contacts/:id - Get single contact
// ═══════════════════════════════════════════════════════════════════════════
router.get('/:id', authenticateToken, optionalCampaignContext, optionalCampaignTableContext, (req, res) => {
  try {
    const { id } = req.params;
    const tableName = req.campaignTables?.hoa_contacts || 'hoa_contacts';

    const contact = get(`SELECT * FROM ${tableName} WHERE id = ?`, [id]);

    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found',
      });
    }

    res.json({ success: true, contact });
  } catch (error) {
    console.error('[HOA Contacts] Get contact error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch contact',
      details: error.message,
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PATCH /api/hoa-contacts/:id - Update contact
// ═══════════════════════════════════════════════════════════════════════════
router.patch('/:id', authenticateToken, optionalCampaignContext, optionalCampaignTableContext, (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes, contact_person, email, phone, title } = req.body;
    const tableName = req.campaignTables?.hoa_contacts || 'hoa_contacts';

    // Check contact exists
    const contact = get(`SELECT * FROM ${tableName} WHERE id = ?`, [id]);
    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found',
      });
    }

    // Build update query dynamically
    const updates = [];
    const params = [];

    if (status) {
      updates.push('status = ?');
      params.push(status);
    }
    if (notes !== undefined) {
      updates.push('notes = ?');
      params.push(notes);
    }
    if (contact_person) {
      updates.push('contact_person = ?');
      params.push(contact_person);
    }
    if (email) {
      updates.push('email = ?');
      params.push(email);
    }
    if (phone) {
      updates.push('phone = ?');
      params.push(phone);
    }
    if (title) {
      updates.push('title = ?');
      params.push(title);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update',
      });
    }

    // Update last_contacted_at if status changed to 'contacted'
    if (status === 'contacted') {
      updates.push('last_contacted_at = datetime("now")');
    }

    updates.push('updated_at = datetime("now")');
    params.push(id);

    run(
      `UPDATE ${tableName} SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    // Fetch updated contact
    const updated = get(`SELECT * FROM ${tableName} WHERE id = ?`, [id]);

    res.json({
      success: true,
      contact: updated,
    });
  } catch (error) {
    console.error('[HOA Contacts] Update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update contact',
      details: error.message,
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE /api/hoa-contacts/:id - Delete contact
// ═══════════════════════════════════════════════════════════════════════════
router.delete('/:id', authenticateToken, optionalCampaignContext, optionalCampaignTableContext, (req, res) => {
  try {
    const { id } = req.params;
    const tableName = req.campaignTables?.hoa_contacts || 'hoa_contacts';

    const contact = get(`SELECT * FROM ${tableName} WHERE id = ?`, [id]);
    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found',
      });
    }

    run(`DELETE FROM ${tableName} WHERE id = ?`, [id]);

    res.json({
      success: true,
      message: 'Contact deleted',
    });
  } catch (error) {
    console.error('[HOA Contacts] Delete error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete contact',
      details: error.message,
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/hoa-contacts/export/csv - Export to CSV
// ═══════════════════════════════════════════════════════════════════════════
router.get('/export/csv', authenticateToken, optionalCampaignContext, optionalCampaignTableContext, (req, res) => {
  try {
    const { status, city, state, min_confidence } = req.query;
    const tableName = req.campaignTables?.hoa_contacts || 'hoa_contacts';

    let query = `SELECT * FROM ${tableName} WHERE 1=1`;
    const params = [];

    if (status && status !== 'all') {
      query += ` AND status = ?`;
      params.push(status);
    }
    if (city) {
      query += ` AND city LIKE ?`;
      params.push(`%${city}%`);
    }
    if (state) {
      query += ` AND state = ?`;
      params.push(state);
    }
    if (min_confidence) {
      query += ` AND confidence_score >= ?`;
      params.push(parseInt(min_confidence));
    }

    query += ` ORDER BY scraped_at DESC`;

    const contacts = all(query, params);

    // Build CSV
    const headers = [
      'ID',
      'HOA Name',
      'Contact Person',
      'Title',
      'Email',
      'Phone',
      'Address',
      'City',
      'State',
      'Zip',
      'Unit Count',
      'Management Company',
      'Status',
      'Confidence Score',
      'Source Type',
      'Source URL',
      'Scraped At',
      'Notes',
    ];

    const csvRows = [headers.join(',')];

    for (const contact of contacts) {
      const row = [
        contact.id,
        `"${(contact.hoa_name || '').replace(/"/g, '""')}"`,
        `"${(contact.contact_person || '').replace(/"/g, '""')}"`,
        `"${(contact.title || '').replace(/"/g, '""')}"`,
        contact.email || '',
        contact.phone || '',
        `"${(contact.property_address || '').replace(/"/g, '""')}"`,
        `"${(contact.city || '').replace(/"/g, '""')}"`,
        contact.state || '',
        contact.zip || '',
        contact.unit_count || '',
        `"${(contact.management_company || '').replace(/"/g, '""')}"`,
        contact.status || '',
        contact.confidence_score || '',
        contact.source_type || '',
        `"${(contact.source_url || '').replace(/"/g, '""')}"`,
        contact.scraped_at || '',
        `"${(contact.notes || '').replace(/"/g, '""')}"`,
      ];
      csvRows.push(row.join(','));
    }

    const csv = csvRows.join('\n');
    const filename = `hoa-contacts-${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    console.error('[HOA Contacts] Export error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export contacts',
      details: error.message,
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/hoa-contacts/search-history - Get search history
// ═══════════════════════════════════════════════════════════════════════════
router.get('/search-history/list', authenticateToken, (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;

    const searches = all(
      `SELECT * FROM hoa_search_history
       ORDER BY started_at DESC
       LIMIT ? OFFSET ?`,
      [parseInt(limit), parseInt(offset)]
    );

    const total = get(`SELECT COUNT(*) as count FROM hoa_search_history`).count;

    res.json({
      success: true,
      searches,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
      },
    });
  } catch (error) {
    console.error('[HOA Contacts] Search history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch search history',
      details: error.message,
    });
  }
});

module.exports = router;
