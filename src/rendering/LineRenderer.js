// Line Renderer
// Renders LINE elements on canvas

import { applyReverseOverlay, captureReverseBg } from './reverseOverlay.js';

/**
 * Renderer for LINE elements
 */
export class LineRenderer {
  /**
   * Render a LINE element on canvas
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {HTMLCanvasElement} canvas - Main canvas (for reverse overlay)
   * @param {Object} element - LINE element
   * @param {Object} _labelSettings - Label settings (unused, kept for uniform signature)
   * @param {Object} transform - Transform parameters {scale, homeX, homeY, labelTop}
   */
  render(ctx, canvas, element, _labelSettings, transform) {
    const { scale, homeX, homeY, labelTop } = transform;

    const x = (element.x + homeX) * scale;
    const y = (element.y + homeY + labelTop) * scale;

    let w, h;
    if (element.orientation === 'V') {
      w = element.thickness;
      h = element.width;
    } else {
      w = element.width;
      h = element.thickness;
    }

    const width = w * scale;
    const height = h * scale;
    // ZPL formula: rounding-radius = (rounding-index / 8) * (shorter_side / 2)
    const shorterSide = Math.min(width, height);
    const rounding = Math.round(((element.rounding || 0) / 8) * (shorterSide / 2));

    const isWhite = element.color !== 'B';

    const drawShape = (targetCtx, color, ox = 0, oy = 0) => {
      targetCtx.save();
      targetCtx.fillStyle = color;
      const sx = x + ox;
      const sy = y + oy;
      if (rounding > 0) {
        this.roundRect(targetCtx, sx, sy, width, height, rounding, true, false);
      } else {
        targetCtx.fillRect(sx, sy, width, height);
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

    // White elements are invisible on the white canvas background; draw a faint dashed
    // outline so the element remains selectable and editable during design
    if (isWhite) {
      ctx.save();
      ctx.strokeStyle = '#cccccc';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      if (rounding > 0) {
        this.roundRect(ctx, x + 0.5, y + 0.5, width - 1, height - 1, rounding, false, true);
      } else {
        ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
      }
      ctx.restore();
    }
  }

  /**
   * Draw rounded rectangle helper
   */
  roundRect(ctx, x, y, width, height, radius, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();

    if (fill) {
      ctx.fill();
    }
    if (stroke) {
      ctx.stroke();
    }
  }
}
