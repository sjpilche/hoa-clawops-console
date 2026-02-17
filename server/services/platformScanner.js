/**
 * Platform Scanner Service
 *
 * Monitors multiple platforms (Reddit, Facebook, LinkedIn, BiggerPockets)
 * for HOA-related posts, scores them, and adds high-value posts to the
 * Engagement Queue for human approval.
 *
 * ARCHITECTURE:
 * - Each platform has its own scanner module
 * - Central coordinator schedules scans
 * - Posts run through HOA Networker scoring
 * - High-scoring posts (70+) added to queue
 * - Deduplication prevents duplicate queue entries
 *
 * USAGE:
 *   const { scanAllPlatforms } = require('./platformScanner');
 *   await scanAllPlatforms(); // Scans all configured platforms
 */

const { processPost } = require('../agents/hoaNetworker');
const { all, get } = require('../db/connection');

/**
 * Configuration for which communities to monitor
 * This would ideally come from a database table, but for now it's hardcoded
 */
const MONITORED_COMMUNITIES = {
  reddit: {
    enabled: true,
    subreddits: ['HOA', 'Condo', 'RealEstate', 'PersonalFinance'],
    scan_interval_hours: 2,
    keywords: [
      'special assessment',
      'reserve study',
      'HOA loan',
      'HOA financing',
      'capital project',
      'roof replacement',
      'emergency repair',
      'SIRS',
      'SB 326'
    ]
  },
  facebook: {
    enabled: false, // Requires manual login first
    groups: [
      // User will populate these after joining groups
      // { id: 'group_id', name: 'HOA Board Members', url: 'https://...' }
    ],
    scan_interval_hours: 4,
    keywords: [
      'special assessment',
      'reserve study',
      'financing',
      'loan',
      'emergency',
      'SIRS',
      'SB 326'
    ]
  },
  linkedin: {
    enabled: false, // Requires manual login first
    groups: [],
    scan_interval_hours: 4,
    keywords: ['HOA', 'capital project', 'financing', 'special assessment']
  },
  biggerpockets: {
    enabled: false, // Requires manual setup
    forums: ['hoa-issues-and-problems'],
    scan_interval_hours: 6,
    keywords: ['special assessment', 'HOA', 'reserve']
  }
};

/**
 * Check if a post already exists in the queue (deduplication)
 */
function isDuplicatePost(postUrl) {
  const existing = get(
    'SELECT id FROM lg_engagement_queue WHERE post_url = ?',
    [postUrl]
  );
  return !!existing;
}

/**
 * Get the last scan time for a platform
 */
function getLastScanTime(platform) {
  // This would ideally be stored in a scan_history table
  // For now, we'll check the most recent post created_at from that platform
  const lastPost = get(`
    SELECT MAX(created_at) as last_scan
    FROM lg_engagement_queue
    WHERE platform = ?
  `, [platform]);

  return lastPost?.last_scan || null;
}

/**
 * Main coordinator - scans all enabled platforms
 */
async function scanAllPlatforms() {
  console.log('\n🔍 Starting platform scan...\n');

  const results = {
    reddit: { scanned: 0, added: 0, skipped: 0 },
    facebook: { scanned: 0, added: 0, skipped: 0 },
    linkedin: { scanned: 0, added: 0, skipped: 0 },
    biggerpockets: { scanned: 0, added: 0, skipped: 0 }
  };

  // Scan each enabled platform
  if (MONITORED_COMMUNITIES.reddit.enabled) {
    console.log('📡 Scanning Reddit...');
    try {
      const redditResults = await scanReddit();
      results.reddit = redditResults;
      console.log(`   ✅ Reddit: ${redditResults.added} posts added (${redditResults.skipped} duplicates)`);
    } catch (error) {
      console.error('   ❌ Reddit scan failed:', error.message);
    }
  }

  if (MONITORED_COMMUNITIES.facebook.enabled) {
    console.log('📡 Scanning Facebook...');
    try {
      const fbResults = await scanFacebook();
      results.facebook = fbResults;
      console.log(`   ✅ Facebook: ${fbResults.added} posts added (${fbResults.skipped} duplicates)`);
    } catch (error) {
      console.error('   ❌ Facebook scan failed:', error.message);
    }
  }

  if (MONITORED_COMMUNITIES.linkedin.enabled) {
    console.log('📡 Scanning LinkedIn...');
    try {
      const linkedinResults = await scanLinkedIn();
      results.linkedin = linkedinResults;
      console.log(`   ✅ LinkedIn: ${linkedinResults.added} posts added (${linkedinResults.skipped} duplicates)`);
    } catch (error) {
      console.error('   ❌ LinkedIn scan failed:', error.message);
    }
  }

  if (MONITORED_COMMUNITIES.biggerpockets.enabled) {
    console.log('📡 Scanning BiggerPockets...');
    try {
      const bpResults = await scanBiggerPockets();
      results.biggerpockets = bpResults;
      console.log(`   ✅ BiggerPockets: ${bpResults.added} posts added (${bpResults.skipped} duplicates)`);
    } catch (error) {
      console.error('   ❌ BiggerPockets scan failed:', error.message);
    }
  }

  // Summary
  const totalScanned = Object.values(results).reduce((sum, r) => sum + r.scanned, 0);
  const totalAdded = Object.values(results).reduce((sum, r) => sum + r.added, 0);
  const totalSkipped = Object.values(results).reduce((sum, r) => sum + r.skipped, 0);

  console.log('\n📊 Scan Summary:');
  console.log(`   Total posts scanned: ${totalScanned}`);
  console.log(`   Added to queue: ${totalAdded}`);
  console.log(`   Skipped (duplicates or low score): ${totalSkipped}`);
  console.log('\n✨ Platform scan complete!\n');

  return results;
}

/**
 * Reddit Scanner
 * Uses Snoowrap library (official Reddit API wrapper)
 */
async function scanReddit() {
  // Import Snoowrap dynamically (only when needed)
  const Snoowrap = require('snoowrap');

  const results = { scanned: 0, added: 0, skipped: 0 };

  // Initialize Reddit client
  const reddit = new Snoowrap({
    userAgent: process.env.REDDIT_USER_AGENT || 'HOANetworker/1.0',
    clientId: process.env.REDDIT_CLIENT_ID,
    clientSecret: process.env.REDDIT_CLIENT_SECRET,
    username: process.env.REDDIT_USERNAME,
    password: process.env.REDDIT_PASSWORD
  });

  // Scan each configured subreddit
  for (const subreddit of MONITORED_COMMUNITIES.reddit.subreddits) {
    try {
      // Fetch recent posts from the subreddit
      const posts = await reddit.getSubreddit(subreddit).getNew({ limit: 25 });

      for (const post of posts) {
        results.scanned++;

        // Skip if post is too old (more than 24 hours)
        const postAgeHours = (Date.now() - post.created_utc * 1000) / (1000 * 60 * 60);
        if (postAgeHours > 24) continue;

        // Skip if already in queue
        const postUrl = `https://reddit.com${post.permalink}`;
        if (isDuplicatePost(postUrl)) {
          results.skipped++;
          continue;
        }

        // Check if post contains HOA-related keywords
        const postText = `${post.title} ${post.selftext}`.toLowerCase();
        const hasKeyword = MONITORED_COMMUNITIES.reddit.keywords.some(
          keyword => postText.includes(keyword.toLowerCase())
        );

        if (!hasKeyword) {
          results.skipped++;
          continue;
        }

        // Score the post using HOA Networker
        const postData = {
          platform: 'reddit',
          community: `r/${subreddit}`,
          url: postUrl,
          title: post.title,
          body: post.selftext || '[No body text]',
          author: post.author.name,
          age_hours: Math.floor(postAgeHours)
        };

        const queueItem = await processPost(postData, 'reddit');

        if (queueItem) {
          results.added++;
          console.log(`      ✅ Added: r/${subreddit} - Score ${queueItem.relevance_score}: ${post.title.substring(0, 50)}...`);
        } else {
          results.skipped++;
        }
      }
    } catch (error) {
      console.error(`      ❌ Error scanning r/${subreddit}:`, error.message);
    }
  }

  return results;
}

/**
 * Facebook Scanner
 * Uses Playwright to scrape group posts (requires manual login)
 */
async function scanFacebook() {
  const playwright = require('playwright');
  const results = { scanned: 0, added: 0, skipped: 0 };

  // Check if Facebook session exists
  const sessionPath = './data/facebook-session.json';
  const fs = require('fs');
  if (!fs.existsSync(sessionPath)) {
    console.log('      ⚠️  Facebook session not found. Please run: node scripts/setup-facebook-session.js');
    return results;
  }

  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: sessionPath // Load saved session
  });
  const page = await context.newPage();

  try {
    for (const group of MONITORED_COMMUNITIES.facebook.groups) {
      await page.goto(group.url);
      await page.waitForTimeout(2000); // Wait for content to load

      // Scrape posts from the group feed
      // (This is a simplified version - real implementation would be more complex)
      const posts = await page.$$eval('[role="article"]', articles => {
        return articles.slice(0, 10).map(article => ({
          text: article.innerText,
          url: article.querySelector('a[href*="/posts/"]')?.href || ''
        }));
      });

      for (const post of posts) {
        results.scanned++;

        if (isDuplicatePost(post.url)) {
          results.skipped++;
          continue;
        }

        // Check for keywords
        const hasKeyword = MONITORED_COMMUNITIES.facebook.keywords.some(
          keyword => post.text.toLowerCase().includes(keyword.toLowerCase())
        );

        if (!hasKeyword) {
          results.skipped++;
          continue;
        }

        // Extract title (first line) and body
        const lines = post.text.split('\n');
        const title = lines[0].substring(0, 200);
        const body = lines.slice(1).join('\n').substring(0, 500);

        const postData = {
          platform: 'facebook',
          community: group.name,
          url: post.url,
          title: title,
          body: body,
          author: 'Facebook User', // Facebook doesn't expose author easily
          age_hours: 1 // Estimate
        };

        const queueItem = await processPost(postData, 'facebook');

        if (queueItem) {
          results.added++;
          console.log(`      ✅ Added: ${group.name} - Score ${queueItem.relevance_score}`);
        } else {
          results.skipped++;
        }
      }
    }
  } catch (error) {
    console.error('      ❌ Facebook scraping error:', error.message);
  } finally {
    await browser.close();
  }

  return results;
}

/**
 * LinkedIn Scanner
 * Uses Playwright to scrape group posts
 */
async function scanLinkedIn() {
  // Similar to Facebook scanner
  // Would use Playwright with saved LinkedIn session
  return { scanned: 0, added: 0, skipped: 0 };
}

/**
 * BiggerPockets Scanner
 * Uses Playwright to scrape forum posts
 */
async function scanBiggerPockets() {
  // Similar to Facebook scanner
  // Would scrape BiggerPockets forum pages
  return { scanned: 0, added: 0, skipped: 0 };
}

/**
 * Update monitored communities configuration
 * (This would be called from an API endpoint)
 */
function updateMonitoredCommunities(platform, communities) {
  MONITORED_COMMUNITIES[platform] = {
    ...MONITORED_COMMUNITIES[platform],
    ...communities
  };
  // In production, this would save to database
}

/**
 * Get current configuration
 */
function getMonitoredCommunities() {
  return MONITORED_COMMUNITIES;
}

module.exports = {
  scanAllPlatforms,
  scanReddit,
  scanFacebook,
  scanLinkedIn,
  scanBiggerPockets,
  getMonitoredCommunities,
  updateMonitoredCommunities
};
