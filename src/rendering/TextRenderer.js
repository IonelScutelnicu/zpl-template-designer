// Text Renderer
// Renders TEXT elements on canvas

import { resolveFontMetrics, resolveBaselinePlacement, resolveFontCellHeight, measureStyledText, drawStyledText } from '../utils/fontMetrics.js';
import { applyReverseOverlay, captureReverseBg } from './reverseOverlay.js';
import { resolvePlaceholders } from '../utils/placeholders.js';
import { collapseLineBreaks } from '../utils/zplFieldData.js';
import { effectiveCharGap, layoutCharOffsets, normalizePrintDirection, runLeadOffset, segmentForDirection } from '../utils/fieldParameter.js';

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
    // ^A collapses line breaks to spaces — match it so a multiline
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

    // ^FP. The gap is an absolute dot value, so it must not be squeezed by the font's
    // horizontal scale the way the font's ratio-based spacing is — divide it out, as
    // fontXOffset is below. It is applied by placing each character rather than
    // through ctx.letterSpacing, which would also trail the last character and which
    // the font's charRules bypass entirely for the glyphs they redraw.
    const direction = normalizePrintDirection(element.printDirection);
    const charGap = (effectiveCharGap(element) * scale) / scaleX;
    const perChar = direction !== 'H' || charGap > 0;
    const chars = perChar ? segmentForDirection(text, direction) : [];
    const advances = chars.map(ch => measureStyledText(ctx, ch, fontConfig, fontSize, 1));
    const layout = perChar ? layoutCharOffsets(advances, direction, charGap) : null;
    const textWidth = layout
      ? (layout.max - layout.min) * scaleX
      : measureStyledText(ctx, text, fontConfig, fontSize, scaleX);
    // Measured on Labelary, ^FO/^FT anchor the far reading end for rotations I and B,
    // and that end is the run's `max` — which for plain horizontal text is just its
    // width, so nothing about plain text moves.
    const readingPivot = layout ? layout.max * scaleX : textWidth;
    // Rotation/reverse box height, in dot space: the rendered cap-ink height for
    // bitmap fonts, the em for Font 0 (fontSize also carries its heightScale
    // stretch, which must not move the pivot).
    const textHeight = snappedHeight * scale;
    // Bitmap fonts draw from an alphabetic baseline at the cap height, so glyph
    // ink hangs `descent` px below the rotation box. N/B place that descent on a
    // harmless edge, but R/I pivot on textHeight (cap-ink only) and would shove
    // the whole string by the descender. Add it back for R/I. No descender
    // (uppercase/filtered fonts) ⇒ descent≈0, matching their correct look.
    // Font 0 already pivots on the full em (fontSize), so it needs no extra.
    const pivotDescent = isBitmap ? (metrics.actualBoundingBoxDescent || 0) : 0;

    const fontXOffset = fontWidth * (fontConfig.xOffset || 0);

    // ^FPV stacks upright glyphs one FONT CELL apart along the glyph-down axis —
    // not one snappedHeight, which for a bitmap font is only the cap ink. ^FO anchors
    // the run's top-left, so the rotations whose glyph-down axis runs toward negative
    // label coordinates (R and I) put the FIRST character at the far end.
    const vPitch = resolveFontCellHeight(fontMetrics) * scale;
    const vReversed = element.orientation === 'R' || element.orientation === 'I';
    const vStackOffset = (index) => (vReversed ? (index - (chars.length - 1)) * vPitch : index * vPitch);
    // Glyph-down extent of the whole field, for the rotation pivots and the ^FR box.
    const downExtent = direction === 'V' ? Math.max(0, chars.length - 1) * vPitch + textHeight : textHeight;

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
        context.translate(x + readingPivot + offsetX, y + textHeight + pivotDescent + offsetY);
        context.rotate(Math.PI);
        context.scale(scaleX, 1);
      } else if (element.orientation === 'B') {
        context.translate(x + offsetX, y + readingPivot + offsetY);
        context.rotate(-Math.PI / 2);
        context.scale(scaleX, 1);
      } else {
        context.translate(x + offsetX, y + offsetY);
        context.scale(scaleX, 1);
      }

      // Per-font nudges live in the local (post-rotate) frame so they travel
      // with the rotated text. fillText x is scaled by scaleX, so divide the
      // horizontal nudge to keep it exactly fontXOffset px along the advance.
      const baseX = fontXOffset / scaleX;
      const baseY = fillY + translateNudge;
      if (direction === 'V') {
        chars.forEach((ch, index) => drawStyledText(context, ch, baseX, baseY + vStackOffset(index), fontConfig, fontSize));
      } else if (layout) {
        chars.forEach((ch, index) => drawStyledText(context, ch, baseX + layout.offsets[index], baseY, fontConfig, fontSize));
      } else {
        drawStyledText(context, text, baseX, baseY, fontConfig, fontSize);
      }
      context.restore();
    };

    // ^FR: snapshot the bg BEFORE drawing so the mask only sees pixels
    // that were already there. Sampling after the draw would treat the
    // element's own ink as "previously dark" and flip its whole shape.
    let captured = null;
    if (element.reverse) {
      const rotated = element.orientation === 'R' || element.orientation === 'B';
      // A reversed run starts before its origin on N and R, and at it on I and B —
      // sampling the wrong rectangle would flip the background behind the wrong pixels.
      const lead = runLeadOffset(layout && { min: layout.min * scaleX }, element.orientation || 'N');
      captured = captureReverseBg(ctx, canvas, {
        x: x + lead.dx,
        y: y + lead.dy,
        width: rotated ? downExtent : textWidth,
        height: rotated ? textWidth : downExtent,
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
