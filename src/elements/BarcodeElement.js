import { ZPLElement } from './ZPLElement.js';
import { getBarcodeGeometry, linearFallbackModules } from '../utils/barcodeGeometry.js';
import { renderFieldDataCommand } from '../utils/zplFieldData.js';

// 1D Barcode element. The `symbology` selects the ZPL command:
//   CODE128 -> ^BC,  CODE39 -> ^B3,  EAN13 -> ^BE,  UPCA -> ^BU
export class BarcodeElement extends ZPLElement {
    constructor(x = 0, y = 0, previewData = '', height = 50, width = 2, ratio = 2.0, placeholder = '', showText = true, reverse = false, symbology = 'CODE128', checkDigit = false, orientation = 'N', printTextAbove = false, fieldHex = false) {
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
    }

    _render(content) {
        const f = this.showText ? 'Y' : 'N';
        const o = this.orientation;
        // The interpretation-line-above (g) flag sits right after f in every ^BC
        // family command; emit it only when on so default output is unchanged.
        const g = this.printTextAbove ? ',Y' : '';
        const reverseCmd = this.reverse ? '^FR' : '';
        const pos = `^FO${this.x},${this.y}${reverseCmd}`;
        const by = `^BY${this.width},${this.ratio}`;
        switch (this.symbology) {
            case 'CODE39': {
                const e = this.checkDigit ? 'Y' : 'N';
                return `${pos}${by}^B3${o},${e},${this.height},${f}${g}${renderFieldDataCommand(content, '_', this.fieldHex)}^FS`;
            }
            case 'INTERLEAVED2OF5': {
                // ^B2 param order is o,h,f,g,e. When the mod-10 check digit (e) is on,
                // the g slot must be filled so e lands in the right position.
                const gVal = this.printTextAbove ? 'Y' : 'N';
                const tail = this.checkDigit ? `,${gVal},Y` : g;
                return `${pos}${by}^B2${o},${this.height},${f}${tail}${renderFieldDataCommand(content, '_', this.fieldHex)}^FS`;
            }
            case 'EAN13':
                return `${pos}${by}^BE${o},${this.height},${f}${g}${renderFieldDataCommand(content, '_', this.fieldHex)}^FS`;
            case 'UPCA':
                return `${pos}${by}^BU${o},${this.height},${f}${g}${renderFieldDataCommand(content, '_', this.fieldHex)}^FS`;
            case 'CODE128':
            default:
                // >: forces Code 128 Subset B (the canvas mirrors this — see barcodeGeometry).
                return `${pos}${by}^BC${o},${this.height},${f}${g}${renderFieldDataCommand(`>:${content}`, '_', this.fieldHex)}^FS`;
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
