/**
 * @file linkedinPoster.js
 * @description Posts content to LinkedIn organization page via API v2.
 *
 * Uses LINKEDIN_ACCESS_TOKEN and LINKEDIN_ORGANIZATION_ID from .env.local.
 *
 * Exports:
 *   postText(text, opts)        — Post text-only update
 *   postArticle(text, url, title) — Post with article link
 *   status()                    — Check if LinkedIn is configured
 */

const axios = require('axios');
const { run, get } = require('../db/connection');

const BASE_URL = 'https://api.linkedin.com/v2';

function getConfig() {
  return {
    accessToken: process.env.LINKEDIN_ACCESS_TOKEN,
    orgId: process.env.LINKEDIN_ORGANIZATION_ID,
    configured: !!(process.env.LINKEDIN_ACCESS_TOKEN && process.env.LINKEDIN_ORGANIZATION_ID),
  };
}

/**
 * Post a text-only update to the LinkedIn organization page.
 */
async function postText(text, opts = {}) {
  const config = getConfig();
  if (!config.configured) {
    return { success: false, error: 'LinkedIn not configured (missing LINKEDIN_ACCESS_TOKEN or LINKEDIN_ORGANIZATION_ID in .env.local)' };
  }
  if (!text || text.trim().length === 0) {
    return { success: false, error: 'Cannot post empty text to LinkedIn' };
  }

  try {
    const body = {
      author: `urn:li:organization:${config.orgId}`,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: text.slice(0, 3000) }, // LinkedIn limit
          shareMediaCategory: 'NONE',
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    };

    const response = await axios.post(`${BASE_URL}/ugcPosts`, body, {
      headers: {
        'Authorization': `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      timeout: 15000,
    });

    const postId = response.headers['x-restli-id'] || response.data?.id || null;
    console.log(`[LinkedIn] Posted successfully. ID: ${postId}`);

    // Track in audit log
    run(`INSERT INTO audit_log (id, action, resource, details, outcome)
      VALUES (lower(hex(randomblob(16))), 'linkedin_post', ?, ?, 'success')`,
      [postId || 'unknown', JSON.stringify({
        text_preview: text.slice(0, 200),
        post_id: postId,
        agent: opts.agent || 'linkedin-direct-poster',
      })]);

    return { success: true, postId, statusCode: response.status };
  } catch (err) {
    const errorMsg = err.response?.data?.message || err.message;
    console.error(`[LinkedIn] Post failed:`, errorMsg);

    run(`INSERT INTO audit_log (id, action, resource, details, outcome)
      VALUES (lower(hex(randomblob(16))), 'linkedin_post_failed', 'linkedin', ?, 'error')`,
      [JSON.stringify({ error: errorMsg, text_preview: text.slice(0, 100) })]);

    return { success: false, error: errorMsg, statusCode: err.response?.status };
  }
}

/**
 * Post an article share (text + link preview).
 */
async function postArticle(text, articleUrl, title = '', description = '') {
  const config = getConfig();
  if (!config.configured) {
    return { success: false, error: 'LinkedIn not configured' };
  }

  // Add UTM tracking to the article URL
  let trackedUrl = articleUrl;
  try {
    const seo = require('./seoGenerator');
    trackedUrl = seo.generateUTMLink(articleUrl, {
      source: 'linkedin', medium: 'social', campaign: title.slice(0, 50).replace(/\s+/g, '-').toLowerCase(),
    });
  } catch {}

  try {
    const body = {
      author: `urn:li:organization:${config.orgId}`,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: text.slice(0, 3000) },
          shareMediaCategory: 'ARTICLE',
          media: [{
            status: 'READY',
            originalUrl: trackedUrl,
            title: { text: title.slice(0, 200) },
            description: { text: (description || text).slice(0, 256) },
          }],
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    };

    const response = await axios.post(`${BASE_URL}/ugcPosts`, body, {
      headers: {
        'Authorization': `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      timeout: 15000,
    });

    const postId = response.headers['x-restli-id'] || response.data?.id || null;
    console.log(`[LinkedIn] Article posted. ID: ${postId}, URL: ${trackedUrl}`);

    return { success: true, postId, trackedUrl };
  } catch (err) {
    const errorMsg = err.response?.data?.message || err.message;
    console.error(`[LinkedIn] Article post failed:`, errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Check LinkedIn configuration status.
 */
function status() {
  const config = getConfig();
  return {
    configured: config.configured,
    hasToken: !!config.accessToken,
    hasOrgId: !!config.orgId,
    orgId: config.orgId || null,
  };
}

module.exports = { postText, postArticle, status };
