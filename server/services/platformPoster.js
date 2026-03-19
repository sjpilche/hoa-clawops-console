/**
 * Platform Poster — Dispatches approved responses to the correct platform
 *
 * Supports:
 *   - Reddit (via Reddit API / snoowrap)
 *   - Facebook (manual — opens URL for now, Graph API needs Page token)
 *   - LinkedIn (manual — opens URL)
 *   - BiggerPockets (manual — opens URL)
 *
 * Each platform returns: { success, postUrl?, error? }
 *
 * IMPORTANT: This service NEVER auto-posts without prior human approval.
 * Items must be in 'approved' status before this service will touch them.
 */

const { run, get } = require('../db/connection');

/**
 * Post an approved response to its target platform.
 * Updates the queue item status to 'posted' or 'post_failed'.
 */
async function postToplatform(queueItemId) {
  const item = get('SELECT * FROM lg_engagement_queue WHERE id = ?', [queueItemId]);
  if (!item) throw new Error(`Queue item ${queueItemId} not found`);
  if (item.status !== 'approved') throw new Error(`Item must be approved (current: ${item.status})`);

  const platform = (item.platform || '').toLowerCase();
  let result;

  try {
    switch (platform) {
      case 'reddit':
        result = await postToReddit(item);
        break;
      case 'facebook':
      case 'linkedin':
      case 'biggerpockets':
      case 'quora':
      case 'nextdoor':
        // These platforms don't have easy API posting — mark as ready with URL
        result = await markForManualPost(item);
        break;
      default:
        result = { success: false, error: `Unknown platform: ${platform}` };
    }

    if (result.success) {
      run(
        `UPDATE lg_engagement_queue
         SET status = 'posted', posted_at = datetime('now'), post_url = ?
         WHERE id = ?`,
        [result.postUrl || item.post_url, queueItemId]
      );
      console.log(`[PlatformPoster] ✅ Posted to ${platform}: ${item.post_url}`);
    } else {
      run(
        `UPDATE lg_engagement_queue SET status = 'post_failed' WHERE id = ?`,
        [queueItemId]
      );
      console.error(`[PlatformPoster] ❌ Failed to post to ${platform}: ${result.error}`);
    }

    return result;
  } catch (error) {
    run(
      `UPDATE lg_engagement_queue SET status = 'post_failed' WHERE id = ?`,
      [queueItemId]
    );
    console.error(`[PlatformPoster] ❌ Error posting to ${platform}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Reddit posting via Reddit API
 * Requires: REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD
 */
async function postToReddit(item) {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const username = process.env.REDDIT_USERNAME;
  const password = process.env.REDDIT_PASSWORD;

  if (!clientId || !clientSecret || !username || !password) {
    console.log(`[PlatformPoster] Reddit API not configured — marking for manual post`);
    return markForManualPost(item);
  }

  try {
    // Step 1: Get OAuth token
    const authRes = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'ClawOps/1.0',
      },
      body: `grant_type=password&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
    });

    if (!authRes.ok) {
      return { success: false, error: `Reddit auth failed: ${authRes.status}` };
    }

    const auth = await authRes.json();
    const token = auth.access_token;

    // Step 2: Extract the Reddit post fullname (t3_xxxxx) from the URL
    // Reddit URLs: https://www.reddit.com/r/subreddit/comments/POST_ID/title/
    const match = item.post_url?.match(/comments\/([a-z0-9]+)/i);
    if (!match) {
      return { success: false, error: `Can't extract Reddit post ID from URL: ${item.post_url}` };
    }

    const thingId = `t3_${match[1]}`;

    // Step 3: Post comment
    const commentRes = await fetch('https://oauth.reddit.com/api/comment', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'ClawOps/1.0',
      },
      body: `thing_id=${thingId}&text=${encodeURIComponent(item.draft_response)}`,
    });

    if (!commentRes.ok) {
      const err = await commentRes.text();
      return { success: false, error: `Reddit comment failed: ${err}` };
    }

    const commentData = await commentRes.json();
    const commentUrl = commentData?.json?.data?.things?.[0]?.data?.permalink;

    return {
      success: true,
      postUrl: commentUrl ? `https://www.reddit.com${commentUrl}` : item.post_url,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * For platforms without API access — mark as 'posted' with a note
 * that the user needs to manually paste the response at the URL.
 */
async function markForManualPost(item) {
  return {
    success: true,
    postUrl: item.post_url,
    manual: true,
    note: `Open ${item.post_url} and paste the approved response manually`,
  };
}

module.exports = { postToplatform };
