// Geometry and Math Utilities for ZPL Template Creator

import { resolveFontLineHeight, resolveFontMetrics } from './fontMetrics.js';

/**
 * Line height multiplier for FieldBlock rendering.
 * Each line of text occupies resolved font height * LINE_HEIGHT_RATIO dots vertically.
 * In ZPL, the line height equals the font height (no extra leading),
 * so this is 1.0 to match actual printer/Labelary output.
 */
export const LINE_HEIGHT_RATIO = 1.0;

/**
 * Shared ^FB extents in dots, or pixels when scaled. `farEdgeBlockHeight`
 * includes the trailing spacing slot about which Labelary rotates R/I blocks.
 *
 * @param {Object} element FIELDBLOCK element
 * @param {Object} labelSettings Label settings, for the inherited font
 * @param {number} [scale=1] Canvas pixels per dot; 1 for dot space
 * @param {number} [lineCount] Laid-out lines; defaults to the declared count
 * @returns {{blockWidth: number, blockHeight: number, farEdgeBlockHeight: number,
 *           width: number, height: number}} orientation-resolved extents
 */
export function fieldBlockExtents(element, labelSettings, scale = 1, lineCount = 0) {
  const maxLines = lineCount || element.maxLines || 1;
  const lineSpacing = (element.lineSpacing || 0) * scale;
  const fontMetrics = resolveFontMetrics(element, labelSettings || {}, 1);
  const baseLineHeight = resolveFontLineHeight(fontMetrics, LINE_HEIGHT_RATIO, scale);
  const blockHeight = baseLineHeight * maxLines + lineSpacing * Math.max(0, maxLines - 1);
  const farEdgeBlockHeight = blockHeight + lineSpacing;
  const blockWidth = (element.blockWidth || 200) * scale;

  const extents = { blockWidth, blockHeight, farEdgeBlockHeight };
  switch (element.orientation) {
    case 'R': return { ...extents, width: farEdgeBlockHeight, height: blockWidth };
    case 'B': return { ...extents, width: blockHeight, height: blockWidth };
    case 'I': return { ...extents, width: blockWidth, height: farEdgeBlockHeight };
    default: return { ...extents, width: blockWidth, height: blockHeight };
  }
}

/**
 * Clamp a number between min and max values
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
export function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Get label dimensions in dots
 * @param {Object} labelSettings - Label configuration
 * @returns {Object} Label dimensions {width, height} in dots
 */
export function getLabelSizeDots(labelSettings) {
  const actualDpi = Math.floor(labelSettings.dpmm * 25.4);
  return {
    width: Math.floor((labelSettings.width / 25.4) * actualDpi),
    height: Math.floor((labelSettings.height / 25.4) * actualDpi)
  };
}

/**
 * Whether an element occupies a position on the label, and so takes part in
 * hit-testing, dragging, marquee selection, nudging, alignment and smart
 * guides. Non-spatial elements (RAW) are stack-only; including them would feed
 * a phantom origin box into every one of those calculations.
 * Tolerates plain serialized data objects, which have no methods.
 * @param {Object} element
 * @returns {boolean}
 */
export function isSpatial(element) {
  return element?.isSpatial?.() !== false;
}

/**
 * Get element bounds with resolved font dimensions (for TEXT, FIELDBLOCK, and TEXTBLOCK)
 * @param {Object} element - Element to get bounds for
 * @param {Object} labelSettings - Label configuration (for default font sizes)
 * @returns {Object} Bounds {x, y, width, height}
 */
export function getElementBoundsResolved(element, labelSettings) {
  return element.getBounds(labelSettings?.dpmm, labelSettings?.previewData, labelSettings);
}
