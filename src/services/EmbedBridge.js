// Embed bridge — owns the postMessage protocol used when the editor runs
// inside a host application (?embed=1), either as an iframe or a window
// opened from the host. Protocol v1, envelope both ways:
//   { source, version, type, payload }
// host→editor: init, loadTemplate, loadZPL, setPreviewData, requestSave
// editor→host: ready, save, cancel, change, error
// Full reference in docs/EMBEDDING.md.

import { isValidPlaceholderName } from '../utils/placeholders.js';

const PROTOCOL_VERSION = 1;
const SOURCE_EDITOR = 'zpl-designer';
const SOURCE_HOST = 'zpl-designer-host';

export function isEmbedMode() {
  return new URLSearchParams(window.location.search).get('embed') === '1';
}

/**
 * Wire the editor side of the protocol. All callbacks are supplied by app.js:
 * @param {Object} deps
 * @param {Object} deps.state - AppState (for change subscriptions)
 * @param {Function} deps.importTemplateJson - (jsonString) => boolean success
 * @param {Function} deps.importZPL - (zpl) => warnings[] (never throws)
 * @param {Function} deps.getResult - () => { template, zpl }
 * @param {Function} deps.setPreviewData - (map) => void, merges host Preview Data
 */
export function initEmbedBridge({ state, importTemplateJson, importZPL, getResult, setPreviewData }) {
  const hostWindow = window.parent !== window ? window.parent : window.opener;
  if (!hostWindow) return;

  // Origin of the first structurally valid `init` from the host window.
  // event.source === hostWindow authenticates the sender; the origin lock
  // additionally pins outbound data to the document the host had at init
  // time (a navigated parent changes origin but keeps its WindowProxy).
  let hostOrigin = null;
  let changeTimer = null;

  const post = (type, payload, targetOrigin) => {
    try {
      hostWindow.postMessage({ source: SOURCE_EDITOR, version: PROTOCOL_VERSION, type, payload }, targetOrigin);
    } catch (_) { }
  };

  const sendSave = () => post('save', getResult(), hostOrigin);

  // Host-supplied Preview Data. Keys that could never be recognised as a placeholder
  // are dropped rather than silently populating an unreachable row; a key with an
  // empty value is legitimate — it defines the placeholder without sampling it.
  const applyPreviewData = (map) => {
    if (!map || typeof map !== 'object' || Array.isArray(map)) {
      post('error', { message: 'previewData must be an object' }, hostOrigin);
      return;
    }
    const clean = {};
    const rejected = [];
    for (const [name, value] of Object.entries(map)) {
      if (isValidPlaceholderName(name)) clean[name] = String(value ?? '');
      else rejected.push(name);
    }
    if (rejected.length > 0) {
      post('error', { message: 'Ignored invalid placeholder names', names: rejected }, hostOrigin);
    }
    setPreviewData(clean);
  };

  const applyContent = (payload) => {
    if (payload.template !== undefined && payload.template !== null) {
      const json = typeof payload.template === 'string'
        ? payload.template
        : JSON.stringify(payload.template);
      if (!importTemplateJson(json)) {
        post('error', { message: 'Invalid template' }, hostOrigin);
      }
    } else if (typeof payload.zpl === 'string') {
      const warnings = importZPL(payload.zpl);
      if (warnings.length > 0) {
        post('error', { message: 'ZPL imported with warnings', warnings }, hostOrigin);
      }
    }
    // After the import, so host values win over whatever the template carried.
    if (payload.previewData !== undefined) {
      applyPreviewData(payload.previewData);
    }
    // Imports fire elementsChanged/labelSettingsChanged synchronously;
    // host-initiated loads shouldn't read as user edits.
    clearTimeout(changeTimer);
  };

  window.addEventListener('message', (event) => {
    // Only the actual parent/opener may drive the editor — a sibling frame
    // or popup can obtain this window's proxy and post to it, but it cannot
    // forge event.source.
    if (event.source !== hostWindow) return;
    const msg = event.data;
    if (!msg || msg.source !== SOURCE_HOST || msg.version !== PROTOCOL_VERSION) return;
    if (hostOrigin === null) {
      if (msg.type !== 'init') return;
      hostOrigin = event.origin;
    } else if (event.origin !== hostOrigin) {
      return;
    }
    if (msg.type === 'init' || msg.type === 'loadTemplate' || msg.type === 'loadZPL') {
      applyContent(msg.payload || {});
    } else if (msg.type === 'setPreviewData') {
      applyPreviewData((msg.payload || {}).previewData);
    } else if (msg.type === 'requestSave') {
      // Same payload the Save button sends — a host driving the editor from
      // its own chrome gets an identical `save` back.
      sendSave();
    }
  });

  // Debounced dirty ping (no content payload) so hosts can warn on close
  // without the cost of re-serializing on every edit.
  const queueChange = () => {
    if (hostOrigin === null) return;
    clearTimeout(changeTimer);
    changeTimer = setTimeout(() => post('change', { dirty: true }, hostOrigin), 300);
  };
  state.subscribe('elementsChanged', queueChange);
  state.subscribe('labelSettingsChanged', queueChange);

  document.getElementById('embed-save-btn').addEventListener('click', () => {
    if (hostOrigin === null) return;
    sendSave();
  });
  document.getElementById('embed-cancel-btn').addEventListener('click', () => {
    if (hostOrigin === null) return;
    post('cancel', {}, hostOrigin);
  });

  // `ready` carries no data, so '*' is safe; the host origin is unknown
  // until its init arrives.
  post('ready', { version: PROTOCOL_VERSION }, '*');
}
