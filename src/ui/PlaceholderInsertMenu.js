// "% Insert" menu on the Content field label.
//
// The discoverable counterpart to PlaceholderAutocomplete: the autocomplete only
// helps once you know to type %, while this teaches that placeholders exist. Both
// insert at the caret, so either works mid-sentence.
//
// Clicking the button would normally blur the Content field and lose the caret,
// so every mousedown inside the menu is prevented and the last known selection is
// tracked instead.

import { isValidPlaceholderName } from '../utils/placeholders.js';
import { escapeHtml, escapeAttr } from '../utils/dom-helpers.js';

export class PlaceholderInsertMenu {
  /**
   * @param {Object} refs
   * @param {HTMLElement} refs.button - The "% Insert" toggle
   * @param {HTMLElement} refs.panel - The (hidden) dropdown container
   * @param {HTMLInputElement|HTMLTextAreaElement} refs.input - The Content field
   * @param {Object} callbacks
   * @param {Function} callbacks.getNames - () => string[] known placeholder names
   * @param {Function} callbacks.getValues - () => Preview Data map
   * @param {Function} callbacks.onDefine - (name) => void, adds it to Preview Data
   */
  constructor({ button, panel, input }, { getNames, getValues, onDefine }) {
    this.button = button;
    this.panel = panel;
    this.input = input;
    this.getNames = getNames;
    this.getValues = getValues;
    this.onDefine = onDefine;
    this.query = '';

    // Where to insert. Kept current while the field has focus so the menu can
    // splice into the middle of the Content rather than always appending.
    this.caret = { start: input.value.length, end: input.value.length };
    const remember = () => {
      if (this.input.selectionStart === null) return;
      this.caret = { start: this.input.selectionStart, end: this.input.selectionEnd };
    };
    for (const type of ['input', 'click', 'keyup', 'select', 'focus']) {
      input.addEventListener(type, remember);
    }

    button.addEventListener('mousedown', (e) => e.preventDefault());
    button.addEventListener('click', () => this.toggle());

    // Keeps the caret alive through a click on any row.
    panel.addEventListener('mousedown', (e) => e.preventDefault());
    panel.addEventListener('click', (e) => {
      const row = e.target.closest('[data-insert]');
      if (row) return this._insert(row.dataset.insert);
      if (e.target.closest('[data-define]')) return this._define();
    });
    panel.addEventListener('input', (e) => {
      if (e.target.dataset.search !== undefined) {
        this.query = e.target.value;
        this._paint({ keepSearchFocus: true });
      }
    });
    panel.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
        this.input.focus();
      } else if (e.key === 'Enter' && e.target.dataset.search !== undefined) {
        e.preventDefault();
        const matches = this._matches();
        if (matches.length > 0) this._insert(matches[0]);
        else this._define();
      }
    });

    // Only while open, so a properties-panel re-render can't leave one behind.
    this._onDocPointerDown = (e) => {
      if (!this.panel.isConnected) return this.close();
      if (this.panel.contains(e.target) || this.button.contains(e.target)) return;
      this.close();
    };
  }

  get isOpen() {
    return !this.panel.classList.contains('hidden');
  }

  toggle() {
    this.isOpen ? this.close() : this.open();
  }

  open() {
    this.query = '';
    this.panel.classList.remove('hidden');
    this.button.setAttribute('aria-expanded', 'true');
    document.addEventListener('mousedown', this._onDocPointerDown, true);
    this._paint({ keepSearchFocus: true });
  }

  close() {
    this.panel.classList.add('hidden');
    this.panel.innerHTML = '';
    this.button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('mousedown', this._onDocPointerDown, true);
  }

  _matches() {
    const q = this.query.trim().toLowerCase();
    return this.getNames().filter((name) => !q || name.toLowerCase().includes(q));
  }

  _paint({ keepSearchFocus = false } = {}) {
    const values = this.getValues() || {};
    const matches = this._matches();
    const typed = this.query.trim();
    const canDefine = isValidPlaceholderName(typed) && !this.getNames().includes(typed);

    const rows = matches.map((name) => `
      <button type="button" data-insert="${escapeAttr(name)}"
        class="w-full flex items-baseline justify-between gap-3 px-3 py-1.5 text-left hover:bg-blue-50">
        <span class="font-mono text-xs text-slate-700">%${escapeHtml(name)}%</span>
        <span class="shrink-0 truncate text-[11px] text-slate-400">${escapeHtml(values[name] ?? '')}</span>
      </button>`).join('');

    this.panel.innerHTML = `
      <div class="p-2 border-b border-slate-100">
        <input type="text" data-search placeholder="Search placeholders…" autocomplete="off"
          value="${escapeAttr(this.query)}"
          class="w-full rounded-md border border-slate-200 py-1 px-2 text-xs text-slate-700 bg-white" />
      </div>
      ${matches.length > 0 ? `
        <p class="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-slate-400">From Preview Data</p>
        <div class="max-h-48 overflow-y-auto">${rows}</div>
      ` : `
        <p class="px-3 py-3 text-[11px] text-slate-400">
          ${this.getNames().length === 0
            ? 'No placeholders yet. Name one below.'
            : 'Nothing matches that search.'}
        </p>
      `}
      <div class="border-t border-slate-100">
        <button type="button" data-define ${canDefine ? '' : 'disabled'}
          class="w-full px-3 py-2 text-left text-xs font-medium ${canDefine
            ? 'text-blue-600 hover:bg-blue-50'
            : 'text-slate-300 cursor-default'}">
          ${canDefine ? `+ New placeholder "${escapeHtml(typed)}"` : '+ New placeholder…'}
        </button>
        ${!canDefine && typed && !this.getNames().includes(typed) ? `
          <p class="px-3 pb-2 text-[10px] text-red-500">
            Start with a letter or _, then letters, digits, . - or _
          </p>` : ''}
      </div>`;

    if (keepSearchFocus) {
      const search = this.panel.querySelector('[data-search]');
      search?.focus();
      search?.setSelectionRange(this.query.length, this.query.length);
    }
  }

  /** Define the searched-for name, then insert it. */
  _define() {
    const name = this.query.trim();
    if (!isValidPlaceholderName(name) || this.getNames().includes(name)) {
      this.panel.querySelector('[data-search]')?.focus();
      return;
    }
    this.onDefine(name);
    this._insert(name);
  }

  /** Splice %name% over the tracked selection and put the caret after it. */
  _insert(name) {
    const placeholder = `%${name}%`;
    const { start, end } = this.caret;
    const value = this.input.value;

    this.input.value = value.slice(0, start) + placeholder + value.slice(end);
    const after = start + placeholder.length;
    this.caret = { start: after, end: after };

    this.close();
    this.input.focus();
    this.input.setSelectionRange(after, after);
    // The element only learns about the edit through the normal input listener.
    this.input.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
