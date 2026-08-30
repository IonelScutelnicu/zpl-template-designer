// Graphic Symbol Renderer
// Renders GRAPHICSYMBOL (^GS) elements on canvas

import { drawWithReverse } from './reverseOverlay.js';
import {
  GRAPHIC_SYMBOL_INK_RATIOS,
} from '../elements/GraphicSymbolElement.js';
import {
  graphicSymbolEffectiveSize,
  graphicSymbolCellWidth,
  graphicSymbolCellHeight,
} from '../utils/graphicSymbolGeometry.js';
import { GRAPHIC_SYMBOL_PATHS } from './graphicSymbolPaths.js';

// Path2D objects are cheap to keep and expensive-ish to parse; build once.
const pathCache = new Map();
function glyphPath(symbol) {
  let p = pathCache.get(symbol);
  if (!p) {
    p = new Path2D(GRAPHIC_SYMBOL_PATHS[symbol] || GRAPHIC_SYMBOL_PATHS.A);
    pathCache.set(symbol, p);
  }
  return p;
}

/**
 * Renderer for GRAPHICSYMBOL elements (®, ©, ™, UL mark, CSA mark).
 *
 * The marks are the printer's actual letterforms: vector outlines traced
 * from Labelary renders (see graphicSymbolPaths.js), normalized to the ink
 * box and filled with the even-odd rule so ring and counter holes carve out.
 * No fonts are involved, so rendering is identical across platforms.
 *
 * Two measured printer behaviors matter here: h/w each round to the nearest
 * 24-dot font step capped at 250 (graphicSymbolEffectiveSize), and non-square h/w
 * stretch the glyph anamorphically — stroke weights included — so the glyph
 * is drawn in a square frame under a horizontal scale, which carries the
 * stretch into the path fill exactly like the printer's vector font.
 */
export class GraphicSymbolRenderer {
  /**
   * Render a GRAPHICSYMBOL element on canvas
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {HTMLCanvasElement} canvas - Main canvas (for reverse overlay)
   * @param {Object} element - GRAPHICSYMBOL element
   * @param {Object} _labelSettings - Label settings (unused, kept for uniform signature)
   * @param {Object} transform - Transform parameters {scale, homeX, homeY, labelTop}
   */
  render(ctx, canvas, element, _labelSettings, transform) {
    const { scale, homeX, homeY, labelTop } = transform;

    const x = (element.x + homeX) * scale;
    const y = (element.y + homeY + labelTop) * scale;
    // unrotated box, at the quantized size the printer actually renders
    const w = graphicSymbolEffectiveSize(element.width) * scale;
    const h = graphicSymbolEffectiveSize(element.height) * scale;

    // R/I/B swing the glyph around the font character cell, which is a bit
    // wider and shorter than the command box (measured against Labelary).
    const cellW = graphicSymbolCellWidth(element.width) * scale;
    const cellH = graphicSymbolCellHeight(element.height) * scale;

    const drawSymbol = (targetCtx, color) => {
      targetCtx.save();
      // ZPL rotation: N=0°, R=90° CW, I=180°, B=270° CW, pivoting on the
      // cell's corners the way TextRenderer pivots on the text box.
      if (element.orientation === 'R') {
        targetCtx.translate(x + cellH, y);
        targetCtx.rotate(Math.PI / 2);
      } else if (element.orientation === 'I') {
        targetCtx.translate(x + cellW, y + cellH);
        targetCtx.rotate(Math.PI);
      } else if (element.orientation === 'B') {
        targetCtx.translate(x, y + cellW);
        targetCtx.rotate(-Math.PI / 2);
      } else {
        targetCtx.translate(x, y);
      }
      this._drawGlyph(targetCtx, element.symbol, w, h, color);
      targetCtx.restore();
    };

    // The reverse rect is the visual (rotated) box; for I/B the cell overhangs
    // the command box, so span both.
    const rotated = element.orientation === 'R' || element.orientation === 'B';
    drawWithReverse(ctx, canvas, {
      x,
      y,
      width: rotated ? h : Math.max(w, cellW),
      height: rotated ? Math.max(w, cellW) : h
    }, drawSymbol, {
      reverse: element.reverse,
      color: '#000000',
      transparentBackground: transform.transparentBackground
    });
  }

  /**
   * Draw one symbol glyph in the local 0,0 → w,h frame (w/h already at the
   * quantized effective size).
   *
   * The traced outline is normalized 0..1 over its ink box; the transform
   * scales it into the ink box from GRAPHIC_SYMBOL_INK_RATIOS (shared with
   * getBounds). Because the whole outline scales per-axis, non-square w/h
   * stretch stroke weights too, exactly like the printer's anamorphic font
   * scaling. Even-odd fill carves the ring and letter counters out.
   */
  _drawGlyph(c, symbol, w, h, color) {
    const ratio = GRAPHIC_SYMBOL_INK_RATIOS[symbol] || GRAPHIC_SYMBOL_INK_RATIOS.A;
    c.save();
    c.fillStyle = color;
    c.scale(ratio.w * w, ratio.h * h);
    c.fill(glyphPath(symbol), 'evenodd');
    c.restore();
  }
}
