import { ZPL_FONTS } from '../config/constants.js';

function magnification(requested, step, maxMag) {
  return Math.min(maxMag, Math.max(1, Math.round(requested / step)));
}

/**
 * Returns the maximum rendered height/width for a bitmap font (capStep × maxMag, advStep × maxMag).
 * Returns null for scalable or unknown fonts.
 * @param {string} fontId
 * @returns {{maxHeight:number, maxWidth:number}|null}
 */
export function getBitmapFontMaxSize(fontId) {
  const b = ZPL_FONTS[fontId]?.bitmap;
  if (!b) return null;
  return { maxHeight: b.capStep * b.maxMag, maxWidth: b.advStep * b.maxMag };
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
