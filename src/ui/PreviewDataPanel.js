// Preview Data Panel
// Lists every placeholder the label knows about and lets the user give each one a
// sample value. Values drive the canvas and the Labelary Preview only — exported
// ZPL always keeps the %placeholder% itself.
//
// A placeholder reaches this panel three ways: used in an element's Content,
// defined here by hand, or supplied by the Host in Embed mode. The last two are
// simply keys in previewData that no Content references yet, so they render under
// an "Unused" heading rather than disappearing.

import { placeholderNames, isValidPlaceholderName } from '../utils/placeholders.js';
import { escapeHtml, escapeAttr, autoGrowTextarea } from '../utils/dom-helpers.js';

export class PreviewDataPanel {
  /**
   * @param {HTMLElement} container - The panel body element
   * @param {Function} onChange - (previewData) => void, called on every edit
   */
  constructor(container, onChange) {
    this.container = container;
    this.onChange = onChange;
    this.values = {};

    // Delegated listeners survive every re-render.
    this.container.addEventListener('input', (e) => {
      const name = e.target.dataset?.placeholder;
      if (!name) return;
      autoGrowTextarea(e.target);
      this.onChange({ ...this.values, [name]: e.target.value });
    });

    this.container.addEventListener('click', (e) => {
      if (e.target.closest('#preview-data-add')) return this._addFromInput();
      const remove = e.target.closest('[data-remove-placeholder]');
      if (remove) {
        const next = { ...this.values };
        delete next[remove.dataset.removePlaceholder];
        this.onChange(next);
      }
    });

    this.container.addEventListener('keydown', (e) => {
      if (e.target.id === 'preview-data-new' && e.key === 'Enter') {
        e.preventDefault();
        this._addFromInput();
      }
    });
  }

  /**
   * Placeholder names actually used on the label, in element order.
   * @param {Array} elements
   * @param {Object} labelSettings
   * @returns {string[]}
   */
  static discover(elements, labelSettings) {
    const names = [];
    for (const element of elements || []) {
      for (const name of placeholderNames(element.content)) {
        if (!names.includes(name)) names.push(name);
      }
    }
    // ^PQ's quantity placeholder is a bare name, not part of any Content.
    const qty = labelSettings?.printQuantityPlaceholder;
    if (qty && !names.includes(qty)) names.push(qty);
    return names;
  }

  /** Every name the label knows about — used plus merely defined. */
  static known(elements, labelSettings) {
    const used = PreviewDataPanel.discover(elements, labelSettings);
    const defined = Object.keys(labelSettings?.previewData || {});
    return [...used, ...defined.filter((name) => !used.includes(name))];
  }

  _addFromInput() {
    const input = this.container.querySelector('#preview-data-new');
    const error = this.container.querySelector('#preview-data-new-error');
    if (!input) return;
    const name = input.value.trim();

    const fail = (message) => {
      if (error) {
        error.textContent = message;
        error.classList.remove('hidden');
      }
      input.focus();
    };

    if (!name) return;
    if (!isValidPlaceholderName(name)) {
      return fail('Start with a letter or _, then letters, digits, . - or _');
    }
    if (name in this.values) return fail(`"${name}" already exists.`);

    input.value = '';
    error?.classList.add('hidden');
    this._focusAfterRender = name;
    this.onChange({ ...this.values, [name]: '' });
  }

  render(elements, labelSettings) {
    this.values = labelSettings?.previewData || {};
    const used = PreviewDataPanel.discover(elements, labelSettings);
    const unused = Object.keys(this.values).filter((name) => !used.includes(name));
    const signature = `${used.join(',')}|${unused.join(',')}`;

    // Typing a value re-renders the whole panel; rebuilding the inputs would steal
    // focus mid-keystroke. While the placeholder list is unchanged, sync values in
    // place instead and leave the input being edited alone.
    if (this.renderedSignature === signature) {
      this.syncValues();
      return;
    }
    this.renderedSignature = signature;

    const row = (name, isUsed) => `
      <div class="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
        <div class="flex items-center justify-between gap-1 mb-1.5">
          <span class="text-[11px] text-slate-500 font-mono">${escapeHtml(name)}</span>
          ${isUsed ? '' : `
            <button type="button" data-remove-placeholder="${escapeAttr(name)}"
              aria-label="Remove ${escapeAttr(name)}"
              class="shrink-0 text-slate-300 hover:text-red-500 leading-none text-sm">&times;</button>`}
        </div>
        <textarea rows="1" data-placeholder="${escapeAttr(name)}" placeholder="${escapeAttr(name)}"
          class="w-full resize-none overflow-hidden rounded-md border border-slate-200 py-1 px-2 text-xs text-slate-700 bg-white">
${escapeHtml(this.values[name] ?? '')}</textarea>
      </div>`;

    const usedSection = used.length > 0
      ? `<div class="space-y-2">${used.map((name) => row(name, true)).join('')}</div>`
      : `<p class="text-slate-400 italic">
           No placeholders in use. Write <code>%name%</code> in an element's Content, or define one below.
         </p>`;

    const unusedSection = unused.length > 0 ? `
      <div class="pt-2 border-t border-slate-100 space-y-2">
        <p class="text-[10px] text-slate-400 uppercase tracking-wider">Not used on this label</p>
        ${unused.map((name) => row(name, false)).join('')}
      </div>` : '';

    this.container.innerHTML = `
      <p class="text-slate-400">Sample values for the canvas and preview. Exported ZPL keeps the placeholders.</p>
      ${usedSection}
      ${unusedSection}
      <div class="pt-2 border-t border-slate-100">
        <label for="preview-data-new" class="block text-[10px] text-slate-400 uppercase tracking-wider mb-1">Add placeholder</label>
        <div class="flex gap-1.5">
          <input type="text" id="preview-data-new" placeholder="name" autocomplete="off"
            class="min-w-0 flex-1 rounded-md border border-slate-200 py-1 px-2 text-xs text-slate-700 bg-white" />
          <button type="button" id="preview-data-add"
            class="shrink-0 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:border-blue-500 hover:text-blue-600">Add</button>
        </div>
        <p id="preview-data-new-error" class="hidden mt-1 text-[10px] text-red-500"></p>
      </div>`;

    for (const field of this.container.querySelectorAll('[data-placeholder]')) {
      autoGrowTextarea(field);
    }

    if (this._focusAfterRender) {
      this.container.querySelector(`[data-placeholder="${CSS.escape(this._focusAfterRender)}"]`)?.focus();
      this._focusAfterRender = null;
    }
  }

  /** Push current values into the inputs without rebuilding them. */
  syncValues() {
    for (const input of this.container.querySelectorAll('[data-placeholder]')) {
      if (input === document.activeElement) continue;
      input.value = this.values[input.dataset.placeholder] ?? '';
      autoGrowTextarea(input);
    }
  }
}
