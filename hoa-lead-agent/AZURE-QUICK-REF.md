# Azure SQL Integration - Quick Reference

## 🎯 Quick Facts

- **Database**: `empcapmaster2` (Azure SQL)
- **Table**: `hoa_contacts`
- **Source Type**: `'hoa_lead_agent'` (identifies leads from this agent)
- **Current Count**: 91 contacts synced
- **With Emails**: 56 (62%)
- **High-Value**: 52 (confidence ≥ 80)

---

## ⚡ Quick Commands

### Test Azure Sync
```bash
cd hoa-lead-agent
node scripts/test-azure-sync.js
```

### Run Agent with Azure Sync
```bash
cd hoa-lead-agent
npm run dev
```

### Check Logs for Azure Activity
```bash
tail -f logs/agent.log | grep Azure
```

---

## 📊 Useful SQL Queries

### Get all agent leads
```sql
SELECT * FROM hoa_contacts
WHERE source_type = 'hoa_lead_agent'
ORDER BY confidence_score DESC;
```

### Count by state
```sql
SELECT state, COUNT(*) as total
FROM hoa_contacts
WHERE source_type = 'hoa_lead_agent'
GROUP BY state
ORDER BY total DESC;
```

### High-value leads with emails
```sql
SELECT hoa_name, contact_person, email, phone, city, state, confidence_score
FROM hoa_contacts
WHERE source_type = 'hoa_lead_agent'
  AND confidence_score >= 80
  AND email IS NOT NULL
ORDER BY confidence_score DESC;
```

### Latest leads (last 24 hours)
```sql
SELECT hoa_name, contact_person, email, city, state, scraped_at
FROM hoa_contacts
WHERE source_type = 'hoa_lead_agent'
  AND scraped_at >= DATEADD(day, -1, GETDATE())
ORDER BY scraped_at DESC;
```

---

## 🔧 Connection Details

**Server**: empirecapital.database.windows.net
**Database**: empcapmaster2
**User**: CloudSA1f77fc9b
**Password**: (in .env file)

---

## 📈 What Gets Synced

| Local Field | Azure Field | Notes |
|------------|-------------|-------|
| company_name | hoa_name | Direct mapping |
| contact_name | contact_person | Direct mapping |
| contact_title | title | Direct mapping |
| primary_email | email | Direct mapping |
| phone | phone | Direct mapping |
| city | city | Direct mapping |
| state | state | Direct mapping |
| website | source_url | Direct mapping |
| signal_score | confidence_score | **×10** (0-10 → 0-100) |
| - | source_type | **Set to 'hoa_lead_agent'** |
| - | fingerprint | **Generated** for dedup |

---

## ✅ Verification Checklist

- [x] Azure SQL table `hoa_contacts` created
- [x] Test sync successful (91 leads)
- [x] Source attribution working (`source_type = 'hoa_lead_agent'`)
- [x] Deduplication working (fingerprint-based)
- [x] Agent integrated with Phase 3.5 sync
- [x] Error handling in place
- [x] Secure connection (encrypted)

---

## 🚨 Troubleshooting

**Problem**: Connection timeout
**Solution**: Check Azure firewall rules (allow your IP)

**Problem**: "Invalid object name 'hoa_contacts'"
**Solution**: Run `node scripts/create-azure-table.js`

**Problem**: Duplicate errors
**Solution**: Normal - means contact exists, gets updated instead

**Problem**: No leads syncing
**Solution**: Check .env has correct Azure credentials

---

## 📞 Key Files

- **Sync Module**: `src/storage/azureSync.ts`
- **Main Agent**: `src/index.ts` (Phase 3.5)
- **Test Script**: `scripts/test-azure-sync.js`
- **Table Creation**: `scripts/create-azure-table.js`
- **Config**: `.env` (Azure credentials)

---

**Status**: ✅ FULLY OPERATIONAL
