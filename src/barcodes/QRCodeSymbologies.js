import { renderFieldDataCommand } from '../utils/zplFieldData.js';
import { placeholderNames } from '../utils/placeholders.js';
import { drawLinear, drawMatrix, drawMaxiCode, drawPlaceholder } from '../rendering/barcodeRender.js';
import { applyReverseOverlay, captureReverseBg } from '../rendering/reverseOverlay.js';
import { maxicodeSize, maxicodePitchDots } from './maxicodeGeometry.js';
import { databarLinearBarDots, DATABAR_SEPARATOR_HEIGHT } from './databarGeometry.js';

export const DATABAR_TYPE_NUM = { omni: 1, truncated: 2, stacked: 3, stackedomni: 4, limited: 5, expanded: 6 };
export const DATABAR_TYPE_BY_NUM = { 1: 'omni', 2: 'truncated', 3: 'stacked', 4: 'stackedomni', 5: 'limited', 6: 'expanded' };

function fieldData(value, element) {
  return renderFieldDataCommand(value, '_', element.fieldHex);
}

function intParam(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function orientationParam(element) {
  return ['N', 'R', 'I', 'B'].includes(element.orientation) ? element.orientation : 'N';
}

function parseOrientation(value) {
  const orientation = (value || 'N').trim().toUpperCase();
  return ['N', 'R', 'I', 'B'].includes(orientation) ? orientation : 'N';
}

function fieldPayload(parser, fdToken, fhToken) {
  return {
    content: parser._decodeFieldDataToken(fdToken, fhToken),
    fieldHex: Boolean(fhToken),
  };
}

class QRSymbology {
  constructor(id) {
    this.id = id;
  }

  render(element, content) {
    return this.renderDefault(element, content);
  }

  renderDefault(element, content) {
    return `^BQN,${element.model},${element.magnification}${fieldData(`${element.errorCorrection}A,${content}`, element)}`;
  }

  supportsOrientation() {
    return false;
  }

  moduleDots(element) {
    return { mx: element.magnification || 5, my: element.magnification || 5 };
  }

  bounds(element, geom, helpers) {
    if (geom.kind === 'matrix') {
      const { mx, my } = this.moduleDots(element);
      return { x: element.x, y: element.y, width: geom.cols * mx, height: geom.rows * my + helpers.yOffset };
    }
    return helpers.placeholderBounds(element);
  }

  renderCanvas(ctx, canvas, element, geom, frame, helpers) {
    if (geom.kind !== 'matrix') return helpers.drawPlaceholder(ctx, element, frame);
    helpers.drawMatrixWithReverse(ctx, canvas, element, geom, frame);
  }

  renderSettings(panel, element, bounds) {
    return `
      ${panel.createInputGroup("Magnification", "prop-magnification", element.magnification, "number", bounds.QR.magnification)}
      ${panel.createSelectGroup("Model", "prop-model", element.model, [
        ["1", "Model 1 (Original)"],
        ["2", "Model 2 (Enhanced)"],
      ])}
      ${panel.createSelectGroup("Error Correction", "prop-error-correction", element.errorCorrection, [
        ["H", "H - Ultra-High (30%)"],
        ["Q", "Q - Quality (25%)"],
        ["M", "M - Medium (15%)"],
        ["L", "L - Low (7%)"],
      ])}
    `;
  }

  attachProperties(_manager, _element, attach) {
    attach("prop-model", "model", (v) => parseInt(v) || 2);
    attach("prop-magnification", "magnification", (v) => parseInt(v) || 5);
    attach("prop-error-correction", "errorCorrection");
  }
}

class DataMatrixSymbology extends QRSymbology {
  supportsOrientation() { return true; }

  render(element, content) {
    return `^BX${orientationParam(element)},${element.moduleSize},${element.quality}${fieldData(content, element)}`;
  }

  moduleDots(element) {
    return { mx: element.moduleSize || 4, my: element.moduleSize || 4 };
  }

  renderSettings(panel, element) {
    return `
      ${panel.createInputGroup("Module Size", "prop-module-size", element.moduleSize, "number", { min: 1, max: 30 })}
      ${panel.createSelectGroup("Quality (ECC)", "prop-quality", element.quality, [
        ["200", "ECC 200 (recommended)"],
        ["140", "ECC 140"],
        ["100", "ECC 100"],
        ["80", "ECC 080"],
        ["50", "ECC 050"],
        ["0", "ECC 000"],
      ])}
    `;
  }

  attachProperties(_manager, _element, attach) {
    attach("prop-module-size", "moduleSize", (v) => parseInt(v) || 4);
    attach("prop-quality", "quality", (v) => parseInt(v) || 200);
  }
}

class StackedRowsSymbology extends QRSymbology {
  supportsOrientation() { return true; }

  moduleDots(element) {
    return { mx: element.moduleWidth || 2, my: element.rowHeight || 4 };
  }

  commonSettings(panel, element, bounds, extra = '') {
    return `
      ${panel.createInputGroup("Module Width", "prop-module-width", element.moduleWidth, "number", bounds.moduleWidth)}
      ${panel.createInputGroup("Row Height", "prop-row-height", element.rowHeight, "number", bounds.rowHeight)}
      ${extra}
    `;
  }

  attachCommon(_manager, _element, attach) {
    attach("prop-module-width", "moduleWidth", (v) => parseInt(v) || 2);
    attach("prop-row-height", "rowHeight", (v) => parseInt(v) || 4);
  }
}

class PDF417Symbology extends StackedRowsSymbology {
  render(element, content) {
    const cols = element.columns > 0 ? `,${element.columns}` : '';
    return `^BY${element.moduleWidth}^B7${orientationParam(element)},${element.rowHeight},${element.securityLevel}${cols}${fieldData(content, element)}`;
  }

  renderSettings(panel, element, bounds) {
    return this.commonSettings(panel, element, bounds.PDF417, `
      ${panel.createInputGroup("Security Level", "prop-security-level", element.securityLevel, "number", { min: 0, max: 8 })}
      ${panel.createInputGroup("Columns (0 = auto)", "prop-columns", element.columns, "number", { min: 0, max: 30 })}
    `);
  }

  attachProperties(manager, element, attach) {
    this.attachCommon(manager, element, attach);
    attach("prop-security-level", "securityLevel", (v) => Math.max(0, Math.min(8, parseInt(v) || 0)));
    attach("prop-columns", "columns", (v) => Math.max(0, parseInt(v) || 0));
  }
}

class MicroPDF417Symbology extends StackedRowsSymbology {
  render(element, content) {
    const mode = Math.max(0, Math.min(33, element.microPdfMode || 0));
    return `^BY${element.moduleWidth}^BF${orientationParam(element)},${element.rowHeight},${mode}${fieldData(content, element)}`;
  }

  renderSettings(panel, element, bounds) {
    return this.commonSettings(panel, element, bounds.MICROPDF417, panel.createInputGroup("Mode (0-33)", "prop-micropdf-mode", element.microPdfMode || 0, "number", { min: 0, max: 33 }));
  }

  attachProperties(manager, element, attach) {
    this.attachCommon(manager, element, attach);
    attach("prop-micropdf-mode", "microPdfMode", (v) => Math.max(0, Math.min(33, parseInt(v) || 0)));
  }
}

class Code49Symbology extends StackedRowsSymbology {
  render(element, content) {
    const mode = ['0', '1', '2', '3', '4', '5', 'A'].includes(element.code49Mode) ? element.code49Mode : 'A';
    return `^BY${element.moduleWidth}^B4${orientationParam(element)},${element.rowHeight},N,${mode}${fieldData(content, element)}`;
  }

  renderSettings(panel, element, bounds) {
    return this.commonSettings(panel, element, bounds.CODE49, panel.createSelectGroup("Starting Mode", "prop-code49-mode", element.code49Mode || "A", [
      ["A", "Automatic"],
      ["0", "0 - Regular Alphanumeric"],
      ["1", "1 - Multiple Read Alphanumeric"],
      ["2", "2 - Regular Numeric"],
      ["3", "3 - Group Alphanumeric"],
      ["4", "4 - Regular Alphanumeric Shift 1"],
      ["5", "5 - Regular Alphanumeric Shift 2"],
    ]));
  }

  attachProperties(manager, element, attach) {
    this.attachCommon(manager, element, attach);
    attach("prop-code49-mode", "code49Mode");
  }
}

class CodablockSymbology extends StackedRowsSymbology {
  render(element, content) {
    const mode = ['A', 'E', 'F'].includes(element.codablockMode) ? element.codablockMode : 'F';
    return `^BY${element.moduleWidth}^BB${orientationParam(element)},${element.rowHeight},N,,,${mode}${fieldData(content, element)}`;
  }

  parse(parser, group, token, fdToken, hasReverse, fhToken) {
    const parts = token.params.split(',');
    const byToken = group.commands.find((cmd) => cmd.command === 'BY');
    const byParts = byToken ? byToken.params.split(',') : [];
    const rawMode = (parts[5] || 'F').trim().toUpperCase();
    return {
      type: 'QRCODE',
      symbology: 'CODABLOCK',
      x: group.x,
      y: group.y,
      ...fieldPayload(parser, fdToken, fhToken),
      orientation: parseOrientation(parts[0]),
      moduleWidth: intParam(byParts[0], 2),
      rowHeight: intParam(parts[1], 4),
      codablockMode: ['A', 'E', 'F'].includes(rawMode) ? rawMode : 'F',
      reverse: hasReverse,
    };
  }

  renderSettings(panel, element, bounds) {
    return this.commonSettings(panel, element, bounds.CODABLOCK, panel.createSelectGroup("Mode", "prop-codablock-mode", element.codablockMode || "F", [
      ["F", "F - Code 128 (default)"],
      ["E", "E - Code 128 + FNC1 (GS1)"],
      ["A", "A - Code 39"],
    ]));
  }

  attachProperties(manager, element, attach) {
    this.attachCommon(manager, element, attach);
    attach("prop-codablock-mode", "codablockMode");
  }
}

class AztecSymbology extends QRSymbology {
  supportsOrientation() { return true; }

  render(element, content) {
    // A rune is a single 0–255 byte, so only normalize once the placeholders are
    // gone — an unresolved placeholder would be mangled into a number.
    const isPlaceholder = placeholderNames(content).length > 0;
    const data = element.aztecSizeMode === 'rune' && !isPlaceholder && typeof element.normalizeAztecRune === 'function'
      ? element.normalizeAztecRune(content)
      : content;
    const d = typeof element.aztecD === 'function' ? element.aztecD() : 0;
    const dParam = d > 0 ? `,${d}` : '';
    return `^B0${orientationParam(element)},${element.magnification},N${dParam}${fieldData(data, element)}`;
  }

  renderSettings(panel, element, bounds) {
    return `
      ${panel.createInputGroup("Magnification", "prop-magnification", element.magnification, "number", bounds.AZTEC.magnification)}
      ${panel.createSelectGroup("Symbol Type", "prop-aztec-size-mode", element.aztecSizeMode || "auto", [
        ["auto", "Auto (error %)"],
        ["full", "Full-range (layers)"],
        ["compact", "Compact (layers)"],
        ["rune", "Rune"],
      ])}
      ${panel.createInputGroup("Error Control % (0 = default)", "prop-aztec-error-control", element.aztecErrorControl, "number", { min: 0, max: 99 })}
      ${panel.createInputGroup("Layers (0 = auto)", "prop-aztec-layers", element.aztecLayers, "number", { min: 0, max: 32 })}
    `;
  }

  attachProperties(_manager, _element, attach) {
    attach("prop-magnification", "magnification", (v) => parseInt(v) || 5);
    attach("prop-aztec-size-mode", "aztecSizeMode");
    attach("prop-aztec-error-control", "aztecErrorControl", (v) => Math.max(0, Math.min(99, parseInt(v) || 0)));
    attach("prop-aztec-layers", "aztecLayers", (v) => Math.max(0, Math.min(32, parseInt(v) || 0)));
  }
}

class MaxiCodeSymbology extends QRSymbology {
  render(element, content) {
    const mode = ['2', '3', '4', '5', '6'].includes(String(element.maxicodeMode)) ? String(element.maxicodeMode) : '4';
    return `^BD${mode},1,1${fieldData(content, element)}`;
  }

  parse(parser, group, token, fdToken, hasReverse, fhToken) {
    const rawMode = ((token.params.split(',')[0]) || '4').trim();
    return {
      type: 'QRCODE',
      symbology: 'MAXICODE',
      x: group.x,
      y: group.y,
      ...fieldPayload(parser, fdToken, fhToken),
      maxicodeMode: ['2', '3', '4', '5', '6'].includes(rawMode) ? rawMode : '4',
      reverse: hasReverse,
    };
  }

  // MaxiCode is fixed-size — its module pitch comes from the label density, not
  // magnification, so it matches the Labelary preview (which ignores ^BD sizing).
  moduleDots(element, dpmm) {
    const pitch = maxicodePitchDots(dpmm);
    return { mx: pitch, my: pitch };
  }

  bounds(element, geom, helpers) {
    if (geom.kind !== 'maxicode') return helpers.placeholderBounds(element);
    const { mx } = this.moduleDots(element, helpers.dpmm);
    const { width, height } = maxicodeSize(mx);
    return { x: element.x, y: element.y, width, height: height + helpers.yOffset };
  }

  renderCanvas(ctx, canvas, element, geom, frame, helpers) {
    if (geom.kind !== 'maxicode') return helpers.drawPlaceholder(ctx, element, frame);
    const { width, height } = maxicodeSize(frame.moduleW);
    const drawShape = (targetCtx, color, ox = 0, oy = 0) => {
      helpers.withOrientation(targetCtx, frame, width, height, ox, oy, () => {
        drawMaxiCode(targetCtx, geom, { x: 0, y: 0, moduleW: frame.moduleW, color });
      });
    };
    const captured = element.reverse ? captureReverseBg(ctx, canvas, helpers.screenBbox(frame, width, height)) : null;
    drawShape(ctx, '#000000');
    if (captured) applyReverseOverlay(ctx, captured, drawShape);
  }

  renderSettings(panel, element) {
    // No size control: ^BD has no magnification parameter, so the printed symbol
    // is always a fixed 25 mm square — only the mode is configurable.
    return `
      ${panel.createSelectGroup("Mode", "prop-maxicode-mode", element.maxicodeMode || "4", [
        ["4", "4 - Standard"],
        ["2", "2 - Postal (US)"],
        ["3", "3 - Postal (non-US)"],
        ["5", "5 - Full EEC"],
        ["6", "6 - Reader programming"],
      ])}
    `;
  }

  attachProperties(_manager, _element, attach) {
    attach("prop-maxicode-mode", "maxicodeMode");
  }
}

class GS1DataBarSymbology extends QRSymbology {
  supportsOrientation() { return true; }

  render(element, content) {
    const t = DATABAR_TYPE_NUM[element.databarType] || 1;
    return `^BR${orientationParam(element)},${t},${element.magnification || 5},${DATABAR_SEPARATOR_HEIGHT},${element.rowHeight || 40}${fieldData(content, element)}`;
  }

  parse(parser, group, token, fdToken, hasReverse, fhToken) {
    const parts = token.params.split(',');
    return {
      type: 'QRCODE',
      symbology: 'GS1DATABAR',
      x: group.x,
      y: group.y,
      ...fieldPayload(parser, fdToken, fhToken),
      orientation: parseOrientation(parts[0]),
      databarType: DATABAR_TYPE_BY_NUM[parseInt(parts[1], 10)] || 'omni',
      magnification: intParam(parts[2], 5),
      rowHeight: intParam(parts[4], 40),
      reverse: hasReverse,
    };
  }

  bounds(element, geom, helpers) {
    if (geom.kind === 'linear') {
      const { mx } = this.moduleDots(element);
      return { x: element.x, y: element.y, width: geom.modules * mx, height: databarLinearBarDots(element) + helpers.yOffset };
    }
    return super.bounds(element, geom, helpers);
  }

  renderCanvas(ctx, canvas, element, geom, frame, helpers) {
    if (geom.kind !== 'linear') return super.renderCanvas(ctx, canvas, element, geom, frame, helpers);
    const barHeight = databarLinearBarDots(element) * frame.scale;
    const width = geom.modules * frame.moduleW;
    const drawShape = (targetCtx, color, ox = 0, oy = 0) => {
      helpers.withOrientation(targetCtx, frame, width, barHeight, ox, oy, () => {
        drawLinear(targetCtx, geom, { x: 0, y: 0, moduleW: frame.moduleW, height: barHeight, color });
      });
    };
    const captured = element.reverse ? captureReverseBg(ctx, canvas, helpers.screenBbox(frame, width, barHeight)) : null;
    drawShape(ctx, '#000000');
    if (captured) applyReverseOverlay(ctx, captured, drawShape);
  }

  renderSettings(panel, element, bounds) {
    return `
      ${panel.createSelectGroup("Variant", "prop-databar-type", element.databarType || "omni", [
        ["omni", "Omnidirectional"],
        ["truncated", "Truncated"],
        ["stacked", "Stacked"],
        ["stackedomni", "Stacked Omnidirectional"],
        ["limited", "Limited"],
        ["expanded", "Expanded"],
      ])}
      ${panel.createInputGroup("Magnification", "prop-magnification", element.magnification, "number", bounds.GS1DATABAR.magnification)}
      ${panel.createInputGroup("Bar Height", "prop-row-height", element.rowHeight, "number", bounds.GS1DATABAR.rowHeight)}
    `;
  }

  attachProperties(_manager, _element, attach) {
    attach("prop-databar-type", "databarType");
    attach("prop-magnification", "magnification", (v) => parseInt(v) || 5);
    attach("prop-row-height", "rowHeight", (v) => parseInt(v) || 40);
  }
}

class TLC39Symbology extends QRSymbology {
  supportsOrientation() { return true; }

  render(element, content) {
    const w1 = element.tlc39Code39Width || element.moduleWidth || 2;
    const r1 = element.tlc39Ratio || 3;
    const h1 = element.tlc39Code39Height || element.rowHeight || 40;
    const w2 = element.tlc39MicroPdfWidth || w1;
    const h2 = element.tlc39MicroPdfRowHeight || w2;
    return `^BT${orientationParam(element)},${w1},${r1},${h1},${w2},${h2}${fieldData(content, element)}`;
  }

  parse(parser, group, token, fdToken, hasReverse, fhToken) {
    const parts = token.params.split(',');
    const w1 = intParam(parts[1], 2);
    const r1 = intParam(parts[2], 3);
    const h1 = intParam(parts[3], 40);
    const w2 = intParam(parts[4], w1);
    const h2 = intParam(parts[5], w2);
    return {
      type: 'QRCODE',
      symbology: 'TLC39',
      x: group.x,
      y: group.y,
      ...fieldPayload(parser, fdToken, fhToken),
      orientation: parseOrientation(parts[0]),
      moduleWidth: w1,
      rowHeight: h1,
      tlc39Code39Width: w1,
      tlc39Ratio: r1,
      tlc39Code39Height: h1,
      tlc39MicroPdfWidth: w2,
      tlc39MicroPdfRowHeight: h2,
      reverse: hasReverse,
    };
  }

  moduleDots(element) {
    const w1 = element.tlc39Code39Width || element.moduleWidth || 2;
    return { mx: w1, my: w1 };
  }

  bounds(element, geom, helpers) {
    if (geom.kind !== 'tlc39') return helpers.placeholderBounds(element);
    const c39w = geom.code39.kind === 'linear' ? geom.code39.modules * geom.w1 : 0;
    const mpw = geom.micropdf ? geom.micropdf.cols * geom.w2 : 0;
    const mph = geom.micropdf ? geom.micropdf.rows * geom.h2 : 0;
    const gap = geom.micropdf ? 2 * geom.w1 : 0;
    return { x: element.x, y: element.y, width: Math.max(c39w, mpw) || 21 * geom.w1, height: geom.h1 + gap + mph + helpers.yOffset };
  }

  renderCanvas(ctx, canvas, element, geom, frame, helpers) {
    if (geom.kind !== 'tlc39') return helpers.drawPlaceholder(ctx, element, frame);
    const c39Height = geom.h1 * frame.scale;
    const gap = 2 * geom.w1 * frame.scale;
    const w1 = geom.w1 * frame.scale;
    const w2 = geom.w2 * frame.scale;
    const h2 = geom.h2 * frame.scale;
    const c39W = geom.code39.kind === 'linear' ? geom.code39.modules * w1 : 0;
    const mpW = geom.micropdf ? geom.micropdf.cols * w2 : 0;
    const mpH = geom.micropdf ? geom.micropdf.rows * h2 : 0;
    const width = Math.max(c39W, mpW);
    const height = (geom.code39.kind === 'linear' ? c39Height + (geom.micropdf ? gap : 0) : 0) + mpH;
    // TLC39 spec layout: the MicroPDF417 is stacked ON TOP of the Code 39, sharing
    // its left edge with a small separator gap between them.
    const drawShape = (targetCtx, color, ox = 0, oy = 0) => {
      helpers.withOrientation(targetCtx, frame, width, height, ox, oy, () => {
        let cy = 0;
        if (geom.micropdf) {
          drawMatrix(targetCtx, geom.micropdf, { x: 0, y: cy, moduleW: w2, moduleH: h2, color });
          if (geom.code39.kind === 'linear') cy += mpH + gap;
        }
        if (geom.code39.kind === 'linear') {
          drawLinear(targetCtx, geom.code39, { x: 0, y: cy, moduleW: w1, height: c39Height, color });
        }
      });
    };
    const captured = element.reverse ? captureReverseBg(ctx, canvas, helpers.screenBbox(frame, width, height)) : null;
    drawShape(ctx, '#000000');
    if (captured) applyReverseOverlay(ctx, captured, drawShape);
  }

  renderSettings(panel, element, bounds) {
    const limits = bounds.TLC39;
    return `
      ${panel.createInputGroup("Code 39 Width", "prop-tlc39-code39-width", element.tlc39Code39Width || element.moduleWidth || 2, "number", limits.moduleWidth)}
      ${panel.createInputGroup("Code 39 Ratio", "prop-tlc39-ratio", element.tlc39Ratio || 3, "number", { min: 2, max: 3 })}
      ${panel.createInputGroup("Code 39 Height", "prop-tlc39-code39-height", element.tlc39Code39Height || element.rowHeight || 40, "number", limits.rowHeight)}
      ${panel.createInputGroup("MicroPDF Width", "prop-tlc39-micropdf-width", element.tlc39MicroPdfWidth || element.tlc39Code39Width || element.moduleWidth || 2, "number", limits.moduleWidth)}
      ${panel.createInputGroup("MicroPDF Row Height", "prop-tlc39-micropdf-row-height", element.tlc39MicroPdfRowHeight || element.tlc39MicroPdfWidth || element.moduleWidth || 2, "number", limits.moduleWidth)}
    `;
  }

  attachProperties(_manager, element, attach) {
    attach("prop-tlc39-code39-width", "tlc39Code39Width", (v) => {
      const n = parseInt(v) || 2;
      element.moduleWidth = n;
      return n;
    });
    attach("prop-tlc39-ratio", "tlc39Ratio", (v) => Math.min(3, Math.max(2, parseInt(v) || 3)));
    attach("prop-tlc39-code39-height", "tlc39Code39Height", (v) => {
      const n = parseInt(v) || 40;
      element.rowHeight = n;
      return n;
    });
    attach("prop-tlc39-micropdf-width", "tlc39MicroPdfWidth", (v) => parseInt(v) || 2);
    attach("prop-tlc39-micropdf-row-height", "tlc39MicroPdfRowHeight", (v) => parseInt(v) || 2);
  }
}

const registry = new Map([
  ['QR', new QRSymbology('QR')],
  ['DATAMATRIX', new DataMatrixSymbology('DATAMATRIX')],
  ['PDF417', new PDF417Symbology('PDF417')],
  ['MICROPDF417', new MicroPDF417Symbology('MICROPDF417')],
  ['CODE49', new Code49Symbology('CODE49')],
  ['CODABLOCK', new CodablockSymbology('CODABLOCK')],
  ['AZTEC', new AztecSymbology('AZTEC')],
  ['MAXICODE', new MaxiCodeSymbology('MAXICODE')],
  ['GS1DATABAR', new GS1DataBarSymbology('GS1DATABAR')],
  ['TLC39', new TLC39Symbology('TLC39')],
]);

export function getQRCodeSymbology(id) {
  return registry.get(id || 'QR') || registry.get('QR');
}

export function getParserSymbology(command, subCommand = '') {
  if (command === 'BB') return registry.get('CODABLOCK');
  if (command === 'BD') return registry.get('MAXICODE');
  if (command === 'BR') return registry.get('GS1DATABAR');
  if (command === 'BT') return registry.get('TLC39');
  if (command === 'B' && subCommand === '4') return registry.get('CODE49');
  return null;
}

export function createCanvasHelpers({ matrixModuleDots, resolveSymbology, labels, dpmm }) {
  function orientation(element) {
    const symbology = getQRCodeSymbology(resolveSymbology(element));
    return symbology.supportsOrientation() ? orientationParam(element) : 'N';
  }

  function mapLocal(frame, w, h, lx, ly) {
    switch (orientation(frame.element)) {
      case 'R': return [frame.x + h - ly, frame.y + lx];
      case 'I': return [frame.x + w - lx, frame.y + h - ly];
      case 'B': return [frame.x + ly, frame.y + w - lx];
      default: return [frame.x + lx, frame.y + ly];
    }
  }

  return {
    frame(element, transform) {
      const { scale, homeX, homeY, labelTop } = transform;
      const symbology = resolveSymbology(element);
      const yOffset = symbology === 'QR' ? 10 * scale : 0;
      // MaxiCode is fixed-size (density-derived pitch); every other 2D symbology
      // sizes from its own dot fields via matrixModuleDots.
      const { mx, my } = symbology === 'MAXICODE'
        ? (() => { const p = maxicodePitchDots(dpmm); return { mx: p, my: p }; })()
        : matrixModuleDots(element);
      return {
        scale,
        dpmm,
        x: (element.x + homeX) * scale,
        y: (element.y + homeY + labelTop) * scale + yOffset,
        moduleW: mx * scale,
        moduleH: my * scale,
        element,
      };
    },
    drawPlaceholder(ctx, element, frame) {
      const symbology = resolveSymbology(element);
      const size = 21 * (element.magnification || 5) * frame.scale;
      drawPlaceholder(ctx, { x: frame.x, y: frame.y, width: size, height: size, label: labels[symbology] });
    },
    drawMatrixWithReverse(ctx, canvas, element, geom, frame) {
      const width = geom.cols * frame.moduleW;
      const height = geom.rows * frame.moduleH;
      const drawShape = (targetCtx, color, ox = 0, oy = 0) => {
        this.withOrientation(targetCtx, frame, width, height, ox, oy, () => {
          drawMatrix(targetCtx, geom, { x: 0, y: 0, moduleW: frame.moduleW, moduleH: frame.moduleH, color });
        });
      };
      const captured = element.reverse ? captureReverseBg(ctx, canvas, this.screenBbox(frame, width, height)) : null;
      drawShape(ctx, '#000000');
      if (captured) applyReverseOverlay(ctx, captured, drawShape);
    },
    withOrientation(ctx, frame, width, height, ox, oy, drawFn) {
      const orient = orientation(frame.element);
      ctx.save();
      if (orient === 'R') {
        ctx.translate(frame.x + ox + height, frame.y + oy);
        ctx.rotate(Math.PI / 2);
      } else if (orient === 'I') {
        ctx.translate(frame.x + ox + width, frame.y + oy + height);
        ctx.rotate(Math.PI);
      } else if (orient === 'B') {
        ctx.translate(frame.x + ox, frame.y + oy + width);
        ctx.rotate(-Math.PI / 2);
      } else {
        ctx.translate(frame.x + ox, frame.y + oy);
      }
      drawFn();
      ctx.restore();
    },
    screenBbox(frame, width, height) {
      const corners = [
        mapLocal(frame, width, height, 0, 0),
        mapLocal(frame, width, height, width, 0),
        mapLocal(frame, width, height, width, height),
        mapLocal(frame, width, height, 0, height),
      ];
      const xs = corners.map((c) => c[0]);
      const ys = corners.map((c) => c[1]);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
    },
  };
}
