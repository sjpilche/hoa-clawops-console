# Secret Rotation Guide

## Overview

This guide covers how to rotate secrets and manage sensitive configuration in the ClawOps Console.

**Secrets to Rotate:**
- JWT_SECRET
- OpenAI API Key
- Default Admin Password
- Database Encryption Keys (if using encrypted database)

---

## When to Rotate Secrets

### Immediate Rotation Required
- ✅ Secret was exposed (committed to git, shared publicly, found in logs)
- ✅ Security breach or compromise suspected
- ✅ Employee/contractor with access leaves the organization
- ✅ Moving from development to production

### Regular Rotation Schedule
- 🔄 **JWT_SECRET**: Every 90 days (quarterly)
- 🔄 **API Keys**: Every 90 days or when provider recommends
- 🔄 **Admin Password**: Every 60 days
- 🔄 **Database Keys**: Every 180 days (if applicable)

---

## How to Rotate Secrets

### 1. JWT_SECRET

**Impact**: All existing user sessions will be invalidated. Users must log in again.

**Steps**:

1. **Generate new secret** (128 characters recommended):
   ```bash
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```

2. **Backup current .env.local**:
   ```bash
   cp .env.local .env.local.backup-$(date +%Y%m%d)
   ```

3. **Update JWT_SECRET in .env.local**:
   ```bash
   # Old (DO NOT USE):
   # JWT_SECRET=old-secret-here

   # New:
   JWT_SECRET=<paste new secret here>
   ```

4. **Restart server**:
   ```bash
   npm run dev
   ```

5. **Notify users**: All users will need to log in again

6. **Verify**: Login should work with new tokens

**Rollback** (if needed):
```bash
cp .env.local.backup-YYYYMMDD .env.local
npm run dev
```

---

### 2. OpenAI API Key

**Impact**: Fast chat mode will stop working until server restarts with new key.

**Steps**:

1. **Generate new key**:
   - Go to https://platform.openai.com/api-keys
   - Click "Create new secret key"
   - Copy the new key immediately (shown only once)

2. **Update .env.local**:
   ```bash
   OPENAI_API_KEY=sk-proj-NEW_KEY_HERE
   ```

3. **Restart server**:
   ```bash
   npm run dev
   ```

4. **Revoke old key**:
   - Return to https://platform.openai.com/api-keys
   - Find the old key
   - Click "Revoke" to disable it

5. **Verify**: Test fast chat mode works with new key

**Note**: Do NOT commit the API key to git!

---

### 3. Default Admin Password

**Impact**: Default admin account password changes. Existing sessions remain valid.

**Steps**:

1. **Choose new password** (strong password required):
   - Minimum 8 characters
   - At least one letter and one number
   - Recommended: 12+ characters with symbols

2. **Update .env.local**:
   ```bash
   DEFAULT_ADMIN_PASSWORD=NewSecurePassword123!
   ```

3. **Delete existing admin user** (to force password update):
   ```bash
   # In SQLite or via API
   DELETE FROM users WHERE email = 'admin@clawops.local';
   ```

4. **Restart server**:
   ```bash
   npm run dev
   ```

5. **Server will recreate admin** with new password on first request

6. **Test login** with new credentials

**Production Recommendation**: Create individual user accounts instead of using default admin.

---

### 4. Database Encryption Keys

**Impact**: Requires database migration. High risk operation.

**Only applicable if using encrypted database (SQLCipher).**

**Steps** (consult database encryption documentation):

1. Create full backup
2. Export data to unencrypted format
3. Re-encrypt with new key
4. Update ENCRYPTION_KEY in .env.local
5. Verify data integrity
6. Test thoroughly before going live

---

## Emergency Secret Rotation

If a secret is compromised and immediate action is required:

### Quick Rotation Checklist

1. **Backup immediately**:
   ```bash
   cp .env.local .env.local.EMERGENCY-$(date +%Y%m%d-%H%M%S)
   cp data/clawops.db data/clawops.db.EMERGENCY-$(date +%Y%m%d-%H%M%S)
   ```

2. **Generate new JWT_SECRET**:
   ```bash
   NEW_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
   echo "JWT_SECRET=$NEW_SECRET"
   ```

3. **Update .env.local** with new secret

4. **Restart server immediately**:
   ```bash
   npm run dev
   ```

5. **Revoke compromised API keys** at provider websites

6. **Audit**: Check audit logs for suspicious activity:
   ```sql
   SELECT * FROM audit_log
   WHERE created_at > datetime('now', '-24 hours')
   ORDER BY created_at DESC;
   ```

7. **Notify stakeholders** of the incident

8. **Document** what was compromised and actions taken

---

## Secret Storage Best Practices

### DO ✅
- ✅ Store secrets in `.env.local` (gitignored)
- ✅ Use environment variables for all secrets
- ✅ Set restrictive file permissions (600 on Unix)
- ✅ Use `.env.example` as a template (no real secrets)
- ✅ Generate secrets with cryptographically secure methods
- ✅ Use different secrets for dev/staging/production
- ✅ Rotate secrets regularly
- ✅ Keep backup of old secrets during rotation (briefly)

### DON'T ❌
- ❌ Commit secrets to git
- ❌ Share secrets via email or chat
- ❌ Use default or example secrets in production
- ❌ Reuse secrets across environments
- ❌ Store secrets in source code
- ❌ Use weak secrets ("password123", "secret", etc.)
- ❌ Leave old secrets active after rotation
- ❌ Store secrets in screenshots or documentation

---

## Production Secret Management

For production deployments, consider using a dedicated secrets manager:

### Recommended Solutions

1. **HashiCorp Vault** (Enterprise-grade)
   - Centralized secret storage
   - Automatic rotation
   - Audit logging
   - Access control

2. **AWS Secrets Manager** (Cloud-native)
   - Automatic rotation
   - Integration with AWS services
   - Pay-per-secret pricing

3. **Azure Key Vault** (Microsoft Azure)
   - Secrets, keys, and certificates
   - Integration with Azure AD
   - Hardware security modules (HSM)

4. **Doppler** (Developer-friendly)
   - Environment-specific secrets
   - Team collaboration
   - Syncs to various platforms

### Migration to Secrets Manager

1. Create secrets in secrets manager
2. Update application to fetch from secrets manager
3. Remove secrets from .env.local
4. Test thoroughly
5. Deploy with new configuration

---

## Generating Secure Secrets

### JWT_SECRET (128 characters)
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Random Password (24 characters)
```bash
node -e "console.log(require('crypto').randomBytes(18).toString('base64'))"
```

### UUID (for session IDs, etc.)
```bash
node -e "console.log(require('crypto').randomUUID())"
```

### Custom Length Secret
```bash
# Replace <bytes> with desired bytes (each byte = 2 hex characters)
node -e "console.log(require('crypto').randomBytes(<bytes>).toString('hex'))"
```

---

## Verification

After rotating secrets, verify everything still works:

### Checklist

- [ ] Server starts without errors
- [ ] Environment validation passes
- [ ] Users can log in
- [ ] JWT tokens are issued correctly
- [ ] Existing sessions are handled appropriately
- [ ] API calls work (OpenAI, OpenClaw)
- [ ] Database connections work
- [ ] Audit logs record all actions
- [ ] No secrets appear in logs
- [ ] Old secrets have been revoked

### Test Commands

**Test login**:
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@clawops.local","password":"YOUR_PASSWORD"}'
```

**Test environment validation**:
```bash
npm run dev
# Check terminal output for validation messages
```

**Check audit logs**:
```bash
# Query the database
sqlite3 data/clawops.db "SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 10;"
```

---

## Troubleshooting

### "JWT_SECRET is too short"
- Generate a longer secret (64+ bytes = 128+ characters)
- Use the generation command above

### "Secret contains forbidden pattern"
- Never use default values like "change-me", "secret", "password"
- Always generate random secrets

### "Users can't log in after rotation"
- Expected behavior for JWT_SECRET rotation
- Users must log in again with their credentials
- Old tokens are invalid

### ".env.local permissions incorrect"
```bash
chmod 600 .env.local
```

### "OpenAI API key invalid"
- Generate new key at https://platform.openai.com/api-keys
- Ensure you copied the entire key (starts with "sk-")
- Check for extra spaces or newlines

---

## Security Incident Response

If you suspect a security incident:

1. **Contain**: Immediately rotate all affected secrets
2. **Investigate**: Check audit logs for suspicious activity
3. **Document**: Record what happened, when, and what was accessed
4. **Notify**: Inform stakeholders and affected users
5. **Recover**: Restore normal operations
6. **Learn**: Update procedures to prevent recurrence

**Emergency Contact**: [Your security team contact information]

---

## Additional Resources

- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [NIST Guidelines for Password Generation](https://pages.nist.gov/800-63-3/sp800-63b.html)
- [CWE-798: Use of Hard-coded Credentials](https://cwe.mitre.org/data/definitions/798.html)

---

## Questions?

For questions about secret rotation or security best practices, consult:
- `SECURITY-AUDIT-REPORT.md` - Security audit findings
- `SECURITY-DOCUMENTATION-INDEX.md` - Security documentation overview
- `server/lib/secretManager.js` - Environment validation code
