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
    const rounding = element.rounding * scale;

    ctx.strokeStyle = element.color === 'B' ? '#000000' : '#FFFFFF';
    ctx.fillStyle = element.color === 'B' ? '#000000' : '#FFFFFF';

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
        const insetRounding = Math.max(0, rounding - thickness / 2);
        this.roundRect(ctx, insetX, insetY, insetWidth, insetHeight, insetRounding, false, true);
      } else {
        ctx.strokeRect(insetX, insetY, insetWidth, insetHeight);
      }
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
