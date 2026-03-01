// Element Management Service
// Consolidates all element CRUD operations

import { TextElement } from '../elements/TextElement.js';
import { BarcodeElement } from '../elements/BarcodeElement.js';
import { BoxElement } from '../elements/BoxElement.js';
import { FieldBlockElement } from '../elements/FieldBlockElement.js';
import { QRCodeElement } from '../elements/QRCodeElement.js';
import { LineElement } from '../elements/LineElement.js';
import { CircleElement } from '../elements/CircleElement.js';
import { getElementBoundsResolved } from '../utils/geometry.js';

/**
 * Service for managing element lifecycle (create, delete, reorder, duplicate)
 */
export class ElementService {
  /**
   * @param {AppState} state - Application state instance
   * @param {Object} callbacks - UI update callbacks
   */
  constructor(state, callbacks = {}) {
    this.state = state;
    this.callbacks = {
      onElementsChanged: callbacks.onElementsChanged || (() => {}),
      onPushHistory: callbacks.onPushHistory || (() => {})
    };
  }

  /**
   * Create and add a new element to the canvas
   * @param {string} type - Element type ('TEXT', 'BARCODE', 'QRCODE', 'BOX', 'LINE', 'FIELDBLOCK')
   * @param {Object} options - Optional configuration for element position and properties
   * @returns {Object} Created element instance
   */
  createElement(type, options = {}) {
    const { x = 50, y = 50, ...props } = options;
    let element;

    switch (type) {
      case 'TEXT':
        element = new TextElement(
          x, y,
          props.text || 'Sample Text',
          props.fontSize || 0,
          props.fontWidth || 0,
          props.placeholder || '',
          props.fontId || '',
          props.orientation || 'N',
          props.reverse || false
        );
        break;

      case 'BARCODE':
        element = new BarcodeElement(
          x, y,
          props.data || '1234567890',
          props.height || 50,
          props.width || 2,
          props.ratio || 2.0,
          props.placeholder || '',
          props.showText !== undefined ? props.showText : true
        );
        break;

      case 'QRCODE':
        element = new QRCodeElement(
          x, y,
          props.data || 'https://example.com',
          props.model || 2,
          props.magnification || 5,
          props.errorCorrection || 'Q',
          props.placeholder || ''
        );
        break;

      case 'BOX':
        element = new BoxElement(
          x, y,
          props.width || 100,
          props.height || 50,
          props.thickness || 3,
          props.color || 'B',
          props.rounding || 0
        );
        break;

      case 'LINE':
        element = new LineElement(
          x, y,
          props.width || 200,
          props.thickness || 3,
          props.orientation || 'H'
        );
        break;

      case 'CIRCLE':
        element = new CircleElement(
          x, y,
          props.width || 80,
          props.height || 80,
          props.thickness || 3,
          props.color || 'B'
        );
        break;

      case 'FIELDBLOCK':
        element = new FieldBlockElement(
          x, y,
          props.text || 'Sample text that can wrap across multiple lines',
          props.fontSize || 0,
          props.fontWidth || 0,
          props.blockWidth || 200,
          props.maxLines || 3,
          props.lineSpacing || 0,
          props.justification || 'L',
          props.hangingIndent || 0
        );
        break;

      default:
        throw new Error(`Unknown element type: ${type}`);
    }

    // Add element to state
    this.state.addElement(element);
    this.state.setSelectedElement(element);

    // Notify callbacks
    this.callbacks.onElementsChanged();
    this.callbacks.onPushHistory(
      `Added ${type === 'QRCODE' ? 'QR Code' : type === 'FIELDBLOCK' ? 'Field Block' : type.charAt(0) + type.slice(1).toLowerCase()}`,
      { kind: 'add', detail: element.getDisplayName() }
    );

    return element;
  }

  /**
   * Delete an element by ID
   * @param {string|number} id - Element ID to delete
   */
  deleteElement(id) {
    const idStr = String(id);
    const elementToDelete = this.state.elements.find(el => String(el.id) === idStr);

    if (!elementToDelete) return;

    // Remove from state
    this.state.removeElement(idStr);

    // Clear selection if deleted element was selected
    if (this.state.selectedElement && String(this.state.selectedElement.id) === idStr) {
      this.state.setSelectedElement(null);
    }

    // Clear active sessions if they reference this element
    const activeTransformSession = this.state.getActiveTransformSession();
    if (activeTransformSession && activeTransformSession.id === idStr) {
      this.state.setActiveTransformSession(null);
    }

    const keyboardMoveSession = this.state.getKeyboardMoveSession();
    if (keyboardMoveSession && keyboardMoveSession.id === idStr) {
      this.state.setKeyboardMoveSession(null);
    }

    // Notify callbacks
    this.callbacks.onElementsChanged();
    this.callbacks.onPushHistory(
      `Deleted ${elementToDelete.type}`,
      { kind: 'delete', detail: elementToDelete.getDisplayName() }
    );
  }

  /**
   * Move an element up or down in the rendering order
   * @param {number} index - Current index of element
   * @param {string} direction - 'up' or 'down'
   * @returns {boolean} True if move was successful
   */
  moveElement(index, direction) {
    const elements = this.state.elements;

    if (direction === 'up') {
      if (index <= 0 || index >= elements.length) return false;

      const newElements = [...elements];
      [newElements[index], newElements[index - 1]] = [newElements[index - 1], newElements[index]];
      this.state.setElements(newElements);
    } else if (direction === 'down') {
      if (index < 0 || index >= elements.length - 1) return false;

      const newElements = [...elements];
      [newElements[index], newElements[index + 1]] = [newElements[index + 1], newElements[index]];
      this.state.setElements(newElements);
    } else {
      return false;
    }

    // Notify callbacks
    this.callbacks.onElementsChanged();
    this.callbacks.onPushHistory('Reordered elements', { kind: 'reorder' });

    return true;
  }

  /**
   * Paste/duplicate an element from serialized data
   * @param {Object} data - Serialized element data
   * @param {Function} createFromData - Function to create element from data
   * @returns {Object|null} Created element or null if failed
   */
  pasteElement(data, createFromData) {
    const element = createFromData(data);
    if (!element) return null;

    // Calculate label bounds
    const labelW = this.state.labelSettings.width * this.state.labelSettings.dpmm;
    const labelH = this.state.labelSettings.height * this.state.labelSettings.dpmm;
    const offset = 10;

    // Offset position slightly
    element.x = Math.max(0, element.x + offset);
    element.y = Math.max(0, element.y + offset);

    // Keep element within label bounds
    const bounds = getElementBoundsResolved(element, this.state.labelSettings);
    element.x = Math.min(element.x, Math.max(0, labelW - bounds.width));
    element.y = Math.min(element.y, Math.max(0, labelH - bounds.height));

    // Add to state
    this.state.addElement(element);
    this.state.setSelectedElement(element);

    // Notify callbacks
    this.callbacks.onElementsChanged();
    this.callbacks.onPushHistory(
      `Pasted ${element.type}`,
      { kind: 'paste', detail: element.getDisplayName() }
    );

    return element;
  }

  /**
   * Get element by ID
   * @param {string|number} id - Element ID
   * @returns {Object|null} Element or null if not found
   */
  getElementById(id) {
    const idStr = String(id);
    return this.state.elements.find(el => String(el.id) === idStr) || null;
  }

  /**
   * Get all elements
   * @returns {Array} Array of elements
   */
  getAllElements() {
    return this.state.elements;
  }
}
