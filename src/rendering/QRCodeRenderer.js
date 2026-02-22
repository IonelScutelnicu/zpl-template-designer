// QR Code Renderer
// Renders QRCODE elements on canvas

import { calculateQRVersion, qrVersionToModules } from '../elements/QRCodeElement.js';

/**
 * Renderer for QRCODE elements
 */
export class QRCodeRenderer {
  /**
   * Render a QRCODE element on canvas
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {Object} element - QRCODE element
   * @param {Object} transform - Transform parameters {scale, homeX, homeY, labelTop}
   */
  render(ctx, element, transform) {
    const { scale, homeX, homeY, labelTop } = transform;

    // QR codes in ZPL: no X offset, fixed ~11 dot Y offset (quiet zone, independent of magnification)
    const x = (element.x + homeX) * scale;
    const y = (element.y + homeY + labelTop) * scale + 11 * scale;

    // Calculate QR code size based on data length and error correction
    const dataLength = element.previewData.length;
    const version = calculateQRVersion(dataLength, element.errorCorrection);
    const modules = qrVersionToModules(version);
    const size = modules * element.magnification * scale;

    // Draw white background first (no border)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x, y, size, size);

    // Draw simplified QR pattern
    ctx.fillStyle = '#000000';
    const moduleSize = size / modules;

    const seed = this.hashString(`${element.previewData}|${element.errorCorrection}|${element.model}|${element.magnification}`);
    const rng = this.createRng(seed);

    // Draw deterministic QR-like pattern
    for (let row = 0; row < modules; row++) {
      for (let col = 0; col < modules; col++) {
        if (rng() > 0.5) {
          ctx.fillRect(
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
    this.drawPositioningMarker(ctx, x, y, markerSize);
    this.drawPositioningMarker(ctx, x + size - markerSize, y, markerSize);
    this.drawPositioningMarker(ctx, x, y + size - markerSize, markerSize);
  }

  /**
   * Draw QR code positioning marker (corner squares)
   */
  drawPositioningMarker(ctx, x, y, size) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(x, y, size, size);

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x + size * 0.2, y + size * 0.2, size * 0.6, size * 0.6);

    ctx.fillStyle = '#000000';
    ctx.fillRect(x + size * 0.35, y + size * 0.35, size * 0.3, size * 0.3);
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
