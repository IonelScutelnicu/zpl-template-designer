// Line Renderer
// Renders LINE elements on canvas

/**
 * Renderer for LINE elements
 */
export class LineRenderer {
  /**
   * Render a LINE element on canvas
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {Object} element - LINE element
   * @param {Object} transform - Transform parameters {scale, homeX, homeY, labelTop}
   */
  render(ctx, element, transform) {
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
    // Clamp rounding so it never exceeds half the shorter side, preventing self-intersecting paths
    const rawRounding = (element.rounding || 0) * scale;
    const rounding = Math.max(0, Math.min(rawRounding, Math.floor(Math.min(width, height) / 2)));

    const isWhite = element.color !== 'B';
    ctx.fillStyle = isWhite ? '#FFFFFF' : '#000000';

    if (rounding > 0) {
      this.roundRect(ctx, x, y, width, height, rounding, true, false);
    } else {
      ctx.fillRect(x, y, width, height);
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
