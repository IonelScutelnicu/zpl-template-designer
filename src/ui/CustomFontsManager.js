// Custom Fonts Manager
// Manages the custom fonts UI and functionality

/**
 * Manager for custom ZPL fonts UI
 */
export class CustomFontsManager {
  constructor(elements, builtinFonts, callbacks) {
    this.elements = elements;
    this.builtinFonts = builtinFonts;
    this.callbacks = callbacks;
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

    if (!/^[A-Z0-9]$/.test(trimmedId)) {
      this.showError("ID must be a single letter (A-Z) or digit (0-9)");
      return null;
    }

    if (!/^[\w\-. ]+$/.test(trimmedFile)) {
      this.showError("Font file name contains invalid characters");
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

    // Clear inputs and error
    if (this.elements.newFontId) this.elements.newFontId.value = "";
    if (this.elements.newFontFile) this.elements.newFontFile.value = "";
    this.hideError();

    // Return new fonts array
    return [...existingFonts, { id: trimmedId, fontFile: trimmedFile }];
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
    const trimmed = newFontFile.trim();
    if (!/^[\w\-. ]+$/.test(trimmed)) {
      this.showError("Font file name contains invalid characters");
      return existingFonts;
    }
    return existingFonts.map(f =>
      f.id === fontId ? { ...f, fontFile: trimmed } : f
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

    this.elements.list.innerHTML = customFonts.map(font => `
      <div class="flex items-center gap-2 bg-slate-50 rounded px-2 py-1.5 border border-slate-100">
        <span class="font-mono font-bold text-blue-600 w-6">${this.escapeHtml(font.id)}</span>
        <span class="custom-font-file flex-1 text-slate-600 truncate text-[11px] cursor-pointer hover:text-blue-600"
          data-font-id="${this.escapeHtml(font.id)}" title="${this.escapeHtml(font.fontFile)} (click to edit)">${this.escapeHtml(font.fontFile)}</span>
        <button class="remove-custom-font text-slate-400 hover:text-red-500 transition-colors p-0.5"
          data-font-id="${this.escapeHtml(font.id)}" title="Remove">
          <span class="material-icons-round text-sm">close</span>
        </button>
      </div>
    `).join('');

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
      option.textContent = `${font.id} - Custom`;
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
