// Graphic Field Renderer
// Renders GRAPHIC elements on canvas by drawing the decoded 1-bit bitmap.

import { applyReverseOverlay, captureReverseBg } from './reverseOverlay.js';

export class GraphicFieldRenderer {
  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {HTMLCanvasElement} canvas - Main canvas (for reverse overlay)
   * @param {Object} element - GraphicFieldElement
   * @param {Object} _labelSettings - Label settings (unused, kept for uniform signature)
   * @param {Object} transform - {scale, homeX, homeY, labelTop}
   */
  render(ctx, canvas, element, _labelSettings, transform) {
    const { scale, homeX, homeY, labelTop } = transform;
    const x = (element.x + homeX) * scale;
    const y = (element.y + homeY + labelTop) * scale;
    const width = element.widthDots * scale;
    const height = element.heightDots * scale;
    const orientation = element.orientation || 'N';

    if (element.isOpaque && element.isOpaque()) {
      const opaqueBbox = this._screenBbox(x, y, width, height, orientation);
      const captured = element.reverse ? captureReverseBg(ctx, canvas, opaqueBbox) : null;
      this._withOrientation(ctx, x, y, width, height, orientation, (lx, ly) => {
        this._renderOpaquePlaceholder(ctx, lx, ly, width, height);
      });
      if (captured) {
        applyReverseOverlay(ctx, captured, (tempCtx, color, ox, oy) => {
          tempCtx.save();
          tempCtx.fillStyle = color;
          tempCtx.fillRect(opaqueBbox.x + ox, opaqueBbox.y + oy, opaqueBbox.width, opaqueBbox.height);
          tempCtx.restore();
        });
      }
      return;
    }

    const imageData = element.ensureImageData ? element.ensureImageData() : null;
    if (!imageData) {
      this._withOrientation(ctx, x, y, width, height, orientation, (lx, ly) => {
        this._renderEmptyPlaceholder(ctx, lx, ly, width, height);
      });
      return;
    }

    const bbox = this._screenBbox(x, y, width, height, orientation);
    const captured = element.reverse ? captureReverseBg(ctx, canvas, bbox) : null;

    // Always use the drawImage path (not putImageData) because:
    // 1. putImageData ignores canvas transforms (rotation won't work)
    // 2. putImageData writes pixels directly without alpha compositing,
    //    so transparent (white) pixels would overwrite content behind them.
    //
    // When ^FR is on, the main pass paints only the ink pixels (white
    // pixels stay transparent) so anything behind keeps showing through —
    // matching Zebra's "field acts as a mask" semantics.
    const mainSource = element.reverse
      ? this._buildTintedCanvas(imageData, '#000000')
      : (() => {
          const off = document.createElement('canvas');
          off.width = imageData.width;
          off.height = imageData.height;
          off.getContext('2d').putImageData(imageData, 0, 0);
          return off;
        })();
    const prevSmoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    this._withOrientation(ctx, x, y, width, height, orientation, (lx, ly) => {
      ctx.drawImage(mainSource, lx, ly, width, height);
    });
    ctx.imageSmoothingEnabled = prevSmoothing;

    if (captured) {
      // Tinted-white version of the bitmap, masked to the captured
      // dark-bg pixels — flips the bitmap's ink to white only where it
      // overlaps prior dark pixels.
      const tinted = this._buildTintedCanvas(imageData, '#FFFFFF');
      applyReverseOverlay(ctx, captured, (tempCtx, _color, ox, oy) => {
        const prev = tempCtx.imageSmoothingEnabled;
        tempCtx.imageSmoothingEnabled = false;
        this._withOrientation(tempCtx, x + ox, y + oy, width, height, orientation, (lx, ly) => {
          tempCtx.drawImage(tinted, lx, ly, width, height);
        });
        tempCtx.imageSmoothingEnabled = prev;
      });
    }
  }

  /**
   * Build an off-screen canvas matching `imageData` dimensions where every
   * dark source pixel becomes the given `color` and every light source
   * pixel becomes transparent. Used so a reverse overlay can re-issue just
   * the bitmap's ink in white.
   */
  _buildTintedCanvas(imageData, color) {
    const out = document.createElement('canvas');
    out.width = imageData.width;
    out.height = imageData.height;
    const octx = out.getContext('2d');
    const tinted = octx.createImageData(imageData.width, imageData.height);
    const src = imageData.data;
    const dst = tinted.data;
    // Parse #RRGGBB
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    // bitmapToImageData encodes ink as opaque black (0,0,0,255) and
    // background as fully transparent (0,0,0,0), so alpha alone tells us
    // which pixels are ink — checking RGB sum would (incorrectly) treat
    // transparent pixels as ink because they're (0,0,0).
    for (let i = 0; i < src.length; i += 4) {
      if (src[i + 3] > 0) {
        dst[i] = r;
        dst[i + 1] = g;
        dst[i + 2] = b;
        dst[i + 3] = 255;
      }
    }
    octx.putImageData(tinted, 0, 0);
    return out;
  }

  /**
   * Compute the screen-space bbox (after rotation) so the reverse overlay
   * can sample the right region. Mirrors _withOrientation's anchor model.
   */
  _screenBbox(x, y, width, height, orientation) {
    if (orientation === 'R' || orientation === 'B') {
      return { x, y, width: height, height: width };
    }
    return { x, y, width, height };
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
