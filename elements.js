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

