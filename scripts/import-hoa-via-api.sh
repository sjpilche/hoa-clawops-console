#!/bin/bash
# Import HOA agents via ClawOps API (so they persist properly)

API="http://localhost:3001/api"

# Login and get token
echo "🔐 Logging in..."
TOKEN=$(curl -s -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@clawops.local","password":"changeme123"}' \
  | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ Login failed"
  exit 1
fi

echo "✅ Logged in"
echo ""

# Read SOUL.md files from WSL
echo "📖 Reading HOA Content Writer SOUL.md..."
SOUL_CONTENT=$(wsl bash -c "cat /home/sjpilche/projects/openclaw-v1/workspaces/hoa-content-writer/SOUL.md 2>/dev/null | head -c 4999" | tr '\n' ' ' | sed 's/"/\\"/g')

echo "📦 Creating HOA Content Writer agent..."
curl -s -X POST "$API/agents" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"name\": \"HOA Content Writer\",
    \"description\": \"Creates outreach emails and trigger-specific explainers for HOA leads\",
    \"target_system\": \"Web Browser + Email\",
    \"permissions\": \"read-write\",
    \"domains\": [\"hoafinancial.com\", \"gmail.com\"],
    \"instructions\": \"Agent for creating personalized outreach content and explainer articles for HOA projects.\",
    \"config\": {
      \"soul_enabled\": true,
      \"openclaw_id\": \"hoa-content-writer\",
      \"openclaw_workspace\": \"/home/sjpilche/projects/openclaw-v1/workspaces/hoa-content-writer\",
      \"task\": {
        \"message\": \"Create personalized outreach content for hot leads or trigger-specific explainer articles.\",
        \"schedule\": { \"enabled\": false }
      },
      \"advanced\": {
        \"maxDurationSeconds\": 300,
        \"maxCostUSD\": 5,
        \"maxTokens\": 100000,
        \"notifyOnComplete\": true
      }
    }
  }" > /dev/null 2>&1

if [ $? -eq 0 ]; then
  echo "✅ HOA Content Writer created"
else
  echo "⚠️  HOA Content Writer may already exist or failed"
fi

echo ""
echo "📦 Creating HOA Email Campaigns agent..."
curl -s -X POST "$API/agents" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"name\": \"HOA Email Campaigns\",
    \"description\": \"Manages 2-touch follow-up sequences for hot HOA leads\",
    \"target_system\": \"Email + CRM\",
    \"permissions\": \"read-write\",
    \"domains\": [\"hoafinancial.com\", \"gmail.com\"],
    \"instructions\": \"Agent for creating and managing 2-touch email sequences for hot leads.\",
    \"config\": {
      \"soul_enabled\": true,
      \"openclaw_id\": \"hoa-email-campaigns\",
      \"openclaw_workspace\": \"/home/sjpilche/projects/openclaw-v1/workspaces/hoa-email-campaigns\",
      \"task\": {
        \"message\": \"Create and send 2-touch email sequences for hot leads.\",
        \"schedule\": { \"enabled\": false }
      },
      \"advanced\": {
        \"maxDurationSeconds\": 180,
        \"maxCostUSD\": 3,
        \"maxTokens\": 50000,
        \"notifyOnComplete\": true
      }
    }
  }" > /dev/null 2>&1

if [ $? -eq 0 ]; then
  echo "✅ HOA Email Campaigns created"
else
  echo "⚠️  HOA Email Campaigns may already exist or failed"
fi

echo ""
echo "✅ Import complete!"
echo "🌐 Refresh http://localhost:5180 to see your agents"
