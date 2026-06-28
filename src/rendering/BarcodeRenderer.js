// Barcode Renderer
// Renders 1D BARCODE elements on canvas using real bwip-js geometry.

import { getBarcodeGeometry, linearFallbackModules, resolveSymbology, getHriConfig, SYMBOLOGY_LABELS, code39CheckChar, code93CheckChars, code11CheckDigits, interleaved2of5Digits, normalizeUpcEanExt, msiCheckDigits } from '../utils/barcodeGeometry.js';
import { drawLinear, drawPlaceholder, drawHriLine, measureHriLine } from './barcodeRender.js';
import { applyReverseOverlay, captureReverseBg } from './reverseOverlay.js';
import { CODE93_GUARD_CHAR, CODE11_GUARD_START_CHAR, CODE11_GUARD_STOP_CHAR } from '../config/constants.js';

// EAN-13/UPC-A guard bars extend this many dots below the barcode height
// (e.g. a 50-dot symbol gets 63-dot guard bars).
const GUARD_EXTEND_DOTS = 13;

/**
 * Renderer for BARCODE elements
 */
export class BarcodeRenderer {
  getLinearBarBottom(y, height, geom) {
    if (!Array.isArray(geom.bhs) || geom.bhs.length === 0) {
      return y + height;
    }

    let bottom = y + height;
    for (let i = 0; i < geom.bhs.length; i++) {
      const barHeightRatio = geom.bhs[i] ?? 1;
      const barBottomOffset = geom.bbs?.[i] ?? 0;
      const barY = y + (1 - barHeightRatio - barBottomOffset) * height;
      bottom = Math.max(bottom, barY + barHeightRatio * height);
    }
    return bottom;
  }

  /**
   * Render a BARCODE element on canvas
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {HTMLCanvasElement} canvas - Main canvas (for reverse overlay)
   * @param {Object} element - BARCODE element
   * @param {Object} _labelSettings - Label settings (unused, kept for uniform signature)
   * @param {Object} transform - Transform parameters {scale, homeX, homeY, labelTop}
   */
  render(ctx, canvas, element, _labelSettings, transform) {
    const { scale, homeX, homeY, labelTop } = transform;

    const x = (element.x + homeX) * scale;
    const y = (element.y + homeY + labelTop) * scale;
    const height = element.height * scale;
    const moduleWidthDots = element.width;
    const moduleWidth = moduleWidthDots * scale;
    const orientation = element.orientation || 'N';

    const geom = getBarcodeGeometry(element);

    if (geom.kind !== 'linear') {
      const width = linearFallbackModules((element.previewData || '').length) * moduleWidth;
      drawPlaceholder(ctx, { x, y, width, height, label: SYMBOLOGY_LABELS[resolveSymbology(element)] });
      return;
    }

    const data = element.previewData || '';
    const sym = resolveSymbology(element);
    // Code 39's interpretation line shows the start/stop `*` delimiters (matches
    // Labelary/Zebra ^B3); with the mod-43 check digit on, the computed check
    // character is appended before the closing `*` (e.g. *CODE39* -> *CODE39W*).
    // Interleaved 2 of 5 shows the actually-encoded digits (mod-10 check + even-length
    // leading-zero pad), so the HRI matches the bars.
    let displayText = data;
    if (sym === 'CODE39') {
      displayText = `*${data}${element.checkDigit ? code39CheckChar(data) : ''}*`;
    } else if (sym === 'LOGMARS') {
      // ^BL prints the HRI as uppercased data + the mandatory mod-43 check char, with no
      // Code 39-style `*` delimiters (verified on Labelary: ^FD12345 -> "12345F").
      const up = data.toUpperCase();
      displayText = `${up}${code39CheckChar(up)}`;
    } else if (sym === 'CODE11') {
      // Code 11 always carries check digit(s) in the bars; show them in the HRI like
      // Labelary (123456 -> 12345611 for 2 digits, 1234561 for the single-digit flag).
      // Labelary/Zebra also wrap the line in start/stop guards drawn as small hollow
      // triangles (△12345611△); the stop triangle is larger than the start one.
      const checks = code11CheckDigits(data, element.checkDigit);
      displayText = `${CODE11_GUARD_START_CHAR}${data}${checks}${CODE11_GUARD_STOP_CHAR}`;
    } else if (sym === 'MSI') {
      // ^BM's HRI shows the ^FD data; the e2 flag appends the mode's check digit(s)
      // (verified on Labelary: e2=N -> "1234567", e2=Y -> "12345674" for the default mod-10).
      displayText = `${data}${element.msiCheckInText ? msiCheckDigits(data, element.msiCheckMode) : ''}`;
    } else if (sym === 'INTERLEAVED2OF5') {
      displayText = interleaved2of5Digits(data, element.checkDigit);
    } else if (sym === 'CODE93') {
      // Labelary/Zebra wrap Code 93's HRI in the start/stop guard, drawn as an empty
      // box at each end (□CODE93□). The two check chars are always in the bars; ^BA's
      // e flag adds them inside the closing guard (e.g. □12345ABC37□). Matches Labelary.
      const checks = element.checkDigit ? code93CheckChars(data) : '';
      displayText = `${CODE93_GUARD_CHAR}${data}${checks}${CODE93_GUARD_CHAR}`;
    } else if (sym === 'CODABAR') {
      // Codabar's HRI wraps the data with the start/stop chars (e.g. A12345A),
      // matching Labelary/Zebra and the bars bwip encodes via start+data+stop.
      const start = (element.startChar || 'A').toUpperCase();
      const stop = (element.stopChar || 'A').toUpperCase();
      displayText = `${start}${data}${stop}`;
    } else if (sym === 'UPCEANEXT') {
      // Show the actually-encoded 2/5 digits (length-padded/truncated) so the HRI
      // matches the bars. ^BS defaults the HRI above (see BarcodeElement/ZPLParser).
      displayText = normalizeUpcEanExt(data);
    }
    const totalWidth = geom.modules * moduleWidth;
    const above = element.printTextAbove === true;
    // HRI line config (per symbology + position); null when no HRI is shown. ^BL LOGMARS
    // has no print-interpretation toggle — the HRI is always printed, so force it on.
    const hriConfig = (element.showText || sym === 'LOGMARS') ? getHriConfig(sym, above) : null;

    // Content extents in LOCAL space (bars top-left at origin 0,0). Mapped to
    // screen via the orientation transform so rotation + the reverse-print
    // capture region stay consistent.
    const textBounds = hriConfig
      ? measureHriLine(ctx, geom, { config: hriConfig, displayText, moduleWidthDots, scale, x: 0, y: 0, height, totalWidth, above })
      : null;
    const isEanUpc = sym === 'EAN13' || sym === 'EAN8' || sym === 'UPCA' || sym === 'UPCE';
    const barBottom = this.getLinearBarBottom(0, height, geom);
    let left0 = 0;
    let right0 = totalWidth;
    let top0 = 0;
    let bottom0 = isEanUpc ? Math.max(barBottom, height + GUARD_EXTEND_DOTS * scale) : barBottom;
    if (textBounds) {
      left0 = Math.min(left0, textBounds.left);
      right0 = Math.max(right0, textBounds.right);
      top0 = Math.min(top0, textBounds.top);
      bottom0 = Math.max(bottom0, textBounds.bottom);
    }

    const drawShape = (targetCtx, color, ox = 0, oy = 0) => {
      this._withOrientation(targetCtx, x + ox, y + oy, totalWidth, height, orientation, (lx, ly) => {
        // Extend EAN/UPC guard bars a fixed amount below the barcode height,
        // regardless of whether the interpretation text is visible.
        const guardBottomY = isEanUpc ? ly + height + GUARD_EXTEND_DOTS * scale : undefined;
        drawLinear(targetCtx, geom, { x: lx, y: ly, moduleW: moduleWidth, height, color, guardBottomY });

        if (hriConfig) {
          drawHriLine(targetCtx, geom, { config: hriConfig, displayText, moduleWidthDots, scale, x: lx, y: ly, height, totalWidth, color, above });
        }
      });
    };

    const captured = element.reverse
      ? captureReverseBg(ctx, canvas, this._screenBbox(x, y, totalWidth, height, orientation, { left0, top0, right0, bottom0 }))
      : null;

    drawShape(ctx, '#000000');

    if (captured) {
      applyReverseOverlay(ctx, captured, drawShape);
    }
  }

  /**
   * Map a local point (origin = bars top-left) to screen space for the given
   * orientation, using the same anchor model as GraphicFieldRenderer (the
   * rotated bars box keeps its top-left at the ^FO point).
   */
  _mapLocal(x, y, w, h, orientation, lx, ly) {
    switch (orientation) {
      case 'R': return [x + h - ly, y + lx];
      case 'I': return [x + w - lx, y + h - ly];
      case 'B': return [x + ly, y + w - lx];
      default: return [x + lx, y + ly];
    }
  }

  /**
   * Apply a translate+rotate so the unrotated content (drawn at local origin)
   * lands rotated with the bars box top-left anchored at (x,y). Mirrors
   * GraphicFieldRenderer._withOrientation.
   */
  _withOrientation(ctx, x, y, w, h, orientation, drawFn) {
    if (orientation === 'N') {
      drawFn(x, y);
      return;
    }
    ctx.save();
    if (orientation === 'R') {
      ctx.translate(x + h, y);
      ctx.rotate(Math.PI / 2);
    } else if (orientation === 'I') {
      ctx.translate(x + w, y + h);
      ctx.rotate(Math.PI);
    } else if (orientation === 'B') {
      ctx.translate(x, y + w);
      ctx.rotate(-Math.PI / 2);
    }
    drawFn(0, 0);
    ctx.restore();
  }

  /**
   * Screen-space bbox of the rotated content (including interpretation text),
   * for the reverse-print capture region. `extents` are in local space.
   */
  _screenBbox(x, y, w, h, orientation, { left0, top0, right0, bottom0 }) {
    const corners = [
      this._mapLocal(x, y, w, h, orientation, left0, top0),
      this._mapLocal(x, y, w, h, orientation, right0, top0),
      this._mapLocal(x, y, w, h, orientation, right0, bottom0),
      this._mapLocal(x, y, w, h, orientation, left0, bottom0),
    ];
    const xs = corners.map((c) => c[0]);
    const ys = corners.map((c) => c[1]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
  }
}
