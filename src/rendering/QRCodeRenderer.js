// QR Code Renderer
// Renders 2D QRCODE elements (QR, Data Matrix, PDF417) using real bwip-js geometry.

import { getBarcodeGeometry, matrixModuleDots, maxicodeSize, resolveSymbology, SYMBOLOGY_LABELS } from '../utils/barcodeGeometry.js';
import { drawLinear, drawMatrix, drawMaxiCode, drawPlaceholder } from './barcodeRender.js';
import { applyReverseOverlay, captureReverseBg } from './reverseOverlay.js';

/**
 * Renderer for QRCODE elements
 */
export class QRCodeRenderer {
  /**
   * Render a QRCODE element on canvas
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {HTMLCanvasElement} canvas - Main canvas (for reverse overlay)
   * @param {Object} element - QRCODE element
   * @param {Object} _labelSettings - Label settings (unused, kept for uniform signature)
   * @param {Object} transform - Transform parameters {scale, homeX, homeY, labelTop}
   */
  render(ctx, canvas, element, _labelSettings, transform) {
    const { scale, homeX, homeY, labelTop } = transform;

    const symbology = resolveSymbology(element);
    // QR codes carry a 10-dot quiet-zone Y offset from the ^FO origin.
    const yOffset = symbology === 'QR' ? 10 * scale : 0;
    const x = (element.x + homeX) * scale;
    const y = (element.y + homeY + labelTop) * scale + yOffset;

    const { mx, my } = matrixModuleDots(element);
    const moduleW = mx * scale;
    const moduleH = my * scale;

    const geom = getBarcodeGeometry(element);

    if (geom.kind === 'maxicode') {
      const { width, height } = maxicodeSize(moduleW);
      const drawShape = (targetCtx, color, ox = 0, oy = 0) => {
        drawMaxiCode(targetCtx, geom, { x: x + ox, y: y + oy, moduleW, color });
      };
      const capturedMc = element.reverse
        ? captureReverseBg(ctx, canvas, { x, y, width, height })
        : null;
      drawShape(ctx, '#000000');
      if (capturedMc) applyReverseOverlay(ctx, capturedMc, drawShape);
      return;
    }

    if (geom.kind === 'tlc39') {
      // Composite: Code 39 (ECI) on top, MicroPDF417 (serial/data) below, left-aligned.
      const c39Height = (element.rowHeight || 40) * scale;
      const gap = 2 * moduleW;
      const c39W = geom.code39.kind === 'linear' ? geom.code39.modules * moduleW : 0;
      const mpW = geom.micropdf ? geom.micropdf.cols * moduleW : 0;
      const mpH = geom.micropdf ? geom.micropdf.rows * moduleW : 0;
      const width = Math.max(c39W, mpW);
      const height = (geom.code39.kind === 'linear' ? c39Height + (geom.micropdf ? gap : 0) : 0) + mpH;
      const drawShape = (targetCtx, color, ox = 0, oy = 0) => {
        let cy = y + oy;
        if (geom.code39.kind === 'linear') {
          drawLinear(targetCtx, geom.code39, { x: x + ox, y: cy, moduleW, height: c39Height, color });
          cy += c39Height + gap;
        }
        if (geom.micropdf) {
          drawMatrix(targetCtx, geom.micropdf, { x: x + ox, y: cy, moduleW, moduleH: moduleW, color });
        }
      };
      const capturedTlc = element.reverse
        ? captureReverseBg(ctx, canvas, { x, y, width, height })
        : null;
      drawShape(ctx, '#000000');
      if (capturedTlc) applyReverseOverlay(ctx, capturedTlc, drawShape);
      return;
    }

    if (geom.kind === 'linear') {
      // GS1 DataBar linear variants render as bars; bar height comes from rowHeight.
      const barHeight = (element.rowHeight || 40) * scale;
      const width = geom.modules * moduleW;
      const drawShape = (targetCtx, color, ox = 0, oy = 0) => {
        drawLinear(targetCtx, geom, { x: x + ox, y: y + oy, moduleW, height: barHeight, color });
      };
      const capturedLin = element.reverse
        ? captureReverseBg(ctx, canvas, { x, y, width, height: barHeight })
        : null;
      drawShape(ctx, '#000000');
      if (capturedLin) applyReverseOverlay(ctx, capturedLin, drawShape);
      return;
    }

    if (geom.kind !== 'matrix') {
      const size = 21 * (element.magnification || 5) * scale;
      drawPlaceholder(ctx, { x, y, width: size, height: size, label: SYMBOLOGY_LABELS[symbology] });
      return;
    }

    const width = geom.cols * moduleW;
    const height = geom.rows * moduleH;

    const drawShape = (targetCtx, color, ox = 0, oy = 0) => {
      drawMatrix(targetCtx, geom, { x: x + ox, y: y + oy, moduleW, moduleH, color });
    };

    const captured = element.reverse
      ? captureReverseBg(ctx, canvas, { x, y, width, height })
      : null;

    drawShape(ctx, '#000000');

    if (captured) {
      applyReverseOverlay(ctx, captured, drawShape);
    }
  }
}
