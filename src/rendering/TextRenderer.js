// Text Renderer
// Renders TEXT elements on canvas

import { ZPL_FONTS } from '../config/constants.js';

/**
 * Renderer for TEXT elements
 */
export class TextRenderer {
  /**
   * Render a TEXT element on canvas
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {HTMLCanvasElement} canvas - Canvas element (for reverse overlay)
   * @param {Object} element - TEXT element
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

    ctx.save();

    const text = element.previewText || '';

    // Get font ID from element or use label's default
    const fontId = element.fontId || labelSettings.fontId || '0';
    const fontConfig = ZPL_FONTS[fontId] || ZPL_FONTS['default'];
    const font = `${fontConfig.weight} ${fontSize}px ${fontConfig.family}`;

    // Calculate horizontal scale for font aspect ratio
    // Use label default if element fontWidth is 0 or not set
    const rawFontWidth = element.fontWidth || labelSettings.defaultFontWidth || 20;
    const fontWidth = rawFontWidth * scale;
    const scaleX = fontWidth / fontSize;

    ctx.font = font;
    ctx.textBaseline = 'top';
    // Measure text width at unscaled size, then apply horizontal scale
    const measuredWidth = ctx.measureText(text).width;
    const textWidth = measuredWidth * scaleX;
    const textHeight = fontSize;

    // Nudge text upward to better match ZPL printer positioning.
    // Canvas textBaseline='top' adds slight padding above glyphs for diacritics;
    // ZPL printers place the top of capital letters at the Y coordinate.
    const yOffset = fontSize * -0.05;

    const drawTransformedText = (context, color, offsetX = 0, offsetY = 0) => {
      context.save();
      context.fillStyle = color;
      context.font = font;
      context.textBaseline = 'top';

      if (element.orientation === 'R') {
        context.translate(x + textHeight + offsetX, y + offsetY + yOffset);
        context.rotate(Math.PI / 2);
        context.scale(scaleX, 1);
      } else if (element.orientation === 'I') {
        context.translate(x + textWidth + offsetX, y + textHeight + offsetY + yOffset);
        context.rotate(Math.PI);
        context.scale(scaleX, 1);
      } else if (element.orientation === 'B') {
        context.translate(x + offsetX, y + textWidth + offsetY + yOffset);
        context.rotate(-Math.PI / 2);
        context.scale(scaleX, 1);
      } else {
        context.translate(x + offsetX, y + offsetY + yOffset);
        context.scale(scaleX, 1);
      }

      context.fillText(text, 0, 0);
      context.restore();
    };

    const createReverseOverlay = (bboxX, bboxY, bboxW, bboxH) => {
      const left = Math.max(0, Math.floor(bboxX));
      const top = Math.max(0, Math.floor(bboxY));
      const right = Math.min(canvas.width, Math.ceil(bboxX + bboxW));
      const bottom = Math.min(canvas.height, Math.ceil(bboxY + bboxH));
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
      drawTransformedText(textCtx, '#FFFFFF', -left, -top);
      textCtx.globalCompositeOperation = 'destination-in';
      textCtx.drawImage(maskCanvas, 0, 0);

      return { canvas: textCanvas, x: left, y: top };
    };

    let overlay = null;
    if (element.reverse) {
      if (element.orientation === 'R' || element.orientation === 'B') {
        overlay = createReverseOverlay(x, y, textHeight, textWidth);
      } else {
        overlay = createReverseOverlay(x, y, textWidth, textHeight);
      }
    }

    // Apply rotation based on orientation (ZPL: N=0°, R=90° CW, I=180°, B=270° CW)
    drawTransformedText(ctx, '#000000');
    if (overlay) {
      ctx.drawImage(overlay.canvas, overlay.x, overlay.y);
    }

    ctx.restore();
  }
}
