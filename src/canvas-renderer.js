// Canvas Renderer for ZPL Template Creator
// Renders all element types on HTML5 Canvas

import {
  calculateQRVersion,
  qrVersionToModules
} from './elements/QRCodeElement.js';

// ZPL font mapping - approximations using system fonts with accurate aspect ratios
// Based on Zebra ZPL standard built-in fonts (A-H and 0)
const ZPL_FONTS = {
  '0': {
    family: '"Arial Narrow", "Helvetica Condensed", Arial, sans-serif',
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

// Code128 Subset B patterns: [bar, space, bar, space, bar, space] widths
// Each character is encoded as 6 elements (alternating bars/spaces) totaling 11 modules
const CODE128B_PATTERNS = [
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

// START_B code value (used for checksum calculation)
const START_B = 104;

/**
 * Calculate Code128 checksum (modulo 103)
 * @param {string} data - Data to encode
 * @returns {number} Checksum value
 */
function calculateCode128Checksum(data) {
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
function encodeCode128B(data) {
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
function calculateCode128Width(data, moduleWidth) {
  const totalModules = 35 + (11 * data.length);
  return totalModules * moduleWidth;
}

export class CanvasRenderer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');

    // Disable smoothing for more bitmap-like rendering
    this.ctx.imageSmoothingEnabled = false;

    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.showGrid = false; // Hide grid to match API preview look
  }

  /**
   * Render all elements on canvas
   * @param {Array} elements - Array of ZPLElement objects
   * @param {Object} labelSettings - Label configuration
   */
  renderCanvas(elements, labelSettings, selectedElement = null) {
    const { width, height, dpmm, homeX = 0, homeY = 0, labelTop = 0, printOrientation = 'N' } = labelSettings;

    // Store offsets and orientation for use in element drawing and coordinate conversion
    this.homeX = homeX;
    this.homeY = homeY;
    this.labelTop = labelTop;
    this.printOrientation = printOrientation;

    // Calculate label dimensions in dots
    const labelWidthDots = width * dpmm;
    const labelHeightDots = height * dpmm;

    // Store label dimensions for coordinate conversion
    this.labelWidthDots = labelWidthDots;
    this.labelHeightDots = labelHeightDots;

    // Render at 1:1 scale to match API output (1 pixel = 1 dot)
    this.scale = 1;

    // Set canvas actual size (no scaling)
    this.canvas.width = labelWidthDots;
    this.canvas.height = labelHeightDots;

    // Calculate offsets to center canvas
    this.offsetX = 0;
    this.offsetY = 0;

    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw white label background
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.fillRect(0, 0, labelWidthDots, labelHeightDots);

    // Draw grid if enabled
    if (this.showGrid) {
      this.drawGrid(labelWidthDots, labelHeightDots, dpmm);
    }

    // Draw offset zones with horizontal stripe pattern
    this.drawOffsetZones(labelWidthDots, labelHeightDots);

    // Apply orientation transformation for elements
    // For inverted (I) orientation, flip the entire canvas 180°
    if (printOrientation === 'I') {
      this.ctx.save();
      // Rotate 180° around the center by translating and scaling
      this.ctx.translate(labelWidthDots, labelHeightDots);
      this.ctx.scale(-1, -1);
    }

    // Render each element
    elements.forEach(element => {
      this.drawElement(element, labelSettings, selectedElement);
    });

    // Restore context if transformed
    if (printOrientation === 'I') {
      this.ctx.restore();
    }
  }

  /**
   * Draw grid overlay
   */
  drawGrid(labelWidthDots, labelHeightDots, dpmm) {
    const gridSpacing = 5 * dpmm; // 5mm grid spacing
    const majorGridSpacing = 10 * dpmm; // 10mm major grid lines

    this.ctx.save();

    // Minor grid lines (5mm)
    this.ctx.strokeStyle = '#e2e8f0';
    this.ctx.lineWidth = 0.5;

    // Vertical lines
    for (let x = gridSpacing; x < labelWidthDots; x += gridSpacing) {
      const scaledX = x * this.scale;
      this.ctx.beginPath();
      this.ctx.moveTo(scaledX, 0);
      this.ctx.lineTo(scaledX, labelHeightDots * this.scale);
      this.ctx.stroke();
    }

    // Horizontal lines
    for (let y = gridSpacing; y < labelHeightDots; y += gridSpacing) {
      const scaledY = y * this.scale;
      this.ctx.beginPath();
      this.ctx.moveTo(0, scaledY);
      this.ctx.lineTo(labelWidthDots * this.scale, scaledY);
      this.ctx.stroke();
    }

    // Major grid lines (10mm)
    this.ctx.strokeStyle = '#cbd5e1';
    this.ctx.lineWidth = 1;

    // Vertical major lines
    for (let x = majorGridSpacing; x < labelWidthDots; x += majorGridSpacing) {
      const scaledX = x * this.scale;
      this.ctx.beginPath();
      this.ctx.moveTo(scaledX, 0);
      this.ctx.lineTo(scaledX, labelHeightDots * this.scale);
      this.ctx.stroke();
    }

    // Horizontal major lines
    for (let y = majorGridSpacing; y < labelHeightDots; y += majorGridSpacing) {
      const scaledY = y * this.scale;
      this.ctx.beginPath();
      this.ctx.moveTo(0, scaledY);
      this.ctx.lineTo(labelWidthDots * this.scale, scaledY);
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  /**
   * Draw offset zones with diagonal stripe pattern
   * Shows the area affected by homeX, homeY, and labelTop offsets
   */
  drawOffsetZones(labelWidthDots, labelHeightDots) {
    const totalYOffset = this.homeY + this.labelTop;

    // Only draw if there are offsets
    if (this.homeX <= 0 && totalYOffset <= 0) return;

    this.ctx.save();

    // Stripe pattern settings
    const stripeSpacing = 8; // pixels between stripes
    const stripeColor = '#fca5a5'; // Light red color

    this.ctx.strokeStyle = stripeColor;
    this.ctx.lineWidth = 1;

    // Draw left offset zone (homeX)
    if (this.homeX > 0) {
      const zoneWidth = this.homeX * this.scale;
      const zoneHeight = labelHeightDots * this.scale;

      // Clip to the left zone
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.rect(0, 0, zoneWidth, zoneHeight);
      this.ctx.clip();

      // Draw diagonal stripes (45 degrees)
      const maxDimension = zoneWidth + zoneHeight;
      for (let offset = -maxDimension; offset < maxDimension; offset += stripeSpacing) {
        this.ctx.beginPath();
        this.ctx.moveTo(offset, 0);
        this.ctx.lineTo(offset + zoneHeight, zoneHeight);
        this.ctx.stroke();
      }
      this.ctx.restore();

      // Draw right edge border of the offset zone
      this.ctx.strokeStyle = '#f87171';
      this.ctx.setLineDash([4, 2]);
      this.ctx.beginPath();
      this.ctx.moveTo(zoneWidth, 0);
      this.ctx.lineTo(zoneWidth, zoneHeight);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
      this.ctx.strokeStyle = stripeColor;
    }

    // Draw top offset zone (homeY + labelTop)
    if (totalYOffset > 0) {
      const zoneWidth = labelWidthDots * this.scale;
      const zoneHeight = totalYOffset * this.scale;

      // Clip to the top zone
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.rect(0, 0, zoneWidth, zoneHeight);
      this.ctx.clip();

      // Draw diagonal stripes (45 degrees)
      const maxDimension = zoneWidth + zoneHeight;
      for (let offset = -maxDimension; offset < maxDimension; offset += stripeSpacing) {
        this.ctx.beginPath();
        this.ctx.moveTo(offset, 0);
        this.ctx.lineTo(offset + zoneHeight, zoneHeight);
        this.ctx.stroke();
      }
      this.ctx.restore();

      // Draw bottom edge border of the offset zone
      this.ctx.strokeStyle = '#f87171';
      this.ctx.setLineDash([4, 2]);
      this.ctx.beginPath();
      this.ctx.moveTo(0, zoneHeight);
      this.ctx.lineTo(zoneWidth, zoneHeight);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    }

    this.ctx.restore();
  }

  /**
   * Draw a single element on canvas
   */
  drawElement(element, labelSettings, selectedElement) {
    const isSelected = selectedElement && element.id === selectedElement.id;

    this.ctx.save();

    // Draw element based on type
    switch (element.type) {
      case 'TEXT':
        this.drawText(element, labelSettings);
        break;
      case 'TEXTBLOCK':
        this.drawTextBlock(element, labelSettings);
        break;
      case 'BARCODE':
        this.drawBarcode(element);
        break;
      case 'QRCODE':
        this.drawQRCode(element);
        break;
      case 'BOX':
        this.drawBox(element);
        break;
      case 'LINE':
        this.drawLine(element);
        break;
    }

    // Draw selection indicator
    if (isSelected) {
      this.drawSelectionIndicator(element, labelSettings);
    }

    this.ctx.restore();
  }

  /**
   * Draw TEXT element
   */
  drawText(element, labelSettings) {
    const x = (element.x + this.homeX) * this.scale;
    const y = (element.y + this.homeY + this.labelTop) * this.scale;
    // Use label default if element fontSize is 0 or not set
    const rawFontSize = element.fontSize || labelSettings.defaultFontHeight || 20;
    const fontSize = rawFontSize * this.scale;

    this.ctx.save();

    const text = element.previewText || '';

    // Get font ID from element or use label's default
    const fontId = element.fontId || labelSettings.fontId || '0';
    const fontConfig = ZPL_FONTS[fontId] || ZPL_FONTS['default'];
    const font = `${fontConfig.weight} ${fontSize}px ${fontConfig.family}`;

    // Calculate horizontal scale for font aspect ratio
    // Use label default if element fontWidth is 0 or not set
    const rawFontWidth = element.fontWidth || labelSettings.defaultFontWidth || 20;
    const fontWidth = rawFontWidth * this.scale;
    const scaleX = fontWidth / fontSize;

    this.ctx.font = font;
    this.ctx.textBaseline = 'top';
    // Measure text width at unscaled size, then apply horizontal scale
    const measuredWidth = this.ctx.measureText(text).width;
    const textWidth = measuredWidth * scaleX;
    const textHeight = fontSize;

    const drawTransformedText = (ctx, color, offsetX = 0, offsetY = 0) => {
      ctx.save();
      ctx.fillStyle = color;
      ctx.font = font;
      ctx.textBaseline = 'top';

      if (element.orientation === 'R') {
        ctx.translate(x + textHeight + offsetX, y + offsetY);
        ctx.rotate(Math.PI / 2);
        ctx.scale(scaleX, 1);
      } else if (element.orientation === 'I') {
        ctx.translate(x + textWidth + offsetX, y + textHeight + offsetY);
        ctx.rotate(Math.PI);
        ctx.scale(scaleX, 1);
      } else if (element.orientation === 'B') {
        ctx.translate(x + offsetX, y + textWidth + offsetY);
        ctx.rotate(-Math.PI / 2);
        ctx.scale(scaleX, 1);
      } else {
        ctx.translate(x + offsetX, y + offsetY);
        ctx.scale(scaleX, 1);
      }

      ctx.fillText(text, 0, 0);
      ctx.restore();
    };

    const createReverseOverlay = (bboxX, bboxY, bboxW, bboxH) => {
      const left = Math.max(0, Math.floor(bboxX));
      const top = Math.max(0, Math.floor(bboxY));
      const right = Math.min(this.canvas.width, Math.ceil(bboxX + bboxW));
      const bottom = Math.min(this.canvas.height, Math.ceil(bboxY + bboxH));
      const width = Math.max(0, right - left);
      const height = Math.max(0, bottom - top);

      if (width === 0 || height === 0) return null;

      const imageData = this.ctx.getImageData(left, top, width, height);
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = width;
      maskCanvas.height = height;
      const maskCtx = maskCanvas.getContext('2d');
      const maskData = maskCtx.createImageData(width, height);
      const src = imageData.data;
      const dst = maskData.data;
      const threshold = 40 * 3;

      for (let i = 0; i < src.length; i += 4) {
        const brightness = src[i] + src[i + 1] + src[i + 2];
        if (brightness < threshold) {
          dst[i + 3] = 255;
        }
      }

      maskCtx.putImageData(maskData, 0, 0);

      const textCanvas = document.createElement('canvas');
      textCanvas.width = width;
      textCanvas.height = height;
      const textCtx = textCanvas.getContext('2d');
      drawTransformedText(textCtx, '#FFFFFF', -left, -top);
      textCtx.globalCompositeOperation = 'destination-in';
      textCtx.drawImage(maskCanvas, 0, 0);

      return { canvas: textCanvas, x: left, y: top };
    };

    let overlay = null;
    if (element.reverse) {
      if (element.orientation === 'R' || element.orientation === 'B') {
        overlay = createReverseOverlay(x, y, textHeight, textWidth);
      } else {
        overlay = createReverseOverlay(x, y, textWidth, textHeight);
      }
    }

    // Apply rotation based on orientation (ZPL: N=0°, R=90° CW, I=180°, B=270° CW)
    drawTransformedText(this.ctx, '#000000');
    if (overlay) {
      this.ctx.drawImage(overlay.canvas, overlay.x, overlay.y);
    }

    this.ctx.restore();
  }

  /**
   * Draw TEXTBLOCK element
   */
  drawTextBlock(element, labelSettings) {
    const x = (element.x + this.homeX) * this.scale;
    const y = (element.y + this.homeY + this.labelTop) * this.scale;
    // Use label default if element fontSize is 0 or not set
    const rawFontSize = element.fontSize || labelSettings.defaultFontHeight || 20;
    const fontSize = rawFontSize * this.scale;
    const blockWidth = element.blockWidth * this.scale;

    // Get font ID from element or use label's default
    const fontId = element.fontId || labelSettings.fontId || '0';
    const fontConfig = ZPL_FONTS[fontId] || ZPL_FONTS['default'];
    const font = `${fontConfig.weight} ${fontSize}px ${fontConfig.family}`;

    // Calculate horizontal scale for font aspect ratio
    // Use label default if element fontWidth is 0 or not set
    const rawFontWidth = element.fontWidth || labelSettings.defaultFontWidth || 20;
    const fontWidth = rawFontWidth * this.scale;
    const scaleX = fontWidth / fontSize;

    this.ctx.font = font;
    this.ctx.textBaseline = 'top';

    const text = element.previewText || '';

    // Simple text wrapping - account for horizontal scaling when measuring
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    words.forEach(word => {
      const testLine = currentLine + (currentLine ? ' ' : '') + word;
      const metrics = this.ctx.measureText(testLine);
      // Apply scaleX to measured width for accurate wrapping
      const scaledWidth = metrics.width * scaleX;

      if (scaledWidth > blockWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    });

    if (currentLine) {
      lines.push(currentLine);
    }

    // Draw lines (respect maxLines)
    const maxLines = element.maxLines || lines.length;
    const lineHeight = fontSize * 1.2;
    const blockHeight = lineHeight * maxLines;

    const createReverseOverlay = () => {
      const left = Math.max(0, Math.floor(x));
      const top = Math.max(0, Math.floor(y));
      const right = Math.min(this.canvas.width, Math.ceil(x + blockWidth));
      const bottom = Math.min(this.canvas.height, Math.ceil(y + blockHeight));
      const width = Math.max(0, right - left);
      const height = Math.max(0, bottom - top);
      if (width === 0 || height === 0) return null;

      const imageData = this.ctx.getImageData(left, top, width, height);
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = width;
      maskCanvas.height = height;
      const maskCtx = maskCanvas.getContext('2d');
      const maskData = maskCtx.createImageData(width, height);
      const src = imageData.data;
      const dst = maskData.data;
      const threshold = 40 * 3;

      for (let i = 0; i < src.length; i += 4) {
        const brightness = src[i] + src[i + 1] + src[i + 2];
        if (brightness < threshold) {
          dst[i + 3] = 255;
        }
      }

      maskCtx.putImageData(maskData, 0, 0);

      const textCanvas = document.createElement('canvas');
      textCanvas.width = width;
      textCanvas.height = height;
      const textCtx = textCanvas.getContext('2d');
      textCtx.font = font;
      textCtx.textBaseline = 'top';
      textCtx.fillStyle = '#FFFFFF';

      lines.slice(0, maxLines).forEach((line, i) => {
        const lineY = y - top + (i * lineHeight);
        const measuredWidth = textCtx.measureText(line).width * scaleX;

        let lineX = x - left;
        if (element.justification === 'C') {
          lineX = x - left + (blockWidth - measuredWidth) / 2;
        } else if (element.justification === 'R') {
          lineX = x - left + blockWidth - measuredWidth;
        }

        // Apply horizontal scaling for text rendering
        textCtx.save();
        textCtx.translate(lineX, lineY);
        textCtx.scale(scaleX, 1);
        textCtx.fillText(line, 0, 0);
        textCtx.restore();
      });

      textCtx.globalCompositeOperation = 'destination-in';
      textCtx.drawImage(maskCanvas, 0, 0);

      return { canvas: textCanvas, x: left, y: top };
    };

    const overlay = element.reverse ? createReverseOverlay() : null;
    this.ctx.fillStyle = '#000000';

    lines.slice(0, maxLines).forEach((line, i) => {
      const measuredWidth = this.ctx.measureText(line).width * scaleX;
      const lineY = y + (i * lineHeight);
      const isLastLine = (i === lines.slice(0, maxLines).length - 1);

      // Handle justified text
      if (element.justification === 'J') {
        const words = line.split(/\s+/).filter(w => w.length > 0);

        // Only justify if: not last line AND has multiple words AND line is shorter than block width
        if (!isLastLine && words.length > 1 && measuredWidth < blockWidth) {
          // Measure individual words (without scaling first)
          const wordWidths = words.map(word => this.ctx.measureText(word).width * scaleX);
          const totalWordWidth = wordWidths.reduce((sum, w) => sum + w, 0);

          // Calculate space to distribute between words
          const availableSpace = blockWidth - totalWordWidth;
          const spaceBetweenWords = availableSpace / (words.length - 1);

          // Draw words with calculated spacing
          let currentX = x;
          words.forEach((word, wordIndex) => {
            this.ctx.save();
            this.ctx.translate(currentX, lineY);
            this.ctx.scale(scaleX, 1);
            this.ctx.fillText(word, 0, 0);
            this.ctx.restore();
            currentX += wordWidths[wordIndex] + spaceBetweenWords;
          });
          return; // Skip the normal rendering below
        }
        // Last line or single word: left-align (fall through)
      }

      let lineX = x;
      // Apply justification using scaled width
      if (element.justification === 'C') {
        lineX = x + (blockWidth - measuredWidth) / 2;
      } else if (element.justification === 'R') {
        lineX = x + blockWidth - measuredWidth;
      }

      // Apply horizontal scaling for text rendering
      this.ctx.save();
      this.ctx.translate(lineX, lineY);
      this.ctx.scale(scaleX, 1);
      this.ctx.fillText(line, 0, 0);
      this.ctx.restore();
    });

    if (overlay) {
      this.ctx.drawImage(overlay.canvas, overlay.x, overlay.y);
    }
  }

  /**
   * Draw BARCODE element (Code128 Subset B)
   */
  drawBarcode(element) {
    const x = (element.x + this.homeX) * this.scale;
    const y = (element.y + this.homeY + this.labelTop) * this.scale;
    const height = element.height * this.scale;

    // Calculate module width (narrowest bar width)
    const moduleWidth = element.width * this.scale;

    // Encode data into Code128 bar patterns
    const data = element.previewData || '';
    const patterns = encodeCode128B(data);

    // Calculate total barcode width (bars only, no quiet zones)
    const totalWidth = calculateCode128Width(data, element.width) * this.scale;

    // Start drawing bars at x (quiet zones are implicit white space)
    let currentX = x;

    // Draw encoded patterns
    this.ctx.fillStyle = '#000000';
    let isBar = true; // Start with a bar

    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i];

      // Draw each element in the pattern
      for (let j = 0; j < pattern.length; j++) {
        const elementWidth = pattern[j] * moduleWidth;

        if (isBar) {
          // Draw bar (black)
          this.ctx.fillRect(currentX, y, elementWidth, height);
        }
        // Space (white) - don't draw, just advance position

        currentX += elementWidth;
        isBar = !isBar;
      }

      // Don't reset isBar - patterns flow together continuously
    }

    // Add final termination bar (2 modules) for stop code
    this.ctx.fillRect(currentX, y, 2 * moduleWidth, height);

    // Draw barcode text below centered at actual width (if enabled)
    if (element.showText) {
      this.ctx.fillStyle = '#000000';
      this.ctx.font = `${18 * this.scale}px Arial, sans-serif`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'top';
      this.ctx.fillText(data, x + totalWidth / 2, y + height + 4 + (2 * this.scale));
    }
  }

  /**
   * Draw QRCODE element (placeholder)
   */
  drawQRCode(element) {
    const x = (element.x + this.homeX) * this.scale;
    const y = (element.y + this.homeY + this.labelTop) * this.scale;

    // Calculate QR code size based on data length and error correction
    const dataLength = element.previewData.length;
    const version = calculateQRVersion(dataLength, element.errorCorrection);
    const modules = qrVersionToModules(version);
    const size = modules * element.magnification * this.scale;

    // Draw white background first (no border)
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.fillRect(x, y, size, size);

    // Draw simplified QR pattern
    this.ctx.fillStyle = '#000000';
    const moduleSize = size / modules;

    const seed = this.hashString(`${element.previewData}|${element.errorCorrection}|${element.model}|${element.magnification}`);
    const rng = this.createRng(seed);

    // Draw deterministic QR-like pattern
    for (let row = 0; row < modules; row++) {
      for (let col = 0; col < modules; col++) {
        if (rng() > 0.5) {
          this.ctx.fillRect(
            x + col * moduleSize,
            y + row * moduleSize,
            moduleSize,
            moduleSize
          );
        }
      }
    }

    // Draw positioning markers (7 modules each)
    const markerSize = moduleSize * 7;
    this.drawQRPositioningMarker(x, y, markerSize);
    this.drawQRPositioningMarker(x + size - markerSize, y, markerSize);
    this.drawQRPositioningMarker(x, y + size - markerSize, markerSize);
  }

  /**
   * Draw QR code positioning marker (corner squares)
   */
  drawQRPositioningMarker(x, y, size) {
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(x, y, size, size);

    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.fillRect(x + size * 0.2, y + size * 0.2, size * 0.6, size * 0.6);

    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(x + size * 0.35, y + size * 0.35, size * 0.3, size * 0.3);
  }

  // Simple deterministic hash for stable QR preview patterns
  hashString(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  // Xorshift32 RNG for predictable pseudo-random values
  createRng(seed) {
    let state = seed || 1;
    return () => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) / 4294967296;
    };
  }

  /**
   * Draw BOX element
   */
  drawBox(element) {
    const x = (element.x + this.homeX) * this.scale;
    const y = (element.y + this.homeY + this.labelTop) * this.scale;
    const width = element.width * this.scale;
    const height = element.height * this.scale;
    const thickness = element.thickness * this.scale;
    const rounding = element.rounding * this.scale;

    this.ctx.strokeStyle = element.color === 'B' ? '#000000' : '#FFFFFF';
    this.ctx.fillStyle = element.color === 'B' ? '#000000' : '#FFFFFF';

    if (thickness >= width || thickness >= height) {
      // Filled box (thickness fills entire box)
      if (rounding > 0) {
        this.roundRect(x, y, width, height, rounding, true, false);
      } else {
        this.ctx.fillRect(x, y, width, height);
      }
    } else {
      // Outlined box with inset stroke
      // Adjust the stroke path so the thickness stays inside the element bounds
      const insetX = x + thickness / 2;
      const insetY = y + thickness / 2;
      const insetWidth = width - thickness;
      const insetHeight = height - thickness;

      this.ctx.lineWidth = thickness;

      if (rounding > 0) {
        // Adjust rounding to be relative to inset dimensions
        const insetRounding = Math.max(0, rounding - thickness / 2);
        this.roundRect(insetX, insetY, insetWidth, insetHeight, insetRounding, false, true);
      } else {
        this.ctx.strokeRect(insetX, insetY, insetWidth, insetHeight);
      }
    }
  }

  /**
   * Draw LINE element
   */
  drawLine(element) {
    const x = (element.x + this.homeX) * this.scale;
    const y = (element.y + this.homeY + this.labelTop) * this.scale;

    let w, h;
    if (element.orientation === 'V') {
      w = element.thickness;
      h = element.width;
    } else {
      w = element.width;
      h = element.thickness;
    }

    const width = w * this.scale;
    const height = h * this.scale;

    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(x, y, width, height);
  }

  /**
   * Draw rounded rectangle
   */
  roundRect(x, y, width, height, radius, fill, stroke) {
    this.ctx.beginPath();
    this.ctx.moveTo(x + radius, y);
    this.ctx.lineTo(x + width - radius, y);
    this.ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    this.ctx.lineTo(x + width, y + height - radius);
    this.ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    this.ctx.lineTo(x + radius, y + height);
    this.ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    this.ctx.lineTo(x, y + radius);
    this.ctx.quadraticCurveTo(x, y, x + radius, y);
    this.ctx.closePath();

    if (fill) {
      this.ctx.fill();
    }
    if (stroke) {
      this.ctx.stroke();
    }
  }

  /**
   * Draw selection indicator around element
   */
  drawSelectionIndicator(element, labelSettings) {
    let x, y, width, height;
    if (element.type === 'TEXT' && labelSettings) {
      // Use actual canvas measurement for accurate TEXT bounds
      const rawFontSize = element.fontSize || labelSettings.defaultFontHeight || 20;
      const fontSize = rawFontSize * this.scale;
      const rawFontWidth = element.fontWidth || labelSettings.defaultFontWidth || 20;
      const fontWidth = rawFontWidth * this.scale;
      const scaleX = fontWidth / fontSize;
      const fontId = element.fontId || labelSettings.fontId || '0';
      const fontConfig = ZPL_FONTS[fontId] || ZPL_FONTS['default'];
      this.ctx.save();
      this.ctx.font = `${fontConfig.weight} ${fontSize}px ${fontConfig.family}`;
      const measuredWidth = this.ctx.measureText(element.previewText || '').width * scaleX;
      this.ctx.restore();
      const textW = Math.max(measuredWidth, 20);
      const textH = fontSize;
      let w = textW, h = textH;
      if (element.orientation === 'R' || element.orientation === 'B') { w = textH; h = textW; }
      x = (element.x + this.homeX) * this.scale;
      y = (element.y + this.homeY + this.labelTop) * this.scale;
      width = w;
      height = h;
    } else if (element.type === 'TEXTBLOCK' && labelSettings) {
      const resolvedHeight = element.fontSize || labelSettings.defaultFontHeight || 30;
      x = (element.x + this.homeX) * this.scale;
      y = (element.y + this.homeY + this.labelTop) * this.scale;
      width = (element.blockWidth || 200) * this.scale;
      height = resolvedHeight * (element.maxLines || 1) * this.scale;
    } else {
      const bounds = element.getBounds();
      x = (bounds.x + this.homeX) * this.scale;
      y = (bounds.y + this.homeY + this.labelTop) * this.scale;
      width = bounds.width * this.scale;
      height = bounds.height * this.scale;
    }

    // Blue dashed outline
    this.ctx.save();
    this.ctx.strokeStyle = '#3B82F6';
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([6, 6]);
    this.ctx.strokeRect(x - 2, y - 2, width + 4, height + 4);
    this.ctx.restore();

    // Draw resize handles (skip for TEXT elements as they don't support resize)
    if (element.type === 'TEXT') {
      return; // These elements don't support resize, so don't draw handles
    }

    const handleRadius = 6; // 12px diameter (matches w-3)

    // Helper to draw round handle
    const drawHandle = (cx, cy) => {
      this.ctx.save();

      // Shadow
      this.ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
      this.ctx.shadowBlur = 3;
      this.ctx.shadowOffsetY = 1;

      this.ctx.beginPath();
      this.ctx.arc(cx, cy, handleRadius, 0, 2 * Math.PI);
      this.ctx.fillStyle = '#FFFFFF';
      this.ctx.fill();

      // Border (reset shadow for stroke to avoid double shadow)
      this.ctx.shadowColor = 'transparent';
      this.ctx.strokeStyle = '#3B82F6';
      this.ctx.lineWidth = 1.5;
      this.ctx.stroke();

      this.ctx.restore();
    };

    // For BOX, LINE, and BARCODE elements, show all 8 handles (4 corners + 4 edges)
    if (element.type === 'BOX' || element.type === 'LINE' || element.type === 'BARCODE') {
      // Corner handles
      drawHandle(x, y); // Top-left
      drawHandle(x + width, y); // Top-right
      drawHandle(x, y + height); // Bottom-left
      drawHandle(x + width, y + height); // Bottom-right

      // Edge handles
      drawHandle(x + width / 2, y); // Top
      drawHandle(x + width, y + height / 2); // Right
      drawHandle(x + width / 2, y + height); // Bottom
      drawHandle(x, y + height / 2); // Left
    } else if (element.type === 'TEXTBLOCK' || element.type === 'QRCODE') {
      // For TEXTBLOCK and QRCODE, only show bottom-right handle
      drawHandle(x + width, y + height);
    } else {
      // For other elements, show 4 corner handles
      drawHandle(x, y); // Top-left
      drawHandle(x + width, y); // Top-right
      drawHandle(x, y + height); // Bottom-left
      drawHandle(x + width, y + height); // Bottom-right
    }
  }

  /**
   * Convert mouse coordinates to label coordinates (in dots)
   * Returns coordinates relative to element positions (without offsets applied)
   */
  mouseToLabelCoords(mouseX, mouseY) {
    const rect = this.canvas.getBoundingClientRect();

    // Get mouse position relative to displayed canvas
    const canvasX = mouseX - rect.left;
    const canvasY = mouseY - rect.top;

    // Calculate CSS scale factor (displayed size vs internal size)
    const scaleX = rect.width / this.canvas.width;
    const scaleY = rect.height / this.canvas.height;

    // Convert from displayed coordinates to internal canvas coordinates
    let internalX = canvasX / scaleX;
    let internalY = canvasY / scaleY;

    // If orientation is inverted, transform the coordinates
    // The canvas is flipped 180°, so we need to invert the click position
    if (this.printOrientation === 'I') {
      internalX = this.labelWidthDots - internalX;
      internalY = this.labelHeightDots - internalY;
    }

    // Subtract offsets to get element-relative coordinates
    return {
      x: internalX - this.homeX,
      y: internalY - this.homeY - this.labelTop
    };
  }

  /**
   * Toggle grid visibility
   */
  toggleGrid() {
    this.showGrid = !this.showGrid;
  }
}
