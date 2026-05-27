// Field Block Renderer
// Renders FIELDBLOCK elements on canvas with word wrapping and justification

import { resolveFontLineHeight, resolveFontMetrics } from '../utils/fontMetrics.js';
import { LINE_HEIGHT_RATIO } from '../utils/geometry.js';
import { applyReverseOverlay, captureReverseBg } from './reverseOverlay.js';

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

    const blockWidth = element.blockWidth * scale;

    const fontMetrics = resolveFontMetrics(element, labelSettings, scale);
    const { fontConfig, fontSize, fontWidth, scaleX, snappedHeight, isBitmap } = fontMetrics;
    const font = `${fontConfig.weight} ${fontSize}px ${fontConfig.family}`;

    const x = (element.x + homeX) * scale;
    const y = (element.y + homeY + labelTop) * scale;
    const fontXOffset = fontWidth * (fontConfig.xOffset || 0);

    // Bitmap fonts align each line's cap top via an alphabetic baseline placed at the
    // cap height; Font 0 keeps the top-baseline nudge. (top of capitals at Y)
    const baseline = isBitmap ? 'alphabetic' : 'top';
    const fillY = isBitmap ? snappedHeight * scale : 0;
    ctx.font = font;
    ctx.textBaseline = baseline;
    ctx.letterSpacing = fontConfig.letterSpacing ? `${fontConfig.letterSpacing * fontSize}px` : '0px';

    // yOffset: dots (×scale) for bitmap fonts, fraction-of-em for Font 0.
    const yOffset = isBitmap
      ? (fontConfig.yOffset || 0) * scale
      : fontSize * (-0.05 + (fontConfig.yOffset || 0));

    const raw = element.previewText || '';
    const text = fontConfig.uppercase ? raw.toUpperCase() : fontConfig.filterLowercase ? raw.replace(/[a-z]/g, ' ') : raw;

    const hangingIndentPx = (element.hangingIndent || 0) * scale;

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

      // Hard-break current line if the single word still exceeds maxWidth
      const curMaxWidth = lines.length === 0
        ? blockWidth
        : Math.max(0, blockWidth - hangingIndentPx);
      if (ctx.measureText(currentLine).width * scaleX > curMaxWidth) {
        const chunks = breakWord(currentLine, curMaxWidth);
        for (let i = 0; i < chunks.length - 1; i++) {
          lines.push(chunks[i]);
        }
        currentLine = chunks[chunks.length - 1] || '';
      }
    });

    if (currentLine) {
      lines.push(currentLine);
    }

    // Draw lines (respect maxLines)
    const maxLines = element.maxLines || lines.length;
    // Line spacing is only between lines, not after the last line
    const lineSpacing = (element.lineSpacing || 0) * scale;
    const baseLineHeight = resolveFontLineHeight(fontMetrics, LINE_HEIGHT_RATIO, scale);
    const lineHeight = baseLineHeight + lineSpacing;
    const blockHeight = baseLineHeight * maxLines + lineSpacing * Math.max(0, maxLines - 1);

    const orientation = element.orientation || 'N';

    // Helper to draw all lines at local coordinates (0,0 based)
    const drawLines = (targetCtx, offsetX, offsetY, color) => {
      targetCtx.fillStyle = color;
      targetCtx.font = font;
      targetCtx.textBaseline = baseline;
      targetCtx.letterSpacing = fontConfig.letterSpacing ? `${fontConfig.letterSpacing * fontSize}px` : '0px';

      lines.forEach((line, i) => {
        const measuredWidth = targetCtx.measureText(line).width * scaleX;
        // Clamp overflow lines to the last line's Y position (ZPL ^FB spec behavior)
        const clampedIndex = Math.min(i, maxLines - 1);
        const lineY = offsetY + (clampedIndex * lineHeight) + yOffset;
        const isLastLine = (i === lines.length - 1);
        const isFirstLine = i === 0;
        const indent = isFirstLine ? 0 : hangingIndentPx;
        const lineBlockWidth = isFirstLine ? blockWidth : Math.max(0, blockWidth - hangingIndentPx);
        const lineStartX = offsetX + indent + fontXOffset;

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
              targetCtx.fillText(word, 0, fillY);
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
        targetCtx.fillText(line, 0, fillY);
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
