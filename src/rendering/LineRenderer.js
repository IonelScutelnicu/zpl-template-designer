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

    ctx.fillStyle = '#000000';
    ctx.fillRect(x, y, width, height);
  }
}
