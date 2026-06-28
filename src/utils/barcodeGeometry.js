// Barcode geometry
// Single source of truth for barcode/2D module geometry, backed by bwip-js.
// Used by element models (bounds), renderers (drawing), and resize/match logic
// so on-canvas size always reflects the real encoded symbol.

import bwipjs from '../vendor/bwip-js.mjs';

// Map our symbology codes to bwip-js bcid names.
const BWIP_BCID = {
  CODE128: 'code128',
  CODE39: 'code39',
  CODE93: 'code93ext', // full-ASCII Code 93 — Zebra ^BA accepts lowercase/control chars
  CODE11: 'code11',
  CODABAR: 'rationalizedCodabar',
  INTERLEAVED2OF5: 'interleaved2of5',
  INDUSTRIAL2OF5: 'industrial2of5',
  EAN13: 'ean13',
  EAN8: 'ean8',
  UPCA: 'upca',
  UPCE: 'upce',
  UPCEANEXT: 'ean5', // 2-digit data switches this to 'ean2' in buildBwipOptions

  QR: 'qrcode',
  DATAMATRIX: 'datamatrix',
  PDF417: 'pdf417',
  MICROPDF417: 'micropdf417',
  AZTEC: 'azteccode',
};

// 1D symbologies live on the BARCODE element; 2D on the QRCODE element.
export const BARCODE_SYMBOLOGIES = ['CODE128', 'CODE39', 'CODE93', 'CODE11', 'CODABAR', 'INTERLEAVED2OF5', 'INDUSTRIAL2OF5', 'EAN13', 'EAN8', 'UPCA', 'UPCE', 'UPCEANEXT'];
export const QR_SYMBOLOGIES = ['QR', 'DATAMATRIX', 'PDF417', 'MICROPDF417', 'AZTEC'];

// Human-readable labels (dropdowns, placeholder fallback).
export const SYMBOLOGY_LABELS = {
  CODE128: 'Code 128',
  CODE39: 'Code 39',
  CODE93: 'Code 93',
  CODE11: 'Code 11',
  CODABAR: 'Codabar',
  INTERLEAVED2OF5: 'Interleaved 2 of 5',
  INDUSTRIAL2OF5: 'Industrial 2 of 5',
  EAN13: 'EAN-13',
  EAN8: 'EAN-8',
  UPCA: 'UPC-A',
  UPCE: 'UPC-E',
  UPCEANEXT: 'UPC/EAN Extension',
  QR: 'QR Code',
  DATAMATRIX: 'Data Matrix',
  PDF417: 'PDF417',
  MICROPDF417: 'Micro-PDF417',
  AZTEC: 'Aztec',
};

// Rich metadata for the symbology picker UI: ZPL command, one-line description
// and dimension family. Keyed by symbology code; label comes from SYMBOLOGY_LABELS.
export const SYMBOLOGY_META = {
  CODE128: { code: '^BC', desc: 'Alphanumeric · variable length', dim: '1D' },
  CODE39: { code: '^B3', desc: 'A–Z, 0–9, symbols · variable', dim: '1D' },
  CODE93: { code: '^BA', desc: 'Full ASCII · compact Code 39', dim: '1D' },
  CODE11: { code: '^B1', desc: 'Digits + hyphen · telecom (USD-8)', dim: '1D' },
  CODABAR: { code: '^BK', desc: 'Digits + -$:/.+ · libraries, medical', dim: '1D' },
  INTERLEAVED2OF5: { code: '^B2', desc: 'Numeric only · even length', dim: '1D' },
  INDUSTRIAL2OF5: { code: '^BI', desc: 'Numeric only · all data in bars', dim: '1D' },
  EAN13: { code: '^BE', desc: 'Enter 12 digits · auto-padded', dim: '1D' },
  EAN8: { code: '^B8', desc: 'Enter 7 digits · auto-padded', dim: '1D' },
  UPCA: { code: '^BU', desc: 'Enter 11 digits · auto-padded', dim: '1D' },
  UPCE: { code: '^B9', desc: 'Enter 6 digits · zero-suppressed', dim: '1D' },
  UPCEANEXT: { code: '^BS', desc: '2 or 5 digit add-on · ISBN/price', dim: '1D' },
  QR: { code: '^BQ', desc: 'Matrix · URLs, high capacity', dim: '2D' },
  DATAMATRIX: { code: '^BX', desc: 'Matrix · tiny marks, GS1', dim: '2D' },
  PDF417: { code: '^B7', desc: 'Stacked · IDs, large payloads', dim: '2D' },
  MICROPDF417: { code: '^BF', desc: 'Compact stacked · small payloads', dim: '2D' },
  AZTEC: { code: '^B0', desc: 'Matrix · compact, no quiet zone', dim: '2D' },
};

// Default preview data per symbology (valid for each so a fresh element renders
// cleanly). Also used by the symbology-switch behaviour in PropertyListenersManager.
export const DEFAULT_PREVIEW_DATA = {
  CODE128: '1234567890',
  CODE39: 'CODE39',
  CODE93: 'CODE93',
  CODE11: '123456',
  CODABAR: '1234567890',
  INTERLEAVED2OF5: '1234567890',
  INDUSTRIAL2OF5: '1234567890',
  EAN13: '123456789012',
  EAN8: '1234567',
  UPCE: '123456',
  UPCA: '12345678901',
  UPCEANEXT: '12345',
  QR: 'https://example.com',
  DATAMATRIX: 'Data Matrix',
  PDF417: 'PDF417',
  MICROPDF417: '12345', // must fit the default mode 0 (1 col × 11 rows)
  AZTEC: 'Aztec',
};

// Fixed-length numeric symbologies: ZPL auto-truncates / left-pads with zeros to
// exactly this many ^FD chars (printer computes the trailing check digit). These
// barcodes are digit-only, so any disallowed character is mapped to '0' first.
// Mirror that here so the canvas (bwip-js) matches Labelary/printer output. (^BE doc)
const FIXED_FD_LENGTH = { EAN13: 12, EAN8: 7, UPCA: 11, UPCE: 6 };

export function normalizeBarcodeData(symbology, data) {
  const len = FIXED_FD_LENGTH[symbology];
  let s = data || '';
  if (!len) return s;
  s = s.replace(/\D/g, '0'); // numeric-only: disallowed chars become '0'
  // Right-aligned: keep the trailing `len` chars (Labelary truncates leading
  // overflow) / left-pad short data with zeros.
  return s.length > len ? s.slice(-len) : s.padStart(len, '0');
}

/**
 * Resolve the digits a ^BS UPC/EAN extension actually encodes. The add-on is a
 * 2-digit (ean2) or 5-digit (ean5) symbol chosen by data length: ≤2 digits → the
 * 2-digit variant, ≥3 → the 5-digit variant. Like the other UPC/EAN symbologies it
 * is digit-only (disallowed chars become '0') and ZPL left-pads with zeros; overflow
 * is truncated keeping the leftmost digits (Labelary: ^FD123456 → "12345"). Single
 * source of truth for buildBwipOptions (bars) and BarcodeRenderer (HRI).
 */
export function normalizeUpcEanExt(data) {
  const s = String(data ?? '').replace(/\D/g, '0');
  const target = s.length <= 2 ? 2 : 5;
  return s.length > target ? s.slice(0, target) : s.padStart(target, '0');
}

/**
 * An Aztec "rune" (^B0 d=300) encodes a single integer 0–255. bwip-js and the
 * printer both reject non-numeric / out-of-range / empty data, so coerce any
 * input to a valid rune value — keeping digits, clamping to 255, defaulting
 * empty to 0. Mirrors normalizeBarcodeData's silent coercion so the canvas
 * preview, the Labelary preview and the print all stay in sync.
 */
export function normalizeAztecRune(data) {
  const digits = String(data ?? '').replace(/\D/g, '');
  if (!digits) return '0';
  return String(Math.min(255, parseInt(digits, 10)));
}

/** Resolve an element's symbology, defaulting by element type for legacy data. */
export function resolveSymbology(element) {
  return element.symbology || (element.type === 'QRCODE' ? 'QR' : 'CODE128');
}

/**
 * Per-symbology 2D-barcode size fields and their clamp ranges. Single source of
 * truth for the {min, max} limits shared by drag-resize (interaction-handler),
 * match-to-label (AlignmentService), and the properties-panel inputs
 * (PropertiesPanelRenderer) so those sites can't drift apart. The {min, max}
 * shape is consumed directly by createInputGroup's options.
 */
export const BARCODE_2D_SIZE_BOUNDS = {
  PDF417: { moduleWidth: { min: 1, max: 20 }, rowHeight: { min: 1, max: 100 } },
  MICROPDF417: { moduleWidth: { min: 1, max: 20 }, rowHeight: { min: 1, max: 100 } },
  DATAMATRIX: { moduleSize: { min: 1, max: 30 } },
  QR: { magnification: { min: 1, max: 10 } },
  AZTEC: { magnification: { min: 1, max: 10 } }
};

/** Pixel size (in dots) of a single matrix module for a 2D element. */
export function matrixModuleDots(element) {
  switch (resolveSymbology(element)) {
    case 'DATAMATRIX':
      return { mx: element.moduleSize || 4, my: element.moduleSize || 4 };
    case 'PDF417':
    case 'MICROPDF417':
      return { mx: element.moduleWidth || 2, my: element.rowHeight || 4 };
    case 'QR':
    case 'AZTEC':
    default:
      return { mx: element.magnification || 5, my: element.magnification || 5 };
  }
}

/** Code 128 module-count estimate, used as a fallback when encoding fails. */
export function linearFallbackModules(dataLength) {
  return 35 + 11 * dataLength;
}

const POSITIONED_TEXT_SYMBOLOGIES = new Set(['EAN13', 'EAN8', 'UPCA', 'UPCE']);

// HRI (human-readable interpretation) line config. `hriFontConfig` is the single
// source of truth, grouped by barcode family (`EAN` covers EAN-13/UPC-A, `CODE`
// covers Code 128/39), then by position (`top`/`bottom`); HRI_CONFIG maps each
// symbology to its family. Every position declares the font, placement, and a
// per-module-width (1–10) map — all plain, hand-tunable data, consumed by the
// renderer (barcodeRender.js) via getHriConfig().
//
//   font.id     ZPL font id — gets preloaded (fontLoader), and is required by the
//               bitmap font-model. Set it whenever the line uses a bundled font
//               (font A, OCR-B) so its FontFace is loaded, even for direct rendering.
//   font.model  true → render via the bitmap font-model (family + scaleX stretch from
//               ZPL_FONTS[id]); module entries give requested {height,width} in dots.
//   font.family CSS family for direct pixel rendering; module entries give {fontSize}
//               in dots. `letterSpacing` (a ratio of fontSize) is optional. A line may
//               set both `id` (to preload) and `family` (e.g. OCR-B below).
//   placement: 'center'    → one centered string above/below the bars.
//              'fragments' → place each bwip HRI fragment by its x-offset (EAN/UPC
//                            below: digit groups split across the guard bars).
//   module[mw]: per-module-width { height,width | fontSize, gap, xOffset } in dots.
//               xOffset horizontally nudges the line (positive = right).
const HRI_OCRB = '"OCRB", monospace';

const hriFontConfig = {
  EAN: {
    top: {
      font: { id: 'A', model: true },
      placement: 'center',
      module: {
        1: { height: 9, width: 5, gap: 10, xOffset: -1 },
        2: { height: 18, width: 10, gap: 12, xOffset: -3 },
        3: { height: 27, width: 15, gap: 14, xOffset: -3 },
        4: { height: 36, width: 20, gap: 16, xOffset: -5 },
        5: { height: 45, width: 25, gap: 18, xOffset: -6 },
        6: { height: 54, width: 30, gap: 20, xOffset: -8 },
        7: { height: 63, width: 35, gap: 22, xOffset: -8 },
        8: { height: 72, width: 40, gap: 24, xOffset: -8 },
        9: { height: 81, width: 45, gap: 26, xOffset: -9 },
        10:{ height: 90, width: 50, gap: 28, xOffset: -11 },
      }
    },
    bottom: {
      font: { id: 'E', family: HRI_OCRB }, // OCR-B: id preloads the FontFace, family renders direct-px
      placement: 'fragments',
      module: {
        1: { fontSize: 8, gap: 4, xOffset: 2 },
        2: { fontSize: 18, gap: 4, xOffset: 2 },
        3: { fontSize: 28, gap: 5, xOffset: 3 },
        4: { fontSize: 28, gap: 5, xOffset: 2 },
        5: { fontSize: 28, gap: 5, xOffset: 2 },
        6: { fontSize: 28, gap: 5, xOffset: 0 },
        7: { fontSize: 28, gap: 5, xOffset: 0 },
        8: { fontSize: 56, gap: 7, xOffset: 3 },
        9: { fontSize: 56, gap: 7, xOffset: 2 },
        10:{ fontSize: 56, gap: 7, xOffset: 2 },
      }
    },
  },
  CODE: {
    top: {
      font: { id: 'A', model: true },
      placement: 'center',
      letterSpacing: 0.12,
      module: {
        1: { height: 9, width: 5, gap: 10, xOffset: -1 },
        2: { height: 18, width: 10, gap: 12, xOffset: -1 },
        3: { height: 27, width: 15, gap: 14, xOffset: -2 },
        4: { height: 36, width: 20, gap: 16, xOffset: -4 },
        5: { height: 45, width: 25, gap: 18, xOffset: -4 },
        6: { height: 54, width: 30, gap: 20, xOffset: -5 },
        7: { height: 63, width: 35, gap: 22, xOffset: -5 },
        8: { height: 72, width: 40, gap: 24, xOffset: -5 },
        9: { height: 81, width: 45, gap: 26, xOffset: -5 },
        10:{ height: 90, width: 50, gap: 28, xOffset: -6 },
      }
    },
    bottom: {
      font: { id: 'A', model: true },
      placement: 'center',
      letterSpacing: 0.12,
      module: {
        1: { height: 9, width: 5, gap: 6, xOffset: -1 },
        2: { height: 18, width: 10, gap: 6, xOffset: -1 },
        3: { height: 27, width: 15, gap: 6, xOffset: -2 },
        4: { height: 36, width: 20, gap: 6, xOffset: -3 },
        5: { height: 45, width: 25, gap: 6, xOffset: -4 },
        6: { height: 54, width: 30, gap: 6, xOffset: -5 },
        7: { height: 63, width: 35, gap: 6, xOffset: -5 },
        8: { height: 72, width: 40, gap: 6, xOffset: -5 },
        9: { height: 81, width: 45, gap: 6, xOffset: -5 },
        10:{ height: 90, width: 50, gap: 6, xOffset: -6 },
      }
    }
  },
  UPCEANEXT: {
    top: {
      font: { id: 'E', family: HRI_OCRB },
      placement: 'center',
      letterSpacing: -0.01,
      module: {
        1: { fontSize: 9, gap: 2, xOffset: 1 },
        2: { fontSize: 18, gap: 4, xOffset: 0 },
        3: { fontSize: 28, gap: 3, xOffset: -2 },
        4: { fontSize: 28, gap: 3, xOffset: -2 },
        5: { fontSize: 28, gap: 3, xOffset: -2 },
        6: { fontSize: 28, gap: 3, xOffset: -2 },
        7: { fontSize: 28, gap: 3, xOffset: -2 },
        8: { fontSize: 56, gap: 5, xOffset: -5 },
        9: { fontSize: 56, gap: 5, xOffset: -5 },
        10:{ fontSize: 56, gap: 5, xOffset: -5 },
      }
    },
    bottom: {
      font: { id: 'A', model: true },
      placement: 'center',
      letterSpacing: 0.12,
      module: {
        1: { height: 9, width: 5, gap: 6, xOffset: -1 },
        2: { height: 18, width: 10, gap: 6, xOffset: -1 },
        3: { height: 27, width: 15, gap: 6, xOffset: -2 },
        4: { height: 36, width: 20, gap: 6, xOffset: -3 },
        5: { height: 45, width: 25, gap: 6, xOffset: -4 },
        6: { height: 54, width: 30, gap: 6, xOffset: -5 },
        7: { height: 63, width: 35, gap: 6, xOffset: -5 },
        8: { height: 72, width: 40, gap: 6, xOffset: -5 },
        9: { height: 81, width: 45, gap: 6, xOffset: -5 },
        10:{ height: 90, width: 50, gap: 6, xOffset: -6 },
      }
    }
  },
  CODE11: {
    top: {
      font: { id: 'A', model: true },
      placement: 'center',
      letterSpacing: 0.12,
      module: {
        1: { height: 9, width: 5, gap: 10, xOffset: 0 },
        2: { height: 18, width: 10, gap: 12, xOffset: 0 },
        3: { height: 27, width: 15, gap: 14, xOffset: 0 },
        4: { height: 36, width: 20, gap: 16, xOffset: -1 },
        5: { height: 45, width: 25, gap: 18, xOffset: -1 },
        6: { height: 54, width: 30, gap: 20, xOffset: -2 },
        7: { height: 63, width: 35, gap: 22, xOffset: -2 },
        8: { height: 72, width: 40, gap: 24, xOffset: -2 },
        9: { height: 81, width: 45, gap: 26, xOffset: -2 },
        10:{ height: 90, width: 50, gap: 28, xOffset: -3 },
      }
    },
    bottom: {
      font: { id: 'A', model: true },
      placement: 'center',
      letterSpacing: 0.12,
      module: {
        1: { height: 9, width: 5, gap: 6, xOffset: 0 },
        2: { height: 18, width: 10, gap: 6, xOffset: 0 },
        3: { height: 27, width: 15, gap: 6, xOffset: 0 },
        4: { height: 36, width: 20, gap: 6, xOffset: 0 },
        5: { height: 45, width: 25, gap: 6, xOffset: -1 },
        6: { height: 54, width: 30, gap: 6, xOffset: -2 },
        7: { height: 63, width: 35, gap: 6, xOffset: -2 },
        8: { height: 72, width: 40, gap: 6, xOffset: -2 },
        9: { height: 81, width: 45, gap: 6, xOffset: -2 },
        10:{ height: 90, width: 50, gap: 6, xOffset: -2 },
      }
    }
  },
}

// Symbology → HRI family. EAN-13/UPC-A share one entry; Code 128/39 share another.
export const HRI_CONFIG = {
  EAN13: hriFontConfig.EAN,
  EAN8: hriFontConfig.EAN,
  UPCA: hriFontConfig.EAN,
  UPCE: hriFontConfig.EAN,
  CODE128: hriFontConfig.CODE,
  CODE39: hriFontConfig.CODE,
  CODE93: hriFontConfig.CODE,
  CODE11: hriFontConfig.CODE11,
  CODABAR: hriFontConfig.CODE,
  INTERLEAVED2OF5: hriFontConfig.CODE,
  INDUSTRIAL2OF5: hriFontConfig.CODE,
  UPCEANEXT: hriFontConfig.UPCEANEXT,
};

/** Resolve the HRI line config for a symbology + position, or null if none. */
export function getHriConfig(symbology, above) {
  return HRI_CONFIG[symbology]?.[above ? 'top' : 'bottom'] || null;
}

// Code 39 symbol values, indexed for the mod-43 check digit.
const CODE39_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%';

/**
 * Compute the Code 39 mod-43 check character for `data` (the char Zebra appends to
 * the HRI when ^B3's check-digit flag is on). Returns '' if any char is outside the
 * Code 39 set — in that case bwip can't encode the data either, so it never shows.
 */
export function code39CheckChar(data) {
  let sum = 0;
  for (const ch of data || '') {
    const idx = CODE39_CHARS.indexOf(ch);
    if (idx < 0) return '';
    sum += idx;
  }
  return CODE39_CHARS[sum % 43];
}

// Code 93's 47-value alphabet for the two mandatory check characters (C, K). The
// first 43 entries match the Code 39 data set; values 43–46 are the shift symbols,
// which Zebra/Labelary render as 'a'–'d' in the HRI (confirmed live: a check value
// of 44 prints as 'b').
const CODE93_CHECK_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%abcd';

// Full-ASCII (Code 93 Extended) expansion, indexed by ASCII code 0–127. Mirrors
// bwip-js's `code93ext` encoder: every character becomes either one base symbol or
// a shift symbol ($,%,/,+ → values 43–46) followed by a base letter. The check
// characters are computed over this expanded symbol sequence — the same bytes bwip
// feeds through its mandatory-check pass — so the HRI matches the printed bars.
const CODE93_EXT_TOKENS = [
  '%U', '$A', '$B', '$C', '$D', '$E', '$F', '$G', '$H', '$I', '$J', '$K', '$L',
  '$M', '$N', '$O', '$P', '$Q', '$R', '$S', '$T', '$U', '$V', '$W', '$X', '$Y',
  '$Z', '%A', '%B', '%C', '%D', '%E', ' ', '/A', '/B', '/C', '$', '%', '/F',
  '/G', '/H', '/I', '/J', '+', '/L', '-', '.', '/', '0', '1', '2', '3', '4', '5',
  '6', '7', '8', '9', '/Z', '%F', '%G', '%H', '%I', '%J', '%V', 'A', 'B', 'C',
  'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S',
  'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '%K', '%L', '%M', '%N', '%O', '%W', '+A',
  '+B', '+C', '+D', '+E', '+F', '+G', '+H', '+I', '+J', '+K', '+L', '+M', '+N',
  '+O', '+P', '+Q', '+R', '+S', '+T', '+U', '+V', '+W', '+X', '+Y', '+Z', '%P',
  '%Q', '%R', '%S', '%T',
];
// The four shift symbols $ % / + carry check values 43–46 (rendered a–d in the HRI).
const CODE93_SHIFTS = { $: 43, '%': 44, '/': 45, '+': 46 };
const CODE93_EXT_VALS = CODE93_EXT_TOKENS.map((tok) => {
  if (tok.length === 1) return [CODE93_CHECK_CHARS.indexOf(tok)];
  return [CODE93_SHIFTS[tok[0]], CODE93_CHECK_CHARS.indexOf(tok[1])];
});

/**
 * Compute Code 93's two check characters (C then K) for `data` — the chars Zebra
 * appends to the HRI when ^BA's print-check-digit flag (e) is on. The check chars
 * are always encoded in the bars regardless; this only affects the readable line.
 * Returns '' if any char is outside Code 93's full-ASCII set (bwip couldn't encode
 * it either), so non-ASCII data shows no appended check characters.
 */
export function code93CheckChars(data) {
  const s = String(data ?? '');
  const vals = [];
  for (const ch of s) {
    const code = ch.codePointAt(0);
    // Code 93 Extended covers ASCII 0–127 only; anything above can't be encoded.
    if (code > 127) return '';
    vals.push(...CODE93_EXT_VALS[code]);
  }
  const n = vals.length;
  // C: weights cycle 1..20 from the right; K: weights cycle 1..15 from the right
  // and include C in its sum. (Both taken mod 47.)
  let c = 0;
  let k = 0;
  for (let i = 0; i < n; i++) {
    c += ((n - i - 1) % 20 + 1) * vals[i];
    k += ((n - i) % 15 + 1) * vals[i];
  }
  c %= 47;
  k = (k + c) % 47;
  return CODE93_CHECK_CHARS[c] + CODE93_CHECK_CHARS[k];
}

// Code 11 character set (values 0–10); the check digit can itself be the hyphen (10).
const CODE11_CHARS = '0123456789-';

/**
 * Compute Code 11's check digit(s) for `data` — the chars Zebra always appends to the
 * symbol/HRI. ^B1's e flag picks the count: `single` (e=Y) → one C digit; otherwise
 * (e=N, the default) → two digits C+K. C weights cycle 1..10 from the right; K weights
 * cycle 1..9 over data+C; both mod 11. Returns '' if any char is outside the Code 11
 * set (bwip couldn't encode it either). (Verified on Labelary: 123456 → C=1, K=1.)
 */
export function code11CheckDigits(data, single = false) {
  const s = String(data ?? '');
  for (const ch of s) if (CODE11_CHARS.indexOf(ch) < 0) return '';
  const checkChar = (str, cycle) => {
    let sum = 0;
    for (let i = 0; i < str.length; i++) {
      sum += CODE11_CHARS.indexOf(str[str.length - 1 - i]) * ((i % cycle) + 1);
    }
    return CODE11_CHARS[sum % 11];
  };
  const c = checkChar(s, 10);
  return single ? c : c + checkChar(s + c, 9);
}

/**
 * Compute the Interleaved 2 of 5 mod-10 check digit for `digits` (the char Zebra
 * appends when ^B2's check-digit flag is on). Weights alternate 3,1 from the
 * rightmost data digit; check = (10 − sum%10) % 10. Non-digits are ignored.
 */
export function mod10CheckChar(digits) {
  const s = String(digits ?? '').replace(/\D/g, '');
  let sum = 0;
  // Rightmost data digit is weighted 3, then 1, alternating leftward.
  for (let i = 0; i < s.length; i++) {
    const d = s.charCodeAt(s.length - 1 - i) - 48;
    sum += (i % 2 === 0) ? d * 3 : d;
  }
  return String((10 - (sum % 10)) % 10);
}

/**
 * Resolve the digit string an Interleaved 2 of 5 symbol actually encodes, mirroring
 * the ZPL ^B2 printer rules: strip to digits, append the mod-10 check digit when
 * enabled, then left-pad a '0' if the total count is odd (I2of5 needs an even number
 * of digits). Single source of truth for both the encoded text (buildBwipOptions) and
 * the HRI line (BarcodeRenderer), so the bars and the readable text always agree.
 */
export function interleaved2of5Digits(data, checkDigit) {
  let s = String(data ?? '').replace(/\D/g, '');
  if (checkDigit) s += mod10CheckChar(s);
  if (s.length % 2 === 1) s = '0' + s;
  return s;
}

// bwip-js' native wide:narrow element value per ratio-bearing symbology. Code 39 is
// encoded at a fixed 3:1, Interleaved 2 of 5 at 2:1; getBarcodeGeometry rescales these
// wide elements to the element's effective ^BY ratio so the canvas matches Labelary.
const NATIVE_WIDE = { CODE39: 3, INTERLEAVED2OF5: 2, CODABAR: 3, CODE11: 3, INDUSTRIAL2OF5: 3 };

// ZPL ^BF mode (0–33) → fixed Micro-PDF417 [dataColumns, rows] variant. Each mode is
// a fixed size (not auto-fit): data that doesn't fit fails to encode (Labelary renders
// nothing), so the canvas must request the same fixed bwip `version` to match. Mirrors
// Zebra Table 9 / bwip's micropdf417 nonccametrics. version string is `rows x columns`.
const MICROPDF417_MODES = [
  [1, 11], [1, 14], [1, 17], [1, 20], [1, 24], [1, 28],            // modes 0–5  (1 col)
  [2, 8], [2, 11], [2, 14], [2, 17], [2, 20], [2, 23], [2, 26],    // modes 6–12 (2 cols)
  [3, 6], [3, 8], [3, 10], [3, 12], [3, 15], [3, 20], [3, 26], [3, 32], [3, 38], [3, 44], // 13–22 (3 cols)
  [4, 4], [4, 6], [4, 8], [4, 10], [4, 12], [4, 15], [4, 20], [4, 26], [4, 32], [4, 38], [4, 44], // 23–33 (4 cols)
];

/** Resolve the ^BF mode (0–33) to bwip's `version` string ("rows x columns"). */
export function microPdf417Version(mode) {
  const [cols, rows] = MICROPDF417_MODES[Math.max(0, Math.min(33, mode | 0))];
  return `${rows}x${cols}`;
}

/** Build the bwip-js options object for an element's current symbology + data. */
function buildBwipOptions(element) {
  const symbology = resolveSymbology(element);
  const opts = { bcid: BWIP_BCID[symbology] || 'code128', text: normalizeBarcodeData(symbology, element.previewData) };
  if (symbology === 'INTERLEAVED2OF5') {
    // Resolve the encoded digits ourselves (mod-10 check + even-length leading-zero
    // pad) and feed bwip the literal string with no implicit check digit — bwip's own
    // includecheck/even-padding behaviour doesn't match Zebra's. (See interleaved2of5Digits.)
    opts.text = interleaved2of5Digits(element.previewData, element.checkDigit);
  }
  if (symbology === 'UPCE') {
    // ZPL ^B9 takes 6 data digits with the number-system digit fixed at 0 (Zebra doc;
    // confirmed on Labelary: ^FD123456 -> "0 123456 5"). bwip's `upce` needs the
    // 7-digit number-system + 6 form, so prepend the fixed 0; bwip computes the check.
    opts.text = '0' + normalizeBarcodeData(symbology, element.previewData);
  }
  if (symbology === 'UPCEANEXT') {
    // ^BS is a 2- or 5-digit add-on; the data length selects bwip's ean2/ean5 bcid.
    const text = normalizeUpcEanExt(element.previewData);
    opts.text = text;
    opts.bcid = text.length === 2 ? 'ean2' : 'ean5';
  }
  if (POSITIONED_TEXT_SYMBOLOGIES.has(symbology)) {
    // Always request text geometry: bwip only emits EAN/UPC's extended guard bars
    // (the taller bars at the start/middle/end) when includetext is on. We want
    // those guard bars even when the HRI line is hidden — the renderer gates the
    // actual text drawing on element.showText, so this only affects bar heights.
    opts.includetext = true;
  }
  if (symbology === 'CODE39' && element.checkDigit) {
    // ^B3 with the mod-43 check digit enabled (e param Y): the printer appends one
    // computed check character, widening the symbol by one Code 39 character. Mirror
    // that on the canvas so the bar count matches Labelary. (The check char is added
    // to the HRI line by BarcodeRenderer via code39CheckChar.)
    opts.includecheck = true;
  }
  if (symbology === 'CODABAR') {
    // ZPL ^BK encodes the start/stop characters (k/l params, A–D) around the ^FD
    // body; bwip's `rationalizedCodabar` expects them as the first/last chars of the
    // text (e.g. A12345A). The body accepts digits and - $ : / . + only.
    const start = (element.startChar || 'A').toUpperCase();
    const stop = (element.stopChar || 'A').toUpperCase();
    opts.text = start + normalizeBarcodeData(symbology, element.previewData) + stop;
  }
  if (symbology === 'CODE11') {
    // ^B1 always appends check digit(s): e=N → 2 (C+K), e=Y → 1 (C). bwip's own
    // includecheck picks the count from data length, which doesn't match Zebra, so we
    // compute the digits and feed the literal string with bwip's check disabled.
    opts.text = (element.previewData || '') + code11CheckDigits(element.previewData, element.checkDigit);
  }
  if (symbology === 'CODE93') {
    // Code 93's two check characters (C, K) are mandatory — Zebra always encodes
    // them in the bars (verified on Labelary: the bar count is identical whether
    // ^BA's e flag is N or Y). The e flag only toggles their HRI display, which the
    // renderer handles via code93CheckChars; the bars must always include them.
    opts.includecheck = true;
  }
  if (symbology === 'CODE128') {
    // Mirror the ZPL `^FD>:` prefix (BarcodeElement): force Code 128 Subset B so
    // the canvas geometry matches Labelary, whose ^BC defaults to Subset B. Without
    // this, bwip-js auto-selects the more compact Subset C for digit-only data,
    // making the on-canvas barcode narrower than what actually prints.
    opts.newencoder = true; // suppressc is only honoured by the new encoder path
    opts.suppressc = true;
  }
  if (symbology === 'QR') {
    opts.eclevel = element.errorCorrection || 'Q';
  } else if (symbology === 'AZTEC') {
    // Mirror the ^B0 'd' parameter (see QRCodeElement._render / ZPLParser._parseAztec):
    // 'rune' / 'compact' / 'full' select bwip's format; explicit layers size the
    // symbol; otherwise 'auto' uses an error-correction percentage (bwip eclevel,
    // valid 5–95). errorControl 0 = printer default → omit eclevel (bwip default 23).
    const mode = element.aztecSizeMode || 'auto';
    const layers = element.aztecLayers || 0;
    if (mode === 'rune') {
      opts.format = 'rune';
      opts.text = normalizeAztecRune(element.previewData); // rune = single 0–255 byte
    } else if (mode === 'compact') {
      opts.format = 'compact';
      if (layers > 0) opts.layers = Math.min(layers, 4);
    } else if (mode === 'full') {
      opts.format = 'full';
      if (layers > 0) opts.layers = Math.min(layers, 32);
    } else {
      const ec = element.aztecErrorControl || 0;
      if (ec >= 5) opts.eclevel = Math.min(ec, 95);
      // Zebra/Labelary pick the smallest symbol for d=0 (auto): a compact Aztec
      // when the data fits, else full-range. bwip defaults to 'full', so probe
      // compact explicitly — otherwise the canvas symbol is one ring (4 modules)
      // larger than the API preview for small payloads.
      opts.format = aztecAutoFormat(opts);
    }
  } else if (symbology === 'PDF417') {
    if (element.securityLevel != null) opts.eclevel = element.securityLevel;
    if (element.columns > 0) {
      opts.columns = element.columns;
    } else {
      // Mirror Zebra's auto-column sizing so the canvas width matches Labelary.
      const cols = pdf417PreferredColumns(opts);
      if (cols > 0) opts.columns = cols;
    }
  } else if (symbology === 'MICROPDF417') {
    // ^BF's mode fixes the rows×cols variant; request the matching bwip version so
    // the canvas mirrors Labelary (including encode failure when data overflows it).
    opts.version = microPdf417Version(element.microPdfMode || 0);
  }
  return opts;
}

const geomCache = new Map();
const CACHE_MAX = 256;

// Chosen Aztec auto-format ('compact'|'full'), keyed by `text|eclevel`. Probing a
// compact encode runs on every buildBwipOptions call (before the geometry cache),
// so memoise it to keep the extra encode off the hot path.
const aztecFormatCache = new Map();

/**
 * Pick the Aztec symbol format Zebra/Labelary would choose for an auto (d=0)
 * symbol: the smaller compact form when the data fits within its 1–4 layers,
 * otherwise full-range. bwip defaults to full, so we probe a compact encode and
 * fall back to full if it throws (data/eclevel too large for compact).
 */
function aztecAutoFormat(opts) {
  const key = `${opts.text}|${opts.eclevel ?? ''}`;
  const cached = aztecFormatCache.get(key);
  if (cached) return cached;

  let format = 'full';
  try {
    bwipjs.raw({ ...opts, format: 'compact' });
    format = 'compact';
  } catch {
    format = 'full';
  }

  if (aztecFormatCache.size >= CACHE_MAX) aztecFormatCache.clear();
  aztecFormatCache.set(key, format);
  return format;
}

// Predicted PDF417 column counts, keyed by `text|eclevel`. buildBwipOptions runs
// before the geometry cache is consulted, so memoising here keeps the extra probe
// encode off the hot path for repeated lookups of the same symbol.
const pdf417ColsCache = new Map();

/**
 * Pick the data-column count Zebra/Labelary firmware would choose for an auto
 * (columns=0) PDF417 symbol. bwip-js's own auto-columns runs consistently wider
 * than Zebra, so the on-canvas symbol ends up too wide versus the Labelary
 * preview. Zebra instead sizes the symbol toward a ~2:1 printed width:height
 * aspect, with rows at the PDF417 spec's 3-module height. We probe-encode once
 * (bwip auto) to get the total codeword count N, then choose the column count
 * whose resulting symbol is closest to that aspect (empirically matches Labelary
 * across security levels 0–8 and a range of data lengths).
 */
function pdf417PreferredColumns(opts) {
  const key = `${opts.text}|${opts.eclevel ?? ''}`;
  const cached = pdf417ColsCache.get(key);
  if (cached != null) return cached;

  let cols = 0;
  try {
    const probe = bwipjs.raw({ bcid: 'pdf417', text: opts.text, eclevel: opts.eclevel });
    const o = probe.find((e) => e && e.pixs);
    if (o) {
      // PDF417 row width in modules is 17·columns + 69, so columns = (pixx − 69)/17.
      const autoCols = Math.round((+o.pixx - 69) / 17);
      const n = autoCols * (o.pixs.length / +o.pixx); // total codewords
      let best = null;
      for (let c = 1; c <= 30; c++) {
        const rows = Math.max(3, Math.ceil(n / c));
        if (rows > 90) continue;
        const aspect = (17 * c + 69) / (3 * rows);
        const dev = Math.abs(aspect - 2.06);
        // `<=` breaks near-ties toward more columns, matching Zebra's bias.
        if (!best || dev <= best.dev) best = { c, dev };
      }
      cols = best ? best.c : 0;
    }
  } catch {
    cols = 0; // fall back to bwip auto; encode errors surface downstream.
  }

  if (pdf417ColsCache.size >= CACHE_MAX) pdf417ColsCache.clear();
  pdf417ColsCache.set(key, cols);
  return cols;
}

/**
 * Encode an element with bwip-js and return its raw geometry.
 * @returns {{kind:'linear', sbs:number[], modules:number}
 *          | {kind:'matrix', cols:number, rows:number, pixs:number[]}
 *          | {kind:'error', message:string}}
 */
export function getBarcodeGeometry(element) {
  const opts = buildBwipOptions(element);
  const symbology = resolveSymbology(element);
  // Code 39 & Interleaved 2 of 5 take their wide:narrow ratio from the element (^BY
  // ratio), not bwip. The printer can only print whole dots, so the wide bar is
  // floor(w·r) dots and the *effective* ratio is floor(w·r)/w — not the literal r (see
  // ^BY "Module Width Ratios in Dots"). Using the effective ratio keeps the canvas
  // width in sync with Labelary (e.g. w=2, r=2.3 prints at 2:1, not 2.3:1).
  const nativeWide = NATIVE_WIDE[symbology] || 0;
  const wnRatio = nativeWide
    ? Math.floor((element.width || 2) * (element.ratio || 3)) / (element.width || 2)
    : 0;
  const key = `${opts.bcid}|${opts.text}|${opts.eclevel ?? ''}|${opts.columns || ''}|${opts.version || ''}|${opts.format || ''}|${opts.layers ?? ''}|${opts.includetext ? 'text' : ''}|${opts.includecheck ? 'chk' : ''}|${wnRatio}`;
  const cached = geomCache.get(key);
  if (cached) return cached;

  let result;
  try {
    const stack = bwipjs.raw(opts);
    const o = stack.find((e) => e && (e.sbs || e.pixs)) || stack[0];
    if (o && o.pixs) {
      // bwip's pixy is the rendered pixel height, which for PDF417 bakes in a
      // default row multiplier (e.g. 14 module rows reported as pixy=42). pixs is
      // stored at true module resolution, so derive the real row count from it —
      // our own rowHeight/moduleSize handles vertical scaling. (QR/Data Matrix are
      // square so pixy already equals the row count.)
      const cols = +o.pixx;
      result = { kind: 'matrix', cols, rows: o.pixs.length / cols, pixs: o.pixs };
    } else if (o && o.sbs) {
      // bwip-js encodes Code 39 at a fixed 3:1 and Interleaved 2 of 5 at 2:1
      // wide:narrow ratio. Rescale the wide elements (value nativeWide) to the
      // element's effective ^BY ratio (wnRatio, quantized above) so the canvas width
      // matches Labelary; other linear symbologies (Code 128, EAN/UPC) keep bwip's widths.
      const sbs = wnRatio && wnRatio !== nativeWide
        ? Array.from(o.sbs, (v) => (v === nativeWide ? wnRatio : v))
        : o.sbs;
      let modules = 0;
      for (let i = 0; i < sbs.length; i++) modules += sbs[i];
      // ean2/ean5 add-ons: bwip uniformly shrinks every bar (bhs≈0.77, bbs≈-0.07) to
      // reserve space above the bars for the digits. Zebra/Labelary instead treat
      // ^BS's h as the full bar height and place the HRI outside it (verified on
      // Labelary: h=100 → 100-dot bars), so drop the shrink and render full-height bars.
      const isUpcEanExt = symbology === 'UPCEANEXT';
      result = {
        kind: 'linear',
        sbs,
        modules,
        bhs: !isUpcEanExt && Array.isArray(o.bhs) ? o.bhs : null,
        bbs: !isUpcEanExt && Array.isArray(o.bbs) ? o.bbs : null,
        // Only trust bwip's text positions when we asked for them (includetext,
        // i.e. EAN13/UPCA). Without it bwip still emits a degenerate entry with a
        // null y-offset for Code 128/39; treating that as positioned text draws it
        // over the bars. Leaving txt null lets the renderer draw centered text below.
        txt: (opts.includetext && Array.isArray(o.txt) && o.txt.length > 0) ? o.txt : null,
      };
    } else {
      result = { kind: 'error', message: 'No barcode geometry produced' };
    }
  } catch (e) {
    result = { kind: 'error', message: String((e && e.message) || e) };
  }

  if (geomCache.size >= CACHE_MAX) geomCache.clear();
  geomCache.set(key, result);
  return result;
}
