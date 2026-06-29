// Density rescale — scales every dot-valued element and label-setting
// field by newDpmm/oldDpmm so the label's physical appearance is preserved
// when the user changes Print Density.
//
// See docs/adr/0002-density-change-rescales-elements.md and CONTEXT.md
// ("Density rescale") for the decision and edge cases.

import { BARCODE_2D_SIZE_BOUNDS } from '../utils/barcodeGeometry.js';

const MIN_DIM = 1;

// 1D barcode module width maps to ^BY, whose ZPL range is a hard 1..10 (the UI
// uses the same bound). The 2D bounds come from BARCODE_2D_SIZE_BOUNDS so the
// rescale can never produce a value the property panel couldn't represent.
const BARCODE_1D_WIDTH_BOUNDS = { min: 1, max: 10 };

/**
 * The bounded module-size field(s) a barcode element exposes, keyed by the
 * active symbology. Shared by analyze (to count clamps) and apply (to clamp).
 * @returns {Array<[field: string, bounds: {min:number,max:number}]>}
 */
function boundedBarcodeFields(el) {
  if (el.type === 'BARCODE') return [['width', BARCODE_1D_WIDTH_BOUNDS]];
  if (el.type === 'QRCODE') {
    if (el.symbology === 'DATAMATRIX') return [['moduleSize', BARCODE_2D_SIZE_BOUNDS.DATAMATRIX.moduleSize]];
    if (el.symbology === 'PDF417' || el.symbology === 'MICROPDF417' || el.symbology === 'CODE49') return [
      ['moduleWidth', BARCODE_2D_SIZE_BOUNDS[el.symbology].moduleWidth],
      ['rowHeight', BARCODE_2D_SIZE_BOUNDS[el.symbology].rowHeight],
    ];
    return [['magnification', BARCODE_2D_SIZE_BOUNDS.QR.magnification]]; // QR (or default)
  }
  return [];
}

function scaleDim(value, s) {
  return Math.max(MIN_DIM, Math.round(value * s));
}

function scaleClamped(value, s, bounds) {
  return Math.max(bounds.min, Math.min(bounds.max, Math.round(value * s)));
}

function scalePos(value, s) {
  return Math.round(value * s);
}

function isUnscalableGraphic(el) {
  return el.type === 'GRAPHIC' && (el.opaqueRaw || !el.sourceDataUrl);
}

function isEditableGraphic(el) {
  return el.type === 'GRAPHIC' && !el.opaqueRaw && !!el.sourceDataUrl;
}

/**
 * Factory defaults for label-settings dot fields, mirroring AppState's
 * constructor. Used to decide whether a rescale would touch anything.
 */
const FACTORY_LABEL_DEFAULTS = {
  defaultFontHeight: 20,
  defaultFontWidth: 0,
  homeX: 0,
  homeY: 0,
  labelTop: 0,
};

/**
 * Inspect what a rescale would touch without mutating anything.
 * @returns {{hasWorkToDo: boolean, unscalableGraphicCount: number, clampedBarcodeCount: number}}
 */
export function analyzeRescale({ elements, labelSettings, oldDpmm, newDpmm }) {
  if (!oldDpmm || !newDpmm || oldDpmm === newDpmm) {
    return { hasWorkToDo: false, unscalableGraphicCount: 0, clampedBarcodeCount: 0 };
  }
  const s = newDpmm / oldDpmm;

  const hasNonDefaultLabelDots = Object.keys(FACTORY_LABEL_DEFAULTS).some(
    (key) => (labelSettings[key] ?? FACTORY_LABEL_DEFAULTS[key]) !== FACTORY_LABEL_DEFAULTS[key]
  );

  const hasElements = Array.isArray(elements) && elements.length > 0;
  const hasWorkToDo = hasElements || hasNonDefaultLabelDots;

  let unscalableGraphicCount = 0;
  let clampedBarcodeCount = 0;
  if (hasElements) {
    for (const el of elements) {
      if (isUnscalableGraphic(el)) unscalableGraphicCount++;
      // A barcode whose scaled module field would fall outside its ZPL/UI
      // range gets clamped on apply, so it won't reach full physical scale.
      for (const [field, bounds] of boundedBarcodeFields(el)) {
        const scaled = Math.round((el[field] || bounds.min) * s);
        if (scaled < bounds.min || scaled > bounds.max) { clampedBarcodeCount++; break; }
      }
    }
  }

  return { hasWorkToDo, unscalableGraphicCount, clampedBarcodeCount };
}

/**
 * Mutate elements in place and return the patch for labelSettings dot fields.
 *
 * Editable graphics get their widthDots/heightDots scaled here, but the
 * actual bitmap re-rasterization is async and must be performed by the
 * caller (see `editableGraphicsToReencode` in the returned object).
 *
 * @returns {{
 *   labelSettingsPatch: object,
 *   editableGraphicsToReencode: Array<{element: object, widthDots: number, heightDots: number}>
 * }}
 */
export function applyRescale({ elements, labelSettings, oldDpmm, newDpmm }) {
  const s = newDpmm / oldDpmm;
  const editableGraphicsToReencode = [];

  for (const el of elements) {
    el.x = scalePos(el.x || 0, s);
    el.y = scalePos(el.y || 0, s);

    switch (el.type) {
      case 'BOX':
        el.width = scaleDim(el.width, s);
        el.height = scaleDim(el.height, s);
        el.thickness = scaleDim(el.thickness, s);
        break;
      case 'LINE':
        el.width = scaleDim(el.width, s);
        el.thickness = scaleDim(el.thickness, s);
        break;
      case 'DIAGONALLINE':
        el.width = scaleDim(el.width, s);
        el.height = scaleDim(el.height, s);
        el.thickness = scaleDim(el.thickness, s);
        break;
      case 'CIRCLE':
        el.width = scaleDim(el.width, s);
        el.height = scaleDim(el.height, s);
        el.thickness = scaleDim(el.thickness, s);
        break;
      case 'TEXT':
        if (el.fontSize) el.fontSize = scaleDim(el.fontSize, s);
        if (el.fontWidth) el.fontWidth = scaleDim(el.fontWidth, s);
        break;
      case 'TEXTBLOCK':
        if (el.fontSize) el.fontSize = scaleDim(el.fontSize, s);
        if (el.fontWidth) el.fontWidth = scaleDim(el.fontWidth, s);
        el.blockWidth = scaleDim(el.blockWidth, s);
        el.blockHeight = scaleDim(el.blockHeight, s);
        break;
      case 'FIELDBLOCK':
        if (el.fontSize) el.fontSize = scaleDim(el.fontSize, s);
        if (el.fontWidth) el.fontWidth = scaleDim(el.fontWidth, s);
        el.blockWidth = scaleDim(el.blockWidth, s);
        if (el.lineSpacing) el.lineSpacing = Math.round(el.lineSpacing * s);
        if (el.hangingIndent) el.hangingIndent = Math.round(el.hangingIndent * s);
        break;
      case 'BARCODE':
        el.height = scaleDim(el.height, s);
        // ^BY module width is bounded to 1..10; bar height scales freely above.
        el.width = scaleClamped(el.width, s, BARCODE_1D_WIDTH_BOUNDS);
        break;
      case 'QRCODE':
        // The 2D element emits three commands with different dot fields; scale
        // the ones the active symbology actually uses (see QRCodeElement),
        // clamping each to its bound so we never emit out-of-range modules.
        if (el.symbology === 'DATAMATRIX') {
          el.moduleSize = scaleClamped(el.moduleSize, s, BARCODE_2D_SIZE_BOUNDS.DATAMATRIX.moduleSize);
        } else if (el.symbology === 'PDF417' || el.symbology === 'MICROPDF417' || el.symbology === 'CODE49') {
          el.moduleWidth = scaleClamped(el.moduleWidth, s, BARCODE_2D_SIZE_BOUNDS[el.symbology].moduleWidth);
          el.rowHeight = scaleClamped(el.rowHeight, s, BARCODE_2D_SIZE_BOUNDS[el.symbology].rowHeight);
        } else {
          el.magnification = scaleClamped(el.magnification || 1, s, BARCODE_2D_SIZE_BOUNDS.QR.magnification);
        }
        break;
      case 'GRAPHIC':
        if (isEditableGraphic(el)) {
          const newWidth = scaleDim(el.widthDots, s);
          const newHeight = scaleDim(el.heightDots, s);
          editableGraphicsToReencode.push({ element: el, widthDots: newWidth, heightDots: newHeight });
        }
        // Parsed/opaque: position already scaled above; bitmap dims stay put.
        break;
    }
  }

  const labelSettingsPatch = { dpmm: newDpmm };
  if (labelSettings.defaultFontHeight) {
    labelSettingsPatch.defaultFontHeight = scaleDim(labelSettings.defaultFontHeight, s);
  }
  if (labelSettings.defaultFontWidth) {
    labelSettingsPatch.defaultFontWidth = scaleDim(labelSettings.defaultFontWidth, s);
  }
  if (labelSettings.homeX) labelSettingsPatch.homeX = scalePos(labelSettings.homeX, s);
  if (labelSettings.homeY) labelSettingsPatch.homeY = scalePos(labelSettings.homeY, s);
  if (labelSettings.labelTop) labelSettingsPatch.labelTop = scalePos(labelSettings.labelTop, s);

  return { labelSettingsPatch, editableGraphicsToReencode };
}
