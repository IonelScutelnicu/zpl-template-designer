// Serialization Service
// Handles element and application state serialization/deserialization

import { TextElement } from '../elements/TextElement.js';
import { BarcodeElement } from '../elements/BarcodeElement.js';
import { BoxElement } from '../elements/BoxElement.js';
import { FieldBlockElement } from '../elements/FieldBlockElement.js';
import { QRCodeElement } from '../elements/QRCodeElement.js';
import { LineElement } from '../elements/LineElement.js';
import { DiagonalLineElement } from '../elements/DiagonalLineElement.js';
import { CircleElement } from '../elements/CircleElement.js';
import { TextBlockElement } from '../elements/TextBlockElement.js';
import { GraphicFieldElement } from '../elements/GraphicFieldElement.js';
import { normalizeElementFontSize } from '../utils/zplFontSnap.js';

/**
 * Service for serializing and deserializing elements and application state
 */
export class SerializationService {
  /**
   * Serialize an element without its ID (for copy/paste)
   * @param {Object} element - Element to serialize
   * @returns {Object|null} Serialized element data without ID
   */
  serializeElement(element) {
    if (!element) return null;
    const data = JSON.parse(JSON.stringify(element));
    delete data.id;
    return data;
  }

  /**
   * Serialize an element with its ID (for state persistence)
   * @param {Object} element - Element to serialize
   * @returns {Object|null} Serialized element data with ID
   */
  serializeElementWithId(element) {
    if (!element) return null;
    const data = JSON.parse(JSON.stringify(element));
    data.id = element.id;
    return data;
  }

  /**
   * Create an element instance from serialized data
   * @param {Object} data - Serialized element data
   * @param {Object} options - Options for deserialization
   * @param {boolean} options.keepId - Whether to preserve the original ID
   * @returns {Object|null} Element instance or null if invalid
   */
  createElementFromData(data, options = {}) {
    if (!data || !data.type) return null;

    const { keepId = false } = options;
    let element = null;

    switch (data.type) {
      case 'TEXT':
        element = new TextElement(
          data.x,
          data.y,
          data.previewText,
          data.fontSize,
          data.fontWidth,
          data.placeholder,
          data.fontId,
          data.orientation,
          data.reverse,
          data.fieldHex
        );
        break;

      case 'BARCODE':
        element = new BarcodeElement(
          data.x,
          data.y,
          data.previewData,
          data.height,
          data.width,
          data.ratio,
          data.placeholder,
          data.showText,
          data.reverse,
          data.symbology,
          data.checkDigit,
          data.orientation,
          data.printTextAbove,
          data.fieldHex,
          data.startChar,
          data.stopChar,
          data.msiCheckMode,
          data.msiCheckInText
        );
        break;

      case 'QRCODE':
        element = new QRCodeElement(
          data.x,
          data.y,
          data.previewData,
          data.model,
          data.magnification,
          data.errorCorrection,
          data.placeholder,
          data.reverse,
          data.symbology,
          data.moduleSize,
          data.quality,
          data.moduleWidth,
          data.rowHeight,
          data.securityLevel,
          data.columns,
          data.aztecSizeMode,
          data.aztecErrorControl,
          data.aztecLayers,
          data.fieldHex,
          data.microPdfMode,
          data.code49Mode,
          data.codablockMode
        );
        break;

      case 'BOX':
        element = new BoxElement(
          data.x,
          data.y,
          data.width,
          data.height,
          data.thickness,
          data.color,
          data.rounding,
          data.reverse
        );
        break;

      case 'FIELDBLOCK':
        element = new FieldBlockElement(
          data.x,
          data.y,
          data.previewText,
          data.fontSize,
          data.fontWidth,
          data.blockWidth,
          data.maxLines,
          data.lineSpacing,
          data.justification,
          data.hangingIndent,
          data.placeholder,
          data.fontId,
          data.reverse,
          data.orientation,
          data.fieldHex
        );
        break;

      case 'TEXTBLOCK':
        element = new TextBlockElement(
          data.x,
          data.y,
          data.previewText,
          data.fontSize,
          data.fontWidth,
          data.blockWidth,
          data.blockHeight,
          data.placeholder,
          data.fontId,
          data.reverse,
          data.orientation,
          data.fieldHex
        );
        break;

      case 'LINE':
        element = new LineElement(
          data.x,
          data.y,
          data.width,
          data.thickness,
          data.orientation,
          data.color,
          data.rounding,
          data.reverse
        );
        break;

      case 'DIAGONALLINE':
        element = new DiagonalLineElement(
          data.x,
          data.y,
          data.width,
          data.height,
          data.thickness,
          data.color,
          data.orientation,
          data.reverse
        );
        break;

      case 'CIRCLE':
        element = new CircleElement(
          data.x,
          data.y,
          data.width,
          data.height,
          data.thickness,
          data.color,
          data.reverse,
          data.aspectLocked ?? true
        );
        break;

      case 'GRAPHIC': {
        let bytes = null;
        if (data.bytes instanceof Uint8Array) {
          bytes = data.bytes;
        } else if (data.bytesB64) {
          try {
            const bin = atob(data.bytesB64);
            bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          } catch {
            bytes = null;
          }
        }
        // Reject anything that isn't a data: image URL — guards against a
        // malicious save file slipping in javascript: or external http(s)
        // URLs that the renderer would later embed in <img>.
        const safeSourceDataUrl = (typeof data.sourceDataUrl === 'string' && data.sourceDataUrl.startsWith('data:image/'))
          ? data.sourceDataUrl
          : null;
        element = new GraphicFieldElement(data.x, data.y, {
          sourceDataUrl: safeSourceDataUrl,
          widthDots: data.widthDots || 0,
          heightDots: data.heightDots || 0,
          bytesPerRow: data.bytesPerRow || 0,
          threshold: data.threshold ?? 128,
          encodingFormat: data.encodingFormat || 'A',
          bytes,
          opaqueRaw: data.opaqueRaw || null,
          crcWarning: data.crcWarning || false,
          orientation: data.orientation,
          reverse: data.reverse || false,
        });
        break;
      }

      default:
        console.warn(`Unknown element type: ${data.type}`);
        return null;
    }

    if (!element) return null;

    // Copy only own properties from data to element (prevents prototype pollution)
    for (const key of Object.keys(data)) {
      // Don't clobber the typed Uint8Array (`bytes`) we set in the GRAPHIC
      // constructor; bytesB64 is the JSON-only form. sourceDataUrl is also
      // sanitized in the constructor — skip it here so the unsanitized raw
      // value can't slip back in.
      if (data.type === 'GRAPHIC' && (key === 'bytesB64' || key === 'bytes' || key === 'sourceDataUrl')) continue;
      element[key] = data[key];
    }

    // Invariant: a shape whose width and height differ is an ellipse, not a
    // circle. Force its aspect lock open so render() emits ^GE (independent
    // dimensions) instead of ^GC (which ignores height). Runs after the copy
    // loop above so it overrides any inconsistent saved aspectLocked value.
    if (element.aspectLocked && element.width !== element.height) {
      element.aspectLocked = false;
    }

    // Snap bitmap-font sizes to the allowed grid (no-op for scalable/non-text
    // elements). options.labelFontId is the label default, used to resolve the
    // effective font when the element inherits it (fontId === '').
    normalizeElementFontSize(element, options.labelFontId);

    // Generate new ID if not keeping original
    if (!keepId) {
      element.id = Date.now() + Math.random();
    }

    return element;
  }

  /**
   * Serialize complete application state
   * @param {Array} elements - Array of elements
   * @param {Object} labelSettings - Label configuration
   * @returns {Object} Serialized application state
   */
  serializeAppState(elements, labelSettings) {
    return {
      elements: elements.map(el => this.serializeElementWithId(el)),
      labelSettings: JSON.parse(JSON.stringify(labelSettings))
    };
  }

  /**
   * Validate template structure
   * @param {Object} template - Template data to validate
   * @returns {Object} Validation result { valid: boolean, errors: string[] }
   */
  validateTemplate(template) {
    const errors = [];

    if (!template) {
      errors.push('Template is null or undefined');
      return { valid: false, errors };
    }

    if (!template.elements || !Array.isArray(template.elements)) {
      errors.push('Missing or invalid elements array');
    }

    if (!template.labelSettings || typeof template.labelSettings !== 'object') {
      errors.push('Missing or invalid label settings');
    }

    // Validate required label settings fields
    const requiredSettings = ['width', 'height', 'dpmm'];
    if (template.labelSettings) {
      for (const field of requiredSettings) {
        if (template.labelSettings[field] === undefined) {
          errors.push(`Missing required label setting: ${field}`);
        }
      }
    }

    // Validate element types
    const validTypes = ['TEXT', 'TEXTBLOCK', 'BARCODE', 'QRCODE', 'BOX', 'LINE', 'DIAGONALLINE', 'FIELDBLOCK', 'CIRCLE', 'GRAPHIC'];
    if (template.elements && Array.isArray(template.elements)) {
      template.elements.forEach((el, index) => {
        if (!el.type) {
          errors.push(`Element ${index} is missing type`);
        } else if (!validTypes.includes(el.type)) {
          errors.push(`Element ${index} has invalid type: ${el.type}`);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Export template to JSON string
   * @param {Array} elements - Array of elements
   * @param {Object} labelSettings - Label configuration
   * @returns {string} JSON string representation
   */
  exportTemplate(elements, labelSettings) {
    const template = this.serializeAppState(elements, labelSettings);
    return JSON.stringify(template, null, 2);
  }

  /**
   * Import template from JSON string
   * @param {string} jsonString - JSON string to parse
   * @returns {Object} Parsed template or null if invalid
   */
  importTemplate(jsonString) {
    try {
      const template = JSON.parse(jsonString);
      const validation = this.validateTemplate(template);

      if (!validation.valid) {
        throw new Error(validation.errors.join(', '));
      }

      return template;
    } catch (error) {
      console.error('Failed to import template:', error);
      return null;
    }
  }
}
