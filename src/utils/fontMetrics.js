// Resolve canvas font metrics for text-bearing elements.
// Single source of truth for the font-dim resolution shared by TextRenderer,
// TextBlockRenderer, FieldBlockRenderer, and canvas-renderer's measureTextBounds.

import { ZPL_FONTS } from '../config/constants.js';
import { snapBitmapFontSize } from './zplFontSnap.js';

/**
 * Resolve canvas font metrics for a text-bearing element.
 *
 * @param {Object} element       Must have fontId/fontSize/fontWidth (any may be 0/'')
 * @param {Object} labelSettings Must have fontId/defaultFontHeight/defaultFontWidth
 * @param {number} [scale=1]     Canvas-pixel-per-dot multiplier; pass 1 for label-dot space
 * @returns {{
 *   fontId: string,
 *   fontConfig: object,
 *   fontSize: number,
 *   fontWidth: number,
 *   scaleX: number,
 *   snappedHeight: number,
 *   snappedWidth: number,
 *   hasExplicitWidth: boolean,
 *   isBitmap: boolean,
 * }}
 */
export function resolveFontMetrics(element, labelSettings, scale = 1) {
  const fontId = element.fontId || labelSettings.fontId || '0';
  const fontConfig = ZPL_FONTS[fontId] || ZPL_FONTS['default'];

  const rawFontSize = element.fontSize || labelSettings.defaultFontHeight || 20;
  const explicitWidth = element.fontWidth || labelSettings.defaultFontWidth || 0;
  const hasExplicitWidth = explicitWidth > 0;

  if (fontConfig.bitmap) {
    const snapped = snapBitmapFontSize(fontId, rawFontSize, hasExplicitWidth ? explicitWidth : 0);
    const capRatio = fontConfig.capRatio || 1;
    const advanceRatio = fontConfig.advanceRatio || 1;
    return {
      fontId,
      fontConfig,
      fontSize: (snapped.height / capRatio) * scale,
      fontWidth: snapped.width * scale,
      scaleX: (snapped.width * capRatio) / (snapped.height * advanceRatio),
      snappedHeight: snapped.height,
      snappedWidth: snapped.width,
      hasExplicitWidth,
      isBitmap: true,
    };
  }

  // Scalable Font 0 / default — proportional model.
  const rawFontWidth = hasExplicitWidth ? explicitWidth : rawFontSize * (fontConfig.aspectRatio || 1);
  const fontSize = rawFontSize * scale;
  const fontWidth = rawFontWidth * scale;
  const scaleX = !hasExplicitWidth
    ? 1
    : fontConfig.monospace
      ? fontWidth / (fontSize * (fontConfig.aspectRatio || 1))
      : fontWidth / fontSize;

  return {
    fontId,
    fontConfig,
    fontSize,
    fontWidth,
    scaleX,
    snappedHeight: rawFontSize,
    snappedWidth: rawFontWidth,
    hasExplicitWidth,
    isBitmap: false,
  };
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/**
 * Resolve multiline text pitch in canvas pixels from ZPL font height.
 *
 * @param {Object} metrics Result from resolveFontMetrics
 * @param {number} fallbackRatio Ratio used when the font has no configured value
 * @param {number} [scale=1] Canvas-pixel-per-dot multiplier
 * @param {string} [ratioKey='lineHeightRatio'] Font config key to prefer
 * @param {'snappedHeight'|'fontSize'} [baseKey='snappedHeight'] Metric to multiply by the ratio
 * @returns {number}
 */
export function resolveFontLineHeight(metrics, fallbackRatio, scale = 1, ratioKey = 'lineHeightRatio', baseKey = 'snappedHeight') {
  const fontConfig = metrics.fontConfig || {};
  const ratio = positiveNumber(fontConfig[ratioKey])
    ?? (ratioKey !== 'lineHeightRatio' ? positiveNumber(fontConfig.lineHeightRatio) : null)
    ?? fallbackRatio;

  const base = baseKey === 'fontSize' ? metrics.fontSize : metrics.snappedHeight * scale;
  return base * ratio;
}
