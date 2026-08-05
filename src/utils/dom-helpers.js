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
 * Grow a textarea to fit its content, so a one-row box stays one row until the
 * value actually wraps or contains a line break.
 *
 * Resetting rows to 1 before measuring lets the box shrink again as well as
 * grow: scrollHeight then reports the content's own height rather than the
 * current row count's.
 */
export function autoGrowTextarea(el) {
  if (!el) return;

  // A textarea inside a display:none panel reports scrollHeight 0 — pinning
  // that would collapse it to a sliver, and both Preview Data editors re-render
  // while their panel is hidden (a closed fullscreen tab). Size it by line
  // count instead, which needs no layout, and measure on the next visible pass.
  if (!el.getClientRects().length) {
    el.style.height = '';
    el.rows = el.value.split('\n').length;
    return;
  }

  el.rows = 1;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
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
