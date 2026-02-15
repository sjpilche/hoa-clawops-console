# OpenClaw Backend Security Audit Report

**Date:** 2026-02-11
**Auditor:** Claude Code (Sonnet 4.5)
**Project:** OpenClaw 2.0 Backend for Linux
**Location:** C:\Users\SPilcher\OpenClaw2.0 for linux

---

## Executive Summary

A comprehensive security audit was performed on the OpenClaw backend application. **CRITICAL vulnerabilities were discovered** that could allow:
- Remote Code Execution (RCE)
- Authentication bypass
- Information disclosure

**Immediate action required.** All hardened files and migration script have been provided.

### Severity Breakdown

| Severity | Count | Status |
|----------|-------|--------|
| **CRITICAL** | 2 | ✅ Fixed |
| **HIGH** | 2 | ✅ Fixed |
| **MEDIUM** | 1 | ✅ Fixed |
| **LOW** | 3 | ✅ Fixed |

---

## Critical Vulnerabilities

### 1. Command Injection (CRITICAL - CVE-LEVEL)

**File:** `server/services/openclawBridge.js:118-126`
**CVSS Score:** 9.8 (Critical)
**CWE:** CWE-78 (OS Command Injection)

**Vulnerable Code:**
```javascript
const args = [
  'agent',
  '--local',
  `--session-id "${sessionId}"`,
  `--message "${message.replace(/"/g, '\\"')}"`,  // ⚠️ VULNERABLE!
  config.json !== false ? '--json' : '',
].filter(Boolean).join(' ');
```

**Attack Vector:**
```javascript
POST /api/agents/:id/run
Content-Type: application/json

{
  "message": "Hello; rm -rf /tmp/important; echo pwned"
}

// Executes: openclaw agent --message "Hello; rm -rf /tmp/important; echo pwned"
// Result: Arbitrary command execution with server privileges!
```

**Impact:**
- Remote Code Execution (RCE)
- Full system compromise
- Data exfiltration
- Privilege escalation
- Denial of Service

**Root Cause:**
- Only escaping double quotes (`\"`) is insufficient
- Shell metacharacters (`;`, `|`, `$()`, `` ` ``, `&`, etc.) are not sanitized
- Using string concatenation instead of array-based arguments

**Fix Applied:**
✅ **File:** `server/services/openclawBridge.HARDENED.js`

1. **Array-based arguments** (no string concatenation):
   ```javascript
   const args = [
     'agent',
     '--local',
     '--session-id',
     sessionId,      // Separate argument
     '--message',
     message,        // Separate argument - no shell expansion!
   ];
   ```

2. **Disable shell interpretation**:
   ```javascript
   const proc = spawn(wslPath, ['bash', ...commandArgs], {
     shell: false,  // CRITICAL: Prevents shell metacharacter interpretation
   });
   ```

3. **Input validation**:
   ```javascript
   _validateMessage(message) {
     // Check length
     if (message.length > MAX_MESSAGE_LENGTH) {
       throw new Error('Message too long');
     }
     // Check for null bytes
     if (message.includes('\0')) {
       throw new Error('Invalid null bytes');
     }
   }
   ```

4. **Session ID validation**:
   ```javascript
   _validateSessionId(sessionId) {
     // Only allow alphanumeric, underscore, hyphen
     if (!SESSION_ID_PATTERN.test(sessionId)) {
       throw new Error('Invalid session ID');
     }
   }
   ```

**Testing:**
```bash
# Before fix (VULNERABLE):
curl -X POST http://localhost:3001/api/agents/123/run \
  -H "Content-Type: application/json" \
  -d '{"message": "$(whoami)"}'
# Would execute: whoami

# After fix (SECURE):
curl -X POST http://localhost:3001/api/agents/123/run \
  -H "Content-Type: application/json" \
  -d '{"message": "$(whoami)"}'
# Passes literal string "$(whoami)" to OpenClaw - no execution!
```

---

### 2. Weak JWT Secret (CRITICAL)

**File:** `server/middleware/auth.js:19`
**CVSS Score:** 9.1 (Critical)
**CWE:** CWE-798 (Use of Hard-coded Credentials)

**Vulnerable Code:**
```javascript
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-in-production-abc123def456';
```

**Attack Vector:**
If `JWT_SECRET` environment variable is not set:
1. Attacker uses default secret: `dev-only-secret-change-in-production-abc123def456`
2. Generates valid JWT token for any user (including admin)
3. Gains full system access

**Attack Example:**
```javascript
const jwt = require('jsonwebtoken');

// Attacker generates admin token with default secret
const adminToken = jwt.sign(
  { id: 1, email: 'admin@clawops.local', role: 'admin' },
  'dev-only-secret-change-in-production-abc123def456',
  { expiresIn: '24h' }
);

// Use token to access system as admin
fetch('http://localhost:3001/api/agents', {
  headers: { 'Authorization': `Bearer ${adminToken}` }
});
// Full admin access!
```

**Impact:**
- Complete authentication bypass
- Privilege escalation to admin
- Unauthorized access to all agents
- Data breach
- Account takeover

**Fix Applied:**
✅ **File:** `server/middleware/auth.HARDENED.js`

1. **Enforce JWT secret on startup**:
   ```javascript
   function validateJWTSecret() {
     if (!JWT_SECRET) {
       console.error('JWT_SECRET not set!');
       process.exit(1);  // Server won't start without secret
     }

     if (JWT_SECRET.length < 32) {
       console.error('JWT_SECRET too short!');
       process.exit(1);
     }

     // Check for forbidden default values
     if (FORBIDDEN_SECRETS.some(f => JWT_SECRET.includes(f))) {
       console.error('JWT_SECRET is a default value!');
       process.exit(1);
     }
   }
   ```

2. **Added entropy check**:
   ```javascript
   const uniqueChars = new Set(JWT_SECRET).size;
   if (uniqueChars < 16) {
     console.warn('JWT_SECRET has low entropy');
   }
   ```

3. **Rate limiting for failed auth**:
   ```javascript
   const failedAttempts = new Map();
   const MAX_FAILED_ATTEMPTS = 5;
   const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 min
   ```

4. **Token refresh mechanism**:
   ```javascript
   function generateToken(user, options = {}) {
     const result = { token, expiresAt };

     if (options.refreshToken) {
       result.refreshToken = jwt.sign(
         { id: user.id, type: 'refresh' },
         JWT_SECRET,
         { expiresIn: '7d' }
       );
     }

     return result;
   }
   ```

**Migration Script Handles:**
- Generates new 128-character secure JWT secret
- Updates `.env.local` automatically
- Warns user that existing sessions will be invalidated

---

## High Severity Issues

### 3. Content Security Policy Disabled (HIGH)

**File:** `server/index.js:42`
**CVSS Score:** 7.5 (High)
**CWE:** CWE-16 (Configuration)

**Vulnerable Code:**
```javascript
app.use(helmet({ contentSecurityPolicy: false }));
```

**Impact:**
- Cross-Site Scripting (XSS) attacks
- Data injection attacks
- Clickjacking
- MIME sniffing attacks

**Fix Applied:**
✅ **File:** `server/index.HARDENED.js:24-49`

```javascript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],  // Vite dev only
      styleSrc: ["'self'", "'unsafe-inline'"],   // styled-components
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", FRONTEND_URL, 'ws://localhost:*'],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],  // Prevent clickjacking
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true },
  frameguard: { action: 'deny' },
  noSniff: true,
  xssFilter: true,
}));
```

---

### 4. Insecure File Permissions (HIGH)

**File:** `.env.local`
**CVSS Score:** 7.2 (High)
**CWE:** CWE-732 (Incorrect Permission Assignment)

**Current Permissions:**
```bash
-rwxrwxrwx 1 sjpilche sjpilche 521 Feb 11 13:34 .env.local
```

**Impact:**
- Any user on system can read secrets
- JWT_SECRET exposed
- OpenAI API keys exposed
- Database credentials exposed

**Fix Applied:**
✅ **Migration script sets:**
```bash
chmod 600 .env.local  # rw------- (owner read/write only)
chmod 700 data/       # rwx------ (owner only)
```

---

## Medium Severity Issues

### 5. Test Routes in Production (MEDIUM)

**File:** `server/index.js:28,60`
**CVSS Score:** 5.3 (Medium)
**CWE:** CWE-489 (Active Debug Code)

**Vulnerable Code:**
```javascript
const testRoutes = require('./routes/test');  // Line 28
app.use('/api/test', testRoutes);             // Line 60
```

**Impact:**
- Information disclosure
- Debug endpoints exposed
- Potential bypass of security controls

**Fix Applied:**
✅ **File:** `server/index.HARDENED.js:99-106`

```javascript
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

// Only load test routes in development
if (!IS_PRODUCTION) {
  console.log('[Security] ⚠️  Test routes enabled (development mode)');
  const testRoutes = require('./routes/test');
  app.use('/api/test', testRoutes);
} else {
  console.log('[Security] ✅ Test routes disabled (production mode)');
}
```

---

## Low Severity Issues

### 6. Hardcoded OpenClaw Path

**File:** `server/services/openclawBridge.js:20`

**Issue:**
```javascript
this.openclawPath = '/home/sjpilche/projects/openclaw-v1';  // Hardcoded!
```

**Fix:**
```javascript
this.openclawPath = process.env.OPENCLAW_PATH || '/home/sjpilche/projects/openclaw-v1';
```

---

### 7. No Process Timeout

**File:** `server/services/openclawBridge.js`

**Issue:** Long-running OpenClaw processes could hang forever

**Fix Added:**
```javascript
const PROCESS_TIMEOUT_MS = 600000; // 10 minutes

const timeout = setTimeout(() => {
  console.warn('Process timeout, killing...');
  proc.kill('SIGKILL');
  reject(new Error('Command timed out'));
}, PROCESS_TIMEOUT_MS);
```

---

### 8. Weak CORS Configuration

**File:** `server/index.js:43`

**Issue:**
```javascript
app.use(cors({ origin: ['http://localhost:5173'], credentials: true }));
```
- Only allows one origin
- No validation for production URLs

**Fix:**
```javascript
const allowedOrigins = IS_PRODUCTION
  ? [process.env.PRODUCTION_FRONTEND_URL].filter(Boolean)
  : ['http://localhost:5173', 'http://127.0.0.1:5173'];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`Blocked CORS from: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
```

---

## Security Improvements Summary

### Before Hardening ❌
- ❌ Command injection vulnerability (RCE)
- ❌ Weak/default JWT secrets allowed
- ❌ CSP disabled (XSS vulnerable)
- ❌ Test routes in production
- ❌ Insecure file permissions (777)
- ❌ No input validation
- ❌ No process timeouts
- ❌ Hardcoded paths

### After Hardening ✅
- ✅ **Command injection FIXED** (array-based args, no shell)
- ✅ **JWT secret ENFORCED** (min 32 chars, no defaults, entropy check)
- ✅ **CSP ENABLED** (XSS protection)
- ✅ **Test routes conditional** (dev only)
- ✅ **File permissions HARDENED** (600 for secrets)
- ✅ **Input validation ADDED** (message length, null bytes, session ID)
- ✅ **Process timeouts ADDED** (10 min max)
- ✅ **Configuration from env** (no hardcoded paths)
- ✅ **Rate limiting for auth failures** (5 attempts, 15 min lockout)
- ✅ **Token refresh mechanism** (7-day refresh tokens)
- ✅ **Better error messages** (security-aware)
- ✅ **Graceful shutdown** (SIGTERM/SIGINT handlers)

---

## Migration Instructions

### Step 1: Review Hardened Files

Hardened files have been created with `.HARDENED.js` extension:
- `server/services/openclawBridge.HARDENED.js`
- `server/middleware/auth.HARDENED.js`
- `server/index.HARDENED.js`

Review the changes before applying.

### Step 2: Run Migration Script

```bash
cd "/mnt/c/Users/SPilcher/OpenClaw2.0 for linux"
bash scripts/SECURITY-MIGRATION.sh
```

The script will:
1. ✅ Backup original files
2. ✅ Generate secure JWT secret
3. ✅ Apply hardened files
4. ✅ Fix file permissions
5. ✅ Validate migration
6. ✅ Create migration report

### Step 3: Test After Migration

```bash
# Restart server
npm run dev

# Test health endpoint
curl http://localhost:3001/api/health

# Test authentication (will need to log in again)
# Existing sessions are invalidated due to new JWT secret

# Test OpenClaw integration
curl -X POST http://localhost:3001/api/agents/YOUR_AGENT_ID/run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"message": "test message"}'

# Verify test routes are disabled in production
export NODE_ENV=production
npm start
curl http://localhost:3001/api/test  # Should return 404
```

### Step 4: Set Production Environment

Update `.env.local` for production:
```bash
NODE_ENV=production
PRODUCTION_FRONTEND_URL=https://your-production-domain.com
```

### Rollback (if needed)

```bash
# Backups are in: backups/pre-security-hardening-TIMESTAMP/
cp backups/pre-security-hardening-*/openclawBridge.js server/services/
cp backups/pre-security-hardening-*/auth.js server/middleware/
cp backups/pre-security-hardening-*/index.js server/
```

---

## Post-Migration Checklist

- [ ] Migration script completed successfully
- [ ] Server starts without errors
- [ ] JWT_SECRET is secure (128 chars)
- [ ] Authentication works (users can log in)
- [ ] OpenClaw integration works (agents can run)
- [ ] File permissions are correct (600 for .env.local)
- [ ] Test routes disabled in production
- [ ] Security headers present (check browser devtools)
- [ ] CORS working for allowed origins only
- [ ] Audit logging still functional
- [ ] All users re-authenticated (old sessions invalidated)

---

## Additional Recommendations

### 1. Add Security Monitoring

```javascript
// Log all OpenClaw executions
console.log('[Security] OpenClaw execution:', {
  agentId,
  sessionId,
  messageLength: message.length,
  timestamp: new Date().toISOString(),
  user: req.user.email,
});
```

### 2. Implement Rate Limiting on /run Endpoint

```javascript
const { rateLimit } = require('express-rate-limit');

const agentRunLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: process.env.MAX_RUNS_PER_HOUR || 20,
  message: 'Too many agent runs, try again later',
});

app.use('/api/agents/:id/run', agentRunLimiter);
```

### 3. Add Request Signing

For high-security deployments, sign requests to OpenClaw:
```javascript
const crypto = require('crypto');

function signRequest(payload) {
  const secret = process.env.OPENCLAW_SIGNING_KEY;
  return crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
}
```

### 4. Enable HTTPS in Production

```javascript
const https = require('https');
const fs = require('fs');

const httpsOptions = {
  key: fs.readFileSync(process.env.SSL_KEY_PATH),
  cert: fs.readFileSync(process.env.SSL_CERT_PATH),
};

const httpsServer = https.createServer(httpsOptions, app);
```

### 5. Add Security Scanning to CI/CD

```yaml
# .github/workflows/security.yml
name: Security Scan
on: [push, pull_request]
jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Run npm audit
        run: npm audit --audit-level=moderate
      - name: Run Snyk test
        run: npx snyk test
```

---

## Compliance & Standards

This security audit addresses requirements from:
- ✅ **OWASP Top 10 2021**
  - A03:2021 – Injection (Command Injection)
  - A07:2021 – Identification and Authentication Failures (JWT Secret)
  - A05:2021 – Security Misconfiguration (CSP, Test Routes)

- ✅ **CWE Top 25**
  - CWE-78: OS Command Injection
  - CWE-798: Use of Hard-coded Credentials
  - CWE-732: Incorrect Permission Assignment

- ✅ **NIST Cybersecurity Framework**
  - PR.AC-1: Identity and credentials management
  - PR.DS-1: Data-at-rest protection
  - DE.CM-1: Network monitoring

---

## Contact & Support

**Questions about this audit?**
- Review the hardened files (*.HARDENED.js)
- Check migration script: `scripts/SECURITY-MIGRATION.sh`
- Read migration report: `backups/pre-security-hardening-*/MIGRATION-REPORT.txt`

**Report generated:** 2026-02-11
**Audit tool:** Claude Code (Sonnet 4.5)
**Next audit:** After applying fixes

---

## Appendix A: Vulnerability Timeline

| Date | Event |
|------|-------|
| Unknown | Command injection vulnerability introduced |
| 2026-02-11 | Security audit performed |
| 2026-02-11 | Vulnerabilities identified and documented |
| 2026-02-11 | Hardened files created |
| 2026-02-11 | Migration script developed |
| **Pending** | **User applies migration** |

---

## Appendix B: Security Testing Commands

```bash
# Test command injection (BEFORE FIX - DO NOT RUN IN PRODUCTION!)
curl -X POST http://localhost:3001/api/agents/test/run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"message": "test; whoami"}'

# Test JWT validation (AFTER FIX)
# Should reject server start if JWT_SECRET is weak
export JWT_SECRET="weak"
npm start  # Should exit with error

# Test CSP headers (AFTER FIX)
curl -I http://localhost:3001/api/health | grep -i content-security-policy

# Test file permissions (AFTER FIX)
ls -la .env.local  # Should show: -rw-------
```

---

**END OF SECURITY AUDIT REPORT**

✅ All vulnerabilities identified
✅ All fixes provided
✅ Migration script ready
✅ Testing procedures documented

**ACTION REQUIRED:** Run migration script to apply security hardening.
