import { ZPLElement } from './ZPLElement.js';
import { fieldOriginCommand } from '../utils/fieldAnchor.js';
import { getBarcodeGeometry, normalizeAztecRune } from '../utils/barcodeGeometry.js';
import {
    getQRCodeSymbology,
    qrOriginYBias,
} from '../barcodes/QRCodeSymbologies.js';
import { substitutePlaceholders } from '../utils/placeholders.js';

// 2D Barcode element. The `symbology` selects the ZPL command:
//   QR -> ^BQ,  DATAMATRIX -> ^BX,  PDF417 -> ^B7,  MICROPDF417 -> ^BF,  AZTEC -> ^B0,
//   CODE49 -> ^B4 (stacked),  CODABLOCK -> ^BB (stacked),  MAXICODE -> ^BD (hexagonal),
//   GS1DATABAR -> ^BR (GS1 DataBar family: linear + stacked),
//   TLC39 -> ^BT (composite: Code 39 + MicroPDF417)
// Under ^FO, QR ink starts below the origin by the active ^BY height. ^FT keeps
// its separately calibrated 10-dot offset; other 2D symbologies have no offset.
export class QRCodeElement extends ZPLElement {
    constructor(x = 0, y = 0, content = '', model = 2, magnification = 5, errorCorrection = 'Q', reverse = false, symbology = 'QR', moduleSize = 4, quality = 200, moduleWidth = 2, rowHeight = 4, securityLevel = 5, columns = 0, aztecSizeMode = 'auto', aztecErrorControl = 0, aztecLayers = 0, fieldHex = false, microPdfMode = 0, code49Mode = 'A', codablockMode = 'F', maxicodeMode = '4', databarType = 'omni', orientation = 'N') {
        const opts = (x && typeof x === 'object')
            ? x
            : { x, y, content, model, magnification, errorCorrection, reverse, symbology, moduleSize, quality, moduleWidth, rowHeight, securityLevel, columns, aztecSizeMode, aztecErrorControl, aztecLayers, fieldHex, microPdfMode, code49Mode, codablockMode, maxicodeMode, databarType, orientation };
        super(opts.x ?? 0, opts.y ?? 0);
        this.type = 'QRCODE';
        this.symbology = opts.symbology || 'QR';
        this.content = opts.content ?? ''; // Template string: literal text mixed with %placeholder%s
        // QR (^BQ)
        this.model = opts.model || 2;              // 1 = original, 2 = enhanced (recommended)
        this.magnification = opts.magnification || 5; // 1-10 (scaling factor; printer clamps larger imports)
        this.errorCorrection = opts.errorCorrection || 'Q'; // H, Q, M, L (high to low)
        this.inputMode = opts.inputMode === 'M' ? 'M' : 'A'; // A = automatic, M = manual
        this.qrManualMode = /^[ANBK]$/.test(opts.qrManualMode) ? opts.qrManualMode : 'A';
        const byHeight = Number(opts.byHeight);
        if (Number.isFinite(byHeight) && byHeight >= 1) {
            this.byHeight = Math.round(byHeight);
        }
        // Data Matrix (^BX)
        this.moduleSize = opts.moduleSize || 4;    // individual module size in dots
        this.quality = opts.quality ?? 200;          // ECC level (200 = ECC 200, recommended; 0 = ECC 000 is valid)
        // ^BX c/r: a forced symbol size in modules (0 = auto). PDF417's columns/rows
        // below are a different symbology's fields — keep these separate so switching
        // symbology can't leak one into the other.
        this.dmColumns = opts.dmColumns || 0;
        this.dmRows = opts.dmRows || 0;
        // ^BX f/g/a: no effect on the drawn symbol, carried for ZPL round-trip.
        this.dmFormat = opts.dmFormat || 0;        // 1-6, ignored at ECC 200
        this.dmEscape = opts.dmEscape || '';       // escape char, printer default '~'
        this.dmAspect = opts.dmAspect || 0;        // 1 = square, 2 = rectangular
        // PDF417 (^B7)
        this.moduleWidth = opts.moduleWidth || 2;  // X module width in dots (^BY)
        this.rowHeight = opts.rowHeight || 4;      // row height in dots
        this.securityLevel = opts.securityLevel ?? 5; // 0-8 (0 = error-detection only is valid)
        this.columns = opts.columns || 0;          // 0 = auto
        this.rows = opts.rows || 0;                // 0 = as many as the data needs
        this.truncate = opts.truncate || false;    // ^B7 t: drop the right row indicator
        // Micro-PDF417 (^BF). Mode 0-33 selects a fixed rows×columns variant; reuses
        // moduleWidth (^BY) and rowHeight above for sizing.
        this.microPdfMode = opts.microPdfMode || 0;
        // Code 49 (^B4). Stacked alphanumeric symbology; reuses moduleWidth (^BY) and
        // rowHeight above for sizing. m = starting mode (0–5 / A=auto). Labelary does
        // not render Code 49 and shows the raw field data as text, which the canvas
        // mirrors while the bwip-js geometry remains available for element sizing.
        this.code49Mode = opts.code49Mode || 'A'; // '0'–'5' or 'A' (automatic, default)
        // Codablock (^BB). Stacked Code 128 symbology; reuses moduleWidth (^BY) and
        // rowHeight above for sizing. m = mode (A=Code 39, E=Code 128+FNC1, F=Code 128).
        // bwip-js only encodes Codablock F, so the on-canvas symbol always uses the F
        // encoding; m affects only the emitted ZPL / real-printer output.
        this.codablockMode = opts.codablockMode || 'F'; // 'A' | 'E' | 'F' (default)
        // MaxiCode (^BD). Fixed-size hexagonal symbol; magnification above sets the canvas
        // hex pitch. m = mode: 2/3 = postal (need a structured carrier message), 4 =
        // standard (default, arbitrary data), 5 = full EEC, 6 = reader programming.
        this.maxicodeMode = opts.maxicodeMode || '4'; // '2'–'6' (default '4')
        // GS1 DataBar (^BR). databarType selects the variant; magnification = module
        // width (^BR m) and rowHeight = bar height (^BR h). Linear variants (omni,
        // truncated, limited, expanded) render as bars; stacked / stacked-omni as a matrix.
        this.databarType = opts.databarType || 'omni'; // 'omni'|'truncated'|'stacked'|'stackedomni'|'limited'|'expanded'
        // TLC39 (^BT). Keep moduleWidth/rowHeight as compatibility aliases for w1/h1.
        this.tlc39Code39Width = opts.tlc39Code39Width;
        this.tlc39Ratio = opts.tlc39Ratio;
        this.tlc39Code39Height = opts.tlc39Code39Height;
        this.tlc39MicroPdfWidth = opts.tlc39MicroPdfWidth;
        this.tlc39MicroPdfRowHeight = opts.tlc39MicroPdfRowHeight;
        // Aztec (^B0). The 'd' param (error control / symbol size/type) is modelled
        // by three fields: sizeMode 'auto' uses aztecErrorControl (% min, 0 = printer
        // default); 'compact'/'full' use aztecLayers (0 = auto); 'rune' = ^B0 d=300.
        this.aztecSizeMode = opts.aztecSizeMode || 'auto';       // 'auto' | 'compact' | 'full' | 'rune'
        this.aztecErrorControl = opts.aztecErrorControl || 0; // 0 (default) or 1-99 (% minimum)
        this.aztecLayers = opts.aztecLayers || 0;           // 0 = auto, 1-4 compact / 1-32 full
        this.reverse = opts.reverse || false; // ^FR (reverse print)
        this.orientation = ['N', 'R', 'I', 'B'].includes(opts.orientation) ? opts.orientation : 'N';
        this.fieldHex = opts.fieldHex || false; // ^FH (force field hex indicator)
        this.normalizeAztecRune = normalizeAztecRune;
        this.aztecD = () => this._aztecD();
    }

    // Map the Aztec size fields to the ^B0 'd' parameter (error control + symbol
    // size/type). Inverse lives in ZPLParser._parseAztec.
    _aztecD() {
        switch (this.aztecSizeMode) {
            case 'rune': return 300;
            case 'compact': return 100 + Math.max(1, Math.min(4, this.aztecLayers || 1));
            case 'full': return 200 + Math.max(1, Math.min(32, this.aztecLayers || 1));
            case 'auto':
            default: return Math.max(0, Math.min(99, this.aztecErrorControl || 0));
        }
    }

    _render(content, previewData) {
        const reverseCmd = this.reverse ? '^FR' : '';
        // The anchor needs the encoded module count, measured from the same
        // data the symbol will carry.
        const pos = fieldOriginCommand(this, undefined, { previewData });
        const by = (this.symbology === 'QR' || !this.symbology) && pos.startsWith('^FO')
            ? `^BY,,${qrOriginYBias(this)}`
            : '';
        return `${pos}${by}${reverseCmd}${getQRCodeSymbology(this.symbology).render(this, content)}^FS`;
    }

    render() {
        return this._render(this.content);
    }

    renderPreview(defaultFontId, defaultFontHeight, defaultFontWidth, previewData = {}) {
        // Placeholders resolve to their Preview Data values for the Labelary preview
        return this._render(substitutePlaceholders(this.content, previewData), previewData);
    }

    // dpmm sizes the fixed MaxiCode symbol (defaults to the factory 8 dpmm when a
    // caller has no label settings); all other symbologies ignore it.
    getBounds(dpmm = 8, previewData = {}) {
        const yOffset = this.symbology === 'QR' || !this.symbology
            ? qrOriginYBias(this)
            : 0;
        const geom = getBarcodeGeometry(this, previewData);
        const symbology = getQRCodeSymbology(this.symbology);
        const bounds = symbology.bounds(this, geom, {
            yOffset,
            dpmm,
            placeholderBounds: (element) => {
                const size = 21 * (element.magnification || 5);
                return { x: element.x, y: element.y + yOffset, width: size, height: size };
            }
        });
        if (symbology.supportsOrientation() && (this.orientation === 'R' || this.orientation === 'B')) {
            return { x: bounds.x, y: bounds.y, width: bounds.height, height: bounds.width };
        }
        return bounds;
    }

    canMatchLabelSize() { return false; }
}
