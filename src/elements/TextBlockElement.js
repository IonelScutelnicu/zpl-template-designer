import { ZPLElement } from './ZPLElement.js';

// Text Block Element Class
export class TextBlockElement extends ZPLElement {
    constructor(x = 0, y = 0, previewText = '', fontSize = 0, fontWidth = 0, blockWidth = 200, maxLines = 1, lineSpacing = 0, justification = 'L', hangingIndent = 0, placeholder = '', fontId = '', reverse = false) {
        super(x, y);
        this.type = 'TEXTBLOCK';
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
    }

    render(defaultFontId = '0') {
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
        const content = this.placeholder ? `%${this.placeholder}%` : this.previewText;
        const reverseCmd = this.reverse ? '^FR' : '';
        // Omit font size if using label defaults (0 or empty)
        const sizeCmd = (this.fontSize || this.fontWidth) ? `,${this.fontSize || ''},${this.fontWidth || ''}` : '';
        return `^FO${this.x},${this.y}${reverseCmd}^A${fontId}N${sizeCmd}^FB${this.blockWidth},${this.maxLines},${this.lineSpacing},${this.justification},${this.hangingIndent}^FD${content}^FS`;
    }

    renderPreview(defaultFontId = '0') {
        // Uses preview text for Labelary API visualization
        const fontId = this.fontId || defaultFontId;
        const reverseCmd = this.reverse ? '^FR' : '';
        // Omit font size if using label defaults (0 or empty)
        const sizeCmd = (this.fontSize || this.fontWidth) ? `,${this.fontSize || ''},${this.fontWidth || ''}` : '';
        return `^FO${this.x},${this.y}${reverseCmd}^A${fontId}N${sizeCmd}^FB${this.blockWidth},${this.maxLines},${this.lineSpacing},${this.justification},${this.hangingIndent}^FD${this.previewText}^FS`;
    }

    getDisplayName() {
        const displayText = this.placeholder || this.previewText;
        return `Text Block: "${displayText.substring(0, 20)}${displayText.length > 20 ? '...' : ''}"`;
    }

    getBounds() {
        const width = this.blockWidth || 200;
        const height = (this.fontSize || 30) * (this.maxLines || 1) + 10;
        return { x: this.x, y: this.y, width, height };
    }
}
