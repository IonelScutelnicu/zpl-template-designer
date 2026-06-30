// Properties Panel Renderer
// Generates HTML for the element properties editing panel

import { BUILTIN_FONTS, FONT_LABELS } from '../config/constants.js';
import { getBitmapFontAllowedSizes } from '../utils/zplFontSnap.js';
import { escapeHtml, escapeAttr } from '../utils/dom-helpers.js';
import { SYMBOLOGY_LABELS, SYMBOLOGY_META, BARCODE_SYMBOLOGIES, QR_SYMBOLOGIES, BARCODE_2D_SIZE_BOUNDS } from '../utils/barcodeGeometry.js';

// Small inline-SVG glyphs for the symbology picker. Linear symbologies share one
// barcode glyph; the 2D ones get a representative matrix/stacked glyph.
const THUMB_LINEAR = `<svg viewBox="0 0 40 32" class="w-7 h-7" fill="currentColor" aria-hidden="true"><rect x="3" y="6" width="2" height="20"/><rect x="7" y="6" width="1" height="20"/><rect x="10" y="6" width="3" height="20"/><rect x="15" y="6" width="1" height="20"/><rect x="18" y="6" width="2" height="20"/><rect x="22" y="6" width="1" height="20"/><rect x="25" y="6" width="2" height="20"/><rect x="29" y="6" width="3" height="20"/><rect x="34" y="6" width="1" height="20"/><rect x="37" y="6" width="2" height="20"/></svg>`;
const THUMB_QR = `<svg viewBox="0 0 32 32" class="w-7 h-7" fill="currentColor" aria-hidden="true"><rect x="2" y="2" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="4.5" y="4.5" width="3" height="3"/><rect x="22" y="2" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="24.5" y="4.5" width="3" height="3"/><rect x="2" y="22" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="4.5" y="24.5" width="3" height="3"/><rect x="14" y="3" width="2" height="2"/><rect x="17" y="6" width="2" height="2"/><rect x="13" y="13" width="2" height="2"/><rect x="16" y="13" width="2" height="2"/><rect x="20" y="16" width="2" height="2"/><rect x="24" y="20" width="2" height="2"/><rect x="27" y="24" width="2" height="2"/><rect x="22" y="26" width="2" height="2"/><rect x="16" y="22" width="2" height="2"/><rect x="13" y="19" width="2" height="2"/></svg>`;
const THUMB_DATAMATRIX = `<svg viewBox="0 0 32 32" class="w-7 h-7" fill="currentColor" aria-hidden="true"><rect x="3" y="3" width="2" height="26"/><rect x="3" y="27" width="26" height="2"/><rect x="5" y="3" width="2" height="2"/><rect x="9" y="3" width="2" height="2"/><rect x="13" y="3" width="2" height="2"/><rect x="17" y="3" width="2" height="2"/><rect x="21" y="3" width="2" height="2"/><rect x="25" y="3" width="2" height="2"/><rect x="27" y="5" width="2" height="2"/><rect x="27" y="9" width="2" height="2"/><rect x="27" y="13" width="2" height="2"/><rect x="27" y="17" width="2" height="2"/><rect x="27" y="21" width="2" height="2"/><rect x="27" y="25" width="2" height="2"/><rect x="7" y="7" width="2" height="2"/><rect x="11" y="9" width="2" height="2"/><rect x="15" y="7" width="2" height="2"/><rect x="19" y="11" width="2" height="2"/><rect x="9" y="15" width="2" height="2"/><rect x="13" y="17" width="2" height="2"/><rect x="17" y="15" width="2" height="2"/><rect x="21" y="19" width="2" height="2"/><rect x="11" y="21" width="2" height="2"/><rect x="19" y="23" width="2" height="2"/><rect x="15" y="23" width="2" height="2"/><rect x="23" y="15" width="2" height="2"/></svg>`;
const THUMB_PDF417 = `<svg viewBox="0 0 40 32" class="w-7 h-7" fill="currentColor" aria-hidden="true"><rect x="3" y="5" width="3" height="22"/><rect x="8" y="5" width="1" height="22"/><rect x="11" y="5" width="2" height="22"/><rect x="15" y="5" width="1" height="22"/><rect x="18" y="5" width="3" height="22"/><rect x="23" y="5" width="1" height="22"/><rect x="26" y="5" width="2" height="22"/><rect x="30" y="5" width="1" height="22"/><rect x="34" y="5" width="3" height="22"/><rect x="0" y="10" width="40" height="1.2" fill="white"/><rect x="0" y="16" width="40" height="1.2" fill="white"/><rect x="0" y="22" width="40" height="1.2" fill="white"/></svg>`;
// Aztec: concentric central bullseye finder with scattered data modules.
const THUMB_MAXICODE = `<svg viewBox="0 0 32 32" class="w-7 h-7" fill="currentColor" aria-hidden="true"><circle cx="16" cy="16" r="2.5"/><circle cx="16" cy="16" r="5.5" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="16" cy="16" r="8.5" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="3" y="4" width="2.4" height="2.8"/><rect x="8" y="5" width="2.4" height="2.8"/><rect x="26" y="4" width="2.4" height="2.8"/><rect x="22" y="6" width="2.4" height="2.8"/><rect x="3" y="13" width="2.4" height="2.8"/><rect x="3" y="22" width="2.4" height="2.8"/><rect x="26" y="13" width="2.4" height="2.8"/><rect x="26" y="22" width="2.4" height="2.8"/><rect x="8" y="25" width="2.4" height="2.8"/><rect x="22" y="25" width="2.4" height="2.8"/><rect x="14" y="25" width="2.4" height="2.8"/></svg>`;
const THUMB_AZTEC = `<svg viewBox="0 0 32 32" class="w-7 h-7" fill="currentColor" aria-hidden="true"><rect x="10" y="10" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="13" y="13" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="15" y="15" width="2" height="2"/><rect x="3" y="3" width="2" height="2"/><rect x="7" y="3" width="2" height="2"/><rect x="11" y="3" width="2" height="2"/><rect x="19" y="3" width="2" height="2"/><rect x="27" y="3" width="2" height="2"/><rect x="3" y="7" width="2" height="2"/><rect x="3" y="15" width="2" height="2"/><rect x="3" y="23" width="2" height="2"/><rect x="3" y="27" width="2" height="2"/><rect x="27" y="7" width="2" height="2"/><rect x="27" y="11" width="2" height="2"/><rect x="27" y="19" width="2" height="2"/><rect x="27" y="27" width="2" height="2"/><rect x="7" y="27" width="2" height="2"/><rect x="15" y="27" width="2" height="2"/><rect x="23" y="27" width="2" height="2"/><rect x="23" y="7" width="2" height="2"/></svg>`;
const SYMBOLOGY_THUMBS = {
  CODE128: THUMB_LINEAR,
  CODE39: THUMB_LINEAR,
  CODE93: THUMB_LINEAR,
  CODE11: THUMB_LINEAR,
  CODABAR: THUMB_LINEAR,
  INTERLEAVED2OF5: THUMB_LINEAR,
  INDUSTRIAL2OF5: THUMB_LINEAR,
  STANDARD2OF5: THUMB_LINEAR,
  LOGMARS: THUMB_LINEAR,
  MSI: THUMB_LINEAR,
  PLESSEY: THUMB_LINEAR,
  PLANET: THUMB_LINEAR,
  POSTNET: THUMB_LINEAR,
  EAN13: THUMB_LINEAR,
  EAN8: THUMB_LINEAR,
  UPCA: THUMB_LINEAR,
  UPCE: THUMB_LINEAR,
  UPCEANEXT: THUMB_LINEAR,
  QR: THUMB_QR,
  DATAMATRIX: THUMB_DATAMATRIX,
  PDF417: THUMB_PDF417,
  MICROPDF417: THUMB_PDF417,
  CODE49: THUMB_PDF417,
  CODABLOCK: THUMB_PDF417,
  MAXICODE: THUMB_MAXICODE,
  GS1DATABAR: THUMB_LINEAR,
  AZTEC: THUMB_AZTEC,
};

/**
 * Renderer for the properties panel UI
 */
export class PropertiesPanelRenderer {
  constructor(getLabelSettingsFn, getSectionStateFn) {
    this.getLabelSettings = getLabelSettingsFn;
    this.getSectionState = getSectionStateFn;
  }

  get labelSettings() {
    return this.getLabelSettings();
  }

  /**
   * Render the complete properties panel
   * @param {Object|Array|null} selection - Currently selected element(s)
   * @returns {string} HTML string
   */
  render(selection) {
    const list = Array.isArray(selection) ? selection : (selection ? [selection] : []);

    if (list.length === 0) {
      return '<p class="text-center text-slate-400 py-12 italic text-sm">Select an element to edit properties</p>';
    }

    if (list.length === 1) {
      const content = this.renderElementProperties(list[0]);
      return `<div class="animate-fade-in">${content}</div>`;
    }

    return `<div class="animate-fade-in">${this.renderMultiSelectionSummary(list)}</div>`;
  }

  /**
   * Render the summary + group-action panel shown when 2+ elements are selected.
   * Per-field editing isn't offered for multi-selections; instead we expose
   * align/distribute/delete actions over the whole group.
   */
  renderMultiSelectionSummary(elements) {
    const count = elements.length;
    const lockedCount = elements.filter(el => el.locked).length;
    const distributeDisabled = count < 3;
    // Match size only applies to resizable, unlocked elements; needs at least 2.
    const matchableCount = elements.filter(el => !el.locked && el.canMatchLabelSize?.()).length;
    const matchDisabled = matchableCount < 2;

    const alignBtn = (action, icon, tooltip) => `
      <button type="button" data-group-align="${action}"
        class="group flex items-center justify-center h-10 bg-white border border-slate-200 rounded-md hover:border-blue-500 hover:bg-blue-50 transition-all"
        data-tooltip="${tooltip}">
        <span class="material-icons-round text-slate-400 group-hover:text-blue-500 transition-colors">${icon}</span>
      </button>`;

    const distributeBtn = (axis, icon, tooltip) => `
      <button type="button" data-group-distribute="${axis}" ${distributeDisabled ? 'disabled' : ''}
        class="group flex items-center justify-center h-10 bg-white border border-slate-200 rounded-md hover:border-blue-500 hover:bg-blue-50 transition-all ${distributeDisabled ? 'opacity-50 cursor-not-allowed hover:border-slate-200 hover:bg-white' : ''}"
        data-tooltip="${tooltip}">
        <span class="material-icons-round text-slate-400 group-hover:text-blue-500 transition-colors">${icon}</span>
      </button>`;

    const labelAlignBtn = (action, icon, tooltip) => `
      <button type="button" data-group-align-label="${action}"
        class="group flex items-center justify-center h-10 bg-white border border-slate-200 rounded-md hover:border-blue-500 hover:bg-blue-50 transition-all"
        data-tooltip="${tooltip}">
        <span class="material-icons-round text-slate-400 group-hover:text-blue-500 transition-colors">${icon}</span>
      </button>`;

    const matchBtn = (dimension, icon, tooltip) => `
      <button type="button" data-group-match="${dimension}" ${matchDisabled ? 'disabled' : ''}
        class="group flex items-center justify-center h-10 bg-white border border-slate-200 rounded-md hover:border-blue-500 hover:bg-blue-50 transition-all ${matchDisabled ? 'opacity-50 cursor-not-allowed hover:border-slate-200 hover:bg-white' : ''}"
        data-tooltip="${tooltip}">
        <span class="material-icons-round text-slate-400 group-hover:text-blue-500 transition-colors">${icon}</span>
      </button>`;

    const lockedNote = lockedCount > 0
      ? `<p class="text-xs text-amber-600 mt-2">${lockedCount} locked element${lockedCount > 1 ? 's' : ''} excluded from group actions</p>`
      : '';

    return `
      <div class="px-1">
        <div class="flex items-center gap-2 mb-4">
          <span class="material-icons-round text-blue-500">select_all</span>
          <h3 class="text-sm font-semibold text-slate-700">${count} elements selected</h3>
        </div>

        ${this.renderSection("Align", `
          <div class="grid grid-cols-6 gap-2">
            ${alignBtn('left', 'align_horizontal_left', 'Align Left')}
            ${alignBtn('center-h', 'align_horizontal_center', 'Align Center')}
            ${alignBtn('right', 'align_horizontal_right', 'Align Right')}
            ${alignBtn('top', 'align_vertical_top', 'Align Top')}
            ${alignBtn('middle', 'align_vertical_center', 'Align Middle')}
            ${alignBtn('bottom', 'align_vertical_bottom', 'Align Bottom')}
          </div>
        `, { open: true })}

        ${this.renderSection("Distribute", `
          <div class="grid grid-cols-2 gap-2">
            ${distributeBtn('horizontal', 'horizontal_distribute', 'Distribute Horizontally')}
            ${distributeBtn('vertical', 'vertical_distribute', 'Distribute Vertically')}
          </div>
          ${distributeDisabled ? '<p class="text-xs text-slate-400 mt-2">Select 3+ elements to distribute</p>' : ''}
        `, { open: true })}

        ${this.renderSection("Align to label", `
          <div class="grid grid-cols-6 gap-2">
            ${labelAlignBtn('left', 'align_horizontal_left', 'Align group to label left edge')}
            ${labelAlignBtn('center-x', 'align_horizontal_center', 'Center group horizontally on label')}
            ${labelAlignBtn('right', 'align_horizontal_right', 'Align group to label right edge')}
            ${labelAlignBtn('top', 'align_vertical_top', 'Align group to label top edge')}
            ${labelAlignBtn('center-y', 'align_vertical_center', 'Center group vertically on label')}
            ${labelAlignBtn('bottom', 'align_vertical_bottom', 'Align group to label bottom edge')}
          </div>
        `, { open: true })}

        ${this.renderSection("Match size", `
          <div class="grid grid-cols-2 gap-2">
            ${matchBtn('width', 'swap_horiz', 'Match width to largest')}
            ${matchBtn('height', 'swap_vert', 'Match height to largest')}
          </div>
          ${matchDisabled ? '<p class="text-xs text-slate-400 mt-2">Select 2+ resizable elements to match size</p>' : ''}
        `, { open: true })}

        <button type="button" data-group-action="delete"
          class="w-full mt-3 flex items-center justify-center gap-2 h-10 bg-white border border-red-200 text-red-600 rounded-md hover:border-red-500 hover:bg-red-50 transition-all">
          <span class="material-icons-round text-base">delete</span>
          <span class="text-sm font-medium">Delete ${count - lockedCount} element${count - lockedCount === 1 ? '' : 's'}</span>
        </button>
        ${lockedNote}
      </div>`;
  }

  /**
   * Render properties based on element type
   */
  renderElementProperties(element) {
    const renderers = {
      TEXT: () => this.renderTextProperties(element),
      TEXTBLOCK: () => this.renderTextBlockProperties(element),
      BARCODE: () => this.renderBarcodeProperties(element),
      QRCODE: () => this.renderQRCodeProperties(element),
      BOX: () => this.renderBoxProperties(element),
      LINE: () => this.renderLineProperties(element),
      DIAGONALLINE: () => this.renderDiagonalLineProperties(element),
      FIELDBLOCK: () => this.renderFieldBlockProperties(element),
      CIRCLE: () => this.renderCircleProperties(element),
      GRAPHIC: () => this.renderGraphicProperties(element)
    };

    const renderer = renderers[element.type];
    return renderer ? renderer() : '<p>Unknown element type</p>';
  }

  /**
   * Render a collapsible section
   */
  renderSection(title, body, options = {}) {
    const { open = true, elementType = null } = options;

    let isOpen = open;
    if (elementType && this.getSectionState) {
      isOpen = this.getSectionState(elementType, title);
    }

    const dataAttr = elementType ? `data-element-type="${elementType}" data-section-title="${title}"` : '';

    return `
      <details class="group mb-3 border-b border-slate-200 pb-3 section-collapsible" ${isOpen ? "open" : ""} ${dataAttr}>
        <summary class="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500 cursor-pointer select-none">
          <span>${title}</span>
          <span class="transition group-open:rotate-180">
            <svg fill="none" height="14" shape-rendering="geometricPrecision" stroke="currentColor"
              stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" viewBox="0 0 24 24" width="14">
              <path d="M6 9l6 6 6-6"></path>
            </svg>
          </span>
        </summary>
        <div class="mt-3">
          ${body}
        </div>
      </details>
    `;
  }

  /**
   * Create an input group with label
   */
  createInputGroup(label, id, value, type = "text", options = {}) {
    const { min, max, step, placeholder } = options;
    const attributes = [
      min !== undefined ? `min="${min}"` : "",
      max !== undefined ? `max="${max}"` : "",
      step !== undefined ? `step="${step}"` : "",
      placeholder !== undefined ? `placeholder="${placeholder}"` : "",
    ].join(" ");

    // For number inputs with 0 meaning "use default", show empty instead of 0
    const displayValue = (type === "number" && value === 0 && placeholder) ? "" : value;

    return `
      <div class="mb-3">
        <label class="block text-xs font-medium text-slate-700 mb-1">${label}</label>
        <input
          type="${type}"
          id="${id}"
          value="${escapeAttr(displayValue)}"
          ${attributes}
          class="w-full rounded-md border border-slate-200 py-1.5 px-2 text-xs text-slate-700 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white"
        >
      </div>
    `;
  }

  /**
   * Render a labelled <select>. `options` is an array of [value, label] pairs.
   */
  createSelectGroup(label, id, value, options) {
    return `
      <div class="mb-3">
        <label class="block text-xs font-medium text-slate-700 mb-1">${label}</label>
        <select id="${id}" class="w-full rounded-md border border-slate-200 py-1.5 px-2 text-xs text-slate-700 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white">
          ${options.map(([v, lbl]) => `<option value="${escapeAttr(v)}" ${String(value) === String(v) ? "selected" : ""}>${lbl}</option>`).join("")}
        </select>
      </div>
    `;
  }

  /**
   * Render the custom Symbology picker: a styled trigger button + popover list
   * of symbologies (thumbnail, name, ZPL command, description). A visually
   * hidden native <select id="prop-symbology"> holds the canonical value so the
   * change wiring (and tests) keep working; the popover dispatches to it.
   * `symbologies` is the ordered list of codes valid for this element type.
   */
  renderSymbologyPicker(current, symbologies) {
    const cat = SYMBOLOGY_META[current]?.dim === '2D' ? '2D · MATRIX' : '1D · LINEAR';
    const triggerInfo = this.renderSymbologyInfo(current, false);
    const options = symbologies.map((sym) => {
      const selected = sym === current;
      const selClasses = selected ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-slate-50';
      return `
        <button type="button" role="option" data-symbology="${sym}" aria-selected="${selected}"
          class="symbology-option w-full flex items-center gap-3 rounded-lg px-2 py-2 text-left transition ${selClasses}">
          ${this.renderSymbologyInfo(sym, true)}
          <span class="material-icons-round text-blue-500 text-lg shrink-0 ${selected ? '' : 'invisible'}">check</span>
        </button>`;
    }).join('');

    const nativeOptions = symbologies
      .map((sym) => `<option value="${sym}" ${sym === current ? 'selected' : ''}>${SYMBOLOGY_LABELS[sym]}</option>`)
      .join('');

    return `
      <div class="symbology-picker relative" data-open="false">
        <select id="prop-symbology" class="sr-only" tabindex="-1" aria-hidden="true">${nativeOptions}</select>
        <button type="button" id="symbology-trigger" aria-haspopup="listbox" aria-expanded="false"
          class="w-full flex items-center gap-3 rounded-xl border border-blue-300 bg-white px-3 py-2.5 text-left shadow-sm ring-1 ring-blue-100 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-300 transition">
          ${triggerInfo}
          <span class="symbology-chevron material-icons-round text-slate-400 text-lg shrink-0 transition-transform">expand_more</span>
        </button>
        <div id="symbology-menu" role="listbox"
          class="hidden absolute left-0 right-0 mt-1.5 z-30 max-h-72 overflow-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
          <div class="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">${cat}</div>
          ${options}
        </div>
      </div>`;
  }

  /**
   * Render the thumbnail + name + ZPL code + description for one symbology.
   * Shared by the picker trigger (showCat=false adds the dimension badge) and
   * each option row (showCat=true).
   */
  renderSymbologyInfo(sym, isOption) {
    const meta = SYMBOLOGY_META[sym] || {};
    const badge = isOption ? '' : `
      <span class="shrink-0 text-[10px] font-semibold text-indigo-500 bg-indigo-50 rounded-full px-2 py-0.5">${meta.dim || ''}</span>`;
    return `
      <span class="shrink-0 ${isOption ? 'w-11 h-9' : 'w-12 h-10'} flex items-center justify-center rounded-md border border-slate-200 bg-white text-slate-800">
        ${SYMBOLOGY_THUMBS[sym] || ''}
      </span>
      <span class="flex-1 min-w-0">
        <span class="flex items-center gap-2">
          <span class="text-sm font-semibold text-slate-800 truncate">${SYMBOLOGY_LABELS[sym] || sym}</span>
          <code class="text-[11px] font-mono text-slate-400">${meta.code || ''}</code>
        </span>
        <span class="block text-xs text-slate-400 truncate">${meta.desc || ''}</span>
      </span>
      ${badge}`;
  }

  /**
   * Render a labelled toggle switch bound to a boolean property.
   */
  createToggleGroup(label, id, checked) {
    return `
      <div class="mb-3">
        <label class="flex items-center justify-between cursor-pointer">
          <span class="text-xs font-medium text-slate-700">${label}</span>
          <div class="relative">
            <input type="checkbox" id="${id}" class="sr-only peer" ${checked ? "checked" : ""}>
            <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
          </div>
        </label>
      </div>
    `;
  }

  /**
   * Render the N/R/I/B orientation icon button group. Buttons carry
   * data-orientation + data-tooltip so PropertyListenersManager can wire them
   * (same markup/contract used by TEXT, TEXTBLOCK, FIELDBLOCK, GRAPHIC).
   */
  renderOrientationButtons(orientation) {
    const btn = (value, label, iconClass) => `
      <button type="button" data-orientation="${value}"
        aria-label="${label}"
        aria-pressed="${orientation === value}"
        class="flex-1 flex items-center justify-center p-1.5 rounded-md transition-all ${orientation === value ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:bg-white hover:text-slate-600 hover:shadow-sm"}"
        data-tooltip="${label}">
        <span class="material-icons-round text-base${iconClass ? ` inline-block ${iconClass}` : ""}">text_rotation_none</span>
      </button>`;
    return `
        <div class="mb-3">
          <label class="block text-xs font-medium text-slate-700 mb-1">Orientation</label>
          <div class="flex gap-1 bg-slate-100 rounded-lg p-1 border border-slate-200">
            ${btn("N", "Normal (N)", "")}
            ${btn("R", "Rotated 90° (R)", "rotate-90")}
            ${btn("I", "Inverted 180° (I)", "rotate-180")}
            ${btn("B", "Bottom-Up 270° (B)", "-rotate-90")}
          </div>
        </div>`;
  }

  /**
   * Render the diagonal-line orientation button group: R (/) right-leaning and
   * L (\) left-leaning. Buttons carry data-orientation + data-tooltip so
   * PropertyListenersManager wires them with the shared orientation-toggle code.
   */
  renderDiagonalOrientationButtons(orientation) {
    const btn = (value, label, icon, tooltip) => `
      <button type="button" data-orientation="${value}"
        aria-label="${tooltip}"
        aria-pressed="${orientation === value}"
        data-tooltip="${tooltip}"
        class="flex-1 flex items-center justify-center gap-1.5 px-3 py-1 text-xs rounded ${orientation === value ? "bg-white text-blue-600 shadow" : "text-slate-500 hover:bg-slate-200"} transition-colors">
        <span class="material-icons-round text-sm">${icon}</span>${label}
      </button>`;
    return `
        <div class="mb-3">
          <label class="block text-xs font-medium text-slate-700 mb-1">Orientation</label>
          <div class="flex gap-1 bg-slate-100 rounded p-1 border border-slate-200">
            ${btn("L", "Left", "south_east", "Left-leaning (\\)")}
            ${btn("R", "Right", "north_east", "Right-leaning (/)")}
          </div>
        </div>`;
  }

  /**
   * Render the human-readable interpretation (HRI) segmented control. Combines
   * showText + printTextAbove into one Off/Below/Above switch: Off → no text,
   * Below → text under the bars, Above → text over the bars. Buttons carry
   * data-hri so PropertyListenersManager can wire them.
   */
  renderHriControl(element, { allowOff = true } = {}) {
    // LOGMARS (^BL) has no print-interpretation param — the HRI is always printed — so
    // its control omits "Off" and the current position ignores showText.
    const current = !allowOff
      ? (element.printTextAbove ? "above" : "below")
      : (!element.showText ? "off" : (element.printTextAbove ? "above" : "below"));
    const btn = (value, label) => `
      <button type="button" data-hri="${value}"
        aria-pressed="${current === value}"
        class="flex-1 flex items-center justify-center py-1.5 px-2 rounded-md text-xs font-medium transition-all ${current === value ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:bg-white hover:text-slate-700 hover:shadow-sm"}">
        ${label}
      </button>`;
    return `
        <div class="mb-3">
          <label class="block text-xs font-medium text-slate-700 mb-1">Human-readable (HRI)</label>
          <div class="flex gap-1 bg-slate-100 rounded-lg p-1 border border-slate-200">
            ${allowOff ? btn("off", "Off") : ""}
            ${btn("below", "Below")}
            ${btn("above", "Above")}
          </div>
        </div>`;
  }

  /**
   * Render alignment controls section
   */
  renderAlignmentControls(element) {
    const disableMatchSize = !element?.canMatchLabelSize?.();
    const disabledAttr = disableMatchSize ? "disabled" : "";
    const disabledClass = disableMatchSize ? "opacity-50 cursor-not-allowed hover:border-slate-200 hover:bg-white" : "";

    return this.renderSection(
      "Alignment &amp; Size",
      `
        <div class="grid grid-cols-4 gap-2">
          <button id="prop-center-x"
            class="group flex items-center justify-center h-10 bg-white border border-slate-200 rounded-md hover:border-blue-500 hover:bg-blue-50 transition-all"
            data-tooltip="Center Horizontally">
            <span class="material-icons-round text-slate-400 group-hover:text-blue-500 mb-1 transition-colors">align_horizontal_center</span>
          </button>
          <button id="prop-center-y"
            class="group flex items-center justify-center h-10 bg-white border border-slate-200 rounded-md hover:border-blue-500 hover:bg-blue-50 transition-all"
            data-tooltip="Center Vertically">
            <span class="material-icons-round text-slate-400 group-hover:text-blue-500 mb-1 transition-colors">align_vertical_center</span>
          </button>
          <button id="prop-match-width"
            class="group flex items-center justify-center h-10 bg-white border border-slate-200 rounded-md hover:border-blue-500 hover:bg-blue-50 transition-all ${disabledClass}"
            ${disabledAttr}
            data-tooltip="Match Label Width">
            <span class="material-icons-round text-slate-400 group-hover:text-blue-500 mb-1 transition-colors">fit_screen</span>
          </button>
          <button id="prop-match-height"
            class="group flex items-center justify-center h-10 bg-white border border-slate-200 rounded-md hover:border-blue-500 hover:bg-blue-50 transition-all ${disabledClass}"
            ${disabledAttr}
            data-tooltip="Match Label Height">
            <span class="material-icons-round text-slate-400 group-hover:text-blue-500 mb-1 transition-colors rotate-90">fit_screen</span>
          </button>
        </div>
      `,
      { open: true, elementType: element.type }
    );
  }

  /**
   * Render the Reverse Print toggle row. Used by every element type so the
   * UI is identical across BARCODE/QRCODE/BOX/LINE/CIRCLE/GRAPHIC and the
   * three text-shaped types.
   */
  renderReversePrintRow(element) {
    return `
      <div class="flex items-center justify-between">
        <label class="text-xs text-slate-700">
          Reverse Print
          <a href="https://docs.zebra.com/us/en/printers/software/zpl-pg/c-zpl-zpl-commands/r-zpl-fr.html"
            target="_blank" class="text-blue-500 hover:underline">^FR</a>
        </label>
        <div class="flex gap-1 bg-slate-100 rounded p-1 border border-slate-200">
          <button type="button" data-reverse="N"
            aria-label="Normal print"
            aria-pressed="${!element.reverse}"
            class="px-3 py-1 text-xs rounded ${element.reverse ? "text-slate-500 hover:bg-slate-200" : "bg-white text-blue-600 shadow"} transition-colors">
            Normal
          </button>
          <button type="button" data-reverse="Y"
            aria-label="Reverse print"
            aria-pressed="${element.reverse}"
            class="px-3 py-1 text-xs rounded ${element.reverse ? "bg-white text-blue-600 shadow" : "text-slate-500 hover:bg-slate-200"} transition-colors">
            Reverse
          </button>
        </div>
      </div>
    `;
  }

  renderFieldHexToggle(element) {
    const fieldHexEnabled = element.fieldHex === true;
    const alignmentClass = fieldHexEnabled ? "items-start" : "items-center";
    return `
      <div class="mb-4 flex ${alignmentClass} justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3">
        <span class="min-w-0">
          <span class="flex items-center gap-2 text-xs font-medium text-slate-800">
            <span>Hex escapes in data</span>
            <a href="https://docs.zebra.com/us/en/printers/software/zpl-pg/c-zpl-zpl-commands/r-zpl-fh.html"
              target="_blank"
              class="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-500 hover:bg-blue-50 hover:text-blue-600">
              ^FH
            </a>
          </span>
          ${fieldHexEnabled ? `
            <span class="mt-2 block text-[11px] leading-4 text-slate-500">
              Replaces _XX sequences in the placeholder value with hex bytes at print time.
            </span>
          ` : ""}
        </span>
        <label class="relative shrink-0 cursor-pointer" aria-label="Hex escapes in data">
          <input type="checkbox" id="prop-field-hex" class="sr-only peer" ${fieldHexEnabled ? "checked" : ""}>
          <span class="block h-6 w-11 rounded-full bg-slate-200 transition-colors peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 peer-checked:bg-blue-600"></span>
          <span class="absolute left-[2px] top-[2px] h-5 w-5 rounded-full border border-slate-300 bg-white transition-transform peer-checked:translate-x-full peer-checked:border-white"></span>
        </label>
      </div>
    `;
  }

  /**
   * Render font selection dropdown
   */
  renderFontSelect(element) {
    return `
      <div class="mb-3">
        <label class="block text-xs font-medium text-slate-700 mb-1">Font ID (override)</label>
        <select id="prop-font-id" class="w-full rounded-md border border-slate-200 py-1.5 px-2 text-xs text-slate-700 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white">
          <option value="">Use label default</option>
          ${BUILTIN_FONTS.map(id => `<option value="${id}" ${element.fontId === id ? 'selected' : ''}>${FONT_LABELS[id] || id}</option>`).join('')}
          ${this.labelSettings.customFonts.map(font => `<option value="${font.id}" ${element.fontId === font.id ? 'selected' : ''}>${font.id} - Custom</option>`).join('')}
        </select>
      </div>
    `;
  }

  /**
   * Render the Font Size (Height) + Font Width controls.
   * For bitmap fonts A–H these are dropdowns of the allowed per-magnification values
   * (plus a "Default" / "Default (proportional)" option); for scalable fonts (0 /
   * custom) they fall back to free numeric inputs.
   */
  renderFontSizeControls(element) {
    const resolvedFontId = element.fontId || this.labelSettings?.fontId || '0';
    const allowed = getBitmapFontAllowedSizes(resolvedFontId);
    if (!allowed) {
      return `
        ${this.createInputGroup("Font Size (Height)", "prop-font-size", element.fontSize, "number", { min: 0, max: 32000, placeholder: "Use default" })}
        ${this.createInputGroup("Font Width", "prop-font-width", element.fontWidth, "number", { min: 0, max: 32000, placeholder: "Use default" })}
      `;
    }
    return `
      ${this.renderFontSizeSelect("Font Size (Height)", "prop-font-size", element.fontSize || 0, allowed.heights, "Default")}
      ${this.renderFontSizeSelect("Font Width", "prop-font-width", element.fontWidth || 0, allowed.widths, "Default (proportional)")}
    `;
  }

  renderFontSizeSelect(label, id, value, values, defaultLabel) {
    const inList = values.includes(value);
    return `
      <div class="mb-3">
        <label class="block text-xs font-medium text-slate-700 mb-1">${label}</label>
        <select id="${id}" class="w-full rounded-md border border-slate-200 py-1.5 px-2 text-xs text-slate-700 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white">
          <option value="0" ${value === 0 ? 'selected' : ''}>${defaultLabel}</option>
          ${values.map(v => `<option value="${v}" ${value === v ? 'selected' : ''}>${v}</option>`).join('')}
          ${(!inList && value !== 0) ? `<option value="${value}" selected>${value}</option>` : ''}
        </select>
      </div>
    `;
  }

  /**
   * Render TEXT element properties
   */
  renderTextProperties(element) {
    return `
      ${this.renderAlignmentControls(element)}
      ${this.renderSection("Position &amp; Size", `
        <div class="grid grid-cols-2 gap-3">
          ${this.createInputGroup("X Position", "prop-x", element.x, "number", { min: 0 })}
          ${this.createInputGroup("Y Position", "prop-y", element.y, "number", { min: 0 })}
        </div>
        <div class="mb-3">
          <label class="block text-xs font-medium text-slate-700 mb-1">Orientation</label>
          <div class="flex gap-1 bg-slate-100 rounded-lg p-1 border border-slate-200">
            <button type="button" data-orientation="N"
              aria-label="Normal (N)"
              aria-pressed="${element.orientation === "N"}"
              class="flex-1 flex items-center justify-center p-1.5 rounded-md transition-all ${element.orientation === "N" ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:bg-white hover:text-slate-600 hover:shadow-sm"}"
              data-tooltip="Normal (N)">
              <span class="material-icons-round text-base">text_rotation_none</span>
            </button>
            <button type="button" data-orientation="R"
              aria-label="Rotated 90° (R)"
              aria-pressed="${element.orientation === "R"}"
              class="flex-1 flex items-center justify-center p-1.5 rounded-md transition-all ${element.orientation === "R" ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:bg-white hover:text-slate-600 hover:shadow-sm"}"
              data-tooltip="Rotated 90° (R)">
              <span class="material-icons-round text-base inline-block rotate-90">text_rotation_none</span>
            </button>
            <button type="button" data-orientation="I"
              aria-label="Inverted 180° (I)"
              aria-pressed="${element.orientation === "I"}"
              class="flex-1 flex items-center justify-center p-1.5 rounded-md transition-all ${element.orientation === "I" ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:bg-white hover:text-slate-600 hover:shadow-sm"}"
              data-tooltip="Inverted 180° (I)">
              <span class="material-icons-round text-base inline-block rotate-180">text_rotation_none</span>
            </button>
            <button type="button" data-orientation="B"
              aria-label="Bottom-Up 270° (B)"
              aria-pressed="${element.orientation === "B"}"
              class="flex-1 flex items-center justify-center p-1.5 rounded-md transition-all ${element.orientation === "B" ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:bg-white hover:text-slate-600 hover:shadow-sm"}"
              data-tooltip="Bottom-Up 270° (B)">
              <span class="material-icons-round text-base inline-block -rotate-90">text_rotation_none</span>
            </button>
          </div>
        </div>
      `, { elementType: element.type })}
      ${this.renderSection("Text Content", `
        ${this.createInputGroup("Preview Text", "prop-preview-text", element.previewText)}
        ${this.createInputGroup("Placeholder", "prop-placeholder", element.placeholder)}
        ${this.renderFieldHexToggle(element)}
      `, { open: true, elementType: element.type })}
      ${this.renderSection("Font Settings", `
        ${this.renderFontSelect(element)}
        <div class="grid grid-cols-2 gap-3">
          ${this.renderFontSizeControls(element)}
        </div>
      `, { elementType: element.type })}
      ${this.renderSection("Appearance", this.renderReversePrintRow(element), { open: true, elementType: element.type })}
    `;
  }

  /**
   * Render BARCODE (1D) element properties
   */
  renderBarcodeProperties(element) {
    const symbology = element.symbology || "CODE128";
    const isCode39 = symbology === "CODE39";
    const isCode93 = symbology === "CODE93";
    const isCode11 = symbology === "CODE11";
    const isI2of5 = symbology === "INTERLEAVED2OF5";
    const isIndustrial2of5 = symbology === "INDUSTRIAL2OF5";
    const isStandard2of5 = symbology === "STANDARD2OF5";
    const isLogmars = symbology === "LOGMARS";
    const isMsi = symbology === "MSI";
    const isPlessey = symbology === "PLESSEY";
    const isCodabar = symbology === "CODABAR";
    // Code 39, Interleaved 2 of 5, Codabar, Code 11, Industrial/Standard 2 of 5 and LOGMARS
    // derive their wide:narrow ratio from ^BY; Code 93 has a fixed ratio. Code 39 / I2of5 /
    // Code 93 / Code 11 expose a check-digit toggle (mod-43 / mod-10 / mandatory Code 93
    // C+K / Code 11 1-vs-2 digits); Industrial & Standard 2 of 5 are self-checking with no
    // check-digit param; LOGMARS is Code 39 with a forced mod-43 check digit and an
    // always-on HRI (no f param), so it exposes neither a check-digit nor an HRI-off toggle;
    // Codabar's check digit is fixed off but exposes start/stop chars (^BK k/l).
    // Plessey (^BP) is ratio-bearing too and exposes an on/off "print check digit" toggle:
    // its two hex CRC check chars are always in the bars; the e flag only adds them to the HRI.
    const hasRatio = isCode39 || isI2of5 || isCodabar || isCode11 || isIndustrial2of5 || isStandard2of5 || isLogmars || isMsi || isPlessey;
    // MSI (^BM) has a 4-way check-digit mode (e) rather than an on/off toggle, plus an e2
    // flag for whether to show the check digit in the HRI — both handled by dedicated controls.
    const hasCheckDigit = isCode39 || isI2of5 || isCode93 || isCode11 || isPlessey;
    const msiCheckOptions = [["A", "None"], ["B", "1 × Mod 10"], ["C", "2 × Mod 10"], ["D", "Mod 11 + Mod 10"]];
    const checkDigitLabel = isI2of5 ? "Mod-10 Check Digit" : isCode93 ? "Print Check Digits" : isCode11 ? "Single Check Digit" : isPlessey ? "Print Check Digit" : "Mod-43 Check Digit";
    const startStopOptions = [["A", "A"], ["B", "B"], ["C", "C"], ["D", "D"]];
    return `
      ${this.renderSection("Symbology", this.renderSymbologyPicker(symbology, BARCODE_SYMBOLOGIES), { open: true, elementType: element.type })}
      ${this.renderAlignmentControls(element)}
      ${this.renderSection("Position &amp; Size", `
        <div class="grid grid-cols-2 gap-3">
          ${this.createInputGroup("X Position", "prop-x", element.x, "number", { min: 0 })}
          ${this.createInputGroup("Y Position", "prop-y", element.y, "number", { min: 0 })}
          ${this.createInputGroup("Height", "prop-height", element.height, "number", { min: 1, max: 1000 })}
        </div>
        ${this.renderOrientationButtons(element.orientation || "N")}
      `, { elementType: element.type })}
      ${this.renderSection("Content", `
        ${this.createInputGroup("Preview Data", "prop-preview-data", element.previewData)}
        ${this.createInputGroup("Placeholder", "prop-placeholder", element.placeholder)}
        ${this.renderFieldHexToggle(element)}
      `, { elementType: element.type })}
      ${this.renderSection("Barcode Settings", `
        ${this.createInputGroup("Module Width", "prop-width", element.width, "number", { min: 1, max: 10 })}
        ${hasRatio ? this.createInputGroup("Ratio", "prop-ratio", element.ratio, "number", { min: 2, max: 3, step: 0.1 }) : ""}
        ${hasCheckDigit ? this.createToggleGroup(checkDigitLabel, "prop-check-digit", element.checkDigit === true) : ""}
        ${isCodabar ? `<div class="grid grid-cols-2 gap-3">
          ${this.createSelectGroup("Start Character", "prop-codabar-start", element.startChar || "A", startStopOptions)}
          ${this.createSelectGroup("Stop Character", "prop-codabar-stop", element.stopChar || "A", startStopOptions)}
        </div>` : ""}
        ${isMsi ? `
          ${this.createSelectGroup("Check Digit", "prop-msi-check-mode", element.msiCheckMode || "B", msiCheckOptions)}
          ${this.createToggleGroup("Show Check Digit in HRI", "prop-msi-check-intext", element.msiCheckInText === true)}
        ` : ""}
        ${this.renderHriControl(element, { allowOff: !isLogmars })}
      `, { open: true, elementType: element.type })}
      ${this.renderSection("Appearance", this.renderReversePrintRow(element), { open: true, elementType: element.type })}
    `;
  }

  /**
   * Render the symbology-specific size + settings controls for a 2D barcode.
   */
  renderQRCodeSettings(element) {
    switch (element.symbology) {
      case "DATAMATRIX":
        return `
          ${this.createInputGroup("Module Size", "prop-module-size", element.moduleSize, "number", BARCODE_2D_SIZE_BOUNDS.DATAMATRIX.moduleSize)}
          ${this.createSelectGroup("Quality (ECC)", "prop-quality", element.quality, [
            ["200", "ECC 200 (recommended)"],
            ["140", "ECC 140"],
            ["100", "ECC 100"],
            ["80", "ECC 080"],
            ["50", "ECC 050"],
            ["0", "ECC 000"],
          ])}
        `;
      case "PDF417":
        return `
          ${this.createInputGroup("Module Width", "prop-module-width", element.moduleWidth, "number", BARCODE_2D_SIZE_BOUNDS.PDF417.moduleWidth)}
          ${this.createInputGroup("Row Height", "prop-row-height", element.rowHeight, "number", BARCODE_2D_SIZE_BOUNDS.PDF417.rowHeight)}
          ${this.createInputGroup("Security Level", "prop-security-level", element.securityLevel, "number", { min: 0, max: 8 })}
          ${this.createInputGroup("Columns (0 = auto)", "prop-columns", element.columns, "number", { min: 0, max: 30 })}
        `;
      case "MICROPDF417":
        return `
          ${this.createInputGroup("Module Width", "prop-module-width", element.moduleWidth, "number", BARCODE_2D_SIZE_BOUNDS.MICROPDF417.moduleWidth)}
          ${this.createInputGroup("Row Height", "prop-row-height", element.rowHeight, "number", BARCODE_2D_SIZE_BOUNDS.MICROPDF417.rowHeight)}
          ${this.createInputGroup("Mode (0-33)", "prop-micropdf-mode", element.microPdfMode || 0, "number", { min: 0, max: 33 })}
        `;
      case "CODE49":
        return `
          ${this.createInputGroup("Module Width", "prop-module-width", element.moduleWidth, "number", BARCODE_2D_SIZE_BOUNDS.CODE49.moduleWidth)}
          ${this.createInputGroup("Row Height", "prop-row-height", element.rowHeight, "number", BARCODE_2D_SIZE_BOUNDS.CODE49.rowHeight)}
          ${this.createSelectGroup("Starting Mode", "prop-code49-mode", element.code49Mode || "A", [
            ["A", "Automatic"],
            ["0", "0 - Regular Alphanumeric"],
            ["1", "1 - Multiple Read Alphanumeric"],
            ["2", "2 - Regular Numeric"],
            ["3", "3 - Group Alphanumeric"],
            ["4", "4 - Regular Alphanumeric Shift 1"],
            ["5", "5 - Regular Alphanumeric Shift 2"],
          ])}
        `;
      case "CODABLOCK":
        return `
          ${this.createInputGroup("Module Width", "prop-module-width", element.moduleWidth, "number", BARCODE_2D_SIZE_BOUNDS.CODABLOCK.moduleWidth)}
          ${this.createInputGroup("Row Height", "prop-row-height", element.rowHeight, "number", BARCODE_2D_SIZE_BOUNDS.CODABLOCK.rowHeight)}
          ${this.createSelectGroup("Mode", "prop-codablock-mode", element.codablockMode || "F", [
            ["F", "F - Code 128 (default)"],
            ["E", "E - Code 128 + FNC1 (GS1)"],
            ["A", "A - Code 39"],
          ])}
        `;
      case "GS1DATABAR":
        return `
          ${this.createSelectGroup("Variant", "prop-databar-type", element.databarType || "omni", [
            ["omni", "Omnidirectional"],
            ["truncated", "Truncated"],
            ["stacked", "Stacked"],
            ["stackedomni", "Stacked Omnidirectional"],
            ["limited", "Limited"],
            ["expanded", "Expanded"],
          ])}
          ${this.createInputGroup("Magnification", "prop-magnification", element.magnification, "number", BARCODE_2D_SIZE_BOUNDS.GS1DATABAR.magnification)}
          ${this.createInputGroup("Bar Height", "prop-row-height", element.rowHeight, "number", BARCODE_2D_SIZE_BOUNDS.GS1DATABAR.rowHeight)}
        `;
      case "MAXICODE":
        return `
          ${this.createInputGroup("Magnification", "prop-magnification", element.magnification, "number", BARCODE_2D_SIZE_BOUNDS.MAXICODE.magnification)}
          ${this.createSelectGroup("Mode", "prop-maxicode-mode", element.maxicodeMode || "4", [
            ["4", "4 - Standard"],
            ["2", "2 - Postal (US)"],
            ["3", "3 - Postal (non-US)"],
            ["5", "5 - Full EEC"],
            ["6", "6 - Reader programming"],
          ])}
        `;
      case "AZTEC":
        return `
          ${this.createInputGroup("Magnification", "prop-magnification", element.magnification, "number", BARCODE_2D_SIZE_BOUNDS.AZTEC.magnification)}
          ${this.createSelectGroup("Symbol Type", "prop-aztec-size-mode", element.aztecSizeMode || "auto", [
            ["auto", "Auto (error %)"],
            ["full", "Full-range (layers)"],
            ["compact", "Compact (layers)"],
            ["rune", "Rune"],
          ])}
          ${this.createInputGroup("Error Control % (0 = default)", "prop-aztec-error-control", element.aztecErrorControl, "number", { min: 0, max: 99 })}
          ${this.createInputGroup("Layers (0 = auto)", "prop-aztec-layers", element.aztecLayers, "number", { min: 0, max: 32 })}
        `;
      case "QR":
      default:
        return `
          ${this.createInputGroup("Magnification", "prop-magnification", element.magnification, "number", BARCODE_2D_SIZE_BOUNDS.QR.magnification)}
          ${this.createSelectGroup("Model", "prop-model", element.model, [
            ["1", "Model 1 (Original)"],
            ["2", "Model 2 (Enhanced)"],
          ])}
          ${this.createSelectGroup("Error Correction", "prop-error-correction", element.errorCorrection, [
            ["H", "H - Ultra-High (30%)"],
            ["Q", "Q - Quality (25%)"],
            ["M", "M - Medium (15%)"],
            ["L", "L - Low (7%)"],
          ])}
        `;
    }
  }

  /**
   * Render QRCODE (2D) element properties
   */
  renderQRCodeProperties(element) {
    const symbology = element.symbology || "QR";
    return `
      ${this.renderSection("Symbology", this.renderSymbologyPicker(symbology, QR_SYMBOLOGIES), { open: true, elementType: element.type })}
      ${this.renderAlignmentControls(element)}
      ${this.renderSection("Position", `
        <div class="grid grid-cols-2 gap-3">
          ${this.createInputGroup("X Position", "prop-x", element.x, "number", { min: 0 })}
          ${this.createInputGroup("Y Position", "prop-y", element.y, "number", { min: 0 })}
        </div>
      `, { elementType: element.type })}
      ${this.renderSection("Content", `
        <div class="mb-3">
          <label class="block text-xs font-medium text-slate-700 mb-1">Preview Data</label>
          <textarea
            id="prop-preview-data"
            rows="2"
            class="w-full rounded-md border border-slate-200 py-1.5 px-2 text-xs text-slate-700 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white"
          >${element.previewData}</textarea>
        </div>
        ${this.createInputGroup("Placeholder", "prop-placeholder", element.placeholder)}
        ${this.renderFieldHexToggle(element)}
      `, { elementType: element.type })}
      ${this.renderSection("2D Barcode Settings", this.renderQRCodeSettings(element), { open: true, elementType: element.type })}
      ${this.renderSection("Appearance", this.renderReversePrintRow(element), { open: true, elementType: element.type })}
    `;
  }

  /**
   * Render BOX element properties
   */
  renderBoxProperties(element) {
    return `
      ${this.renderAlignmentControls(element)}
      ${this.renderSection("Position &amp; Size", `
        <div class="grid grid-cols-2 gap-3">
          ${this.createInputGroup("X Position", "prop-x", element.x, "number", { min: 0 })}
          ${this.createInputGroup("Y Position", "prop-y", element.y, "number", { min: 0 })}
          ${this.createInputGroup("Width", "prop-width", element.width, "number", { min: 1, max: 32000 })}
          ${this.createInputGroup("Height", "prop-height", element.height, "number", { min: 1, max: 32000 })}
          ${this.createInputGroup("Thickness", "prop-thickness", element.thickness, "number", { min: 1, max: 32000 })}
        </div>
      `, { elementType: element.type })}
      ${this.renderSection("Appearance", `
        <div class="flex items-center justify-between">
          <label class="text-xs text-slate-700">Color</label>
          <div class="flex gap-1 bg-slate-100 rounded p-1 border border-slate-200">
            <button type="button" data-color="B"
              class="px-3 py-1 text-xs rounded ${element.color === 'B' ? 'bg-white text-blue-600 shadow' : 'text-slate-500 hover:bg-slate-200'} transition-colors">
              Black
            </button>
            <button type="button" data-color="W"
              class="px-3 py-1 text-xs rounded ${element.color === 'W' ? 'bg-white text-blue-600 shadow' : 'text-slate-500 hover:bg-slate-200'} transition-colors">
              White
            </button>
          </div>
        </div>
        ${this.createInputGroup("Rounding", "prop-rounding", element.rounding, "number", { min: 0, max: 8 })}
        <div class="mt-3">
          ${this.renderReversePrintRow(element)}
        </div>
      `, { open: true, elementType: element.type })}
    `;
  }

  /**
   * Render LINE element properties
   */
  renderLineProperties(element) {
    return `
      ${this.renderAlignmentControls(element)}
      ${this.renderSection("Position &amp; Size", `
        <div class="grid grid-cols-2 gap-3">
          ${this.createInputGroup("X Position", "prop-x", element.x, "number", { min: 0 })}
          ${this.createInputGroup("Y Position", "prop-y", element.y, "number", { min: 0 })}
          ${this.createInputGroup("Length (Width)", "prop-width", element.width, "number", { min: 1, max: 32000 })}
          ${this.createInputGroup("Thickness", "prop-thickness", element.thickness, "number", { min: 1, max: 32000 })}
        </div>
        <div class="mb-3">
          <label class="block text-xs font-medium text-slate-700 mb-1">Orientation</label>
          <select id="prop-orientation" class="w-full rounded-md border border-slate-200 py-1.5 px-2 text-xs text-slate-700 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white">
            <option value="H" ${element.orientation === "H" ? "selected" : ""}>Horizontal</option>
            <option value="V" ${element.orientation === "V" ? "selected" : ""}>Vertical</option>
          </select>
        </div>
      `, { elementType: element.type })}
      ${this.renderSection("Appearance", `
        <div class="flex items-center justify-between">
          <label class="text-xs text-slate-700">Color</label>
          <div class="flex gap-1 bg-slate-100 rounded p-1 border border-slate-200">
            <button type="button" data-color="B"
              class="px-3 py-1 text-xs rounded ${element.color === 'B' ? 'bg-white text-blue-600 shadow' : 'text-slate-500 hover:bg-slate-200'} transition-colors">
              Black
            </button>
            <button type="button" data-color="W"
              class="px-3 py-1 text-xs rounded ${element.color === 'W' ? 'bg-white text-blue-600 shadow' : 'text-slate-500 hover:bg-slate-200'} transition-colors">
              White
            </button>
          </div>
        </div>
        ${this.createInputGroup("Rounding", "prop-rounding", element.rounding, "number", { min: 0, max: 8 })}
        <div class="mt-3">
          ${this.renderReversePrintRow(element)}
        </div>
      `, { open: true, elementType: element.type })}
    `;
  }

  /**
   * Render DIAGONALLINE element properties
   */
  renderDiagonalLineProperties(element) {
    return `
      ${this.renderAlignmentControls(element)}
      ${this.renderSection("Position &amp; Size", `
        <div class="grid grid-cols-2 gap-3">
          ${this.createInputGroup("X Position", "prop-x", element.x, "number", { min: 0 })}
          ${this.createInputGroup("Y Position", "prop-y", element.y, "number", { min: 0 })}
          ${this.createInputGroup("Width", "prop-width", element.width, "number", { min: 3, max: 32000 })}
          ${this.createInputGroup("Height", "prop-height", element.height, "number", { min: 3, max: 32000 })}
          ${this.createInputGroup("Thickness", "prop-thickness", element.thickness, "number", { min: 1, max: 32000 })}
        </div>
        ${this.renderDiagonalOrientationButtons(element.orientation)}
      `, { elementType: element.type })}
      ${this.renderSection("Appearance", `
        <div class="flex items-center justify-between">
          <label class="text-xs text-slate-700">Color</label>
          <div class="flex gap-1 bg-slate-100 rounded p-1 border border-slate-200">
            <button type="button" data-color="B"
              class="px-3 py-1 text-xs rounded ${element.color === 'B' ? 'bg-white text-blue-600 shadow' : 'text-slate-500 hover:bg-slate-200'} transition-colors">
              Black
            </button>
            <button type="button" data-color="W"
              class="px-3 py-1 text-xs rounded ${element.color === 'W' ? 'bg-white text-blue-600 shadow' : 'text-slate-500 hover:bg-slate-200'} transition-colors">
              White
            </button>
          </div>
        </div>
        <div class="mt-3">
          ${this.renderReversePrintRow(element)}
        </div>
      `, { open: true, elementType: element.type })}
    `;
  }

  /**
   * Render CIRCLE element properties
   */
  renderCircleProperties(element) {
    const locked = element.aspectLocked !== false;
    const heightDisabledAttr = locked ? 'disabled' : '';
    const heightLabelClass = locked ? 'text-slate-400' : 'text-slate-700';
    const heightInputClass = locked
      ? 'w-full rounded-md border border-slate-200 bg-slate-50 py-1.5 px-2 text-xs text-slate-400 cursor-not-allowed'
      : 'w-full rounded-md border border-slate-200 py-1.5 px-2 text-xs text-slate-700 focus:ring-1 focus:ring-blue-500 focus:border-blue-500';
    const lockIcon = locked ? 'link' : 'link_off';
    const lockTitle = locked ? 'Aspect ratio locked — click to unlock' : 'Aspect ratio unlocked — click to relock';
    const lockBtnClass = locked
      ? 'bg-white text-blue-600 shadow-sm border-slate-200'
      : 'bg-slate-100 text-slate-400 border-slate-200 hover:text-blue-600';
    return `
      ${this.renderAlignmentControls(element)}
      ${this.renderSection("Position &amp; Size", `
        <div class="grid grid-cols-2 gap-3 mb-3">
          ${this.createInputGroup("X Position", "prop-x", element.x, "number", { min: 0 })}
          ${this.createInputGroup("Y Position", "prop-y", element.y, "number", { min: 0 })}
        </div>
        <div class="grid grid-cols-[1fr_auto_1fr] gap-2 items-end mb-3">
          <div>
            <label class="block text-xs font-medium text-slate-700 mb-1">Width</label>
            <input id="prop-width" type="number" min="3" max="4095" value="${element.width}"
              class="w-full rounded-md border border-slate-200 py-1.5 px-2 text-xs text-slate-700 focus:ring-1 focus:ring-blue-500 focus:border-blue-500" />
          </div>
          <button type="button" id="prop-circle-aspect-lock"
            data-tooltip="${lockTitle}"
            class="flex items-center justify-center w-[30px] h-[30px] rounded-md border ${lockBtnClass} transition-colors">
            <span class="material-icons-round text-[16px] leading-none">${lockIcon}</span>
          </button>
          <div>
            <label id="prop-circle-height-label" class="block text-xs font-medium ${heightLabelClass} mb-1">Height</label>
            <input id="prop-height" type="number" min="3" max="4095" value="${element.height}"
              ${heightDisabledAttr}
              class="${heightInputClass}" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          ${this.createInputGroup("Thickness", "prop-thickness", element.thickness, "number", { min: 2, max: 4095 })}
        </div>
      `, { elementType: element.type })}
      ${this.renderSection("Appearance", `
        <div class="flex items-center justify-between">
          <label class="text-xs text-slate-700">Color</label>
          <div class="flex gap-1 bg-slate-100 rounded p-1 border border-slate-200">
            <button type="button" data-color="B"
              class="px-3 py-1 text-xs rounded ${element.color === 'B' ? 'bg-white text-blue-600 shadow' : 'text-slate-500 hover:bg-slate-200'} transition-colors">
              Black
            </button>
            <button type="button" data-color="W"
              class="px-3 py-1 text-xs rounded ${element.color === 'W' ? 'bg-white text-blue-600 shadow' : 'text-slate-500 hover:bg-slate-200'} transition-colors">
              White
            </button>
          </div>
        </div>
        <div class="mt-3">
          ${this.renderReversePrintRow(element)}
        </div>
      `, { open: true, elementType: element.type })}
    `;
  }

  /**
   * Render TEXTBLOCK element properties
   */
  renderTextBlockProperties(element) {
    return `
      ${this.renderAlignmentControls(element)}
      ${this.renderSection("Position &amp; Size", `
        <div class="grid grid-cols-2 gap-3">
          ${this.createInputGroup("X Position", "prop-x", element.x, "number", { min: 0 })}
          ${this.createInputGroup("Y Position", "prop-y", element.y, "number", { min: 0 })}
        </div>
        <div class="mb-3">
          <label class="block text-xs font-medium text-slate-700 mb-1">Orientation</label>
          <div class="flex gap-1 bg-slate-100 rounded-lg p-1 border border-slate-200">
            <button type="button" data-orientation="N"
              aria-label="Normal (N)"
              aria-pressed="${element.orientation === "N"}"
              class="flex-1 flex items-center justify-center p-1.5 rounded-md transition-all ${element.orientation === "N" ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:bg-white hover:text-slate-600 hover:shadow-sm"}"
              data-tooltip="Normal (N)">
              <span class="material-icons-round text-base">text_rotation_none</span>
            </button>
            <button type="button" data-orientation="R"
              aria-label="Rotated 90° (R)"
              aria-pressed="${element.orientation === "R"}"
              class="flex-1 flex items-center justify-center p-1.5 rounded-md transition-all ${element.orientation === "R" ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:bg-white hover:text-slate-600 hover:shadow-sm"}"
              data-tooltip="Rotated 90° (R)">
              <span class="material-icons-round text-base inline-block rotate-90">text_rotation_none</span>
            </button>
            <button type="button" data-orientation="I"
              aria-label="Inverted 180° (I)"
              aria-pressed="${element.orientation === "I"}"
              class="flex-1 flex items-center justify-center p-1.5 rounded-md transition-all ${element.orientation === "I" ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:bg-white hover:text-slate-600 hover:shadow-sm"}"
              data-tooltip="Inverted 180° (I)">
              <span class="material-icons-round text-base inline-block rotate-180">text_rotation_none</span>
            </button>
            <button type="button" data-orientation="B"
              aria-label="Bottom-Up 270° (B)"
              aria-pressed="${element.orientation === "B"}"
              class="flex-1 flex items-center justify-center p-1.5 rounded-md transition-all ${element.orientation === "B" ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:bg-white hover:text-slate-600 hover:shadow-sm"}"
              data-tooltip="Bottom-Up 270° (B)">
              <span class="material-icons-round text-base inline-block -rotate-90">text_rotation_none</span>
            </button>
          </div>
        </div>
      `, { elementType: element.type })}
      ${this.renderSection("Text Content", `
        <div class="mb-3">
          <label class="block text-xs font-medium text-slate-700 mb-1">Preview Text</label>
          <textarea id="prop-preview-text" rows="3"
            class="w-full rounded-md border border-slate-200 py-1.5 px-2 text-xs text-slate-700 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white">${escapeHtml(element.previewText)}</textarea>
        </div>
        ${this.createInputGroup("Placeholder", "prop-placeholder", element.placeholder)}
        ${this.renderFieldHexToggle(element)}
      `, { elementType: element.type })}
      ${this.renderSection("Font Settings", `
        ${this.renderFontSelect(element)}
        <div class="grid grid-cols-2 gap-3">
          ${this.renderFontSizeControls(element)}
        </div>
      `, { elementType: element.type })}
      ${this.renderSection("Block Configuration", `
        <div class="grid grid-cols-2 gap-3">
          ${this.createInputGroup("Block Width (dots)", "prop-block-width", element.blockWidth, "number", { min: 0, max: 32000 })}
          ${this.createInputGroup("Block Height (dots)", "prop-block-height", element.blockHeight, "number", { min: 0, max: 32000 })}
        </div>
      `, { open: true, elementType: element.type })}
      ${this.renderSection("Appearance", this.renderReversePrintRow(element), { open: true, elementType: element.type })}
    `;
  }

  /**
   * Render FIELDBLOCK element properties
   */
  renderFieldBlockProperties(element) {
    return `
      ${this.renderAlignmentControls(element)}
      ${this.renderSection("Position &amp; Size", `
        <div class="grid grid-cols-2 gap-3">
          ${this.createInputGroup("X Position", "prop-x", element.x, "number", { min: 0 })}
          ${this.createInputGroup("Y Position", "prop-y", element.y, "number", { min: 0 })}
        </div>
        <div class="mb-3">
          <label class="block text-xs font-medium text-slate-700 mb-1">Orientation</label>
          <div class="flex gap-1 bg-slate-100 rounded-lg p-1 border border-slate-200">
            <button type="button" data-orientation="N"
              aria-label="Normal (N)"
              aria-pressed="${element.orientation === "N"}"
              class="flex-1 flex items-center justify-center p-1.5 rounded-md transition-all ${element.orientation === "N" ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:bg-white hover:text-slate-600 hover:shadow-sm"}"
              data-tooltip="Normal (N)">
              <span class="material-icons-round text-base">text_rotation_none</span>
            </button>
            <button type="button" data-orientation="R"
              aria-label="Rotated 90° (R)"
              aria-pressed="${element.orientation === "R"}"
              class="flex-1 flex items-center justify-center p-1.5 rounded-md transition-all ${element.orientation === "R" ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:bg-white hover:text-slate-600 hover:shadow-sm"}"
              data-tooltip="Rotated 90° (R)">
              <span class="material-icons-round text-base inline-block rotate-90">text_rotation_none</span>
            </button>
            <button type="button" data-orientation="I"
              aria-label="Inverted 180° (I)"
              aria-pressed="${element.orientation === "I"}"
              class="flex-1 flex items-center justify-center p-1.5 rounded-md transition-all ${element.orientation === "I" ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:bg-white hover:text-slate-600 hover:shadow-sm"}"
              data-tooltip="Inverted 180° (I)">
              <span class="material-icons-round text-base inline-block rotate-180">text_rotation_none</span>
            </button>
            <button type="button" data-orientation="B"
              aria-label="Bottom-Up 270° (B)"
              aria-pressed="${element.orientation === "B"}"
              class="flex-1 flex items-center justify-center p-1.5 rounded-md transition-all ${element.orientation === "B" ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:bg-white hover:text-slate-600 hover:shadow-sm"}"
              data-tooltip="Bottom-Up 270° (B)">
              <span class="material-icons-round text-base inline-block -rotate-90">text_rotation_none</span>
            </button>
          </div>
        </div>
      `, { elementType: element.type })}
      ${this.renderSection("Text Content", `
        <div class="mb-3">
          <label class="block text-xs font-medium text-slate-700 mb-1">Preview Text</label>
          <textarea id="prop-preview-text" rows="3"
            class="w-full rounded-md border border-slate-200 py-1.5 px-2 text-xs text-slate-700 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white">${escapeHtml(element.previewText)}</textarea>
        </div>
        ${this.createInputGroup("Placeholder", "prop-placeholder", element.placeholder)}
        ${this.renderFieldHexToggle(element)}
      `, { elementType: element.type })}
      ${this.renderSection("Font Settings", `
        ${this.renderFontSelect(element)}
        <div class="grid grid-cols-2 gap-3">
          ${this.renderFontSizeControls(element)}
        </div>
      `, { elementType: element.type })}
      ${this.renderSection("Block Configuration", `
        <div class="grid grid-cols-2 gap-3">
          ${this.createInputGroup("Block Width (dots)", "prop-block-width", element.blockWidth, "number", { min: 0, max: 32000 })}
          ${this.createInputGroup("Max Lines", "prop-max-lines", element.maxLines, "number", { min: 1, max: 9999 })}
          ${this.createInputGroup("Line Spacing", "prop-line-spacing", element.lineSpacing, "number", { min: -9999, max: 9999 })}
          ${this.createInputGroup("Hanging Indent (dots)", "prop-hanging-indent", element.hangingIndent, "number", { min: 0, max: 9999 })}
        </div>
      `, { open: true, elementType: element.type })}
      ${this.renderSection("Alignment", `
        <div class="mb-3">
          <label class="block text-xs font-medium text-slate-700 mb-1">Text Justification</label>
          <div class="flex gap-1 bg-slate-100 rounded-lg p-1 border border-slate-200">
            <button type="button" data-justification="L"
              class="flex-1 p-1 rounded-md ${element.justification === "L" ? "bg-white text-blue-600 shadow" : "text-slate-500 hover:bg-slate-200"} transition-all"
              data-tooltip="Left Align">
              <span class="material-icons-round text-sm">format_align_left</span>
            </button>
            <button type="button" data-justification="C"
              class="flex-1 p-1 rounded-md ${element.justification === "C" ? "bg-white text-blue-600 shadow" : "text-slate-500 hover:bg-slate-200"} transition-all"
              data-tooltip="Center Align">
              <span class="material-icons-round text-sm">format_align_center</span>
            </button>
            <button type="button" data-justification="R"
              class="flex-1 p-1 rounded-md ${element.justification === "R" ? "bg-white text-blue-600 shadow" : "text-slate-500 hover:bg-slate-200"} transition-all"
              data-tooltip="Right Align">
              <span class="material-icons-round text-sm">format_align_right</span>
            </button>
            <button type="button" data-justification="J"
              class="flex-1 p-1 rounded-md ${element.justification === "J" ? "bg-white text-blue-600 shadow" : "text-slate-500 hover:bg-slate-200"} transition-all"
              data-tooltip="Justified">
              <span class="material-icons-round text-sm">format_align_justify</span>
            </button>
          </div>
        </div>
      `, { open: true, elementType: element.type })}
      ${this.renderSection("Appearance", this.renderReversePrintRow(element), { open: true, elementType: element.type })}
    `;
  }

  /**
   * Render GRAPHIC (^GF Graphic Field) properties
   */
  renderGraphicProperties(element) {
    const isOpaque = element.isOpaque && element.isOpaque();
    const isEditable = element.isEditable && element.isEditable();
    const encodingLabel = isOpaque ? 'Opaque' : (element.encodingFormat === 'B64' ? ':B64:' : 'A (hex)');
    const badgeColor = isOpaque ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-600 border-slate-200';

    const opaqueNotice = isOpaque ? `
      <div class="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 leading-relaxed">
        This graphic uses an encoding the editor doesn't decode (Z64, ACS, or binary). It will be re-exported unchanged. Use Replace image to swap it for an editable one.
      </div>
    ` : '';

    const reuploadNotice = (!isOpaque && !isEditable) ? `
      <div class="mb-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600 leading-relaxed">
        Loaded from pasted ZPL — original image unavailable. Use Replace image to enable threshold and width tuning.
      </div>
    ` : '';

    const thumbnail = element.sourceDataUrl ? `
      <div class="mb-3 flex flex-col gap-1">
        <label class="block text-xs font-medium text-slate-700">Source preview</label>
        <img src="${element.sourceDataUrl}" alt="source"
          class="max-w-full max-h-24 object-contain rounded border border-slate-200 bg-white p-1" />
      </div>
    ` : '';

    // Orientation rotation requires the decoded bitmap, so it's only available
    // for editable/parsed graphics. Opaque graphics fall through without the
    // toggle group.
    const orientationRow = isOpaque ? '' : `
      <div class="mb-3">
        <label class="block text-xs font-medium text-slate-700 mb-1">Orientation</label>
        <div class="flex gap-1 bg-slate-100 rounded-lg p-1 border border-slate-200">
          <button type="button" data-orientation="N"
            class="flex-1 flex items-center justify-center p-1.5 rounded-md transition-all ${element.orientation === "N" ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:bg-white hover:text-slate-600 hover:shadow-sm"}"
            data-tooltip="Normal (N)">
            <span class="material-icons-round text-base">text_rotation_none</span>
          </button>
          <button type="button" data-orientation="R"
            class="flex-1 flex items-center justify-center p-1.5 rounded-md transition-all ${element.orientation === "R" ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:bg-white hover:text-slate-600 hover:shadow-sm"}"
            data-tooltip="Rotated 90° (R)">
            <span class="material-icons-round text-base inline-block rotate-90">text_rotation_none</span>
          </button>
          <button type="button" data-orientation="I"
            class="flex-1 flex items-center justify-center p-1.5 rounded-md transition-all ${element.orientation === "I" ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:bg-white hover:text-slate-600 hover:shadow-sm"}"
            data-tooltip="Inverted 180° (I)">
            <span class="material-icons-round text-base inline-block rotate-180">text_rotation_none</span>
          </button>
          <button type="button" data-orientation="B"
            class="flex-1 flex items-center justify-center p-1.5 rounded-md transition-all ${element.orientation === "B" ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:bg-white hover:text-slate-600 hover:shadow-sm"}"
            data-tooltip="Bottom-Up 270° (B)">
            <span class="material-icons-round text-base inline-block -rotate-90">text_rotation_none</span>
          </button>
        </div>
      </div>
    `;

    const dimensionsRow = `
      <div class="grid grid-cols-2 gap-3">
        ${this.createInputGroup("X Position", "prop-x", element.x, "number", { min: 0 })}
        ${this.createInputGroup("Y Position", "prop-y", element.y, "number", { min: 0 })}
      </div>
      ${orientationRow}
    `;

    const sizeRow = isEditable
      ? (() => {
          const locked = element.aspectLocked !== false;
          const heightDisabledAttr = locked ? 'disabled' : '';
          const heightLabelClass = locked ? 'text-slate-400' : 'text-slate-700';
          const heightInputClass = locked
            ? 'w-full rounded-md border border-slate-200 bg-slate-50 py-1.5 px-2 text-xs text-slate-400 cursor-not-allowed'
            : 'w-full rounded-md border border-slate-200 py-1.5 px-2 text-xs text-slate-700 focus:ring-1 focus:ring-blue-500 focus:border-blue-500';
          const lockIcon = locked ? 'link' : 'link_off';
          const lockTitle = locked ? 'Aspect ratio locked — click to unlock' : 'Aspect ratio unlocked — click to relock';
          const lockBtnClass = locked
            ? 'bg-white text-blue-600 shadow-sm border-slate-200'
            : 'bg-slate-100 text-slate-400 border-slate-200 hover:text-blue-600';
          return `
            <div class="grid grid-cols-[1fr_auto_1fr] gap-2 items-end mb-3">
              <div>
                <label class="block text-xs font-medium text-slate-700 mb-1">Width (dots)</label>
                <input id="prop-graphic-width" type="number" min="8" max="32000" value="${element.widthDots}"
                  class="w-full rounded-md border border-slate-200 py-1.5 px-2 text-xs text-slate-700 focus:ring-1 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <button type="button" id="prop-graphic-aspect-lock"
                data-tooltip="${lockTitle}"
                class="flex items-center justify-center w-[30px] h-[30px] rounded-md border ${lockBtnClass} transition-colors">
                <span class="material-icons-round text-[16px] leading-none">${lockIcon}</span>
              </button>
              <div>
                <label id="prop-graphic-height-label" class="block text-xs font-medium ${heightLabelClass} mb-1">Height (dots)</label>
                <input id="prop-graphic-height" type="number" min="8" max="32000" value="${element.heightDots}"
                  ${heightDisabledAttr}
                  class="${heightInputClass}" />
              </div>
            </div>
          `;
        })()
      : `
        <div class="grid grid-cols-2 gap-3">
          <div class="mb-3">
            <label class="block text-xs font-medium text-slate-400 mb-1">Width (dots)</label>
            <input type="number" disabled value="${element.widthDots}"
              class="w-full rounded-md border border-slate-200 bg-slate-50 py-1.5 px-2 text-xs text-slate-400 cursor-not-allowed" />
          </div>
          <div class="mb-3">
            <label class="block text-xs font-medium text-slate-400 mb-1">Height (dots)</label>
            <input type="number" disabled value="${element.heightDots}"
              class="w-full rounded-md border border-slate-200 bg-slate-50 py-1.5 px-2 text-xs text-slate-400 cursor-not-allowed" />
          </div>
        </div>
      `;

    const thresholdControl = isEditable ? `
      <div class="mb-3">
        <div class="flex items-center justify-between mb-1">
          <label class="block text-xs font-medium text-slate-700">Threshold</label>
          <span id="prop-graphic-threshold-value" class="text-[11px] font-mono text-slate-500">${element.threshold}</span>
        </div>
        <input id="prop-graphic-threshold" type="range" min="1" max="255" value="${element.threshold}" class="w-full" />
      </div>
    ` : `
      <div class="mb-3">
        <div class="flex items-center justify-between mb-1">
          <label class="block text-xs font-medium text-slate-400">Threshold</label>
          <span class="text-[11px] font-mono text-slate-400">—</span>
        </div>
        <input type="range" min="1" max="255" value="128" disabled class="w-full opacity-50 cursor-not-allowed" />
      </div>
    `;

    const replaceLabel = isEditable ? 'Replace image' : 'Upload image';

    return `
      ${this.renderAlignmentControls(element)}
      ${this.renderSection("Position", dimensionsRow, { elementType: element.type })}
      ${this.renderSection("Image", `
        ${opaqueNotice}
        ${reuploadNotice}
        ${thumbnail}
        <div class="flex items-center justify-between mb-3">
          <span class="text-[11px] uppercase tracking-wide text-slate-500">Encoding</span>
          <span class="text-[11px] font-mono px-2 py-0.5 rounded border ${badgeColor}">${encodingLabel}</span>
        </div>
        <button type="button" id="prop-graphic-replace"
          class="w-full px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 bg-white text-slate-700 hover:border-blue-500 hover:text-blue-600 transition-colors">
          ${replaceLabel}
        </button>
      `, { open: true, elementType: element.type })}
      ${this.renderSection("Size &amp; Conversion", `
        ${sizeRow}
        ${thresholdControl}
      `, { open: true, elementType: element.type })}
      ${this.renderSection("Appearance", this.renderReversePrintRow(element), { open: true, elementType: element.type })}
    `;
  }
}
