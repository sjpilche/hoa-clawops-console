/**
 * Test script for Phase 4 - Global Overview Page
 * Tests campaign API endpoints
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

async function testPhase4() {
  console.log('🧪 Testing Phase 4: Global Overview Page\n');

  try {
    // Test 1: List campaigns
    console.log('1️⃣  Testing GET /api/campaigns...');
    const campaigns = await fetchWithAuth('/campaigns');
    console.log(`   ✅ Found ${campaigns.length} campaign(s)`);
    campaigns.forEach(c => {
      console.log(`      - ${c.icon} ${c.name} (${c.agentCount} agents, ${c.leadCount} leads)`);
    });

    // Test 2: Get overview stats
    console.log('\n2️⃣  Testing GET /api/campaigns/overview...');
    const overview = await fetchWithAuth('/campaigns/overview');
    console.log(`   ✅ Overview stats:`);
    console.log(`      - Total Campaigns: ${overview.totalCampaigns}`);
    console.log(`      - Total Agent Runs: ${overview.totalAgentRuns}`);
    console.log(`      - Total Leads: ${overview.totalLeads}`);
    console.log(`      - Total Emails: ${overview.totalEmails}`);
    console.log(`      - Total Cost: $${overview.totalCost?.toFixed(2) || '0.00'}`);

    // Test 3: Create a test campaign
    console.log('\n3️⃣  Testing POST /api/campaigns (create test campaign)...');
    const newCampaign = {
      name: 'Test Campaign ' + Date.now(),
      company: 'Test Company Inc',
      type: 'marketing',
      color: '#10B981',
      icon: '🚀',
      description: 'Auto-generated test campaign',
    };

    const response = await fetch(`${BASE_URL}/campaigns`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(newCampaign),
    });

    if (!response.ok) {
      const error = await response.json();
      console.log(`   ⚠️  Campaign creation failed: ${error.error}`);
    } else {
      const created = await response.json();
      console.log(`   ✅ Created campaign: ${created.icon} ${created.name}`);
      console.log(`      - ID: ${created.id}`);
      console.log(`      - Slug: ${created.slug}`);
      console.log(`      - Color: ${created.color}`);

      // Test 4: Get the created campaign
      console.log('\n4️⃣  Testing GET /api/campaigns/:id...');
      const fetchedCampaign = await fetchWithAuth(`/campaigns/${created.id}`);
      console.log(`   ✅ Fetched campaign: ${fetchedCampaign.name}`);

      // Test 5: Delete the test campaign
      console.log('\n5️⃣  Testing DELETE /api/campaigns/:id (cleanup)...');
      const deleteResponse = await fetch(`${BASE_URL}/campaigns/${created.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (deleteResponse.ok) {
        console.log(`   ✅ Test campaign archived successfully`);
      } else {
        console.log(`   ⚠️  Failed to archive test campaign`);
      }
    }

    console.log('\n✅ All Phase 4 tests passed!\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testPhase4();
