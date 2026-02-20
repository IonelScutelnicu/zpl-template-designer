// Box Renderer
// Renders BOX elements on canvas

/**
 * Renderer for BOX elements
 */
export class BoxRenderer {
  /**
   * Render a BOX element on canvas
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {Object} element - BOX element
   * @param {Object} transform - Transform parameters {scale, homeX, homeY, labelTop}
   */
  render(ctx, element, transform) {
    const { scale, homeX, homeY, labelTop } = transform;

    const x = (element.x + homeX) * scale;
    const y = (element.y + homeY + labelTop) * scale;
    const width = element.width * scale;
    const height = element.height * scale;
    const thickness = element.thickness * scale;
    const rawRounding = element.rounding * scale;
    const rounding = Math.max(0, Math.min(rawRounding, Math.floor(Math.min(width, height) / 2)));

    const isWhite = element.color !== 'B';
    ctx.strokeStyle = isWhite ? '#FFFFFF' : '#000000';
    ctx.fillStyle = isWhite ? '#FFFFFF' : '#000000';

    if (thickness >= width || thickness >= height) {
      // Filled box (thickness fills entire box)
      if (rounding > 0) {
        this.roundRect(ctx, x, y, width, height, rounding, true, false);
      } else {
        ctx.fillRect(x, y, width, height);
      }
    } else {
      // Outlined box with inset stroke
      // Adjust the stroke path so the thickness stays inside the element bounds
      const insetX = x + thickness / 2;
      const insetY = y + thickness / 2;
      const insetWidth = width - thickness;
      const insetHeight = height - thickness;

      ctx.lineWidth = thickness;

      if (rounding > 0) {
        // Adjust rounding to be relative to inset dimensions
        const insetRounding = Math.max(0, Math.min(rounding - thickness / 2, Math.floor(Math.min(insetWidth, insetHeight) / 2)));
        this.roundRect(ctx, insetX, insetY, insetWidth, insetHeight, insetRounding, false, true);
      } else {
        ctx.strokeRect(insetX, insetY, insetWidth, insetHeight);
      }
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
              Math.floor(Math.min(innerWidth, innerHeight) / 2)));
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
