// Configuration Constants for ZPL Template Creator

/**
 * History Settings
 */
export const HISTORY_LIMIT = 100;

/**
 * Built-in ZPL fonts that cannot be overridden
 */
export const BUILTIN_FONTS = ['0', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

/**
 * The font a label uses when nothing says otherwise — matches a printer's power-up
 * ^CF (font A, height 9, width 5). DEFAULT_FONT_HEIGHT is
 * magnification 2 of font A's 9-dot cell, so a new label's text stays readable while
 * still sitting on the font's allowed grid.
 */
export const DEFAULT_FONT_ID = 'A';
export const DEFAULT_FONT_HEIGHT = 18;

/**
 * Sentinel character used to render Code 93's start/stop guard in the HRI line.
 * Labelary/Zebra draw an empty box at each end of the readable text (□CODE93□);
 * a private-use codepoint maps to the `box` charRule on font A so the renderer
 * draws that box. It never appears in real ZPL data.
 */
export const CODE93_GUARD_CHAR = '\uE000';

/**
 * Sentinel characters used to render Code 11's start/stop guards in the HRI line.
 * Labelary/Zebra draw a small hollow triangle at each end of the readable text
 * (\u25B312345611\u25B3) \u2014 the stop triangle is larger than the start one (0.75 vs 0.5 of
 * the cap height). Each private-use codepoint maps to a `triangle` charRule on font A
 * and never appears in real ZPL data.
 */
export const CODE11_GUARD_START_CHAR = '\uE001';
export const CODE11_GUARD_STOP_CHAR = '\uE002';

/**
 * ZPL font mapping.
 */
export const ZPL_FONTS = {
  '0': {
    family: '"Roboto Condensed", "Arial Narrow", "Helvetica Condensed", Arial, sans-serif',
    weight: 'bold',
    monospace: false,
    yOffset: 0.01,
    baseHeight: 18,
    baseWidth: 10,
    lineHeightRatio: 1.0,
    textBlockLineHeightRatio: 1.25,
    aspectRatio: 0.9,  // Condensed - matches CG Triumvirate Bold Condensed
    // Vertical-only stretch of the drawn glyphs, as a multiple of the ^A height.
    // The substitute browser font's caps sit slightly short of Zebra's CG
    // Triumvirate Bold Condensed, so the glyphs are drawn at heightScale × the
    // em and the render frame is squeezed back by 1/heightScale — advances,
    // charRules and the ZPL height itself are unchanged, only the ink is taller.
    heightScale: 1.04,
    minHeight: 10,  // Smallest explicit height/width (dots) accepted on ZPL import;
    minWidth: 10,   // smaller positive values are clamped up. 0 stays inherit/proportional.
    wordSpacing: 0.065,  // Extra space-glyph advance as fraction of fontSize (the system font's space is narrower than Zebra's Font 0)
    // Per-character render rules: replace specific glyphs with drawn shapes and/or
    // control their advance width. Keyed by character; each rule's `type` selects a
    // handler in fontMetrics.js (CHAR_RULE_HANDLERS). All ratios are fractions of
    // fontSize. Add a character by adding an entry here; add a behaviour by adding a
    // handler. The '-' rule draws a calibrated bar because the system font's hyphen
    // is too narrow/short vs Zebra's CG Triumvirate Bold Condensed dash.
    charRules: {
      '-': { type: 'bar', padRatio: 0.16, lineRatio: 0.58, heightRatio: 0.10, yRatio: 0.40 },
      '—': { type: 'bar', padRatio: 0.16, lineRatio: 0.58, heightRatio: 0.10, yRatio: 0.40 },
      // Real glyph. advanceRatio = cell pitch (match Zebra's digit spacing);
      // widthRatio < 1 condenses the glyph itself. Centered in the cell.
      '0': { type: 'glyph', advanceRatio: 0.48, widthRatio: 0.92 },
      '1': { type: 'glyph', advanceRatio: 0.48, widthRatio: 0.92 },
      '2': { type: 'glyph', advanceRatio: 0.48, widthRatio: 0.92 },
      '3': { type: 'glyph', advanceRatio: 0.48, widthRatio: 0.92 },
      '4': { type: 'glyph', advanceRatio: 0.48, widthRatio: 0.92 },
      '5': { type: 'glyph', advanceRatio: 0.48, widthRatio: 0.92 },
      '6': { type: 'glyph', advanceRatio: 0.48, widthRatio: 0.92 },
      '7': { type: 'glyph', advanceRatio: 0.48, widthRatio: 0.92 },
      '8': { type: 'glyph', advanceRatio: 0.48, widthRatio: 0.92 },
      '9': { type: 'glyph', advanceRatio: 0.48, widthRatio: 0.92 },
      '@': { type: 'glyph', advanceRatio: 0.90, widthRatio: 1 },
      '*': { type: 'glyph', advanceRatio: 0.48, widthRatio: 0.75 },
      '$': { type: 'glyph', advanceRatio: 0.48, widthRatio: 1.1 },
      '#': { type: 'glyph', advanceRatio: 0.48, widthRatio: 1.1 },
      '!': { type: 'glyph', advanceRatio: 0.295, widthRatio: 1 },
      '(': { type: 'glyph', advanceRatio: 0.295, widthRatio: 1 },
      ')': { type: 'glyph', advanceRatio: 0.295, widthRatio: 1 },
      '&': { type: 'glyph', advanceRatio: 0.61, widthRatio: 1.1 },
      '%': { type: 'glyph', advanceRatio: 0.903, widthRatio: 1.55 },
      '.': { type: 'glyph', advanceRatio: 0.295, widthRatio: 1 },
      ',': { type: 'glyph', advanceRatio: 0.295, widthRatio: 1 },
      '/': { type: 'glyph', advanceRatio: 0.295, widthRatio: 1 },
      '+': { type: 'glyph', advanceRatio: 0.905, widthRatio: 1.45 },
      '=': { type: 'glyph', advanceRatio: 0.905, widthRatio: 1.51 },
      '`': { type: 'glyph', advanceRatio: 0.295, widthRatio: 1 },
      '<': { type: 'glyph', advanceRatio: 1, widthRatio: 1.6 },
      '>': { type: 'glyph', advanceRatio: 1, widthRatio: 1.6 },
      '?': { type: 'glyph', advanceRatio: 0.441, widthRatio: 1 },
      ';': { type: 'glyph', advanceRatio: 0.295, widthRatio: 1 },
      ':': { type: 'glyph', advanceRatio: 0.295, widthRatio: 1 },
      '"': { type: 'glyph', advanceRatio: 0.481, widthRatio: 1 },
      '\'': { type: 'glyph', advanceRatio: 0.296, widthRatio: 1 },
      '[': { type: 'glyph', advanceRatio: 0.295, widthRatio: 1 },
      ']': { type: 'glyph', advanceRatio: 0.295, widthRatio: 1 },
      'A': { type: 'glyph', advanceRatio: 0.555, widthRatio: 0.92 },
      'B': { type: 'glyph', advanceRatio: 0.555, widthRatio: 0.92 },
      'C': { type: 'glyph', advanceRatio: 0.535, widthRatio: 0.90 },
      'D': { type: 'glyph', advanceRatio: 0.59, widthRatio: 1 },
      'E': { type: 'glyph', advanceRatio: 0.5, widthRatio: 1 },
      'e': { type: 'glyph', advanceRatio: 0.48, widthRatio: 1, heightRatio: 1.01  },
      'F': { type: 'glyph', advanceRatio: 0.5, widthRatio: 1 },
      'I': { type: 'glyph', advanceRatio: 0.277, widthRatio: 1 },
      'J': { type: 'glyph', advanceRatio: 0.445, widthRatio: 0.90 },
      'Q': { type: 'glyph', advanceRatio: 0.57, widthRatio: 1 },
      'W': { type: 'glyph', advanceRatio: 0.812, widthRatio: 1.1 },
      'R': { type: 'glyph', advanceRatio: 0.59, widthRatio: 1 },
      'T': { type: 'glyph', advanceRatio: 0.5, widthRatio: 0.90 },
      'O': { type: 'glyph', advanceRatio: 0.57, widthRatio: 1 },
      'G': { type: 'glyph', advanceRatio: 0.59, widthRatio: 1 },
      'H': { type: 'glyph', advanceRatio: 0.6101, widthRatio: 1 },
      'L': { type: 'glyph', advanceRatio: 0.481, widthRatio: 1 },
      'M': { type: 'glyph', advanceRatio: 0.755, widthRatio: 1 },
      'N': { type: 'glyph', advanceRatio: 0.6083, widthRatio: 0.99 },
      'S': { type: 'glyph', advanceRatio: 0.535, widthRatio: 1 },
      'X': { type: 'glyph', advanceRatio: 0.555, widthRatio: 1 },
      'Y': { type: 'glyph', advanceRatio: 0.555, widthRatio: 1 },
      'U': { type: 'glyph', advanceRatio: 0.609, widthRatio: 1 },
      'P': { type: 'glyph', advanceRatio: 0.555, widthRatio: 1 },
      'V': { type: 'glyph', advanceRatio: 0.535, widthRatio: 0.90 },
      'Z': { type: 'glyph', advanceRatio: 0.498, widthRatio: 1 },
      'a': { type: 'glyph', advanceRatio: 0.461, widthRatio: 1, heightRatio: 1.01 },
      's': { type: 'glyph', advanceRatio: 0.424, widthRatio: 1 },
      'd': { type: 'glyph', advanceRatio: 0.497, widthRatio: 1, heightRatio: 1.01 },
      'f': { type: 'glyph', advanceRatio: 0.275, widthRatio: 1 },
      'g': { type: 'glyph', advanceRatio: 0.497, widthRatio: 1 },
      'h': { type: 'glyph', advanceRatio: 0.497, widthRatio: 1 },
      'j': { type: 'glyph', advanceRatio: 0.259, widthRatio: 1 },
      'k': { type: 'glyph', advanceRatio: 0.443, widthRatio: 0.945, yRatio: 0.01, xRatio: 0.01},
      'l': { type: 'glyph', advanceRatio: 0.2585, widthRatio: 1, heightRatio: 0.96, yRatio: 0.04 },
      'w': { type: 'glyph', advanceRatio: 0.664, widthRatio: 1.1, heightRatio: 1.01},
      'r': { type: 'glyph', advanceRatio: 0.332, widthRatio: 1, heightRatio: 1.01, xRatio: 0.01 },
      't': { type: 'glyph', advanceRatio: 0.276, widthRatio: 0.90 },
      'u': { type: 'glyph', advanceRatio: 0.498, widthRatio: 1, heightRatio: 1.01 },
      'i': { type: 'glyph', advanceRatio: 0.258, widthRatio: 1 },
      'o': { type: 'glyph', advanceRatio: 0.48, widthRatio: 1 },
      'p': { type: 'glyph', advanceRatio: 0.498, widthRatio: 1 },
      'z': { type: 'glyph', advanceRatio: 0.387, widthRatio: 1 },
      'x': { type: 'glyph', advanceRatio: 0.442, widthRatio: 1 },
      'c': { type: 'glyph', advanceRatio: 0.442, widthRatio: 0.92, heightRatio: 1.01 },
      'v': { type: 'glyph', advanceRatio: 0.4425, widthRatio: 1, heightRatio: 1.01 },
      'b': { type: 'glyph', advanceRatio: 0.498, widthRatio: 1, yRatio: 0.01 },
      'n': { type: 'glyph', advanceRatio: 0.498, widthRatio: 1 },
      'm': { type: 'glyph', advanceRatio: 0.754, widthRatio: 1 },
      'y': { type: 'glyph', advanceRatio: 0.444, widthRatio: 1 },
      ' ': { type: 'glyph', advanceRatio: 0.295, widthRatio: 1 },
      '~': { type: 'glyph', advanceRatio: 1, widthRatio: 1.7 },
      '^': { type: 'glyph', advanceRatio: 0.498, widthRatio: 1.3 },
      '{': { type: 'glyph', advanceRatio: 0.498, widthRatio: 1.2 },
      '}': { type: 'glyph', advanceRatio: 0.498, widthRatio: 1.2 },
      '|': { type: 'glyph', advanceRatio: 0.498, widthRatio: 1 },
      '_': { type: 'glyph', advanceRatio: 0.498, widthRatio: 1.2 },
    }
  },
  'A': {
    family: '"Bitstream Vera Sans Mono", "Lucida Console", "Courier New", monospace',
    weight: 'normal',
    monospace: true,
    xOffset: -0.05,
    yOffset: 0,
    capRatio: 0.73438,
    advanceRatio: 0.60205,
    lineHeightRatio: 1.286,
    textBlockLineHeightRatio: 1,
    bitmap: { magStep: 9, magWidthStep: 5, capStep: 7, advStep: 6, maxMag: 10 },
    // Code 93's start/stop guard: an empty box at each end of the HRI, sized to the
    // cap height (capRatio) and sitting on the baseline, matching Labelary/Zebra.
    charRules: {
      [CODE93_GUARD_CHAR]: { type: 'box', widthRatio: 0.37, heightRatio: 0.63, yRatio: -0.58, lineRatio: 0.06, padRatio: 0.10 },
      // Code 11's start/stop guards: small hollow up-pointing triangles, both centered
      // at the same height (yRatio) so the larger stop triangle stays aligned with the
      // start one. Sizes follow Labelary: start ≈ 0.5·cap tall, stop ≈ 0.75·cap.
      [CODE11_GUARD_START_CHAR]: { type: 'triangle', widthRatio: 0.35, heightRatio: 0.37, yRatio: -0.26, xRatio: 0.025, lineRatio: 0.05, padRatio: 0.11 },
      [CODE11_GUARD_STOP_CHAR]: { type: 'triangle', widthRatio: 0.58, heightRatio: 0.58, yRatio: -0.26, xRatio: -0.025, lineRatio: 0.05, padRatio: 0.11 },
      '_': { type: 'glyph', advanceRatio: 0.602, widthRatio: 1, yRatio: -0.25, xRatio: 0.04 },
      '-': { type: 'glyph', advanceRatio: 0.602, widthRatio: 1.95, yRatio: -0.1, xRatio: -0.01 },
      ',': { type: 'glyph', xRatio: -0.04 },
      'B': { type: 'glyph', xRatio: -0.04 },
      'b': { type: 'glyph', xRatio: -0.04 },
      'R': { type: 'glyph', xRatio: -0.04 },
      'r': { type: 'glyph', xRatio: -0.09 },
      '{': { type: 'glyph', xRatio: 0.02 },
      '}': { type: 'glyph', xRatio: -0.08 },
      'k': { type: 'glyph', xRatio: -0.09 },
      'c': { type: 'glyph', xRatio: -0.09 },
      'F': { type: 'glyph', xRatio: -0.04 },
      'f': { type: 'glyph', xRatio: 0.02 },
      'E': { type: 'glyph', xRatio: -0.04 },
      'K': { type: 'glyph', xRatio: -0.04 },
      'P': { type: 'glyph', xRatio: -0.04 },
      'p': { type: 'glyph', xRatio: -0.03 },
      'm': { type: 'glyph', xRatio: -0.02 },
      'n': { type: 'glyph', xRatio: -0.02 },
      'L': { type: 'glyph', xRatio: -0.02 },
      'u': { type: 'glyph', xRatio: -0.02 },
      'v': { type: 'glyph', xRatio: -0.02 },
      'i': { type: 'glyph', xRatio: -0.02 },
      'h': { type: 'glyph', xRatio: -0.02 },
      'j': { type: 'glyph', xRatio: -0.05 },
      'y': { type: 'glyph', xRatio: 0.02 },
      't': { type: 'glyph', xRatio: 0.04 },
      'Z': { type: 'glyph', xRatio: -0.04 },
      'z': { type: 'glyph', xRatio: -0.04 },
      '1': { type: 'glyph', xRatio: -0.04 },
      '+': { type: 'glyph', xRatio: -0.02, yRatio: -0.14 },
      '*': { type: 'glyph', yRatio: 0.14 },
      ':': { type: 'glyph', xRatio: -0.1 },
      ';': { type: 'glyph', xRatio: -0.14 },
      '[': { type: 'glyph', xRatio: -0.04 },
      '!': { type: 'glyph', xRatio: -0.02 },
      '(': { type: 'glyph', xRatio: -0.03 },
      '`': { type: 'glyph', xRatio: 0.08 },
      '|': { type: 'glyph', xRatio: -0.02 },
      '?': { type: 'glyph', xRatio: -0.02 },
      '"': { type: 'glyph', xRatio: -0.02 },
      '$': { type: 'glyph', xRatio: -0.02 },
      '#': { type: 'glyph', xRatio: 0.01 },
      '\'': { type: 'glyph', xRatio: -0.06 },
    },
  },
  'B': {
    family: '"Bitstream Vera Sans Mono Bold", "Lucida Console", "Courier New", monospace',
    weight: 'bold',
    monospace: true,
    uppercase: true,
    xOffset: -0.07,
    yOffset: 0,
    capRatio: 0.73438,
    advanceRatio: 0.60205,
    lineHeightRatio: 1.0,
    textBlockLineHeightRatio: 0.77,
    bitmap: { magStep: 11, magWidthStep: 7, capStep: 11, advStep: 9, maxMag: 10 },
    charRules: {
      '_': { type: 'glyph', advanceRatio: 0.602, widthRatio: 0.8, yRatio: -0.25, xRatio: -0.02 },
      '-': { type: 'glyph', advanceRatio: 0.602, widthRatio: 1.5, yRatio: -0.11, xRatio: -0.02},
    }
  },
  'C': {
    family: '"Bitstream Vera Sans Mono", "Lucida Console", "Courier New", monospace',
    weight: 'normal',
    monospace: true,
    xOffset: -0.08,
    yOffset: 0,
    capRatio: 0.73438,
    advanceRatio: 0.60205,
    lineHeightRatio: 1.286,
    textBlockLineHeightRatio: 1,
    bitmap: { magStep: 18, magWidthStep: 10, capStep: 14, advStep: 12, maxMag: 10 },
    charRules: {
      '_': { type: 'glyph', advanceRatio: 0.602, widthRatio: 1, yRatio: -0.25, xRatio: 0.04 },
      '-': { type: 'glyph', advanceRatio: 0.602, widthRatio: 1.95, yRatio: -0.1, xRatio: -0.01},
    }
  },
  'D': {
    family: '"Bitstream Vera Sans Mono", "Lucida Console", "Courier New", monospace',
    weight: 'normal',
    monospace: true,
    xOffset: -0.07,
    yOffset: 0,
    capRatio: 0.73438,
    advanceRatio: 0.60205,
    lineHeightRatio: 1.286,
    textBlockLineHeightRatio: 1,
    bitmap: { magStep: 18, magWidthStep: 10, capStep: 14, advStep: 12, maxMag: 10 },
    charRules: {
      '_': { type: 'glyph', advanceRatio: 0.602, widthRatio: 1, yRatio: -0.25, xRatio: 0.04 },
      '-': { type: 'glyph', advanceRatio: 0.602, widthRatio: 1.95, yRatio: -0.1, xRatio: -0.01 },
      'B': { type: 'glyph', xRatio: -0.02 },
      'b': { type: 'glyph', xRatio: -0.02 },
      'D': { type: 'glyph', xRatio: -0.02 },
      'E': { type: 'glyph', xRatio: -0.02 },
      'F': { type: 'glyph', xRatio: -0.02 },
      'f': { type: 'glyph', xRatio: -0.02 },
      'K': { type: 'glyph', xRatio: -0.02 },
      'k': { type: 'glyph', xRatio: -0.04 },
      'L': { type: 'glyph', xRatio: -0.02 },
      'P': { type: 'glyph', xRatio: -0.03 },
      'p': { type: 'glyph', xRatio: -0.02 },
      'R': { type: 'glyph', xRatio: -0.03 },
      'r': { type: 'glyph', xRatio: -0.06 },
      'W': { type: 'glyph', xRatio: 0.01 },
      'w': { type: 'glyph', xRatio: 0.01 },
      'X': { type: 'glyph', xRatio: 0.02 },
      'Z': { type: 'glyph', xRatio: -0.02 },
    }
  },
  'E': {
    family: '"OCRB", "Lucida Console", monospace',
    weight: 'normal',
    monospace: true,
    xOffset: -0.15,
    yOffset: 3,
    capRatio: 0.73438,
    advanceRatio: 0.723,
    lineHeightRatio: 1.4,
    textBlockLineHeightRatio: 1,
    // Font E's ^FO cell top sits capPad dots per magnification above its cap ink.
    // Keep this anchor metric separate from the render-only yOffset.
    bitmap: { magStep: 28, magWidthStep: 15, capStep: 20, advStep: 20, maxMag: 10, capPad: 3 }
  },
  'F': {
    family: '"Bitstream Vera Sans Mono", "Lucida Console", monospace',
    weight: 'normal',
    monospace: true,
    xOffset: -0.12,
    yOffset: 0,
    capRatio: 0.73438,
    advanceRatio: 0.60205,
    lineHeightRatio: 1.238,
    textBlockLineHeightRatio: 0.91,
    bitmap: { magStep: 26, magWidthStep: 13, capStep: 21, advStep: 16, maxMag: 10 },
    charRules: {
      '_': { type: 'glyph', advanceRatio: 0.602, widthRatio: 0.95, yRatio: -0.25, xRatio: 0.06 },
      '-': { type: 'glyph', advanceRatio: 0.602, widthRatio: 1.4, yRatio: -0.045, xRatio: 0.01},
    }
  },
  'G': {
    family: '"Bitstream Vera Sans Mono", "Lucida Console", monospace',
    weight: 'normal',
    monospace: true,
    xOffset: -0.05,
    capRatio: 0.73438,
    advanceRatio: 0.60205,
    lineHeightRatio: 1.25,
    textBlockLineHeightRatio: 0.91,
    bitmap: { magStep: 60, magWidthStep: 40, capStep: 48, advStep: 48, maxMag: 10 },
    charRules: {
      '_': { type: 'glyph', advanceRatio: 0.602, widthRatio: 1, yRatio: -0.1, xRatio: 0.03 },
      '-': { type: 'glyph', advanceRatio: 0.602, widthRatio: 1.4, yRatio: -0.1, xRatio: -0.02},
    }
  },
  'H': {
    family: '"OCRA", "Lucida Console", monospace',
    weight: 'normal',
    monospace: true,
    xOffset: -0.164,
    yOffset: 0,
    filterLowercase: true,
    capRatio: 0.78125,
    advanceRatio: 0.723,
    lineHeightRatio: 1.0,
    textBlockLineHeightRatio: 0.77,
    bitmap: { magStep: 21, magWidthStep: 13, capStep: 21, advStep: 19, maxMag: 10 }
  },
  // Default fallback
  'default': {
    family: 'Arial, sans-serif',
    weight: 'normal',
    monospace: false,
    lineHeightRatio: 1.0,
    textBlockLineHeightRatio: 1.0,
    aspectRatio: 1.0
  }
};
