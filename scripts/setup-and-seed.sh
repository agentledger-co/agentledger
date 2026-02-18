#!/bin/bash
# AgentLedger - Quick Setup & Seed Script
# Run this after starting the dev server (npm run dev)

BASE_URL="${1:-http://localhost:3000}"
echo "🔧 AgentLedger Setup Script"
echo "Base URL: $BASE_URL"
echo ""

# Step 1: Create org and get API key
echo "📦 Creating organization..."
SETUP_RESPONSE=$(curl -s -X POST "$BASE_URL/api/setup" \
  -H "Content-Type: application/json" \
  -d '{"name": "Demo Organization"}')

API_KEY=$(echo $SETUP_RESPONSE | grep -o '"apiKey":"[^"]*"' | cut -d'"' -f4)
ORG_ID=$(echo $SETUP_RESPONSE | grep -o '"orgId":"[^"]*"' | cut -d'"' -f4)

if [ -z "$API_KEY" ]; then
  echo "❌ Failed to create organization"
  echo "Response: $SETUP_RESPONSE"
  exit 1
fi

echo "✅ Organization created: $ORG_ID"
echo "🔑 API Key: $API_KEY"
echo ""

# Step 2: Seed demo data
echo "🌱 Seeding demo data..."
SEED_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/seed" \
  -H "Authorization: Bearer $API_KEY")
echo "✅ $SEED_RESPONSE"
echo ""

# Step 3: Check stats
echo "📊 Fetching stats..."
STATS=$(curl -s "$BASE_URL/api/v1/stats" \
  -H "Authorization: Bearer $API_KEY")
echo "✅ Stats response (first 200 chars): ${STATS:0:200}..."
echo ""

# Step 4: Test action logging
echo "📝 Logging a test action..."
ACTION_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/actions" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent": "test-bot",
    "service": "slack",
    "action": "send_message",
    "status": "success",
    "duration_ms": 142,
    "metadata": {"channel": "#general", "message": "Hello from AgentLedger!"}
  }')
echo "✅ $ACTION_RESPONSE"
echo ""

# Step 5: Check agent status
echo "🤖 Checking test-bot status..."
AGENT_STATUS=$(curl -s "$BASE_URL/api/v1/agents/test-bot" \
  -H "Authorization: Bearer $API_KEY")
echo "✅ $AGENT_STATUS"
echo ""

# Step 6: Test pre-flight check
echo "🔍 Pre-flight check..."
CHECK_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/check" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"agent": "test-bot", "service": "slack", "action": "send_message"}')
echo "✅ $CHECK_RESPONSE"
echo ""

echo "=========================================="
echo "🎉 Setup complete!"
echo ""
echo "Your API Key (save this!):"
echo "  $API_KEY"
echo ""
echo "Dashboard: $BASE_URL/dashboard"
echo "  → Use 'I have a key' and paste your API key"
echo ""
echo "Or use in your agent:"
echo "  const ledger = new AgentLedger({ apiKey: '$API_KEY' });"
echo "=========================================="
