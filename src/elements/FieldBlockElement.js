import { ZPLElement } from './ZPLElement.js';
import { LINE_HEIGHT_RATIO } from '../utils/geometry.js';
import { renderFieldDataCommand, encodeFieldBlockBreaks, FB_LINE_BREAK } from '../utils/zplFieldData.js';
import { resolvePlaceholders } from '../utils/placeholders.js';

// Field Block Element Class
export class FieldBlockElement extends ZPLElement {
    constructor(x = 0, y = 0, content = '', fontSize = 0, fontWidth = 0, blockWidth = 200, maxLines = 1, lineSpacing = 0, justification = 'L', hangingIndent = 0, fontId = '', reverse = false, orientation = 'N', fieldHex = false) {
        super(x, y);
        this.type = 'FIELDBLOCK';
        this.content = content; // Template string: literal text mixed with %placeholder%s
        this.fontId = fontId; // Element-level font override (empty = use label default)
        this.fontSize = fontSize; // 0 = use label default
        this.fontWidth = fontWidth; // 0 = use label default
        this.blockWidth = blockWidth;
        this.maxLines = maxLines;
        this.lineSpacing = lineSpacing;
        this.justification = justification;
        this.hangingIndent = hangingIndent;
        this.reverse = reverse; // ^FR (reverse print)
        this.orientation = orientation; // N, R, I, B
        this.fieldHex = fieldHex; // ^FH (force field hex indicator)
    }

    _render(rawContent, defaultFontId, defaultFontHeight, defaultFontWidth) {
        // ZPL format: ^FOx,y^A{fontId}N,height[,width]^FBa,b,c,d,e^FDtext^FS
        // ^FO - Field Origin (position)
        // ^A{fontId}N - Font specification (fontId = font identifier, N = normal orientation)
        // ^FB - Field Block
        //   a = block width in dots
        //   b = maximum number of lines
        //   c = line spacing adjustment
        //   d = text justification (L/C/R/J)
        //   e = hanging indent in dots
        // ^FD - Field Data (Content: literal text mixed with %placeholder%s)
        // ^FS - Field Separator
        const fontId = this.fontId || defaultFontId;
        // ^FB discards raw line feeds; its line break is the \& escape. Convert
        // before appending the centre-justification marker so both survive.
        const escaped = encodeFieldBlockBreaks(rawContent);
        const content = this.justification === 'C' ? `${escaped}${FB_LINE_BREAK}` : escaped;
        const reverseCmd = this.reverse ? '^FR' : '';
        // Use label defaults if element values are 0
        const fontSize = this.fontSize || defaultFontHeight;
        const fontWidth = this.fontWidth || defaultFontWidth;
        const fontWidthParam = fontWidth > 0 ? `,${fontWidth}` : '';
        return `^FO${this.x},${this.y}${reverseCmd}^A${fontId}${this.orientation},${fontSize}${fontWidthParam}^FB${this.blockWidth},${this.maxLines},${this.lineSpacing},${this.justification},${this.hangingIndent}${renderFieldDataCommand(content, '_', this.fieldHex)}^FS`;
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
        const fontSize = this.fontSize || 30;
        const maxLines = this.maxLines || 1;
        const lineSpacing = this.lineSpacing || 0;
        // Base line height times number of lines, plus line spacing between lines (maxLines - 1)
        const baseLineHeight = fontSize * LINE_HEIGHT_RATIO;
        const blockH = baseLineHeight * maxLines + lineSpacing * Math.max(0, maxLines - 1) + 10;

        let width = blockW;
        let height = blockH;

        if (this.orientation === 'R' || this.orientation === 'B') {
            width = blockH;
            height = blockW;
        }

        return { x: this.x, y: this.y, width, height };
    }
}
