// Text Renderer
// Renders TEXT elements on canvas

import { resolveFontMetrics, resolveBaselinePlacement, resolveFontCellHeight, measureStyledText, drawStyledText } from '../utils/fontMetrics.js';
import { drawWithReverse } from './reverseOverlay.js';
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
    const { fontConfig, fontSize, fontWidth, scaleX } = fontMetrics;
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
    // Rotation pivot along the glyph-down axis, in dot space: the FONT CELL, not
    // snappedHeight, which for a bitmap font is only the cap ink. Verified on
    // Labelary across every resident font — an R field's ink mirrors its N ink about
    // the cell, so a cap-ink pivot shifts R and I by the cell's ascender+descender
    // padding (0 only for B/H/Font 0, the fonts whose cell IS their cap ink).
    // N and B never touch it: their pivots are the origin and the reading end.
    const cellHeight = resolveFontCellHeight(fontMetrics) * scale;

    const fontXOffset = fontWidth * (fontConfig.xOffset || 0);

    // ^FPV stacks upright glyphs one FONT CELL apart along the glyph-down axis. ^FO
    // anchors the run's top-left, so the rotations whose glyph-down axis runs toward
    // negative label coordinates (R and I) put the FIRST character at the far end —
    // which is why the R/I pivot stays one cell even for a multi-cell stack.
    const vReversed = element.orientation === 'R' || element.orientation === 'I';
    const vStackOffset = (index) => (vReversed ? (index - (chars.length - 1)) * cellHeight : index * cellHeight);
    // Glyph-down extent of the whole field, for the ^FR box.
    const downExtent = direction === 'V' ? Math.max(1, chars.length) * cellHeight : cellHeight;

    const drawTransformedText = (context, color) => {
      context.save();
      context.fillStyle = color;
      context.font = font;
      context.textBaseline = baseline;
      context.letterSpacing = `${letterSpacingPx}px`;
      context.wordSpacing = `${wordSpacingPx}px`;

      if (element.orientation === 'R') {
        context.translate(x + cellHeight, y);
        context.rotate(Math.PI / 2);
        context.scale(scaleX, 1);
      } else if (element.orientation === 'I') {
        context.translate(x + readingPivot, y + cellHeight);
        context.rotate(Math.PI);
        context.scale(scaleX, 1);
      } else if (element.orientation === 'B') {
        context.translate(x, y + readingPivot);
        context.rotate(-Math.PI / 2);
        context.scale(scaleX, 1);
      } else {
        context.translate(x, y);
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

    const rotated = element.orientation === 'R' || element.orientation === 'B';
    const lead = runLeadOffset(layout && { min: layout.min * scaleX }, element.orientation || 'N');
    drawWithReverse(ctx, canvas, {
      x: x + lead.dx,
      y: y + lead.dy,
      width: rotated ? downExtent : textWidth,
      height: rotated ? textWidth : downExtent
    }, drawTransformedText, {
      reverse: element.reverse,
      color: '#000000',
      transparentBackground: transform.transparentBackground,
      padding: Math.ceil(fontSize * Math.max(1, scaleX))
    });

    ctx.restore();
  }
}
