// QR Code Renderer
// Renders QRCODE elements on canvas

import { calculateQRVersion, qrVersionToModules } from '../elements/QRCodeElement.js';
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

    // QR codes in ZPL: no X offset, 10 dot Y offset (quiet zone from ^FO origin, independent of magnification)
    const x = (element.x + homeX) * scale;
    const y = (element.y + homeY + labelTop) * scale + 10 * scale;

    // Calculate QR code size based on data length and error correction
    const dataLength = element.previewData.length;
    const version = calculateQRVersion(dataLength, element.errorCorrection);
    const modules = qrVersionToModules(version);
    const size = modules * element.magnification * scale;
    const moduleSize = size / modules;
    const seed = this.hashString(`${element.previewData}|${element.errorCorrection}|${element.model}|${element.magnification}`);

    const drawInk = (targetCtx, color, ox = 0, oy = 0) => {
      const sx = x + ox;
      const sy = y + oy;
      targetCtx.save();
      targetCtx.fillStyle = color;
      const rng = this.createRng(seed);

      // Draw deterministic QR-like pattern, skipping positioning marker zones
      for (let row = 0; row < modules; row++) {
        for (let col = 0; col < modules; col++) {
          const val = rng();
          const inMarker = (row < 8 && col < 8) ||
                           (row < 8 && col >= modules - 8) ||
                           (row >= modules - 8 && col < 8);
          if (!inMarker && val > 0.5) {
            targetCtx.fillRect(sx + col * moduleSize, sy + row * moduleSize, moduleSize, moduleSize);
          }
        }
      }

      // Draw positioning markers (7 modules each) — only ink, no white fill
      const markerSize = moduleSize * 7;
      const m = moduleSize;
      const drawMarkerInk = (mx, my) => {
        targetCtx.fillRect(mx, my, markerSize, m);
        targetCtx.fillRect(mx, my + markerSize - m, markerSize, m);
        targetCtx.fillRect(mx, my + m, m, markerSize - 2 * m);
        targetCtx.fillRect(mx + markerSize - m, my + m, m, markerSize - 2 * m);
        targetCtx.fillRect(mx + 2 * m, my + 2 * m, 3 * m, 3 * m);
      };
      drawMarkerInk(sx, sy);
      drawMarkerInk(sx + size - markerSize, sy);
      drawMarkerInk(sx, sy + size - markerSize);
      targetCtx.restore();
    };

    const drawShape = (targetCtx, color, ox = 0, oy = 0) => {
      drawInk(targetCtx, color, ox, oy);
    };

    const captured = element.reverse
      ? captureReverseBg(ctx, canvas, { x, y, width: size, height: size })
      : null;

    drawShape(ctx, '#000000');

    if (captured) {
      applyReverseOverlay(ctx, captured, drawShape);
    }
  }

  /**
   * Simple deterministic hash for stable QR preview patterns
   */
  hashString(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  /**
   * Xorshift32 RNG for predictable pseudo-random values
   */
  createRng(seed) {
    let state = seed || 1;
    return () => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) / 4294967296;
    };
  }
}
