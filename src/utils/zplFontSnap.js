import { ZPL_FONTS } from '../config/constants.js';

function magnification(requested, step, maxMag) {
  return Math.min(maxMag, Math.max(1, Math.round(requested / step)));
}

/**
 * The cell grid a font ID renders on, or null when it has none. A ^CW mapping that
 * takes over a resident ID replaces the bitmap font with a downloaded one, which the
 * printer scales freely — so an overridden ID has no grid, and callers that know the
 * label's ^CW list pass it to say so. Callers that omit it keep the resident grid.
 * @param {string} fontId
 * @param {Array<{id: string}>} [customFonts] - the label's ^CW mappings
 * @returns {Object|null}
 */
function bitmapCell(fontId, customFonts) {
  if (customFonts?.some(font => font.id === fontId)) return null;
  return ZPL_FONTS[fontId]?.bitmap || null;
}

/**
 * Returns the allowed per-magnification *requested* heights/widths for a bitmap font:
 * magStep×n and magWidthStep×m for n,m = 1..maxMag. These are the values emitted to ZPL
 * (distinct from snapBitmapFontSize, which returns rendered capStep/advStep sizes).
 * Returns null for scalable or unknown fonts.
 * @param {string} fontId
 * @param {Array<{id: string}>} [customFonts] - the label's ^CW mappings; an override drops the grid
 * @returns {{heights:number[], widths:number[]}|null}
 */
export function getBitmapFontAllowedSizes(fontId, customFonts) {
  const b = bitmapCell(fontId, customFonts);
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
 * @param {Array<{id: string}>} [customFonts] - the label's ^CW mappings; an override drops the grid
 * @returns {{height:number, width:number}} snapped requested values in dots
 */
export function snapRequestedToAllowed(fontId, reqHeight, reqWidth, customFonts) {
  const b = bitmapCell(fontId, customFonts);
  if (!b) return { height: reqHeight, width: reqWidth };
  const height = reqHeight > 0 ? b.magStep * magnification(reqHeight, b.magStep, b.maxMag) : reqHeight;
  const width = reqWidth > 0 ? b.magWidthStep * magnification(reqWidth, b.magWidthStep, b.maxMag) : reqWidth;
  return { height, width };
}

/**
 * Proportional (width-omitted) requested width for a font at a given requested
 * height, in stored dot space. Scalable fonts track height 1:1; bitmap fonts use
 * magWidthStep × the height's magnification.
 * @param {string} fontId
 * @param {number} reqHeight - requested height in dots
 * @param {Array<{id: string}>} [customFonts] - the label's ^CW mappings; an override drops the grid
 * @returns {number} proportional requested width in dots
 */
export function proportionalRequestedWidth(fontId, reqHeight, customFonts) {
  const b = bitmapCell(fontId, customFonts);
  if (!b) return reqHeight;
  return b.magWidthStep * magnification(reqHeight, b.magStep, b.maxMag);
}

/**
 * Requested height for a height-omitted ^A (e.g. ^AAN,,20) at a given requested
 * width, in stored dot space — the mirror of proportionalRequestedWidth. Scalable
 * fonts track width 1:1; bitmap fonts use magStep × the width's magnification.
 * @param {string} fontId
 * @param {number} reqWidth - requested width in dots
 * @param {Array<{id: string}>} [customFonts] - the label's ^CW mappings; an override drops the grid
 * @returns {number} proportional requested height in dots
 */
export function proportionalRequestedHeight(fontId, reqWidth, customFonts) {
  const b = bitmapCell(fontId, customFonts);
  if (!b) return reqWidth;
  return b.magStep * magnification(reqWidth, b.magWidthStep, b.maxMag);
}

/**
 * Clamp explicit (positive) height/width up to the font's configured minimum
 * (minHeight/minWidth, in dots). A value of 0 — the inherit/proportional sentinel —
 * is preserved. Fonts without a configured minimum pass through unchanged.
 * @param {string} fontId
 * @param {number} height - requested height in dots (0 = inherit)
 * @param {number} width - requested width in dots (0 = proportional)
 * @returns {{height:number, width:number}}
 */
export function enforceFontMinSize(fontId, height, width) {
  const cfg = ZPL_FONTS[fontId];
  const minH = cfg?.minHeight || 0;
  const minW = cfg?.minWidth || 0;
  return {
    height: height > 0 && height < minH ? minH : height,
    width: width > 0 && width < minW ? minW : width,
  };
}

/**
 * Snaps an element's stored fontSize/fontWidth in place to the allowed grid for its
 * resolved bitmap font. No-op for scalable fonts. `labelFontId` is the label default
 * used when the element has no explicit fontId; an inheriting element whose caller
 * didn't supply one is left alone rather than snapped against a guessed font.
 * @param {{fontId?:string, fontSize?:number, fontWidth?:number}} element
 * @param {string} [labelFontId]
 * @param {Array<{id: string}>} [customFonts] - the label's ^CW mappings; an override drops the grid
 */
export function normalizeElementFontSize(element, labelFontId, customFonts) {
  const fontId = element.fontId || labelFontId;
  if (!bitmapCell(fontId, customFonts)) return;
  const snapped = snapRequestedToAllowed(fontId, element.fontSize || 0, element.fontWidth || 0, customFonts);
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
  const b = ZPL_FONTS[fontId]?.bitmap;
  if (!b) {
    return { height: reqHeight, width: reqWidth };
  }

  const nH = magnification(reqHeight, b.magStep, b.maxMag);
  const mW = reqWidth > 0 ? magnification(reqWidth, b.magWidthStep, b.maxMag) : nH;
  return { height: b.capStep * nH, width: b.advStep * mW };
}
