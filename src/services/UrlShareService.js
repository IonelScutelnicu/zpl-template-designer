// URL Share Service
// Handles template encoding/decoding for URL-based sharing

export class UrlShareService {
  constructor(serializationService) {
    this.serializationService = serializationService;
  }

  /**
   * Encode a template into a URL-safe compressed string
   * @param {Array} elements
   * @param {Object} labelSettings
   * @returns {Promise<string>} base64url-encoded gzip string
   */
  async encodeTemplate(elements, labelSettings) {
    const json = this.serializationService.exportTemplate(elements, labelSettings);
    const bytes = new TextEncoder().encode(json);
    const compressed = await this._compress(bytes);
    return this._toBase64Url(compressed);
  }

  /**
   * Decode a URL-safe compressed string back into a template object
   * @param {string} encoded - base64url string from URL
   * @returns {Promise<Object|null>} parsed template or null
   */
  async decodeTemplate(encoded) {
    try {
      const compressed = this._fromBase64Url(encoded);
      const bytes = await this._decompress(compressed);
      const json = new TextDecoder().decode(bytes);
      return this.serializationService.importTemplate(json);
    } catch (error) {
      console.error('Failed to decode shared template:', error);
      return null;
    }
  }

  /**
   * Generate the full shareable URL
   * @param {Array} elements
   * @param {Object} labelSettings
   * @returns {Promise<string>} full URL with hash
   */
  async generateShareUrl(elements, labelSettings) {
    const encoded = await this.encodeTemplate(elements, labelSettings);
    const base = window.location.origin + window.location.pathname;
    return `${base}#template=${encoded}`;
  }

  /**
   * Check if the current URL has a shared template
   * @returns {string|null} encoded template string or null
   */
  getTemplateFromUrl() {
    const hash = window.location.hash;
    if (!hash.startsWith('#template=')) return null;
    return hash.slice('#template='.length);
  }

  /**
   * Remove the template hash from the URL without reload
   */
  clearUrlTemplate() {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  // --- Private helpers ---

  async _compress(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async _decompress(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  _toBase64Url(bytes) {
    const binary = Array.from(bytes, b => String.fromCharCode(b)).join('');
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  _fromBase64Url(str) {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, c => c.charCodeAt(0));
  }
}
