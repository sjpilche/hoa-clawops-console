/**
 * @file leads.js
 * @description API routes for managing leads from EMPCAMPMaster2 database
 */

const express = require('express');
const router = express.Router();
const leadDataManager = require('../services/leadDataManager');

/**
 * GET /api/leads/test
 * Test Azure SQL connection
 */
router.get('/test', async (req, res) => {
  try {
    const isConnected = await leadDataManager.testConnection();
    res.json({
      success: isConnected,
      message: isConnected ? 'Connected to EMPCAMPMaster2' : 'Connection failed',
      database: 'EMPCAMPMaster2',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/leads/stats
 * Get database statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await leadDataManager.getStats();
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

/**
 * GET /api/leads
 * Get all leads with optional filters
 * Query params: status, email, createdAfter, limit
 */
router.get('/', async (req, res) => {
  try {
    const filters = {
      status: req.query.status,
      email: req.query.email,
      createdAfter: req.query.createdAfter,
      limit: req.query.limit ? parseInt(req.query.limit) : 100,
    };

    const leads = await leadDataManager.getLeads(filters);
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
 * GET /api/leads/emails
 * Get all email addresses from leads
 */
router.get('/emails', async (req, res) => {
  try {
    const filters = {
      status: req.query.status,
    };

    const emails = await leadDataManager.getEmails(filters);
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

/**
 * GET /api/leads/:id
 * Get a specific lead by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const lead = await leadDataManager.getLeadById(req.params.id);

    if (!lead) {
      return res.status(404).json({
        success: false,
        error: 'Lead not found',
      });
    }

    res.json({
      success: true,
      lead,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/leads
 * Create a new lead
 */
router.post('/', async (req, res) => {
  try {
    const leadData = req.body;

    // Basic validation
    if (!leadData.Email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required',
      });
    }

    const newLeadId = await leadDataManager.createLead(leadData);
    res.status(201).json({
      success: true,
      leadId: newLeadId,
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
 * PUT /api/leads/:id
 * Update an existing lead
 */
router.put('/:id', async (req, res) => {
  try {
    const updates = req.body;
    const success = await leadDataManager.updateLead(req.params.id, updates);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Lead not found or update failed',
      });
    }

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
 * DELETE /api/leads/:id
 * Delete (soft delete) a lead
 */
router.delete('/:id', async (req, res) => {
  try {
    const success = await leadDataManager.deleteLead(req.params.id);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Lead not found',
      });
    }

    res.json({
      success: true,
      message: 'Lead deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/leads/bulk-import
 * Bulk import leads
 */
router.post('/bulk-import', async (req, res) => {
  try {
    const { leads } = req.body;

    if (!Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid leads array',
      });
    }

    const stats = await leadDataManager.bulkImportLeads(leads);
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

/**
 * GET /api/leads/export/csv
 * Export leads to CSV
 */
router.get('/export/csv', async (req, res) => {
  try {
    const filters = {
      status: req.query.status,
      limit: req.query.limit ? parseInt(req.query.limit) : null,
    };

    const csv = await leadDataManager.exportLeadsToCSV(filters);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=leads-export.csv');
    res.send(csv);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
