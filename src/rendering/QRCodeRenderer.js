// QR Code Renderer
// Renders 2D QRCODE elements (QR, Data Matrix, PDF417) using real bwip-js geometry.

import { getBarcodeGeometry, matrixModuleDots, maxicodeSize, resolveSymbology, SYMBOLOGY_LABELS } from '../utils/barcodeGeometry.js';
import { drawMatrix, drawMaxiCode, drawPlaceholder } from './barcodeRender.js';
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
