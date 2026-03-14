import { ZPLElement } from './ZPLElement.js';
import { LINE_HEIGHT_RATIO } from '../utils/geometry.js';

// Field Block Element Class
export class FieldBlockElement extends ZPLElement {
    constructor(x = 0, y = 0, previewText = '', fontSize = 0, fontWidth = 0, blockWidth = 200, maxLines = 1, lineSpacing = 0, justification = 'L', hangingIndent = 0, placeholder = '', fontId = '', reverse = false, orientation = 'N') {
        super(x, y);
        this.type = 'FIELDBLOCK';
        this.previewText = previewText;
        this.placeholder = placeholder;
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
    }

    render(defaultFontId = '0', defaultFontHeight = 20, defaultFontWidth = 20) {
        // ZPL format: ^FOx,y^A{fontId}N,height,width^FBa,b,c,d,e^FDtext^FS
        // ^FO - Field Origin (position)
        // ^A{fontId}N - Font specification (fontId = font identifier, N = normal orientation)
        // ^FB - Field Block
        //   a = block width in dots
        //   b = maximum number of lines
        //   c = line spacing adjustment
        //   d = text justification (L/C/R/J)
        //   e = hanging indent in dots
        // ^FD - Field Data (uses placeholder for template)
        // ^FS - Field Separator
        const fontId = this.fontId || defaultFontId;
        const rawContent = this.placeholder ? `%${this.placeholder}%` : this.previewText;
        const content = this.justification === 'C' ? `${rawContent}\\&` : rawContent;
        const reverseCmd = this.reverse ? '^FR' : '';
        // Use label defaults if element values are 0
        const fontSize = this.fontSize || defaultFontHeight;
        const fontWidth = this.fontWidth || defaultFontWidth;
        return `^FO${this.x},${this.y}${reverseCmd}^A${fontId}${this.orientation},${fontSize},${fontWidth}^FB${this.blockWidth},${this.maxLines},${this.lineSpacing},${this.justification},${this.hangingIndent}^FD${content}^FS`;
    }

    renderPreview(defaultFontId = '0', defaultFontHeight = 20, defaultFontWidth = 20) {
        // Uses preview text for Labelary API visualization
        const fontId = this.fontId || defaultFontId;
        const reverseCmd = this.reverse ? '^FR' : '';
        // Use label defaults if element values are 0
        const fontSize = this.fontSize || defaultFontHeight;
        const fontWidth = this.fontWidth || defaultFontWidth;
        const previewContent = this.justification === 'C' ? `${this.previewText}\\&` : this.previewText;
        return `^FO${this.x},${this.y}${reverseCmd}^A${fontId}${this.orientation},${fontSize},${fontWidth}^FB${this.blockWidth},${this.maxLines},${this.lineSpacing},${this.justification},${this.hangingIndent}^FD${previewContent}^FS`;
    }

    getDisplayName() {
        const displayText = this.placeholder || this.previewText;
        return `Field Block: "${displayText.substring(0, 20)}${displayText.length > 20 ? '...' : ''}"`;
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
