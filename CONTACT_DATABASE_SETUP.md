

# Contact Database Integration - Complete Setup Guide

## ✅ What's Been Created

Your OpenClaw system now has full integration with your Azure SQL contact database (`empcapmaster2`). Agents can add, search, and manage contacts programmatically.

---

## 📦 Files Created

### 1. Contact Manager Service
**File:** `server/services/contactManager.js`

Core service for managing all contact operations:
- ✅ Add/update/get leads
- ✅ Add/get HOA contacts
- ✅ Get all email addresses
- ✅ Search contacts across all tables
- ✅ Add contacts to marketing queue
- ✅ Bulk import leads
- ✅ Export all contacts (JSON/CSV)
- ✅ Database statistics

### 2. REST API Routes
**File:** `server/routes/contacts.js`

Complete REST API for contact management:
- `GET /api/contacts/test` - Test connection
- `GET /api/contacts/stats` - Get statistics
- `POST /api/contacts/leads` - Add new lead
- `GET /api/contacts/leads` - Get all leads
- `PUT /api/contacts/leads/:id` - Update lead
- `POST /api/contacts/leads/bulk` - Bulk import
- `POST /api/contacts/hoa` - Add HOA contact
- `GET /api/contacts/hoa` - Get HOA contacts
- `GET /api/contacts/emails` - Get all emails
- `POST /api/contacts/marketing-queue` - Add to marketing queue
- `GET /api/contacts/search?q=term` - Search contacts
- `GET /api/contacts/export?format=csv` - Export contacts

### 3. Agent Tool
**File:** `server/tools/contactDatabaseTool.js`

Tool definition for OpenClaw agents to use in their workflows.

### 4. Configuration
**File:** `.env.local`

Azure SQL credentials configured:
```env
AZURE_SQL_SERVER=empirecapital.database.windows.net
AZURE_SQL_DATABASE=empcapmaster2
AZURE_SQL_USER=CloudSA1f77fc9b
AZURE_SQL_PASSWORD=T0ughGUY123$
```

---

## 🚀 Quick Start

### Test the Connection

```bash
# Test connection
curl http://localhost:3001/api/contacts/test

# Get statistics
curl http://localhost:3001/api/contacts/stats
```

### Add a Lead

```bash
curl -X POST http://localhost:3001/api/contacts/leads \
  -H "Content-Type: application/json" \
  -d '{
    "contact_name": "Jane Smith",
    "email": "jane@sunrisehoa.com",
    "phone": "555-0123",
    "hoa_name": "Sunrise HOA",
    "city": "Phoenix",
    "state": "AZ",
    "units": 150,
    "source": "website",
    "status": "new"
  }'
```

### Add HOA Contact

```bash
curl -X POST http://localhost:3001/api/contacts/hoa \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Bob Johnson",
    "email": "bob@managementco.com",
    "phone": "555-0456",
    "title": "Property Manager",
    "company": "ABC Management",
    "role": "manager"
  }'
```

### Search Contacts

```bash
curl "http://localhost:3001/api/contacts/search?q=smith"
```

### Get All Emails

```bash
curl http://localhost:3001/api/contacts/emails
```

### Export to CSV

```bash
curl "http://localhost:3001/api/contacts/export?format=csv" > contacts.csv
```

---

## 🤖 Using with OpenClaw Agents

### Method 1: Via Agent Instructions

Add this to your agent's instructions/system prompt:

```markdown
You have access to a contact database tool. Use it to:
- Add new leads when you collect contact information
- Search for existing contacts
- Get email lists for campaigns
- Add contacts to marketing queues

Tool: contact_database

Available actions:
- add_lead
- get_leads
- update_lead
- add_hoa_contact
- get_hoa_contacts
- get_all_emails
- search_contacts
- add_to_marketing_queue
- get_stats

Example: To add a lead:
{
  "action": "add_lead",
  "data": {
    "contact_name": "John Doe",
    "email": "john@example.com",
    "phone": "555-1234",
    "hoa_name": "Sunset HOA",
    "city": "Los Angeles",
    "state": "CA"
  }
}
```

### Method 2: Direct API Calls

Your agents can make HTTP requests to the REST API:

```javascript
// Example agent code
async function addContactToDatabase(contactInfo) {
  const response = await fetch('http://localhost:3001/api/contacts/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(contactInfo)
  });
  return await response.json();
}
```

### Method 3: Import the Service

```javascript
const contactManager = require('./server/services/contactManager');

// In your agent code
async function processLead(leadData) {
  const leadId = await contactManager.addLead({
    contact_name: leadData.name,
    email: leadData.email,
    phone: leadData.phone,
    hoa_name: leadData.hoa,
    source: 'agent_intake',
    status: 'new'
  });

  console.log('Lead added with ID:', leadId);
}
```

---

## 📊 Database Schema

### dbo.leads (Main Leads Table)
```sql
- lead_id (uniqueidentifier, PK)
- created_at (datetime2)
- source (nvarchar)
- form_name (nvarchar)
- contact_name (nvarchar)
- email (nvarchar)
- phone (nvarchar)
- hoa_name (nvarchar)
- city (nvarchar)
- state (nvarchar)
- zip (nvarchar)
- units (int)
- notes (nvarchar)
- segment (nvarchar)
- score (int)
- clearbit_json (nvarchar)
- utm_source (nvarchar)
- utm_campaign (nvarchar)
- utm_medium (nvarchar)
- status (nvarchar)
```

### dbo.hoa_contact (HOA Contacts)
```sql
- id (uniqueidentifier, PK)
- application_id (uniqueidentifier)
- role (nvarchar)
- name (nvarchar)
- title (nvarchar)
- phone (nvarchar)
- email (nvarchar)
- company (nvarchar)
```

### dbo.mkt_outreach_queue (Marketing Queue)
```sql
- id (uniqueidentifier, PK)
- contact_email (nvarchar)
- contact_name (nvarchar)
- hoa_name (nvarchar)
- campaign (nvarchar)
- template (nvarchar)
- segment (nvarchar)
- priority (int)
- scheduled_for (datetime2)
- notes (nvarchar)
- created_at (datetime2)
- status (nvarchar)
```

---

## 🔧 Common Agent Use Cases

### 1. Lead Intake Agent
```javascript
// When agent collects contact info from a form/conversation
await contactDatabaseTool.execute({
  action: 'add_lead',
  data: {
    contact_name: conversationData.name,
    email: conversationData.email,
    phone: conversationData.phone,
    hoa_name: conversationData.hoaName,
    source: 'chatbot',
    status: 'new',
    notes: `Collected via chatbot on ${new Date().toISOString()}`
  }
});
```

### 2. Marketing Campaign Agent
```javascript
// Get all contacts with emails
const result = await contactDatabaseTool.execute({
  action: 'get_all_emails'
});

// Add to marketing queue
for (const contact of result.emails) {
  await contactDatabaseTool.execute({
    action: 'add_to_marketing_queue',
    data: {
      contact_email: contact.email,
      contact_name: contact.name,
      campaign: 'Spring_2026_HOA_Loans',
      template: 'spring_promo',
      priority: 5
    }
  });
}
```

### 3. Contact Search Agent
```javascript
// Search for contacts by name, email, or company
const searchResults = await contactDatabaseTool.execute({
  action: 'search_contacts',
  data: {
    searchTerm: userQuery
  }
});

console.log(`Found ${searchResults.count} contacts matching "${userQuery}"`);
```

### 4. Lead Scoring Agent
```javascript
// Get all leads and update scores
const leads = await contactDatabaseTool.execute({
  action: 'get_leads'
});

for (const lead of leads.leads) {
  const score = calculateLeadScore(lead);

  await contactDatabaseTool.execute({
    action: 'update_lead',
    data: {
      leadId: lead.lead_id,
      score: score,
      status: score > 80 ? 'hot' : 'warm'
    }
  });
}
```

---

## 📈 Monitoring & Stats

Get current database statistics:

```javascript
const stats = await contactDatabaseTool.execute({
  action: 'get_stats'
});

console.log(`
Total Leads: ${stats.stats.total_leads}
Leads with Email: ${stats.stats.leads_with_email}
HOA Contacts: ${stats.stats.total_hoa_contacts}
HOA Contacts with Email: ${stats.stats.hoa_contacts_with_email}
Marketing Queue Items: ${stats.stats.marketing_queue_items}
Pending Outreach: ${stats.stats.pending_outreach}
`);
```

---

## 🔐 Security Notes

1. **Credentials**: Azure SQL credentials are stored in `.env.local` (not committed to git)
2. **SQL Injection**: All queries use parameterized inputs to prevent SQL injection
3. **Connection Pooling**: Configured with min=0, max=10 connections
4. **Encryption**: All connections use TLS encryption (encrypt: true)

---

## 🛠️ Troubleshooting

### Connection Issues
```bash
# Test connection
curl http://localhost:3001/api/contacts/test
```

### View Current Data
```bash
# Get statistics
curl http://localhost:3001/api/contacts/stats

# View all contacts
curl http://localhost:3001/api/contacts/export
```

### Check Logs
```bash
# Look for ContactManager logs in your server console
[ContactManager] Connected to empcapmaster2
[ContactManager] Created lead: <uuid>
```

---

## 📚 Additional Resources

- **Test Scripts**: `dev-utils/view-lead-data.js`, `dev-utils/explore-lead-database.js`
- **Service Documentation**: See inline comments in `server/services/contactManager.js`
- **API Documentation**: See inline comments in `server/routes/contacts.js`

---

## ✅ Next Steps

1. **Register the API routes** in your main server file
2. **Add the contact tool** to your agent configurations
3. **Build agent workflows** that use the contact database
4. **Set up marketing campaigns** using the marketing queue
5. **Create dashboards** to visualize contact data

The contact database is ready for your agents to use! 🎉
