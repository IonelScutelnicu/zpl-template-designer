// Base Element Class
class ZPLElement {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
        this.id = Date.now() + Math.random();
    }

    render() {
        throw new Error('render() must be implemented by subclass');
    }
}

// TEXT Element Class
class TextElement extends ZPLElement {
    constructor(x = 0, y = 0, previewText = '', fontSize = 30, fontWidth = 30, placeholder = '', fontId = '') {
        super(x, y);
        this.type = 'TEXT';
        this.previewText = previewText;
        this.placeholder = placeholder;
        this.fontId = fontId; // Element-level font override (empty = use label default)
        this.fontSize = fontSize;
        this.fontWidth = fontWidth;
    }

    render(defaultFontId = '0') {
        // ZPL format: ^FOx,y^A{fontId}N,height,width^FDtext^FS
        // ^FO - Field Origin (position)
        // ^A{fontId}N - Font specification (fontId = font identifier, N = normal orientation)
        // ^FD - Field Data (uses placeholder for template)
        // ^FS - Field Separator
        const fontId = this.fontId || defaultFontId;
        const content = this.placeholder ? `%${this.placeholder}%` : this.previewText;
        return `^FO${this.x},${this.y}^A${fontId}N,${this.fontSize},${this.fontWidth}^FD${content}^FS`;
    }

    renderPreview(defaultFontId = '0') {
        // Uses preview text for Labelary API visualization
        const fontId = this.fontId || defaultFontId;
        return `^FO${this.x},${this.y}^A${fontId}N,${this.fontSize},${this.fontWidth}^FD${this.previewText}^FS`;
    }

    getDisplayName() {
        const displayText = this.placeholder || this.previewText;
        return `Text: "${displayText.substring(0, 20)}${displayText.length > 20 ? '...' : ''}"`;
    }
}

// Barcode Element Class
class BarcodeElement extends ZPLElement {
    constructor(x = 0, y = 0, previewData = '', height = 50, width = 2, ratio = 2.0, placeholder = '') {
        super(x, y);
        this.type = 'BARCODE';
        this.previewData = previewData;
        this.placeholder = placeholder;
        this.height = height;
        this.width = width;
        this.ratio = ratio;
    }

    render() {
        // ZPL format: ^FOx,y^BYwidth,height,ratio^BCN,height^FDdata^FS
        // ^FO - Field Origin (position)
        // ^BY - Barcode field defaults (width multiplier, height ratio, ratio)
        // ^BCN - Code 128 barcode (N = normal orientation)
        // ^FD - Field Data (uses placeholder for template)
        // ^FS - Field Separator
        const content = this.placeholder ? `%${this.placeholder}%` : this.previewData;
        return `^FO${this.x},${this.y}^BY${this.width},${this.height},${this.ratio}^BCN,${this.height}^FD${content}^FS`;
    }

    renderPreview() {
        // Uses preview data for Labelary API visualization
        return `^FO${this.x},${this.y}^BY${this.width},${this.height},${this.ratio}^BCN,${this.height}^FD${this.previewData}^FS`;
    }

    getDisplayName() {
        const displayText = this.placeholder || this.previewData;
        return `Barcode: "${displayText.substring(0, 20)}${displayText.length > 20 ? '...' : ''}"`;
    }
}

// Box Element Class
class BoxElement extends ZPLElement {
    constructor(x = 0, y = 0, width = 100, height = 50, thickness = 3, color = 'B', rounding = 0) {
        super(x, y);
        this.type = 'BOX';
        this.width = width;
        this.height = height;
        this.thickness = thickness;
        this.color = color;
        this.rounding = rounding;
    }

    render() {
        // ZPL format: ^FOx,y^GBwidth,height,thickness,color,rounding^FS
        // ^FO - Field Origin (position)
        // ^GB - Graphic Box
        // width, height - box dimensions
        // thickness - line thickness
        // color - B (black) or W (white)
        // rounding - rounding value (optional)
        // ^FS - Field Separator
        if (this.rounding > 0) {
            return `^FO${this.x},${this.y}^GB${this.width},${this.height},${this.thickness},${this.color},${this.rounding}^FS`;
        } else {
            return `^FO${this.x},${this.y}^GB${this.width},${this.height},${this.thickness},${this.color}^FS`;
        }
    }

    renderPreview() {
        // Box has no text content, so render and renderPreview are identical
        return this.render();
    }

    getDisplayName() {
        return `Box: ${this.width}x${this.height} (${this.color === 'B' ? 'Black' : 'White'})`;
    }
}

// Text Block Element Class
class TextBlockElement extends ZPLElement {
    constructor(x = 0, y = 0, previewText = '', fontSize = 30, fontWidth = 30, blockWidth = 200, maxLines = 1, lineSpacing = 0, justification = 'L', hangingIndent = 0, placeholder = '', fontId = '') {
        super(x, y);
        this.type = 'TEXTBLOCK';
        this.previewText = previewText;
        this.placeholder = placeholder;
        this.fontId = fontId; // Element-level font override (empty = use label default)
        this.fontSize = fontSize;
        this.fontWidth = fontWidth;
        this.blockWidth = blockWidth;
        this.maxLines = maxLines;
        this.lineSpacing = lineSpacing;
        this.justification = justification;
        this.hangingIndent = hangingIndent;
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
        return `^FO${this.x},${this.y}^A${fontId}N,${this.fontSize},${this.fontWidth}^FB${this.blockWidth},${this.maxLines},${this.lineSpacing},${this.justification},${this.hangingIndent}^FD${content}^FS`;
    }

    renderPreview(defaultFontId = '0') {
        // Uses preview text for Labelary API visualization
        const fontId = this.fontId || defaultFontId;
        return `^FO${this.x},${this.y}^A${fontId}N,${this.fontSize},${this.fontWidth}^FB${this.blockWidth},${this.maxLines},${this.lineSpacing},${this.justification},${this.hangingIndent}^FD${this.previewText}^FS`;
    }

    getDisplayName() {
        const displayText = this.placeholder || this.previewText;
        return `Text Block: "${displayText.substring(0, 20)}${displayText.length > 20 ? '...' : ''}"`;
    }
}

// QR Code Element Class
class QRCodeElement extends ZPLElement {
    constructor(x = 0, y = 0, previewData = '', model = 2, magnification = 5, errorCorrection = 'Q', placeholder = '') {
        super(x, y);
        this.type = 'QRCODE';
        this.previewData = previewData;
        this.placeholder = placeholder;
        this.model = model;              // 1 = original, 2 = enhanced (recommended)
        this.magnification = magnification; // 1-10 (scaling factor)
        this.errorCorrection = errorCorrection; // H, Q, M, L (high to low)
    }

    render() {
        // ZPL format: ^FOx,y^BQN,model,magnification^FDerrorCorrection,data^FS
        // ^FO - Field Origin (position)
        // ^BQ - QR Code barcode
        //   N - orientation (normal)
        //   model - 1 or 2 (2 = enhanced, recommended)
        //   magnification - 1-10 (scaling factor, affects size)
        // ^FD - Field Data
        //   errorCorrection - H/Q/M/L (error correction level)
        //   A - automatic mode
        //   data - actual content (uses placeholder for template)
        // ^FS - Field Separator
        const content = this.placeholder ? `%${this.placeholder}%` : this.previewData;
        return `^FO${this.x},${this.y}^BQN,${this.model},${this.magnification}^FD${this.errorCorrection}A,${content}^FS`;
    }

    renderPreview() {
        // Uses preview data for Labelary API visualization
        return `^FO${this.x},${this.y}^BQN,${this.model},${this.magnification}^FD${this.errorCorrection}A,${this.previewData}^FS`;
    }

    getDisplayName() {
        const displayText = this.placeholder || this.previewData;
        return `QR Code: "${displayText.substring(0, 20)}${displayText.length > 20 ? '...' : ''}"`;
    }
}

