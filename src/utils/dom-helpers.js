/* ============================================================
   src/utils/dom-helpers.js — Shared DOM/string utility functions
   ============================================================ */

/**
 * Escape a string for safe insertion into HTML content.
 * Handles null/undefined by returning ''.
 */
export function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escape a string for safe insertion into an HTML attribute value.
 * Currently identical to escapeHtml — kept as a separate export so
 * call sites read naturally (`escapeAttr` for attributes).
 */
export function escapeAttr(s) {
  return escapeHtml(s);
}

/**
 * Format an ISO-8601 date string into locale-aware human-readable text.
 */
export function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
