import { ZPLElement } from './ZPLElement.js';

// TEXT Element Class
export class TextElement extends ZPLElement {
    constructor(x = 0, y = 0, previewText = '', fontSize = 0, fontWidth = 0, placeholder = '', fontId = '', orientation = 'N', reverse = false) {
        super(x, y);
        this.type = 'TEXT';
        this.previewText = previewText;
        this.placeholder = placeholder;
        this.fontId = fontId; // Element-level font override (empty = use label default)
        this.fontSize = fontSize; // 0 = use label default
        this.fontWidth = fontWidth; // 0 = use label default
        this.orientation = orientation; // N, R, I, B
        this.reverse = reverse; // ^FR (reverse print)
    }

    getEstimatedWidth() {
        return Math.max(this.previewText.length * (this.fontWidth || 30) * 0.6, 50);
    }

    getEstimatedHeight() {
        return (this.fontSize || 30) + 10;
    }

    render(defaultFontId = '0', defaultFontHeight = 20, defaultFontWidth = 20) {
        const fontId = this.fontId || defaultFontId;
        const content = this.placeholder ? `%${this.placeholder}%` : this.previewText;
        const reverseCmd = this.reverse ? '^FR' : '';
        // Use label defaults if element values are 0
        const fontSize = this.fontSize || defaultFontHeight;
        const fontWidth = this.fontWidth || defaultFontWidth;
        return `^FO${Math.round(this.x)},${Math.round(this.y)}${reverseCmd}^A${fontId}${this.orientation},${fontSize},${fontWidth}^FD${content}^FS`;
    }

    renderPreview(defaultFontId = '0', defaultFontHeight = 20, defaultFontWidth = 20) {
        const fontId = this.fontId || defaultFontId;
        const reverseCmd = this.reverse ? '^FR' : '';
        // Use label defaults if element values are 0
        const fontSize = this.fontSize || defaultFontHeight;
        const fontWidth = this.fontWidth || defaultFontWidth;
        return `^FO${Math.round(this.x)},${Math.round(this.y)}${reverseCmd}^A${fontId}${this.orientation},${fontSize},${fontWidth}^FD${this.previewText}^FS`;
    }

    getDisplayName() {
        const displayText = this.placeholder || this.previewText;
        return `Text: "${displayText.substring(0, 20)}${displayText.length > 20 ? '...' : ''}"`;
    }

    getBounds() {
        // Estimate text dimensions (unrotated)
        const textW = Math.max(this.previewText.length * (this.fontWidth || 30) * 0.6, 50);
        const textH = (this.fontSize || 30) + 10;

        let width = textW;
        let height = textH;

        if (this.orientation === 'R') { // 90° clockwise - top-left at (x,y), extends down
            width = textH;
            height = textW;
        } else if (this.orientation === 'B') { // 270° clockwise - top-left at (x,y), extends up
            width = textH;
            height = textW;
        }

        return { x: this.x, y: this.y, width, height };
    }
}
