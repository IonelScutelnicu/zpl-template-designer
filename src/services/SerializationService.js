// Serialization Service
// Handles element and application state serialization/deserialization

import { TextElement } from '../elements/TextElement.js';
import { BarcodeElement } from '../elements/BarcodeElement.js';
import { BoxElement } from '../elements/BoxElement.js';
import { FieldBlockElement } from '../elements/FieldBlockElement.js';
import { QRCodeElement } from '../elements/QRCodeElement.js';
import { LineElement } from '../elements/LineElement.js';
import { CircleElement } from '../elements/CircleElement.js';

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
          data.reverse
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
          data.showText
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
          data.placeholder
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
          data.rounding
        );
        break;

      case 'TEXTBLOCK': // backward compat: old saved files
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
          data.orientation
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
          data.rounding
        );
        break;

      case 'CIRCLE':
        element = new CircleElement(
          data.x,
          data.y,
          data.width,
          data.height,
          data.thickness,
          data.color
        );
        break;

      default:
        console.warn(`Unknown element type: ${data.type}`);
        return null;
    }

    if (!element) return null;

    // Copy all properties from data to element
    Object.assign(element, data);

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
    const validTypes = ['TEXT', 'BARCODE', 'QRCODE', 'BOX', 'LINE', 'FIELDBLOCK', 'TEXTBLOCK', 'CIRCLE'];
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
