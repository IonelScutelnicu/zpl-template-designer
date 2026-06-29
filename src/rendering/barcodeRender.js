// Barcode drawing helpers
// Draw bwip-js geometry (from utils/barcodeGeometry.js) onto a canvas context as
// crisp filled rectangles — no drawImage, so image smoothing stays irrelevant
// (see ADR 0001). Shared by BarcodeRenderer (1D) and QRCodeRenderer (2D).

import { resolveFontMetrics, measureStyledText, drawStyledText } from '../utils/fontMetrics.js';

// Tiny overlap so adjacent modules don't leave hairline seams at fractional
// device pixels when zoomed.
const SEAM = 0.4;

/**
 * Draw a 1D symbol from its space/bar sequence (starts with a bar).
 * `guardBottomY`, when given, extends the guard bars (those bwip marks with a
 * negative bottom offset on EAN-13/UPC-A) down to that y so they reach the
 * interpretation-line baseline, as on a standard EAN/UPC symbol.
 */
export function drawLinear(ctx, geom, { x, y, moduleW, height, color, guardBottomY }) {
  ctx.save();
  ctx.fillStyle = color;
  let cx = x;
  let isBar = true;
  let barIndex = 0;
  for (let i = 0; i < geom.sbs.length; i++) {
    const w = geom.sbs[i] * moduleW;
    if (isBar) {
      const barHeightRatio = geom.bhs?.[barIndex] ?? 1;
      const barBottomOffset = geom.bbs?.[barIndex] ?? 0;
      const barY = y + (1 - barHeightRatio - barBottomOffset) * height;
      const barBottom = (guardBottomY != null && barBottomOffset < 0)
        ? guardBottomY
        : barY + barHeightRatio * height;
      ctx.fillRect(cx, barY, w + SEAM, barBottom - barY);
      barIndex += 1;
    }
    cx += w;
    isBar = !isBar;
  }
  ctx.restore();
}

// bwip's per-glyph x for the below-bars line sits ~1 module right of where Labelary
// places it; shift the digits left by this many modules to line them up under the bars.
const BELOW_TEXT_X_SHIFT_MODULES = -1;

function clampModuleWidth(moduleWidthDots) {
  return Math.min(Math.max(Math.round(moduleWidthDots), 1), 10);
}

// Resolve the canvas font string + sizing for an HRI config entry (see HRI_CONFIG in
// barcodeGeometry.js) at a module width. `font.model` selects the ZPL bitmap font-model
// (family + horizontal scaleX stretch via resolveFontMetrics); otherwise the line is
// rendered at a direct pixel size on `font.family`. (`font.id` is for preloading and
// the model — a direct line like OCR-B below still carries an id to load its FontFace.)
// All distances returned are in scaled (canvas-pixel) space.
function resolveHriFont(config, moduleWidthDots, scale) {
  const ms = config.module[clampModuleWidth(moduleWidthDots)];
  // Horizontal nudge (dots → scaled px); positive shifts the line right. Like a
  // text element's xOffset, applied on top of the configured placement.
  const xOffset = (ms.xOffset || 0) * scale;
  if (config.font.model) {
    const m = resolveFontMetrics({ fontId: config.font.id, fontSize: ms.height, fontWidth: ms.width }, {}, scale);
    return {
      mode: 'model',
      gap: ms.gap * scale,
      xOffset,
      fontStr: `${m.fontConfig.weight} ${m.fontSize}px ${m.fontConfig.family}`,
      fontConfig: m.fontConfig,
      fontSize: m.fontSize,
      scaleX: m.scaleX,
      capInk: m.snappedHeight * scale,
      letterSpacingPx: 0,
    };
  }
  const fontPx = ms.fontSize * scale;
  return {
    mode: 'direct',
    gap: ms.gap * scale,
    xOffset,
    fontStr: `${fontPx}px ${config.font.family}`,
    fontPx,
    letterSpacingPx: config.letterSpacing ? fontPx * config.letterSpacing : 0,
  };
}

/**
 * Draw a barcode's HRI (human-readable interpretation) line from its config entry.
 * Three placements, all config-driven:
 *   - fragments: per-bwip-fragment digits split across the guard bars (EAN/UPC below)
 *   - center + model font: one centered string via the bitmap font-model (EAN/UPC above)
 *   - center + direct font: one centered string at a pixel size (Code 128/39)
 * `x,y` is the bars' top-left and `height` the bar height, in the current local frame.
 * `geom.txt` (when present) supplies the EAN/UPC digits; otherwise `displayText` is used.
 */
export function drawHriLine(ctx, geom, { config, displayText, moduleWidthDots, scale = 1, x, y, height, totalWidth, color, above = false }) {
  if (!config) return;
  const hasTxt = Array.isArray(geom?.txt) && geom.txt.length > 0;
  const f = resolveHriFont(config, moduleWidthDots, scale);

  ctx.save();
  ctx.fillStyle = color;
  ctx.font = f.fontStr;
  ctx.letterSpacing = `${f.letterSpacingPx.toFixed(1)}px`;

  if (config.placement === 'fragments' && hasTxt) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const ascent = ctx.measureText('0').actualBoundingBoxAscent || f.fontPx * 0.7;
    const baselineY = y + height + ascent + f.gap;
    const moduleW = moduleWidthDots * scale;
    for (const [text, xOffset] of geom.txt) {
      ctx.fillText(text, x + f.xOffset + (xOffset + BELOW_TEXT_X_SHIFT_MODULES) * moduleW, baselineY);
    }
    ctx.restore();
    return;
  }

  const text = hasTxt ? geom.txt.map((t) => t[0]).join('') : (displayText || '');
  const centerX = x + totalWidth / 2 + f.xOffset;

  if (f.mode === 'model') {
    // bitmap font-model: alphabetic baseline at the cap-ink height, drawn in a
    // scale(scaleX, 1) frame so the glyph cell stretches to the requested width.
    ctx.textBaseline = 'alphabetic';
    const textWidth = measureStyledText(ctx, text, f.fontConfig, f.fontSize, f.scaleX);
    const baselineY = above ? y - f.gap : y + height + f.gap + f.capInk;
    ctx.translate(centerX - textWidth / 2, baselineY);
    ctx.scale(f.scaleX, 1);
    drawStyledText(ctx, text, 0, 0, f.fontConfig, f.fontSize);
    ctx.restore();
    return;
  }

  // direct family, centered.
  ctx.textAlign = 'center';
  if (above) {
    // Alphabetic baseline placed from the measured descent so the gap above the bars
    // is the real ink-to-bars distance, not inflated by the font's em padding.
    ctx.textBaseline = 'alphabetic';
    const descent = ctx.measureText(text).actualBoundingBoxDescent || 0;
    ctx.fillText(text, centerX, y - f.gap - descent);
  } else {
    // Alphabetic baseline placed from the measured ascent so the gap under the bars
    // stays constant regardless of the font's internal padding.
    ctx.textBaseline = 'alphabetic';
    const ascent = ctx.measureText(text).actualBoundingBoxAscent || f.fontPx * 0.7;
    ctx.fillText(text, centerX, y + height + f.gap + ascent);
  }
  ctx.restore();
}

/** Local-space bounds of the line drawHriLine would paint (reverse-overlay + extents). */
export function measureHriLine(ctx, geom, { config, displayText, moduleWidthDots, scale = 1, x, y, height, totalWidth, above = false }) {
  if (!config) return null;
  const hasTxt = Array.isArray(geom?.txt) && geom.txt.length > 0;
  const f = resolveHriFont(config, moduleWidthDots, scale);

  ctx.save();
  ctx.font = f.fontStr;
  ctx.letterSpacing = `${f.letterSpacingPx.toFixed(1)}px`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  let res = null;

  if (config.placement === 'fragments' && hasTxt) {
    const ascent = ctx.measureText('0').actualBoundingBoxAscent || f.fontPx * 0.7;
    const baselineY = y + height + ascent + f.gap;
    const moduleW = moduleWidthDots * scale;
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const [text, xOffset] of geom.txt) {
      const tx = x + f.xOffset + (xOffset + BELOW_TEXT_X_SHIFT_MODULES) * moduleW;
      const m = ctx.measureText(text);
      left = Math.min(left, tx - Math.max(m.actualBoundingBoxLeft || 0, m.width / 2));
      right = Math.max(right, tx + Math.max(m.actualBoundingBoxRight || 0, m.width / 2));
      top = Math.min(top, baselineY - (m.actualBoundingBoxAscent || f.fontPx * 0.8));
      bottom = Math.max(bottom, baselineY + (m.actualBoundingBoxDescent || f.fontPx * 0.2));
    }
    res = Number.isFinite(left) ? { left, top, right, bottom } : null;
  } else {
    const text = hasTxt ? geom.txt.map((t) => t[0]).join('') : (displayText || '');
    const centerX = x + totalWidth / 2 + f.xOffset;
    if (f.mode === 'model') {
      const textWidth = measureStyledText(ctx, text, f.fontConfig, f.fontSize, f.scaleX);
      const baselineY = above ? y - f.gap : y + height + f.gap + f.capInk;
      res = { left: centerX - textWidth / 2, top: baselineY - f.capInk, right: centerX + textWidth / 2, bottom: baselineY };
    } else {
      const m = ctx.measureText(text);
      const halfW = Math.max(m.width / 2, m.actualBoundingBoxRight || 0);
      if (above) {
        // Ink bottom sits f.gap above the bars (matches drawHriLine's measured-descent placement).
        const inkBottom = y - f.gap;
        res = { left: centerX - halfW, top: inkBottom - (m.actualBoundingBoxAscent || f.fontPx * 0.7), right: centerX + halfW, bottom: inkBottom };
      } else {
        const ascent = m.actualBoundingBoxAscent || f.fontPx * 0.7;
        res = {
          left: centerX - halfW,
          top: y + height + f.gap,
          right: centerX + halfW,
          bottom: y + height + f.gap + ascent + (m.actualBoundingBoxDescent || f.fontPx * 0.2),
        };
      }
    }
  }

  ctx.restore();
  return res;
}

/** Draw a 2D symbol from its row-major pixel matrix. */
export function drawMatrix(ctx, geom, { x, y, moduleW, moduleH, color }) {
  ctx.save();
  ctx.fillStyle = color;
  const { pixs, cols, rows } = geom;
  for (let r = 0; r < rows; r++) {
    const off = r * cols;
    const py = y + r * moduleH;
    for (let c = 0; c < cols; c++) {
      if (pixs[off + c]) ctx.fillRect(x + c * moduleW, py, moduleW + SEAM, moduleH + SEAM);
    }
  }
  ctx.restore();
}

/**
 * Draw a MaxiCode symbol: regular pointy-top hexagons on a 30×33 grid (odd rows offset
 * half a module) plus the central three-ring bullseye finder. `moduleW` is the hex column
 * pitch in dots; the vertical pitch and hex height follow from a regular hexagon.
 */
export function drawMaxiCode(ctx, geom, { x, y, moduleW, color }) {
  ctx.save();
  ctx.fillStyle = color;
  const W = moduleW;
  const H = (W * 2) / Math.sqrt(3);   // hex height (top vertex to bottom vertex)
  const rowPitch = (W * Math.sqrt(3)) / 2; // vertical distance between rows
  for (const { col, row } of geom.modules) {
    const cx = x + col * W + ((row & 1) ? W : W / 2);
    const cy = y + row * rowPitch + H / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - H / 2);
    ctx.lineTo(cx + W / 2, cy - H / 4);
    ctx.lineTo(cx + W / 2, cy + H / 4);
    ctx.lineTo(cx, cy + H / 2);
    ctx.lineTo(cx - W / 2, cy + H / 4);
    ctx.lineTo(cx - W / 2, cy - H / 4);
    ctx.closePath();
    ctx.fill();
  }
  // Bullseye: three concentric black rings centred on the symbol. Radii (in module
  // pitches) match bwip's showmaxicode geometry; each ring is a filled annulus.
  const cx0 = x + 14.5 * W;
  const cy0 = y + ((geom.rows - 1) * rowPitch + H) / 2;
  for (const [ri, ro] of [[0.58, 1.35], [2.12, 2.89], [3.65, 4.42]]) {
    ctx.beginPath();
    ctx.arc(cx0, cy0, ro * W, 0, Math.PI * 2, false);
    ctx.arc(cx0, cy0, ri * W, 0, Math.PI * 2, true);
    ctx.fill('evenodd');
  }
  ctx.restore();
}

/** Draw a neutral placeholder box when encoding fails (invalid/partial data). */
export function drawPlaceholder(ctx, { x, y, width, height, label }) {
  ctx.save();
  ctx.fillStyle = '#e2e8f0'; // slate-200
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = '#94a3b8'; // slate-400
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, Math.max(1, width - 1), Math.max(1, height - 1));
  ctx.fillStyle = '#64748b'; // slate-500
  const fontPx = Math.max(8, Math.min(13, height * 0.25));
  ctx.font = `${fontPx}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label || 'barcode', x + width / 2, y + height / 2);
  ctx.restore();
}
