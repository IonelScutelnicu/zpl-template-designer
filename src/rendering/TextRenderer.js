// Text Renderer
// Renders TEXT elements on canvas

import { ZPL_FONTS } from '../config/constants.js';
import { applyReverseOverlay, captureReverseBg } from './reverseOverlay.js';

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

    // ^FR: snapshot the bg BEFORE drawing so the mask only sees pixels
    // that were already there. Sampling after the draw would treat the
    // element's own ink as "previously dark" and flip its whole shape.
    let captured = null;
    if (element.reverse) {
      const rotated = element.orientation === 'R' || element.orientation === 'B';
      captured = captureReverseBg(ctx, canvas, {
        x,
        y,
        width: rotated ? textHeight : textWidth,
        height: rotated ? textWidth : textHeight,
      });
    }

    // Apply rotation based on orientation (ZPL: N=0°, R=90° CW, I=180°, B=270° CW)
    drawTransformedText(ctx, '#000000');

    if (captured) {
      applyReverseOverlay(ctx, captured, (tempCtx, color, ox, oy) => {
        drawTransformedText(tempCtx, color, ox, oy);
      });
    }

    ctx.restore();
  }
}
