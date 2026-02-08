// Barcode Renderer
// Renders BARCODE elements on canvas

import { encodeCode128B, calculateCode128Width } from '../utils/barcode-encoding.js';

/**
 * Renderer for BARCODE elements
 */
export class BarcodeRenderer {
  /**
   * Render a BARCODE element on canvas
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {Object} element - BARCODE element
   * @param {Object} transform - Transform parameters {scale, homeX, homeY, labelTop}
   */
  render(ctx, element, transform) {
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

    // Start drawing bars at x (quiet zones are implicit white space)
    let currentX = x;

    // Draw encoded patterns
    ctx.fillStyle = '#000000';
    let isBar = true; // Start with a bar

    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i];

      // Draw each element in the pattern
      for (let j = 0; j < pattern.length; j++) {
        const elementWidth = pattern[j] * moduleWidth;

        if (isBar) {
          // Draw bar (black)
          ctx.fillRect(currentX, y, elementWidth, height);
        }
        // Space (white) - don't draw, just advance position

        currentX += elementWidth;
        isBar = !isBar;
      }

      // Don't reset isBar - patterns flow together continuously
    }

    // Add final termination bar (2 modules) for stop code
    ctx.fillRect(currentX, y, 2 * moduleWidth, height);

    // Draw barcode text below centered at actual width (if enabled)
    if (element.showText) {
      ctx.fillStyle = '#000000';
      ctx.font = `${18 * scale}px Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(data, x + totalWidth / 2, y + height + 4 + (2 * scale));
    }
  }
}
