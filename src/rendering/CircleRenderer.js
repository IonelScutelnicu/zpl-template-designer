// Circle/Ellipse Renderer
// Renders CIRCLE elements on canvas

/**
 * Renderer for CIRCLE elements (ellipses and circles)
 */
export class CircleRenderer {
  /**
   * Render a CIRCLE element on canvas
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {Object} element - CIRCLE element
   * @param {Object} transform - Transform parameters {scale, homeX, homeY, labelTop}
   */
  render(ctx, element, transform) {
    const { scale, homeX, homeY, labelTop } = transform;

    const x = (element.x + homeX) * scale;
    const y = (element.y + homeY + labelTop) * scale;
    const width = element.width * scale;
    const height = element.height * scale;
    const thickness = element.thickness * scale;

    const cx = x + width / 2;
    const cy = y + height / 2;
    const rx = width / 2;
    const ry = height / 2;

    ctx.strokeStyle = element.color === 'B' ? '#000000' : '#FFFFFF';
    ctx.fillStyle = element.color === 'B' ? '#000000' : '#FFFFFF';

    if (thickness * 2 >= width || thickness * 2 >= height) {
      // Filled ellipse (thickness fills entire shape)
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Outlined ellipse with inset stroke
      const insetRx = rx - thickness / 2;
      const insetRy = ry - thickness / 2;
      ctx.lineWidth = thickness;
      ctx.beginPath();
      ctx.ellipse(cx, cy, insetRx, insetRy, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
