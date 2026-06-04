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
 * Font ID to descriptive label mapping (matches label-level dropdown)
 */
export const FONT_LABELS = {
  '0': '0 - Default',
  'A': 'A - 9×5',
  'B': 'B - 11×7',
  'C': 'C - 18×10',
  'D': 'D - 18×10',
  'E': 'E - 28×15',
  'F': 'F - 26×13',
  'G': 'G - 60×40',
  'H': 'H - 21×13'
};

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
      '_': { type: 'bar', padRatio: 0, lineRatio: 0.40, heightRatio: 0.10, yRatio: 0.93 },
      '|': { type: 'bar', padRatio: 0.215, lineRatio: 0.10, heightRatio: 0.80, yRatio: 0.06 },
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
      'a': { type: 'glyph', advanceRatio: 0.461, widthRatio: 1 },
      's': { type: 'glyph', advanceRatio: 0.424, widthRatio: 1 },
      'd': { type: 'glyph', advanceRatio: 0.497, widthRatio: 1 },
      'f': { type: 'glyph', advanceRatio: 0.275, widthRatio: 1 },
      'g': { type: 'glyph', advanceRatio: 0.497, widthRatio: 1 },
      'h': { type: 'glyph', advanceRatio: 0.497, widthRatio: 1 },
      'j': { type: 'glyph', advanceRatio: 0.259, widthRatio: 1 },
      'k': { type: 'glyph', advanceRatio: 0.444, widthRatio: 1 },
      'l': { type: 'glyph', advanceRatio: 0.2585, widthRatio: 1 },
      'w': { type: 'glyph', advanceRatio: 0.668, widthRatio: 1 },
      'r': { type: 'glyph', advanceRatio: 0.333, widthRatio: 1 },
      't': { type: 'glyph', advanceRatio: 0.276, widthRatio: 0.90 },
      'u': { type: 'glyph', advanceRatio: 0.498, widthRatio: 1 },
      'i': { type: 'glyph', advanceRatio: 0.258, widthRatio: 1 },
      'o': { type: 'glyph', advanceRatio: 0.48, widthRatio: 1 },
      'p': { type: 'glyph', advanceRatio: 0.498, widthRatio: 1 },
      'z': { type: 'glyph', advanceRatio: 0.387, widthRatio: 1 },
      'x': { type: 'glyph', advanceRatio: 0.442, widthRatio: 1 },
      'c': { type: 'glyph', advanceRatio: 0.442, widthRatio: 1 },
      'v': { type: 'glyph', advanceRatio: 0.442, widthRatio: 1 },
      'b': { type: 'glyph', advanceRatio: 0.497, widthRatio: 1 },
      'n': { type: 'glyph', advanceRatio: 0.498, widthRatio: 1 },
      'm': { type: 'glyph', advanceRatio: 0.754, widthRatio: 1 },
      'y': { type: 'glyph', advanceRatio: 0.444, widthRatio: 1 },
      ' ': { type: 'glyph', advanceRatio: 0.295, widthRatio: 1 },
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
    bitmap: { magStep: 9, magWidthStep: 5, capStep: 7, advStep: 6, maxMag: 10 }
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
    bitmap: { magStep: 11, magWidthStep: 7, capStep: 11, advStep: 9, maxMag: 10 }
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
    bitmap: { magStep: 18, magWidthStep: 10, capStep: 14, advStep: 12, maxMag: 10 }
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
    bitmap: { magStep: 18, magWidthStep: 10, capStep: 14, advStep: 12, maxMag: 10 }
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
    bitmap: { magStep: 28, magWidthStep: 15, capStep: 20, advStep: 20, maxMag: 10 }
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
    bitmap: { magStep: 26, magWidthStep: 13, capStep: 21, advStep: 16, maxMag: 10 }
  },
  'G': {
    family: '"Bitstream Vera Sans Mono", "Lucida Console", monospace',
    weight: 'normal',
    monospace: true,
    capRatio: 0.73438,
    advanceRatio: 0.60205,
    lineHeightRatio: 1.25,
    textBlockLineHeightRatio: 0.91,
    bitmap: { magStep: 60, magWidthStep: 40, capStep: 48, advStep: 48, maxMag: 10 }
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
