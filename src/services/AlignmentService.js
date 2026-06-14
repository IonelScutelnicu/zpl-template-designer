// Alignment Service
// Handles element alignment calculations and operations

import { getLabelSizeDots, getElementBoundsResolved, LINE_HEIGHT_RATIO, clampNumber } from '../utils/geometry.js';
import { resolveFontLineHeight, resolveFontMetrics } from '../utils/fontMetrics.js';
import { getBarcodeGeometry, linearFallbackModules, BARCODE_2D_SIZE_BOUNDS } from '../utils/barcodeGeometry.js';

/**
 * Service for applying alignment operations to elements
 */
export class AlignmentService {
  /**
   * Apply alignment action to an element
   * @param {string} action - Alignment action ('center-x', 'center-y', 'match-width', 'match-height')
   * @param {Object} element - Element to align
   * @param {Object} labelSettings - Label configuration
   */
  applyAlignment(action, element, labelSettings, renderer = null) {
    if (!element) return;

    const labelSize = getLabelSizeDots(labelSettings);
    const bounds = (element.type === 'TEXT' && renderer)
      ? renderer.measureTextBounds(element, labelSettings)
      : getElementBoundsResolved(element, labelSettings);

    switch (action) {
      case 'center-x':
        this.centerHorizontally(element, labelSize, bounds);
        break;
      case 'center-y':
        this.centerVertically(element, labelSize, bounds);
        break;
      case 'match-width':
        this.matchWidth(element, labelSize, labelSettings);
        break;
      case 'match-height':
        this.matchHeight(element, labelSize, labelSettings);
        break;
      default:
        console.warn(`Unknown alignment action: ${action}`);
    }
  }

  /**
   * Resolve an element's bounds using the same rule as single-element alignment
   * (measured glyph box for TEXT, resolved geometry otherwise).
   */
  _boundsFor(element, labelSettings, renderer) {
    return (element.type === 'TEXT' && renderer)
      ? renderer.measureTextBounds(element, labelSettings)
      : getElementBoundsResolved(element, labelSettings);
  }

  /**
   * Align two or more elements to each other, relative to the selection's
   * bounding box. Position-only (never resizes). Locked elements are skipped.
   * @param {string} action - left|center-h|right|top|middle|bottom
   * @param {Array<Object>} elements - Selected elements
   * @param {Object} labelSettings
   * @param {Object} [renderer]
   * @returns {boolean} Whether any element moved
   */
  alignElements(action, elements, labelSettings, renderer = null) {
    const targets = (elements || []).filter(el => el && !el.locked);
    if (targets.length < 2) return false;

    const items = targets.map(el => ({ el, b: this._boundsFor(el, labelSettings, renderer) }));
    const minX = Math.min(...items.map(i => i.b.x));
    const minY = Math.min(...items.map(i => i.b.y));
    const maxX = Math.max(...items.map(i => i.b.x + i.b.width));
    const maxY = Math.max(...items.map(i => i.b.y + i.b.height));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    for (const { el, b } of items) {
      switch (action) {
        case 'left':     el.x = Math.max(0, Math.round(el.x + (minX - b.x))); break;
        case 'center-h': el.x = Math.max(0, Math.round(el.x + (centerX - (b.x + b.width / 2)))); break;
        case 'right':    el.x = Math.max(0, Math.round(el.x + (maxX - (b.x + b.width)))); break;
        case 'top':      el.y = Math.max(0, Math.round(el.y + (minY - b.y))); break;
        case 'middle':   el.y = Math.max(0, Math.round(el.y + (centerY - (b.y + b.height / 2)))); break;
        case 'bottom':   el.y = Math.max(0, Math.round(el.y + (maxY - (b.y + b.height)))); break;
        default:
          console.warn(`Unknown group alignment action: ${action}`);
          return false;
      }
    }
    return true;
  }

  /**
   * Center a multi-selection on the label as a unit — the group's bounding box
   * is centered on the chosen axis and every element shifts by the same delta,
   * preserving their relative layout. Locked elements are skipped. Mirrors the
   * single-element center / match, but for a whole group. The group's bounding
   * box is centered or pinned to a label edge and every element shifts by the
   * same delta, preserving their relative layout. Locked elements are skipped.
   * @param {string} action - 'center-x' | 'center-y' | 'left' | 'right' | 'top' | 'bottom'
   * @param {Array<Object>} elements
   * @param {Object} labelSettings
   * @param {Object} [renderer]
   * @returns {boolean} Whether any element moved
   */
  alignElementsToLabel(action, elements, labelSettings, renderer = null) {
    const targets = (elements || []).filter(el => el && !el.locked);
    if (targets.length === 0) return false;

    const labelSize = getLabelSizeDots(labelSettings);
    const items = targets.map(el => ({ el, b: this._boundsFor(el, labelSettings, renderer) }));
    const minX = Math.min(...items.map(i => i.b.x));
    const minY = Math.min(...items.map(i => i.b.y));
    const maxX = Math.max(...items.map(i => i.b.x + i.b.width));
    const maxY = Math.max(...items.map(i => i.b.y + i.b.height));

    // Compute a single x- or y-delta to shift the whole group by.
    let dx = null, dy = null;
    switch (action) {
      case 'left':     dx = -minX; break;
      case 'right':    dx = labelSize.width - maxX; break;
      case 'center-x': dx = Math.max(0, Math.round((labelSize.width - (maxX - minX)) / 2)) - minX; break;
      case 'top':      dy = -minY; break;
      case 'bottom':   dy = labelSize.height - maxY; break;
      case 'center-y': dy = Math.max(0, Math.round((labelSize.height - (maxY - minY)) / 2)) - minY; break;
      default:
        console.warn(`Unknown group label-align action: ${action}`);
        return false;
    }

    if (dx !== null) for (const { el } of items) el.x = Math.max(0, Math.round(el.x + dx));
    if (dy !== null) for (const { el } of items) el.y = Math.max(0, Math.round(el.y + dy));
    return true;
  }

  /**
   * Resize the selected resizable elements so each matches the largest one's
   * width or height. Reuses the per-type sizing of matchWidth / matchHeight
   * (which target the supplied size) but resizes in place — the element's
   * position is preserved. Auto-sized types (TEXT/QRCODE/GRAPHIC, where
   * canMatchLabelSize() is false) and locked elements are skipped.
   * @param {string} dimension - 'width' | 'height'
   * @param {Array<Object>} elements
   * @param {Object} labelSettings
   * @param {Object} [renderer]
   * @returns {boolean} Whether any element was resized
   */
  matchSizeToLargest(dimension, elements, labelSettings, renderer = null) {
    const resizable = (elements || []).filter(el => el && !el.locked && el.canMatchLabelSize?.());
    if (resizable.length < 2) return false;

    const target = Math.max(...resizable.map(el => {
      const b = this._boundsFor(el, labelSettings, renderer);
      return dimension === 'width' ? b.width : b.height;
    }));
    // matchWidth/matchHeight read labelSize.width / labelSize.height as the
    // target, so feed the group's largest dimension through that same path.
    const pseudoLabel = { width: target, height: target };

    for (const el of resizable) {
      if (dimension === 'width') {
        const x = el.x;
        this.matchWidth(el, pseudoLabel, labelSettings);
        el.x = x; // matchWidth pins x=0 for label-match; keep position here
      } else {
        const y = el.y;
        this.matchHeight(el, pseudoLabel, labelSettings);
        el.y = y;
      }
    }
    return true;
  }

  /**
   * Distribute three or more elements so the gaps between them are even along
   * one axis. The extreme elements stay put; the inner ones are repositioned.
   * Locked elements are skipped.
   * @param {string} axis - 'horizontal' | 'vertical'
   * @param {Array<Object>} elements
   * @param {Object} labelSettings
   * @param {Object} [renderer]
   * @returns {boolean} Whether any element moved
   */
  distributeElements(axis, elements, labelSettings, renderer = null) {
    const targets = (elements || []).filter(el => el && !el.locked);
    if (targets.length < 3) return false;

    const horizontal = axis === 'horizontal';
    const items = targets.map(el => {
      const b = this._boundsFor(el, labelSettings, renderer);
      return {
        el,
        min: horizontal ? b.x : b.y,
        size: horizontal ? b.width : b.height,
        offset: horizontal ? (b.x - el.x) : (b.y - el.y) // bound edge vs element origin
      };
    }).sort((a, b) => a.min - b.min);

    const first = items[0];
    const last = items[items.length - 1];
    const span = (last.min + last.size) - first.min;
    const sumSizes = items.reduce((sum, i) => sum + i.size, 0);
    const gap = (span - sumSizes) / (items.length - 1);

    let cursor = first.min + first.size + gap;
    for (let i = 1; i < items.length - 1; i++) {
      const item = items[i];
      const newOrigin = Math.round(cursor - item.offset);
      if (horizontal) item.el.x = Math.max(0, newOrigin);
      else item.el.y = Math.max(0, newOrigin);
      cursor += item.size + gap;
    }
    return true;
  }

  /**
   * Center element horizontally on label
   */
  centerHorizontally(element, labelSize, bounds) {
    const centeredX = Math.round((labelSize.width - bounds.width) / 2);
    element.x = Math.max(0, centeredX);
  }

  /**
   * Center element vertically on label
   */
  centerVertically(element, labelSize, bounds) {
    const centeredY = Math.round((labelSize.height - bounds.height) / 2);
    element.y = Math.max(0, centeredY);
  }

  /**
   * Match element width to label width
   */
  matchWidth(element, labelSize, labelSettings) {
    element.x = 0;

    switch (element.type) {
      case 'BOX':
        element.width = labelSize.width;
        break;

      case 'LINE':
        if (element.orientation === 'H') {
          element.width = labelSize.width;
        } else {
          element.thickness = labelSize.width;
        }
        break;

      case 'FIELDBLOCK': {
        const isRotated = this._isRotated(element);
        if (isRotated) {
          // Rotated: visual width = totalHeight (from maxLines), so adjust maxLines
          this.matchFieldBlockHeight(element, labelSize, labelSettings, 'width');
        } else {
          element.blockWidth = labelSize.width;
        }
        break;
      }

      case 'TEXTBLOCK': {
        const isRotated = this._isRotated(element);
        if (isRotated) {
          element.blockHeight = labelSize.width;
        } else {
          element.blockWidth = labelSize.width;
        }
        break;
      }

      case 'BARCODE':
        this.matchBarcodeWidth(element, labelSize);
        break;

      case 'QRCODE':
        this.matchQRCodeSize(element, labelSize, 'width');
        break;

      case 'TEXT':
        this.matchTextWidth(element, labelSize, labelSettings);
        break;

      case 'CIRCLE':
        element.width = labelSize.width;
        break;
    }
  }

  /**
   * Match element height to label height
   */
  matchHeight(element, labelSize, labelSettings) {
    element.y = 0;

    switch (element.type) {
      case 'BOX':
        element.height = labelSize.height;
        break;

      case 'LINE':
        if (element.orientation === 'V') {
          element.width = labelSize.height;
        } else {
          element.thickness = labelSize.height;
        }
        break;

      case 'BARCODE':
        element.height = labelSize.height;
        break;

      case 'QRCODE':
        this.matchQRCodeSize(element, labelSize, 'height');
        break;

      case 'FIELDBLOCK': {
        const isRotated = this._isRotated(element);
        if (isRotated) {
          // Rotated: visual height = blockWidth, so set blockWidth to label height
          element.blockWidth = labelSize.height;
        } else {
          this.matchFieldBlockHeight(element, labelSize, labelSettings);
        }
        break;
      }

      case 'TEXTBLOCK': {
        const isRotated = this._isRotated(element);
        if (isRotated) {
          // Rotated: visual height = blockWidth, so set blockWidth to label height
          element.blockWidth = labelSize.height;
        } else {
          element.blockHeight = labelSize.height;
        }
        break;
      }

      case 'TEXT':
        this.matchTextHeight(element, labelSize, labelSettings);
        break;

      case 'CIRCLE':
        element.height = labelSize.height;
        break;
    }
  }

  /**
   * Check if element has a rotated orientation (90° or 270°)
   * When rotated, visual width/height are swapped relative to blockWidth/blockHeight
   */
  _isRotated(element) {
    return element.orientation === 'R' || element.orientation === 'B';
  }

  /**
   * Calculate barcode width to match label
   */
  matchBarcodeWidth(element, labelSize) {
    const geom = getBarcodeGeometry(element);
    const totalModules = geom.kind === 'linear'
      ? geom.modules
      : linearFallbackModules((element.previewData || '').length);
    const targetMultiplier = totalModules > 0 ? labelSize.width / totalModules : element.width;
    element.width = clampNumber(Math.round(targetMultiplier), 1, 10);
  }

  /**
   * Calculate 2D barcode size to match a label dimension, by adjusting the
   * symbology's module size.
   */
  matchQRCodeSize(element, labelSize, dimension) {
    const geom = getBarcodeGeometry(element);
    if (geom.kind !== 'matrix') return;
    const target = dimension === 'width' ? labelSize.width : labelSize.height;
    const b = BARCODE_2D_SIZE_BOUNDS;
    if (element.symbology === 'PDF417') {
      if (dimension === 'width') element.moduleWidth = clampNumber(Math.round(target / geom.cols), b.PDF417.moduleWidth.min, b.PDF417.moduleWidth.max);
      else element.rowHeight = clampNumber(Math.round(target / geom.rows), b.PDF417.rowHeight.min, b.PDF417.rowHeight.max);
    } else if (element.symbology === 'DATAMATRIX') {
      const modules = dimension === 'width' ? geom.cols : geom.rows;
      element.moduleSize = clampNumber(Math.round(target / modules), b.DATAMATRIX.moduleSize.min, b.DATAMATRIX.moduleSize.max);
    } else {
      element.magnification = clampNumber(Math.round(target / geom.cols), b.QR.magnification.min, b.QR.magnification.max);
    }
  }

  /**
   * Match text width to label width
   */
  matchTextWidth(element, labelSize, labelSettings) {
    const textLength = (element.previewText || '').length;
    if (textLength > 0) {
      const resolvedWidth = element.fontWidth || labelSettings.defaultFontWidth || 30;
      const currentWidth = Math.max(textLength * resolvedWidth * 0.6, 50);
      const scale = labelSize.width / currentWidth;
      element.fontWidth = clampNumber(Math.round(resolvedWidth * scale), 1, 32000);
    }
  }

  /**
   * Match text height to label height
   */
  matchTextHeight(element, labelSize, labelSettings) {
    const currentHeight = element.fontSize || labelSettings.defaultFontHeight || 30;
    const scale = labelSize.height / currentHeight;
    element.fontSize = clampNumber(Math.round(currentHeight * scale), 1, 32000);
  }

  /**
   * Match field block height by adjusting max lines
   * Uses the same height formula as getElementBoundsResolved:
   *   totalHeight = baseLineHeight * maxLines + lineSpacing * (maxLines - 1)
   *   where baseLineHeight uses the selected font's configured line-height ratio
   * @param {string} [dimension='height'] - Which label dimension to fill ('width' or 'height')
   */
  matchFieldBlockHeight(element, labelSize, labelSettings, dimension = 'height') {
    const lineSpacing = element.lineSpacing || 0;
    const fontMetrics = resolveFontMetrics(element, labelSettings, 1);
    const baseLineHeight = resolveFontLineHeight(fontMetrics, LINE_HEIGHT_RATIO);
    const targetSize = dimension === 'width' ? labelSize.width : labelSize.height;
    // Solve: baseLineHeight * n + lineSpacing * (n - 1) <= targetSize
    // => n * (baseLineHeight + lineSpacing) <= targetSize + lineSpacing
    // => n <= (targetSize + lineSpacing) / (baseLineHeight + lineSpacing)
    const estimatedLines = Math.max(1, Math.floor((targetSize + lineSpacing) / (baseLineHeight + lineSpacing)));
    element.maxLines = clampNumber(estimatedLines, 1, 9999);
  }
}
