// Geometry and Math Utilities for ZPL Template Creator

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
  return {
    width: Math.round(labelSettings.width * labelSettings.dpmm),
    height: Math.round(labelSettings.height * labelSettings.dpmm)
  };
}

/**
 * Get element bounds with resolved font dimensions (for TEXT, FIELDBLOCK, and TEXTBLOCK)
 * @param {Object} element - Element to get bounds for
 * @param {Object} labelSettings - Label configuration (for default font sizes)
 * @returns {Object} Bounds {x, y, width, height}
 */
export function getElementBoundsResolved(element, labelSettings) {
  if (element.type === 'TEXTBLOCK') {
    const blockW = element.blockWidth || 200;
    const blockH = element.blockHeight || 50;
    if (element.orientation === 'R' || element.orientation === 'B') {
      return { x: element.x, y: element.y, width: blockH, height: blockW };
    }
    return { x: element.x, y: element.y, width: blockW, height: blockH };
  }
  if (element.type === 'FIELDBLOCK') {
    const resolvedHeight = element.fontSize || labelSettings.defaultFontHeight || 30;
    const maxLines = element.maxLines || 1;
    const lineSpacing = element.lineSpacing || 0;
    // Line spacing is only between lines, not after the last line
    const baseLineHeight = resolvedHeight * 1.2;
    const totalHeight = baseLineHeight * maxLines + lineSpacing * Math.max(0, maxLines - 1);
    const blockWidth = element.blockWidth || 200;
    if (element.orientation === 'R' || element.orientation === 'B') {
      return { x: element.x, y: element.y, width: totalHeight, height: blockWidth };
    }
    return {
      x: element.x,
      y: element.y,
      width: blockWidth,
      height: totalHeight
    };
  }
  if (element.type === 'TEXT') {
    const resolvedHeight = element.fontSize || labelSettings.defaultFontHeight || 30;
    const resolvedWidth = element.fontWidth || labelSettings.defaultFontWidth || 30;
    const textW = Math.max((element.previewText || '').length * resolvedWidth * 0.6, 50);
    let w = textW, h = resolvedHeight;
    if (element.orientation === 'R' || element.orientation === 'B') {
      w = resolvedHeight;
      h = textW;
    }
    return { x: element.x, y: element.y, width: w, height: h };
  }
  return element.getBounds();
}

