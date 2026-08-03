import { ZPLElement } from './ZPLElement.js';
import { renderFieldDataCommand } from '../utils/zplFieldData.js';
import { resolvePlaceholders } from '../utils/placeholders.js';

// TEXT Element Class
export class TextElement extends ZPLElement {
    constructor(x = 0, y = 0, content = '', fontSize = 0, fontWidth = 0, fontId = '', orientation = 'N', reverse = false, fieldHex = false) {
        super(x, y);
        this.type = 'TEXT';
        this.content = content; // Template string: literal text mixed with %placeholder%s
        this.fontId = fontId; // Element-level font override (empty = use label default)
        this.fontSize = fontSize; // 0 = use label default
        this.fontWidth = fontWidth; // 0 = use label default
        this.orientation = orientation; // N, R, I, B
        this.reverse = reverse; // ^FR (reverse print)
        this.fieldHex = fieldHex; // ^FH (force field hex indicator)
    }

    // Geometry measures the placeholder names, not the Preview Data values, so an
    // element's box stays put while sample values are edited. The canvas sizes
    // TEXT through getElementBoundsResolved(), which does see Preview Data.
    getEstimatedWidth() {
        return Math.max(resolvePlaceholders(this.content).length * (this.fontWidth || 30) * 0.6, 50);
    }

    getEstimatedHeight() {
        return (this.fontSize || 30) + 10;
    }

    _render(content, defaultFontId, defaultFontHeight, defaultFontWidth) {
        const fontId = this.fontId || defaultFontId;
        const reverseCmd = this.reverse ? '^FR' : '';
        // Use label defaults if element values are 0
        const fontSize = this.fontSize || defaultFontHeight;
        const fontWidth = this.fontWidth || defaultFontWidth;
        const fontWidthParam = fontWidth > 0 ? `,${fontWidth}` : '';
        return `^FO${Math.round(this.x)},${Math.round(this.y)}${reverseCmd}^A${fontId}${this.orientation},${fontSize}${fontWidthParam}${renderFieldDataCommand(content, '_', this.fieldHex)}^FS`;
    }

    render(defaultFontId = '0', defaultFontHeight = 20, defaultFontWidth = 0) {
        return this._render(this.content, defaultFontId, defaultFontHeight, defaultFontWidth);
    }

    renderPreview(defaultFontId = '0', defaultFontHeight = 20, defaultFontWidth = 0, previewData = {}) {
        return this._render(resolvePlaceholders(this.content, previewData), defaultFontId, defaultFontHeight, defaultFontWidth);
    }

    getDisplayName() {
        const displayText = this.content;
        return `"${displayText.substring(0, 20)}${displayText.length > 20 ? '...' : ''}"`;
    }

    getBounds() {
        // Estimate text dimensions (unrotated)
        const textW = this.getEstimatedWidth();
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

    canMatchLabelSize() { return false; }
}
