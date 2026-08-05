// Text Renderer
// Renders TEXT elements on canvas

import { resolveFontMetrics, resolveBaselinePlacement, measureStyledText, drawStyledText } from '../utils/fontMetrics.js';
import { applyReverseOverlay, captureReverseBg } from './reverseOverlay.js';
import { resolvePlaceholders } from '../utils/placeholders.js';
import { collapseLineBreaks } from '../utils/zplFieldData.js';

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

    const fontMetrics = resolveFontMetrics(element, labelSettings, scale);
    const { fontConfig, fontSize, fontWidth, scaleX, snappedHeight, isBitmap } = fontMetrics;
    // ^A collapses line breaks to spaces (ADR 0013) — match it so a multiline
    // Preview Data value looks the same on the canvas as in the Preview.
    const raw = collapseLineBreaks(resolvePlaceholders(element.content, labelSettings?.previewData));
    const text = fontConfig.uppercase ? raw.toUpperCase() : fontConfig.filterLowercase ? raw.replace(/[a-z]/g, ' ') : raw;
    const font = `${fontConfig.weight} ${fontSize}px ${fontConfig.family}`;

    const { baseline, fillY, nudge: translateNudge } = resolveBaselinePlacement(fontMetrics, scale);
    ctx.font = font;
    ctx.textBaseline = baseline;
    const letterSpacingPx = fontConfig.letterSpacing ? fontConfig.letterSpacing * fontSize : 0;
    const wordSpacingPx = fontConfig.wordSpacing ? fontConfig.wordSpacing * fontSize : 0;
    ctx.letterSpacing = `${letterSpacingPx}px`;
    ctx.wordSpacing = `${wordSpacingPx}px`;
    // Measure text width at unscaled size, then apply horizontal scale
    const metrics = ctx.measureText(text);
    const textWidth = measureStyledText(ctx, text, fontConfig, fontSize, scaleX);
    // Bitmap fonts: the visible block is the rendered cap-ink height (snappedHeight).
    const textHeight = isBitmap ? snappedHeight * scale : fontSize;
    // Bitmap fonts draw from an alphabetic baseline at the cap height, so glyph
    // ink hangs `descent` px below the rotation box. N/B place that descent on a
    // harmless edge, but R/I pivot on textHeight (cap-ink only) and would shove
    // the whole string by the descender. Add it back for R/I. No descender
    // (uppercase/filtered fonts) ⇒ descent≈0, matching their correct look.
    // Font 0 already pivots on the full em (fontSize), so it needs no extra.
    const pivotDescent = isBitmap ? (metrics.actualBoundingBoxDescent || 0) : 0;

    const fontXOffset = fontWidth * (fontConfig.xOffset || 0);

    const drawTransformedText = (context, color, offsetX = 0, offsetY = 0) => {
      context.save();
      context.fillStyle = color;
      context.font = font;
      context.textBaseline = baseline;
      context.letterSpacing = `${letterSpacingPx}px`;
      context.wordSpacing = `${wordSpacingPx}px`;

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
      drawStyledText(context, text, fontXOffset / scaleX, fillY + translateNudge, fontConfig, fontSize);
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
