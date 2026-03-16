/**
 * @file twitterPoster.js
 * @description Posts tweets and threads to Twitter/X via API v2.
 *
 * Uses TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET from .env.local.
 *
 * Exports:
 *   postTweet(text, opts)       — Post a single tweet
 *   postThread(tweets)          — Post a thread (array of texts)
 *   status()                    — Check if Twitter is configured
 */

const crypto = require('crypto');
const axios = require('axios');
const { run } = require('../db/connection');

const API_URL = 'https://api.twitter.com/2/tweets';

function getConfig() {
  return {
    apiKey: process.env.TWITTER_API_KEY,
    apiSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_SECRET,
    configured: !!(process.env.TWITTER_API_KEY && process.env.TWITTER_ACCESS_TOKEN),
  };
}

/**
 * Generate OAuth 1.0a signature for Twitter API v2.
 */
function generateOAuthHeader(method, url, params = {}) {
  const config = getConfig();
  const oauthParams = {
    oauth_consumer_key: config.apiKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: config.accessToken,
    oauth_version: '1.0',
  };

  const allParams = { ...oauthParams, ...params };
  const paramString = Object.keys(allParams).sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k])}`)
    .join('&');

  const baseString = `${method.toUpperCase()}&${encodeURIComponent(url)}&${encodeURIComponent(paramString)}`;
  const signingKey = `${encodeURIComponent(config.apiSecret)}&${encodeURIComponent(config.accessSecret)}`;
  const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

  oauthParams.oauth_signature = signature;

  const header = 'OAuth ' + Object.keys(oauthParams).sort()
    .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
    .join(', ');

  return header;
}

/**
 * Post a single tweet.
 */
async function postTweet(text, opts = {}) {
  const config = getConfig();
  if (!config.configured) {
    return { success: false, error: 'Twitter not configured (missing TWITTER_API_KEY or TWITTER_ACCESS_TOKEN in .env.local)' };
  }
  if (!config.apiSecret || !config.accessSecret) {
    return { success: false, error: 'Twitter partially configured — missing TWITTER_API_SECRET or TWITTER_ACCESS_SECRET in .env.local' };
  }

  try {
    const body = { text: text.slice(0, 280) };
    if (opts.replyTo) body.reply = { in_reply_to_tweet_id: opts.replyTo };

    const authHeader = generateOAuthHeader('POST', API_URL);

    const response = await axios.post(API_URL, body, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });

    const tweetId = response.data?.data?.id;
    console.log(`[Twitter] Tweet posted. ID: ${tweetId}`);

    run(`INSERT INTO audit_log (id, action, resource, details, outcome)
      VALUES (lower(hex(randomblob(16))), 'twitter_post', ?, ?, 'success')`,
      [tweetId || 'unknown', JSON.stringify({
        text_preview: text.slice(0, 100),
        tweet_id: tweetId,
        agent: opts.agent || 'jake-twitter-poster',
      })]);

    return { success: true, tweetId };
  } catch (err) {
    const errorMsg = err.response?.data?.detail || err.response?.data?.title || err.message;
    console.error(`[Twitter] Tweet failed:`, errorMsg);

    run(`INSERT INTO audit_log (id, action, resource, details, outcome)
      VALUES (lower(hex(randomblob(16))), 'twitter_post_failed', 'twitter', ?, 'error')`,
      [JSON.stringify({ error: errorMsg, text_preview: text.slice(0, 100) })]);

    return { success: false, error: errorMsg, statusCode: err.response?.status };
  }
}

/**
 * Post a thread (array of tweet texts).
 * Each tweet replies to the previous one.
 */
async function postThread(tweets, opts = {}) {
  if (!Array.isArray(tweets) || tweets.length === 0) {
    return { success: false, error: 'tweets must be a non-empty array' };
  }

  const results = [];
  let lastTweetId = null;

  for (let i = 0; i < tweets.length; i++) {
    const text = tweets[i];
    const result = await postTweet(text, {
      replyTo: lastTweetId,
      agent: opts.agent,
    });

    results.push(result);

    if (!result.success) {
      console.error(`[Twitter] Thread failed at tweet ${i + 1}/${tweets.length}`);
      return { success: false, error: `Thread failed at tweet ${i + 1}`, results };
    }

    lastTweetId = result.tweetId;

    // Rate limit: wait 3s between tweets (Twitter API v2 limit: ~1 tweet/3s)
    if (i < tweets.length - 1) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  console.log(`[Twitter] Thread posted: ${results.length} tweets`);
  return { success: true, tweetCount: results.length, results };
}

/**
 * Check Twitter configuration status.
 */
function status() {
  const config = getConfig();
  return {
    configured: config.configured,
    hasApiKey: !!config.apiKey,
    hasAccessToken: !!config.accessToken,
  };
}

module.exports = { postTweet, postThread, status };
