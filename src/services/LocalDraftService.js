// Local Draft Service — localhost-only debug convenience.
// Mirrors the open label into localStorage on every change so a refresh during
// development comes back to the same label instead of a blank one. Deliberately
// inert on any other host: this is a dev aid, not a product feature.

const DRAFT_KEY = 'zebra-local-draft';
const SAVE_DELAY = 500;

let saveTimer = null;
let quotaWarned = false;

export function isLocalDraftEnabled() {
  return ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
}

/**
 * Persist the label (debounced — edits fire many change events in a row).
 * @param {Function} getTemplate - () => template object, called when the timer fires
 */
export function saveLocalDraft(getTemplate) {
  if (!isLocalDraftEnabled()) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(getTemplate()));
    } catch (error) {
      // Custom fonts carry multi-MB base64 payloads and can exceed the quota.
      if (!quotaWarned) {
        quotaWarned = true;
        console.warn('Failed to save local draft:', error);
      }
    }
  }, SAVE_DELAY);
}

/**
 * Read the stored label back.
 * @returns {string|null} template JSON, or null when there's nothing usable
 */
export function readLocalDraft() {
  if (!isLocalDraftEnabled()) return null;
  try {
    return localStorage.getItem(DRAFT_KEY);
  } catch {
    return null;
  }
}

export function clearLocalDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { }
}
