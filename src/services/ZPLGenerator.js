// ZPL Generator Service
// Handles generation of ZPL command strings from elements and label settings

import { toPlaceholder } from '../utils/placeholders.js';
import { DEFAULT_FONT_ID, DEFAULT_FONT_HEIGHT } from '../config/constants.js';

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
      .map(element => this.restoreLabelHome(element.render(
        labelSettings.fontId || DEFAULT_FONT_ID,
        labelSettings.defaultFontHeight || DEFAULT_FONT_HEIGHT,
        labelSettings.defaultFontWidth ?? 0,
        labelSettings.customFonts || []
      ), element, labelSettings))
      .join('\n');

    const footer = this.buildFooter(labelSettings, false);
    return `${header}${elementCommands}\n${footer}^XZ`;
  }

  /**
   * Generate ZPL for preview/visualization (may include debug info)
   * @param {Array} elements - Array of elements to render
   * @param {Object} labelSettings - Label configuration
   * @returns {string} Complete ZPL string for preview
   */
  generatePreviewZPL(elements, labelSettings) {
    if (!elements || elements.length === 0) {
      return '';
    }

    const header = this.buildHeader(labelSettings);
    const elementCommands = elements
      .map(element => {
        let cmd = element.renderPreview(
          labelSettings.fontId || DEFAULT_FONT_ID,
          labelSettings.defaultFontHeight || DEFAULT_FONT_HEIGHT,
          labelSettings.defaultFontWidth ?? 0,
          labelSettings.previewData,
          labelSettings.customFonts || []
        );

        return this.restoreLabelHome(cmd, element, labelSettings);
      })
      .join('\n');

    const footer = this.buildFooter(labelSettings, true);
    return `${header}${elementCommands}\n${footer}^XZ`;
  }

  /**
   * Restore the label home after a RAW element's persistent ^LH, preventing it
   * from shifting later elements twice.
   *
   * @param {string} command - The element's rendered ZPL
   * @param {Object} element - The element it came from
   * @param {Object} labelSettings - Label configuration
   * @returns {string} The command, with the home restored behind it if needed
   */
  restoreLabelHome(command, element, labelSettings) {
    if (element.type !== 'RAW' || !/\^LH/i.test(command)) return command;
    return `${command}^LH${labelSettings.homeX || 0},${labelSettings.homeY || 0}`;
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
      printMirror = 'N',
      mediaTracking = '',
      mediaType = 'D',
      mediaDarkness = 15,
      printSpeed = 4,
      slewSpeed = 4,
      backfeedSpeed = 4,
      fontId = DEFAULT_FONT_ID,
      customFonts = [],
      defaultFontHeight = DEFAULT_FONT_HEIGHT,
      defaultFontWidth = 0
    } = labelSettings;

    // Calculate print width in dots (match Labelary's internal integer DPI)
    const actualDpi = Math.floor(dpmm * 25.4);
    const printWidthDots = Math.floor((width / 25.4) * actualDpi);

    // Label metadata comment (^FX): width/height in mm + density. ZPL has no
    // native way to encode label height or dpmm, so the editor stamps them into
    // a JSON comment the parser reads back on import. Carrying width in mm too
    // avoids ^PW↔mm rounding drift. The sentinel key keeps this apart from any
    // human-authored ^FX note; JSON contains no ^/~, so it's tokenizer safe.
    // Emitted as the first command after ^XA, unterminated: the comment runs to
    // the end of its line (no ^FS), which keeps the output free of a field
    // separator that closes nothing.
    const meta = { labelMeta: { w: width, h: labelSettings.height, dpmm } };
    let header = `^XA\n^FX${JSON.stringify(meta)}\n`;

    // Print width
    header += `^PW${printWidthDots}\n`;

    // Print speeds (print, slew, backfeed)
    header += `^PR${printSpeed},${slewSpeed},${backfeedSpeed}\n`;

    // Print orientation (N = normal, I = inverted, R = rotated 90°, B = bottom-up)
    header += `^PO${printOrientation}\n`;

    // Print mirror (N = normal, Y = mirrored horizontally)
    header += `^PM${printMirror}\n`;

    // Media darkness (0-30, ~SD command)
    header += `~SD${mediaDarkness}\n`;

    // Label home position (offset from top-left)
    header += `^LH${homeX},${homeY}\n`;

    // Label top (additional Y offset)
    header += `^LT${labelTop}\n`;

    // Character encoding (CI28 = UTF-8)
    header += '^CI28\n';

    // Media type (^MT). T = thermal transfer (ribbon), D = direct thermal.
    header += `^MT${mediaType}\n`;

    // Media tracking (^MN). Omit the command unless the user explicitly picked
    // a mode, including web/gap.
    if (mediaTracking && 'NYMA'.includes(mediaTracking)) {
      header += `^MN${mediaTracking}\n`;
    }

    // Label length (^LL). Only meaningful for continuous media, where the
    // printer has no gap/notch to detect label boundaries. Derived from the
    // label height in mm, mirroring how ^PW is derived from width.
    if (mediaTracking === 'N') {
      const labelLengthDots = Math.floor((labelSettings.height / 25.4) * actualDpi);
      header += `^LL${labelLengthDots}\n`;
    }

    // Custom fonts (^CW commands)
    if (customFonts && customFonts.length > 0) {
      customFonts.forEach(font => {
        header += `^CW${font.id},${font.fontFile}\n`;
      });
    }

    // Default font (^CF: id, height, width)
    header += defaultFontWidth > 0
      ? `^CF${fontId},${defaultFontHeight},${defaultFontWidth}\n`
      : `^CF${fontId},${defaultFontHeight}\n`;

    return header;
  }

  /**
   * Build ZPL footer commands (placed just before ^XZ)
   * @param {Object} labelSettings - Label configuration
   * @param {boolean} preview - If true, always use numeric values (for Labelary preview)
   * @returns {string} ZPL footer commands (empty string if nothing to add)
   */
  buildFooter(labelSettings, preview = false) {
    const {
      printQuantity = 1,
      pauseCount = 0,
      replicates = 0,
      printQuantityPlaceholder = '',
      previewData = {}
    } = labelSettings;

    let footer = '';

    // Print quantity (^PQ: quantity, pause count, replicates). ^PQ takes a bare
    // number, so its placeholder is a name rather than a Content template; the
    // preview substitutes its Preview Data value, falling back to the quantity.
    if (printQuantity > 1 || pauseCount > 0 || replicates > 0 || printQuantityPlaceholder) {
      const qty = !printQuantityPlaceholder
        ? printQuantity
        : preview
          ? (previewData[printQuantityPlaceholder] || printQuantity)
          : toPlaceholder(printQuantityPlaceholder);
      footer += `^PQ${qty},${pauseCount},${replicates}\n`;
    }

    return footer;
  }

  /**
   * Generate ZPL for preview with a byte offset map for each element.
   * Used for mapping Labelary API warnings back to elements.
   * @param {Array} elements - Array of elements to render
   * @param {Object} labelSettings - Label configuration
   * @returns {{ zpl: string, byteMap: Array<{elementId: string|number, startByte: number, endByte: number}> }}
   */
  generatePreviewZPLWithMap(elements, labelSettings) {
    if (!elements || elements.length === 0) {
      return { zpl: '', byteMap: [] };
    }

    const encoder = new TextEncoder();
    const header = this.buildHeader(labelSettings);
    const byteMap = [];

    let currentZpl = header;
    let currentByteOffset = encoder.encode(header).length;

    elements.forEach((element, index) => {
      if (index > 0) {
        const sep = '\n';
        currentZpl += sep;
        currentByteOffset += encoder.encode(sep).length;
      }

      // Restored before the byte count, not after: the appended ^LH is part of
      // this element's span, so leaving it out would shift every later entry.
      const cmd = this.restoreLabelHome(element.renderPreview(
        labelSettings.fontId || DEFAULT_FONT_ID,
        labelSettings.defaultFontHeight || DEFAULT_FONT_HEIGHT,
        labelSettings.defaultFontWidth ?? 0,
        labelSettings.previewData,
        labelSettings.customFonts || []
      ), element, labelSettings);

      const cmdBytes = encoder.encode(cmd).length;
      byteMap.push({
        elementId: element.id,
        startByte: currentByteOffset,
        endByte: currentByteOffset + cmdBytes - 1
      });

      currentZpl += cmd;
      currentByteOffset += cmdBytes;
    });

    currentZpl += '\n^XZ';

    return { zpl: currentZpl, byteMap };
  }
}
