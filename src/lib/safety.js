/**
 * @file safety.js
 * @description Client-side safety utilities.
 * These supplement the server-side safety checks — defense in depth.
 */

/**
 * Sanitize text for safe HTML rendering.
 * Prevents XSS attacks if message content is rendered as HTML.
 * @param {string} text - Raw text
 * @returns {string} - Sanitized text
 */
export function sanitizeText(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Check if a URL is in the allowed domains list.
 * @param {string} url - URL to check
 * @param {string[]} allowedDomains - List of allowed domain patterns
 * @returns {boolean}
 */
export function isDomainAllowed(url, allowedDomains = []) {
  if (allowedDomains.length === 0) return true; // No restrictions configured
  try {
    const hostname = new URL(url).hostname;
    return allowedDomains.some(domain =>
      hostname === domain || hostname.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
}
