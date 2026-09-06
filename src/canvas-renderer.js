// Canvas Renderer for ZPL Template Creator
// Orchestrates rendering of all element types on HTML5 Canvas

import { fieldBlockExtents, isSpatial } from './utils/geometry.js';
import { resolveFontMetrics, resolveFontCellHeight, measureStyledText } from './utils/fontMetrics.js';
import { effectiveCharGap, layoutCharOffsets, normalizePrintDirection, runLeadOffset, segmentForDirection } from './utils/fieldParameter.js';
import { resolvePlaceholders } from './utils/placeholders.js';
import { collapseLineBreaks } from './utils/zplFieldData.js';
import { emittedOriginOffset } from './utils/fieldAnchor.js';
import { TextRenderer } from './rendering/TextRenderer.js';
import { FieldBlockRenderer } from './rendering/FieldBlockRenderer.js';
import { BarcodeRenderer } from './rendering/BarcodeRenderer.js';
import { QRCodeRenderer } from './rendering/QRCodeRenderer.js';
import { BoxRenderer } from './rendering/BoxRenderer.js';
import { LineRenderer } from './rendering/LineRenderer.js';
import { DiagonalLineRenderer } from './rendering/DiagonalLineRenderer.js';
import { CircleRenderer } from './rendering/CircleRenderer.js';
import { TextBlockRenderer } from './rendering/TextBlockRenderer.js';
import { GraphicFieldRenderer } from './rendering/GraphicFieldRenderer.js';
import { GraphicSymbolRenderer } from './rendering/GraphicSymbolRenderer.js';
import { prefetchFontsForElements } from './utils/fontLoader.js';

/**
 * Undo a canvas view rotation on a screen-space vector, returning the
 * equivalent vector in unrotated (label) space.
 *
 * CSS `rotate(θ)` in a y-down space maps an unrotated offset (u, v) to
 * (u·cosθ − v·sinθ, u·sinθ + v·cosθ). For the four quarter-turns the inverse
 * is an exact integer swap, so no trig and no float drift.
 *
 * @param {number} dx - Screen-space x delta
 * @param {number} dy - Screen-space y delta
 * @param {number} deg - View rotation in degrees (0 | 90 | 180 | 270)
 * @returns {{x: number, y: number}} Vector in unrotated label space
 */
export function unrotateViewVector(dx, dy, deg) {
  switch (deg) {
    case 90: return { x: dy, y: -dx };
    case 180: return { x: -dx, y: -dy };
    case 270: return { x: -dy, y: dx };
    default: return { x: dx, y: dy };
  }
}

export class CanvasRenderer {
  constructor(canvasOrId) {
    this.canvas = typeof canvasOrId === 'string'
      ? document.getElementById(canvasOrId)
      : canvasOrId;
    this.ctx = this.canvas.getContext('2d');

    // Disable smoothing for more bitmap-like rendering
    this.ctx.imageSmoothingEnabled = false;

    this.scale = 1;
    this.zoom = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.transparentBackground = false;
    this.smartGuides = []; // Active smart guide lines during drag
    // View-only canvas rotation (0/90/180/270). Applied in CSS on the preview
    // stage, never to the canvas bitmap — it exists here only so pointer and
    // keyboard input can be mapped back out of screen space.
    this.viewRotation = 0;

    // Initialize specialized renderers
    this.renderers = {
      TEXT: new TextRenderer(),
      TEXTBLOCK: new TextBlockRenderer(),
      FIELDBLOCK: new FieldBlockRenderer(),
      BARCODE: new BarcodeRenderer(),
      QRCODE: new QRCodeRenderer(),
      BOX: new BoxRenderer(),
      LINE: new LineRenderer(),
      DIAGONALLINE: new DiagonalLineRenderer(),
      CIRCLE: new CircleRenderer(),
      GRAPHIC: new GraphicFieldRenderer(),
      GRAPHICSYMBOL: new GraphicSymbolRenderer()
    };
  }

  setTransparentBackground(enabled) {
    this.transparentBackground = Boolean(enabled);
  }

  setZoom(zoom) {
    this.zoom = Math.max(0.01, Number(zoom) || 1);
  }

  /**
   * Set the view-only canvas rotation used to map input out of screen space.
   * Drawing is unaffected — the rotation itself is applied in CSS.
   * @param {number} deg - 0, 90, 180 or 270
   */
  setViewRotation(deg) {
    const normalized = ((Math.round(Number(deg) || 0) % 360) + 360) % 360;
    this.viewRotation = normalized % 90 === 0 ? normalized : 0;
  }

  /**
   * Render all elements on canvas
   * @param {Array} elements - Array of ZPLElement objects
   * @param {Object} labelSettings - Label configuration
   */
  renderCanvas(elements, labelSettings, selection = null) {
    const { width, height, dpmm, homeX = 0, homeY = 0, labelTop = 0, labelShift = 0, printOrientation = 'N', printMirror = 'N' } = labelSettings;

    // Normalize selection to a list so a single element, an array, or null all work.
    const selectedList = Array.isArray(selection) ? selection : (selection ? [selection] : []);
    const selectedElements = selectedList.filter(Boolean);
    this._selectedIds = new Set(selectedElements.map(el => String(el.id)));
    this._selectionCount = this._selectedIds.size;

    // Store offsets and orientation for use in element drawing and coordinate conversion
    this.homeX = homeX;
    this.homeY = homeY;
    this.labelTop = labelTop;
    this.labelShift = labelShift;
    this.labelSettings = labelSettings;
    this.printOrientation = printOrientation;
    this.printMirror = printMirror;

    // Calculate label dimensions in dots (match Labelary's internal integer DPI)
    const actualDpi = Math.floor(dpmm * 25.4);
    const labelWidthDots = Math.floor((width / 25.4) * actualDpi);
    const labelHeightDots = Math.floor((height / 25.4) * actualDpi);

    // Store label dimensions for coordinate conversion
    this.labelWidthDots = labelWidthDots;
    this.labelHeightDots = labelHeightDots;

    // Apply current zoom: 1 dot becomes `zoom` screen pixels.
    this.scale = this.zoom || 1;

    // Resizing a canvas clears its bitmap and resets its entire context. Avoid
    // paying that allocation cost on every pointer move when its size is stable.
    const canvasWidth = Math.max(1, Math.round(labelWidthDots * this.scale));
    const canvasHeight = Math.max(1, Math.round(labelHeightDots * this.scale));
    if (this.canvas.width !== canvasWidth || this.canvas.height !== canvasHeight) {
      this.canvas.width = canvasWidth;
      this.canvas.height = canvasHeight;
      this.ctx.imageSmoothingEnabled = false;
    }

    // Calculate offsets to center canvas
    this.offsetX = 0;
    this.offsetY = 0;

    this.ctx.resetTransform();
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.globalAlpha = 1;

    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (!this.transparentBackground) {
      // Draw white label background
      this.ctx.fillStyle = '#FFFFFF';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    if (!this.transparentBackground) {
      // Draw offset zones with horizontal stripe pattern
      this.drawOffsetZones(labelWidthDots, labelHeightDots);
    }

    // Apply orientation transformation for elements
    // For inverted (I) orientation, flip the entire canvas 180°
    if (printOrientation === 'I') {
      this.ctx.save();
      // Rotate 180° around the center by translating and scaling
      this.ctx.translate(labelWidthDots * this.scale, labelHeightDots * this.scale);
      this.ctx.scale(-1, -1);
    }

    // Apply mirror transformation (horizontal flip)
    if (printMirror === 'Y') {
      this.ctx.save();
      this.ctx.translate(labelWidthDots * this.scale, 0);
      this.ctx.scale(-1, 1);
    }

    // Render each element
    elements.forEach(element => {
      this.drawElement(element, labelSettings);
    });

    // Editor chrome must not become input to a later field's ^FR compositing.
    selectedElements.forEach(element => {
      this.ctx.save();
      this.drawSelectionIndicator(element, labelSettings);
      this.ctx.restore();
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

    prefetchFontsForElements(elements, labelSettings, () => this.renderCanvas(elements, labelSettings, selectedElements));
  }

  /**
   * Draw offset zones with diagonal stripe pattern
   * Shows the area affected by homeX, homeY, and labelTop offsets
   */
  drawOffsetZones(labelWidthDots, labelHeightDots) {
    const totalXOffset = this.homeX - (this.labelShift || 0);
    const totalYOffset = this.homeY + this.labelTop;

    // Only draw if there are offsets
    if (totalXOffset <= 0 && totalYOffset <= 0) return;

    this.ctx.save();

    // Stripe pattern — line widths and dash sizes are in screen pixels at
    // any zoom (canvas internal size matches CSS size).
    const stripeSpacing = 8; // pixels between stripes
    const stripeColor = '#fca5a5'; // Light red color

    this.ctx.strokeStyle = stripeColor;
    this.ctx.lineWidth = 1;

    // Draw left offset zone (homeX)
    if (totalXOffset > 0) {
      const zoneWidth = totalXOffset * this.scale;
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
   * Labelary pins a field's effective origin at the top edge: a negative ^LT shifts a
   * field up only until its origin reaches y=0, per field, and ink above the origin is
   * then clipped by the bitmap. Measured against the API, which the ^LT docs do not cover.
   */
  pinnedLabelTop(elementY) {
    return Math.max(this.labelTop, -(elementY + this.homeY));
  }

  labelShiftAnchorOffset(element, labelSettings = this.labelSettings) {
    if (!labelSettings?.labelShift) return 0;
    return emittedOriginOffset(element, labelSettings, {
      content: resolvePlaceholders(element.content, labelSettings.previewData)
    }).dx;
  }

  /** Labelary pins the command anchor, before justification/rotation moves the ink. */
  leftPinShift(element, labelSettings = this.labelSettings) {
    const { homeX = 0, labelShift = 0 } = labelSettings || {};
    if (!labelShift) return 0;
    const anchorX = Math.round(element.x + this.labelShiftAnchorOffset(element, labelSettings));
    return Math.max(0, labelShift - homeX - anchorX);
  }

  horizontalOffset(element, labelSettings = this.labelSettings) {
    return (labelSettings?.homeX ?? this.homeX) - (labelSettings?.labelShift || 0)
      + this.leftPinShift(element, labelSettings);
  }

  /**
   * Draw a single element on canvas
   */
  drawElement(element, labelSettings) {
    this.ctx.save();

    // Prepare transform parameters for renderers
    const transform = {
      scale: this.scale,
      homeX: this.horizontalOffset(element, labelSettings),
      homeY: this.homeY,
      labelTop: this.pinnedLabelTop(element.y),
      transparentBackground: this.transparentBackground
    };

    // Draw element using specialized renderer
    const renderer = this.renderers[element.type];
    if (renderer) {
      renderer.render(this.ctx, this.canvas, element, labelSettings, transform);
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
    // scale=1: work in label-dot space, not screen pixels.
    const metrics = resolveFontMetrics(element, labelSettings, 1);
    const { fontConfig, fontSize, snappedHeight, snappedWidth, scaleX, isBitmap } = metrics;
    // Match the glyphs the renderer actually draws (uppercase/filtered fonts,
    // and ^A's line-break collapse).
    const raw = collapseLineBreaks(resolvePlaceholders(element.content, labelSettings?.previewData));
    const text = fontConfig.uppercase ? raw.toUpperCase() : fontConfig.filterLowercase ? raw.replace(/[a-z]/g, ' ') : raw;
    // ^FP: the same layout the renderer draws, so the box bounds the real ink.
    const direction = normalizePrintDirection(element.printDirection);
    const charGap = effectiveCharGap(element) / scaleX;
    this.ctx.save();
    this.ctx.font = `${fontConfig.weight} ${fontSize}px ${fontConfig.family}`;
    this.ctx.letterSpacing = fontConfig.letterSpacing ? `${fontConfig.letterSpacing * fontSize}px` : '0px';
    this.ctx.wordSpacing = fontConfig.wordSpacing ? `${fontConfig.wordSpacing * fontSize}px` : '0px';
    const m = this.ctx.measureText(text);
    const perChar = direction !== 'H' || charGap > 0;
    const chars = perChar ? segmentForDirection(text, direction) : [];
    const layout = perChar
      ? layoutCharOffsets(chars.map(ch => measureStyledText(this.ctx, ch, fontConfig, fontSize, 1)), direction, charGap)
      : null;
    const measuredWidth = layout
      ? (layout.max - layout.min) * scaleX
      : measureStyledText(this.ctx, text, fontConfig, fontSize, scaleX);
    // Bitmap fonts draw from a cap-height baseline (snappedHeight); the glyph
    // descender hangs below that, so the visible cell is snappedHeight + descent.
    // Match TextRenderer's draw so the box bounds the actual ink.
    const descent = isBitmap ? (m.actualBoundingBoxDescent || 0) : 0;
    this.ctx.restore();
    const textW = Math.max(measuredWidth, snappedWidth);
    // A vertical stack is as deep as its characters; a reversed run starts left of
    // the origin, so the box has to walk back with it.
    const cellHeight = resolveFontCellHeight(metrics);
    const textH = snappedHeight + descent + (direction === 'V' ? Math.max(0, chars.length - 1) * cellHeight : 0);
    const rotated = element.orientation === 'R' || element.orientation === 'B';
    let w = textW, h = textH;
    if (rotated) { w = textH; h = textW; }
    // R and I pivot on the far edge of the font cell (see TextRenderer), so their ink
    // sits at the far end of it — this box bounds the cap ink, not the whole cell, so
    // it has to start one cell's worth of padding in from the origin. N and B pivot on
    // the origin and the reading end, so their box starts there.
    const cellDrop = element.orientation === 'R' || element.orientation === 'I'
      ? Math.max(0, cellHeight - (snappedHeight + descent))
      : 0;
    // A reversed run walks back from its origin, but only on the rotations whose
    // reading axis points along a positive label axis — see runLeadOffset.
    const lead = runLeadOffset(layout && { min: layout.min * scaleX }, element.orientation || 'N');
    return {
      x: element.x + lead.dx + (element.orientation === 'R' ? cellDrop : 0),
      y: element.y + lead.dy + (element.orientation === 'I' ? cellDrop : 0),
      width: w,
      height: h,
    };
  }

  drawSelectionIndicator(element, labelSettings) {
    // Non-spatial elements (RAW) have no place on the label — drawing their
    // zero-size bounds would put a stray dashed box and handles at the origin.
    if (!isSpatial(element)) return;

    let x, y, width, height;
    if (element.type === 'TEXT' && labelSettings) {
      // bounds.x/y, not element.x/y: a ^FPR run starts before its own origin, and the
      // resize handles are hit-tested against these same measured bounds.
      const bounds = this.measureTextBounds(element, labelSettings);
      x = (bounds.x + this.horizontalOffset(element, labelSettings)) * this.scale;
      y = (bounds.y + this.homeY + this.pinnedLabelTop(element.y)) * this.scale;
      width = bounds.width * this.scale;
      height = bounds.height * this.scale;
    } else if (element.type === 'FIELDBLOCK' && labelSettings) {
      // fieldBlockExtents resolves the orientation, including the trailing
      // line-spacing slot an R/I rotation pivots from — the box FieldBlockRenderer
      // actually draws.
      const extents = fieldBlockExtents(element, labelSettings, this.scale);
      x = (element.x + this.horizontalOffset(element, labelSettings)) * this.scale;
      y = (element.y + this.homeY + this.pinnedLabelTop(element.y)) * this.scale;
      width = extents.width;
      height = extents.height;
    } else {
      // Preview Data matters here: a barcode's width comes from the encoded
      // string, so measuring the raw Content would size the box to the
      // placeholder name rather than to the symbol actually drawn.
      const bounds = element.getBounds(labelSettings?.dpmm, labelSettings?.previewData);
      x = (bounds.x + this.horizontalOffset(element, labelSettings)) * this.scale;
      y = (bounds.y + this.homeY + this.pinnedLabelTop(element.y)) * this.scale;
      width = bounds.width * this.scale;
      height = bounds.height * this.scale;
    }

    // Dashed outline — amber for locked, blue for unlocked. Chrome metrics
    // are constant on-screen because CSS size equals canvas internal size.
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

    // With a multi-selection, show outlines only — no per-element resize handles
    // (group resize is out of scope; handles would be ambiguous).
    if (this._selectionCount > 1) {
      return;
    }

    // Draw resize handles — constant on-screen size (~12px diameter).
    const handleRadius = 6;

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

    // For BOX, LINE, BARCODE, CIRCLE, DIAGONALLINE, and GRAPHICSYMBOL elements, show all 8 handles (4 corners + 4 edges)
    if (element.type === 'BOX' || element.type === 'LINE' || element.type === 'BARCODE' || element.type === 'CIRCLE' || element.type === 'DIAGONALLINE' || element.type === 'GRAPHICSYMBOL') {
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
    } else if (element.type === 'FIELDBLOCK' || element.type === 'QRCODE' || element.type === 'TEXT' || element.type === 'TEXTBLOCK') {
      // For FIELDBLOCK, QRCODE, TEXT, and TEXTBLOCK, only show bottom-right handle
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
    const rot = this.viewRotation || 0;
    const swapped = rot === 90 || rot === 270;

    // Under a view rotation the bounding rect is the *axis-aligned box* of the
    // rotated canvas, so its corners are useless — work from its centre, which
    // the rotation leaves fixed.
    const dx = mouseX - (rect.left + rect.width / 2);
    const dy = mouseY - (rect.top + rect.height / 2);

    // Convert from CSS pixels to canvas-pixel coordinates. The rect's axes swap
    // with the rotation; the ratio is 1 by construction (see applyViewport).
    const cssScale = (swapped ? rect.height : rect.width) / this.canvas.width || 1;

    // Undo the view rotation, then re-origin at the canvas top-left.
    const v = unrotateViewVector(dx, dy, rot);
    const pxX = v.x / cssScale + this.canvas.width / 2;
    const pxY = v.y / cssScale + this.canvas.height / 2;

    // Convert canvas-pixels to label-dots through the current zoom factor.
    const z = this.scale || 1;
    let dotX = pxX / z;
    let dotY = pxY / z;

    // If orientation is inverted, transform the coordinates. This runs after
    // the un-rotation above: the view rotation wraps an already-flipped canvas,
    // so screen -> label undoes the rotation first, then the flip.
    if (this.printOrientation === 'I') {
      dotX = this.labelWidthDots - dotX;
      dotY = this.labelHeightDots - dotY;
    }

    // If mirror is enabled, flip the X coordinate
    if (this.printMirror === 'Y') {
      dotX = this.labelWidthDots - dotX;
    }

    // Subtract offsets to get element-relative coordinates
    return {
      x: dotX - this.homeX + (this.labelShift || 0),
      y: dotY - this.homeY - this.labelTop
    };
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
        ? (guide.position + this.homeX - (this.labelShift || 0)) * this.scale
        : (guide.position + this.homeY + this.labelTop) * this.scale;

      // Guide line style — constant on-screen weight
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
