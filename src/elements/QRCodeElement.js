import { ZPLElement } from './ZPLElement.js';
import { getBarcodeGeometry, normalizeAztecRune } from '../utils/barcodeGeometry.js';
import { getQRCodeSymbology } from '../barcodes/QRCodeSymbologies.js';
import { placeholderToken } from '../utils/placeholders.js';

// 2D Barcode element. The `symbology` selects the ZPL command:
//   QR -> ^BQ,  DATAMATRIX -> ^BX,  PDF417 -> ^B7,  MICROPDF417 -> ^BF,  AZTEC -> ^B0,
//   CODE49 -> ^B4 (stacked),  CODABLOCK -> ^BB (stacked),  MAXICODE -> ^BD (hexagonal),
//   GS1DATABAR -> ^BR (GS1 DataBar family: linear + stacked),
//   TLC39 -> ^BT (composite: Code 39 + MicroPDF417)
// QR codes carry a 10-dot quiet-zone Y offset (Labelary renders ^BQ this way);
// Aztec has no quiet zone, so it keeps the default 0 offset.
export class QRCodeElement extends ZPLElement {
    constructor(x = 0, y = 0, previewData = '', model = 2, magnification = 5, errorCorrection = 'Q', placeholder = '', reverse = false, symbology = 'QR', moduleSize = 4, quality = 200, moduleWidth = 2, rowHeight = 4, securityLevel = 5, columns = 0, aztecSizeMode = 'auto', aztecErrorControl = 0, aztecLayers = 0, fieldHex = false, microPdfMode = 0, code49Mode = 'A', codablockMode = 'F', maxicodeMode = '4', databarType = 'omni') {
        const opts = (x && typeof x === 'object')
            ? x
            : { x, y, previewData, model, magnification, errorCorrection, placeholder, reverse, symbology, moduleSize, quality, moduleWidth, rowHeight, securityLevel, columns, aztecSizeMode, aztecErrorControl, aztecLayers, fieldHex, microPdfMode, code49Mode, codablockMode, maxicodeMode, databarType };
        super(opts.x ?? 0, opts.y ?? 0);
        this.type = 'QRCODE';
        this.symbology = opts.symbology || 'QR';
        this.previewData = opts.previewData ?? opts.data ?? '';
        this.placeholder = opts.placeholder || '';
        // QR (^BQ)
        this.model = opts.model || 2;              // 1 = original, 2 = enhanced (recommended)
        this.magnification = opts.magnification || 5; // 1-10 (scaling factor)
        this.errorCorrection = opts.errorCorrection || 'Q'; // H, Q, M, L (high to low)
        // Data Matrix (^BX)
        this.moduleSize = opts.moduleSize || 4;    // individual module size in dots
        this.quality = opts.quality ?? 200;          // ECC level (200 = ECC 200, recommended; 0 = ECC 000 is valid)
        // PDF417 (^B7)
        this.moduleWidth = opts.moduleWidth || 2;  // X module width in dots (^BY)
        this.rowHeight = opts.rowHeight || 4;      // row height in dots
        this.securityLevel = opts.securityLevel ?? 5; // 0-8 (0 = error-detection only is valid)
        this.columns = opts.columns || 0;          // 0 = auto
        // Micro-PDF417 (^BF). Mode 0-33 selects a fixed rows×columns variant; reuses
        // moduleWidth (^BY) and rowHeight above for sizing.
        this.microPdfMode = opts.microPdfMode || 0;
        // Code 49 (^B4). Stacked alphanumeric symbology; reuses moduleWidth (^BY) and
        // rowHeight above for sizing. m = starting mode (0–5 / A=auto). NOTE: Labelary
        // does not render Code 49 (it shows the raw data as text), so the on-canvas
        // bwip-js encoding is the design reference for this symbology, not the preview pane.
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

    _render(content, preservePlaceholders = false) {
        const reverseCmd = this.reverse ? '^FR' : '';
        const pos = `^FO${this.x},${this.y}${reverseCmd}`;
        return `${pos}${getQRCodeSymbology(this.symbology).render(this, content, preservePlaceholders)}^FS`;
    }

    render() {
        return this._render(this.placeholder ? placeholderToken(this.placeholder) : this.previewData, Boolean(this.placeholder));
    }

    renderPreview() {
        // Uses preview data for Labelary API visualization
        return this._render(this.previewData, false);
    }

    getDisplayName() {
        const displayText = this.placeholder || this.previewData;
        return `"${displayText.substring(0, 20)}${displayText.length > 20 ? '...' : ''}"`;
    }

    // dpmm sizes the fixed MaxiCode symbol (defaults to the factory 8 dpmm when a
    // caller has no label settings); all other symbologies ignore it.
    getBounds(dpmm = 8) {
        const yOffset = this.symbology === 'QR' || !this.symbology ? 10 : 0;
        const geom = getBarcodeGeometry(this);
        return getQRCodeSymbology(this.symbology).bounds(this, geom, {
            yOffset,
            dpmm,
            placeholderBounds: (element) => {
                const size = 21 * (element.magnification || 5);
                return { x: element.x, y: element.y, width: size, height: size + yOffset };
            }
        });
    }

    canMatchLabelSize() { return false; }
}
