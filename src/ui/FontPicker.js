// Font Picker
// Specimen-row dropdown shared by the label default font (^CF) and the per-element
// "Font ID (override)" control. A visually hidden native <select> holds the canonical
// value so the existing change wiring keeps working; the popover dispatches to it
// (same pattern as the Symbology picker in PropertiesPanelRenderer).

import { BUILTIN_FONTS, ZPL_FONTS } from '../config/constants.js';
import { customFontFamily, exceedsApiPreview } from '../utils/customFonts.js';
import { escapeAttr, escapeHtml } from '../utils/dom-helpers.js';
import { ensureCustomFontLoaded, ensureFontLoaded } from '../utils/fontLoader.js';

const SPECIMEN_TEXT = 'ABC 123';
// Face used when a font has no preview file, so a reference-only row still shows
// something readable instead of an empty slot.
const FALLBACK_FAMILY = 'Arial, Helvetica, sans-serif';
// A specimen row needs more width than the settings sidebar column gives it, so the
// menu is positioned (fixed) rather than stretched to the trigger.
const MENU_MIN_WIDTH = 272;
const MENU_GAP = 6;

/**
 * Specimen size follows the font's cell height, so G (60 dots) reads as the giant
 * it is next to A (9 dots). Scalable and custom faces have no cell, so they sit
 * mid-range.
 */
function specimenSize(bitmap) {
  if (!bitmap) return 17;
  return Math.round(Math.min(22, Math.max(13, 13 + (bitmap.magStep - 9) * 0.18)));
}

/** Stem of a ^CW printer path (`E:MYFONT.TTF` → `MYFONT`), for the meta line. */
function pathStem(fontFile) {
  return String(fontFile || '').replace(/^[A-Z]:/i, '').replace(/\.TTF$/i, '');
}

/**
 * Describe one selectable font: the badge id, the specimen face, the mono meta line
 * and the preview-availability chip. Built-ins come from ZPL_FONTS, custom fonts from
 * the label's ^CW list.
 */
function describeFont(id, customFont) {
  if (customFont) {
    const stem = pathStem(customFont.fontFile);
    const embedded = !!customFont.source;
    return {
      id,
      family: embedded ? `'${customFontFamily(customFont.source)}', ${FALLBACK_FAMILY}` : FALLBACK_FAMILY,
      weight: 'normal',
      size: specimenSize(null),
      kind: embedded ? 'Embedded' : 'Declared',
      metric: stem,
      meta: `${id} · ${stem} · ${embedded ? 'Embedded TTF' : 'Declared ^CW'}`,
      chip: !embedded
        ? { text: 'No preview', title: 'No preview file — renders in a fallback face' }
        : exceedsApiPreview(customFont.source)
          ? { text: 'Canvas only', title: 'Over 2 MB: the canvas uses the real face, the API preview falls back' }
          : null,
    };
  }
  const font = ZPL_FONTS[id] || ZPL_FONTS['default'];
  const cell = font.bitmap ? `${font.bitmap.magStep}×${font.bitmap.magWidthStep}` : null;
  return {
    id,
    family: font.family,
    weight: font.weight || 'normal',
    size: specimenSize(font.bitmap),
    kind: cell ? 'Bitmap' : 'Scalable',
    metric: cell || 'outline',
    meta: cell ? `${id} · ${cell} · Resident bitmap` : `${id} · Scalable outline`,
    chip: null,
  };
}

function badgeHtml(text, selected) {
  const tone = selected ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-500';
  return `<span class="shrink-0 flex h-6 w-6 items-center justify-center rounded-md font-mono text-[11px] font-bold ${tone}">${escapeHtml(text)}</span>`;
}

function groupHeaderHtml(title, count) {
  return `
    <div class="flex items-center justify-between px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
      <span>${title}</span><span class="font-mono">${count}</span>
    </div>`;
}

function optionHtml(info, selected) {
  const rowTone = selected ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-slate-50';
  const chip = info.chip
    ? `<span class="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-600" title="${escapeAttr(info.chip.title)}">${info.chip.text}</span>`
    : '';
  return `
    <button type="button" role="option" data-font-id="${escapeAttr(info.id)}" aria-selected="${selected}"
      class="font-picker-option w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition ${rowTone}">
      ${badgeHtml(info.id, selected)}
      <span class="flex-1 min-w-0">
        <span class="block truncate leading-tight text-slate-800"
          style="font-family: ${escapeAttr(info.family)}; font-weight: ${info.weight}; font-size: ${info.size}px">${SPECIMEN_TEXT}</span>
        <span class="block truncate font-mono text-[10px] text-slate-400">${escapeHtml(info.meta)}</span>
      </span>
      ${chip}
      <span class="material-icons-round shrink-0 text-lg text-blue-500 ${selected ? '' : 'invisible'}">check</span>
    </button>`;
}

/** The override picker's leading row: clear the override and follow the label default. */
function inheritOptionHtml(labelFontId, selected) {
  const rowTone = selected ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-slate-50';
  return `
    <button type="button" role="option" data-font-id="" aria-selected="${selected}"
      class="font-picker-option w-full flex items-center gap-2.5 rounded-lg px-2 py-2 text-left transition ${rowTone}">
      ${badgeHtml('↓', selected)}
      <span class="flex-1 min-w-0">
        <span class="block truncate text-xs font-medium leading-tight text-slate-700">Use label default</span>
        <span class="block truncate font-mono text-[10px] text-slate-400">inherits ${escapeHtml(labelFontId || '0')}</span>
      </span>
      <span class="material-icons-round shrink-0 text-lg text-blue-500 ${selected ? '' : 'invisible'}">check</span>
    </button>`;
}

/**
 * Build the picker markup.
 * @param {Object} opts
 * @param {string} opts.selectId - id of the canonical <select> ("font-id" / "prop-font-id")
 * @param {string} opts.current - selected font id ('' means "use label default")
 * @param {Array} opts.customFonts - the label's ^CW fonts
 * @param {string} [opts.labelFontId] - label default, shown on the inherit row
 * @param {boolean} [opts.override] - element override picker: emits the hidden <select>
 *   itself and offers "Use label default". The label picker's <select> lives in
 *   index.html instead, so app.js can keep a stable reference to it.
 */
export function fontPickerHtml({ selectId, current, customFonts = [], labelFontId, override = false }) {
  const customById = new Map(customFonts.map(font => [font.id, font]));
  const infoFor = (id) => describeFont(id, customById.get(id));
  const bitmapIds = BUILTIN_FONTS.filter(id => id !== '0');

  const inherit = override && !current;
  const triggerInfo = inherit ? null : infoFor(current || '0');
  const trigger = inherit
    ? `${badgeHtml('↓', false)}
       <span class="flex-1 min-w-0 truncate text-xs font-medium text-slate-700">Use label default</span>
       <span class="shrink-0 font-mono text-[10px] text-slate-400">${escapeHtml(labelFontId || '0')}</span>`
    : `${badgeHtml(triggerInfo.id, false)}
       <span class="flex-1 min-w-0 truncate text-xs font-medium text-slate-700">${escapeHtml(triggerInfo.id)} · ${triggerInfo.kind}</span>
       <span class="shrink-0 font-mono text-[10px] text-slate-400 truncate max-w-[6rem]">${escapeHtml(triggerInfo.metric)}</span>`;

  const nativeSelect = override
    ? `<select id="${selectId}" class="sr-only" tabindex="-1" aria-hidden="true">
         <option value="" ${current ? '' : 'selected'}>Use label default</option>
         ${BUILTIN_FONTS.map(id => `<option value="${id}" ${current === id ? 'selected' : ''}>${escapeHtml(infoFor(id).meta)}</option>`).join('')}
         ${customFonts.map(font => `<option value="${escapeAttr(font.id)}" ${current === font.id ? 'selected' : ''}>${escapeHtml(infoFor(font.id).meta)}</option>`).join('')}
       </select>`
    : '';

  const groups = [
    override ? inheritOptionHtml(labelFontId, !current) : '',
    groupHeaderHtml('Scalable', 1),
    optionHtml(infoFor('0'), current === '0'),
    groupHeaderHtml('Resident bitmap', bitmapIds.length),
    bitmapIds.map(id => optionHtml(infoFor(id), current === id)).join(''),
    customFonts.length
      ? groupHeaderHtml('Embedded · downloaded', customFonts.length)
        + customFonts.map(font => optionHtml(infoFor(font.id), current === font.id)).join('')
      : '',
  ].join('');

  return `
    <div class="font-picker relative" data-select="${escapeAttr(selectId)}" data-open="false">
      ${nativeSelect}
      <button type="button" class="font-picker-trigger w-full flex items-center gap-2.5 rounded-lg border border-blue-300 bg-white px-2.5 py-2 text-left shadow-sm ring-1 ring-blue-100 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-300 transition"
        aria-haspopup="listbox" aria-expanded="false">
        ${trigger}
        <span class="font-picker-chevron material-icons-round shrink-0 text-lg text-slate-400 transition-transform">expand_more</span>
      </button>
      <div class="font-picker-menu hidden fixed z-50 rounded-xl border border-slate-200 bg-white shadow-xl"
        data-menu-for="${escapeAttr(selectId)}" role="listbox">
        <div class="font-picker-list max-h-72 overflow-auto p-1.5">${groups}</div>
      </div>
    </div>`;
}

/**
 * Custom and bundled faces are registered imperatively via document.fonts, so a
 * specimen's font-family alone won't load anything. Unlike the canvas, DOM text
 * restyles itself once a FontFace lands, so nothing has to be re-rendered.
 */
export function ensureSpecimenFaces(customFonts = []) {
  BUILTIN_FONTS.forEach(id => ensureFontLoaded(id));
  customFonts.forEach(font => { if (font.source) ensureCustomFontLoaded(font.source); });
}

/**
 * Wire the picker inside `root`: trigger toggles the popover, an option sets the
 * canonical <select> and fires `change` so the existing handlers run. Closing
 * detaches the document listeners it added, so a re-rendered panel leaves nothing
 * behind.
 */
export function attachFontPicker(root) {
  const picker = root?.classList?.contains('font-picker') ? root : root?.querySelector('.font-picker');
  if (!picker) return;
  const select = document.getElementById(picker.dataset.select);
  const trigger = picker.querySelector('.font-picker-trigger');
  const menu = picker.querySelector('.font-picker-menu');
  const list = menu?.querySelector('.font-picker-list');
  if (!select || !trigger || !menu || !list) return;
  // A panel re-rendered while its menu was open leaves that menu parked on <body>.
  document.querySelectorAll('body > .font-picker-menu').forEach(stray => stray.remove());

  const close = () => {
    if (picker._onOutside) {
      document.removeEventListener('click', picker._onOutside, true);
      document.removeEventListener('keydown', picker._onOutside, true);
      window.removeEventListener('scroll', picker._onScroll, true);
      picker._onOutside = null;
      picker._onScroll = null;
    }
    menu.classList.add('hidden');
    picker.appendChild(menu);
    picker.dataset.open = 'false';
    trigger.setAttribute('aria-expanded', 'false');
    picker.querySelector('.font-picker-chevron')?.classList.remove('rotate-180');
  };

  /**
   * Size and position the fixed menu against the trigger: at least MENU_MIN_WIDTH
   * wide (the sidebar column is far narrower than a specimen row needs) and centred
   * on it, dropping below unless it doesn't fit and there's more room above.
   */
  const place = () => {
    // #properties-card carries a backdrop-filter, which makes it the containing block
    // for fixed descendants — the menu only lands on the viewport from <body>.
    // Re-appending an attached node moves it, which would reset the list's scroll.
    if (menu.parentElement !== document.body) document.body.appendChild(menu);
    const rect = trigger.getBoundingClientRect();
    const width = Math.max(rect.width, MENU_MIN_WIDTH);
    const below = window.innerHeight - rect.bottom - MENU_GAP * 2;
    const above = rect.top - MENU_GAP * 2;
    list.style.maxHeight = `${Math.max(160, Math.min(288, Math.max(below, above)))}px`;
    menu.style.width = `${width}px`;
    const centred = rect.left + rect.width / 2 - width / 2;
    menu.style.left = `${Math.min(Math.max(MENU_GAP, centred), window.innerWidth - width - MENU_GAP)}px`;
    menu.style.top = `${rect.bottom + MENU_GAP}px`;
    menu.classList.remove('hidden');
    // offsetHeight only reads true once the menu is laid out, so the flip decision
    // comes after it's shown.
    if (below < above && below < menu.offsetHeight) {
      menu.style.top = `${Math.max(MENU_GAP, rect.top - menu.offsetHeight - MENU_GAP)}px`;
    }
  };

  const open = () => {
    place();
    picker.dataset.open = 'true';
    trigger.setAttribute('aria-expanded', 'true');
    picker.querySelector('.font-picker-chevron')?.classList.add('rotate-180');
    picker._onOutside = (e) => {
      if (e.key === 'Escape' || !picker.contains(e.target) && !menu.contains(e.target)) close();
    };
    // The menu is fixed so it can outgrow the sidebar's clipped column, which also
    // means scrolling the panel behind it has to move it back onto the trigger.
    // Scroll doesn't bubble but does capture, so the list's own scrolling arrives
    // here too — that one must not re-place the menu.
    picker._onScroll = (e) => { if (!menu.contains(e.target)) place(); };
    document.addEventListener('click', picker._onOutside, true);
    document.addEventListener('keydown', picker._onOutside, true);
    window.addEventListener('scroll', picker._onScroll, true);
  };

  trigger.addEventListener('click', () => {
    if (picker.dataset.open === 'true') close();
    else open();
  });

  menu.querySelectorAll('.font-picker-option').forEach(option => {
    option.addEventListener('click', () => {
      close();
      const next = option.dataset.fontId;
      if (next !== select.value) {
        select.value = next;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  });
}
