// Placeholder autocomplete for the Content field.
// Typing % opens a list of placeholder names already known to the label, narrowed
// as more is typed; picking one completes it to a full %name% placeholder.
//
// Every listener lives on the input or the list element, so the widget dies with
// the DOM when the properties panel re-renders — there is nothing to dispose.

import { PLACEHOLDER_PREFIX_RE, PLACEHOLDER_AT_END_RE } from '../utils/placeholders.js';

export class PlaceholderAutocomplete {
  /**
   * @param {HTMLInputElement|HTMLTextAreaElement} input - The Content field
   * @param {HTMLElement} list - The (initially hidden) dropdown container
   * @param {Function} getNames - () => string[] of known placeholder names
   */
  constructor(input, list, getNames) {
    this.input = input;
    this.list = list;
    this.getNames = getNames;
    this.matches = [];
    this.activeIndex = 0;

    const reconsider = () => this.refresh();
    input.addEventListener('input', reconsider);
    input.addEventListener('click', reconsider);
    input.addEventListener('keydown', (e) => this._onKeyDown(e));
    // A click inside the list must not blur the input before we read the caret.
    list.addEventListener('mousedown', (e) => e.preventDefault());
    list.addEventListener('click', (e) => {
      const item = e.target.closest('[data-name]');
      if (item) this._accept(item.dataset.name);
    });
    input.addEventListener('blur', () => this.close());
  }

  /**
   * The placeholder being typed immediately behind the caret, or null. The name
   * may be empty — a bare "%" offers every known name.
   *
   * Two percent signs that aren't a placeholder start are rejected:
   * - "%%" is an escaped percent, so a run of them only opens a placeholder when
   *   the count is odd.
   * - the "%" closing a complete "%price%" ends a placeholder rather than
   *   starting one. Without this, accepting a completion would immediately
   *   reopen the list, because _accept() dispatches an input event.
   */
  _prefixAtCaret() {
    const caret = this.input.selectionStart;
    if (caret === null) return null;
    const before = this.input.value.slice(0, caret);
    const match = before.match(PLACEHOLDER_PREFIX_RE);
    if (!match) return null;

    const name = match[1] ?? '';
    if (name === '' && PLACEHOLDER_AT_END_RE.test(before)) return null;

    let percents = 0;
    for (let i = match.index; i >= 0 && before[i] === '%'; i--) percents++;
    if (percents % 2 === 0) return null;

    return { name, start: match.index };
  }

  refresh() {
    const prefix = this._prefixAtCaret();
    if (!prefix) return this.close();

    const typed = prefix.name.toLowerCase();
    this.matches = this.getNames()
      .filter((name) => name.toLowerCase().startsWith(typed) && name.toLowerCase() !== typed)
      .slice(0, 8);

    if (this.matches.length === 0) return this.close();

    this.prefix = prefix;
    this.activeIndex = 0;
    this._paint();
  }

  _paint() {
    this.list.innerHTML = this.matches
      .map((name, i) => `
        <div data-name="${escapeAttr(name)}" role="option" aria-selected="${i === this.activeIndex}"
          class="cursor-pointer px-2 py-1.5 text-xs font-mono ${i === this.activeIndex ? 'bg-blue-50 text-blue-700' : 'text-slate-600'}">
          %${escapeHtml(name)}%
        </div>`)
      .join('');
    this.list.classList.remove('hidden');
  }

  close() {
    this.matches = [];
    this.list.classList.add('hidden');
    this.list.innerHTML = '';
  }

  get isOpen() {
    return this.matches.length > 0;
  }

  _onKeyDown(e) {
    if (!this.isOpen) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      this.activeIndex = (this.activeIndex + step + this.matches.length) % this.matches.length;
      this._paint();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      this._accept(this.matches[this.activeIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    }
  }

  /** Replace the partial name with the full %name% and put the caret after it. */
  _accept(name) {
    if (!name || !this.prefix) return;
    const { start } = this.prefix;
    const caret = this.input.selectionStart;
    const placeholder = `%${name}%`;

    this.input.value = this.input.value.slice(0, start) + placeholder + this.input.value.slice(caret);
    const end = start + placeholder.length;
    this.input.setSelectionRange(end, end);
    this.close();

    // The element only learns about the edit through the normal input listener.
    this.input.dispatchEvent(new Event('input', { bubbles: true }));
    this.input.focus();
  }
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/"/g, '&quot;');
}
