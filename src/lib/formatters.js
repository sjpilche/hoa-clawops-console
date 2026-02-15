/**
 * @file formatters.js
 * @description Formatting utilities for dates, currency, tokens, duration.
 */

/**
 * Format a date string for display.
 * @param {string} dateStr - ISO date string
 * @returns {string} - Formatted like "Feb 11, 2026 2:30 PM"
 */
export function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

/**
 * Format a date as relative time (e.g., "5 min ago").
 * @param {string} dateStr - ISO date string
 * @returns {string}
 */
export function formatRelativeTime(dateStr) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Format USD currency.
 * @param {number} amount
 * @returns {string} - e.g., "$1.23"
 */
export function formatCost(amount) {
  if (amount == null) return '$0.00';
  return `$${Number(amount).toFixed(2)}`;
}

/**
 * Format token count with commas.
 * @param {number} tokens
 * @returns {string} - e.g., "12,345"
 */
export function formatTokens(tokens) {
  if (tokens == null) return '0';
  return Number(tokens).toLocaleString();
}

/**
 * Format milliseconds as human-readable duration.
 * @param {number} ms - Duration in milliseconds
 * @returns {string} - e.g., "2m 14s" or "1h 5m"
 */
export function formatDuration(ms) {
  if (!ms) return '—';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}
