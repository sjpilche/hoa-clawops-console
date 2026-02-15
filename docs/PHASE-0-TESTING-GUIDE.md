# Phase 0 Testing Guide

## Overview

This guide helps you test all the security improvements implemented in Phase 0:
- ✅ HARDENED security fixes (command injection, JWT validation, CSP)
- ✅ Input validation with Zod (100% API coverage)
- ✅ Secret management with startup validation

---

## Prerequisites

1. **Backup your current configuration**:
   ```bash
   cp .env.local .env.local.backup
   cp data/clawops.db data/clawops.db.backup
   ```

2. **Ensure you have the latest code**:
   - All HARDENED files deployed
   - Validation middleware applied to all routes
   - Secret manager integrated in server/index.js

---

## Test 1: Environment Validation (Startup)

### Test 1.1: Valid Configuration ✅

**Start the server normally:**
```bash
npm run dev
```

**Expected output:**
```
============================================================
🔐 Environment Variable Validation
============================================================

🔧 Environment: development
ℹ  .env.local found (Windows - skipping permission check)
✅ JWT_SECRET validated (128 chars, 32 unique chars)
✅ Database path validated: ./data/clawops.db
✅ Safety limits validated (concurrent: 3, cost: $5, duration: 300s, tokens: 100000, runs/hr: 20)
✅ OpenClaw configuration validated (mode: shell)
✅ OpenAI API key configured

============================================================
✅ All environment variables validated successfully!
============================================================

=== ClawOps Console — Starting server ===
Environment: development
Production mode: false

[Database] Initializing database...
[Database] ✅ Database initialized
[Server] Express server listening on port 3001
[WebSocket] Socket.io server initialized
```

**✅ PASS if**: Server starts without errors and shows all green checkmarks

**❌ FAIL if**: Server exits with validation errors

---

### Test 1.2: Weak JWT_SECRET Detection 🔴

**Edit `.env.local` temporarily:**
```bash
# Change JWT_SECRET to something weak
JWT_SECRET=weak
```

**Try to start server:**
```bash
npm run dev
```

**Expected output:**
```
❌ FATAL ERROR: JWT_SECRET is too short: 4 characters
   Minimum required: 32 characters
   Recommended: 64+ characters
   Generate a strong secret:
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

**✅ PASS if**: Server refuses to start with clear error message

**Fix it:**
```bash
# Restore your backup
cp .env.local.backup .env.local
```

---

### Test 1.3: Forbidden Pattern Detection 🔴

**Edit `.env.local` temporarily:**
```bash
# Change JWT_SECRET to contain forbidden pattern
JWT_SECRET=please-change-me-this-is-a-secret-key-for-development
```

**Try to start server:**
```bash
npm run dev
```

**Expected output:**
```
❌ FATAL ERROR: JWT_SECRET contains forbidden pattern: "change-me"
   Never use default or example secrets in production!
   Generate a new random secret immediately.
```

**✅ PASS if**: Server refuses to start

**Fix it:**
```bash
cp .env.local.backup .env.local
```

---

### Test 1.4: Invalid Port Number 🔴

**Edit `.env.local` temporarily:**
```bash
SERVER_PORT=99999
```

**Try to start server:**
```bash
npm run dev
```

**Expected output:**
```
❌ FATAL ERROR: SERVER_PORT must be between 1 and 65535, got: 99999
```

**✅ PASS if**: Server refuses to start

**Fix it:**
```bash
cp .env.local.backup .env.local
```

---

## Test 2: Input Validation (API Endpoints)

Start the server first:
```bash
npm run dev
```

### Test 2.1: Invalid UUID 🔴

**Test command:**
```bash
curl http://localhost:3001/api/agents/not-a-valid-uuid \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected response:**
```json
{
  "error": "id: Must be a valid UUID v4",
  "code": "VALIDATION_ERROR",
  "status": 400
}
```

**✅ PASS if**: Returns 400 with validation error

---

### Test 2.2: Invalid Email 🔴

**Test command:**
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"notanemail","password":"test123"}'
```

**Expected response:**
```json
{
  "error": "email: Must be a valid email address",
  "code": "VALIDATION_ERROR",
  "status": 400
}
```

**✅ PASS if**: Returns 400 with email validation error

---

### Test 2.3: Weak Password 🔴

**Test command:**
```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"weak"}'
```

**Expected response:**
```json
{
  "error": "password: Password must be at least 8 characters",
  "code": "VALIDATION_ERROR",
  "status": 400
}
```

**✅ PASS if**: Returns 400 with password validation error

---

### Test 2.4: Password Without Number 🔴

**Test command:**
```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"onlyletters"}'
```

**Expected response:**
```json
{
  "error": "password: Password must contain at least one number",
  "code": "VALIDATION_ERROR",
  "status": 400
}
```

**✅ PASS if**: Returns 400 with password validation error

---

### Test 2.5: Message Too Long 🔴

**Test command:**
```bash
# Create a message longer than 10KB
curl -X POST http://localhost:3001/api/chat/threads/THREAD_ID/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d "{\"content\":\"$(printf 'A%.0s' {1..10001})\"}"
```

**Expected response:**
```json
{
  "error": "content: Message content must not exceed 10,000 characters",
  "code": "VALIDATION_ERROR",
  "status": 400
}
```

**✅ PASS if**: Returns 400 with length validation error

---

### Test 2.6: Valid Login ✅

**Test command:**
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@clawops.local","password":"changeme123"}'
```

**Expected response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "...",
    "email": "admin@clawops.local",
    "name": "Admin",
    "role": "admin"
  }
}
```

**✅ PASS if**: Returns 200 with valid JWT token

**Save the token** for next tests:
```bash
export TOKEN="<paste token here>"
```

---

### Test 2.7: Valid Agent Creation ✅

**Test command:**
```bash
curl -X POST http://localhost:3001/api/agents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "Test Agent",
    "description": "Testing validation",
    "permissions": "read-only",
    "domains": ["example.com", "*.test.com"]
  }'
```

**Expected response:**
```json
{
  "agent": {
    "id": "...",
    "name": "Test Agent",
    "description": "Testing validation",
    "permissions": "read-only",
    "domains": "[\"example.com\",\"*.test.com\"]",
    "status": "idle",
    ...
  }
}
```

**✅ PASS if**: Returns 201 with created agent

---

## Test 3: Security Fixes

### Test 3.1: Command Injection Prevention 🔴

**Before (vulnerable version would execute)**:
```javascript
// This would have been dangerous with the old version
message: "Hello; rm -rf /tmp/test; echo pwned"
```

**Test command:**
```bash
curl -X POST http://localhost:3001/api/agents/AGENT_ID/run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "message": "Hello; rm -rf /tmp/test; echo pwned",
    "sessionId": "test-123"
  }'
```

**✅ PASS if**:
- Message is treated as literal string (not executed as shell command)
- No files are deleted
- OpenClaw receives the full message including semicolons

**How to verify:**
- Check OpenClaw logs - should show the literal message
- Check `/tmp/test` still exists (if it existed before)
- No shell injection occurs

---

### Test 3.2: JWT Token Validation ✅

**Test with no token:**
```bash
curl http://localhost:3001/api/agents
```

**Expected response:**
```json
{
  "error": "Authentication required",
  "message": "No Authorization header found. Include: Authorization: Bearer <your-token>",
  "code": "AUTH_MISSING_TOKEN"
}
```

**✅ PASS if**: Returns 401 with authentication required

---

### Test 3.3: JWT Token Expiry ✅

**Wait for token to expire** (default: 24 hours, or set JWT_EXPIRY=1m in .env.local to test faster)

**Test with expired token:**
```bash
curl http://localhost:3001/api/agents \
  -H "Authorization: Bearer $EXPIRED_TOKEN"
```

**Expected response:**
```json
{
  "error": "Token expired",
  "message": "Your session has expired. Please log in again.",
  "code": "AUTH_TOKEN_EXPIRED"
}
```

**✅ PASS if**: Returns 401 with token expired error

---

### Test 3.4: CSP Headers ✅

**Test command:**
```bash
curl -I http://localhost:3001/api/settings \
  -H "Authorization: Bearer $TOKEN"
```

**Expected headers:**
```
HTTP/1.1 200 OK
Content-Security-Policy: default-src 'self'; ...
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

**✅ PASS if**: Response includes security headers

---

## Test 4: Secret Rotation

### Test 4.1: Rotate JWT_SECRET 🔄

**Step 1: Backup**
```bash
cp .env.local .env.local.before-rotation
```

**Step 2: Generate new secret**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

**Step 3: Update .env.local**
```bash
# Paste the new secret in .env.local
JWT_SECRET=<new secret here>
```

**Step 4: Restart server**
```bash
npm run dev
```

**Expected output:**
```
✅ JWT_SECRET validated (128 chars, 32 unique chars)
✅ All environment variables validated successfully!
```

**Step 5: Test old token (should fail)**
```bash
curl http://localhost:3001/api/agents \
  -H "Authorization: Bearer $TOKEN"
```

**Expected response:**
```json
{
  "error": "Invalid token",
  "code": "AUTH_INVALID_TOKEN"
}
```

**✅ PASS if**: Old tokens are rejected

**Step 6: Login again (should work)**
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@clawops.local","password":"changeme123"}'
```

**✅ PASS if**: Returns new valid token

**Step 7: Rollback (optional)**
```bash
cp .env.local.before-rotation .env.local
npm run dev
```

---

## Test 5: Database & File Checks

### Test 5.1: Database File Exists ✅

**Check database:**
```bash
ls -la data/clawops.db
```

**✅ PASS if**: File exists and is readable

---

### Test 5.2: Audit Logs Working ✅

**Query audit logs:**
```bash
sqlite3 data/clawops.db "SELECT user_id, action, method, path, status_code, created_at FROM audit_log ORDER BY created_at DESC LIMIT 5;"
```

**Expected output:**
```
admin@clawops.local|auth:login|POST|/api/auth/login|200|2026-02-12 05:30:00
admin@clawops.local|agents:list|GET|/api/agents|200|2026-02-12 05:29:45
...
```

**✅ PASS if**: Shows recent API calls

---

### Test 5.3: .env.local Permissions ✅

**Check file permissions (Unix/WSL):**
```bash
stat -c "%a %n" .env.local
# or on macOS:
stat -f "%A %N" .env.local
```

**Expected output:**
```
600 .env.local
```

**✅ PASS if**: Permissions are 600 (owner read/write only)

**On Windows**: File permissions handled differently, skip this test

---

## Test 6: Error Handling

### Test 6.1: Graceful Error Messages ✅

**Test with invalid JSON:**
```bash
curl -X POST http://localhost:3001/api/agents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d 'invalid json{'
```

**Expected response:**
```json
{
  "error": "Invalid JSON in request body",
  "code": "PARSE_ERROR",
  "status": 400
}
```

**✅ PASS if**: Returns helpful error message (not a crash)

---

### Test 6.2: 404 for Missing Routes ✅

**Test command:**
```bash
curl http://localhost:3001/api/nonexistent \
  -H "Authorization: Bearer $TOKEN"
```

**Expected response:**
```json
{
  "error": "Not Found",
  "message": "Route /api/nonexistent not found",
  "code": "NOT_FOUND",
  "status": 404
}
```

**✅ PASS if**: Returns 404 with clear message

---

## Test Summary Checklist

### Environment Validation
- [ ] Server starts with valid configuration ✅
- [ ] Server rejects weak JWT_SECRET 🔴
- [ ] Server rejects forbidden patterns 🔴
- [ ] Server rejects invalid ports 🔴

### Input Validation
- [ ] Rejects invalid UUIDs 🔴
- [ ] Rejects invalid emails 🔴
- [ ] Enforces strong passwords 🔴
- [ ] Rejects messages > 10KB 🔴
- [ ] Accepts valid login ✅
- [ ] Accepts valid agent creation ✅

### Security Fixes
- [ ] Command injection prevented 🔴
- [ ] JWT token required ✅
- [ ] Expired tokens rejected 🔴
- [ ] CSP headers present ✅

### Secret Rotation
- [ ] Can rotate JWT_SECRET 🔄
- [ ] Old tokens invalidated 🔴
- [ ] New tokens work ✅

### Database & Logging
- [ ] Database file exists ✅
- [ ] Audit logs working ✅
- [ ] File permissions secure ✅

### Error Handling
- [ ] Graceful error messages ✅
- [ ] 404 for missing routes ✅

---

## Troubleshooting

### Server won't start

**Check:**
1. Is `.env.local` present?
2. Are all required variables set?
3. Is JWT_SECRET strong enough (32+ characters)?
4. Are ports available (3001, 5173)?

**Fix:**
```bash
cp .env.example .env.local
# Edit .env.local with proper values
npm run dev
```

---

### Validation errors

**Check validation middleware:**
```bash
grep -r "validateBody\|validateParams\|validateQuery" server/routes/
```

**Should show validation on all POST/PUT routes**

---

### Tokens not working

**Regenerate token:**
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@clawops.local","password":"changeme123"}'
```

---

### Database errors

**Check database file:**
```bash
sqlite3 data/clawops.db ".tables"
```

**Should show:**
```
agents          chat_messages   runs
audit_log       chat_threads    settings
credentials     users
```

**Reset database (if needed):**
```bash
mv data/clawops.db data/clawops.db.old
npm run dev  # Will recreate database
```

---

## Next Steps

After all tests pass:

1. **Commit your changes** (if using git):
   ```bash
   git add .
   git commit -m "Phase 0 complete: Security hardening and validation"
   ```

2. **Update .env.local** for production:
   - Rotate all secrets
   - Update admin password
   - Get new OpenAI API key

3. **Continue Phase 0**:
   - Setup HTTPS/TLS
   - Create unit tests
   - Implement automated backups
   - Add structured logging

4. **Or proceed to Phase 1**:
   - UX improvements (real-time metrics, toast notifications, theme system)

---

## Success Criteria

**All tests should pass ✅**

Your ClawOps Console is now:
- ✅ Protected against command injection
- ✅ Protected against weak secrets
- ✅ Validating all user input
- ✅ Enforcing strong authentication
- ✅ Logging all API calls
- ✅ Running with secure configuration

**You're ready for production deployment!** 🎉

(After completing remaining Phase 0 tasks: HTTPS, backups, logging)
