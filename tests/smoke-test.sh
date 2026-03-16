#!/bin/bash
# =============================================================================
# OpenClaw 2.0 — End-to-End Smoke Test
# =============================================================================
# Verifies all services, endpoints, and critical paths are functional.
# Run after deployment or significant code changes.
#
# Usage: bash tests/smoke-test.sh
# Requires: server running on :3001, curl, jq (optional)
# =============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0
BASE="http://localhost:3001"

pass() { echo -e "  ${GREEN}[PASS]${NC} $1"; ((PASS++)); }
fail() { echo -e "  ${RED}[FAIL]${NC} $1"; ((FAIL++)); }
warn() { echo -e "  ${YELLOW}[WARN]${NC} $1"; ((WARN++)); }

check_status() {
  local url=$1
  local desc=$2
  local expected=${3:-200}
  local code=$(curl -sf -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || echo "000")
  if [[ "$code" == "$expected" ]]; then
    pass "$desc (HTTP $code)"
  elif [[ "$code" == "000" ]]; then
    fail "$desc — server not responding"
  else
    fail "$desc — expected $expected, got $code"
  fi
}

check_json() {
  local url=$1
  local desc=$2
  local field=$3
  local response=$(curl -sf "$url" 2>/dev/null)
  if [[ -z "$response" ]]; then
    fail "$desc — no response"
    return
  fi
  if echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); assert '$field' in d" 2>/dev/null; then
    pass "$desc"
  else
    fail "$desc — missing field '$field'"
  fi
}

# Get auth token
echo ""
echo "=== Getting auth token ==="
TOKEN=$(curl -sf -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@clawops.local","password":"changeme123"}' 2>/dev/null \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)

if [[ -z "$TOKEN" ]]; then
  fail "Login failed — cannot continue"
  echo ""
  echo "Results: $PASS passed, $FAIL failed, $WARN warnings"
  exit 1
fi
pass "Login successful"

AUTH="-H 'Authorization: Bearer $TOKEN'"

# =============================================================================
echo ""
echo "=== Core Services ==="
# =============================================================================

check_status "$BASE/api/health" "Health endpoint"
check_json "$BASE/api/health" "Health has components" "components"

# =============================================================================
echo ""
echo "=== Agent Fleet ==="
# =============================================================================

AGENT_COUNT=$(curl -sf "$BASE/api/agents" -H "Authorization: Bearer $TOKEN" 2>/dev/null \
  | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
if [[ "$AGENT_COUNT" -gt 50 ]]; then
  pass "Agents loaded: $AGENT_COUNT"
else
  fail "Expected 50+ agents, got $AGENT_COUNT"
fi

# =============================================================================
echo ""
echo "=== Schedules ==="
# =============================================================================

SCHED_COUNT=$(curl -sf "$BASE/api/schedules" -H "Authorization: Bearer $TOKEN" 2>/dev/null \
  | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
if [[ "$SCHED_COUNT" -gt 40 ]]; then
  pass "Schedules loaded: $SCHED_COUNT"
else
  fail "Expected 40+ schedules, got $SCHED_COUNT"
fi

# =============================================================================
echo ""
echo "=== Revenue API ==="
# =============================================================================

check_auth_status() {
  local url=$1
  local desc=$2
  local code=$(curl -sf -o /dev/null -w '%{http_code}' "$url" -H "Authorization: Bearer $TOKEN" 2>/dev/null || echo "000")
  if [[ "$code" == "200" ]]; then
    pass "$desc (HTTP $code)"
  elif [[ "$code" == "000" ]]; then
    fail "$desc — server not responding"
  else
    fail "$desc — expected 200, got $code"
  fi
}

check_auth_status "$BASE/api/revenue/funnel" "Revenue funnel"
check_auth_status "$BASE/api/revenue/funnel/hoa" "HOA funnel"
check_auth_status "$BASE/api/revenue/agents" "Agent ROI"
check_auth_status "$BASE/api/revenue/variants" "A/B variants"
check_auth_status "$BASE/api/revenue/engagement" "Engagement leaderboard"
check_auth_status "$BASE/api/revenue/cycle-time" "Cycle time"
check_auth_status "$BASE/api/revenue/content" "Content performance"

# =============================================================================
echo ""
echo "=== Lead Capture (Public) ==="
# =============================================================================

# Test newsletter signup
NEWSLETTER_RESULT=$(curl -sf -X POST "$BASE/api/capture/newsletter" \
  -H "Content-Type: application/json" \
  -d '{"email":"smoketest@test.com","name":"Smoke Test"}' 2>/dev/null)
if echo "$NEWSLETTER_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('status') in ['subscribed','already_subscribed']" 2>/dev/null; then
  pass "Newsletter signup works"
else
  fail "Newsletter signup failed: $NEWSLETTER_RESULT"
fi

# Test lead capture
CAPTURE_RESULT=$(curl -sf -X POST "$BASE/api/capture/lead" \
  -H "Content-Type: application/json" \
  -d '{"email":"smoketest-lead@test.com","name":"Smoke Lead","company":"Test GC","source":"smoke_test","product":"jake"}' 2>/dev/null)
if echo "$CAPTURE_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('status') in ['captured','existing_lead_updated']" 2>/dev/null; then
  pass "Lead capture works"
else
  fail "Lead capture failed: $CAPTURE_RESULT"
fi

# Test capture stats (requires auth)
check_auth_status "$BASE/api/capture/stats" "Capture stats"

# =============================================================================
echo ""
echo "=== Brain & Pipeline ==="
# =============================================================================

check_auth_status "$BASE/api/brain/status" "Brain status"
check_auth_status "$BASE/api/pipeline/health" "Pipeline health"
check_auth_status "$BASE/api/dashboard" "Dashboard data"

# =============================================================================
echo ""
echo "=== Discord ==="
# =============================================================================

check_auth_status "$BASE/api/discord/status" "Discord status"

# =============================================================================
echo ""
echo "=== External Services ==="
# =============================================================================

# Ollama
OLLAMA=$(curl -sf "http://127.0.0.1:11434/api/tags" 2>/dev/null)
if [[ -n "$OLLAMA" ]]; then
  MODEL_COUNT=$(echo "$OLLAMA" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('models',[])))" 2>/dev/null || echo "0")
  pass "Ollama running ($MODEL_COUNT models)"
else
  warn "Ollama not responding on :11434"
fi

# Playwright health
check_status "$BASE/api/health/playwright" "Playwright pool" 200

# =============================================================================
echo ""
echo "=== Results ==="
echo "============================================================"
echo -e "  ${GREEN}Passed: $PASS${NC}"
echo -e "  ${RED}Failed: $FAIL${NC}"
echo -e "  ${YELLOW}Warnings: $WARN${NC}"
echo "============================================================"

if [[ $FAIL -gt 0 ]]; then
  echo -e "${RED}Some tests failed. Check output above.${NC}"
  exit 1
else
  echo -e "${GREEN}All tests passed!${NC}"
  exit 0
fi
