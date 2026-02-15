#!/bin/bash
# Comprehensive E2E Test Suite for ClawOps Console
# Tests all critical functionality end-to-end

BASE_URL="http://localhost:3001"
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper function to run a test
run_test() {
  local test_name=$1
  local command=$2
  local expected=$3

  TOTAL_TESTS=$((TOTAL_TESTS + 1))

  echo -e "\n${YELLOW}Test $TOTAL_TESTS: $test_name${NC}"
  result=$(eval "$command" 2>&1)

  if echo "$result" | grep -q "$expected"; then
    echo -e "${GREEN}✅ PASS${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
  else
    echo -e "${RED}❌ FAIL${NC}"
    echo "Expected: $expected"
    echo "Got: $result"
    FAILED_TESTS=$((FAILED_TESTS + 1))
  fi
}

echo "=========================================="
echo "ClawOps Console - E2E Test Suite"
echo "=========================================="
echo "Testing: $BASE_URL"
echo ""

# Test 1: Health Check
run_test "Health endpoint responds" \
  "curl -s $BASE_URL/api/health" \
  "status"

# Test 2: Readiness Check
run_test "Readiness probe returns ready:true" \
  "curl -s $BASE_URL/api/health/ready" \
  "ready.*true"

# Test 3: Liveness Check
run_test "Liveness probe returns alive:true" \
  "curl -s $BASE_URL/api/health/live" \
  "alive.*true"

# Test 4: Auth - Missing Token
run_test "Missing auth token is rejected" \
  "curl -s $BASE_URL/api/agents" \
  "AUTH_MISSING_TOKEN"

# Test 5: Auth - Valid Login
run_test "Valid login returns JWT token" \
  "curl -s -X POST $BASE_URL/api/auth/login -H 'Content-Type: application/json' -d '{\"email\":\"admin@clawops.local\",\"password\":\"changeme123\"}'" \
  "token"

# Get a valid token for subsequent tests
TOKEN=$(curl -s -X POST $BASE_URL/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@clawops.local","password":"changeme123"}' \
  | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo -e "${RED}❌ FATAL: Could not obtain JWT token. Cannot continue.${NC}"
  exit 1
fi

echo -e "\n${GREEN}✅ JWT Token obtained${NC}"

# Test 6: Agents - List All
run_test "List all agents with valid token" \
  "curl -s '$BASE_URL/api/agents' -H 'Authorization: Bearer $TOKEN'" \
  "agents"

# Test 7: Settings - Get All
run_test "Get system settings" \
  "curl -s '$BASE_URL/api/settings' -H 'Authorization: Bearer $TOKEN'" \
  "settings"

# Test 8: Security Headers - CSP
run_test "Content-Security-Policy header present" \
  "curl -sI '$BASE_URL/api/health' | grep -i 'Content-Security-Policy'" \
  "default-src"

# Test 9: Security Headers - X-Frame-Options
run_test "X-Frame-Options header present" \
  "curl -sI '$BASE_URL/api/health' | grep -i 'X-Frame-Options'" \
  "DENY"

# Test 10: Security Headers - HSTS
run_test "Strict-Transport-Security header present" \
  "curl -sI '$BASE_URL/api/health' | grep -i 'Strict-Transport-Security'" \
  "max-age"

# Test 11: Runs - List All
run_test "List all agent runs" \
  "curl -s '$BASE_URL/api/runs' -H 'Authorization: Bearer $TOKEN'" \
  "runs"

# Test 12: Audit Log - Recent Entries
run_test "Get recent audit log entries" \
  "curl -s '$BASE_URL/api/audit?limit=5' -H 'Authorization: Bearer $TOKEN'" \
  "audit"

# Test 13: Stats - Dashboard Stats
run_test "Get dashboard statistics" \
  "curl -s '$BASE_URL/api/stats' -H 'Authorization: Bearer $TOKEN'" \
  "stats"

# Summary
echo ""
echo "=========================================="
echo "Test Results Summary"
echo "=========================================="
echo -e "Total Tests:  $TOTAL_TESTS"
echo -e "${GREEN}Passed:       $PASSED_TESTS${NC}"
echo -e "${RED}Failed:       $FAILED_TESTS${NC}"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
  echo -e "${GREEN}🎉 ALL TESTS PASSED!${NC}"
  exit 0
else
  echo -e "${RED}❌ Some tests failed. Review output above.${NC}"
  exit 1
fi
