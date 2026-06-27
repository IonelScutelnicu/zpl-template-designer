// Box Renderer
// Renders BOX elements on canvas

import { applyReverseOverlay, captureReverseBg } from './reverseOverlay.js';

/**
 * Renderer for BOX elements
 */
export class BoxRenderer {
  /**
   * Render a BOX element on canvas
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {HTMLCanvasElement} canvas - Main canvas (for reverse overlay)
   * @param {Object} element - BOX element
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
    // ZPL formula: rounding-radius = (rounding-index / 8) * (shorter_side / 2)
    const shorterSide = Math.min(width, height);
    const rounding = Math.round((element.rounding / 8) * (shorterSide / 2));

    const isWhite = element.color !== 'B';

    const drawShape = (targetCtx, color, ox = 0, oy = 0) => {
      targetCtx.save();
      targetCtx.strokeStyle = color;
      targetCtx.fillStyle = color;
      const sx = x + ox;
      const sy = y + oy;
      if (thickness >= width || thickness >= height) {
        if (rounding > 0) {
          this.roundRect(targetCtx, sx, sy, width, height, rounding, true, false);
        } else {
          targetCtx.fillRect(sx, sy, width, height);
        }
      } else {
        const insetX = sx + thickness / 2;
        const insetY = sy + thickness / 2;
        const insetWidth = width - thickness;
        const insetHeight = height - thickness;
        targetCtx.lineWidth = thickness;
        if (rounding > 0) {
          const insetRounding = Math.max(0, Math.min(rounding - thickness / 2, Math.min(insetWidth, insetHeight) / 2));
          this.roundRect(targetCtx, insetX, insetY, insetWidth, insetHeight, insetRounding, false, true);
        } else {
          targetCtx.strokeRect(insetX, insetY, insetWidth, insetHeight);
        }
      }
      targetCtx.restore();
    };

    const captured = element.reverse
      ? captureReverseBg(ctx, canvas, { x, y, width, height })
      : null;

    drawShape(ctx, isWhite ? '#FFFFFF' : '#000000');

    if (captured) {
      applyReverseOverlay(ctx, captured, drawShape);
    }

    if (isWhite) {
      ctx.save();
      ctx.strokeStyle = '#cccccc';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);

      // Outer dashed border
      if (rounding > 0) {
        this.roundRect(ctx, x + 0.5, y + 0.5, width - 1, height - 1, rounding, false, true);
      } else {
        ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
      }

      // Inner dashed border — only when the box is outlined, not fully filled
      const isOutlined = thickness < width && thickness < height;
      if (isOutlined) {
        const innerX = x + thickness;
        const innerY = y + thickness;
        const innerWidth = width - 2 * thickness;
        const innerHeight = height - 2 * thickness;
        if (innerWidth > 1 && innerHeight > 1) {
          const innerRounding = Math.max(0, Math.min(rounding - thickness,
              Math.min(innerWidth, innerHeight) / 2));
          if (innerRounding > 0) {
            this.roundRect(ctx, innerX + 0.5, innerY + 0.5, innerWidth - 1, innerHeight - 1, innerRounding, false, true);
          } else {
            ctx.strokeRect(innerX + 0.5, innerY + 0.5, innerWidth - 1, innerHeight - 1);
          }
        }
      }

      ctx.restore();
    }
  }

  /**
   * Draw rounded rectangle helper
   */
  roundRect(ctx, x, y, width, height, radius, fill, stroke) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + r, r);
    ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
    ctx.arcTo(x, y + height, x, y + height - r, r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();

    if (fill) {
      ctx.fill();
    }
    if (stroke) {
      ctx.stroke();
    }
  }
}
