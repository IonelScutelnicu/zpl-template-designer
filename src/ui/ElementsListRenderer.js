// Elements List Renderer
// Generates HTML for the elements list sidebar

/**
 * Renderer for the elements list UI
 */
export class ElementsListRenderer {
  /**
   * Render the elements list
   * @param {Array} elements - Array of elements
   * @param {Object|null} selectedElement - Currently selected element
   * @param {Array} warnings - Current warnings array
   * @returns {string} HTML string
   */
  render(elements, selectedElement, warnings = []) {
    if (elements.length === 0) {
      return '<p class="text-center text-slate-400 py-8 italic text-xs">No elements added yet</p>';
    }

    return elements
      .map((element, index) => this.renderElementItem(element, index, selectedElement, warnings))
      .join("");
  }

  /**
   * Render a single element item
   */
  renderElementItem(element, index, selectedElement, warnings = []) {
    const isActive = selectedElement && String(selectedElement.id) === String(element.id);

    const activeClasses = isActive
      ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
      : "border-slate-200 hover:border-blue-300 hover:shadow-sm bg-white";

    const isFirst = index === 0;
    const isLast = index === element.length - 1; // Note: This will always be false in the map context

    const hasWarnings = warnings.some(w => w.elementId !== null && String(w.elementId) === String(element.id));
    const warningIcon = hasWarnings
      ? '<span class="material-icons-round text-amber-500 text-xs" title="Has ZPL warnings">warning</span>'
      : '';

    return `
      <div class="element-item group relative flex justify-between items-center p-2.5 mb-1.5 rounded-md border transition-all cursor-pointer ${activeClasses}" data-id="${element.id}" data-index="${index}">
        <div class="flex-1 min-w-0 pr-2">
          <div class="flex items-center gap-2">
            <span class="inline-flex items-center justify-center px-1.5 py-0.5 rounded-[3px] text-[10px] font-bold uppercase tracking-wide bg-blue-100 text-blue-800">
              ${element.type}
            </span>
            ${warningIcon}
          </div>
          <div class="text-xs text-slate-600 mt-1 truncate font-medium">${this.escapeHtml(element.getDisplayName())}</div>
        </div>
        <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button class="reorder-btn move-up-btn p-0.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" data-tooltip="Move Up" data-id="${element.id}" data-index="${index}" ${isFirst ? 'disabled' : ''}>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <button class="reorder-btn move-down-btn p-0.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" data-tooltip="Move Down" data-id="${element.id}" data-index="${index}">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <div class="w-px h-4 bg-slate-300 mx-0.5"></div>
          <button class="delete-btn p-1 text-red-500 hover:bg-red-50 rounded" data-tooltip="Delete" data-id="${element.id}">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    `;
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
