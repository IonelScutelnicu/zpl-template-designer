import { ZPLElement } from './ZPLElement.js';
import { getBarcodeGeometry, linearFallbackModules } from '../utils/barcodeGeometry.js';
import { renderFieldDataCommand } from '../utils/zplFieldData.js';

// 1D Barcode element. The `symbology` selects the ZPL command:
//   CODE128 -> ^BC,  CODE39 -> ^B3,  CODE93 -> ^BA,  CODE11 -> ^B1,  CODABAR -> ^BK,
//   INTERLEAVED2OF5 -> ^B2,  INDUSTRIAL2OF5 -> ^BI,  STANDARD2OF5 -> ^BJ,  LOGMARS -> ^BL,
//   MSI -> ^BM,  PLESSEY -> ^BP,  EAN13 -> ^BE,  EAN8 -> ^B8,  UPCA -> ^BU,
//   UPCE -> ^B9,  UPCEANEXT -> ^BS (2/5-digit add-on)
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
            case 'CODE11': {
                // ^B1o,e,h,f,g — same layout as ^B3. e is Y=1 check digit / N=2 check
                // digits (default N), so model checkDigit as "single check digit".
                const e = this.checkDigit ? 'Y' : 'N';
                return `${pos}${by}^B1${o},${e},${this.height},${f}${g}${renderFieldDataCommand(content, '_', this.fieldHex)}^FS`;
            }
            case 'INTERLEAVED2OF5': {
                // ^B2 param order is o,h,f,g,e. When the mod-10 check digit (e) is on,
                // the g slot must be filled so e lands in the right position.
                const gVal = this.printTextAbove ? 'Y' : 'N';
                const tail = this.checkDigit ? `,${gVal},Y` : g;
                return `${pos}${by}^B2${o},${this.height},${f}${tail}${renderFieldDataCommand(content, '_', this.fieldHex)}^FS`;
            }
            case 'INDUSTRIAL2OF5':
                // ^BIo,h,f,g — plain o,h,f,g layout (no e/check-digit param). Industrial
                // 2 of 5 is numeric-only and self-checking; all data is carried in the bars.
                return `${pos}${by}^BI${o},${this.height},${f}${g}${renderFieldDataCommand(content, '_', this.fieldHex)}^FS`;
            case 'STANDARD2OF5':
                // ^BJo,h,f,g — same plain layout as ^BI. Standard 2 of 5 differs from
                // Industrial only in its (shorter) start/stop bars; numeric-only, no check digit.
                return `${pos}${by}^BJ${o},${this.height},${f}${g}${renderFieldDataCommand(content, '_', this.fieldHex)}^FS`;
            case 'MSI': {
                // ^BMo,e,h,f,g,e2 — e = check-digit mode (A/B/C/D, default B); e2 = insert
                // the computed check digit(s) into the HRI. e2 needs the g slot filled so it
                // lands in position (same pattern as ^B2/^BA's trailing e flag).
                const e = this.msiCheckMode || 'B';
                const gVal = this.printTextAbove ? 'Y' : 'N';
                const tail = this.msiCheckInText ? `,${gVal},Y` : g;
                return `${pos}${by}^BM${o},${e},${this.height},${f}${tail}${renderFieldDataCommand(content, '_', this.fieldHex)}^FS`;
            }
            case 'PLESSEY': {
                // ^BPo,e,h,f,g — same layout as ^B3. The two hex CRC check chars are
                // always encoded in the bars; e (Y/N, default N) only controls whether the
                // HRI shows them (mirrored by BarcodeRenderer via plesseyCheckDigits).
                const e = this.checkDigit ? 'Y' : 'N';
                return `${pos}${by}^BP${o},${e},${this.height},${f}${g}${renderFieldDataCommand(content, '_', this.fieldHex)}^FS`;
            }
            case 'LOGMARS':
                // ^BLo,h,g — Code 39 for the US DoD. Unlike the others there is NO f
                // (print-interpretation) param: the HRI is always printed. The mod-43 check
                // digit is mandatory. g (interpretation line above) is emitted only when on.
                return `${pos}${by}^BL${o},${this.height}${g}${renderFieldDataCommand(content, '_', this.fieldHex)}^FS`;
            case 'CODE93': {
                // ^BA param order is o,h,f,g,e — same layout as ^B2. Code 93 always
                // encodes its two check chars in the bars; e only prints them in the
                // HRI. As with ^B2, fill the g slot when e is on so e lands correctly.
                const gVal = this.printTextAbove ? 'Y' : 'N';
                const tail = this.checkDigit ? `,${gVal},Y` : g;
                return `${pos}${by}^BA${o},${this.height},${f}${tail}${renderFieldDataCommand(content, '_', this.fieldHex)}^FS`;
            }
            case 'CODABAR': {
                // ^BK param order is o,e,h,f,g,k,l. The check digit (e) is fixed at N.
                // k/l are the start/stop chars (A–D); only emit them when non-default,
                // which requires the g slot to be filled so they land in position.
                const startCh = this.startChar || 'A';
                const stopCh = this.stopChar || 'A';
                const gVal = this.printTextAbove ? 'Y' : 'N';
                const tail = (startCh !== 'A' || stopCh !== 'A') ? `,${gVal},${startCh},${stopCh}` : g;
                return `${pos}${by}^BK${o},N,${this.height},${f}${tail}${renderFieldDataCommand(content, '_', this.fieldHex)}^FS`;
            }
            case 'EAN13':
                return `${pos}${by}^BE${o},${this.height},${f}${g}${renderFieldDataCommand(content, '_', this.fieldHex)}^FS`;
            case 'EAN8':
                return `${pos}${by}^B8${o},${this.height},${f}${g}${renderFieldDataCommand(content, '_', this.fieldHex)}^FS`;
            case 'UPCE':
                return `${pos}${by}^B9${o},${this.height},${f}${g}${renderFieldDataCommand(content, '_', this.fieldHex)}^FS`;
            case 'UPCA':
                return `${pos}${by}^BU${o},${this.height},${f}${g}${renderFieldDataCommand(content, '_', this.fieldHex)}^FS`;
            case 'UPCEANEXT': {
                // ^BS 2/5-digit add-on (^BSo,h,f,g). The data length picks the variant.
                // g (interpretation line above) defaults Y for ^BS — the opposite of the
                // other barcodes — so always emit it explicitly to keep canvas and
                // Labelary in agreement regardless of the toggle.
                const gVal = this.printTextAbove ? 'Y' : 'N';
                return `${pos}${by}^BS${o},${this.height},${f},${gVal}${renderFieldDataCommand(content, '_', this.fieldHex)}^FS`;
            }
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
