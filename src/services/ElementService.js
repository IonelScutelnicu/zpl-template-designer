// Element Management Service
// Consolidates all element CRUD operations

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
import { getElementBoundsResolved } from '../utils/geometry.js';
import { DEFAULT_PREVIEW_DATA } from '../utils/barcodeGeometry.js';

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
   * @param {string} type - Element type ('TEXT', 'TEXTBLOCK', 'BARCODE', 'QRCODE', 'BOX', 'LINE', 'FIELDBLOCK')
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
          props.reverse || false,
          props.fieldHex || false
        );
        break;

      case 'BARCODE': {
        const symbology = props.symbology || 'CODE128';
        element = new BarcodeElement(
          x, y,
          props.data ?? DEFAULT_PREVIEW_DATA[symbology],
          props.height || 50,
          props.width || 2,
          props.ratio || 2.0,
          props.placeholder || '',
          props.showText !== undefined ? props.showText : true,
          props.reverse || false,
          symbology,
          props.checkDigit || false,
          props.orientation || 'N',
          props.printTextAbove || false,
          props.fieldHex || false,
          props.startChar || 'A',
          props.stopChar || 'A',
          props.msiCheckMode || 'B',
          props.msiCheckInText || false
        );
        break;
      }

      case 'QRCODE': {
        const symbology = props.symbology || 'QR';
        element = new QRCodeElement(
          x, y,
          props.data ?? DEFAULT_PREVIEW_DATA[symbology],
          props.model || 2,
          props.magnification || 5,
          props.errorCorrection || 'Q',
          props.placeholder || '',
          props.reverse || false,
          symbology,
          props.moduleSize || 4,
          props.quality ?? 200,
          props.moduleWidth || 2,
          props.rowHeight || 4,
          props.securityLevel ?? 5,
          props.columns || 0,
          props.aztecSizeMode || 'auto',
          props.aztecErrorControl || 0,
          props.aztecLayers || 0,
          props.fieldHex || false,
          props.microPdfMode || 0,
          props.code49Mode || 'A',
          props.codablockMode || 'F',
          props.maxicodeMode || '4',
          props.databarType || 'omni'
        );
        if (symbology === 'TLC39') {
          element.tlc39Code39Width = props.tlc39Code39Width || props.moduleWidth || 2;
          element.tlc39Ratio = props.tlc39Ratio || 3;
          element.tlc39Code39Height = props.tlc39Code39Height || props.rowHeight || 40;
          element.tlc39MicroPdfWidth = props.tlc39MicroPdfWidth || element.tlc39Code39Width;
          element.tlc39MicroPdfRowHeight = props.tlc39MicroPdfRowHeight || element.tlc39MicroPdfWidth;
        }
        break;
      }

      case 'BOX':
        element = new BoxElement(
          x, y,
          props.width || 100,
          props.height || 50,
          props.thickness || 3,
          props.color || 'B',
          props.rounding || 0,
          props.reverse || false
        );
        break;

      case 'LINE':
        element = new LineElement(
          x, y,
          props.width || 200,
          props.thickness || 3,
          props.orientation || 'H',
          props.color || 'B',
          props.rounding || 0,
          props.reverse || false
        );
        break;

      case 'DIAGONALLINE':
        element = new DiagonalLineElement(
          x, y,
          props.width || 100,
          props.height || 100,
          props.thickness || 3,
          props.color || 'B',
          props.orientation || 'R',
          props.reverse || false
        );
        break;

      case 'CIRCLE':
        element = new CircleElement(
          x, y,
          props.width || 80,
          props.height || 80,
          props.thickness || 3,
          props.color || 'B',
          props.reverse || false,
          props.aspectLocked ?? true
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
          props.hangingIndent || 0,
          props.placeholder || '',
          props.fontId || '',
          props.reverse || false,
          props.orientation || 'N',
          props.fieldHex || false
        );
        break;

      case 'TEXTBLOCK':
        element = new TextBlockElement(
          x, y,
          props.text || 'Sample text block content',
          props.fontSize || 0,
          props.fontWidth || 0,
          props.blockWidth || 200,
          props.blockHeight || 50,
          props.placeholder || '',
          props.fontId || '',
          props.reverse || false,
          props.orientation || 'N',
          props.fieldHex || false
        );
        break;

      case 'GRAPHIC':
        element = new GraphicFieldElement(x, y, {
          sourceDataUrl: props.sourceDataUrl || null,
          widthDots: props.widthDots || 0,
          heightDots: props.heightDots || 0,
          bytesPerRow: props.bytesPerRow || 0,
          threshold: props.threshold ?? 128,
          encodingFormat: props.encodingFormat || 'A',
          bytes: props.bytes || null,
          imageData: props.imageData || null,
          opaqueRaw: props.opaqueRaw || null,
          crcWarning: props.crcWarning || false,
          orientation: props.orientation,
          reverse: props.reverse || false,
        });
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
      `Added ${type === 'QRCODE' ? 'QR Code' : type === 'FIELDBLOCK' ? 'Field Block' : type === 'TEXTBLOCK' ? 'Text Block' : type === 'GRAPHIC' ? 'Graphic Field' : type.charAt(0) + type.slice(1).toLowerCase()}`,
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
    this.state.removeWarningsForElement(idStr);

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
   * Delete several elements as a single history entry. Locked elements are
   * skipped. Selection is cleared afterwards.
   * @param {Array<string|number>} ids - Element IDs to delete
   */
  deleteElements(ids) {
    const idSet = new Set((ids || []).map(String));
    const toDelete = this.state.elements.filter(el => idSet.has(String(el.id)) && !el.locked);
    if (toDelete.length === 0) return;

    if (toDelete.length === 1) {
      // Defer to the single-element path so the history label stays specific.
      this.deleteElement(toDelete[0].id);
      return;
    }

    for (const el of toDelete) {
      const idStr = String(el.id);
      this.state.removeElement(idStr);
      this.state.removeWarningsForElement(idStr);

      const activeTransformSession = this.state.getActiveTransformSession();
      if (activeTransformSession && activeTransformSession.id === idStr) {
        this.state.setActiveTransformSession(null);
      }
      const keyboardMoveSession = this.state.getKeyboardMoveSession();
      if (keyboardMoveSession && keyboardMoveSession.id === idStr) {
        this.state.setKeyboardMoveSession(null);
      }
    }

    this.state.clearSelection();

    this.callbacks.onElementsChanged();
    this.callbacks.onPushHistory(
      `Deleted ${toDelete.length} elements`,
      { kind: 'delete' }
    );
  }

  /**
   * Paste/duplicate several elements as a single history entry, selecting the
   * pasted set.
   * @param {Array<Object>} dataArray - Serialized element data
   * @param {Function} createFromData
   * @returns {Array<Object>} Created elements
   */
  pasteElements(dataArray, createFromData) {
    const labelW = this.state.labelSettings.width * this.state.labelSettings.dpmm;
    const labelH = this.state.labelSettings.height * this.state.labelSettings.dpmm;
    const offset = 10;
    const created = [];

    for (const data of dataArray) {
      const element = createFromData(data, { labelFontId: this.state.labelSettings?.fontId });
      if (!element) continue;

      element.x = Math.max(0, element.x + offset);
      element.y = Math.max(0, element.y + offset);

      const bounds = getElementBoundsResolved(element, this.state.labelSettings);
      element.x = Math.max(0, Math.min(element.x, Math.max(0, labelW - bounds.width)));
      element.y = Math.max(0, Math.min(element.y, Math.max(0, labelH - bounds.height)));

      this.state.addElement(element);
      created.push(element);
    }

    if (created.length === 0) return [];

    this.state.setSelection(created);
    this.callbacks.onElementsChanged();
    this.callbacks.onPushHistory(
      `Pasted ${created.length} elements`,
      { kind: 'paste' }
    );

    return created;
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
  pasteElement(data, createFromData, options = {}) {
    const element = createFromData(data, { labelFontId: this.state.labelSettings?.fontId });
    if (!element) return null;

    // Calculate label bounds
    const labelW = this.state.labelSettings.width * this.state.labelSettings.dpmm;
    const labelH = this.state.labelSettings.height * this.state.labelSettings.dpmm;
    const offset = 10;
    const hasTargetPosition = Number.isFinite(options.x) && Number.isFinite(options.y);

    if (hasTargetPosition) {
      element.x = Math.round(options.x);
      element.y = Math.round(options.y);
    } else {
      // Offset position slightly
      element.x = Math.max(0, element.x + offset);
      element.y = Math.max(0, element.y + offset);
    }

    // Keep element fully within label bounds
    const bounds = getElementBoundsResolved(element, this.state.labelSettings);
    const maxX = Math.max(0, labelW - bounds.width);
    const maxY = Math.max(0, labelH - bounds.height);
    element.x = Math.max(0, Math.min(element.x, maxX));
    element.y = Math.max(0, Math.min(element.y, maxY));

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
