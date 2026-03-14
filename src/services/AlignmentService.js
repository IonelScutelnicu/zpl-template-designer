// Alignment Service
// Handles element alignment calculations and operations

import { getLabelSizeDots, getElementBoundsResolved, LINE_HEIGHT_RATIO } from '../utils/geometry.js';
import { clampNumber } from '../utils/geometry.js';

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
    const dataLength = (element.previewData || '').length;
    const totalModules = 35 + (11 * dataLength);
    const targetMultiplier = totalModules > 0 ? labelSize.width / totalModules : element.width;
    const rounded = Math.round(targetMultiplier * 10) / 10;
    element.width = clampNumber(rounded, 1, 10);
  }

  /**
   * Calculate QR code size to match label dimension
   */
  matchQRCodeSize(element, labelSize, dimension) {
    const dataLength = (element.previewData || '').length;
    const version = this.calculateQRVersion(dataLength, element.errorCorrection);
    const modules = this.qrVersionToModules(version);
    const targetSize = dimension === 'width' ? labelSize.width : labelSize.height;
    const targetMag = modules > 0 ? Math.round(targetSize / modules) : element.magnification;
    element.magnification = clampNumber(targetMag, 1, 10);
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
   *   where baseLineHeight = fontSize * LINE_HEIGHT_RATIO
   * @param {string} [dimension='height'] - Which label dimension to fill ('width' or 'height')
   */
  matchFieldBlockHeight(element, labelSize, labelSettings, dimension = 'height') {
    const fontSize = element.fontSize || labelSettings.defaultFontHeight || 30;
    const lineSpacing = element.lineSpacing || 0;
    const baseLineHeight = fontSize * LINE_HEIGHT_RATIO;
    const targetSize = dimension === 'width' ? labelSize.width : labelSize.height;
    // Solve: baseLineHeight * n + lineSpacing * (n - 1) <= targetSize
    // => n * (baseLineHeight + lineSpacing) <= targetSize + lineSpacing
    // => n <= (targetSize + lineSpacing) / (baseLineHeight + lineSpacing)
    const estimatedLines = Math.max(1, Math.floor((targetSize + lineSpacing) / (baseLineHeight + lineSpacing)));
    element.maxLines = clampNumber(estimatedLines, 1, 9999);
  }

  /**
   * Calculate QR code version based on data length and error correction
   * @param {number} dataLength - Length of data to encode
   * @param {string} errorCorrection - Error correction level ('L', 'M', 'Q', 'H')
   * @returns {number} QR code version (1-40)
   */
  calculateQRVersion(dataLength, errorCorrection = 'Q') {
    // Simplified QR version calculation
    // Maps approximate data capacity to version
    const capacityMap = {
      L: [41, 77, 127, 187, 255, 322, 370, 461, 552, 652],
      M: [34, 63, 101, 149, 202, 255, 293, 365, 432, 513],
      Q: [27, 48, 77, 111, 144, 178, 207, 259, 312, 364],
      H: [17, 34, 58, 82, 106, 139, 154, 202, 235, 288]
    };

    const capacities = capacityMap[errorCorrection] || capacityMap.Q;

    for (let i = 0; i < capacities.length; i++) {
      if (dataLength <= capacities[i]) {
        return i + 1;
      }
    }

    // For larger data, use approximate formula
    return Math.min(40, Math.ceil(dataLength / 100) + 10);
  }

  /**
   * Convert QR version to module count
   * @param {number} version - QR code version (1-40)
   * @returns {number} Number of modules per side
   */
  qrVersionToModules(version) {
    return 21 + (version - 1) * 4;
  }
}
