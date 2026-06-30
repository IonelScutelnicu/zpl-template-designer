import { ZPLElement } from './ZPLElement.js';
import { getBarcodeGeometry, linearFallbackModules } from '../utils/barcodeGeometry.js';
import { getBarcodeSymbology } from '../barcodes/BarcodeSymbologies.js';

// 1D Barcode element. The `symbology` selects the ZPL command:
//   CODE128 -> ^BC,  CODE39 -> ^B3,  CODE93 -> ^BA,  CODE11 -> ^B1,  CODABAR -> ^BK,
//   INTERLEAVED2OF5 -> ^B2,  INDUSTRIAL2OF5 -> ^BI,  STANDARD2OF5 -> ^BJ,  LOGMARS -> ^BL,
//   MSI -> ^BM,  PLESSEY -> ^BP,  PLANET -> ^B5,  POSTNET -> ^BZ,  EAN13 -> ^BE,
//   EAN8 -> ^B8,  UPCA -> ^BU,  UPCE -> ^B9,  UPCEANEXT -> ^BS (2/5-digit add-on)
export class BarcodeElement extends ZPLElement {
    constructor(x = 0, y = 0, previewData = '', height = 50, width = 2, ratio = 2.0, placeholder = '', showText = true, reverse = false, symbology = 'CODE128', checkDigit = false, orientation = 'N', printTextAbove = false, fieldHex = false, startChar = 'A', stopChar = 'A', msiCheckMode = 'B', msiCheckInText = false) {
        super(x, y);
        this.type = 'BARCODE';
        this.symbology = symbology;
        this.previewData = previewData;
        this.placeholder = placeholder;
        this.height = height;
        this.width = width;
        this.ratio = ratio;
        this.showText = showText;
        this.checkDigit = checkDigit; // Code 39 mod-43 check digit
        this.reverse = reverse; // ^FR (reverse print)
        this.orientation = orientation; // N, R, I, B
        this.printTextAbove = printTextAbove; // interpretation line above the bars (g param)
        this.fieldHex = fieldHex; // ^FH (force field hex indicator)
        this.startChar = startChar; // Codabar start character (^BK k param: A–D)
        this.stopChar = stopChar; // Codabar stop character (^BK l param: A–D)
        this.msiCheckMode = msiCheckMode; // MSI check-digit mode (^BM e param: A/B/C/D)
        this.msiCheckInText = msiCheckInText; // MSI insert check digit into HRI (^BM e2 param)
    }

    _render(content, preservePlaceholders = false) {
        const reverseCmd = this.reverse ? '^FR' : '';
        const pos = `^FO${this.x},${this.y}${reverseCmd}`;
        const by = `^BY${this.width},${this.ratio}`;
        return `${pos}${by}${getBarcodeSymbology(this.symbology).renderZpl(this, content, preservePlaceholders)}^FS`;
    }

    render() {
        return this._render(this.placeholder ? `%${this.placeholder}%` : this.previewData, Boolean(this.placeholder));
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
        const geom = getBarcodeGeometry(this);
        const modules = geom.kind === 'linear'
            ? geom.modules
            : linearFallbackModules(this.previewData.length);
        const w = modules * this.width;
        // R/B rotate the symbol 90°, so the screen-space box swaps width/height.
        if (this.orientation === 'R' || this.orientation === 'B') {
            return { x: this.x, y: this.y, width: this.height, height: w };
        }
        return { x: this.x, y: this.y, width: w, height: this.height };
    }
}
