#!/usr/bin/env node
/**
 * @file test-postiz-posting.js
 * @description Test multi-platform posting via Postiz skill
 *
 * Usage: node scripts/test-postiz-posting.js
 *
 * Tests posting to: linkedin, twitter, instagram, tiktok, facebook
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const API_URL = process.env.VITE_API_URL || 'http://localhost:3001/api';
const JWT_TOKEN = process.env.TEST_JWT_TOKEN || 'test-token-placeholder';

async function getJWT() {
  try {
    const response = await fetch(`${API_URL.replace('/api', '')}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@clawops.local',
        password: 'changeme123',
      }),
    });

    if (!response.ok) {
      console.error('❌ Login failed:', response.status);
      return null;
    }

    const data = await response.json();
    return data.token;
  } catch (error) {
    console.error('❌ Login error:', error.message);
    return null;
  }
}

async function addPost(token, platform, content) {
  const payload = {
    content,
    platform,
    post_type: 'page',
    topic: `test-${platform}`,
    source_agent: 'test-script',
  };

  console.log(`\n📝 Adding ${platform} post:`, JSON.stringify(payload, null, 2));

  try {
    const response = await fetch(`${API_URL}/content-queue`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(`❌ Failed to add ${platform} post:`, response.status);
      const error = await response.json();
      console.error('Error details:', error);
      return null;
    }

    const post = await response.json();
    console.log(`✅ Post added:`, post.post?.id);
    return post.post?.id;
  } catch (error) {
    console.error(`❌ Error adding ${platform} post:`, error.message);
    return null;
  }
}

async function publishPost(token, postId, platform) {
  console.log(`\n🚀 Publishing ${platform} post: ${postId}`);

  try {
    const response = await fetch(`${API_URL}/content-queue/${postId}/publish`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`❌ Failed to publish ${platform} post:`, response.status);
      const error = await response.json();
      console.error('Error details:', error);
      return false;
    }

    const result = await response.json();
    console.log(`✅ Published to ${platform}:`, result.external_post_id || result.message);
    return true;
  } catch (error) {
    console.error(`❌ Error publishing ${platform} post:`, error.message);
    return false;
  }
}

async function main() {
  console.log('🧪 Postiz Multi-Platform Posting Test');
  console.log('=====================================\n');

  // Check environment
  const postizKey = process.env.POSTIZ_API_KEY;
  if (!postizKey || postizKey.startsWith('<')) {
    console.error('❌ POSTIZ_API_KEY not configured in .env.local');
    console.error('   Get key from: https://postiz.com/dashboard/integrations');
    console.error('   Then add to .env.local:');
    console.error('   POSTIZ_API_KEY=<your-key>');
    process.exit(1);
  }

  // Login
  console.log('🔐 Logging in...');
  const token = await getJWT();
  if (!token) {
    console.error('❌ Failed to get JWT token. Make sure Console is running: npm run dev');
    process.exit(1);
  }
  console.log('✅ Logged in');

  // Test posts for each platform
  const platforms = [
    {
      name: 'linkedin',
      content: 'Testing HOA Project Funding LinkedIn integration 🎯 #RealEstateTech #HOA #ProjectFunding',
    },
    {
      name: 'twitter',
      content: 'Just integrated HOA Project Funding with Postiz! Now posting to Twitter, LinkedIn, Instagram & more. 🚀 #HOA',
    },
    {
      name: 'instagram',
      content: 'HOA Project Funding is now on Instagram! Follow for tips on community management and funding strategies 💡 #HOA',
    },
    {
      name: 'tiktok',
      content: 'HOA hacks: How to fund your project in 60 seconds ⏱️ #HOA #FundingTips #CommunityManagement',
    },
    {
      name: 'facebook',
      content: 'HOA Project Funding: We help communities secure funding for their projects. Learn more at www.hoaprojectfunding.com 🏘️',
    },
  ];

  let posted = 0;
  let failed = 0;

  for (const platform of platforms) {
    const postId = await addPost(token, platform.name, platform.content);
    if (postId) {
      const success = await publishPost(token, postId, platform.name);
      if (success) {
        posted++;
      } else {
        failed++;
      }
    } else {
      failed++;
    }

    // Delay between platforms to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log('\n' + '='.repeat(50));
  console.log(`📊 Test Results: ${posted} posted, ${failed} failed`);
  console.log('='.repeat(50));

  if (failed > 0) {
    console.log('\n⚠️  Some posts failed. Possible reasons:');
    console.log('   - Postiz API key invalid or expired');
    console.log('   - Social accounts not connected in Postiz dashboard');
    console.log('   - Rate limit exceeded');
    console.log('\n   Fix: Go to https://postiz.com/dashboard and verify accounts');
  } else {
    console.log('\n✨ All posts published successfully! Check your social feeds.');
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
