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
    constructor(x = 0, y = 0, text = '', fontSize = 30, fontWidth = 30) {
        super(x, y);
        this.type = 'TEXT';
        this.text = text;
        this.fontSize = fontSize;
        this.fontWidth = fontWidth;
    }

    render() {
        // ZPL format: ^FOx,y^A0N,height,width^FDtext^FS
        // ^FO - Field Origin (position)
        // ^A0N - Font specification (0 = default font, N = normal orientation)
        // ^FD - Field Data
        // ^FS - Field Separator
        return `^FO${this.x},${this.y}^A0N,${this.fontSize},${this.fontWidth}^FD${this.text}^FS`;
    }

    getDisplayName() {
        return `Text: "${this.text.substring(0, 20)}${this.text.length > 20 ? '...' : ''}"`;
    }
}

// Barcode Element Class
class BarcodeElement extends ZPLElement {
    constructor(x = 0, y = 0, data = '', height = 50, width = 2, ratio = 2.0) {
        super(x, y);
        this.type = 'BARCODE';
        this.data = data;
        this.height = height;
        this.width = width;
        this.ratio = ratio;
    }

    render() {
        // ZPL format: ^FOx,y^BYwidth,height,ratio^BCN,height^FDdata^FS
        // ^FO - Field Origin (position)
        // ^BY - Barcode field defaults (width multiplier, height ratio, ratio)
        // ^BCN - Code 128 barcode (N = normal orientation)
        // ^FD - Field Data
        // ^FS - Field Separator
        return `^FO${this.x},${this.y}^BY${this.width},${this.height},${this.ratio}^BCN,${this.height}^FD${this.data}^FS`;
    }

    getDisplayName() {
        return `Barcode: "${this.data.substring(0, 20)}${this.data.length > 20 ? '...' : ''}"`;
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

    getDisplayName() {
        return `Box: ${this.width}x${this.height} (${this.color === 'B' ? 'Black' : 'White'})`;
    }
}

// Text Block Element Class
class TextBlockElement extends ZPLElement {
    constructor(x = 0, y = 0, text = '', fontSize = 30, fontWidth = 30, blockWidth = 200, maxLines = 1, lineSpacing = 0, justification = 'L', hangingIndent = 0) {
        super(x, y);
        this.type = 'TEXTBLOCK';
        this.text = text;
        this.fontSize = fontSize;
        this.fontWidth = fontWidth;
        this.blockWidth = blockWidth;
        this.maxLines = maxLines;
        this.lineSpacing = lineSpacing;
        this.justification = justification;
        this.hangingIndent = hangingIndent;
    }

    render() {
        // ZPL format: ^FOx,y^A0N,height,width^FBa,b,c,d,e^FDtext^FS
        // ^FO - Field Origin (position)
        // ^A0N - Font specification (0 = default font, N = normal orientation)
        // ^FB - Field Block
        //   a = block width in dots
        //   b = maximum number of lines
        //   c = line spacing adjustment
        //   d = text justification (L/C/R/J)
        //   e = hanging indent in dots
        // ^FD - Field Data
        // ^FS - Field Separator
        return `^FO${this.x},${this.y}^A0N,${this.fontSize},${this.fontWidth}^FB${this.blockWidth},${this.maxLines},${this.lineSpacing},${this.justification},${this.hangingIndent}^FD${this.text}^FS`;
    }

    getDisplayName() {
        return `Text Block: "${this.text.substring(0, 20)}${this.text.length > 20 ? '...' : ''}"`;
    }
}

