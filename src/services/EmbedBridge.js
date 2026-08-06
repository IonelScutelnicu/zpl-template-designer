// Embed bridge — owns the postMessage protocol used when the editor runs
// inside a host application (?embed=1), either as an iframe or a window
// opened from the host. Protocol v1, envelope both ways:
//   { source, version, type, payload }
// host→editor: init, loadTemplate, loadZPL, setPreviewData, setFonts, requestSave
// editor→host: ready, save, cancel, change, error
// Full reference in docs/EMBEDDING.md.

import { isValidPlaceholderName } from '../utils/placeholders.js';
import { fontBytesFromSource } from '../utils/customFonts.js';

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
 * @param {Function} deps.setHostFonts - ([{name, bytes}]) => Promise<string[]> rejected names
 * @param {Function} deps.onSaveSent - () => void, the payload reached the host
 */
export function initEmbedBridge({ state, importTemplateJson, importZPL, getResult, setPreviewData, setHostFonts, onSaveSent }) {
  const hostWindow = window.parent !== window ? window.parent : window.opener;
  if (!hostWindow) return;

  // Origin of the first structurally valid `init` from the host window.
  // event.source === hostWindow authenticates the sender; the origin lock
  // additionally pins outbound data to the document the host had at init
  // time (a navigated parent changes origin but keeps its WindowProxy).
  let hostOrigin = null;
  let changeTimer = null;
  // Host-initiated loads in flight: the edits they fire are not user edits.
  // A count, not a flag — a host may send its next load before this one settles.
  let loading = 0;

  const post = (type, payload, targetOrigin) => {
    try {
      hostWindow.postMessage({ source: SOURCE_EDITOR, version: PROTOCOL_VERSION, type, payload }, targetOrigin);
    } catch (_) { }
  };

  // Handing the payload to the host is this editor's save — there is no ack in
  // the protocol, so the document stops counting as unsaved work here (the host
  // decides what to do with it in onSave). Any edit debounced just before the
  // click would otherwise ping `change` right after the `save` and re-dirty the
  // host's own close guard.
  const sendSave = () => {
    post('save', getResult(), hostOrigin);
    clearTimeout(changeTimer);
    if (onSaveSent) onSaveSent();
  };

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

  // Host-supplied preview fonts. `data` is an ArrayBuffer or typed array
  // (postMessage structured-clones binary), or base64 text for a host that
  // serializes its messages to JSON.
  const toBytes = (data) => {
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    if (typeof data === 'string') return fontBytesFromSource({ data });
    return null;
  };

  const applyFonts = async (fonts) => {
    if (!Array.isArray(fonts)) {
      post('error', { message: 'fonts must be an array of { name, data }' }, hostOrigin);
      return;
    }
    const usable = [];
    const rejected = [];
    for (const font of fonts) {
      const name = typeof font?.name === 'string' ? font.name.trim() : '';
      const bytes = name ? toBytes(font.data) : null;
      if (bytes) usable.push({ name, bytes });
      else rejected.push(name || String(font?.name));
    }
    rejected.push(...await setHostFonts(usable));
    if (rejected.length > 0) {
      post('error', { message: 'Ignored unusable fonts', names: rejected }, hostOrigin);
    }
  };

  const applyContent = async (payload) => {
    loading++;
    try {
      // Before the import, so the fonts a template declares are matched on the
      // way in rather than attached as an edit on top of it.
      if (payload.fonts !== undefined) {
        await applyFonts(payload.fonts);
      }
      if (payload.template !== undefined && payload.template !== null) {
        const json = typeof payload.template === 'string'
          ? payload.template
          : JSON.stringify(payload.template);
        if (!await importTemplateJson(json)) {
          post('error', { message: 'Invalid template' }, hostOrigin);
        }
      } else if (typeof payload.zpl === 'string') {
        const warnings = await importZPL(payload.zpl);
        if (warnings.length > 0) {
          post('error', { message: 'ZPL imported with warnings', warnings }, hostOrigin);
        }
      }
      // After the import, so host values win over whatever the template carried.
      if (payload.previewData !== undefined) {
        applyPreviewData(payload.previewData);
      }
    } finally {
      // Imports fire elementsChanged/labelSettingsChanged;
      // host-initiated loads shouldn't read as user edits.
      loading--;
      clearTimeout(changeTimer);
    }
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
    } else if (msg.type === 'setFonts') {
      // Through applyContent so matching a font doesn't read as a user edit
      // either. `?? null` keeps a payload with no fonts an error, not a no-op.
      applyContent({ fonts: (msg.payload || {}).fonts ?? null });
    } else if (msg.type === 'requestSave') {
      // Same payload the Save button sends — a host driving the editor from
      // its own chrome gets an identical `save` back.
      sendSave();
    }
  });

  // Debounced dirty ping (no content payload) so hosts can warn on close
  // without the cost of re-serializing on every edit.
  const queueChange = () => {
    if (hostOrigin === null || loading > 0) return;
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
