// Text Block Renderer
// Renders TEXTBLOCK elements on canvas with word wrapping and truncation

import { ZPL_FONTS } from '../config/constants.js';
import { LINE_HEIGHT_RATIO } from '../utils/geometry.js';
import { applyReverseOverlay, captureReverseBg } from './reverseOverlay.js';

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

    // Hard-break a word that exceeds maxWidth into character-level chunks
    const breakWord = (word, maxWidth) => {
      const chunks = [];
      let chunk = '';
      for (const char of word) {
        const test = chunk + char;
        if (chunk && ctx.measureText(test).width * scaleX > maxWidth) {
          chunks.push(chunk);
          chunk = char;
        } else {
          chunk = test;
        }
      }
      if (chunk) chunks.push(chunk);
      return chunks;
    };

    // Text wrapping with hard-break for long words
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    words.forEach(word => {
      const testLine = currentLine + (currentLine ? ' ' : '') + word;
      const scaledWidth = ctx.measureText(testLine).width * scaleX;

      if (scaledWidth > blockWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }

      // Hard-break current line if the single word still exceeds blockWidth
      if (ctx.measureText(currentLine).width * scaleX > blockWidth) {
        const chunks = breakWord(currentLine, blockWidth);
        for (let i = 0; i < chunks.length - 1; i++) {
          lines.push(chunks[i]);
        }
        currentLine = chunks[chunks.length - 1] || '';
      }
    });

    if (currentLine) {
      lines.push(currentLine);
    }

    // ^TB truncates text that exceeds the block height
    const baseLineHeight = fontSize * LINE_HEIGHT_RATIO;
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

    const captured = element.reverse
      ? captureReverseBg(ctx, canvas, { x, y, width: bboxW, height: bboxH })
      : null;

    // Main drawing with rotation
    ctx.save();
    applyRotation(ctx, x, y);
    drawLines(ctx, 0, 0, '#000000');
    ctx.restore();

    if (captured) {
      applyReverseOverlay(ctx, captured, (tempCtx, color, ox, oy) => {
        tempCtx.save();
        applyRotation(tempCtx, x + ox, y + oy);
        drawLines(tempCtx, 0, 0, color);
        tempCtx.restore();
      });
    }
  }
}
