/**
 * @file contacts.js
 * @description API routes for contact management (Azure SQL empcapmaster2)
 * These endpoints allow agents to manage contacts
 */

const express = require('express');
const router = express.Router();
const contactManager = require('../services/contactManager');

/**
 * GET /api/contacts/test
 * Test Azure SQL connection
 */
router.get('/test', async (req, res) => {
  try {
    const isConnected = await contactManager.testConnection();
    res.json({
      success: isConnected,
      message: isConnected ? 'Connected to empcapmaster2' : 'Connection failed',
      database: 'empcapmaster2',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/contacts/stats
 * Get database statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await contactManager.getStats();
    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================================
// LEADS ENDPOINTS
// ============================================================================

/**
 * POST /api/contacts/leads
 * Add a new lead
 */
router.post('/leads', async (req, res) => {
  try {
    const leadData = req.body;

    // Validation
    if (!leadData.email && !leadData.phone) {
      return res.status(400).json({
        success: false,
        error: 'Either email or phone is required',
      });
    }

    const leadId = await contactManager.addLead(leadData);
    res.status(201).json({
      success: true,
      leadId,
      message: 'Lead created successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/contacts/leads
 * Get all leads with optional filters
 */
router.get('/leads', async (req, res) => {
  try {
    const filters = {
      email: req.query.email,
      status: req.query.status,
      source: req.query.source,
    };

    const leads = await contactManager.getLeads(filters);
    res.json({
      success: true,
      count: leads.length,
      leads,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * PUT /api/contacts/leads/:id
 * Update a lead
 */
router.put('/leads/:id', async (req, res) => {
  try {
    const updates = req.body;
    await contactManager.updateLead(req.params.id, updates);

    res.json({
      success: true,
      message: 'Lead updated successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/contacts/leads/bulk
 * Bulk import leads
 */
router.post('/leads/bulk', async (req, res) => {
  try {
    const { leads } = req.body;

    if (!Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid leads array',
      });
    }

    const stats = await contactManager.bulkImportLeads(leads);
    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================================
// HOA CONTACTS ENDPOINTS
// ============================================================================

/**
 * POST /api/contacts/hoa
 * Add a new HOA contact
 */
router.post('/hoa', async (req, res) => {
  try {
    const contactData = req.body;

    const contactId = await contactManager.addHOAContact(contactData);
    res.status(201).json({
      success: true,
      contactId,
      message: 'HOA contact created successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/contacts/hoa
 * Get all HOA contacts
 */
router.get('/hoa', async (req, res) => {
  try {
    const filters = {
      email: req.query.email,
      role: req.query.role,
      hasEmail: req.query.hasEmail === 'true',
    };

    const contacts = await contactManager.getHOAContacts(filters);
    res.json({
      success: true,
      count: contacts.length,
      contacts,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================================
// EMAIL ENDPOINTS
// ============================================================================

/**
 * GET /api/contacts/emails
 * Get all email addresses from all contact sources
 */
router.get('/emails', async (req, res) => {
  try {
    const emails = await contactManager.getAllEmails();
    res.json({
      success: true,
      count: emails.length,
      emails,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================================
// MARKETING QUEUE ENDPOINTS
// ============================================================================

/**
 * POST /api/contacts/marketing-queue
 * Add contact to marketing outreach queue
 */
router.post('/marketing-queue', async (req, res) => {
  try {
    const outreachData = req.body;

    if (!outreachData.contact_email) {
      return res.status(400).json({
        success: false,
        error: 'contact_email is required',
      });
    }

    const queueId = await contactManager.addToMarketingQueue(outreachData);
    res.status(201).json({
      success: true,
      queueId,
      message: 'Added to marketing queue successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================================
// SEARCH & EXPORT ENDPOINTS
// ============================================================================

/**
 * GET /api/contacts/search
 * Search contacts across all tables
 */
router.get('/search', async (req, res) => {
  try {
    const searchTerm = req.query.q;

    if (!searchTerm) {
      return res.status(400).json({
        success: false,
        error: 'Search term (q) is required',
      });
    }

    const results = await contactManager.searchContacts(searchTerm);
    res.json({
      success: true,
      count: results.length,
      results,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/contacts/export
 * Export all contacts
 */
router.get('/export', async (req, res) => {
  try {
    const contacts = await contactManager.exportAllContacts();

    // Return as JSON or CSV based on format parameter
    const format = req.query.format || 'json';

    if (format === 'csv') {
      // Convert to CSV
      if (contacts.length === 0) {
        return res.send('');
      }

      const headers = Object.keys(contacts[0]);
      const csvRows = [];

      // Add header row
      csvRows.push(headers.join(','));

      // Add data rows
      for (const contact of contacts) {
        const values = headers.map(header => {
          const value = contact[header];
          if (value === null || value === undefined) return '';
          const escaped = String(value).replace(/"/g, '""');
          return escaped.includes(',') ? `"${escaped}"` : escaped;
        });
        csvRows.push(values.join(','));
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=contacts-export.csv');
      res.send(csvRows.join('\n'));
    } else {
      // Return as JSON
      res.json({
        success: true,
        count: contacts.length,
        contacts,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
