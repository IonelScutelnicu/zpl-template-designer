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

    // QR codes in ZPL: no X offset, fixed ~11 dot Y offset (quiet zone, independent of magnification)
    const x = (element.x + homeX) * scale;
    const y = (element.y + homeY + labelTop) * scale + 11 * scale;

    // Calculate QR code size based on data length and error correction
    const dataLength = element.previewData.length;
    const version = calculateQRVersion(dataLength, element.errorCorrection);
    const modules = qrVersionToModules(version);
    const size = modules * element.magnification * scale;
    const moduleSize = size / modules;
    const seed = this.hashString(`${element.previewData}|${element.errorCorrection}|${element.model}|${element.magnification}`);

    // Paint only the "ink" portions of the QR code in `color`. The main
    // pass uses '#000000' on top of a white bg; the reverse-overlay pass
    // uses '#FFFFFF' to flip those ink pixels where they overlap previous
    // dark areas.
    const drawInk = (targetCtx, color, ox = 0, oy = 0) => {
      const sx = x + ox;
      const sy = y + oy;
      targetCtx.save();
      targetCtx.fillStyle = color;
      const rng = this.createRng(seed);
      for (let row = 0; row < modules; row++) {
        for (let col = 0; col < modules; col++) {
          if (rng() > 0.5) {
            targetCtx.fillRect(sx + col * moduleSize, sy + row * moduleSize, moduleSize, moduleSize);
          }
        }
      }
      const markerSize = moduleSize * 7;
      // Outer ring + inner square are ink; the gap between them is not.
      const drawMarkerInk = (mx, my) => {
        // Outer ring as 4 strips around the gap
        const gap = markerSize * 0.2;
        targetCtx.fillRect(mx, my, markerSize, gap); // top
        targetCtx.fillRect(mx, my + markerSize - gap, markerSize, gap); // bottom
        targetCtx.fillRect(mx, my + gap, gap, markerSize - 2 * gap); // left
        targetCtx.fillRect(mx + markerSize - gap, my + gap, gap, markerSize - 2 * gap); // right
        // Inner solid square
        targetCtx.fillRect(mx + markerSize * 0.35, my + markerSize * 0.35, markerSize * 0.3, markerSize * 0.3);
      };
      drawMarkerInk(sx, sy);
      drawMarkerInk(sx + size - markerSize, sy);
      drawMarkerInk(sx, sy + size - markerSize);
      targetCtx.restore();
    };

    const drawShape = (targetCtx, color, ox = 0, oy = 0) => {
      // Main pass without ^FR draws a white background to "punch" the QR
      // out from anything behind it (matches Zebra preview behavior).
      // Reversed QRs skip the bg so the overlap-flip semantics apply only
      // to the modules — same as TEXT.
      if (color === '#000000' && !element.reverse) {
        targetCtx.save();
        targetCtx.fillStyle = '#FFFFFF';
        targetCtx.fillRect(x + ox, y + oy, size, size);
        targetCtx.restore();
      }
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
