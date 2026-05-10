// Circle/Ellipse Renderer
// Renders CIRCLE elements on canvas

import { applyReverseOverlay, captureReverseBg } from './reverseOverlay.js';

/**
 * Renderer for CIRCLE elements (ellipses and circles)
 */
export class CircleRenderer {
  /**
   * Render a CIRCLE element on canvas
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {HTMLCanvasElement} canvas - Main canvas (for reverse overlay)
   * @param {Object} element - CIRCLE element
   * @param {Object} _labelSettings - Label settings (unused, kept for uniform signature)
   * @param {Object} transform - Transform parameters {scale, homeX, homeY, labelTop}
   */
  render(ctx, canvas, element, _labelSettings, transform) {
    const { scale, homeX, homeY, labelTop } = transform;

    const x = (element.x + homeX) * scale;
    const y = (element.y + homeY + labelTop) * scale;
    const width = element.width * scale;
    const height = element.height * scale;
    const thickness = element.thickness * scale;

    const drawShape = (targetCtx, color, ox = 0, oy = 0) => {
      const sx = x + ox;
      const sy = y + oy;
      const cx = sx + width / 2;
      const cy = sy + height / 2;
      const rx = width / 2;
      const ry = height / 2;
      targetCtx.save();
      targetCtx.strokeStyle = color;
      targetCtx.fillStyle = color;
      if (thickness * 2 >= width || thickness * 2 >= height) {
        targetCtx.beginPath();
        targetCtx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        targetCtx.fill();
      } else {
        const insetRx = rx - thickness / 2;
        const insetRy = ry - thickness / 2;
        targetCtx.lineWidth = thickness;
        targetCtx.beginPath();
        targetCtx.ellipse(cx, cy, insetRx, insetRy, 0, 0, Math.PI * 2);
        targetCtx.stroke();
      }
      targetCtx.restore();
    };

    const captured = element.reverse
      ? captureReverseBg(ctx, canvas, { x, y, width, height })
      : null;

    drawShape(ctx, element.color === 'B' ? '#000000' : '#FFFFFF');

    if (captured) {
      applyReverseOverlay(ctx, captured, drawShape);
    }
  }
}
