/* ============================================================
   gallery/app.js — Template Gallery home screen (vanilla JS)
   ============================================================ */

import { renderTemplateThumb } from './gallery-renderer.js';
import { ZPLGenerator } from '../src/services/ZPLGenerator.js';
import { SerializationService } from '../src/services/SerializationService.js';

const zplGenerator = new ZPLGenerator();
const serializationService = new SerializationService();

var USE_LABELS = {
  shipping: 'Shipping & logistics',
  retail: 'Retail',
  pharma: 'Pharma & lab',
  food: 'Food & beverage',
  asset: 'Asset / warehouse',
};

var TEMPLATES = [];
var ALL_TAGS = [];

var state = {
  q: '',
  sort: 'name',
  useSel: [],
  tagSel: [],
  dpiSel: [],
  widthSel: [],
  open: null,
  opener: null,
  trapListener: null,
};

var allCounts = { use: {}, tags: {}, dpi: {}, width: {} };
var allWidths = [];

// ---- Template loading ----

function deriveId(filePath) {
  return filePath.split('/').pop().replace('.json', '');
}

function deriveDpi(dpmm) {
  var raw = dpmm * 25.4;
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
  };
}

document.fonts.ready.then(function () {
  document.documentElement.classList.add('fonts-loaded');
});

function updateHeroStats() {
  var elT = document.getElementById('stat-templates');
  var elB = document.getElementById('stat-barcode-standards');
  if (elT) elT.textContent = TEMPLATES.length;
  if (elB) elB.textContent = Object.keys(allCounts.tags).length;
  var box = document.querySelector('.hero-stats');
  if (box) box.style.opacity = '1';
}

function buildCounts() {
  allCounts = { use: {}, tags: {}, dpi: {}, width: {} };
  TEMPLATES.forEach(function (t) {
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

// ---- Filtering & sorting ----

function filterTemplates() {
  var q = state.q;
  var useSel = state.useSel;
  var tagSel = state.tagSel;
  var dpiSel = state.dpiSel;
  var widthSel = state.widthSel;

  return TEMPLATES.filter(function (t) {
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
  return state.q || state.useSel.length || state.tagSel.length || state.dpiSel.length || state.widthSel.length;
}

// ---- Thumbnail helper ----

function thumbHtml(thumb) {
  if (!thumb) return '';
  return '<img src="' + thumb + '" alt="" style="width:100%;height:100%;object-fit:contain;display:block">';
}

// ---- Open in editor ----

function openInEditor(t) {
  if (t.elements && t.elements.length > 0 && t.labelSettings) {
    try {
      sessionStorage.setItem('gallery_template', JSON.stringify({
        metadata: { name: t.name, use: t.use, desc: t.desc, tags: t.tags },
        elements: t.elements,
        labelSettings: t.labelSettings,
      }));
    } catch (e) {
      console.warn('Failed to store template in sessionStorage:', e);
    }
  }
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
  a.download = t.id + '.json';
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

// ---- Build HTML ----

function buildFilters() {
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

  var dpiOpts = ['203', '300', '600'].map(function (d) {
    var checked = state.dpiSel.indexOf(d) !== -1 ? 'checked' : '';
    return '<label class="opt"><input type="checkbox" data-filter="dpi" data-val="' + d + '" ' + checked + '>' +
      d + ' dpi<span class="count">' + (allCounts.dpi[d] || 0) + '</span></label>';
  }).join('');

  var widthOpts = allWidths.map(function (w) {
    var checked = state.widthSel.indexOf(w) !== -1 ? 'checked' : '';
    return '<label class="opt"><input type="checkbox" data-filter="width" data-val="' + w + '" ' + checked + '>' +
      w + ' mm<span class="count">' + (allCounts.width[w] || 0) + '</span></label>';
  }).join('');

  return '<div class="group"><h4>Use case</h4>' + useCaseOpts + '</div>' +
    '<div class="group"><h4>Tags</h4>' + tagOpts + '</div>' +
    '<div class="group"><h4>Print density</h4>' + dpiOpts + '</div>' +
    '<div class="group"><h4>Label width</h4>' + widthOpts + '</div>' +
    '<button class="reset" id="reset-btn">Reset all filters</button>';
}

function buildCard(t) {
  var badge = t.badge === 'new' ? '<span class="badge new">new</span>' : '';
  var pills = t.tags.map(function (s) { return '<span class="pill std">' + s + '</span>'; }).join('') +
    '<span class="pill">' + t.dpi + ' dpi</span>';
  return '<div class="tcard" data-id="' + t.id + '">' +
    '<div class="thumb-wrap">' + badge + thumbHtml(t.thumb) + '</div>' +
    '<div class="meta">' +
      '<div class="name-row"><div class="name">' + t.name + '</div><div class="dim">' + t.media + '</div></div>' +
      '<div class="desc">' + t.desc + '</div>' +
      '<div class="pills">' + pills + '</div>' +
    '</div>' +
    '<div class="footer">' +
      '<span class="uses">' + USE_LABELS[t.use] + '</span>' +
      '<button class="use-btn" data-id="' + t.id + '">Use template <span class="material-icons-round" aria-hidden="true">arrow_forward</span></button>' +
    '</div>' +
    '</div>';
}

function buildGrid(arr) {
  if (!arr.length) {
    return '<div class="empty"><b>No templates match those filters.</b> Try removing a barcode standard or broadening the use case.</div>';
  }
  return '<div class="grid">' + arr.map(buildCard).join('') + '</div>';
}

function buildModal(t) {
  var badges = '<span class="b">' + USE_LABELS[t.use] + '</span>' +
    t.tags.map(function (s) { return '<span class="b std">' + s + '</span>'; }).join('');

  var specRows = '<tr><td>media</td><td><b>' + t.media + '</b> · ' + t.width_mm + '×' + t.height_mm + ' mm</td></tr>' +
    '<tr><td>density</td><td><b>' + t.dpi + ' dpi</b> (' + t.dpmm + ' dpmm)</td></tr>' +
    '<tr><td>tags</td><td><b>' + t.tags.join(' · ') + '</b></td></tr>' +
    '<tr><td>category</td><td><b>' + USE_LABELS[t.use] + '</b></td></tr>';

  return '<div class="modal-preview">' +
      '<div class="frame">' + thumbHtml(t.thumb) + '</div>' +
      '<div class="footer-meta">' + t.media + ' · ' + t.dpi + ' dpi · ' + t.dpmm + ' dpmm</div>' +
    '</div>' +
    '<div class="modal-body" style="position:relative">' +
      '<button class="close" id="modal-close" aria-label="Close"><span class="material-icons-round" aria-hidden="true">close</span></button>' +
      '<h2 id="modal-title">' + t.name + '</h2>' +
      '<div class="badges">' + badges + '</div>' +
      '<p class="desc">' + t.desc + '</p>' +
      '<div><h4>Specification</h4>' +
        '<table class="spec"><tbody>' + specRows + '</tbody></table>' +
      '</div>' +
      '<div class="actions">' +
        '<button class="btn-primary" id="use-template-btn"><span class="material-icons-round" aria-hidden="true">arrow_forward</span> Use template</button>' +
        '<button class="btn-ghost" id="copy-zpl-btn" title="Copy ZPL to clipboard"><span class="material-icons-round" aria-hidden="true">content_copy</span> <span class="label">Copy ZPL</span></button>' +
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
  content.innerHTML = buildModal(t);
  scrim.style.display = 'flex';
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('use-template-btn').addEventListener('click', function () { openInEditor(t); });
  document.getElementById('export-json-btn').addEventListener('click', function () { exportJson(t); });
  document.getElementById('copy-zpl-btn').addEventListener('click', function () { copyZPL(t); });
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
  var filtered = sortTemplates(filterTemplates());

  document.getElementById('filters').innerHTML = buildFilters();

  var clearBtn = hasActiveFilters()
    ? '<a class="more" id="clear-filters" style="cursor:pointer">Clear filters</a>'
    : '';

  document.getElementById('right').innerHTML =
    '<section>' +
      '<div class="section-head">' +
        '<h2>Example templates <span class="count">' + filtered.length + '</span></h2>' +
        clearBtn +
      '</div>' +
      buildGrid(filtered) +
    '</section>';

  attachFilterListeners();
  attachGridListeners();
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
    card.addEventListener('click', function (e) {
      var id = card.dataset.id;
      var t = TEMPLATES.filter(function (x) { return x.id === id; })[0];
      if (t) openModal(t, card);
    });
  });

  document.querySelectorAll('.use-btn').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var id = btn.dataset.id;
      var t = TEMPLATES.filter(function (x) { return x.id === id; })[0];
      if (t) openModal(t, btn);
    });
  });

  var clearBtn = document.getElementById('clear-filters');
  if (clearBtn) {
    clearBtn.addEventListener('click', resetFilters);
  }
}

function resetFilters() {
  state.q = '';
  state.useSel = [];
  state.tagSel = [];
  state.dpiSel = [];
  state.widthSel = [];
  var searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';
  render();
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

  loadTemplates();
});
