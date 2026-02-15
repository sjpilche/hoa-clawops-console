/**
 * @file hoaWebhookClient.js
 * @description HMAC-signed webhook client for posting content to the HOA Project Intake website.
 *
 * Provides functions to push articles and SEO insights to:
 *   - POST /api/v1/articles/webhook/push
 *   - POST /api/v1/articles/webhook/insights
 *   - DELETE /api/v1/articles/webhook/articles/:externalId
 *
 * Authentication: HMAC-SHA256 signature (x-webhook-signature + x-webhook-timestamp)
 */

const crypto = require('crypto');

const HOA_WEBHOOK_SECRET = process.env.HOA_WEBHOOK_SECRET;
const HOA_WEBHOOK_API_URL = (process.env.HOA_WEBHOOK_API_URL || '').replace(/\/$/, '');

/**
 * Sign a payload with HMAC-SHA256.
 * @param {object} payload - The JSON payload to sign
 * @returns {{ 'x-webhook-signature': string, 'x-webhook-timestamp': string, 'Content-Type': string }}
 */
function signPayload(payload) {
  if (!HOA_WEBHOOK_SECRET) {
    throw new Error('HOA_WEBHOOK_SECRET is not configured. Add it to .env.local');
  }

  const timestamp = Date.now().toString();
  const body = JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', HOA_WEBHOOK_SECRET)
    .update(timestamp + body)
    .digest('hex');

  return {
    'x-webhook-signature': signature,
    'x-webhook-timestamp': timestamp,
    'Content-Type': 'application/json',
  };
}

/**
 * Make a signed HTTP request to the HOA webhook API.
 * Includes 1 retry on network failure with 3-second delay.
 *
 * @param {string} method - HTTP method
 * @param {string} path - API path (e.g., '/api/v1/articles/webhook/push')
 * @param {object|null} payload - Request body (null for DELETE)
 * @returns {Promise<object>} - Parsed JSON response
 */
async function makeRequest(method, path, payload = null) {
  if (!HOA_WEBHOOK_API_URL) {
    throw new Error('HOA_WEBHOOK_API_URL is not configured. Add it to .env.local');
  }

  const url = `${HOA_WEBHOOK_API_URL}${path}`;
  const headers = payload ? signPayload(payload) : signPayload({});
  const options = {
    method,
    headers,
  };

  if (payload && method !== 'DELETE') {
    options.body = JSON.stringify(payload);
  }

  // Attempt with 1 retry
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await fetch(url, options);
      const data = await response.json();

      if (!response.ok) {
        const errMsg = data.message || data.error || `HTTP ${response.status}`;
        throw new Error(`Webhook API error (${response.status}): ${errMsg}`);
      }

      return data;
    } catch (error) {
      if (attempt === 1 && (error.cause?.code === 'ECONNREFUSED' || error.cause?.code === 'ENOTFOUND' || error.message.includes('fetch failed'))) {
        console.warn(`[HOAWebhook] Request failed (attempt ${attempt}), retrying in 3s...`, error.message);
        await new Promise(resolve => setTimeout(resolve, 3000));
        continue;
      }
      throw error;
    }
  }
}

/**
 * Push (upsert) articles to the HOA website.
 * Uses external_id for deduplication — existing articles with the same external_id are updated.
 *
 * @param {Array<object>} articles - Array of article objects (see CONTENT_AGENT_WEBHOOK_API.md)
 * @returns {Promise<{ success: boolean, upserted: number, errors: Array }>}
 */
async function pushArticles(articles) {
  if (!Array.isArray(articles) || articles.length === 0) {
    throw new Error('articles must be a non-empty array');
  }
  if (articles.length > 100) {
    throw new Error('Maximum 100 articles per request');
  }

  console.log(`[HOAWebhook] Pushing ${articles.length} article(s)...`);
  const result = await makeRequest('POST', '/api/v1/articles/webhook/push', { articles });
  console.log(`[HOAWebhook] Result: ${result.message}`);
  return result;
}

/**
 * Push (upsert) SEO insights to the HOA website.
 * Uses insight_key for deduplication.
 *
 * @param {Array<object>} insights - Array of insight objects (see CONTENT_AGENT_WEBHOOK_API.md)
 * @returns {Promise<{ success: boolean, upserted: number, errors: Array }>}
 */
async function pushInsights(insights) {
  if (!Array.isArray(insights) || insights.length === 0) {
    throw new Error('insights must be a non-empty array');
  }
  if (insights.length > 50) {
    throw new Error('Maximum 50 insights per request');
  }

  console.log(`[HOAWebhook] Pushing ${insights.length} insight(s)...`);
  const result = await makeRequest('POST', '/api/v1/articles/webhook/insights', { insights });
  console.log(`[HOAWebhook] Result: ${result.message}`);
  return result;
}

/**
 * Delete an article by external_id.
 *
 * @param {string} externalId - The external_id of the article to delete
 * @returns {Promise<{ success: boolean, deleted: boolean }>}
 */
async function deleteArticle(externalId) {
  if (!externalId) {
    throw new Error('externalId is required');
  }

  console.log(`[HOAWebhook] Deleting article "${externalId}"...`);
  const result = await makeRequest('DELETE', `/api/v1/articles/webhook/articles/${encodeURIComponent(externalId)}`);
  console.log(`[HOAWebhook] Result: ${result.message}`);
  return result;
}

/**
 * Fetch published articles from the public read API (no auth required).
 *
 * @param {object} params - Query params: { type, category, featured, search, limit, offset, sort }
 * @returns {Promise<object>} - Articles response
 */
async function getArticles(params = {}) {
  const query = new URLSearchParams(params).toString();
  const url = `${HOA_WEBHOOK_API_URL}/api/v1/articles${query ? '?' + query : ''}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch articles: HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Check webhook health — verifies the API is reachable and the secret is configured.
 *
 * @returns {Promise<{ healthy: boolean, apiUrl: string, secretConfigured: boolean }>}
 */
async function checkHealth() {
  const result = {
    healthy: false,
    apiUrl: HOA_WEBHOOK_API_URL,
    secretConfigured: !!HOA_WEBHOOK_SECRET,
  };

  try {
    const response = await fetch(`${HOA_WEBHOOK_API_URL}/api/v1/articles?limit=1`);
    result.healthy = response.ok;
    result.statusCode = response.status;
  } catch (error) {
    result.error = error.message;
  }

  return result;
}

module.exports = {
  pushArticles,
  pushInsights,
  deleteArticle,
  getArticles,
  checkHealth,
  signPayload,
};
