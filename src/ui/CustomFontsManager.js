// Custom Fonts Manager
// Manages the custom fonts UI and functionality

import { CUSTOM_FONT_IDS, PRINTER_FONT_PATH_RE, customFontFamily, ensurePrinterDrive, exceedsApiPreview, normalizePrinterFontPath } from '../utils/customFonts.js';
import { ensureCustomFontLoaded } from '../utils/fontLoader.js';

// Kept short on purpose: the specimen box narrows to ~130px in the compact
// sidebar, and a specimen clipped mid-word defeats the point of showing the face.
const SPECIMEN_TEXT = 'Handling 0123';

/**
 * Manager for custom ZPL fonts UI
 */
export class CustomFontsManager {
  constructor(elements, builtinFonts, callbacks) {
    this.elements = elements;
    this.builtinFonts = builtinFonts;
    this.callbacks = callbacks;
    // Specimens whose FontFace registration has already been requested, so the
    // re-render that shows the real face happens once per font, not per render.
    this.specimenRequested = new Set();
  }

  /**
   * Normalize and validate a printer font path. Driveless input (including
   * legacy templates saved before paths carried a drive) defaults to R:, the
   * printer's default drive. Returns the canonical path or null (with the
   * error shown) if it doesn't fit the supported grammar.
   */
  validatePrinterPath(value, existingFonts, editedFontId = null) {
    const path = ensurePrinterDrive(normalizePrinterFontPath(value));
    if (!PRINTER_FONT_PATH_RE.test(path)) {
      this.showError("Printer path must look like E:MYFONT.TTF (1-16 letters/digits)");
      return null;
    }
    const conflict = existingFonts.find(f => f.id !== editedFontId
      && ensurePrinterDrive(normalizePrinterFontPath(f.fontFile)) === path);
    if (conflict) {
      this.showError(`Font ID '${conflict.id}' already uses ${path}`);
      return null;
    }
    return path;
  }

  /**
   * Add a custom font
   * @param {string} id - Font ID (single character A-Z or 0-9)
   * @param {string} file - Font file name
   * @param {Array} existingFonts - Current custom fonts array
   * @returns {Object|null} - New fonts array or null if validation fails
   */
  add(id, file, existingFonts) {
    const trimmedId = id.trim().toUpperCase();
    const trimmedFile = file.trim();

    // Validation
    if (!trimmedId || !trimmedFile) {
      this.showError("Both ID and Font File are required");
      return null;
    }

    if (!CUSTOM_FONT_IDS.includes(trimmedId)) {
      this.showError(`ID must be one of ${CUSTOM_FONT_IDS.join(', ')}`);
      return null;
    }

    if (this.builtinFonts.includes(trimmedId)) {
      this.showError(`Font ID '${trimmedId}' is a built-in font and cannot be overridden`);
      return null;
    }

    if (existingFonts.some(f => f.id === trimmedId)) {
      this.showError(`Font ID '${trimmedId}' is already defined`);
      return null;
    }

    const fontFile = this.validatePrinterPath(trimmedFile, existingFonts);
    if (!fontFile) return null;

    // Clear inputs and error
    if (this.elements.newFontId) this.elements.newFontId.value = "";
    if (this.elements.newFontFile) this.elements.newFontFile.value = "";
    this.hideError();

    // Return new fonts array
    return [...existingFonts, { id: trimmedId, fontFile }];
  }

  /**
   * Remove a custom font
   * @param {string} id - Font ID to remove
   * @param {Array} existingFonts - Current custom fonts array
   * @returns {Array} - New fonts array
   */
  remove(id, existingFonts) {
    return existingFonts.filter(f => f.id !== id);
  }

  /**
   * Update a custom font's file
   * @param {string} fontId - Font ID to update
   * @param {string} newFontFile - New font file name
   * @param {Array} existingFonts - Current custom fonts array
   * @returns {Array} - New fonts array
   */
  updateFile(fontId, newFontFile, existingFonts) {
    const fontFile = this.validatePrinterPath(newFontFile, existingFonts, fontId);
    if (!fontFile) return existingFonts;
    return existingFonts.map(f =>
      f.id === fontId ? { ...f, fontFile } : f
    );
  }

  /**
   * Render the custom fonts list
   * @param {Array} customFonts - Array of custom fonts
   */
  render(customFonts) {
    if (!this.elements.list) return;

    if (customFonts.length === 0) {
      this.elements.list.innerHTML = '<p class="text-slate-400 text-[10px] italic">No custom fonts defined</p>';
      return;
    }

    const notes = [
      customFonts.some(font => !font.source)
        && 'A font without a preview file renders on the canvas in a fallback face.',
      customFonts.some(font => font.source && exceedsApiPreview(font.source))
        && 'Fonts over 2 MB are too large for the Labelary preview — the canvas uses the real face, the API preview falls back.',
    ].filter(Boolean);
    const hint = notes
      .map(note => `<p class="text-[10px] text-slate-400 italic">${note}</p>`)
      .join('');

    this.elements.list.innerHTML = customFonts.map(font => `
      <div class="bg-slate-50 rounded px-2 py-1.5 border border-slate-100 space-y-1.5">
        <div class="flex items-center gap-2">
          <span class="font-mono font-bold text-blue-600 w-6">${this.escapeHtml(font.id)}</span>
          <span class="custom-font-file flex-1 text-slate-600 truncate text-[11px] cursor-pointer hover:text-blue-600"
            data-font-id="${this.escapeHtml(font.id)}" title="${this.escapeHtml(font.fontFile)} (click to edit)">${this.escapeHtml(font.fontFile)}</span>
          ${font.source ? `${exceedsApiPreview(font.source)
            ? '<span class="text-[9px] text-amber-600" title="Over 2 MB: canvas preview only">Canvas only</span>'
            : '<span class="text-[9px] text-emerald-600">Ready</span>'}
          <button class="export-custom-font text-slate-400 hover:text-blue-500 transition-colors p-0.5"
            data-font-id="${this.escapeHtml(font.id)}" title="Export printer install ZPL">
            <span class="material-icons-round text-sm">download</span>
          </button>` : ''}
          <button class="remove-custom-font text-slate-400 hover:text-red-500 transition-colors p-0.5"
            data-font-id="${this.escapeHtml(font.id)}" title="Remove">
            <span class="material-icons-round text-sm">close</span>
          </button>
        </div>
        ${font.source ? `<button class="replace-preview-font w-full text-left truncate rounded border border-slate-200 bg-white px-2 py-1.5 text-[15px] leading-tight text-slate-700 hover:border-blue-300 transition-colors"
          data-font-id="${this.escapeHtml(font.id)}" title="${this.escapeHtml(font.source.fileName || 'Preview file')} (click to replace)"
          style="font-family: '${customFontFamily(font.source)}', Arial, sans-serif">${SPECIMEN_TEXT}</button>`
        : `<button class="attach-custom-font w-full flex items-center justify-center gap-1 py-1 rounded border border-dashed border-blue-300 text-blue-600 hover:bg-blue-50 transition-colors"
          data-font-id="${this.escapeHtml(font.id)}" title="Attach a TTF so this font previews in its real face">
          <span class="material-icons-round text-sm">add</span>
          <span>Add preview file</span>
        </button>`}
      </div>
    `).join('') + hint;

    this.loadSpecimenFaces(customFonts);

    // Attach click handlers for inline editing
    this.elements.list.querySelectorAll('.custom-font-file').forEach(span => {
      span.addEventListener('click', (e) => this.startEdit(e));
    });

    // Attach click handlers for remove buttons
    this.elements.list.querySelectorAll('.remove-custom-font').forEach(button => {
      button.addEventListener('click', (e) => {
        const fontId = e.currentTarget.dataset.fontId;
        if (this.callbacks.onRemove) {
          this.callbacks.onRemove(fontId);
        }
      });
    });
    this.elements.list.querySelectorAll('.export-custom-font').forEach(button => {
      button.addEventListener('click', (e) => this.callbacks.onExport?.(e.currentTarget.dataset.fontId));
    });
    // Attaching and replacing are the same operation: the picked TTF is merged
    // in as the font's preview source, leaving its ^CW path untouched.
    this.elements.list.querySelectorAll('.attach-custom-font, .replace-preview-font').forEach(button => {
      button.addEventListener('click', (e) => this.callbacks.onAttach?.(e.currentTarget.dataset.fontId));
    });
  }

  /**
   * Custom faces are registered imperatively via document.fonts, so a specimen's
   * font-family alone won't load anything. Fonts arriving from a ZPL import,
   * template or share URL haven't been loaded unless an element uses them.
   * @param {Array} customFonts - Array of custom fonts
   */
  loadSpecimenFaces(customFonts) {
    const sources = customFonts
      .map(font => font.source)
      .filter(source => source?.sha256 && !this.specimenRequested.has(source.sha256));
    if (sources.length === 0) return;
    sources.forEach(source => this.specimenRequested.add(source.sha256));
    Promise.all(sources.map(ensureCustomFontLoaded)).then(results => {
      if (results.some(Boolean)) this.callbacks.onRender?.();
    });
  }

  /**
   * Start inline editing of a font file name
   * @param {Event} e - Click event
   */
  startEdit(e) {
    const span = e.target;
    const fontId = span.dataset.fontId;
    const currentValue = span.textContent;

    // Create input field
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentValue;
    input.className = 'flex-1 text-[11px] px-1 py-0.5 border border-blue-400 rounded outline-none focus:ring-1 focus:ring-blue-500';
    input.dataset.fontId = fontId;

    // Replace span with input
    span.replaceWith(input);
    input.focus();
    input.select();

    // Handle save on blur or Enter
    const saveEdit = () => {
      const newValue = input.value.trim();
      if (newValue && newValue !== currentValue) {
        if (this.callbacks.onUpdateFile) {
          this.callbacks.onUpdateFile(fontId, newValue);
        }
      } else {
        if (this.callbacks.onRender) {
          this.callbacks.onRender(); // Restore original if empty or unchanged
        }
      }
    };

    input.addEventListener('blur', saveEdit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      } else if (e.key === 'Escape') {
        input.value = currentValue; // Reset to original
        input.blur();
      }
    });
  }

  /**
   * Update font dropdown with custom fonts
   * @param {Array} customFonts - Array of custom fonts
   */
  updateFontDropdown(customFonts) {
    if (!this.elements.fontDropdown) return;

    // Store current value
    const currentValue = this.elements.fontDropdown.value;

    // Remove existing custom font options (keep only built-in)
    const options = Array.from(this.elements.fontDropdown.options);
    options.forEach(opt => {
      if (!this.builtinFonts.includes(opt.value)) {
        opt.remove();
      }
    });

    // Add custom fonts
    customFonts.forEach(font => {
      const option = document.createElement('option');
      option.value = font.id;
      option.textContent = `${font.id} - ${font.source ? (font.source.fileName || 'Custom') : 'Printer font'}`;
      this.elements.fontDropdown.appendChild(option);
    });

    // Restore value if still valid
    if (Array.from(this.elements.fontDropdown.options).some(opt => opt.value === currentValue)) {
      this.elements.fontDropdown.value = currentValue;
    }
  }

  /**
   * Show an error message
   * @param {string} message - Error message
   */
  showError(message) {
    if (this.elements.error) {
      this.elements.error.textContent = message;
      this.elements.error.classList.remove('hidden');
    }
  }

  /**
   * Hide the error message
   */
  hideError() {
    if (this.elements.error) {
      this.elements.error.classList.add('hidden');
    }
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
