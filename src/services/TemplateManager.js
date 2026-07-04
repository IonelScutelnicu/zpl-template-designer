// Template Manager
// Handles template import/export file operations

/**
 * Manager for template file operations (import/export)
 */
export class TemplateManager {
  constructor(serializationService) {
    this.serializationService = serializationService;
  }

  /**
   * Trigger a browser download of text content
   * @param {string} filename - Download filename
   * @param {string} content - File content
   * @param {string} mimeType - Blob MIME type
   */
  downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Export template to JSON file download
   * @param {Array} elements - Array of elements
   * @param {Object} labelSettings - Label settings
   * @param {string} filename - Download filename (default: zpl-template.json)
   */
  exportToFile(elements, labelSettings, filename = 'zpl-template.json') {
    const json = this.serializationService.exportTemplate(elements, labelSettings);
    this.downloadFile(filename, json, 'application/json');
  }

  /**
   * Handle file input change event
   * @param {Event} event - File input change event
   * @param {Function} onSuccess - Callback with parsed template
   * @param {Function} onError - Callback with error message
   */
  handleFileImport(event, onSuccess, onError) {
    const file = event.target.files[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const template = this.serializationService.importTemplate(e.target.result);
        if (!template) {
          onError?.('Invalid template format');
          return;
        }
        onSuccess?.(template);
      } catch (error) {
        onError?.(error.message);
      }
    };
    reader.onerror = () => {
      onError?.('Failed to read file');
    };
    reader.readAsText(file);

    // Reset file input so the same file can be imported again
    event.target.value = '';
  }

  /**
   * Import template from JSON string
   * @param {string} jsonString - JSON string to parse
   * @returns {Object|null} Parsed template or null if invalid
   */
  importFromString(jsonString) {
    return this.serializationService.importTemplate(jsonString);
  }

  /**
   * Validate template structure
   * @param {Object} template - Template to validate
   * @returns {Object} Validation result { valid: boolean, errors: string[] }
   */
  validateTemplate(template) {
    return this.serializationService.validateTemplate(template);
  }
}
