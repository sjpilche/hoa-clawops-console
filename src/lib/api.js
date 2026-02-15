/**
 * @file api.js
 * @description API client for communicating with the Express BFF server.
 *
 * HOW IT WORKS:
 * - Wraps the native fetch() API with our auth token and error handling
 * - Automatically includes the JWT token in every request
 * - If a request gets a 401, redirects to login
 *
 * USAGE:
 *   import { api } from '@/lib/api';
 *   const { agents } = await api.get('/agents');
 *   await api.post('/agents', { name: 'My Agent' });
 */

// Base URL for API requests.
// In development, Vite's proxy forwards /api to the Express server.
// In production, this would be the full server URL.
const BASE_URL = '/api';

/**
 * Get the stored JWT token.
 * We store it in localStorage — simple and works for a single-user local app.
 */
function getToken() {
  return localStorage.getItem('clawops_token');
}

/**
 * Store the JWT token after login.
 */
function setToken(token) {
  localStorage.setItem('clawops_token', token);
}

/**
 * Remove the JWT token (logout).
 */
function removeToken() {
  localStorage.removeItem('clawops_token');
}

/**
 * Make an API request with authentication and error handling.
 *
 * @param {string} endpoint - API path (e.g., '/agents')
 * @param {Object} options - Fetch options (method, body, etc.)
 * @returns {Promise<Object>} - Parsed JSON response
 * @throws {Error} - With helpful error message
 */
async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const token = getToken();

  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    // Handle 401 — token expired or invalid
    if (response.status === 401) {
      removeToken();
      // Redirect to login page
      window.location.href = '/login';
      throw new Error('Session expired. Please log in again.');
    }

    const data = await response.json();

    if (!response.ok) {
      // The server returns errors in format: { error: "message", code: "CODE" }
      throw new Error(data.error || `Request failed with status ${response.status}`);
    }

    return data;
  } catch (error) {
    // Network errors (server down, no internet, etc.)
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error(
        'Cannot reach the server. Make sure the Express server is running ' +
        '(run `npm run dev:server` in terminal).'
      );
    }
    throw error;
  }
}

/**
 * API client object with convenience methods for each HTTP verb.
 *
 * Usage examples:
 *   const data = await api.get('/agents');
 *   const newAgent = await api.post('/agents', { name: 'Test' });
 *   await api.put('/agents/123', { name: 'Updated' });
 *   await api.del('/agents/123');
 */
export const api = {
  get: (endpoint) => request(endpoint, { method: 'GET' }),
  post: (endpoint, body) => request(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  put: (endpoint, body) => request(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  del: (endpoint) => request(endpoint, { method: 'DELETE' }),
};

export { getToken, setToken, removeToken };
