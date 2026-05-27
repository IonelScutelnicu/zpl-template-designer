// Text Renderer
// Renders TEXT elements on canvas

import { resolveFontMetrics } from '../utils/fontMetrics.js';
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

    ctx.save();

    const { fontConfig, fontSize, fontWidth, scaleX, snappedHeight, isBitmap } = resolveFontMetrics(element, labelSettings, scale);
    const raw = element.previewText || '';
    const text = fontConfig.uppercase ? raw.toUpperCase() : fontConfig.filterLowercase ? raw.replace(/[a-z]/g, ' ') : raw;
    const font = `${fontConfig.weight} ${fontSize}px ${fontConfig.family}`;

    // Bitmap fonts: align the cap top to element.y via an alphabetic baseline placed
    // at the rendered cap height (snappedHeight). Font 0 keeps the top-baseline heuristic.
    const baseline = isBitmap ? 'alphabetic' : 'top';
    ctx.font = font;
    ctx.textBaseline = baseline;
    const letterSpacingPx = fontConfig.letterSpacing ? fontConfig.letterSpacing * fontSize : 0;
    ctx.letterSpacing = `${letterSpacingPx}px`;
    // Measure text width at unscaled size, then apply horizontal scale
    const metrics = ctx.measureText(text);
    const measuredWidth = metrics.width;
    const textWidth = measuredWidth * scaleX;
    // Bitmap fonts: the visible block is the rendered cap-ink height (snappedHeight).
    const textHeight = isBitmap ? snappedHeight * scale : fontSize;
    // Bitmap fonts draw from an alphabetic baseline at the cap height, so glyph
    // ink hangs `descent` px below the rotation box. N/B place that descent on a
    // harmless edge, but R/I pivot on textHeight (cap-ink only) and would shove
    // the whole string by the descender. Add it back for R/I. No descender
    // (uppercase/filtered fonts) ⇒ descent≈0, matching their correct look.
    // Font 0 already pivots on the full em (fontSize), so it needs no extra.
    const pivotDescent = isBitmap ? (metrics.actualBoundingBoxDescent || 0) : 0;

    // Vertical placement: bitmap fonts translate to the block top (no nudge) and draw
    // the alphabetic baseline at the cap height so the cap top lands on element.y.
    // Font 0 keeps its top-baseline nudge and draws at local 0.
    // yOffset is a vertical calibration nudge: dots (×scale) for bitmap fonts,
    // fraction-of-em for scalable Font 0. Applied in the local frame so it
    // rotates with the text.
    const translateNudge = isBitmap
      ? (fontConfig.yOffset || 0) * scale
      : fontSize * (-0.05 + (fontConfig.yOffset || 0));
    const fillY = isBitmap ? textHeight : 0;
    const fontXOffset = fontWidth * (fontConfig.xOffset || 0);

    const drawTransformedText = (context, color, offsetX = 0, offsetY = 0) => {
      context.save();
      context.fillStyle = color;
      context.font = font;
      context.textBaseline = baseline;
      context.letterSpacing = `${letterSpacingPx}px`;

      if (element.orientation === 'R') {
        context.translate(x + textHeight + pivotDescent + offsetX, y + offsetY);
        context.rotate(Math.PI / 2);
        context.scale(scaleX, 1);
      } else if (element.orientation === 'I') {
        context.translate(x + textWidth + offsetX, y + textHeight + pivotDescent + offsetY);
        context.rotate(Math.PI);
        context.scale(scaleX, 1);
      } else if (element.orientation === 'B') {
        context.translate(x + offsetX, y + textWidth + offsetY);
        context.rotate(-Math.PI / 2);
        context.scale(scaleX, 1);
      } else {
        context.translate(x + offsetX, y + offsetY);
        context.scale(scaleX, 1);
      }

      // Per-font nudges live in the local (post-rotate) frame so they travel
      // with the rotated text. fillText x is scaled by scaleX, so divide the
      // horizontal nudge to keep it exactly fontXOffset px along the advance.
      context.fillText(text, fontXOffset / scaleX, fillY + translateNudge);
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
