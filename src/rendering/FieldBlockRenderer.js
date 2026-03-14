// Field Block Renderer
// Renders FIELDBLOCK elements on canvas with word wrapping and justification

import { ZPL_FONTS } from '../config/constants.js';
import { LINE_HEIGHT_RATIO } from '../utils/geometry.js';

/**
 * Renderer for FIELDBLOCK elements
 */
export class FieldBlockRenderer {
  /**
   * Render a FIELDBLOCK element on canvas
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {HTMLCanvasElement} canvas - Canvas element (for reverse overlay)
   * @param {Object} element - FIELDBLOCK element
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

    // Nudge text upward to better match ZPL printer positioning.
    const yOffset = fontSize * -0.05;

    const text = element.previewText || '';

    const hangingIndentPx = (element.hangingIndent || 0) * scale;

    // Simple text wrapping - account for horizontal scaling when measuring
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    words.forEach(word => {
      const testLine = currentLine + (currentLine ? ' ' : '') + word;
      const metrics = ctx.measureText(testLine);
      // Apply scaleX to measured width for accurate wrapping
      const scaledWidth = metrics.width * scaleX;

      // First line: full blockWidth. Lines 2+: blockWidth minus hanging indent.
      const maxWidth = lines.length === 0
        ? blockWidth
        : Math.max(0, blockWidth - hangingIndentPx);

      if (scaledWidth > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    });

    if (currentLine) {
      lines.push(currentLine);
    }

    // Draw lines (respect maxLines)
    const maxLines = element.maxLines || lines.length;
    // Line spacing is only between lines, not after the last line
    const lineSpacing = (element.lineSpacing || 0) * scale;
    const baseLineHeight = fontSize * LINE_HEIGHT_RATIO;
    const lineHeight = baseLineHeight + lineSpacing;
    const blockHeight = baseLineHeight * maxLines + lineSpacing * Math.max(0, maxLines - 1);

    const orientation = element.orientation || 'N';

    // Helper to draw all lines at local coordinates (0,0 based)
    const drawLines = (targetCtx, offsetX, offsetY, color) => {
      targetCtx.fillStyle = color;
      targetCtx.font = font;
      targetCtx.textBaseline = 'top';

      lines.forEach((line, i) => {
        const measuredWidth = targetCtx.measureText(line).width * scaleX;
        // Clamp overflow lines to the last line's Y position (ZPL ^FB spec behavior)
        const clampedIndex = Math.min(i, maxLines - 1);
        const lineY = offsetY + (clampedIndex * lineHeight) + yOffset;
        const isLastLine = (i === lines.length - 1);
        const isFirstLine = i === 0;
        const indent = isFirstLine ? 0 : hangingIndentPx;
        const lineBlockWidth = isFirstLine ? blockWidth : Math.max(0, blockWidth - hangingIndentPx);
        const lineStartX = offsetX + indent;

        // Handle justified text
        if (element.justification === 'J') {
          const jWords = line.split(/\s+/).filter(w => w.length > 0);

          // Only justify if: not last line AND has multiple words AND line is shorter than block width
          if (!isLastLine && jWords.length > 1 && measuredWidth < lineBlockWidth) {
            const wordWidths = jWords.map(word => targetCtx.measureText(word).width * scaleX);
            const totalWordWidth = wordWidths.reduce((sum, w) => sum + w, 0);
            const spaceBetweenWords = (lineBlockWidth - totalWordWidth) / (jWords.length - 1);

            let currentX = lineStartX;
            jWords.forEach((word, wordIndex) => {
              targetCtx.save();
              targetCtx.translate(currentX, lineY);
              targetCtx.scale(scaleX, 1);
              targetCtx.fillText(word, 0, 0);
              targetCtx.restore();
              currentX += wordWidths[wordIndex] + spaceBetweenWords;
            });
            return;
          }
        }

        let lineX = lineStartX;
        if (element.justification === 'C') {
          lineX = lineStartX + (lineBlockWidth - measuredWidth) / 2;
        } else if (element.justification === 'R') {
          lineX = lineStartX + lineBlockWidth - measuredWidth;
        }

        targetCtx.save();
        targetCtx.translate(lineX, lineY);
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
