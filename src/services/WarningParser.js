// Warning Parser Service
// Parses Labelary API X-Warnings header and maps warnings to elements

/**
 * Service for parsing and resolving Labelary linter warnings
 */
export class WarningParser {
  /**
   * Parse the X-Warnings header value into structured warning objects.
   * The header contains pipe-delimited groups of 5 fields:
   * byteIndex|byteSize|zplCommand|paramNumber|message
   * Multiple warnings are separated by pipes (groups of 5).
   * @param {string} headerValue - Raw X-Warnings header value
   * @returns {Array<{byteIndex: number, byteSize: number, zplCommand: string, paramNumber: number, message: string}>}
   */
  parse(headerValue) {
    if (!headerValue || typeof headerValue !== 'string') {
      return [];
    }

    const parts = headerValue.split('|');
    const warnings = [];

    // Each warning consists of 5 consecutive fields
    for (let i = 0; i + 4 < parts.length; i += 5) {
      warnings.push({
        byteIndex: parseInt(parts[i], 10),
        byteSize: parseInt(parts[i + 1], 10),
        zplCommand: parts[i + 2].trim(),
        paramNumber: parseInt(parts[i + 3], 10),
        message: parts[i + 4].trim()
      });
    }

    return warnings;
  }

  /**
   * Map parsed warnings to elements using byte offset ranges.
   * @param {Array} warnings - Parsed warnings from parse()
   * @param {Array<{elementId: string|number, startByte: number, endByte: number}>} byteMap - Byte offset map from ZPLGenerator
   * @returns {Array} Warnings with added elementId property (null for header-level warnings)
   */
  resolveElements(warnings, byteMap) {
    return warnings.map(warning => {
      const matchedEntry = byteMap.find(
        entry => warning.byteIndex >= entry.startByte && warning.byteIndex <= entry.endByte
      );

      return {
        ...warning,
        elementId: matchedEntry ? matchedEntry.elementId : null
      };
    });
  }
}
