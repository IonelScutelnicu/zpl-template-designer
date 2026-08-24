// Resolve canvas font metrics for text-bearing elements.
// Single source of truth for the font-dim resolution shared by TextRenderer,
// TextBlockRenderer, FieldBlockRenderer, and canvas-renderer's measureTextBounds.

import { ZPL_FONTS, DEFAULT_FONT_ID, DEFAULT_FONT_HEIGHT } from '../config/constants.js';
import { effectiveCharGap } from './fieldParameter.js';
import { customFontFamily, customFontLineHeightRatio, resolveRenderFontId } from './customFonts.js';
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
  const fontId = element.fontId || labelSettings.fontId || DEFAULT_FONT_ID;
  // A declared-only ^CW font has no face to draw with, so it renders as whatever
  // the printer substitutes (resolveRenderFontId). Everything below then treats
  // that substitute as the font — including snapBitmapFontSize, which needs an id
  // that actually carries a bitmap config.
  const renderFontId = resolveRenderFontId(fontId, labelSettings.customFonts, labelSettings.fontId);
  const custom = labelSettings.customFonts?.find(font => font.id === renderFontId && font.source);
  // baselineRatio: Zebra (and Labelary) place a downloaded TTF at em size = the ^A
  // height with the alphabetic baseline exactly 0.75×height below the field origin,
  // regardless of the font's own ascent metrics (verified against Labelary with
  // VeraMono/OCR-A/OCR-B). The browser's 'top' baseline depends on per-font ascent,
  // so custom fonts must be drawn from the alphabetic baseline instead.
  // textBlockLineHeightRatio: ^TB steps by the downloaded font's own line height
  // (hhea), unlike ^FB, which always steps one font height — so a face whose
  // ascenders/descenders overflow the em box gets the leading it asks for.
  const fontConfig = custom
    ? {
      ...ZPL_FONTS.default,
      family: `'${customFontFamily(custom.source)}'`,
      aspectRatio: 1,
      baselineRatio: 0.75,
      textBlockLineHeightRatio: customFontLineHeightRatio(custom.source) || 1,
    }
    : ZPL_FONTS[renderFontId] || ZPL_FONTS['default'];

  const rawFontSize = element.fontSize || labelSettings.defaultFontHeight || DEFAULT_FONT_HEIGHT;
  const explicitWidth = element.fontWidth || labelSettings.defaultFontWidth || 0;
  const hasExplicitWidth = explicitWidth > 0;

  if (fontConfig.bitmap) {
    const snapped = snapBitmapFontSize(renderFontId, rawFontSize, hasExplicitWidth ? explicitWidth : 0);
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
  const em = rawFontSize * scale;
  const fontWidth = rawFontWidth * scale;
  // heightScale draws the glyphs taller than the em and squeezes the render
  // frame back by the same factor, so nothing horizontal moves: every advance
  // (measureText and charRules alike) is computed at the taller fontSize and
  // then multiplied by a scaleX that is smaller by exactly that factor.
  const heightScale = fontConfig.heightScale || 1;
  const fontSize = em * heightScale;
  const scaleX = (!hasExplicitWidth
    ? 1
    : fontConfig.monospace
      ? fontWidth / (em * (fontConfig.aspectRatio || 1))
      : fontWidth / em) / heightScale;

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
 * Vertical placement shared by TextRenderer, TextBlockRenderer, and
 * FieldBlockRenderer. Returns how a line of text sits relative to its element y:
 *   - baseline: ctx.textBaseline to draw with
 *   - fillY:    y passed to fillText/drawStyledText, relative to the line top
 *   - nudge:    per-font vertical calibration offset, applied in the local frame
 * Three models:
 *   - bitmap fonts: alphabetic baseline at the rendered cap height, so the cap top
 *     lands on element.y; nudge is in dots per magnification step (×scale).
 *   - custom TTFs (baselineRatio): alphabetic baseline at baselineRatio×em below
 *     element.y, matching Zebra/Labelary placement of downloaded fonts.
 *   - Font 0: 'top' baseline with a fraction-of-em nudge calibrated for its
 *     substitute browser font.
 *
 * @param {Object} metrics Result from resolveFontMetrics
 * @param {number} [scale=1] Canvas-pixel-per-dot multiplier (same one passed to
 *        resolveFontMetrics; used for dot-space bitmap nudges)
 * @returns {{ baseline: string, fillY: number, nudge: number }}
 */
export function resolveBaselinePlacement(metrics, scale = 1) {
  const { fontConfig, fontSize, snappedHeight, isBitmap } = metrics;
  if (isBitmap) {
    const capStep = fontConfig.bitmap?.capStep;
    const magnification = capStep ? Math.max(1, Math.round(snappedHeight / capStep)) : 1;
    return {
      baseline: 'alphabetic',
      fillY: snappedHeight * scale,
      nudge: (fontConfig.yOffset || 0) * magnification * scale,
    };
  }
  if (fontConfig.baselineRatio) {
    return { baseline: 'alphabetic', fillY: fontSize * fontConfig.baselineRatio, nudge: 0 };
  }
  return { baseline: 'top', fillY: 0, nudge: fontSize * (-0.05 + (fontConfig.yOffset || 0)) };
}

/**
 * The ZPL font cell height in dots — the ^A height snapped to the printer's grid.
 * Distinct from `snappedHeight`, which for a bitmap font is the CAP ink height and
 * is smaller by the cell's descender space (font A: 14 of an 18-dot cell; font B:
 * the full 11). ^FPV steps one cell per character, verified on Labelary: ^AAN,25
 * and ^AAN,27 both pitch 27, and ^A0N,33 pitches 33.
 *
 * @param {Object} metrics Result from resolveFontMetrics
 * @returns {number} cell height in dots
 */
export function resolveFontCellHeight(metrics) {
  const { fontConfig, snappedHeight, isBitmap } = metrics;
  if (!isBitmap) return snappedHeight;
  const b = fontConfig.bitmap || {};
  if (!b.capStep || !b.magStep) return snappedHeight;
  const magnification = Math.max(1, Math.round(snappedHeight / b.capStep));
  return b.magStep * magnification;
}

/**
 * Labelary-calibrated ^FO-to-baseline offset in dots. Bitmap fonts add cell
 * padding to snappedHeight; scalable/downloaded fonts use floor(0.75 * height).
 * This differs from resolveBaselinePlacement().fillY, which is a canvas draw
 * parameter tied to ctx.textBaseline.
 *
 * @param {Object} metrics Result from resolveFontMetrics
 * @returns {number} baseline offset in dots
 */
export function resolveBaselineOffset(metrics) {
  const { fontConfig, snappedHeight, isBitmap } = metrics;
  if (isBitmap) {
    const b = fontConfig.bitmap || {};
    const capPad = b.capPad || 0;
    if (!capPad || !b.capStep) return snappedHeight;
    const magnification = Math.max(1, Math.round(snappedHeight / b.capStep));
    return snappedHeight + capPad * magnification;
  }
  return Math.floor(BASELINE_RATIO * snappedHeight);
}

/** Alphabetic baseline as a fraction of the ^A height, for scalable and
 *  downloaded fonts. Labelary-verified across heights 20/30/50/80. */
const BASELINE_RATIO = 0.75;

let advanceCanvas = null;

/**
 * Canvas-measured advance in label dots for I/B and right-justified ^FT anchors.
 * Import, export, and rendering share the same measurement. Returns null when
 * no DOM is available; callers must not substitute a guess.
 */
export function measureTextAdvanceDots(element, labelSettings, content) {
  if (typeof document === 'undefined') return null;
  const fontId = element.fontId || labelSettings?.fontId || DEFAULT_FONT_ID;
  const hasCustomSource = labelSettings?.customFonts?.some(font => font.id === fontId && font.source);
  // An unknown ID is a printer/custom font. Measuring it with the generic
  // fallback would produce a plausible but incorrect ^FT coordinate.
  if (!ZPL_FONTS[fontId] && !hasCustomSource) return null;
  if (!advanceCanvas) advanceCanvas = document.createElement('canvas');
  const ctx = advanceCanvas.getContext('2d');
  if (!ctx) return null;

  const metrics = resolveFontMetrics(element, labelSettings || {}, 1);
  const { fontConfig, fontSize, scaleX } = metrics;
  // Same case folding the renderer applies before measuring.
  const text = fontConfig.uppercase
    ? String(content).toUpperCase()
    : fontConfig.filterLowercase
      ? String(content).replace(/[a-z]/g, ' ')
      : String(content);

  ctx.font = `${fontConfig.weight} ${fontSize}px ${fontConfig.family}`;
  ctx.letterSpacing = `${(fontConfig.letterSpacing || 0) * fontSize}px`;
  ctx.wordSpacing = `${(fontConfig.wordSpacing || 0) * fontSize}px`;
  // The gap is in the pre-scaleX frame, like every other advance here.
  const width = styledTextAdvance(ctx, text, fontConfig, fontSize, scaleX, effectiveCharGap(element) / scaleX);
  return Number.isFinite(width) ? width : null;
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
  // `widthRatio` horizontally scales the glyph itself (<1 condenses it, >1 widens)
  // and `heightRatio` vertically scales it about its baseline (<1 shortens it, >1
  // heightens), leaving the advance untouched. `xRatio`/`yRatio` nudge the ink
  // right/down without changing the cell or advance. The glyph is drawn centered in
  // the cell. advanceRatio defaults to the scaled glyph width when omitted. Used to
  // match Zebra's wider digit pitch and to narrow the glyph shape.
  glyph(rule, fontSize, ctx, ch) {
    const squeeze = rule.widthRatio ?? 1;
    const stretch = rule.heightRatio ?? 1;
    const drawnWidth = ctx.measureText(ch).width * squeeze;
    const advance = rule.advanceRatio != null ? rule.advanceRatio * fontSize : drawnWidth;
    const xOffset = (rule.xRatio ?? 0) * fontSize;
    const yOffset = (rule.yRatio ?? 0) * fontSize;
    return {
      advance,
      draw: (c, x, y) => {
        const left = x + (advance - drawnWidth) / 2 + xOffset;
        const baseline = y + yOffset;
        if (squeeze === 1 && stretch === 1) {
          c.fillText(ch, left, baseline);
          return;
        }
        c.save();
        c.translate(left, baseline);
        c.scale(squeeze, stretch);
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
 * Styled width plus the ^FP inter-character gap, which widens every advance but not
 * the run's trailing edge — so n characters carry n-1 gaps. Added arithmetically
 * rather than through ctx.letterSpacing, which the font's charRules bypass for the
 * glyphs they redraw. `charGap` is in the pre-scaleX frame, like the advances.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {Object} fontConfig
 * @param {number} fontSize
 * @param {number} scaleX
 * @param {number} [charGap=0]
 * @returns {number} Width in the post-scaleX coordinate space
 */
export function styledTextAdvance(ctx, text, fontConfig, fontSize, scaleX, charGap = 0) {
  const width = measureStyledText(ctx, text, fontConfig, fontSize, scaleX);
  if (!charGap) return width;
  return width + charGap * Math.max(0, Array.from(String(text ?? '')).length - 1) * scaleX;
}

/**
 * Wrap text into lines that fit a per-line max width, soft-breaking on spaces and
 * hard-breaking words longer than the line. A newline in the text is an explicit
 * break (both ^FB and ^TB honor one); consecutive newlines produce
 * blank lines, matching the printer. All width measurement goes through
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
 * @returns {Array<{text: string, termination: 'soft'|'forced'|'hard'|'end'}>} The wrapped
 *          lines and how each line ended.
 */
export function wrapStyledTextDetailed(ctx, text, fontConfig, fontSize, scaleX, lineMaxWidth, charGap = 0) {
  const measure = (s) => styledTextAdvance(ctx, s, fontConfig, fontSize, scaleX, charGap);

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

  const source = String(text ?? '');
  if (source === '') return [];

  const lines = [];

  // lineMaxWidth is indexed on the running total, so a hanging indent still
  // applies to every line after the first — including lines after a break.
  const segments = source.split('\n');
  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
    const segment = segments[segmentIndex];
    const segmentTermination = segmentIndex < segments.length - 1 ? 'hard' : 'end';
    if (segment === '') {
      lines.push({ text: '', termination: segmentTermination });
      continue;
    }

    let currentLine = '';

    segment.split(' ').forEach(word => {
      const testLine = currentLine + (currentLine ? ' ' : '') + word;
      if (measure(testLine) > lineMaxWidth(lines.length) && currentLine) {
        lines.push({ text: currentLine, termination: 'soft' });
        currentLine = word;
      } else {
        currentLine = testLine;
      }

      // Hard-break if the line still exceeds the (possibly updated) line width.
      const maxWidth = lineMaxWidth(lines.length);
      if (measure(currentLine) > maxWidth) {
        const chunks = breakWord(currentLine, maxWidth);
        for (let i = 0; i < chunks.length - 1; i++) {
          lines.push({ text: chunks[i], termination: 'forced' });
        }
        currentLine = chunks[chunks.length - 1] || '';
      }
    });

    if (currentLine) lines.push({ text: currentLine, termination: segmentTermination });
  }

  return lines;
}

/**
 * String-only wrapper retained for callers that do not need line-break provenance.
 */
export function wrapStyledText(ctx, text, fontConfig, fontSize, scaleX, lineMaxWidth, charGap = 0) {
  return wrapStyledTextDetailed(ctx, text, fontConfig, fontSize, scaleX, lineMaxWidth, charGap)
    .map(line => line.text);
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

/**
 * drawStyledText plus the ^FP inter-character gap. Each character is placed rather
 * than leaning on ctx.letterSpacing, which the font's charRules bypass for the glyphs
 * they redraw. `charGap` is in the pre-scaleX frame, like the advances.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} startX
 * @param {number} startY
 * @param {Object} fontConfig
 * @param {number} fontSize
 * @param {number} [charGap=0]
 */
export function drawSpacedText(ctx, text, startX, startY, fontConfig, fontSize, charGap = 0) {
  if (!charGap) {
    drawStyledText(ctx, text, startX, startY, fontConfig, fontSize);
    return;
  }
  let localX = startX;
  for (const char of Array.from(String(text ?? ''))) {
    drawStyledText(ctx, char, localX, startY, fontConfig, fontSize);
    localX += measureStyledText(ctx, char, fontConfig, fontSize, 1) + charGap;
  }
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

  // fontSize carries the heightScale stretch, which is a glyph-ink adjustment —
  // line pitch follows the em, so divide it back out.
  const base = baseKey === 'fontSize'
    ? metrics.fontSize / (fontConfig.heightScale || 1)
    : metrics.snappedHeight * scale;
  return base * ratio;
}
