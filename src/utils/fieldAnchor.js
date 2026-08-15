import { resolveFontMetrics, resolveBaselineOffset, measureTextAdvanceDots } from './fontMetrics.js';
import { getBarcodeGeometry, linearFallbackModules, matrixModuleDots } from './barcodeGeometry.js';
import { DEFAULT_FONT_HEIGHT } from '../config/constants.js';
import { placeholderNames, resolvePlaceholders } from './placeholders.js';

// ^FO uses a field's top-left; ^FT uses a family-specific baseline or edge.
// Model x/y always remains the visual top-left, with positionType affecting only
// import/export. Text rotation offsets are Labelary-calibrated; see
// tests/e2e/field-typeset-calibration.spec.ts.

/** Supported ^FT families. ^GS stays excluded because its bounds ignore its raw anchor. */
const FT_CAPABLE_TYPES = new Set([
  'BOX',
  'LINE',
  'CIRCLE',
  'DIAGONALLINE',
  'GRAPHIC',
  'TEXT',
  'FIELDBLOCK',
  'TEXTBLOCK',
  'BARCODE',
  'QRCODE',
]);

/** Text families anchor on the baseline, so they need font metrics and a label
 *  context; graphics anchor on their own declared extent and need neither. */
const TEXT_TYPES = new Set(['TEXT', 'FIELDBLOCK', 'TEXTBLOCK']);

/** Blocks (^FB/^TB) take their reading extent from a declared parameter instead
 *  of a text measurement, which is what lets them anchor at all four rotations
 *  with no DOM and no content — see textFieldExtents. */
const BLOCK_TYPES = new Set(['FIELDBLOCK', 'TEXTBLOCK']);

function rotationOf(element) {
  return element?.orientation || 'N';
}

/** Whether the offset for this element needs the advance-width term — true for
 *  the rotations that anchor the far reading end, and for right justification. */
function needsAdvanceWidth(element) {
  const rot = rotationOf(element);
  return rot === 'I' || rot === 'B' || element?.fieldJustify === 'R';
}

function hasDynamicContent(element) {
  return placeholderNames(element?.content).length > 0;
}

export function supportsFieldTypeset(type, element, defaults, measureInput) {
  if (!FT_CAPABLE_TYPES.has(type)) return false;

  if (type === 'QRCODE') {
    // Only QR and Data Matrix are measured, and only at rotation N: a rotated
    // matrix symbol is its own case and nothing pins it here.
    if (element?.fieldJustify === 'R') return false;
    if ((element?.orientation || 'N') !== 'N') return false;
    const sym = element?.symbology || 'QR';
    return !hasDynamicContent(element) && (sym === 'QR' || sym === 'DATAMATRIX');
  }

  if (type === 'BARCODE') {
    // z=1 for a barcode is not measured; only the four rotations are.
    if (element?.fieldJustify === 'R') return false;
    const orientation = element?.orientation || 'N';
    if (!['N', 'R', 'I', 'B'].includes(orientation)) return false;
    // I/B carry the encoded bar width in their anchor. Exported placeholders
    // are replaced outside the editor, after the coordinate has been written,
    // so no single static ^FT coordinate can preserve the visual top-left.
    return !hasDynamicContent(element) || (orientation !== 'I' && orientation !== 'B');
  }

  if (!TEXT_TYPES.has(type)) return true;

  const rot = rotationOf(element);
  if (!['N', 'R', 'I', 'B'].includes(rot)) return false;
  // Right justification is measured for rotation N only. Combined with a
  // rotation the anchor moves along a different axis and nothing pins where —
  // refuse rather than reuse the N formula.
  if (element?.fieldJustify === 'R' && rot !== 'N') return false;
  // Blocks anchor at every rotation off their declared extents, so they skip the
  // measurement gate below entirely. z=1 stays refused: the anchor moves to the
  // far edge of the BLOCK rather than of the ink, and nothing pins that.
  if (BLOCK_TYPES.has(type)) return element?.fieldJustify !== 'R';
  // Width-dependent cells need a DOM to measure in. Without one we cannot
  // anchor the field at all, and refusing beats substituting a guess.
  if (needsAdvanceWidth(element)) {
    // The production ZPL deliberately preserves placeholders. A downstream
    // substitution can change the advance but cannot rewrite this coordinate,
    // so width-dependent ^FT text would move relative to the editor layout.
    if (hasDynamicContent(element)) return false;
    return advanceWidthFor(element, defaults, measureInput) !== null;
  }
  return true;
}

/** Advance width in dots for the content the emitter will actually write, or
 *  null when it cannot be measured. Falls back to the element's own content,
 *  which is what import sees and what render() emits; renderPreview passes the
 *  placeholder-resolved string, so preview and export each anchor their own
 *  data — which is exactly what the printer does. */
function advanceWidthFor(element, defaults, measureInput) {
  const content = measureInput?.content;
  const text = content !== undefined && content !== null ? content : (element?.content ?? '');
  return measureTextAdvanceDots(element, {
    fontId: defaults?.fontId,
    defaultFontHeight: defaults?.defaultFontHeight,
    defaultFontWidth: defaults?.defaultFontWidth,
    customFonts: defaults?.customFonts,
  }, text);
}

/** 'FT' only when the element is explicitly typeset AND its type is ported.
 *  Everything else — including an ^FT flag left on an unported type by a future
 *  import — reads as 'FO', so emit can never produce an anchor this module
 *  cannot also invert on the way back in. */
export function positionTypeOf(element, defaults, measureInput) {
  if (!element || element.positionType !== 'FT') return 'FO';
  return supportsFieldTypeset(element.type, element, defaults, measureInput) ? 'FT' : 'FO';
}

/** Right-justified (^FO/^FT z=1) — absent means left, per the schema contract. */
function isRightJustified(element) {
  return element?.fieldJustify === 'R';
}

/**
 * Glyph-down extents used by a text field's ^FT anchor:
 *
 *   linesExtent  the field's own extent along the glyph-down axis
 *   anchorDrop   from the field's top edge, along glyph-down, to the coordinate
 *                ^FT anchors on
 *
 *   TEXT        baseline                     -> capDrop, over one em box
 *   FIELDBLOCK  baseline of the LAST line    -> capDrop + (lines-1)*(h+spacing)
 *   TEXTBLOCK   bottom of the declared box   -> blockHeight
 *
 * ^FB uses its declared line count; ^TB anchors the declared box bottom.
 * Printer metrics intentionally ignore browser-only custom-font substitution.
 */
function textFieldExtents(element, defaults = {}) {
  const fontHeight = element.fontSize || defaults.defaultFontHeight || DEFAULT_FONT_HEIGHT;

  if (element.type === 'TEXTBLOCK') {
    const blockHeight = Number(element.blockHeight) || fontHeight;
    return { linesExtent: blockHeight, anchorDrop: blockHeight };
  }

  const metrics = resolveFontMetrics(element, {
    fontId: defaults.fontId,
    defaultFontHeight: defaults.defaultFontHeight,
    defaultFontWidth: defaults.defaultFontWidth,
  }, 1);
  const capDrop = resolveBaselineOffset(metrics);

  if (element.type === 'FIELDBLOCK') {
    const lines = Math.max(1, Number(element.maxLines) || 1);
    const spacing = Number(element.lineSpacing) || 0;
    const blockExtent = (lines - 1) * (fontHeight + spacing);
    return { linesExtent: blockExtent + fontHeight, anchorDrop: blockExtent + capDrop };
  }
  return { linesExtent: fontHeight, anchorDrop: capDrop };
}

/**
 * Extent along the reading axis. A block declares it (^FB/^TB width); plain TEXT
 * has to measure it. Split out of textFieldExtents rather than returned beside
 * them because only I, B and z=1 read this axis — N and R must not pay for a
 * measurement they do not use, nor be refused when it is unavailable.
 */
function textReadingExtent(element, defaults, measureInput) {
  if (BLOCK_TYPES.has(element.type)) return Number(element.blockWidth) || 0;
  return Math.floor(advanceWidthFor(element, defaults, measureInput));
}

/**
 * Full 2D offset from a text field's ^FO anchor to its ^FT anchor, per
 * rotation. ^FT anchors the START of the reading direction, on the baseline of
 * the LAST line (or, for ^TB, the box's bottom edge):
 *
 *   N  (0, anchorDrop)                            R  (linesExtent - anchorDrop, 0)
 *   I  (readingExtent, linesExtent - anchorDrop)  B  (anchorDrop, readingExtent)
 *
 * I/B include the reading extent. Right justification anchors one dot past the
 * advance. This measured table is not a rotation of N; R uses descender space.
 */
function textFtOffset(element, defaults = {}, measureInput) {
  const { linesExtent, anchorDrop } = textFieldExtents(element, defaults);

  if (element.fieldJustify === 'R') {
    // Measured one dot past the advance: the anchor is the far edge of the
    // advance box, inclusive, where the floor()ed I/B term is exclusive.
    const advance = advanceWidthFor(element, defaults, measureInput);
    return { dx: Math.ceil(advance), dy: anchorDrop };
  }

  const rot = rotationOf(element);
  if (rot === 'N') return { dx: 0, dy: anchorDrop };
  if (rot === 'R') return { dx: linesExtent - anchorDrop, dy: 0 };

  const reading = textReadingExtent(element, defaults, measureInput);
  if (rot === 'I') return { dx: reading, dy: linesExtent - anchorDrop };
  return { dx: anchorDrop, dy: reading }; // B
}

/**
 * Vector from a field's own origin to the anchor the NEXT field inherits when its ^FT
 * omits a coordinate. The printer's typeset cursor advances along the reading axis only —
 * which is why a chained run shares one baseline, and why nothing here needs the
 * anchorDrop term the offsets above do: the cursor stays in anchor space.
 *
 * Every anchorable field moves it, not just text and not just ^FT ones — measured on
 * Labelary, a ^GB box and a ^BC barcode both leave the cursor at their right edge on the
 * ^FT y, and ^FO text leaves it on its baseline. `isFT` says whether the caller's origin
 * is the typeset anchor or the top-left, so the ^FO case can walk to the anchor first.
 *
 * Returns null for a type with no anchor at all, and `measured: false` when the field's
 * extent cannot be known, which leaves the cursor where it was but no longer trustworthy.
 * `reliable: false` marks an advance measured off content a downstream template engine
 * will replace: the width is right for the ZPL as written, but the printer's real chain
 * position moves with the substituted data and this coordinate cannot follow it.
 *
 * Calibrated on Labelary, where the three reference ports disagree with it (zebrash and
 * labelize miss both the ^FO and non-text cases, and all three miss the per-axis
 * fallback).
 */
export function typesetCursorAdvance(element, defaults, isFT) {
  if (!element || !FT_CAPABLE_TYPES.has(element.type)) return null;

  // How far the field runs along its reading axis. Text measures its ink; everything
  // else declares its extent, and each declaration is the one the anchor already uses.
  let reading = null;
  if (BLOCK_TYPES.has(element.type)) reading = Number(element.blockWidth) || 0;
  else if (TEXT_TYPES.has(element.type)) {
    const advance = advanceWidthFor(element, defaults);
    // floor, not round: measured on Labelary over 12 strings it lands exactly on the
    // printer's cursor 9 times against round's 7, and its residual straddles +/-1 where
    // round's is a systematic rightward bias. Same choice textReadingExtent makes for
    // the exclusive reading extent. What is left is our canvas advance approximating
    // the printer's per-glyph integer advances, which no rounding rule recovers.
    reading = advance === null ? null : Math.floor(advance);
  } else if (element.type === 'BARCODE') reading = barcodeBarRect(element).width;
  // QR and Data Matrix are the one measured exception: the cursor does NOT come back to
  // the ^FT y, because the firmware lift baked into matrixFtOffset moves the symbol's
  // bottom away from it. Nothing pins where, so refuse rather than guess.
  else if (element.type !== 'QRCODE') reading = emittedFootprint(element).width;

  // null is measureTextAdvanceDots' unmeasurable sentinel; a zero advance would read as
  // "the field printed nothing" rather than "we could not tell".
  if (reading === null) return { dx: 0, dy: 0, reliable: false, measured: false };

  // The cursor tracks the TYPESET anchor, so an ^FO field's top-left origin has to walk
  // there first — measured: text placed with ^FO leaves the cursor on its baseline, and
  // a following bare ^FT chains off it exactly as it would from an ^FT field.
  const base = isFT ? { dx: 0, dy: 0 } : ftAnchorOffset({ ...element, positionType: 'FT' }, defaults);
  const reliable = !hasDynamicContent(element);
  switch (rotationOf(element)) {
    case 'R': return { dx: base.dx, dy: base.dy + reading, reliable, measured: true };
    case 'I': return { dx: base.dx - reading, dy: base.dy, reliable, measured: true };
    case 'B': return { dx: base.dx, dy: base.dy - reading, reliable, measured: true };
    default: return { dx: base.dx + reading, dy: base.dy, reliable, measured: true };
  }
}

/**
 * Upright (unrotated) bar-rectangle of a 1D barcode, in dots: the module run
 * times the ^BY module width, by the ^B height. Deliberately the BARS ONLY —
 * the spec anchors ^FT at "the base of barcode, at the left edge", and
 * Labelary confirms the drop is the ^B height whether an interpretation line is
 * drawn below, above, or not at all.
 */
function barcodeBarRect(element, previewData) {
  const geom = getBarcodeGeometry(element, previewData || {});
  const modules = geom.kind === 'linear'
    ? geom.modules
    : linearFallbackModules(resolvePlaceholders(element.content, previewData || {}).length);
  return {
    width: modules * (Number(element.width) || 2),
    height: Number(element.height) || 0,
  };
}

/**
 * ^FO -> ^FT offset for a 1D barcode, per rotation, in upright bar dims.
 * Measured against Labelary, and identical to what the two reference
 * implementations compute — for barcodes the anchor really is a rotation of the
 * N vector about the anchor point, which is what makes this table so much
 * simpler than the text one.
 */
function barcodeFtOffset(element, previewData) {
  const { width, height } = barcodeBarRect(element, previewData);
  switch (element.orientation || 'N') {
    case 'R': return { dx: 0, dy: 0 };
    case 'I': return { dx: width, dy: 0 };
    case 'B': return { dx: height, dy: width };
    default: return { dx: 0, dy: height };
  }
}

/** QR firmware offsets: modules of lift under ^FT, and dots of ^FO y bias.
 *  Both measured. */
const QR_FT_MODULE_OFFSET = 3;
const QR_FO_Y_OFFSET_DOTS = 10;

/**
 * ^FO -> ^FT offset for a matrix symbol at rotation N, in dots.
 *
 * Measured against Labelary:
 *   QR           drop = modules*magnification + 3*magnification + 10
 *   Data Matrix  drop = the symbol height, outright
 *
 * The two QR terms are firmware artifacts, not geometry, so they are pinned by
 * measurement rather than derived: QR_FT_MODULE_OFFSET (3) and
 * QR_FO_Y_OFFSET_DOTS (10).
 */
function matrixFtOffset(element, previewData) {
  const geom = getBarcodeGeometry(element, previewData || {});
  if (geom.kind !== 'matrix') return null;
  const { my } = matrixModuleDots(element);
  const height = geom.rows * my;
  if ((element.symbology || 'QR') === 'DATAMATRIX') return { dx: 0, dy: height };
  const mag = Number(element.magnification) || 5;
  return { dx: 0, dy: height + QR_FT_MODULE_OFFSET * mag + QR_FO_Y_OFFSET_DOTS };
}

/**
 * Footprint drawn by the emitted command. Import and export share this function
 * because it differs from getBounds() for commands such as ^GC and ^GD.
 */
export function emittedFootprint(element) {
  const num = (v) => Number(v) || 0;
  switch (element?.type) {
    case 'BOX':
    case 'DIAGONALLINE':
      return { width: num(element.width), height: num(element.height) };
    case 'LINE':
      // A vertical line swaps length and thickness in the emitted ^GB.
      return element.orientation === 'V'
        ? { width: num(element.thickness), height: num(element.width) }
        : { width: num(element.width), height: num(element.thickness) };
    case 'CIRCLE':
      return element.aspectLocked
        ? { width: num(element.width), height: num(element.width) }
        : { width: num(element.width), height: num(element.height) };
    case 'GRAPHIC':
      // Rotation is baked into the bitmap bytes at emit, so a R/B graphic
      // occupies the swapped extent. (The emitted raster width is padded up to
      // a byte boundary; that padding is ignored here, so a right-justified
      // graphic whose width is not a multiple of 8 can sit up to 7 dots off.
      // Left-justified — everything the editor produces today — is exact,
      // because only the height enters the anchor.)
      return element.orientation === 'R' || element.orientation === 'B'
        ? { width: num(element.heightDots), height: num(element.widthDots) }
        : { width: num(element.widthDots), height: num(element.heightDots) };
    default:
      return { width: 0, height: 0 };
  }
}

/**
 * Vector from the visual top-left to the coordinate ^FT emits, in dots.
 * ^FT anchors the bottom-left corner, or the bottom-right when right-justified.
 * Returns a zero vector for ^FO elements and for unported types, which is what
 * lets callers apply it unconditionally.
 */
export function ftAnchorOffset(element, defaults, measureInput) {
  if (positionTypeOf(element, defaults, measureInput) !== 'FT') return { dx: 0, dy: 0 };
  if (TEXT_TYPES.has(element.type)) {
    return textFtOffset(element, defaults, measureInput);
  }
  if (element.type === 'BARCODE') {
    return barcodeFtOffset(element, measureInput?.previewData);
  }
  if (element.type === 'QRCODE') {
    return matrixFtOffset(element, measureInput?.previewData) || { dx: 0, dy: 0 };
  }
  const { width, height } = emittedFootprint(element);
  return { dx: isRightJustified(element) ? width : 0, dy: height };
}

/**
 * ^FO's z=1 makes the same horizontal move ^FT's does — the origin becomes the field's
 * right edge — while the vertical anchor stays the top (verified on Labelary: a
 * right-justified ^FO and ^FT put the same text at the same x). Returns 0 for a
 * left-justified field and null when the width cannot be measured, which is what makes
 * the caller fall back to a plain left-justified ^FO.
 */
export function foJustifyOffsetX(element, defaults, measureInput) {
  if (!isRightJustified(element)) return 0;
  if (TEXT_TYPES.has(element.type)) {
    // Same limits as the ^FT anchor: rotation N, no block, no placeholder whose
    // downstream substitution would move the measured edge.
    if (rotationOf(element) !== 'N' || BLOCK_TYPES.has(element.type)) return null;
    if (hasDynamicContent(element)) return null;
    const advance = advanceWidthFor(element, defaults, measureInput);
    return advance === null ? null : Math.ceil(advance);
  }
  // A barcode's or matrix symbol's right-justified anchor is not measured (see
  // supportsFieldTypeset); everything else declares its own width.
  if (element.type === 'BARCODE' || element.type === 'QRCODE') return null;
  if (!FT_CAPABLE_TYPES.has(element.type)) return null;
  return emittedFootprint(element).width;
}

/**
 * Vector fieldOriginCommand adds to the visual top-left to reach the coordinate
 * it writes: the ^FT anchor, or ^FO's z=1 horizontal move, or zero. Callers that
 * need to reason about the *emitted* coordinate without building the command —
 * ZPLParser's label-home flattening — read it here so the two agree.
 */
export function emittedOriginOffset(element, defaults, measureInput) {
  if (positionTypeOf(element, defaults, measureInput) === 'FT') {
    return ftAnchorOffset(element, defaults, measureInput);
  }
  // null means unmeasurable, which makes the command fall back to a plain ^FO.
  return { dx: foJustifyOffsetX(element, defaults, measureInput) || 0, dy: 0 };
}

/**
 * Emit side: the ^FO/^FT command for an element whose x/y is the visual
 * top-left. ^FO/^FT take integers, so this is the one place that rounds —
 * import keeps the model coordinate exact so the pair round-trips byte-for-byte.
 */
export function fieldOriginCommand(element, defaults, measureInput) {
  if (positionTypeOf(element, defaults, measureInput) !== 'FT') {
    // Whether the field is right-justified, NOT whether the move is non-zero: an
    // empty field's advance is 0, and dropping the z there would silently turn it
    // left-justified on the next import.
    // null is the unmeasurable sentinel — fall back to a plain, left-justified ^FO.
    const dx = foJustifyOffsetX(element, defaults, measureInput);
    if (dx === null || !isRightJustified(element)) {
      return `^FO${Math.round(element.x)},${Math.round(element.y)}`;
    }
    return `^FO${Math.round(element.x + dx)},${Math.round(element.y)},1`;
  }
  const { dx, dy } = ftAnchorOffset(element, defaults, measureInput);
  const z = isRightJustified(element) ? ',1' : element.fieldJustify === 'L' ? ',0' : '';
  return `^FT${Math.round(element.x + dx)},${Math.round(element.y + dy)}${z}`;
}

/**
 * Per-family floor for normalized top-left coordinates. Graphics clamp both
 * axes, linear barcodes clamp y, and text clips without clamping. QR clamps
 * before its 3-module ^FT lift and 10-dot ^FO bias.
 */
function fieldOriginFloor(data) {
  if (TEXT_TYPES.has(data.type)) return null;
  if (data.type === 'BARCODE') return { y: 0 };
  if (data.type === 'QRCODE') {
    if ((data.symbology || 'QR') === 'DATAMATRIX') return { y: 0 };
    const mag = Number(data.magnification) || 5;
    return { y: -(QR_FT_MODULE_OFFSET * mag + QR_FO_Y_OFFSET_DOTS) };
  }
  return { x: 0, y: 0 };
}

/**
 * Import side: the exact inverse. Rewrites a parsed element data object whose
 * x/y is still the raw ^FT anchor so that x/y becomes the visual top-left, and
 * stamps the positionType/fieldJustify that emit will read back.
 *
 * Returns the object unchanged for types this module cannot anchor, so the
 * caller keeps its legacy FT→FO warning for exactly those.
 */
export function normalizeFtImport(data, justify, defaults, explicitJustify = false) {
  // Check the justify the SOURCE declared, not the element's (which is only set
  // below) — the text gating keys off fieldJustify.
  const probe = data ? { ...data, fieldJustify: justify } : null;
  if (!data || !supportsFieldTypeset(data.type, probe, defaults)) return null;

  if (TEXT_TYPES.has(data.type)) {
    const { dx, dy } = textFtOffset(probe, defaults);
    data.x = data.x - dx;
    data.y = data.y - dy;
  } else if (data.type === 'BARCODE') {
    const { dx, dy } = barcodeFtOffset(data);
    data.x = data.x - dx;
    data.y = data.y - dy;
  } else if (data.type === 'QRCODE') {
    const offset = matrixFtOffset(data);
    if (!offset) return null;
    data.x = data.x - offset.dx;
    data.y = data.y - offset.dy;
  } else {
    const { width, height } = emittedFootprint(data);
    data.x = (justify === 'R' ? data.x - width : data.x);
    data.y = data.y - height;
  }
  const floor = fieldOriginFloor(data);
  if (floor) {
    if (floor.x !== undefined && data.x < floor.x) data.x = floor.x;
    if (floor.y !== undefined && data.y < floor.y) data.y = floor.y;
  }
  data.positionType = 'FT';
  if (justify === 'R') data.fieldJustify = 'R';
  else if (explicitJustify) data.fieldJustify = 'L';
  return data;
}

/**
 * Import side for a right-justified ^FO (z=1): the x it carries is the field's right
 * edge, so back it up to the visual top-left the model stores. Returns false when the
 * width is not measurable and the caller must keep the raw coordinate.
 */
export function normalizeFoJustifyImport(data, defaults) {
  if (!data) return false;
  const probe = { ...data, fieldJustify: 'R' };
  const dx = foJustifyOffsetX(probe, defaults);
  if (dx === null) return false;
  data.x -= dx;
  // A z=1 field narrower than its own width backs up past the left edge, where
  // the printer clamps a graphic exactly as it does under ^FT.
  const floor = fieldOriginFloor(data);
  if (floor?.x !== undefined && data.x < floor.x) data.x = floor.x;
  data.fieldJustify = 'R';
  return true;
}
