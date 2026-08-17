import { ZPLElement } from './ZPLElement.js';
import { getBarcodeGeometry, linearFallbackModules } from '../utils/barcodeGeometry.js';
import { getBarcodeSymbology } from '../barcodes/BarcodeSymbologies.js';
import { resolvePlaceholders, substitutePlaceholders } from '../utils/placeholders.js';
import { fieldOriginCommand } from '../utils/fieldAnchor.js';

// 1D Barcode element. The `symbology` selects the ZPL command:
//   CODE128 -> ^BC,  CODE39 -> ^B3,  CODE93 -> ^BA,  CODE11 -> ^B1,  CODABAR -> ^BK,
//   INTERLEAVED2OF5 -> ^B2,  INDUSTRIAL2OF5 -> ^BI,  STANDARD2OF5 -> ^BJ,  LOGMARS -> ^BL,
//   MSI -> ^BM,  PLESSEY -> ^BP,  PLANET -> ^B5,  POSTNET -> ^BZ,  EAN13 -> ^BE,
//   EAN8 -> ^B8,  UPCA -> ^BU,  UPCE -> ^B9,  UPCEANEXT -> ^BS (2/5-digit add-on)
export class BarcodeElement extends ZPLElement {
    constructor(x = 0, y = 0, content = '', height = 50, width = 2, ratio = 2.0, showText = true, reverse = false, symbology = 'CODE128', checkDigit = false, orientation = 'N', printTextAbove = false, fieldHex = false, startChar = 'A', stopChar = 'A', msiCheckMode = 'B', msiCheckInText = false, code128Subset = 'B', code128Mode = 'N') {
        super(x, y);
        this.type = 'BARCODE';
        this.symbology = symbology;
        this.content = content; // Template string: literal text mixed with %placeholder%s
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
        // Code 128 start subset, from the ^FD invocation prefix (>9 = A, >: = B, >; = C).
        this.code128Subset = code128Subset;
        // ^BC m param: N (none, the start subset above applies) or one of the modes that
        // encode the data themselves — U (UCC Case), A (automatic), D (UCC/EAN).
        this.code128Mode = code128Mode;
    }

    _render(content, previewData) {
        const reverseCmd = this.reverse ? '^FR' : '';
        // The anchor needs the encoded module run, so it is measured from the
        // same data the symbol will carry — preview and export each anchor
        // their own, exactly as the printer would.
        const pos = `${fieldOriginCommand(this, undefined, { previewData })}${reverseCmd}`;
        const by = `^BY${this.width},${this.ratio}`;
        return `${pos}${by}${getBarcodeSymbology(this.symbology).renderZpl(this, content)}^FS`;
    }

    render() {
        return this._render(this.content);
    }

    renderPreview(defaultFontId, defaultFontHeight, defaultFontWidth, previewData = {}) {
        // Placeholders resolve to their Preview Data values for the Labelary preview
        return this._render(substitutePlaceholders(this.content, previewData), previewData);
    }

    getDisplayName() {
        const displayText = this.content;
        return `"${displayText.substring(0, 20)}${displayText.length > 20 ? '...' : ''}"`;
    }

    getBounds(dpmm, previewData = {}) {
        const geom = getBarcodeGeometry(this, previewData);
        const modules = geom.kind === 'linear'
            ? geom.modules
            : linearFallbackModules(resolvePlaceholders(this.content, previewData).length);
        const w = modules * this.width;
        // R/B rotate the symbol 90°, so the screen-space box swaps width/height.
        if (this.orientation === 'R' || this.orientation === 'B') {
            return { x: this.x, y: this.y, width: this.height, height: w };
        }
        return { x: this.x, y: this.y, width: w, height: this.height };
    }
}
