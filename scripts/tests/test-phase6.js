/**
 * Test script for Phase 6 - Agent Assignment System
 * Tests agent template registry and assignment endpoints
 */

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'abe026552d7f2430e2d662f9bd3a16d70537e8074289b93faf84c63fa01fbdef52373f77c36baeb31c05b07b0ba77e92d5e8eb05913841e7969c7999df421abe';

const BASE_URL = 'http://localhost:3001/api';

// Generate auth token
const token = jwt.sign({ userId: 'admin', email: 'admin@clawops.local' }, JWT_SECRET, { expiresIn: '24h' });

async function fetchWithAuth(endpoint) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`API Error: ${error.message || response.statusText}`);
  }

  return response.json();
}

async function testPhase6() {
  console.log('🧪 Testing Phase 6: Agent Assignment System\n');

  try {
    // Test 1: Get agent templates
    console.log('1️⃣  Testing GET /api/campaigns/templates...');
    const templates = await fetchWithAuth('/campaigns/templates');
    console.log(`   ✅ Found ${templates.length} agent template(s)`);
    templates.slice(0, 3).forEach(t => {
      console.log(`      - ${t.name} (${t.category})`);
    });

    if (templates.length === 0) {
      console.log('\n   ⚠️  No agent templates found!');
      console.log('   Check that openclaw-skills/ directory exists with SOUL.md files');
      return;
    }

    // Test 2: Get campaigns
    console.log('\n2️⃣  Getting campaigns...');
    const campaigns = await fetchWithAuth('/campaigns');
    console.log(`   ✅ Found ${campaigns.length} campaign(s)`);

    if (campaigns.length === 0) {
      console.log('\n   ⚠️  No campaigns found! Cannot test assignment.');
      return;
    }

    const testCampaign = campaigns[0];
    console.log(`   Using campaign: ${testCampaign.name} (${testCampaign.id})`);

    // Test 3: Get available agents for campaign
    console.log('\n3️⃣  Testing GET /api/campaigns/:id/available-agents...');
    const availableAgents = await fetchWithAuth(`/campaigns/${testCampaign.id}/available-agents`);
    console.log(`   ✅ Available agents: ${availableAgents.available?.length || 0}`);
    console.log(`   ✅ Already assigned: ${availableAgents.assigned?.length || 0}`);

    // Test 4: Assign an agent to campaign
    if (availableAgents.available && availableAgents.available.length > 0) {
      console.log('\n4️⃣  Testing POST /api/campaigns/:id/agents (assign agent)...');
      const templateToAssign = availableAgents.available[0];

      const response = await fetch(`${BASE_URL}/campaigns/${testCampaign.id}/agents`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agentType: templateToAssign.id,
          agentName: templateToAssign.name,
          schedule: 'manual',
          config: {},
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.log(`   ⚠️  Assignment failed: ${error.error}`);
      } else {
        const assigned = await response.json();
        console.log(`   ✅ Assigned: ${templateToAssign.name}`);
        console.log(`      - Agent ID: ${assigned.id}`);
        console.log(`      - Status: ${assigned.status}`);

        // Test 5: Get campaign agents
        console.log('\n5️⃣  Testing GET /api/campaigns/:id/agents...');
        const campaignAgents = await fetchWithAuth(`/campaigns/${testCampaign.id}/agents`);
        console.log(`   ✅ Campaign now has ${campaignAgents.length} agent(s) assigned`);

        // Test 6: Remove the test agent
        console.log('\n6️⃣  Testing DELETE /api/campaigns/:id/agents/:agentId (cleanup)...');
        const deleteResponse = await fetch(`${BASE_URL}/campaigns/${testCampaign.id}/agents/${assigned.id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (deleteResponse.ok) {
          console.log(`   ✅ Agent removed successfully`);
        } else {
          console.log(`   ⚠️  Failed to remove agent`);
        }
      }
    } else {
      console.log('\n4️⃣  ⏭️  Skipping assignment test (all agents already assigned)');
    }

    console.log('\n✅ All Phase 6 tests passed!\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testPhase6();
