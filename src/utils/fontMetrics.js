// Resolve canvas font metrics for text-bearing elements.
// Single source of truth for the font-dim resolution shared by TextRenderer,
// TextBlockRenderer, FieldBlockRenderer, and canvas-renderer's measureTextBounds.

import { ZPL_FONTS } from '../config/constants.js';
import { snapBitmapFontSize } from './zplFontSnap.js';

/**
 * Resolve canvas font metrics for a text-bearing element.
 *
 * @param {Object} element       Must have fontId/fontSize/fontWidth (any may be 0/'')
 * @param {Object} labelSettings Must have fontId/defaultFontHeight/defaultFontWidth
 * @param {number} [scale=1]     Canvas-pixel-per-dot multiplier; pass 1 for label-dot space
 * @returns {{
 *   fontId: string,
 *   fontConfig: object,
 *   fontSize: number,
 *   fontWidth: number,
 *   scaleX: number,
 *   snappedHeight: number,
 *   snappedWidth: number,
 *   hasExplicitWidth: boolean,
 *   isBitmap: boolean,
 * }}
 */
export function resolveFontMetrics(element, labelSettings, scale = 1) {
  const fontId = element.fontId || labelSettings.fontId || '0';
  const fontConfig = ZPL_FONTS[fontId] || ZPL_FONTS['default'];

  const rawFontSize = element.fontSize || labelSettings.defaultFontHeight || 20;
  const explicitWidth = element.fontWidth || labelSettings.defaultFontWidth || 0;
  const hasExplicitWidth = explicitWidth > 0;

  if (fontConfig.bitmap) {
    const snapped = snapBitmapFontSize(fontId, rawFontSize, hasExplicitWidth ? explicitWidth : 0);
    const capRatio = fontConfig.capRatio || 1;
    const advanceRatio = fontConfig.advanceRatio || 1;
    return {
      fontId,
      fontConfig,
      fontSize: (snapped.height / capRatio) * scale,
      fontWidth: snapped.width * scale,
      scaleX: (snapped.width * capRatio) / (snapped.height * advanceRatio),
      snappedHeight: snapped.height,
      snappedWidth: snapped.width,
      hasExplicitWidth,
      isBitmap: true,
    };
  }

  // Scalable Font 0 / default — proportional model.
  const rawFontWidth = hasExplicitWidth ? explicitWidth : rawFontSize * (fontConfig.aspectRatio || 1);
  const fontSize = rawFontSize * scale;
  const fontWidth = rawFontWidth * scale;
  const scaleX = !hasExplicitWidth
    ? 1
    : fontConfig.monospace
      ? fontWidth / (fontSize * (fontConfig.aspectRatio || 1))
      : fontWidth / fontSize;

  return {
    fontId,
    fontConfig,
    fontSize,
    fontWidth,
    scaleX,
    snappedHeight: rawFontSize,
    snappedWidth: rawFontWidth,
    hasExplicitWidth,
    isBitmap: false,
  };
}

/**
 * Per-character render rules. A font's `charRules` config maps a character to a
 * rule object whose `type` selects one of these handlers. Each handler resolves a
 * rule + fontSize (+ ctx, ch) into { advance, draw }:
 *   - advance: horizontal space the character consumes, in font-space px
 *   - draw(ctx, x, y): paint the character at (x, top-baseline y); ctx.fillStyle
 *     and the scale(scaleX, 1) frame are already set by the caller
 * Add a new behaviour by adding a handler here and a matching `type` in config.
 */
const CHAR_RULE_HANDLERS = {
  // Horizontal/vertical bar — replaces a glyph with a filled rectangle (e.g. '-').
  bar(rule, fontSize) {
    const pad = rule.padRatio * fontSize;
    const lineW = rule.lineRatio * fontSize;
    const lineH = Math.max(1, Math.round(fontSize * rule.heightRatio));
    return {
      advance: pad * 2 + lineW,
      draw: (ctx, x, y) => ctx.fillRect(x + pad, y + fontSize * rule.yRatio, lineW, lineH),
    };
  },
  // Hollow rectangle outline — replaces a glyph with a drawn box (e.g. Code 93's
  // start/stop guard, which Labelary/Zebra render as an empty box in the HRI). The
  // box bottom sits at `yRatio` below the (alphabetic) baseline and is `heightRatio`
  // tall; `widthRatio` sets the box width and `padRatio` the space on each side.
  // Only fillStyle is set by the caller, so the outline is four fillRects.
  box(rule, fontSize) {
    const w = rule.widthRatio * fontSize;
    const h = rule.heightRatio * fontSize;
    const top = rule.yRatio * fontSize;
    const lineW = Math.max(1, Math.round(rule.lineRatio * fontSize));
    const pad = (rule.padRatio || 0) * fontSize;
    return {
      advance: pad * 2 + w,
      draw: (ctx, x, y) => {
        const left = x + pad;
        const t = y + top;
        ctx.fillRect(left, t, w, lineW);
        ctx.fillRect(left, t + h - lineW, w, lineW);
        ctx.fillRect(left, t, lineW, h);
        ctx.fillRect(left + w - lineW, t, lineW, h);
      },
    };
  },
  // Hollow up-pointing triangle — replaces a glyph with a drawn triangle (e.g. Code
  // 11's start/stop guard, △ in the HRI). The triangle is `widthRatio` wide and
  // `heightRatio` tall, vertically centered at `yRatio` from the (alphabetic) baseline
  // (negative = above) — so a larger stop triangle stays centered on the smaller start
  // one. `xRatio` nudges it horizontally within its cell (positive = right) without
  // changing the advance, so the digits don't shift. The outline is an even-odd fill
  // (outer triangle minus an inner one shrunk toward the centroid), so only fillStyle
  // is needed and it survives the caller's non-uniform scaleX frame.
  triangle(rule, fontSize) {
    const w = rule.widthRatio * fontSize;
    const h = rule.heightRatio * fontSize;
    const centerY = (rule.yRatio || 0) * fontSize;
    const xOff = (rule.xRatio || 0) * fontSize;
    const lineW = Math.max(1, rule.lineRatio * fontSize);
    const pad = (rule.padRatio || 0) * fontSize;
    return {
      advance: pad * 2 + w,
      draw: (ctx, x, y) => {
        const lx = x + pad + xOff, rx = lx + w, cx = (lx + rx) / 2;
        const by = y + centerY + h / 2, ty = by - h;
        // centroid; shrink the inner triangle toward it to leave a ~lineW border.
        const gx = cx, gy = (by + by + ty) / 3;
        const k = Math.max(0, 1 - (3 * lineW) / h);
        const inner = (px, py) => [gx + (px - gx) * k, gy + (py - gy) * k];
        const [iax, iay] = inner(cx, ty), [ilx, ily] = inner(lx, by), [irx, iry] = inner(rx, by);
        ctx.beginPath();
        ctx.moveTo(cx, ty); ctx.lineTo(lx, by); ctx.lineTo(rx, by); ctx.closePath();
        ctx.moveTo(iax, iay); ctx.lineTo(ilx, ily); ctx.lineTo(irx, iry); ctx.closePath();
        ctx.fill('evenodd');
      },
    };
  },
  // Real glyph in a custom cell. `advanceRatio` sets the cell width (pitch);
  // `widthRatio` horizontally scales the glyph itself (<1 condenses it, >1 widens).
  // The glyph is drawn centered in the cell. advanceRatio defaults to the scaled
  // glyph width when omitted. Used to match Zebra's wider digit pitch and to
  // narrow the glyph shape.
  glyph(rule, fontSize, ctx, ch) {
    const squeeze = rule.widthRatio ?? 1;
    const drawnWidth = ctx.measureText(ch).width * squeeze;
    const advance = rule.advanceRatio != null ? rule.advanceRatio * fontSize : drawnWidth;
    return {
      advance,
      draw: (c, x, y) => {
        const left = x + (advance - drawnWidth) / 2;
        if (squeeze === 1) {
          c.fillText(ch, left, y);
          return;
        }
        c.save();
        c.translate(left, y);
        c.scale(squeeze, 1);
        c.fillText(ch, 0, 0);
        c.restore();
      },
    };
  },
};

function resolveCharRule(rule, fontSize, ctx, ch) {
  return CHAR_RULE_HANDLERS[rule.type]?.(rule, fontSize, ctx, ch) ?? null;
}

function hasRuleChar(text, rules) {
  for (const ch of text) {
    if (rules[ch]) return true;
  }
  return false;
}

/**
 * Measure text width (already scaled by scaleX), applying a font's per-character
 * render rules (`charRules`). Runs of normal characters are measured in one
 * measureText call so letter/word spacing is preserved. Falls back to a plain
 * measureText when the font has no rules or the text contains no ruled character.
 * ctx.font (and any letter/word spacing) must be set before calling.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {Object} fontConfig
 * @param {number} fontSize  Rendered font size in the current coordinate space
 * @param {number} scaleX    Horizontal scale factor applied to advance widths
 * @returns {number} Width in the post-scaleX coordinate space
 */
export function measureStyledText(ctx, text, fontConfig, fontSize, scaleX) {
  const rules = fontConfig.charRules;
  if (!rules || !hasRuleChar(text, rules)) {
    return ctx.measureText(text).width * scaleX;
  }
  let width = 0;
  let run = '';
  for (const ch of text) {
    const resolved = rules[ch] && resolveCharRule(rules[ch], fontSize, ctx, ch);
    if (resolved) {
      if (run) { width += ctx.measureText(run).width; run = ''; }
      width += resolved.advance;
    } else {
      run += ch;
    }
  }
  if (run) width += ctx.measureText(run).width;
  return width * scaleX;
}

/**
 * Wrap text into lines that fit a per-line max width, soft-breaking on spaces and
 * hard-breaking words longer than the line. All width measurement goes through
 * measureStyledText so wrapping and hard-breaking honor the same per-character
 * render rules the renderer draws with. ctx.font (and any letter/word spacing)
 * must be set before calling.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {Object} fontConfig
 * @param {number} fontSize
 * @param {number} scaleX
 * @param {(lineIndex: number) => number} lineMaxWidth  Max width (post-scaleX) for
 *        the line at the given index; lets callers vary it (e.g. hanging indent).
 * @returns {string[]} The wrapped lines.
 */
export function wrapStyledText(ctx, text, fontConfig, fontSize, scaleX, lineMaxWidth) {
  const measure = (s) => measureStyledText(ctx, s, fontConfig, fontSize, scaleX);

  // Hard-break a word that exceeds maxWidth into character-level chunks.
  const breakWord = (word, maxWidth) => {
    const chunks = [];
    let chunk = '';
    for (const char of word) {
      const test = chunk + char;
      if (chunk && measure(test) > maxWidth) {
        chunks.push(chunk);
        chunk = char;
      } else {
        chunk = test;
      }
    }
    if (chunk) chunks.push(chunk);
    return chunks;
  };

  const lines = [];
  let currentLine = '';

  text.split(' ').forEach(word => {
    const testLine = currentLine + (currentLine ? ' ' : '') + word;
    if (measure(testLine) > lineMaxWidth(lines.length) && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }

    // Hard-break if the line still exceeds the (possibly updated) line width.
    const maxWidth = lineMaxWidth(lines.length);
    if (measure(currentLine) > maxWidth) {
      const chunks = breakWord(currentLine, maxWidth);
      for (let i = 0; i < chunks.length - 1; i++) {
        lines.push(chunks[i]);
      }
      currentLine = chunks[chunks.length - 1] || '';
    }
  });

  if (currentLine) lines.push(currentLine);
  return lines;
}

/**
 * Draw text starting at (startX, startY), applying a font's per-character render
 * rules (`charRules`). Must be called inside the same scale(scaleX, 1) frame the
 * renderer uses, with ctx.font / fillStyle already set. Widths are in font space
 * (no scaleX division) so ruled glyphs scale with fontWidth like normal glyphs.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} startX
 * @param {number} startY
 * @param {Object} fontConfig
 * @param {number} fontSize
 */
export function drawStyledText(ctx, text, startX, startY, fontConfig, fontSize) {
  const rules = fontConfig.charRules;
  if (!rules || !hasRuleChar(text, rules)) {
    ctx.fillText(text, startX, startY);
    return;
  }
  let localX = startX;
  let run = '';
  const flushRun = () => {
    if (!run) return;
    ctx.fillText(run, localX, startY);
    localX += ctx.measureText(run).width;
    run = '';
  };
  for (const ch of text) {
    const resolved = rules[ch] && resolveCharRule(rules[ch], fontSize, ctx, ch);
    if (resolved) {
      flushRun();
      resolved.draw(ctx, localX, startY);
      localX += resolved.advance;
    } else {
      run += ch;
    }
  }
  flushRun();
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/**
 * Resolve multiline text pitch in canvas pixels from ZPL font height.
 *
 * @param {Object} metrics Result from resolveFontMetrics
 * @param {number} fallbackRatio Ratio used when the font has no configured value
 * @param {number} [scale=1] Canvas-pixel-per-dot multiplier
 * @param {string} [ratioKey='lineHeightRatio'] Font config key to prefer
 * @param {'snappedHeight'|'fontSize'} [baseKey='snappedHeight'] Metric to multiply by the ratio
 * @returns {number}
 */
export function resolveFontLineHeight(metrics, fallbackRatio, scale = 1, ratioKey = 'lineHeightRatio', baseKey = 'snappedHeight') {
  const fontConfig = metrics.fontConfig || {};
  const ratio = positiveNumber(fontConfig[ratioKey])
    ?? (ratioKey !== 'lineHeightRatio' ? positiveNumber(fontConfig.lineHeightRatio) : null)
    ?? fallbackRatio;

  const base = baseKey === 'fontSize' ? metrics.fontSize : metrics.snappedHeight * scale;
  return base * ratio;
}
