// Canvas Renderer for ZPL Template Creator
// Orchestrates rendering of all element types on HTML5 Canvas

import { ZPL_FONTS } from './config/constants.js';
import { LINE_HEIGHT_RATIO } from './utils/geometry.js';
import { TextRenderer } from './rendering/TextRenderer.js';
import { FieldBlockRenderer } from './rendering/FieldBlockRenderer.js';
import { BarcodeRenderer } from './rendering/BarcodeRenderer.js';
import { QRCodeRenderer } from './rendering/QRCodeRenderer.js';
import { BoxRenderer } from './rendering/BoxRenderer.js';
import { LineRenderer } from './rendering/LineRenderer.js';
import { CircleRenderer } from './rendering/CircleRenderer.js';
import { TextBlockRenderer } from './rendering/TextBlockRenderer.js';

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
    this.smartGuides = []; // Active smart guide lines during drag

    // Initialize specialized renderers
    this.renderers = {
      TEXT: new TextRenderer(),
      TEXTBLOCK: new TextBlockRenderer(),
      FIELDBLOCK: new FieldBlockRenderer(),
      BARCODE: new BarcodeRenderer(),
      QRCODE: new QRCodeRenderer(),
      BOX: new BoxRenderer(),
      LINE: new LineRenderer(),
      CIRCLE: new CircleRenderer()
    };
  }

  /**
   * Render all elements on canvas
   * @param {Array} elements - Array of ZPLElement objects
   * @param {Object} labelSettings - Label configuration
   */
  renderCanvas(elements, labelSettings, selectedElement = null) {
    const { width, height, dpmm, homeX = 0, homeY = 0, labelTop = 0, printOrientation = 'N', printMirror = 'N' } = labelSettings;

    // Store offsets and orientation for use in element drawing and coordinate conversion
    this.homeX = homeX;
    this.homeY = homeY;
    this.labelTop = labelTop;
    this.printOrientation = printOrientation;
    this.printMirror = printMirror;

    // Calculate label dimensions in dots (match Labelary's internal integer DPI)
    const actualDpi = Math.floor(dpmm * 25.4);
    const labelWidthDots = Math.floor((width / 25.4) * actualDpi);
    const labelHeightDots = Math.floor((height / 25.4) * actualDpi);

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

    // Apply mirror transformation (horizontal flip)
    if (printMirror === 'Y') {
      this.ctx.save();
      this.ctx.translate(labelWidthDots, 0);
      this.ctx.scale(-1, 1);
    }

    // Render each element
    elements.forEach(element => {
      this.drawElement(element, labelSettings, selectedElement);
    });

    // Draw smart guide lines on top of elements in the same transformed space
    // so guides align with offsets/orientation/mirror.
    if (this.smartGuides.length > 0) {
      this.drawSmartGuides(labelWidthDots, labelHeightDots);
    }

    // Restore mirror transform if applied
    if (printMirror === 'Y') {
      this.ctx.restore();
    }

    // Restore orientation transform if applied
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

    // Prepare transform parameters for renderers
    const transform = {
      scale: this.scale,
      homeX: this.homeX,
      homeY: this.homeY,
      labelTop: this.labelTop
    };

    // Draw element using specialized renderer
    const renderer = this.renderers[element.type];
    if (renderer) {
      if (element.type === 'TEXT' || element.type === 'FIELDBLOCK' || element.type === 'TEXTBLOCK') {
        renderer.render(this.ctx, this.canvas, element, labelSettings, transform);
      } else {
        renderer.render(this.ctx, element, transform);
      }
    }

    // Draw selection indicator
    if (isSelected) {
      this.drawSelectionIndicator(element, labelSettings);
    }

    this.ctx.restore();
  }


  /**
   * Draw selection indicator around element
   */
  /**
   * Measure actual rendered bounds of a TEXT element in dot coordinates.
   * Uses canvas measureText for accuracy — matches the drawn selection box exactly.
   */
  measureTextBounds(element, labelSettings) {
    const rawFontSize = element.fontSize || labelSettings.defaultFontHeight || 20;
    const rawFontWidth = element.fontWidth || labelSettings.defaultFontWidth || 20;
    const scaleX = rawFontWidth / rawFontSize;
    const fontId = element.fontId || labelSettings.fontId || '0';
    const fontConfig = ZPL_FONTS[fontId] || ZPL_FONTS['default'];
    this.ctx.save();
    this.ctx.font = `${fontConfig.weight} ${rawFontSize}px ${fontConfig.family}`;
    const measuredWidth = this.ctx.measureText(element.previewText || '').width * scaleX;
    this.ctx.restore();
    const textW = Math.max(measuredWidth, rawFontWidth);
    const textH = rawFontSize;
    let w = textW, h = textH;
    if (element.orientation === 'R' || element.orientation === 'B') { w = textH; h = textW; }
    return { x: element.x, y: element.y, width: w, height: h };
  }

  drawSelectionIndicator(element, labelSettings) {
    let x, y, width, height;
    if (element.type === 'TEXT' && labelSettings) {
      const bounds = this.measureTextBounds(element, labelSettings);
      const w = bounds.width * this.scale;
      const h = bounds.height * this.scale;
      x = (element.x + this.homeX) * this.scale;
      y = (element.y + this.homeY + this.labelTop) * this.scale;
      width = w;
      height = h;
    } else if (element.type === 'FIELDBLOCK' && labelSettings) {
      const resolvedHeight = element.fontSize || labelSettings.defaultFontHeight || 30;
      const maxLines = element.maxLines || 1;
      const lineSpacing = element.lineSpacing || 0;
      // Line spacing is only between lines, not after the last line
      const baseLineHeight = resolvedHeight * LINE_HEIGHT_RATIO;
      const totalHeight = baseLineHeight * maxLines + lineSpacing * Math.max(0, maxLines - 1);
      x = (element.x + this.homeX) * this.scale;
      y = (element.y + this.homeY + this.labelTop) * this.scale;
      let blockW = (element.blockWidth || 200) * this.scale;
      let blockH = totalHeight * this.scale;
      if (element.orientation === 'R' || element.orientation === 'B') {
        width = blockH;
        height = blockW;
      } else {
        width = blockW;
        height = blockH;
      }
    } else {
      const bounds = element.getBounds();
      x = (bounds.x + this.homeX) * this.scale;
      y = (bounds.y + this.homeY + this.labelTop) * this.scale;
      width = bounds.width * this.scale;
      height = bounds.height * this.scale;
    }

    // Dashed outline — amber for locked, blue for unlocked
    const isLocked = element.locked;
    const selectionColor = isLocked ? '#F59E0B' : '#3B82F6';

    this.ctx.save();
    this.ctx.strokeStyle = selectionColor;
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([6, 6]);
    this.ctx.strokeRect(x - 2, y - 2, width + 4, height + 4);
    this.ctx.restore();

    // Draw lock icon for locked elements (top-right corner)
    if (isLocked) {
      const iconSize = 14;
      const iconX = x + width - iconSize + 4;
      const iconY = y - iconSize - 4;

      this.ctx.save();
      // Background circle
      this.ctx.fillStyle = '#F59E0B';
      this.ctx.beginPath();
      this.ctx.arc(iconX + iconSize / 2, iconY + iconSize / 2, iconSize / 2 + 2, 0, 2 * Math.PI);
      this.ctx.fill();

      // Lock body (white)
      this.ctx.fillStyle = '#FFFFFF';
      const bodyW = 8, bodyH = 6;
      const bodyX = iconX + (iconSize - bodyW) / 2;
      const bodyY = iconY + iconSize / 2;
      this.ctx.fillRect(bodyX, bodyY, bodyW, bodyH);

      // Lock shackle (white arc)
      this.ctx.strokeStyle = '#FFFFFF';
      this.ctx.lineWidth = 1.5;
      this.ctx.beginPath();
      this.ctx.arc(iconX + iconSize / 2, bodyY, 3, Math.PI, 0);
      this.ctx.stroke();

      this.ctx.restore();
    }

    // Draw resize handles

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
      this.ctx.strokeStyle = selectionColor;
      this.ctx.lineWidth = 1.5;
      this.ctx.stroke();

      this.ctx.restore();
    };

    // For BOX, LINE, BARCODE, and CIRCLE elements, show all 8 handles (4 corners + 4 edges)
    if (element.type === 'BOX' || element.type === 'LINE' || element.type === 'BARCODE' || element.type === 'CIRCLE') {
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
    } else if (element.type === 'FIELDBLOCK' || element.type === 'QRCODE' || element.type === 'TEXT') {
      // For FIELDBLOCK, QRCODE, and TEXT, only show bottom-right handle
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

    // If mirror is enabled, flip the X coordinate
    if (this.printMirror === 'Y') {
      internalX = this.labelWidthDots - internalX;
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

  /**
   * Set active smart guides (called by interaction handler during drag)
   * @param {Array} guides - Array of {axis: 'x'|'y', position: number, type: string}
   */
  setSmartGuides(guides) {
    this.smartGuides = guides;
  }

  /**
   * Clear active smart guides (called on drag end)
   */
  clearSmartGuides() {
    this.smartGuides = [];
  }

  /**
   * Draw smart guide lines on canvas
   */
  drawSmartGuides(labelWidthDots, labelHeightDots) {
    this.ctx.save();

    for (const guide of this.smartGuides) {
      const pos = guide.axis === 'x'
        ? (guide.position + this.homeX) * this.scale
        : (guide.position + this.homeY + this.labelTop) * this.scale;

      // Guide line style
      this.ctx.strokeStyle = '#06b6d4'; // cyan-500
      this.ctx.lineWidth = 1;
      this.ctx.setLineDash([4, 3]);

      this.ctx.beginPath();
      if (guide.axis === 'x') {
        // Vertical guide line
        this.ctx.moveTo(pos + 0.5, 0);
        this.ctx.lineTo(pos + 0.5, labelHeightDots * this.scale);
      } else {
        // Horizontal guide line
        this.ctx.moveTo(0, pos + 0.5);
        this.ctx.lineTo(labelWidthDots * this.scale, pos + 0.5);
      }
      this.ctx.stroke();

      // Small indicator dot at the guide position
      this.ctx.setLineDash([]);
      this.ctx.fillStyle = '#06b6d4';
      this.ctx.beginPath();
      if (guide.axis === 'x') {
        // Dot at the top of vertical guide
        this.ctx.arc(pos, 4, 3, 0, Math.PI * 2);
      } else {
        // Dot at the left of horizontal guide
        this.ctx.arc(4, pos, 3, 0, Math.PI * 2);
      }
      this.ctx.fill();
    }

    this.ctx.restore();
  }
}
