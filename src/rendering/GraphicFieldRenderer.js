// Graphic Field Renderer
// Renders GRAPHIC elements on canvas by drawing the decoded 1-bit bitmap.

export class GraphicFieldRenderer {
  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} element - GraphicFieldElement
   * @param {Object} transform - {scale, homeX, homeY, labelTop}
   */
  render(ctx, element, transform) {
    const { scale, homeX, homeY, labelTop } = transform;
    const x = (element.x + homeX) * scale;
    const y = (element.y + homeY + labelTop) * scale;
    const width = element.widthDots * scale;
    const height = element.heightDots * scale;
    const orientation = element.orientation || 'N';

    if (element.isOpaque && element.isOpaque()) {
      this._withOrientation(ctx, x, y, width, height, orientation, (lx, ly) => {
        this._renderOpaquePlaceholder(ctx, lx, ly, width, height);
      });
      return;
    }

    const imageData = element.ensureImageData ? element.ensureImageData() : null;
    if (!imageData) {
      this._withOrientation(ctx, x, y, width, height, orientation, (lx, ly) => {
        this._renderEmptyPlaceholder(ctx, lx, ly, width, height);
      });
      return;
    }

    // Always use the drawImage path (not putImageData) because:
    // 1. putImageData ignores canvas transforms (rotation won't work)
    // 2. putImageData writes pixels directly without alpha compositing,
    //    so transparent (white) pixels would overwrite content behind them.
    const off = document.createElement('canvas');
    off.width = imageData.width;
    off.height = imageData.height;
    off.getContext('2d').putImageData(imageData, 0, 0);
    const prevSmoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    this._withOrientation(ctx, x, y, width, height, orientation, (lx, ly) => {
      ctx.drawImage(off, lx, ly, width, height);
    });
    ctx.imageSmoothingEnabled = prevSmoothing;
  }

  /**
   * Apply a translate+rotate around the ^FO point so the unrotated bitmap
   * (drawn at local 0,0 with size width×height) lands as the rotated bbox
   * with its top-left at (x,y). Mirrors TextRenderer's anchor model.
   */
  _withOrientation(ctx, x, y, width, height, orientation, drawFn) {
    if (orientation === 'N') {
      drawFn(x, y);
      return;
    }
    ctx.save();
    if (orientation === 'R') {
      ctx.translate(x + height, y);
      ctx.rotate(Math.PI / 2);
    } else if (orientation === 'I') {
      ctx.translate(x + width, y + height);
      ctx.rotate(Math.PI);
    } else if (orientation === 'B') {
      ctx.translate(x, y + width);
      ctx.rotate(-Math.PI / 2);
    }
    drawFn(0, 0);
    ctx.restore();
  }

  _renderOpaquePlaceholder(ctx, x, y, width, height) {
    const w = Math.max(width, 80);
    const h = Math.max(height, 40);
    ctx.save();
    ctx.fillStyle = '#e5e7eb';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#9ca3af';
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.setLineDash([]);
    ctx.fillStyle = '#6b7280';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Unsupported graphic', x + w / 2, y + h / 2);
    ctx.restore();
  }

  _renderEmptyPlaceholder(ctx, x, y, width, height) {
    const w = Math.max(width, 60);
    const h = Math.max(height, 40);
    ctx.save();
    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#cbd5e1';
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.setLineDash([]);
    ctx.restore();
  }
}
