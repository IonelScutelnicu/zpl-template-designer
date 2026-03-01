// Text Block Renderer
// Renders TEXTBLOCK elements on canvas with word wrapping and truncation

import { ZPL_FONTS } from '../config/constants.js';

/**
 * Renderer for TEXTBLOCK elements (^TB command)
 */
export class TextBlockRenderer {
  /**
   * Render a TEXTBLOCK element on canvas
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {HTMLCanvasElement} canvas - Canvas element (for reverse overlay)
   * @param {Object} element - TEXTBLOCK element
   * @param {Object} labelSettings - Label settings
   * @param {Object} transform - Transform parameters {scale, homeX, homeY, labelTop}
   */
  render(ctx, canvas, element, labelSettings, transform) {
    const { scale, homeX, homeY, labelTop } = transform;

    const x = (element.x + homeX) * scale;
    const y = (element.y + homeY + labelTop) * scale;

    // Use label default if element fontSize is 0 or not set
    const rawFontSize = element.fontSize || labelSettings.defaultFontHeight || 20;
    const fontSize = rawFontSize * scale;
    const blockWidth = element.blockWidth * scale;
    const blockHeight = element.blockHeight * scale;

    // Get font ID from element or use label's default
    const fontId = element.fontId || labelSettings.fontId || '0';
    const fontConfig = ZPL_FONTS[fontId] || ZPL_FONTS['default'];
    const font = `${fontConfig.weight} ${fontSize}px ${fontConfig.family}`;

    // Calculate horizontal scale for font aspect ratio
    const rawFontWidth = element.fontWidth || labelSettings.defaultFontWidth || 20;
    const fontWidth = rawFontWidth * scale;
    const scaleX = fontWidth / fontSize;

    ctx.font = font;
    ctx.textBaseline = 'top';

    // Nudge text upward to better match ZPL printer positioning.
    const yOffset = fontSize * -0.05;

    const text = element.previewText || '';

    // Simple text wrapping - account for horizontal scaling when measuring
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    words.forEach(word => {
      const testLine = currentLine + (currentLine ? ' ' : '') + word;
      const metrics = ctx.measureText(testLine);
      const scaledWidth = metrics.width * scaleX;

      if (scaledWidth > blockWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    });

    if (currentLine) {
      lines.push(currentLine);
    }

    // ^TB truncates text that exceeds the block height
    const baseLineHeight = fontSize * 1.2;
    const maxVisibleLines = Math.max(1, Math.floor(blockHeight / baseLineHeight));
    const visibleLines = lines.slice(0, maxVisibleLines);

    const orientation = element.orientation || 'N';

    // Helper to draw visible lines at local coordinates (0,0 based)
    const drawLines = (targetCtx, offsetX, offsetY, color) => {
      targetCtx.fillStyle = color;
      targetCtx.font = font;
      targetCtx.textBaseline = 'top';

      visibleLines.forEach((line, i) => {
        const lineY = offsetY + (i * baseLineHeight) + yOffset;

        targetCtx.save();
        targetCtx.translate(offsetX, lineY);
        targetCtx.scale(scaleX, 1);
        targetCtx.fillText(line, 0, 0);
        targetCtx.restore();
      });
    };

    // Screen-space bounding box (swapped for R/B orientations)
    let bboxW = blockWidth, bboxH = blockHeight;
    if (orientation === 'R' || orientation === 'B') {
      bboxW = blockHeight;
      bboxH = blockWidth;
    }

    // Helper to apply rotation transform on a context
    const applyRotation = (targetCtx, originX, originY) => {
      if (orientation === 'R') {
        targetCtx.translate(originX + blockHeight, originY);
        targetCtx.rotate(Math.PI / 2);
      } else if (orientation === 'I') {
        targetCtx.translate(originX + blockWidth, originY + blockHeight);
        targetCtx.rotate(Math.PI);
      } else if (orientation === 'B') {
        targetCtx.translate(originX, originY + blockWidth);
        targetCtx.rotate(-Math.PI / 2);
      } else {
        targetCtx.translate(originX, originY);
      }
    };

    const createReverseOverlay = () => {
      const left = Math.max(0, Math.floor(x));
      const top = Math.max(0, Math.floor(y));
      const right = Math.min(canvas.width, Math.ceil(x + bboxW));
      const bottom = Math.min(canvas.height, Math.ceil(y + bboxH));
      const width = Math.max(0, right - left);
      const height = Math.max(0, bottom - top);
      if (width === 0 || height === 0) return null;

      const imageData = ctx.getImageData(left, top, width, height);
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = width;
      maskCanvas.height = height;
      const maskCtx = maskCanvas.getContext('2d');
      const maskData = maskCtx.createImageData(width, height);
      const src = imageData.data;
      const dst = maskData.data;
      const threshold = 40 * 3;

      for (let i = 0; i < src.length; i += 4) {
        const brightness = src[i] + src[i + 1] + src[i + 2];
        if (brightness < threshold) {
          dst[i + 3] = 255;
        }
      }

      maskCtx.putImageData(maskData, 0, 0);

      const textCanvas = document.createElement('canvas');
      textCanvas.width = width;
      textCanvas.height = height;
      const textCtx = textCanvas.getContext('2d');

      // Draw white text with same rotation on temp canvas
      textCtx.save();
      applyRotation(textCtx, x - left, y - top);
      drawLines(textCtx, 0, 0, '#FFFFFF');
      textCtx.restore();

      textCtx.globalCompositeOperation = 'destination-in';
      textCtx.drawImage(maskCanvas, 0, 0);

      return { canvas: textCanvas, x: left, y: top };
    };

    const overlay = element.reverse ? createReverseOverlay() : null;

    // Main drawing with rotation
    ctx.save();
    applyRotation(ctx, x, y);
    drawLines(ctx, 0, 0, '#000000');
    ctx.restore();

    if (overlay) {
      ctx.drawImage(overlay.canvas, overlay.x, overlay.y);
    }
  }
}
