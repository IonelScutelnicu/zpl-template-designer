// ^FP (Field Parameter) — one field's print direction and inter-character gap.
//
// Layout, measured against Labelary (see docs/adr.md):
//   H  x_i = origin + i*(advance + gap)   gap sits BETWEEN characters
//   V  glyphs stay upright, stacked one FONT CELL apart; the gap is IGNORED
//   R  x_i = origin - i*advance - (i+1)*gap   gap sits BEFORE every character,
//      including the first, so the run also starts one gap left of the origin
//
// The direction applies in the field's own rotated frame — H and R run along the
// reading axis, V along the glyph-down axis — and ^FO anchors the resulting run's
// top-left, not its first character. ^FP is field-scoped, resets at ^FS, and has no
// effect on barcodes. The cell pitch is resolveFontCellHeight(), NOT snappedHeight,
// which for a bitmap font is only the cap ink.

/** Zebra documents the gap as 0 to 9999 dots. */
export const FP_MAX_CHAR_GAP = 9999;

/** Print directions, in the order the properties panel lists them. */
export const PRINT_DIRECTIONS = [
  ['H', 'Horizontal (left to right)'],
  ['V', 'Vertical (top to bottom)'],
  ['R', 'Reverse (right to left)'],
];

/** Any unrecognised letter reads as H, which is what the printer does. */
export function normalizePrintDirection(value) {
  const letter = String(value ?? '').trim().toUpperCase();
  return letter === 'V' || letter === 'R' ? letter : 'H';
}

export function clampCharGap(value) {
  const gap = parseInt(value);
  return Number.isFinite(gap) ? Math.max(0, Math.min(FP_MAX_CHAR_GAP, gap)) : 0;
}

/**
 * The gap that actually moves glyphs. Labelary ignores it in vertical layout, and
 * the canvas has to agree with the preview — the stored value still round-trips.
 */
export function effectiveCharGap(element) {
  if (normalizePrintDirection(element?.printDirection) === 'V') return 0;
  return clampCharGap(element?.charGap);
}

/** Whether this field prints anything other than plain left-to-right. */
export function hasFieldParameter(element) {
  return normalizePrintDirection(element?.printDirection) !== 'H' || clampCharGap(element?.charGap) > 0;
}

/**
 * The ^FP fragment for an element, or '' when the field is plain horizontal with no
 * gap — so every template written before ^FP existed still emits byte-for-byte.
 */
export function fieldParameterCommand(element) {
  if (!hasFieldParameter(element)) return '';
  return `^FP${normalizePrintDirection(element.printDirection)},${clampCharGap(element.charGap)}`;
}

/**
 * Leading edges of each character along the field's reading axis, in whatever unit
 * the advances are given in. Horizontal is the ordinary pen walk; reverse walks
 * backwards and, per measurement, spends one gap BEFORE every character — so even a
 * single-character field starts one gap left of the origin, and the run's right edge
 * lands at `advance - gap` rather than at the origin.
 *
 *   H  offset_i = sum(advances[0..i-1]) + i*gap
 *   R  offset_i = -sum(advances[0..i-1]) - (i+1)*gap
 *
 * Vertical does not use this axis at all; it stacks along the perpendicular one, so
 * its offsets are all zero and `max` is simply the widest character.
 *
 * @param {number[]} advances Natural advance of each character
 * @param {'H'|'V'|'R'} direction
 * @param {number} gap
 * @returns {{offsets: number[], min: number, max: number}} `min`/`max` bound the run
 *          relative to the field origin, and are 0/0 for empty text.
 */
export function layoutCharOffsets(advances, direction, gap = 0) {
  const offsets = [];
  let min = 0;
  let max = 0;
  let walked = 0;
  const resolved = normalizePrintDirection(direction);
  const reverse = resolved === 'R';

  for (let i = 0; i < advances.length; i += 1) {
    // Vertical does not move along this axis at all: every character starts at the
    // origin and the stack grows along the perpendicular one.
    const offset = resolved === 'V' ? 0 : reverse ? -walked - (i + 1) * gap : walked + i * gap;
    offsets.push(offset);
    min = Math.min(min, offset);
    max = Math.max(max, offset + advances[i]);
    walked += advances[i];
  }
  return { offsets, min, max };
}

/**
 * Where a run's leading edge sits relative to the field origin, per ^A rotation, in
 * label axes. Only ^FPR produces a negative `min`, and only two rotations keep it
 * negative on screen: N maps the reading axis to label +x and R to label +y, so the
 * run walks back from the origin. I and B anchor the far reading end instead — the
 * renderer pivots on the run's `max` — so their box starts exactly at the origin and
 * grows positive. Treating them like R/B width-height swaps puts the box on the
 * opposite side of the origin from the ink.
 *
 * @param {{min: number}} layout Result from layoutCharOffsets, or null
 * @param {'N'|'R'|'I'|'B'} orientation
 * @returns {{dx: number, dy: number}} offset from the field origin to the box corner
 */
export function runLeadOffset(layout, orientation) {
  const min = layout ? layout.min : 0;
  if (!min) return { dx: 0, dy: 0 };
  if (orientation === 'R') return { dx: 0, dy: min };
  if (orientation === 'I' || orientation === 'B') return { dx: 0, dy: 0 };
  return { dx: min, dy: 0 };
}

let graphemeSegmenter;

/**
 * Split field data into the units ^FP places, which is NOT the same rule in every
 * direction. Measured on Labelary with "e" + U+0301 + "X" (three code points, two
 * clusters):
 *
 *   H  the gap falls between CODE POINTS — the run gets two gaps, not one
 *   V  two cells, not three: the accent stacks with its base letter
 *   R  two positions, and the second sits a full "é" advance away
 *
 * which is exactly what Zebra documents — "for vertical and reverse printing
 * directions, combining semantic clusters are used to place characters". Intl.Segmenter
 * is available in every browser this editor targets; the code-point split is a
 * fallback, not a supported path.
 */
export function segmentForDirection(text, direction) {
  const source = String(text ?? '');
  if (normalizePrintDirection(direction) === 'H') return Array.from(source);
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') return Array.from(source);
  if (!graphemeSegmenter) graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  return Array.from(graphemeSegmenter.segment(source), part => part.segment);
}
