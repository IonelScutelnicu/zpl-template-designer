import { ZPLElement } from './ZPLElement.js';
import { getBarcodeGeometry, matrixModuleDots, normalizeAztecRune } from '../utils/barcodeGeometry.js';
import { renderFieldDataCommand } from '../utils/zplFieldData.js';

// 2D Barcode element. The `symbology` selects the ZPL command:
//   QR -> ^BQ,  DATAMATRIX -> ^BX,  PDF417 -> ^B7,  MICROPDF417 -> ^BF,  AZTEC -> ^B0,
//   CODE49 -> ^B4 (stacked),  CODABLOCK -> ^BB (stacked)
// QR codes carry a 10-dot quiet-zone Y offset (Labelary renders ^BQ this way);
// Aztec has no quiet zone, so it keeps the default 0 offset.
export class QRCodeElement extends ZPLElement {
    constructor(x = 0, y = 0, previewData = '', model = 2, magnification = 5, errorCorrection = 'Q', placeholder = '', reverse = false, symbology = 'QR', moduleSize = 4, quality = 200, moduleWidth = 2, rowHeight = 4, securityLevel = 5, columns = 0, aztecSizeMode = 'auto', aztecErrorControl = 0, aztecLayers = 0, fieldHex = false, microPdfMode = 0, code49Mode = 'A', codablockMode = 'F') {
        super(x, y);
        this.type = 'QRCODE';
        this.symbology = symbology;
        this.previewData = previewData;
        this.placeholder = placeholder;
        // QR (^BQ)
        this.model = model;              // 1 = original, 2 = enhanced (recommended)
        this.magnification = magnification; // 1-10 (scaling factor)
        this.errorCorrection = errorCorrection; // H, Q, M, L (high to low)
        // Data Matrix (^BX)
        this.moduleSize = moduleSize;    // individual module size in dots
        this.quality = quality;          // ECC level (200 = ECC 200, recommended)
        // PDF417 (^B7)
        this.moduleWidth = moduleWidth;  // X module width in dots (^BY)
        this.rowHeight = rowHeight;      // row height in dots
        this.securityLevel = securityLevel; // 0-8
        this.columns = columns;          // 0 = auto
        // Micro-PDF417 (^BF). Mode 0-33 selects a fixed rows×columns variant; reuses
        // moduleWidth (^BY) and rowHeight above for sizing.
        this.microPdfMode = microPdfMode;
        // Code 49 (^B4). Stacked alphanumeric symbology; reuses moduleWidth (^BY) and
        // rowHeight above for sizing. m = starting mode (0–5 / A=auto). NOTE: Labelary
        // does not render Code 49 (it shows the raw data as text), so the on-canvas
        // bwip-js encoding is the design reference for this symbology, not the preview pane.
        this.code49Mode = code49Mode; // '0'–'5' or 'A' (automatic, default)
        // Codablock (^BB). Stacked Code 128 symbology; reuses moduleWidth (^BY) and
        // rowHeight above for sizing. m = mode (A=Code 39, E=Code 128+FNC1, F=Code 128).
        // bwip-js only encodes Codablock F, so the on-canvas symbol always uses the F
        // encoding; m affects only the emitted ZPL / real-printer output.
        this.codablockMode = codablockMode; // 'A' | 'E' | 'F' (default)
        // Aztec (^B0). The 'd' param (error control / symbol size/type) is modelled
        // by three fields: sizeMode 'auto' uses aztecErrorControl (% min, 0 = printer
        // default); 'compact'/'full' use aztecLayers (0 = auto); 'rune' = ^B0 d=300.
        this.aztecSizeMode = aztecSizeMode;       // 'auto' | 'compact' | 'full' | 'rune'
        this.aztecErrorControl = aztecErrorControl; // 0 (default) or 1-99 (% minimum)
        this.aztecLayers = aztecLayers;           // 0 = auto, 1-4 compact / 1-32 full
        this.reverse = reverse; // ^FR (reverse print)
        this.fieldHex = fieldHex; // ^FH (force field hex indicator)
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

    _render(content) {
        const reverseCmd = this.reverse ? '^FR' : '';
        const pos = `^FO${this.x},${this.y}${reverseCmd}`;
        switch (this.symbology) {
            case 'DATAMATRIX':
                return `${pos}^BXN,${this.moduleSize},${this.quality}${renderFieldDataCommand(content, '_', this.fieldHex)}^FS`;
            case 'PDF417': {
                const cols = this.columns > 0 ? `,${this.columns}` : '';
                return `${pos}^BY${this.moduleWidth}^B7N,${this.rowHeight},${this.securityLevel}${cols}${renderFieldDataCommand(content, '_', this.fieldHex)}^FS`;
            }
            case 'MICROPDF417': {
                // ^BFo,h,m — module width from ^BY, h = row height, m = mode (0-33).
                const mode = Math.max(0, Math.min(33, this.microPdfMode || 0));
                return `${pos}^BY${this.moduleWidth}^BFN,${this.rowHeight},${mode}${renderFieldDataCommand(content, '_', this.fieldHex)}^FS`;
            }
            case 'CODE49': {
                // ^B4o,h,f,m — module width from ^BY, h = row height, f = interpretation
                // line, m = starting mode. f is fixed at N (no HRI): the 2D canvas and
                // Labelary don't render Code 49's interpretation line. m defaults A (auto).
                const mode = ['0', '1', '2', '3', '4', '5', 'A'].includes(this.code49Mode) ? this.code49Mode : 'A';
                return `${pos}^BY${this.moduleWidth}^B4N,${this.rowHeight},N,${mode}${renderFieldDataCommand(content, '_', this.fieldHex)}^FS`;
            }
            case 'CODABLOCK': {
                // ^BBo,h,s,c,r,m — module width from ^BY, h = row height, s = security
                // level, c = chars/row, r = rows (both left blank → printer auto-fits),
                // m = mode. The 2D canvas has no orientation, so o is fixed at N.
                const mode = ['A', 'E', 'F'].includes(this.codablockMode) ? this.codablockMode : 'F';
                return `${pos}^BY${this.moduleWidth}^BBN,${this.rowHeight},N,,,${mode}${renderFieldDataCommand(content, '_', this.fieldHex)}^FS`;
            }
            case 'AZTEC': {
                // A rune encodes a single 0–255 byte; coerce real data so the ZPL
                // is valid (leave %placeholder% tokens for the caller to fill).
                const isPlaceholder = /^%.*%$/.test(content);
                const data = this.aztecSizeMode === 'rune' && !isPlaceholder ? normalizeAztecRune(content) : content;
                // d=0 means "printer default" but isn't a valid ^B0 value (valid:
                // 1-99/101-104/201-232/300); omit it so the default is implied.
                const d = this._aztecD();
                const dParam = d > 0 ? `,${d}` : '';
                return `${pos}^B0N,${this.magnification},N${dParam}${renderFieldDataCommand(data, '_', this.fieldHex)}^FS`;
            }
            case 'QR':
            default:
                return `${pos}^BQN,${this.model},${this.magnification}${renderFieldDataCommand(`${this.errorCorrection}A,${content}`, '_', this.fieldHex)}^FS`;
        }
    }

    render() {
        return this._render(this.placeholder ? `%${this.placeholder}%` : this.previewData);
    }

    renderPreview() {
        // Uses preview data for Labelary API visualization
        return this._render(this.previewData);
    }

    getDisplayName() {
        const displayText = this.placeholder || this.previewData;
        return `"${displayText.substring(0, 20)}${displayText.length > 20 ? '...' : ''}"`;
    }

    getBounds() {
        const yOffset = this.symbology === 'QR' || !this.symbology ? 10 : 0;
        const geom = getBarcodeGeometry(this);
        if (geom.kind === 'matrix') {
            const { mx, my } = matrixModuleDots(this);
            return { x: this.x, y: this.y, width: geom.cols * mx, height: geom.rows * my + yOffset };
        }
        // Fallback (encode failed): match the square placeholder the renderers
        // draw — a 21-module box at magnification, for every symbology.
        const size = 21 * (this.magnification || 5);
        return { x: this.x, y: this.y, width: size, height: size + yOffset };
    }

    canMatchLabelSize() { return false; }
}
