import { ZPLElement } from './ZPLElement.js';
import { renderFieldDataCommand } from '../utils/zplFieldData.js';
import { resolvePlaceholders } from '../utils/placeholders.js';

// Text Block Element Class (^TB command)
export class TextBlockElement extends ZPLElement {
    constructor(x = 0, y = 0, content = '', fontSize = 0, fontWidth = 0, blockWidth = 200, blockHeight = 50, fontId = '', reverse = false, orientation = 'N', fieldHex = false) {
        super(x, y);
        this.type = 'TEXTBLOCK';
        this.content = content; // Template string: literal text mixed with %placeholder%s
        this.fontId = fontId; // Element-level font override (empty = use label default)
        this.fontSize = fontSize; // 0 = use label default
        this.fontWidth = fontWidth; // 0 = use label default
        this.blockWidth = blockWidth;
        this.blockHeight = blockHeight;
        this.reverse = reverse; // ^FR (reverse print)
        this.orientation = orientation; // N, R, I, B
        this.fieldHex = fieldHex; // ^FH (force field hex indicator)
    }

    _render(content, defaultFontId, defaultFontHeight, defaultFontWidth) {
        // ZPL format: ^FOx,y[^FR]^A{fontId}{o},{h}[,{w}]^TB{o},{blockW},{blockH}^FDtext^FS
        const fontId = this.fontId || defaultFontId;
        const reverseCmd = this.reverse ? '^FR' : '';
        const fontSize = this.fontSize || defaultFontHeight;
        const fontWidth = this.fontWidth || defaultFontWidth;
        const fontWidthParam = fontWidth > 0 ? `,${fontWidth}` : '';
        return `^FO${this.x},${this.y}${reverseCmd}^A${fontId}${this.orientation},${fontSize}${fontWidthParam}^TB${this.orientation},${this.blockWidth},${this.blockHeight}${renderFieldDataCommand(content, '_', this.fieldHex)}^FS`;
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
        const blockW = this.blockWidth || 200;
        const blockH = this.blockHeight || 50;

        let width = blockW;
        let height = blockH;

        if (this.orientation === 'R' || this.orientation === 'B') {
            width = blockH;
            height = blockW;
        }

        return { x: this.x, y: this.y, width, height };
    }
}
