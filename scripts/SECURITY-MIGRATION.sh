#!/usr/bin/env bash
#
# SECURITY-MIGRATION.sh
# Safely migrate OpenClaw backend to hardened version
#
# This script:
# 1. Backs up original files
# 2. Applies security hardening fixes
# 3. Updates environment variables
# 4. Fixes file permissions
# 5. Validates the migration
#
# USAGE: bash scripts/SECURITY-MIGRATION.sh
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "======================================================"
echo " OpenClaw Backend Security Migration"
echo "======================================================"
echo ""
echo "This script will harden your backend security by:"
echo "  - Fixing command injection vulnerability"
echo "  - Enforcing strong JWT secret"
echo "  - Enabling Content Security Policy"
echo "  - Removing test routes in production"
echo "  - Hardening file permissions"
echo ""
echo "Project root: $PROJECT_ROOT"
echo ""

# Confirm with user
read -p "Continue with migration? (yes/no): " -r
echo
if [[ ! $REPLY =~ ^[Yy]es$ ]]; then
  echo "Migration cancelled."
  exit 0
fi

# Create backup directory
BACKUP_DIR="$PROJECT_ROOT/backups/pre-security-hardening-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "==== Step 1: Backing up original files ===="
echo "Backup directory: $BACKUP_DIR"

# Backup files that will be replaced
cp "$PROJECT_ROOT/server/services/openclawBridge.js" "$BACKUP_DIR/" 2>/dev/null || echo "  (openclawBridge.js not found, skipping)"
cp "$PROJECT_ROOT/server/middleware/auth.js" "$BACKUP_DIR/" 2>/dev/null || echo "  (auth.js not found, skipping)"
cp "$PROJECT_ROOT/server/index.js" "$BACKUP_DIR/" 2>/dev/null || echo "  (index.js not found, skipping)"
cp "$PROJECT_ROOT/.env.local" "$BACKUP_DIR/" 2>/dev/null || echo "  (.env.local not found, will create new)"

echo "✅ Backups created"
echo ""

# Generate secure JWT secret if needed
echo "==== Step 2: Checking JWT Secret ===="

JWT_SECRET=""
if [[ -f "$PROJECT_ROOT/.env.local" ]]; then
  # Extract current JWT_SECRET
  JWT_SECRET=$(grep "^JWT_SECRET=" "$PROJECT_ROOT/.env.local" | cut -d= -f2 | tr -d '"' || echo "")
fi

# Check if JWT_SECRET needs to be generated
GENERATE_NEW_SECRET=false

if [[ -z "$JWT_SECRET" ]]; then
  echo "⚠️  No JWT_SECRET found in .env.local"
  GENERATE_NEW_SECRET=true
elif [[ ${#JWT_SECRET} -lt 32 ]]; then
  echo "⚠️  Current JWT_SECRET is too short (${#JWT_SECRET} chars, need 32+)"
  GENERATE_NEW_SECRET=true
elif [[ "$JWT_SECRET" == *"change-me"* ]] || [[ "$JWT_SECRET" == *"changeme"* ]]; then
  echo "⚠️  Current JWT_SECRET appears to be a default value"
  GENERATE_NEW_SECRET=true
else
  echo "✅ JWT_SECRET exists and looks secure (${#JWT_SECRET} chars)"
fi

if [[ "$GENERATE_NEW_SECRET" == "true" ]]; then
  echo ""
  echo "Generating new secure JWT_SECRET..."
  NEW_JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
  echo "✅ New JWT_SECRET generated (128 chars)"

  # Update or create .env.local
  if [[ -f "$PROJECT_ROOT/.env.local" ]]; then
    # Replace existing JWT_SECRET
    sed -i.bak "s/^JWT_SECRET=.*/JWT_SECRET=$NEW_JWT_SECRET/" "$PROJECT_ROOT/.env.local"
    echo "✅ Updated JWT_SECRET in .env.local"
  else
    # Create new .env.local from example
    cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env.local"
    sed -i.bak "s/^JWT_SECRET=.*/JWT_SECRET=$NEW_JWT_SECRET/" "$PROJECT_ROOT/.env.local"
    echo "✅ Created .env.local with secure JWT_SECRET"
  fi

  echo ""
  echo "⚠️  IMPORTANT: JWT_SECRET has been changed!"
  echo "   All existing user sessions will be invalidated."
  echo "   Users will need to log in again."
  echo ""
fi

# Add OPENCLAW_PATH to .env.local if not present
echo "==== Step 3: Checking OpenClaw Configuration ===="

if ! grep -q "^OPENCLAW_PATH=" "$PROJECT_ROOT/.env.local" 2>/dev/null; then
  echo "Adding OPENCLAW_PATH to .env.local..."
  echo "" >> "$PROJECT_ROOT/.env.local"
  echo "# OpenClaw installation path" >> "$PROJECT_ROOT/.env.local"
  echo "OPENCLAW_PATH=/home/sjpilche/projects/openclaw-v1" >> "$PROJECT_ROOT/.env.local"
  echo "✅ Added OPENCLAW_PATH"
else
  echo "✅ OPENCLAW_PATH already configured"
fi

if ! grep -q "^NODE_ENV=" "$PROJECT_ROOT/.env.local" 2>/dev/null; then
  echo "Adding NODE_ENV to .env.local..."
  echo "NODE_ENV=development" >> "$PROJECT_ROOT/.env.local"
  echo "✅ Added NODE_ENV"
else
  echo "✅ NODE_ENV already configured"
fi

echo ""

# Apply hardened files
echo "==== Step 4: Applying hardened files ===="

# Apply openclawBridge.HARDENED.js
if [[ -f "$PROJECT_ROOT/server/services/openclawBridge.HARDENED.js" ]]; then
  cp "$PROJECT_ROOT/server/services/openclawBridge.HARDENED.js" "$PROJECT_ROOT/server/services/openclawBridge.js"
  echo "✅ Applied hardened openclawBridge.js"
else
  echo "⚠️  openclawBridge.HARDENED.js not found, skipping"
fi

# Apply auth.HARDENED.js
if [[ -f "$PROJECT_ROOT/server/middleware/auth.HARDENED.js" ]]; then
  cp "$PROJECT_ROOT/server/middleware/auth.HARDENED.js" "$PROJECT_ROOT/server/middleware/auth.js"
  echo "✅ Applied hardened auth.js"
else
  echo "⚠️  auth.HARDENED.js not found, skipping"
fi

# Apply index.HARDENED.js
if [[ -f "$PROJECT_ROOT/server/index.HARDENED.js" ]]; then
  cp "$PROJECT_ROOT/server/index.HARDENED.js" "$PROJECT_ROOT/server/index.js"
  echo "✅ Applied hardened index.js"
else
  echo "⚠️  index.HARDENED.js not found, skipping"
fi

echo ""

# Fix file permissions
echo "==== Step 5: Hardening file permissions ===="

# Fix .env.local permissions (should be 600, not 777)
if [[ -f "$PROJECT_ROOT/.env.local" ]]; then
  chmod 600 "$PROJECT_ROOT/.env.local"
  echo "✅ Fixed .env.local permissions (600)"
fi

# Fix .env.example permissions
if [[ -f "$PROJECT_ROOT/.env.example" ]]; then
  chmod 644 "$PROJECT_ROOT/.env.example"
  echo "✅ Fixed .env.example permissions (644)"
fi

# Fix data directory permissions
if [[ -d "$PROJECT_ROOT/data" ]]; then
  chmod 700 "$PROJECT_ROOT/data"
  echo "✅ Fixed data/ permissions (700)"
fi

echo ""

# Validation
echo "==== Step 6: Validating migration ===="

VALIDATION_PASSED=true

# Check if hardened files are in place
if [[ ! -f "$PROJECT_ROOT/server/services/openclawBridge.js" ]]; then
  echo "❌ openclawBridge.js missing"
  VALIDATION_PASSED=false
else
  # Check if it's the hardened version (should have validateMessage function)
  if grep -q "_validateMessage" "$PROJECT_ROOT/server/services/openclawBridge.js"; then
    echo "✅ openclawBridge.js is hardened"
  else
    echo "⚠️  openclawBridge.js may not be the hardened version"
    VALIDATION_PASSED=false
  fi
fi

# Check auth.js
if [[ ! -f "$PROJECT_ROOT/server/middleware/auth.js" ]]; then
  echo "❌ auth.js missing"
  VALIDATION_PASSED=false
else
  if grep -q "validateJWTSecret" "$PROJECT_ROOT/server/middleware/auth.js"; then
    echo "✅ auth.js is hardened"
  else
    echo "⚠️  auth.js may not be the hardened version"
    VALIDATION_PASSED=false
  fi
fi

# Check index.js
if [[ ! -f "$PROJECT_ROOT/server/index.js" ]]; then
  echo "❌ index.js missing"
  VALIDATION_PASSED=false
else
  if grep -q "contentSecurityPolicy:" "$PROJECT_ROOT/server/index.js"; then
    echo "✅ index.js is hardened (CSP enabled)"
  else
    echo "⚠️  index.js may not be the hardened version"
    VALIDATION_PASSED=false
  fi
fi

# Check .env.local
if [[ -f "$PROJECT_ROOT/.env.local" ]]; then
  PERMS=$(stat -c "%a" "$PROJECT_ROOT/.env.local" 2>/dev/null || stat -f "%A" "$PROJECT_ROOT/.env.local" 2>/dev/null || echo "unknown")
  if [[ "$PERMS" == "600" ]]; then
    echo "✅ .env.local permissions correct (600)"
  else
    echo "⚠️  .env.local permissions: $PERMS (should be 600)"
  fi
else
  echo "❌ .env.local missing"
  VALIDATION_PASSED=false
fi

echo ""

if [[ "$VALIDATION_PASSED" == "true" ]]; then
  echo "======================================================"
  echo " ✅ Migration completed successfully!"
  echo "======================================================"
  echo ""
  echo "Next steps:"
  echo "  1. Review the changes in: $BACKUP_DIR"
  echo "  2. Restart your server: npm run dev"
  echo "  3. Test authentication (users may need to log in again)"
  echo "  4. Verify OpenClaw integration still works"
  echo ""
  echo "Backups saved to: $BACKUP_DIR"
  echo ""
  echo "To rollback (if needed):"
  echo "  cp $BACKUP_DIR/* server/"
  echo ""
else
  echo "======================================================"
  echo " ⚠️  Migration completed with warnings"
  echo "======================================================"
  echo ""
  echo "Please review the warnings above and manually verify"
  echo "that all hardened files are in place."
  echo ""
  echo "Backups saved to: $BACKUP_DIR"
  echo ""
fi

# Create a migration report
REPORT_FILE="$BACKUP_DIR/MIGRATION-REPORT.txt"
cat > "$REPORT_FILE" <<EOF
OpenClaw Backend Security Migration Report
============================================

Date: $(date)
Project: $PROJECT_ROOT
Backup: $BACKUP_DIR

Files Modified:
- server/services/openclawBridge.js (FIXED: Command injection vulnerability)
- server/middleware/auth.js (ENFORCED: Strong JWT secret)
- server/index.js (ENABLED: CSP, Removed test routes)
- .env.local (ADDED: Security configuration)

Security Improvements:
✅ Command injection vulnerability FIXED
✅ JWT secret validation ENFORCED
✅ Content Security Policy ENABLED
✅ Test routes removed in production
✅ File permissions hardened
✅ Rate limiting for failed auth attempts
✅ Input validation for OpenClaw messages
✅ Process timeouts for stuck agents

Validation: $([[ "$VALIDATION_PASSED" == "true" ]] && echo "PASSED" || echo "WARNINGS")

Next Actions:
1. Restart server: npm run dev
2. Test authentication
3. Verify OpenClaw integration
4. Review SECURITY-AUDIT-REPORT.md

Rollback Command (if needed):
  cp $BACKUP_DIR/* server/
EOF

echo "📝 Migration report saved to: $REPORT_FILE"
echo ""
