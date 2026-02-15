# EMPCAMPMaster2 Lead Database Setup

## Overview
This project now includes connectivity to your Azure SQL Server database **EMPCAMPMaster2** which contains lead data (emails, contacts, customer information).

## Current Status
⚠️ **Connection Not Yet Established** - Need to verify the correct Azure SQL Server hostname.

## Configuration Files

### 1. Environment Variables (.env.local)
```env
# Azure SQL Server (EMPCAMPMaster2 - Lead Database)
AZURE_SQL_SERVER=empcashmart.database.windows.net
AZURE_SQL_DATABASE=EMPCAMPMaster2
AZURE_SQL_USER=CloudSA1f77fc9b
AZURE_SQL_PASSWORD=T0ughGUY123$
```

**Note:** If the connection is failing, the server hostname might need to be updated. Check your Azure Portal for the correct server name.

### Possible Server Name Formats:
- `empcashmart.database.windows.net` (current)
- `<your-server-name>.database.windows.net`
- Full connection string from Azure Portal

## Files Created

### 1. Lead Data Manager Service
**File:** `server/services/leadDataManager.js`

Provides methods for:
- ✅ Connect to Azure SQL
- ✅ Pull all leads
- ✅ Get lead by ID
- ✅ Get all email addresses
- ✅ Create new leads
- ✅ Update existing leads
- ✅ Delete leads (soft delete)
- ✅ Bulk import leads
- ✅ Export leads to CSV
- ✅ Get database statistics

### 2. API Routes
**File:** `server/routes/leads.js`

REST API endpoints:
- `GET /api/leads/test` - Test database connection
- `GET /api/leads/stats` - Get database statistics
- `GET /api/leads` - Get all leads (with filters)
- `GET /api/leads/emails` - Get all email addresses
- `GET /api/leads/:id` - Get specific lead by ID
- `POST /api/leads` - Create new lead
- `PUT /api/leads/:id` - Update lead
- `DELETE /api/leads/:id` - Delete lead (soft delete)
- `POST /api/leads/bulk-import` - Bulk import leads
- `GET /api/leads/export/csv` - Export leads to CSV

### 3. Test Utilities
**File:** `dev-utils/test-azure-sql-connection.js`

Run this to test your Azure SQL connection:
```bash
node dev-utils/test-azure-sql-connection.js
```

## How to Get the Correct Server Name

### Option 1: Azure Portal
1. Go to https://portal.azure.com
2. Navigate to **SQL databases**
3. Click on **EMPCAMPMaster2** database
4. Look for **Server name** in the Overview section
5. Copy the full server name (e.g., `yourserver.database.windows.net`)

### Option 2: Connection String
If you have a connection string, it looks like:
```
Server=tcp:yourserver.database.windows.net,1433;Database=EMPCAMPMaster2;User ID=CloudSA1f77fc9b;Password=T0ughGUY123$;Encrypt=yes;TrustServerCertificate=no;
```

Extract the server name from `Server=tcp:...`

## Firewall Configuration

**Important:** Azure SQL Server has firewall rules. You may need to:

1. Add your current IP address to the firewall whitelist in Azure Portal
2. Or enable "Allow Azure services and resources to access this server"

### To Add Your IP:
1. Go to Azure Portal → SQL Server
2. Click **Firewalls and virtual networks**
3. Add your client IP address
4. Save changes

## Testing the Connection

Once you have the correct server name:

1. Update `.env.local` with correct `AZURE_SQL_SERVER` value
2. Run the test script:
   ```bash
   node dev-utils/test-azure-sql-connection.js
   ```
3. You should see:
   - Database information
   - List of schemas and tables
   - Lead/customer related tables
   - Row counts and sample data

## Usage Examples

### Using the Lead Data Manager in Code

```javascript
const leadDataManager = require('./server/services/leadDataManager');

// Get all leads
const leads = await leadDataManager.getLeads({ limit: 100 });

// Get all emails
const emails = await leadDataManager.getEmails();

// Get specific lead
const lead = await leadDataManager.getLeadById(123);

// Create new lead
const newLeadId = await leadDataManager.createLead({
  Email: 'john@example.com',
  FirstName: 'John',
  LastName: 'Doe',
  Company: 'Acme Corp',
  Status: 'Active'
});

// Update lead
await leadDataManager.updateLead(123, {
  Status: 'Contacted',
  Notes: 'Called on 2/14/2026'
});

// Export to CSV
const csv = await leadDataManager.exportLeadsToCSV();
```

### Using the API Endpoints

```bash
# Test connection
curl http://localhost:3001/api/leads/test

# Get stats
curl http://localhost:3001/api/leads/stats

# Get all leads (limit 10)
curl http://localhost:3001/api/leads?limit=10

# Get all emails
curl http://localhost:3001/api/leads/emails

# Create new lead
curl -X POST http://localhost:3001/api/leads \
  -H "Content-Type: application/json" \
  -d '{"Email":"test@example.com","FirstName":"Test","Status":"Active"}'

# Export to CSV
curl http://localhost:3001/api/leads/export/csv > leads.csv
```

## Next Steps

1. ✅ Verify/update the Azure SQL Server hostname
2. ✅ Test the connection
3. ✅ Explore the database structure
4. ✅ Review what lead data exists
5. ✅ Integrate the API endpoints into your application
6. ✅ Build UI components for managing leads (optional)

## Troubleshooting

### Connection Errors

**Error:** `getaddrinfo ENOTFOUND`
- **Solution:** Verify the server hostname in `.env.local`

**Error:** `Login failed for user`
- **Solution:** Verify username/password are correct

**Error:** `Cannot open server requested by the login`
- **Solution:** Check firewall rules in Azure Portal

**Error:** `A network-related error occurred`
- **Solution:** Check network connectivity, VPN, or firewall

### Need Help?
- Check Azure Portal for server details
- Verify credentials
- Check firewall rules
- Ensure the database exists and is running
