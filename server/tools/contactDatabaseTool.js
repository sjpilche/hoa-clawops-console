/**
 * @file contactDatabaseTool.js
 * @description Contact Database Tool for OpenClaw Agents
 *
 * This tool allows agents to interact with the Azure SQL contact database
 * and perform CRUD operations on leads and contacts
 */

const contactManager = require('../services/contactManager');

/**
 * Contact Database Tool Definition for Claude/OpenClaw Agents
 */
const contactDatabaseTool = {
  name: 'contact_database',
  description: `Manage contacts in the Azure SQL contact database.
    Use this tool to add leads, search contacts, get emails, and manage HOA contacts.
    All contact data is stored in the empcapmaster2 database.`,

  input_schema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: [
          'add_lead',
          'get_leads',
          'update_lead',
          'add_hoa_contact',
          'get_hoa_contacts',
          'get_all_emails',
          'search_contacts',
          'add_to_marketing_queue',
          'get_stats'
        ],
        description: 'The action to perform on the contact database',
      },
      data: {
        type: 'object',
        description: 'Data for the action (structure depends on action type)',
      },
      filters: {
        type: 'object',
        description: 'Optional filters for query actions',
      },
    },
    required: ['action'],
  },

  /**
   * Execute the tool
   */
  async execute(params) {
    const { action, data, filters } = params;

    try {
      switch (action) {
        case 'add_lead':
          return await addLead(data);

        case 'get_leads':
          return await getLeads(filters);

        case 'update_lead':
          return await updateLead(data);

        case 'add_hoa_contact':
          return await addHOAContact(data);

        case 'get_hoa_contacts':
          return await getHOAContacts(filters);

        case 'get_all_emails':
          return await getAllEmails();

        case 'search_contacts':
          return await searchContacts(data);

        case 'add_to_marketing_queue':
          return await addToMarketingQueue(data);

        case 'get_stats':
          return await getStats();

        default:
          return {
            success: false,
            error: `Unknown action: ${action}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  },
};

// ============================================================================
// ACTION IMPLEMENTATIONS
// ============================================================================

/**
 * Add a new lead to the database
 */
async function addLead(data) {
  if (!data.email && !data.phone) {
    return {
      success: false,
      error: 'Either email or phone is required',
    };
  }

  const leadId = await contactManager.addLead(data);

  return {
    success: true,
    message: 'Lead added successfully',
    leadId,
    data: {
      ...data,
      leadId,
    },
  };
}

/**
 * Get leads from the database
 */
async function getLeads(filters = {}) {
  const leads = await contactManager.getLeads(filters);

  return {
    success: true,
    count: leads.length,
    leads,
  };
}

/**
 * Update an existing lead
 */
async function updateLead(data) {
  if (!data.leadId) {
    return {
      success: false,
      error: 'leadId is required',
    };
  }

  const { leadId, ...updates } = data;
  await contactManager.updateLead(leadId, updates);

  return {
    success: true,
    message: 'Lead updated successfully',
    leadId,
  };
}

/**
 * Add HOA contact
 */
async function addHOAContact(data) {
  const contactId = await contactManager.addHOAContact(data);

  return {
    success: true,
    message: 'HOA contact added successfully',
    contactId,
    data: {
      ...data,
      contactId,
    },
  };
}

/**
 * Get HOA contacts
 */
async function getHOAContacts(filters = {}) {
  const contacts = await contactManager.getHOAContacts(filters);

  return {
    success: true,
    count: contacts.length,
    contacts,
  };
}

/**
 * Get all email addresses
 */
async function getAllEmails() {
  const emails = await contactManager.getAllEmails();

  return {
    success: true,
    count: emails.length,
    emails: emails.map(e => ({
      email: e.email,
      name: e.name,
      source: e.source,
      company: e.company,
      title: e.title,
    })),
  };
}

/**
 * Search contacts
 */
async function searchContacts(data) {
  if (!data.searchTerm && !data.q) {
    return {
      success: false,
      error: 'searchTerm or q is required',
    };
  }

  const searchTerm = data.searchTerm || data.q;
  const results = await contactManager.searchContacts(searchTerm);

  return {
    success: true,
    count: results.length,
    results,
  };
}

/**
 * Add to marketing queue
 */
async function addToMarketingQueue(data) {
  if (!data.contact_email) {
    return {
      success: false,
      error: 'contact_email is required',
    };
  }

  const queueId = await contactManager.addToMarketingQueue(data);

  return {
    success: true,
    message: 'Added to marketing queue successfully',
    queueId,
  };
}

/**
 * Get database statistics
 */
async function getStats() {
  const stats = await contactManager.getStats();

  return {
    success: true,
    stats,
  };
}

// ============================================================================
// HELPER FUNCTION FOR AGENT INSTRUCTIONS
// ============================================================================

/**
 * Get usage examples for agents
 */
function getUsageExamples() {
  return {
    add_lead: {
      action: 'add_lead',
      data: {
        contact_name: 'John Doe',
        email: 'john@example.com',
        phone: '555-1234',
        hoa_name: 'Sunset HOA',
        city: 'Los Angeles',
        state: 'CA',
        source: 'website',
        status: 'new',
      },
    },
    search_contacts: {
      action: 'search_contacts',
      data: {
        searchTerm: 'john',
      },
    },
    get_emails: {
      action: 'get_all_emails',
    },
    add_to_marketing: {
      action: 'add_to_marketing_queue',
      data: {
        contact_email: 'john@example.com',
        contact_name: 'John Doe',
        campaign: 'Q1_2026_Outreach',
        template: 'welcome_email',
      },
    },
  };
}

module.exports = {
  contactDatabaseTool,
  getUsageExamples,
};
