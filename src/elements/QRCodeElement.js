import { ZPLElement } from './ZPLElement.js';
import { getBarcodeGeometry, matrixModuleDots } from '../utils/barcodeGeometry.js';

// 2D Barcode element. The `symbology` selects the ZPL command:
//   QR -> ^BQ,  DATAMATRIX -> ^BX,  PDF417 -> ^B7
// QR codes carry a 10-dot quiet-zone Y offset (Labelary renders ^BQ this way).
export class QRCodeElement extends ZPLElement {
    constructor(x = 0, y = 0, previewData = '', model = 2, magnification = 5, errorCorrection = 'Q', placeholder = '', reverse = false, symbology = 'QR', moduleSize = 4, quality = 200, moduleWidth = 2, rowHeight = 4, securityLevel = 5, columns = 0) {
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
        this.reverse = reverse; // ^FR (reverse print)
    }

    _render(content) {
        const reverseCmd = this.reverse ? '^FR' : '';
        const pos = `^FO${this.x},${this.y}${reverseCmd}`;
        switch (this.symbology) {
            case 'DATAMATRIX':
                return `${pos}^BXN,${this.moduleSize},${this.quality}^FD${content}^FS`;
            case 'PDF417': {
                const cols = this.columns > 0 ? `,${this.columns}` : '';
                return `${pos}^BY${this.moduleWidth}^B7N,${this.rowHeight},${this.securityLevel}${cols}^FD${content}^FS`;
            }
            case 'QR':
            default:
                return `${pos}^BQN,${this.model},${this.magnification}^FD${this.errorCorrection}A,${content}^FS`;
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
