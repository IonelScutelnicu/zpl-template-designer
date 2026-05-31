import { ZPL_FONTS } from '../config/constants.js';

function magnification(requested, step, maxMag) {
  return Math.min(maxMag, Math.max(1, Math.round(requested / step)));
}

/**
 * Returns the allowed per-magnification *requested* heights/widths for a bitmap font:
 * magStep×n and magWidthStep×m for n,m = 1..maxMag. These are the values emitted to ZPL
 * (distinct from snapBitmapFontSize, which returns rendered capStep/advStep sizes).
 * Returns null for scalable or unknown fonts.
 * @param {string} fontId
 * @returns {{heights:number[], widths:number[]}|null}
 */
export function getBitmapFontAllowedSizes(fontId) {
  const b = ZPL_FONTS[fontId]?.bitmap;
  if (!b) return null;
  const heights = [];
  const widths = [];
  for (let i = 1; i <= b.maxMag; i++) {
    heights.push(b.magStep * i);
    widths.push(b.magWidthStep * i);
  }
  return { heights, widths };
}

/**
 * Snaps a requested height/width to the nearest allowed *requested* grid value
 * (magStep×n / magWidthStep×m, n,m clamped 1..maxMag). A value of 0 (use default /
 * proportional) is preserved. For scalable or unknown fonts the values pass through
 * unchanged.
 * @param {string} fontId
 * @param {number} reqHeight - requested height in dots (0 = use default)
 * @param {number} reqWidth - requested width in dots (0 = proportional)
 * @returns {{height:number, width:number}} snapped requested values in dots
 */
export function snapRequestedToAllowed(fontId, reqHeight, reqWidth) {
  const b = ZPL_FONTS[fontId]?.bitmap;
  if (!b) return { height: reqHeight, width: reqWidth };
  const height = reqHeight > 0 ? b.magStep * magnification(reqHeight, b.magStep, b.maxMag) : reqHeight;
  const width = reqWidth > 0 ? b.magWidthStep * magnification(reqWidth, b.magWidthStep, b.maxMag) : reqWidth;
  return { height, width };
}

/**
 * Snaps an element's stored fontSize/fontWidth in place to the allowed grid for its
 * resolved bitmap font. No-op for scalable fonts. `labelFontId` is the label default
 * used when the element has no explicit fontId.
 * @param {{fontId?:string, fontSize?:number, fontWidth?:number}} element
 * @param {string} [labelFontId]
 */
export function normalizeElementFontSize(element, labelFontId) {
  const fontId = element.fontId || labelFontId || '0';
  if (!ZPL_FONTS[fontId]?.bitmap) return;
  const snapped = snapRequestedToAllowed(fontId, element.fontSize || 0, element.fontWidth || 0);
  element.fontSize = snapped.height;
  element.fontWidth = snapped.width;
}

/**
 * @param {string} fontId
 * @param {number} reqHeight - requested height in dots
 * @param {number} reqWidth - requested width in dots (0 = none → natural width)
 * @returns {{height:number, width:number}} rendered cap-ink height and cell advance in dots
 */
export function snapBitmapFontSize(fontId, reqHeight, reqWidth) {
  const cfg = ZPL_FONTS[fontId];
  const b = cfg && cfg.bitmap;
  if (!b) {
    return { height: reqHeight, width: reqWidth };
  }

  const nH = magnification(reqHeight, b.magStep, b.maxMag);
  const mW = reqWidth > 0 ? magnification(reqWidth, b.magWidthStep, b.maxMag) : nH;
  return { height: b.capStep * nH, width: b.advStep * mW };
}
