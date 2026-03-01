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
 * ZPL font mapping - approximations using system fonts with accurate aspect ratios
 * Based on Zebra ZPL standard built-in fonts (A-H and 0)
 */
export const ZPL_FONTS = {
  '0': {
    family: '"Roboto Condensed", "Arial Narrow", "Helvetica Condensed", Arial, sans-serif',
    weight: 'bold',
    monospace: false,
    baseHeight: 18,
    baseWidth: 10,
    aspectRatio: 0.9  // Condensed - matches CG Triumvirate Bold Condensed
  },
  'A': {
    family: '"Lucida Console", "Courier New", monospace',
    weight: 'normal',
    monospace: true,
    baseHeight: 9,
    baseWidth: 5,
    aspectRatio: 0.556  // 5/9
  },
  'B': {
    family: '"Lucida Console", "Courier New", monospace',
    weight: 'normal',
    monospace: true,
    baseHeight: 11,
    baseWidth: 7,
    aspectRatio: 0.636  // 7/11
  },
  'C': {
    family: '"Lucida Console", "Courier New", monospace',
    weight: 'normal',
    monospace: true,
    baseHeight: 18,
    baseWidth: 10,
    aspectRatio: 0.556  // 10/18
  },
  'D': {
    family: '"Lucida Console", "Courier New", monospace',
    weight: 'normal',
    monospace: true,
    baseHeight: 18,
    baseWidth: 10,
    aspectRatio: 0.556  // 10/18 (same as C, backward compat)
  },
  'E': {
    family: '"OCR A Std", "OCR-A", "Lucida Console", monospace',
    weight: 'normal',
    monospace: true,
    baseHeight: 28,
    baseWidth: 15,
    aspectRatio: 0.536  // 15/28 (OCR-A style)
  },
  'F': {
    family: '"OCR B Std", "OCR-B", "Lucida Console", monospace',
    weight: 'normal',
    monospace: true,
    baseHeight: 26,
    baseWidth: 15,
    aspectRatio: 0.577  // 15/26 (OCR-B style)
  },
  'G': {
    family: '"Lucida Console", "Courier New", monospace',
    weight: 'normal',
    monospace: true,
    baseHeight: 60,
    baseWidth: 40,
    aspectRatio: 0.667  // 40/60
  },
  'H': {
    family: '"OCR A Std", "OCR-A", "Lucida Console", monospace',
    weight: 'normal',
    monospace: true,
    baseHeight: 21,
    baseWidth: 13,
    aspectRatio: 0.619  // 13/21
  },
  // Default fallback
  'default': {
    family: 'Arial, sans-serif',
    weight: 'normal',
    monospace: false,
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
