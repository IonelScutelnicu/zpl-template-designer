// History Panel UI
// Manages the history panel sidebar for undo/redo navigation

/**
 * UI manager for the history panel
 */
export class HistoryPanel {
  constructor(elements, onHistorySelect) {
    this.elements = elements;
    this.onHistorySelect = onHistorySelect;

    // Icon mapping for different history entry types
    this.iconMap = {
      add: { icon: "add_box", color: "text-green-600 bg-green-100" },
      delete: { icon: "delete", color: "text-red-600 bg-red-100" },
      move: { icon: "open_with", color: "text-blue-600 bg-blue-100" },
      resize: { icon: "crop_free", color: "text-blue-600 bg-blue-100" },
      align: { icon: "align_horizontal_left", color: "text-indigo-600 bg-indigo-100" },
      reorder: { icon: "swap_vert", color: "text-slate-600 bg-slate-100" },
      settings: { icon: "tune", color: "text-amber-600 bg-amber-100" },
      edit: { icon: "edit", color: "text-slate-700 bg-slate-100" },
      paste: { icon: "content_paste", color: "text-emerald-600 bg-emerald-100" },
      import: { icon: "file_upload", color: "text-sky-600 bg-sky-100" },
      clear: { icon: "delete_sweep", color: "text-red-600 bg-red-100" },
      init: { icon: "description", color: "text-slate-500 bg-slate-100" }
    };
  }

  /**
   * Render the history list
   * @param {Array} historyEntries - Array of history entries
   * @param {number} currentIndex - Current history index
   * @returns {string} HTML string
   */
  renderList(historyEntries, currentIndex) {
    if (!historyEntries || historyEntries.length === 0) {
      return '<p class="text-center text-slate-400 py-10 italic text-xs">No history yet</p>';
    }

    return historyEntries
      .map((entry, index) => this.renderHistoryEntry(entry, index, currentIndex))
      .join("");
  }

  /**
   * Render a single history entry
   */
  renderHistoryEntry(entry, index, currentIndex) {
    const isActive = index === currentIndex;
    const activeClasses = isActive
      ? "bg-blue-50 border-l-4 border-blue-500"
      : "hover:bg-slate-50";
    const labelClasses = isActive ? "text-blue-600 font-semibold" : "text-slate-700";
    const time = entry.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const meta = this.iconMap[entry.kind] || this.iconMap.edit;
    const detail = entry.detail ? `<p class="text-[11px] text-slate-500 mt-1">${this.escapeHtml(entry.detail)}</p>` : "";

    return `
      <button class="w-full text-left px-4 py-3 border-b border-slate-100 ${activeClasses}" data-history-index="${index}">
        <div class="flex items-start gap-3">
          <div class="mt-0.5 w-8 h-8 rounded-full flex items-center justify-center ${meta.color}">
            <span class="material-icons-round text-sm">${meta.icon}</span>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs ${labelClasses}">${this.escapeHtml(entry.label)}</span>
              <span class="text-[10px] text-slate-400 font-mono">${time}</span>
            </div>
            ${detail}
          </div>
        </div>
      </button>
    `;
  }

  /**
   * Open the history panel
   */
  open() {
    if (this.elements.panel) {
      this.elements.panel.classList.add("open");
    }
    if (this.elements.backdrop) {
      this.elements.backdrop.classList.add("open");
    }
  }

  /**
   * Close the history panel
   */
  close() {
    if (this.elements.panel) {
      this.elements.panel.classList.remove("open");
    }
    if (this.elements.backdrop) {
      this.elements.backdrop.classList.remove("open");
    }
  }

  /**
   * Handle click on history entry
   */
  handleClick(event) {
    const button = event.target.closest("[data-history-index]");
    if (!button) return;

    const index = parseInt(button.dataset.historyIndex, 10);
    if (Number.isNaN(index)) return;

    if (this.onHistorySelect) {
      this.onHistorySelect(index);
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
