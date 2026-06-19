// Diagonal Line Renderer
// Renders DIAGONALLINE elements on canvas

import { applyReverseOverlay, captureReverseBg } from './reverseOverlay.js';

/**
 * Renderer for DIAGONALLINE elements (^GD)
 */
export class DiagonalLineRenderer {
  /**
   * Render a DIAGONALLINE element on canvas
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {HTMLCanvasElement} canvas - Main canvas (for reverse overlay)
   * @param {Object} element - DIAGONALLINE element
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

    const isWhite = element.color !== 'B';

    // ^GD draws the diagonal corner-to-corner across the w×h box, then thickens it
    // by t in the +x direction — a parallelogram (matching Labelary). The band
    // therefore extends t beyond the box's right edge.
    //   'R' (/): line (0,h)->(w,0)  → verts (0,h),(t,h),(w+t,0),(w,0)
    //   'L' (\): line (0,0)->(w,h)  → verts (0,0),(t,0),(w+t,h),(w,h)
    const pts = element.orientation === 'L'
      ? [[0, 0], [thickness, 0], [width + thickness, height], [width, height]]
      : [[0, height], [thickness, height], [width + thickness, 0], [width, 0]];

    const drawShape = (targetCtx, color, ox = 0, oy = 0) => {
      targetCtx.save();
      targetCtx.fillStyle = color;
      targetCtx.beginPath();
      targetCtx.moveTo(x + pts[0][0] + ox, y + pts[0][1] + oy);
      for (let i = 1; i < pts.length; i++) {
        targetCtx.lineTo(x + pts[i][0] + ox, y + pts[i][1] + oy);
      }
      targetCtx.closePath();
      targetCtx.fill();
      targetCtx.restore();
    };

    const captured = element.reverse
      ? captureReverseBg(ctx, canvas, { x, y, width: width + thickness, height })
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
      ctx.beginPath();
      ctx.moveTo(x + pts[0][0], y + pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(x + pts[i][0], y + pts[i][1]);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
  }
}
