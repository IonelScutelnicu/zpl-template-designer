/* ============================================================
   gallery/app.js — Template Gallery home screen (vanilla JS)
   ============================================================ */

import { renderTemplateThumb } from './gallery-renderer.js';
import { ZPLGenerator } from '../src/services/ZPLGenerator.js';
import { SerializationService } from '../src/services/SerializationService.js';
import { escapeHtml, escapeAttr, formatDate } from '../src/utils/dom-helpers.js';
import * as driveAuth from './drive-auth.js';
import * as drive from './drive-templates.js';
import { isConfigured } from './drive-config.js';

const zplGenerator = new ZPLGenerator();
const serializationService = new SerializationService();

var DRIVE_SVG_ICON = '<svg width="16" height="16" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="flex-shrink:0">' +
  '<path fill="#0066da" d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0a7.3 7.3 0 0 0 1.05 3.55z"/>' +
  '<path fill="#00ac47" d="M43.65 25L29.9 1.2C28.55 2 27.4 3.1 26.6 4.5L1.05 48.5A7.3 7.3 0 0 0 0 52h27.5z"/>' +
  '<path fill="#ea4335" d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.7-1.2 1.05-2.5 1.05-3.8H59.8L73.55 76.8z"/>' +
  '<path fill="#00832d" d="M43.65 25L57.4 1.2C56.05.45 54.55 0 52.9 0H34.4c-1.65 0-3.15.45-4.5 1.2z"/>' +
  '<path fill="#2684fc" d="M59.8 52H27.5L13.75 75.8c1.35.75 2.85 1.2 4.5 1.2h50.3c1.65 0 3.15-.45 4.5-1.2z"/>' +
  '<path fill="#ffba00" d="M73.4 26.5l-12.75-22.1c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.8 52h27.45a7.3 7.3 0 0 0-1.05-3.8z"/>' +
  '</svg>';

var USE_LABELS = {
  shipping: 'Shipping & logistics',
  retail: 'Retail',
  pharma: 'Pharma & lab',
  food: 'Food & beverage',
  asset: 'Asset / warehouse',
};

var TEMPLATES = [];          // Curated examples
var MY_TEMPLATES = [];       // User's Drive templates
var ALL_TAGS = [];

var state = {
  q: '',
  sort: 'name',
  useSel: [],
  tagSel: [],
  dpiSel: [],
  widthSel: [],
  source: 'both',            // 'mine' | 'examples' | 'both'
  open: null,
  opener: null,
  trapListener: null,
  myLoading: false,
  myError: null,
};

var allCounts = { use: {}, tags: {}, dpi: {}, width: {} };
var allWidths = [];

// Single-slot registry for outside-click listeners attached to `document`.
// Re-renders bind to a slot via bindOutsideClick(slot, fn); the previous
// listener under that slot is removed first so handlers never stack up
// across renders.
var outsideClickHandlers = {};
function bindOutsideClick(slot, handler) {
  if (outsideClickHandlers[slot]) {
    document.removeEventListener('click', outsideClickHandlers[slot]);
  }
  outsideClickHandlers[slot] = handler;
  document.addEventListener('click', handler);
}
function unbindOutsideClick(slot) {
  if (outsideClickHandlers[slot]) {
    document.removeEventListener('click', outsideClickHandlers[slot]);
    delete outsideClickHandlers[slot];
  }
}

// ---- Scroll lock (prevents page jump when Google Picker opens) ----

var savedScrollY = 0;
function lockScroll() {
  savedScrollY = window.scrollY;
  document.body.style.position = 'fixed';
  document.body.style.top = '-' + savedScrollY + 'px';
  document.body.style.left = '0';
  document.body.style.right = '0';
}
function unlockScroll() {
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  window.scrollTo(0, savedScrollY);
}

// ---- Template normalization ----

function deriveId(filePath) {
  return filePath.split('/').pop().replace('.json', '');
}

function deriveDpi(dpmm) {
  var raw = dpmm * 25.4;
  if (raw <= 160) return 152;
  if (raw <= 210) return 203;
  if (raw <= 315) return 300;
  return 600;
}

function normalizeTemplate(json, filePath) {
  var m = json.metadata || {};
  var ls = json.labelSettings || {};
  var dpmm = ls.dpmm || 8;
  return {
    id: deriveId(filePath),
    name: m.name || deriveId(filePath),
    use: m.use || 'shipping',
    media: m.media || (ls.width + '×' + ls.height + ' mm'),
    width_mm: ls.width || 0,
    height_mm: ls.height || 0,
    dpi: deriveDpi(dpmm),
    dpmm: dpmm,
    tags: m.tags || [],
    desc: m.desc || '',
    badge: m.badge || null,
    addedAt: m.addedAt || null,
    thumb: null,
    elements: json.elements || [],
    labelSettings: ls,
    source: 'examples',
  };
}

function normalizeDriveTemplate(json, file) {
  var t = normalizeTemplate(json, 'drive:' + file.id);
  t.id = 'drive:' + file.id;
  t.source = 'mine';
  t.driveFileId = file.id;
  t.driveFileName = file.name;
  t.modifiedTime = file.modifiedTime;
  t.addedAt = file.modifiedTime || file.createdTime || null;
  if (!t.name || t.name === t.id) {
    t.name = (file.name || 'Untitled').replace(/\.json$/i, '');
  }
  return t;
}

document.fonts.ready.then(function () {
  document.documentElement.classList.add('fonts-loaded');
});

function updateHeroStats() {
  var elT = document.getElementById('stat-templates');
  var elB = document.getElementById('stat-barcode-standards');
  if (elT) elT.textContent = allTemplates().length;
  if (elB) elB.textContent = Object.keys(allCounts.tags).length;
  var box = document.querySelector('.hero-stats');
  if (box) box.style.opacity = '1';
}

function allTemplates() {
  return TEMPLATES.concat(MY_TEMPLATES);
}

function buildCounts() {
  allCounts = { use: {}, tags: {}, dpi: {}, width: {} };
  allTemplates().forEach(function (t) {
    allCounts.use[t.use] = (allCounts.use[t.use] || 0) + 1;
    t.tags.forEach(function (s) { allCounts.tags[s] = (allCounts.tags[s] || 0) + 1; });
    allCounts.dpi[String(t.dpi)] = (allCounts.dpi[String(t.dpi)] || 0) + 1;
    allCounts.width[t.width_mm] = (allCounts.width[t.width_mm] || 0) + 1;
  });
  allWidths = Object.keys(allCounts.width)
    .map(function (w) { return parseInt(w, 10); })
    .sort(function (a, b) { return a - b; });
  ALL_TAGS = Object.keys(allCounts.tags).sort(function (a, b) { return a.localeCompare(b); });
}

async function loadTemplates() {
  var index = window.TEMPLATE_INDEX || [];
  var results = await Promise.all(index.map(function (entry) {
    return fetch(entry.file)
      .then(function (r) { return r.json(); })
      .then(function (json) { return normalizeTemplate(json, entry.file); })
      .catch(function (err) {
        console.warn('Failed to load template:', entry.file, err);
        return null;
      });
  }));
  TEMPLATES = results.filter(function (t) { return t !== null; });
  TEMPLATES.forEach(function (t) {
    t.thumb = renderTemplateThumb(t.elements, t.labelSettings);
  });
  buildCounts();
  updateHeroStats();
  render();
}

async function loadMyTemplates() {
  var folder = driveAuth.getFolder();
  if (!driveAuth.isConnected() || !folder) {
    MY_TEMPLATES = [];
    state.myError = null;
    buildCounts();
    updateHeroStats();
    render();
    return;
  }
  state.myLoading = true;
  state.myError = null;
  render();
  try {
    var files = await drive.listFiles(folder.id);
    var loaded = await Promise.all(files.map(function (f) {
      return drive.getFile(f.id)
        .then(function (json) { return normalizeDriveTemplate(json, f); })
        .catch(function (err) {
          console.warn('Failed to load Drive template', f.id, err);
          return null;
        });
    }));
    MY_TEMPLATES = loaded.filter(function (t) { return t !== null; });
    MY_TEMPLATES.forEach(function (t) {
      t.thumb = renderTemplateThumb(t.elements, t.labelSettings);
    });
    state.myLoading = false;
    buildCounts();
    updateHeroStats();
    render();
  } catch (err) {
    console.warn('Failed to list Drive folder:', err);
    state.myLoading = false;
    state.myError = err && err.message ? err.message : 'Failed to load templates from Drive.';
    if (/404|not found/i.test(state.myError)) {
      // Folder gone — drop the cached folder so the user is re-prompted.
      localStorage.removeItem('zebra.drive.folder_id');
      localStorage.removeItem('zebra.drive.folder_name');
      state.myError = 'Drive folder is unavailable. Choose another folder.';
    }
    render();
    toast(state.myError, 'error');
  }
}

// ---- Filtering & sorting ----

function filterTemplates(arr) {
  var q = state.q;
  var useSel = state.useSel;
  var tagSel = state.tagSel;
  var dpiSel = state.dpiSel;
  var widthSel = state.widthSel;

  return arr.filter(function (t) {
    if (q) {
      var hay = [t.name, t.desc, t.media].concat(t.tags).concat([USE_LABELS[t.use], t.dpi + 'dpi']).join(' ').toLowerCase();
      if (hay.indexOf(q.toLowerCase()) === -1) return false;
    }
    if (useSel.length && useSel.indexOf(t.use) === -1) return false;
    if (tagSel.length && !t.tags.some(function (s) { return tagSel.indexOf(s) !== -1; })) return false;
    if (dpiSel.length && dpiSel.indexOf(String(t.dpi)) === -1) return false;
    if (widthSel.length && widthSel.indexOf(t.width_mm) === -1) return false;
    return true;
  });
}

function sortTemplates(arr) {
  return arr.slice().sort(function (a, b) {
    if (state.sort === 'name') return a.name.localeCompare(b.name);
    if (state.sort === 'size') return (a.width_mm * a.height_mm) - (b.width_mm * b.height_mm);
    if (state.sort === 'recent') {
      var aDate = a.addedAt ? new Date(a.addedAt).getTime() : null;
      var bDate = b.addedAt ? new Date(b.addedAt).getTime() : null;
      if (aDate !== null && bDate !== null) return bDate - aDate;
      if (aDate !== null) return -1;
      if (bDate !== null) return 1;
      return 0;
    }
    return 0;
  });
}

function hasActiveFilters() {
  return state.q || state.useSel.length || state.tagSel.length || state.dpiSel.length || state.widthSel.length || state.source !== 'both';
}

// ---- Thumbnail helper ----

function thumbHtml(thumb) {
  if (!thumb) return '';
  return '<img src="' + thumb + '" alt="" style="width:100%;height:100%;object-fit:contain;display:block">';
}

function findTemplateById(id) {
  return allTemplates().filter(function (x) { return x.id === id; })[0] || null;
}

// ---- Editor handoff ----

function openInEditor(t, opts) {
  opts = opts || {};
  if (t.elements && t.elements.length > 0 && t.labelSettings) {
    try {
      var payload = {
        metadata: { name: opts.nameOverride || t.name, use: t.use, desc: t.desc, tags: t.tags },
        elements: t.elements,
        labelSettings: t.labelSettings,
      };
      if (opts.driveFileId) {
        payload.driveFileId = opts.driveFileId;
        payload.driveFolderId = opts.driveFolderId;
      }
      sessionStorage.setItem('gallery_template', JSON.stringify(payload));
    } catch (e) {
      console.warn('Failed to store template in sessionStorage:', e);
    }
  }
  var url = 'index.html';
  if (opts.driveFileId) url += '?drive=' + encodeURIComponent(opts.driveFileId);
  window.location.href = url;
}

function openPrivateInEditor(t) {
  var folder = driveAuth.getFolder();
  openInEditor(t, {
    driveFileId: t.driveFileId,
    driveFolderId: folder ? folder.id : null,
  });
}

function duplicateTemplate(t) {
  var copy = Object.assign({}, t);
  copy.name = (t.name || 'Untitled') + ' (copy)';
  // No driveFileId — first save creates a new file.
  openInEditor(copy, { nameOverride: copy.name });
}

function newBlankTemplate() {
  // Simply navigate to the editor with no template payload.
  // Editor opens a fresh canvas; first Save-to-Drive creates the file.
  sessionStorage.removeItem('gallery_template');
  window.location.href = 'index.html';
}

// ---- Export JSON ----

function exportJson(t) {
  var data = {
    metadata: {
      name: t.name,
      use: t.use,
      media: t.media,
      tags: t.tags,
      desc: t.desc,
    },
    elements: t.elements,
    labelSettings: t.labelSettings,
  };
  if (t.badge) data.metadata.badge = t.badge;
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = (t.driveFileName || (t.id.replace(/^drive:/, '') + '.json'));
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---- Copy ZPL ----

function generateZPLForTemplate(t) {
  var elements = (t.elements || [])
    .map(function (data) { return serializationService.createElementFromData(data, { keepId: true }); })
    .filter(function (el) { return el !== null; });
  return zplGenerator.generateZPL(elements, t.labelSettings || {});
}

async function writeToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // Fall through to textarea fallback.
    }
  }
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'absolute';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  var ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  document.body.removeChild(ta);
  return ok;
}

async function copyZPL(t) {
  var btn = document.getElementById('copy-zpl-btn');
  if (!btn) return;
  var label = btn.querySelector('.label');
  var zpl;
  try {
    zpl = generateZPLForTemplate(t);
  } catch (e) {
    console.warn('Failed to generate ZPL:', e);
    return;
  }
  var ok = await writeToClipboard(zpl);
  if (!ok) return;
  if (label) label.textContent = 'Copied!';
  btn.classList.add('copied');
  setTimeout(function () {
    if (label) label.textContent = 'Copy ZPL';
    btn.classList.remove('copied');
  }, 1500);
}

// ---- Delete ----

async function deletePrivateTemplate(t) {
  var ok = await confirmDialog({
    title: 'Move to Trash?',
    body: 'Template "' + escapeHtml(t.name) + '" will be moved to your Drive Trash. You can restore it from drive.google.com/drive/trash within 30 days.',
    confirmLabel: 'Move to Trash',
  });
  if (!ok) return;
  try {
    await drive.trashFile(t.driveFileId);
    MY_TEMPLATES = MY_TEMPLATES.filter(function (x) { return x.driveFileId !== t.driveFileId; });
    buildCounts();
    updateHeroStats();
    closeModal();
    render();
    toast('Moved to Trash', 'success');
  } catch (err) {
    console.warn('Delete failed', err);
    toast('Couldn\'t delete template. Try again.', 'error');
  }
}

// ---- Build HTML ----

function buildFilters() {
  var sourceOpts = [
    { val: 'both', label: 'Both' },
    { val: 'mine', label: 'Mine' },
    { val: 'examples', label: 'Examples' },
  ].map(function (o) {
    var checked = state.source === o.val ? 'checked' : '';
    return '<label class="opt"><input type="radio" name="source-facet" data-filter="source" data-val="' + o.val + '" ' + checked + '>' +
      o.label + '</label>';
  }).join('');

  var useCaseOpts = Object.keys(USE_LABELS).map(function (k) {
    var checked = state.useSel.indexOf(k) !== -1 ? 'checked' : '';
    return '<label class="opt"><input type="checkbox" data-filter="use" data-val="' + k + '" ' + checked + '>' +
      USE_LABELS[k] + '<span class="count">' + (allCounts.use[k] || 0) + '</span></label>';
  }).join('');

  var tagOpts = ALL_TAGS.map(function (s) {
    var checked = state.tagSel.indexOf(s) !== -1 ? 'checked' : '';
    return '<label class="opt"><input type="checkbox" data-filter="tag" data-val="' + s + '" ' + checked + '>' +
      s + '<span class="count">' + (allCounts.tags[s] || 0) + '</span></label>';
  }).join('');

  var dpiOpts = ['152', '203', '300', '600'].map(function (d) {
    var checked = state.dpiSel.indexOf(d) !== -1 ? 'checked' : '';
    return '<label class="opt"><input type="checkbox" data-filter="dpi" data-val="' + d + '" ' + checked + '>' +
      d + ' dpi<span class="count">' + (allCounts.dpi[d] || 0) + '</span></label>';
  }).join('');

  var widthOpts = allWidths.map(function (w) {
    var checked = state.widthSel.indexOf(w) !== -1 ? 'checked' : '';
    return '<label class="opt"><input type="checkbox" data-filter="width" data-val="' + w + '" ' + checked + '>' +
      w + ' mm<span class="count">' + (allCounts.width[w] || 0) + '</span></label>';
  }).join('');

  return '<div class="group"><h4>Source</h4>' + sourceOpts + '</div>' +
    '<div class="group"><h4>Use case</h4>' + useCaseOpts + '</div>' +
    '<div class="group"><h4>Tags</h4>' + tagOpts + '</div>' +
    '<div class="group"><h4>Print density</h4>' + dpiOpts + '</div>' +
    '<div class="group"><h4>Label width</h4>' + widthOpts + '</div>' +
    '<button class="reset" id="reset-btn">Reset all filters</button>';
}

function buildCard(t) {
  var badges = '';
  if (t.source === 'mine') {
    badges += '<span class="badge mine">mine</span>';
  } else if (t.badge === 'new') {
    badges += '<span class="badge new">new</span>';
  }
  var pills = t.tags.map(function (s) { return '<span class="pill std">' + escapeHtml(s) + '</span>'; }).join('') +
    '<span class="pill">' + t.dpi + ' dpi</span>';
  var actionLabel = t.source === 'mine' ? 'Edit template' : 'Use template';
  var classes = 'tcard' + (t.source === 'mine' ? ' private' : '');
  return '<div class="' + classes + '" data-id="' + escapeAttr(t.id) + '">' +
    '<div class="thumb-wrap">' + badges + thumbHtml(t.thumb) + '</div>' +
    '<div class="meta">' +
      '<div class="name-row"><div class="name">' + escapeHtml(t.name) + '</div><div class="dim">' + escapeHtml(t.media) + '</div></div>' +
      '<div class="desc">' + escapeHtml(t.desc || '') + '</div>' +
      '<div class="pills">' + pills + '</div>' +
    '</div>' +
    '<div class="footer">' +
      '<span class="uses">' + (USE_LABELS[t.use] || escapeHtml(t.use)) + '</span>' +
      '<button class="use-btn" data-id="' + escapeAttr(t.id) + '">' + actionLabel + ' <span class="material-icons-round" aria-hidden="true">arrow_forward</span></button>' +
    '</div>' +
    '</div>';
}

function buildGrid(arr) {
  if (!arr.length) {
    return '<div class="empty"><b>No templates match those filters.</b> Try removing a barcode standard or broadening the use case.</div>';
  }
  return '<div class="grid">' + arr.map(buildCard).join('') + '</div>';
}

function buildExampleModal(t) {
  var badges = '<span class="b">' + USE_LABELS[t.use] + '</span>' +
    t.tags.map(function (s) { return '<span class="b std">' + escapeHtml(s) + '</span>'; }).join('');

  var specRows = '<tr><td>media</td><td><b>' + escapeHtml(t.media) + '</b> · ' + t.width_mm + '×' + t.height_mm + ' mm</td></tr>' +
    '<tr><td>density</td><td><b>' + t.dpi + ' dpi</b> (' + t.dpmm + ' dpmm)</td></tr>' +
    '<tr><td>tags</td><td><b>' + t.tags.map(escapeHtml).join(' · ') + '</b></td></tr>' +
    '<tr><td>category</td><td><b>' + USE_LABELS[t.use] + '</b></td></tr>';

  return '<div class="modal-preview">' +
      '<div class="frame">' + thumbHtml(t.thumb) + '</div>' +
      '<div class="footer-meta">' + escapeHtml(t.media) + ' · ' + t.dpi + ' dpi · ' + t.dpmm + ' dpmm</div>' +
    '</div>' +
    '<div class="modal-body" style="position:relative">' +
      '<button class="close" id="modal-close" aria-label="Close"><span class="material-icons-round" aria-hidden="true">close</span></button>' +
      '<h2 id="modal-title">' + escapeHtml(t.name) + '</h2>' +
      '<div class="badges">' + badges + '</div>' +
      '<p class="desc">' + escapeHtml(t.desc || '') + '</p>' +
      '<div><h4>Specification</h4>' +
        '<table class="spec"><tbody>' + specRows + '</tbody></table>' +
      '</div>' +
      '<div class="actions">' +
        '<button class="btn-primary" id="use-template-btn"><span class="material-icons-round" aria-hidden="true">arrow_forward</span> Use template</button>' +
        '<button class="btn-ghost" id="duplicate-to-drive-btn" title="Save a copy to your Drive folder"><span class="material-icons-round" aria-hidden="true">cloud_upload</span> Save to Drive</button>' +
        '<div class="actions-break"></div>' +
        '<button class="btn-ghost" id="copy-zpl-btn" title="Copy ZPL to clipboard"><span class="material-icons-round" aria-hidden="true">content_copy</span> <span class="label">Copy ZPL</span></button>' +
        '<button class="btn-ghost" id="export-json-btn" title="Download template JSON"><span class="material-icons-round" aria-hidden="true">download</span> Export JSON</button>' +
      '</div>' +
    '</div>';
}

function buildPrivateModal(t) {
  var badges = '<span class="b">' + USE_LABELS[t.use] + '</span>' +
    t.tags.map(function (s) { return '<span class="b std">' + escapeHtml(s) + '</span>'; }).join('');

  var specRows = '<tr><td>media</td><td><b>' + escapeHtml(t.media) + '</b> · ' + t.width_mm + '×' + t.height_mm + ' mm</td></tr>' +
    '<tr><td>density</td><td><b>' + t.dpi + ' dpi</b> (' + t.dpmm + ' dpmm)</td></tr>' +
    '<tr><td>tags</td><td><b>' + t.tags.map(escapeHtml).join(' · ') + '</b></td></tr>' +
    '<tr><td>category</td><td><b>' + USE_LABELS[t.use] + '</b></td></tr>' +
    '<tr><td>last edited</td><td><b>' + (t.modifiedTime ? formatDate(t.modifiedTime) : '—') + '</b></td></tr>';

  return '<div class="modal-preview">' +
      '<div class="frame">' + thumbHtml(t.thumb) + '</div>' +
      '<div class="footer-meta">' + escapeHtml(t.media) + ' · ' + t.dpi + ' dpi · ' + t.dpmm + ' dpmm</div>' +
    '</div>' +
    '<div class="modal-body" style="position:relative">' +
      '<button class="close" id="modal-close" aria-label="Close"><span class="material-icons-round" aria-hidden="true">close</span></button>' +
      '<h2 id="modal-title">' + escapeHtml(t.name) + '</h2>' +
      '<div class="badges">' + badges + '</div>' +
      '<p class="desc">' + escapeHtml(t.desc || '') + '</p>' +
      '<div><h4>Specification</h4>' +
        '<table class="spec"><tbody>' + specRows + '</tbody></table>' +
      '</div>' +
      '<div class="actions">' +
        '<button class="btn-primary" id="edit-template-btn"><span class="material-icons-round" aria-hidden="true">edit</span> Edit</button>' +
        '<button class="btn-ghost" id="delete-template-btn" title="Move to Drive Trash" style="color:var(--warn)"><span class="material-icons-round" aria-hidden="true">delete_outline</span> Delete</button>' +
        '<div class="actions-break"></div>' +
        '<button class="btn-ghost" id="copy-zpl-btn" title="Copy ZPL to clipboard"><span class="material-icons-round" aria-hidden="true">code</span> <span class="label">Copy ZPL</span></button>' +
        '<button class="btn-ghost" id="export-json-btn" title="Download template JSON"><span class="material-icons-round" aria-hidden="true">download</span> Export JSON</button>' +
      '</div>' +
    '</div>';
}

// ---- Modal ----

function openModal(t, triggerEl) {
  state.open = t;
  state.opener = triggerEl || null;
  var scrim = document.getElementById('modal-scrim');
  var content = document.getElementById('modal-content');
  if (t.source === 'mine') {
    content.innerHTML = buildPrivateModal(t);
  } else {
    content.innerHTML = buildExampleModal(t);
  }
  scrim.style.display = 'flex';
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('export-json-btn').addEventListener('click', function () { exportJson(t); });
  document.getElementById('copy-zpl-btn').addEventListener('click', function () { copyZPL(t); });

  if (t.source === 'mine') {
    document.getElementById('edit-template-btn').addEventListener('click', function () { openPrivateInEditor(t); });
    document.getElementById('delete-template-btn').addEventListener('click', function () { deletePrivateTemplate(t); });
  } else {
    document.getElementById('use-template-btn').addEventListener('click', function () { openInEditor(t); });
    document.getElementById('duplicate-to-drive-btn').addEventListener('click', async function () {
      if (!driveAuth.isConnected()) {
        toast('Connect Google Drive first.', 'error');
        return;
      }
      duplicateTemplate(t);
    });
  }
  document.getElementById('modal-close').focus();
  state.trapListener = function (e) {
    if (e.key !== 'Tab') return;
    var focusable = Array.from(content.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ));
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  document.addEventListener('keydown', state.trapListener);
}

function closeModal() {
  state.open = null;
  if (state.trapListener) {
    document.removeEventListener('keydown', state.trapListener);
    state.trapListener = null;
  }
  var opener = state.opener;
  state.opener = null;
  var scrim = document.getElementById('modal-scrim');
  scrim.style.display = 'none';
  document.getElementById('modal-content').innerHTML = '';
  if (opener) opener.focus();
}

// ---- Render ----

function render() {
  document.getElementById('filters').innerHTML = buildFilters();

  var examples = sortTemplates(filterTemplates(TEMPLATES));
  var mine = sortTemplates(filterTemplates(MY_TEMPLATES));
  var clearBtn = hasActiveFilters()
    ? '<a class="more" id="clear-filters" style="cursor:pointer">Clear filters</a>'
    : '';

  var html = '';

  // My templates section (only render if user opted out of "examples-only")
  if (state.source !== 'examples') {
    html += '<section>';
    html += '<div class="section-head">';
    html += '<h2>My templates <span class="count">' + mine.length + '</span></h2>';
    if (driveAuth.isConnected()) {
      var folder = driveAuth.getFolder() || { name: 'Drive' };
      html += '<div class="folder-chip-wrap">';
      html += '<button class="folder-chip" id="folder-chip-btn" aria-haspopup="true" aria-expanded="false">';
      html += DRIVE_SVG_ICON;
      html += '<span>My Drive / ' + escapeHtml(folder.name) + '</span>';
      html += '<span class="material-icons-round" aria-hidden="true">expand_more</span>';
      html += '</button>';
      html += '<div class="folder-chip-dropdown" id="folder-chip-dropdown" style="display:none">';
      html += '<button class="drive-dropdown-item" id="folder-new-btn"><span class="material-icons-round">add</span> New blank template</button>';
      html += '<button class="drive-dropdown-item" id="folder-import-btn"><span class="material-icons-round">upload_file</span> Import JSON</button>';
      html += '<div style="border-top:1px solid var(--line-2);margin:4px 0"></div>';
      html += '<button class="drive-dropdown-item" id="folder-refresh-btn"><span class="material-icons-round">refresh</span> Refresh folder</button>';
      html += '<button class="drive-dropdown-item" id="folder-change-btn"><span class="material-icons-round">drive_file_move</span> Change folder…</button>';
      html += '</div>';
      html += '</div>';
    }
    html += '</div>';

    if (!isConfigured()) {
      html += '<div class="drive-cta error">' +
        '<h3>Google Drive not configured</h3>' +
        '<p>Edit <code>gallery/drive-config.js</code> and add your OAuth Client ID and API Key. Setup steps are in the file\'s comments.</p>' +
        '</div>';
    } else if (!driveAuth.isConnected()) {
      html += '<div class="drive-cta">' +
        '<div class="drive-cta-icon">' + DRIVE_SVG_ICON.replace('width="16" height="16"', 'width="48" height="48"') + '</div>' +
        '<div class="drive-cta-body">' +
          '<h3>Connect Google Drive to use your private templates</h3>' +
          '<p>Your personal <code>.template.json</code> files live in your Drive. Connect once to load them here, edit in the browser, and manually save changes back — no copies stored on our servers.</p>' +
          '<ul class="drive-cta-features">' +
            '<li><span class="material-icons-round" aria-hidden="true">sync</span> Two-way sync — open from Drive, save back as <code>.template.json</code></li>' +
            '<li><span class="material-icons-round" aria-hidden="true">person</span> Your templates, your Drive — use Import from Drive to bring in files shared with you</li>' +
            '<li><span class="material-icons-round" aria-hidden="true">lock</span> <code>drive.file</code> scope — the app only sees files it creates or files you import via Picker</li>' +
          '</ul>' +
        '</div>' +
        '<div class="drive-cta-actions">' +
          '<button class="btn-primary" id="connect-cta-btn">' + DRIVE_SVG_ICON + ' Connect Google Drive</button>' +
        '</div>' +
        '</div>';
    } else if (state.myLoading) {
      html += '<div class="empty"><b>Loading your templates…</b></div>';
    } else if (state.myError) {
      html += '<div class="drive-cta error">' +
        '<h3>Couldn\'t load your templates</h3>' +
        '<p>' + escapeHtml(state.myError) + '</p>' +
        '<button class="btn-primary" id="retry-mine-btn"><span class="material-icons-round" aria-hidden="true">refresh</span> Retry</button>' +
        '</div>';
    } else if (MY_TEMPLATES.length === 0) {
      html += '<div class="empty"><b>No templates yet.</b> Create one from blank, duplicate an example, or import a JSON file.</div>';
    } else {
      html += buildGrid(mine);
    }
    html += '</section>';
  }

  // Examples section
  if (state.source !== 'mine') {
    html += '<section style="margin-top:24px">';
    html += '<div class="section-head"><h2>Example templates <span class="count">' + examples.length + '</span></h2>' + clearBtn + '</div>';
    html += buildGrid(examples);
    html += '</section>';
  }

  document.getElementById('right').innerHTML = html;

  attachFilterListeners();
  attachGridListeners();
  attachMyTemplatesListeners();
}

// ---- Event listeners ----

function attachFilterListeners() {
  document.querySelectorAll('[data-filter]').forEach(function (el) {
    el.addEventListener('change', function () {
      var filter = el.dataset.filter;
      var val = el.dataset.val;
      var parsed = filter === 'width' ? parseInt(val, 10) : val;

      if (filter === 'use') {
        state.useSel = el.checked
          ? state.useSel.concat([parsed])
          : state.useSel.filter(function (x) { return x !== parsed; });
      } else if (filter === 'tag') {
        state.tagSel = el.checked
          ? state.tagSel.concat([parsed])
          : state.tagSel.filter(function (x) { return x !== parsed; });
      } else if (filter === 'dpi') {
        state.dpiSel = el.checked
          ? state.dpiSel.concat([parsed])
          : state.dpiSel.filter(function (x) { return x !== parsed; });
      } else if (filter === 'width') {
        state.widthSel = el.checked
          ? state.widthSel.concat([parsed])
          : state.widthSel.filter(function (x) { return x !== parsed; });
      } else if (filter === 'source') {
        state.source = parsed;
      }
      render();
    });
  });

  var resetBtn = document.getElementById('reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetFilters);
  }
}

function attachGridListeners() {
  document.querySelectorAll('.tcard').forEach(function (card) {
    card.addEventListener('click', function () {
      var id = card.dataset.id;
      var t = findTemplateById(id);
      if (t) openModal(t, card);
    });
  });

  document.querySelectorAll('.use-btn').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var id = btn.dataset.id;
      var t = findTemplateById(id);
      if (!t) return;
      if (t.source === 'mine') openPrivateInEditor(t);
      else openInEditor(t);
    });
  });

  var clearBtn = document.getElementById('clear-filters');
  if (clearBtn) clearBtn.addEventListener('click', resetFilters);
}

function attachMyTemplatesListeners() {
  var connectCta = document.getElementById('connect-cta-btn');
  if (connectCta) connectCta.addEventListener('click', handleConnectClick);

  var retryBtn = document.getElementById('retry-mine-btn');
  if (retryBtn) retryBtn.addEventListener('click', loadMyTemplates);

  var chipBtn = document.getElementById('folder-chip-btn');
  var chipDropdown = document.getElementById('folder-chip-dropdown');
  if (!chipBtn || !chipDropdown) {
    // Chip not rendered this pass (disconnected / loading state). Drop any
    // stale outside-click handler from a previous connected render.
    unbindOutsideClick('folder-chip');
  }
  if (chipBtn && chipDropdown) {
    chipBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = chipDropdown.style.display === 'block';
      chipDropdown.style.display = open ? 'none' : 'block';
      chipBtn.setAttribute('aria-expanded', String(!open));
    });
    // Slot-bound so re-renders replace this handler rather than stacking.
    bindOutsideClick('folder-chip', function () {
      var dd = document.getElementById('folder-chip-dropdown');
      var btn = document.getElementById('folder-chip-btn');
      if (dd) dd.style.display = 'none';
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });

    document.getElementById('folder-new-btn').addEventListener('click', function () {
      chipDropdown.style.display = 'none';
      newBlankTemplate();
    });
    document.getElementById('folder-import-btn').addEventListener('click', function () {
      chipDropdown.style.display = 'none';
      triggerImportJson();
    });
    document.getElementById('folder-refresh-btn').addEventListener('click', function () {
      chipDropdown.style.display = 'none';
      loadMyTemplates();
    });
    document.getElementById('folder-change-btn').addEventListener('click', async function () {
      chipDropdown.style.display = 'none';
      lockScroll();
      try {
        await driveAuth.changeFolder();
        toast('Folder updated', 'success');
        renderHeaderChip();
        render();
        loadMyTemplates();
      } catch (err) {
        if (!/cancelled/i.test(err.message || '')) toast(err.message || 'Failed', 'error');
      } finally {
        unlockScroll();
      }
    });
  }
}

async function handleConnectClick() {
  lockScroll();
  try {
    await driveAuth.signIn();
    renderHeaderChip();
    await chooseInitialFolder();
    toast('Connected to Google Drive', 'success');
    renderHeaderChip();
    loadMyTemplates();
  } catch (err) {
    if (err && /cancelled/i.test(err.message)) return; // user dismissed Picker
    toast(err.message || 'Failed to connect', 'error');
  } finally {
    unlockScroll();
  }
}

async function chooseInitialFolder() {
  // Reuse the last folder the user selected, if any.
  if (driveAuth.getFolder()) return;

  // First time — open the Drive folder picker.
  const folder = await driveAuth.pickFolder();
  driveAuth.setFolder(folder.id, folder.name);
}


function triggerImportJson() {
  var folder = driveAuth.getFolder();
  if (!driveAuth.isConnected() || !folder) {
    toast('Connect Google Drive and select a folder first.', 'error');
    return;
  }
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = function () {
    var file = input.files && input.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = async function () {
      try {
        JSON.parse(reader.result); // validate JSON
      } catch (e) {
        toast('Couldn\'t parse JSON file.', 'error');
        return;
      }
      try {
        await drive.createFile(folder.id, file.name, reader.result);
        toast('Template imported to Drive.', 'success');
        loadMyTemplates();
      } catch (e) {
        toast('Upload failed: ' + (e.message || 'unknown error'), 'error');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function resetFilters() {
  state.q = '';
  state.useSel = [];
  state.tagSel = [];
  state.dpiSel = [];
  state.widthSel = [];
  state.source = 'both';
  var searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';
  render();
}

// ---- Header chip ----

function renderHeaderChip() {
  var host = document.getElementById('drive-auth-chip');
  if (!host) return;

  if (!isConfigured()) {
    host.innerHTML = '<button class="drive-connect-btn" id="drive-connect-disabled" title="Drive not configured" disabled style="opacity:0.5;cursor:not-allowed">' +
      '<span class="material-icons-round">cloud_off</span> Drive not set up</button>';
    unbindOutsideClick('drive-profile');
    return;
  }

  var s = driveAuth.getState();
  if (!s.connected) {
    host.innerHTML = '<button class="drive-connect-btn" id="drive-connect-btn">' +
      DRIVE_SVG_ICON +
      '<span>Connect Drive</span></button>';
    unbindOutsideClick('drive-profile');
    document.getElementById('drive-connect-btn').addEventListener('click', handleConnectClick);
    return;
  }

  var profile = s.profile || {};
  var folder = s.folder || { name: 'Drive' };
  var initial = (profile.name || '?').charAt(0).toUpperCase();
  var avatarHtml = profile.picture
    ? '<span class="drive-avatar"><img src="' + escapeAttr(profile.picture) + '" alt=""></span>'
    : '<span class="drive-avatar">' + escapeHtml(initial) + '</span>';

  host.innerHTML = '<div class="drive-chip">' +
    '<button class="drive-profile-btn" id="drive-profile-btn" aria-haspopup="true" aria-expanded="false">' +
      avatarHtml +
      '<span>' + escapeHtml(profile.name || 'Connected') + '</span>' +
      '<span class="material-icons-round" style="font-size:14px;color:var(--ink-4)">expand_more</span>' +
    '</button>' +
    '<div class="drive-dropdown" id="drive-dropdown" style="display:none">' +
      '<button class="drive-dropdown-item danger" id="drive-disconnect"><span class="material-icons-round">logout</span> Disconnect</button>' +
    '</div>' +
  '</div>';

  var profileBtn = document.getElementById('drive-profile-btn');
  var dropdown = document.getElementById('drive-dropdown');
  profileBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    var open = dropdown.style.display === 'block';
    dropdown.style.display = open ? 'none' : 'block';
    profileBtn.setAttribute('aria-expanded', String(!open));
  });
  // Slot-bound: each header-chip re-render replaces this handler instead of stacking.
  bindOutsideClick('drive-profile', function () {
    var dd = document.getElementById('drive-dropdown');
    var btn = document.getElementById('drive-profile-btn');
    if (dd) dd.style.display = 'none';
    if (btn) btn.setAttribute('aria-expanded', 'false');
  });
  document.getElementById('drive-disconnect').addEventListener('click', async function () {
    dropdown.style.display = 'none';
    var ok = await confirmDialog({
      title: 'Disconnect Google Drive?',
      body: 'Your templates remain in your Drive folder, but won\'t appear here until you reconnect.',
      confirmLabel: 'Disconnect',
    });
    if (!ok) return;
    await driveAuth.disconnect();
    toast('Disconnected', 'success');
    MY_TEMPLATES = [];
    state.myError = null;
    buildCounts();
    updateHeroStats();
    renderHeaderChip();
    render();
  });
}

// ---- Toast helper ----

function toast(message, kind) {
  var host = document.getElementById('toast-host');
  if (!host) return;
  var el = document.createElement('div');
  el.className = 'toast' + (kind ? ' ' + kind : '');
  var iconName = kind === 'error' ? 'error_outline' : kind === 'success' ? 'check_circle' : 'info';
  el.innerHTML = '<span class="material-icons-round">' + iconName + '</span><span></span>';
  el.querySelector('span:last-child').textContent = message;
  host.appendChild(el);
  setTimeout(function () {
    el.classList.add('fade-out');
    setTimeout(function () { el.remove(); }, 200);
  }, 3200);
}

// ---- Confirm dialog helper ----

function confirmDialog(opts) {
  return new Promise(function (resolve) {
    var scrim = document.getElementById('confirm-scrim');
    if (!scrim) return resolve(window.confirm(opts.body));
    document.getElementById('confirm-title').textContent = opts.title || 'Confirm';
    document.getElementById('confirm-body').textContent = opts.body || '';
    var okBtn = document.getElementById('confirm-ok');
    var cancelBtn = document.getElementById('confirm-cancel');
    okBtn.textContent = opts.confirmLabel || 'OK';
    scrim.style.display = 'flex';

    function cleanup(result) {
      scrim.style.display = 'none';
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      scrim.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey);
      resolve(result);
    }
    function onOk() { cleanup(true); }
    function onCancel() { cleanup(false); }
    function onBackdrop(e) { if (e.target === scrim) cleanup(false); }
    function onKey(e) {
      if (e.key === 'Escape') cleanup(false);
      if (e.key === 'Enter') cleanup(true);
    }
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    scrim.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey);
    cancelBtn.focus();
  });
}

// ---- Init ----

document.addEventListener('DOMContentLoaded', function () {
  var searchInput = document.getElementById('search-input');
  var sortSelect = document.getElementById('sort-select');
  var modalScrim = document.getElementById('modal-scrim');

  searchInput.addEventListener('input', function (e) {
    state.q = e.target.value;
    render();
  });

  sortSelect.addEventListener('change', function (e) {
    state.sort = e.target.value;
    render();
  });

  modalScrim.addEventListener('click', function (e) {
    if (e.target === e.currentTarget) closeModal();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.open) closeModal();
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      searchInput.focus();
    }
  });

  driveAuth.subscribe(function () {
    renderHeaderChip();
  });

  renderHeaderChip();
  driveAuth.refreshProfileIfMissing();
  loadTemplates();
  if (driveAuth.isConnected()) loadMyTemplates();
});
