import { ZPLElement } from './ZPLElement.js';

// Barcode Element Class
export class BarcodeElement extends ZPLElement {
    constructor(x = 0, y = 0, previewData = '', height = 50, width = 2, ratio = 2.0, placeholder = '', showText = true, reverse = false) {
        super(x, y);
        this.type = 'BARCODE';
        this.previewData = previewData;
        this.placeholder = placeholder;
        this.height = height;
        this.width = width;
        this.ratio = ratio;
        this.showText = showText;
        this.reverse = reverse; // ^FR (reverse print)
    }

    render() {
        // ZPL format: ^FOx,y^FR^BYwidth,ratio^BCN,height,f^FD>:data^FS
        // ^FR - Reverse print (optional)
        const content = this.placeholder ? `%${this.placeholder}%` : this.previewData;
        const interpretation = this.showText ? 'Y' : 'N';
        const reverseCmd = this.reverse ? '^FR' : '';
        return `^FO${this.x},${this.y}${reverseCmd}^BY${this.width},${this.ratio}^BCN,${this.height},${interpretation}^FD>:${content}^FS`;
    }

    renderPreview() {
        // Uses preview data for Labelary API visualization
        const interpretation = this.showText ? 'Y' : 'N';
        const reverseCmd = this.reverse ? '^FR' : '';
        return `^FO${this.x},${this.y}${reverseCmd}^BY${this.width},${this.ratio}^BCN,${this.height},${interpretation}^FD>:${this.previewData}^FS`;
    }

    getDisplayName() {
        const displayText = this.placeholder || this.previewData;
        return `"${displayText.substring(0, 20)}${displayText.length > 20 ? '...' : ''}"`;
    }

    getBounds() {
        // Calculate actual Code128 width (bars only): (35 + 11n) × moduleWidth
        // Quiet zones (10 modules each side) are implicit, not part of bounds
        const totalModules = 35 + (11 * this.previewData.length);
        const width = totalModules * this.width;
        const height = this.height;
        return { x: this.x, y: this.y, width, height };
    }
}
