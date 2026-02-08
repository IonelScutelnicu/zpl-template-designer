// Barcode Encoding Utilities for Code128

import { CODE128B_PATTERNS, START_B } from '../config/constants.js';

/**
 * Calculate Code128 checksum (modulo 103)
 * @param {string} data - Data to encode
 * @returns {number} Checksum value
 */
export function calculateCode128Checksum(data) {
  let checksum = START_B; // Start with START_B value
  for (let i = 0; i < data.length; i++) {
    const charCode = data.charCodeAt(i);
    // Map ASCII to Code128 value (space = 32 maps to value 0)
    const value = charCode - 32;
    checksum += value * (i + 1);
  }
  return checksum % 103;
}

/**
 * Encode data into Code128 Subset B bar patterns
 * @param {string} data - Data to encode
 * @returns {Array} Array of bar patterns
 */
export function encodeCode128B(data) {
  const patterns = [];

  // Add START_B code (value 104)
  patterns.push(CODE128B_PATTERNS[104]);

  // Add data characters
  for (let i = 0; i < data.length; i++) {
    const charCode = data.charCodeAt(i);
    // Map ASCII to Code128 value (space = 32 maps to value 0)
    const value = charCode - 32;

    // Handle unsupported characters (use space as fallback)
    if (value < 0 || value >= 95) {
      patterns.push(CODE128B_PATTERNS[0]); // Space
    } else {
      patterns.push(CODE128B_PATTERNS[value]);
    }
  }

  // Add check digit
  const checksum = calculateCode128Checksum(data);
  patterns.push(CODE128B_PATTERNS[checksum]);

  // Add STOP code (value 106)
  patterns.push(CODE128B_PATTERNS[106]);

  return patterns;
}

/**
 * Calculate accurate Code128 barcode width (bars only, excluding quiet zones)
 * Formula: (35 + 11n) × moduleWidth
 * Breakdown: 11 (start) + 11n (data) + 11 (check) + 11 (stop pattern) + 2 (termination bar) = 35 + 11n
 * Note: Quiet zones (10 modules each side) are implicit white space, not part of barcode width
 * @param {string} data - Data to encode
 * @param {number} moduleWidth - Width of narrowest bar
 * @returns {number} Total barcode width in dots
 */
export function calculateCode128Width(data, moduleWidth) {
  const totalModules = 35 + (11 * data.length);
  return totalModules * moduleWidth;
}
