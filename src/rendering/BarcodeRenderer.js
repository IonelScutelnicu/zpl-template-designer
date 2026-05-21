// Barcode Renderer
// Renders BARCODE elements on canvas

import { encodeCode128B, calculateCode128Width } from '../utils/barcode-encoding.js';
import { applyReverseOverlay, captureReverseBg } from './reverseOverlay.js';

/**
 * Renderer for BARCODE elements
 */
export class BarcodeRenderer {
  /**
   * Render a BARCODE element on canvas
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {HTMLCanvasElement} canvas - Main canvas (for reverse overlay)
   * @param {Object} element - BARCODE element
   * @param {Object} _labelSettings - Label settings (unused, kept for uniform signature)
   * @param {Object} transform - Transform parameters {scale, homeX, homeY, labelTop}
   */
  render(ctx, canvas, element, _labelSettings, transform) {
    const { scale, homeX, homeY, labelTop } = transform;

    const x = (element.x + homeX) * scale;
    const y = (element.y + homeY + labelTop) * scale;
    const height = element.height * scale;

    // Calculate module width (narrowest bar width)
    const moduleWidth = element.width * scale;

    // Encode data into Code128 bar patterns
    const data = element.previewData || '';
    const patterns = encodeCode128B(data);

    // Calculate total barcode width (bars only, no quiet zones)
    const totalWidth = calculateCode128Width(data, element.width) * scale;

    const fontPx = element.width * 9 * scale;
    const textPadY = 4 + (2 * scale);
    const totalHeight = element.showText ? height + textPadY + fontPx : height;

    const drawShape = (targetCtx, color, ox = 0, oy = 0) => {
      targetCtx.save();
      targetCtx.fillStyle = color;
      let currentX = x + ox;
      let isBar = true;
      for (let i = 0; i < patterns.length; i++) {
        const pattern = patterns[i];
        for (let j = 0; j < pattern.length; j++) {
          const elementWidth = pattern[j] * moduleWidth;
          if (isBar) {
            targetCtx.fillRect(currentX, y + oy, elementWidth, height);
          }
          currentX += elementWidth;
          isBar = !isBar;
        }
      }
      // Final termination bar
      targetCtx.fillRect(currentX, y + oy, 2 * moduleWidth, height);

      if (element.showText) {
        targetCtx.font = `${fontPx}px Arial, sans-serif`;
        targetCtx.letterSpacing = `${(fontPx * 0.12).toFixed(1)}px`;
        targetCtx.textAlign = 'center';
        targetCtx.textBaseline = 'top';
        const barcodeYOffset = fontPx * -0.05;
        targetCtx.fillText(data, x + ox + totalWidth / 2, y + oy + height + textPadY + barcodeYOffset);
      }
      targetCtx.restore();
    };

    const captured = element.reverse
      ? captureReverseBg(ctx, canvas, { x, y, width: totalWidth + 2 * moduleWidth, height: totalHeight })
      : null;

    drawShape(ctx, '#000000');

    if (captured) {
      applyReverseOverlay(ctx, captured, drawShape);
    }
  }
}
