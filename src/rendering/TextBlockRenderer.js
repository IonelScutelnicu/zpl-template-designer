// Text Block Renderer
// Renders TEXTBLOCK elements on canvas with word wrapping and truncation

import { resolveFontLineHeight, resolveFontMetrics, drawStyledText, wrapStyledText } from '../utils/fontMetrics.js';
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

    const blockWidth = element.blockWidth * scale;
    const blockHeight = element.blockHeight * scale;

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
    ctx.wordSpacing = fontConfig.wordSpacing ? `${fontConfig.wordSpacing * fontSize}px` : '0px';

    // yOffset: dots (×scale) for bitmap fonts, fraction-of-em for Font 0.
    const yOffset = isBitmap
      ? (fontConfig.yOffset || 0) * scale
      : fontSize * (-0.05 + (fontConfig.yOffset || 0));

    const raw = element.previewText || '';
    const text = fontConfig.uppercase ? raw.toUpperCase() : fontConfig.filterLowercase ? raw.replace(/[a-z]/g, ' ') : raw;

    // Wrap with hard-break; ^TB uses a constant block width for every line.
    const lines = wrapStyledText(ctx, text, fontConfig, fontSize, scaleX, () => blockWidth);

    // ^TB truncates text that exceeds the block height
    const baseLineHeight = resolveFontLineHeight(fontMetrics, 1, scale, 'textBlockLineHeightRatio', 'fontSize');
    const maxVisibleLines = Math.max(1, Math.floor(blockHeight / baseLineHeight));
    const visibleLines = lines.slice(0, maxVisibleLines);

    const orientation = element.orientation || 'N';

    // Helper to draw visible lines at local coordinates (0,0 based)
    const drawLines = (targetCtx, offsetX, offsetY, color) => {
      targetCtx.fillStyle = color;
      targetCtx.font = font;
      targetCtx.textBaseline = baseline;
      targetCtx.letterSpacing = fontConfig.letterSpacing ? `${fontConfig.letterSpacing * fontSize}px` : '0px';
      targetCtx.wordSpacing = fontConfig.wordSpacing ? `${fontConfig.wordSpacing * fontSize}px` : '0px';

      visibleLines.forEach((line, i) => {
        const lineY = offsetY + (i * baseLineHeight) + yOffset;

        targetCtx.save();
        targetCtx.translate(offsetX + fontXOffset, lineY);
        targetCtx.scale(scaleX, 1);
        drawStyledText(targetCtx, line, 0, fillY, fontConfig, fontSize);
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
