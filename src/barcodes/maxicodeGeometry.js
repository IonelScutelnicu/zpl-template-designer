export const MAXICODE_COLS = 30;
export const MAXICODE_ROWS = 33;

// MaxiCode is a fixed-size symbol: ^BD carries no magnification parameter, so
// Zebra/Labelary always print it at a constant 25.0 mm width regardless of any
// size field (measured against the Labelary API: 200 dots @ 8 dpmm, 300 @ 12,
// 600 @ 24). The on-canvas hex pitch is therefore derived from the label
// density, not the element's magnification, so the canvas matches the preview.
export const MAXICODE_WIDTH_MM = 25;

// Hex column pitch: the 25 mm symbol width spans the 30 columns (pitch = width/30),
// matching bwip/Labelary (which size the symbol over 30 module steps — verified
// against the Labelary API: ^BD ink is 200×193 dots @ 8 dpmm). Dividing by 30.5 to
// account for the odd-row half-module overhang made the hexes ~1.7% too small.
export function maxicodePitchDots(dpmm = 8) {
  return (MAXICODE_WIDTH_MM * dpmm) / MAXICODE_COLS;
}

// Structured Carrier Message group separator (ASCII GS).
const SCM_GS = '\x1d';

// MaxiCode modes 2 & 3 (postal) encode a Structured Carrier Message:
//   postcode <GS> country <GS> serviceClass <GS> secondaryMessage
// bwip-js (the on-canvas encoder) wants those four fields GS-separated, whereas
// Zebra/Labelary read them from the raw ^FD as *fixed-width* fields concatenated
// with no separators: a postcode (mode 2 = 9 numeric digits, mode 3 = 6
// alphanumeric chars), a 3-digit country code, a 3-digit service class, then the
// message. Slice those positions out and re-join with GS so the canvas matches the
// API's primary-message encoding (verified against the Labelary API for mode 2).THe
// Non-conforming characters are coerced — digits for the numeric fields, uppercase
// A–Z/0–9 for the mode-3 postcode — so arbitrary ^FD still encodes to a symbol
// rather than collapsing to the placeholder. The emitted ^FD is left untouched
// (it goes to the printer). NOTE: bwip-js and Labelary diverge on the mode-3
// primary encoding, so mode 3 remains an approximation of the API preview.
export function maxicodeScmText(data, mode) {
  const str = String(data ?? '');
  const pcLen = mode === 3 ? 6 : 9;
  const rawPc = str.slice(0, pcLen);
  const postcode = (mode === 3
    ? (rawPc.toUpperCase().match(/[0-9A-Z]/g) || []).join('')
    : rawPc.replace(/\D/g, '0')) || '0';
  // Country and service class are fixed 3-digit fields; bwip rejects anything else,
  // so coerce to digits and pad with trailing zeros when the data runs short.
  const pad3 = (s) => s.replace(/\D/g, '0').padEnd(3, '0').slice(0, 3);
  const country = pad3(str.slice(pcLen, pcLen + 3));
  const serviceClass = pad3(str.slice(pcLen + 3, pcLen + 6));
  // A MaxiCode may carry a primary message only, but bwip-js can't encode an empty
  // secondary, so fall back to a single space when the data is too short to have one
  // — keeps a symbol on the canvas instead of the fallback placeholder.
  const message = str.slice(pcLen + 6) || ' ';
  return `${postcode}${SCM_GS}${country}${SCM_GS}${serviceClass}${SCM_GS}${message}`;
}

export function maxicodeSize(W) {
  const H = (W * 2) / Math.sqrt(3);
  const rowPitch = (W * Math.sqrt(3)) / 2;
  return { width: MAXICODE_COLS * W, height: (MAXICODE_ROWS - 1) * rowPitch + H };
}

export function maxicodeGeometry(raw) {
  return {
    kind: 'maxicode',
    cols: MAXICODE_COLS,
    rows: MAXICODE_ROWS,
    modules: Array.from(raw.pixs, (c) => ({ col: c % MAXICODE_COLS, row: (c / MAXICODE_COLS) | 0 })),
  };
}
