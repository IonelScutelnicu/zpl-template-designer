// Warnings Panel Renderer
// Renders warning items in the warnings panel UI

/**
 * Renderer for the warnings panel
 */
export class WarningsPanelRenderer {
  /**
   * @param {Function} getElementById - Function to look up an element by ID
   */
  constructor(getElementById) {
    this.getElementById = getElementById;
  }

  /**
   * Render the list of warning items as HTML
   * @param {Array} warnings - Resolved warnings with elementId
   * @returns {string} HTML string
   */
  render(warnings) {
    if (!warnings || warnings.length === 0) {
      return '';
    }

    return warnings.map(warning => this.renderWarningItem(warning)).join('');
  }

  /**
   * Render a single warning item
   */
  renderWarningItem(warning) {
    const element = warning.elementId !== null ? this.getElementById(warning.elementId) : null;
    const elementName = element ? this.escapeHtml(element.getDisplayName()) : 'Label configuration';
    const isClickable = element !== null;
    const cursorClass = isClickable ? 'cursor-pointer hover:bg-amber-100' : '';
    const dataAttr = isClickable ? `data-element-id="${warning.elementId}"` : '';

    return `
      <div class="warning-item flex items-start gap-2 p-2 rounded-md bg-white border border-amber-200 text-xs ${cursorClass}" ${dataAttr}>
        <span class="material-icons-round text-amber-500 text-sm mt-0.5 shrink-0">warning</span>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5 mb-0.5">
            <span class="font-medium text-amber-900">${elementName}</span>
            <span class="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-200 text-amber-800">${this.escapeHtml(warning.zplCommand)}</span>
          </div>
          <div class="text-amber-700">${this.escapeHtml(warning.message)}</div>
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
