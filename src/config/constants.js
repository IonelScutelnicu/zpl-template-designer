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
    aspectRatio: 0.9  // Condensed - matches CG Triumvirate Bold Condensed
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

/**
 * Code128 Subset B patterns: [bar, space, bar, space, bar, space] widths
 * Each character is encoded as 6 elements (alternating bars/spaces) totaling 11 modules
 */
export const CODE128B_PATTERNS = [
  [2, 1, 2, 2, 2, 2], [2, 2, 2, 1, 2, 2], [2, 2, 2, 2, 2, 1], [1, 2, 1, 2, 2, 3], [1, 2, 1, 3, 2, 2],
  [1, 3, 1, 2, 2, 2], [1, 2, 2, 2, 1, 3], [1, 2, 2, 3, 1, 2], [1, 3, 2, 2, 1, 2], [2, 2, 1, 2, 1, 3],
  [2, 2, 1, 3, 1, 2], [2, 3, 1, 2, 1, 2], [1, 1, 2, 2, 3, 2], [1, 2, 2, 1, 3, 2], [1, 2, 2, 2, 3, 1],
  [1, 1, 3, 2, 2, 2], [1, 2, 3, 1, 2, 2], [1, 2, 3, 2, 2, 1], [2, 2, 3, 2, 1, 1], [2, 2, 1, 1, 3, 2],
  [2, 2, 1, 2, 3, 1], [2, 1, 3, 2, 1, 2], [2, 2, 3, 1, 1, 2], [3, 1, 2, 1, 3, 1], [3, 1, 1, 2, 2, 2],
  [3, 2, 1, 1, 2, 2], [3, 2, 1, 2, 2, 1], [3, 1, 2, 2, 1, 2], [3, 2, 2, 1, 1, 2], [3, 2, 2, 2, 1, 1],
  [2, 1, 2, 1, 2, 3], [2, 1, 2, 3, 2, 1], [2, 3, 2, 1, 2, 1], [1, 1, 1, 3, 2, 3], [1, 3, 1, 1, 2, 3],
  [1, 3, 1, 3, 2, 1], [1, 1, 2, 3, 1, 3], [1, 3, 2, 1, 1, 3], [1, 3, 2, 3, 1, 1], [2, 1, 1, 3, 1, 3],
  [2, 3, 1, 1, 1, 3], [2, 3, 1, 3, 1, 1], [1, 1, 2, 1, 3, 3], [1, 1, 2, 3, 3, 1], [1, 3, 2, 1, 3, 1],
  [1, 1, 3, 1, 2, 3], [1, 1, 3, 3, 2, 1], [1, 3, 3, 1, 2, 1], [3, 1, 3, 1, 2, 1], [2, 1, 1, 3, 3, 1],
  [2, 3, 1, 1, 3, 1], [2, 1, 3, 1, 1, 3], [2, 1, 3, 3, 1, 1], [2, 1, 3, 1, 3, 1], [3, 1, 1, 1, 2, 3],
  [3, 1, 1, 3, 2, 1], [3, 3, 1, 1, 2, 1], [3, 1, 2, 1, 1, 3], [3, 1, 2, 3, 1, 1], [3, 3, 2, 1, 1, 1],
  [3, 1, 4, 1, 1, 1], [2, 2, 1, 4, 1, 1], [4, 3, 1, 1, 1, 1], [1, 1, 1, 2, 2, 4], [1, 1, 1, 4, 2, 2],
  [1, 2, 1, 1, 2, 4], [1, 2, 1, 4, 2, 1], [1, 4, 1, 1, 2, 2], [1, 4, 1, 2, 2, 1], [1, 1, 2, 2, 1, 4],
  [1, 1, 2, 4, 1, 2], [1, 2, 2, 1, 1, 4], [1, 2, 2, 4, 1, 1], [1, 4, 2, 1, 1, 2], [1, 4, 2, 2, 1, 1],
  [2, 4, 1, 2, 1, 1], [2, 2, 1, 1, 1, 4], [4, 1, 3, 1, 1, 1], [2, 4, 1, 1, 1, 2], [1, 3, 4, 1, 1, 1],
  [1, 1, 1, 2, 4, 2], [1, 2, 1, 1, 4, 2], [1, 2, 1, 2, 4, 1], [1, 1, 4, 2, 1, 2], [1, 2, 4, 1, 1, 2],
  [1, 2, 4, 2, 1, 1], [4, 1, 1, 2, 1, 2], [4, 2, 1, 1, 1, 2], [4, 2, 1, 2, 1, 1], [2, 1, 2, 1, 4, 1],
  [2, 1, 4, 1, 2, 1], [4, 1, 2, 1, 2, 1], [1, 1, 1, 1, 4, 3], [1, 1, 1, 3, 4, 1], [1, 3, 1, 1, 4, 1],
  [1, 1, 4, 1, 1, 3], [1, 1, 4, 3, 1, 1], [4, 1, 1, 1, 1, 3], [4, 1, 1, 3, 1, 1], [1, 1, 3, 1, 4, 1],
  [1, 1, 4, 1, 3, 1], [3, 1, 1, 1, 4, 1], [4, 1, 1, 1, 3, 1], [2, 1, 1, 4, 1, 2], [2, 1, 1, 2, 1, 4],
  [2, 1, 1, 2, 3, 2], [2, 3, 3, 1, 1, 1] // Value 106 (STOP - 6 elements, needs final 2-module bar)
];

/**
 * START_B code value (used for checksum calculation)
 */
export const START_B = 104;
