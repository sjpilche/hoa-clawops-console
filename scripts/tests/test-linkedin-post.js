/**
 * Quick test — post to HOA Project Funding LinkedIn company page.
 * Run: node scripts/test-linkedin-post.js
 */
require('dotenv').config({ path: '.env.local' });
const axios = require('axios');

const token = process.env.LINKEDIN_ACCESS_TOKEN;
const orgUrn = `urn:li:organization:${process.env.LINKEDIN_ORGANIZATION_ID}`;

console.log('Token present:', token ? 'yes' : 'NO - check .env.local');
console.log('Org URN:', orgUrn);

async function test() {
  const res = await axios.post(
    'https://api.linkedin.com/v2/ugcPosts',
    {
      author: orgUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: {
            text: 'HOA boards: Did you know grant funding and low-interest loans can cover major infrastructure projects without special assessments? Learn more at www.hoaprojectfunding.com\n\n#HOA #PropertyManagement #HOAFunding #CommunityAssociations',
          },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
    }
  );
  console.log('Posted! Post ID:', res.data.id);
}

test().catch(e => {
  console.error('Error:', JSON.stringify(e.response?.data || e.message, null, 2));
});
