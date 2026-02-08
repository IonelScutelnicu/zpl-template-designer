// ZPL Generator Service
// Handles generation of ZPL command strings from elements and label settings

/**
 * Service for generating ZPL (Zebra Programming Language) output
 */
export class ZPLGenerator {
  /**
   * Generate complete ZPL output for production use
   * @param {Array} elements - Array of elements to render
   * @param {Object} labelSettings - Label configuration
   * @returns {string} Complete ZPL string
   */
  generateZPL(elements, labelSettings) {
    if (!elements || elements.length === 0) {
      return '';
    }

    const header = this.buildHeader(labelSettings);
    const elementCommands = elements
      .map(element => element.render(
        labelSettings.fontId,
        labelSettings.defaultFontHeight || 20,
        labelSettings.defaultFontWidth || 20
      ))
      .join('\n');

    return `${header}${elementCommands}\n^XZ`;
  }

  /**
   * Generate ZPL for preview/visualization (may include debug info)
   * @param {Array} elements - Array of elements to render
   * @param {Object} labelSettings - Label configuration
   * @param {Object} selectedElement - Currently selected element (for debug highlighting)
   * @returns {string} Complete ZPL string for preview
   */
  generatePreviewZPL(elements, labelSettings, selectedElement = null) {
    if (!elements || elements.length === 0) {
      return '';
    }

    const header = this.buildHeader(labelSettings);
    const elementCommands = elements
      .map(element => {
        let cmd = element.renderPreview(
          labelSettings.fontId,
          labelSettings.defaultFontHeight || 20,
          labelSettings.defaultFontWidth || 20
        );

        // Optional: Add debug highlighting for selected text elements
        // (Currently commented out in original code)
        // if (selectedElement && String(element.id) === String(selectedElement.id) &&
        //     (element.type === 'TEXT' || element.type === 'TEXTBLOCK')) {
        //   const highlightBox = this.generateHighlightBox(element, labelSettings);
        //   cmd = highlightBox + '\n' + cmd;
        // }

        return cmd;
      })
      .join('\n');

    return `${header}${elementCommands}\n^XZ`;
  }

  /**
   * Build ZPL header with configuration commands
   * @param {Object} labelSettings - Label configuration
   * @returns {string} ZPL header commands
   */
  buildHeader(labelSettings) {
    const {
      width,
      dpmm,
      homeX = 0,
      homeY = 0,
      labelTop = 0,
      printOrientation = 'N',
      mediaDarkness = 25,
      printSpeed = 4,
      slewSpeed = 4,
      backfeedSpeed = 4,
      fontId = '0',
      customFonts = [],
      defaultFontHeight = 20,
      defaultFontWidth = 20
    } = labelSettings;

    // Calculate print width in dots
    const printWidthDots = Math.round(width * dpmm);

    let header = '^XA\n';

    // Print width
    header += `^PW${printWidthDots}\n`;

    // Print speeds (print, slew, backfeed)
    header += `^PR${printSpeed},${slewSpeed},${backfeedSpeed}\n`;

    // Print orientation (N = normal, I = inverted, R = rotated 90°, B = bottom-up)
    header += `^PO${printOrientation}\n`;

    // Media darkness (0-30, ~SD command)
    header += `~SD${mediaDarkness}\n`;

    // Label home position (offset from top-left)
    header += `^LH${homeX},${homeY}\n`;

    // Label top (additional Y offset)
    header += `^LT${labelTop}\n`;

    // Character encoding (CI28 = UTF-8)
    header += '^CI28\n';

    // Media type (MTT = thermal transfer)
    header += '^MTT\n';

    // Custom fonts (^CW commands)
    if (customFonts && customFonts.length > 0) {
      customFonts.forEach(font => {
        header += `^CW${font.id},${font.fontFile}\n`;
      });
    }

    // Default font (^CF: id, height, width)
    header += `^CF${fontId},${defaultFontHeight},${defaultFontWidth}\n`;

    return header;
  }

  /**
   * Generate a highlight box for debugging (optional feature)
   * @param {Object} element - Element to highlight
   * @param {Object} labelSettings - Label settings for default values
   * @returns {string} ZPL box command
   */
  generateHighlightBox(element, labelSettings) {
    let boxWidth, boxHeight;

    if (element.type === 'TEXTBLOCK') {
      boxWidth = element.blockWidth || 200;
      const resolvedHeight = element.fontSize || labelSettings.defaultFontHeight || 30;
      const maxLines = element.maxLines || 1;
      const lineSpacing = element.lineSpacing || 0;
      // Line spacing is only between lines, not after the last line
      const baseLineHeight = resolvedHeight * 1.2;
      boxHeight = baseLineHeight * maxLines + lineSpacing * Math.max(0, maxLines - 1);
    } else if (element.type === 'TEXT') {
      const text = element.previewText || '';
      const fontWidth = element.fontWidth || labelSettings.defaultFontWidth || 30;
      boxWidth = Math.max(text.length * fontWidth * 0.6, 50);
      boxHeight = element.fontSize || labelSettings.defaultFontHeight || 30;
    } else {
      // For other element types, use element bounds
      boxWidth = element.width || 100;
      boxHeight = element.height || 50;
    }

    const padding = 5;
    const x = Math.max(0, element.x - padding);
    const y = Math.max(0, element.y - padding);
    const w = boxWidth + padding * 2;
    const h = boxHeight + padding * 2;

    // ^GB: Graphic Box command (x,y position via ^FO, then width,height,thickness,color)
    return `^FO${x},${y}^GB${w},${h},1,B^FS`;
  }

  /**
   * Generate ZPL for a single element (utility method)
   * @param {Object} element - Element to render
   * @param {string} fontId - Default font ID
   * @param {boolean} preview - Use preview rendering
   * @param {number} defaultFontHeight - Default font height
   * @param {number} defaultFontWidth - Default font width
   * @returns {string} ZPL commands for element
   */
  generateElementZPL(element, fontId, preview = false, defaultFontHeight = 20, defaultFontWidth = 20) {
    return preview ?
      element.renderPreview(fontId, defaultFontHeight, defaultFontWidth) :
      element.render(fontId, defaultFontHeight, defaultFontWidth);
  }

  /**
   * Validate ZPL string structure
   * @param {string} zpl - ZPL string to validate
   * @returns {Object} Validation result { valid: boolean, errors: string[] }
   */
  validateZPL(zpl) {
    const errors = [];

    if (!zpl || typeof zpl !== 'string') {
      errors.push('ZPL must be a non-empty string');
      return { valid: false, errors };
    }

    // Check for required start command
    if (!zpl.includes('^XA')) {
      errors.push('Missing ZPL start command (^XA)');
    }

    // Check for required end command
    if (!zpl.includes('^XZ')) {
      errors.push('Missing ZPL end command (^XZ)');
    }

    // Check command order
    const xaIndex = zpl.indexOf('^XA');
    const xzIndex = zpl.lastIndexOf('^XZ');
    if (xaIndex !== -1 && xzIndex !== -1 && xaIndex > xzIndex) {
      errors.push('ZPL start (^XA) must come before end (^XZ)');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Calculate label dimensions in dots
   * @param {Object} labelSettings - Label configuration
   * @returns {Object} Dimensions { width: number, height: number }
   */
  getLabelDimensionsDots(labelSettings) {
    return {
      width: Math.round(labelSettings.width * labelSettings.dpmm),
      height: Math.round(labelSettings.height * labelSettings.dpmm)
    };
  }

  /**
   * Estimate ZPL size in bytes (useful for printer memory checks)
   * @param {string} zpl - ZPL string
   * @returns {number} Size in bytes
   */
  estimateZPLSize(zpl) {
    return new Blob([zpl]).size;
  }
}
