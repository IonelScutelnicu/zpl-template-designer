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
    constructor(x = 0, y = 0, previewText = '', fontSize = 30, fontWidth = 30, placeholder = '', fontId = '', orientation = 'N', reverse = false) {
        super(x, y);
        this.type = 'TEXT';
        this.previewText = previewText;
        this.placeholder = placeholder;
        this.fontId = fontId; // Element-level font override (empty = use label default)
        this.fontSize = fontSize;
        this.fontWidth = fontWidth;
        this.orientation = orientation; // N, R, I, B
        this.reverse = reverse; // ^FR (reverse print)
    }

    getEstimatedWidth() {
        return Math.max(this.previewText.length * (this.fontWidth || 30) * 0.6, 50);
    }

    getEstimatedHeight() {
        return (this.fontSize || 30) + 10;
    }

    render(defaultFontId = '0') {
        const fontId = this.fontId || defaultFontId;
        const content = this.placeholder ? `%${this.placeholder}%` : this.previewText;
        const reverseCmd = this.reverse ? '^FR' : '';
        return `^FO${Math.round(this.x)},${Math.round(this.y)}${reverseCmd}^A${fontId}${this.orientation},${this.fontSize},${this.fontWidth}^FD${content}^FS`;
    }

    renderPreview(defaultFontId = '0') {
        const fontId = this.fontId || defaultFontId;
        const reverseCmd = this.reverse ? '^FR' : '';
        return `^FO${Math.round(this.x)},${Math.round(this.y)}${reverseCmd}^A${fontId}${this.orientation},${this.fontSize},${this.fontWidth}^FD${this.previewText}^FS`;
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

// Barcode Element Class
class BarcodeElement extends ZPLElement {
    constructor(x = 0, y = 0, previewData = '', height = 50, width = 2, ratio = 2.0, placeholder = '', showText = true) {
        super(x, y);
        this.type = 'BARCODE';
        this.previewData = previewData;
        this.placeholder = placeholder;
        this.height = height;
        this.width = width;
        this.ratio = ratio;
        this.showText = showText;
    }

    render() {
        // ZPL format: ^FOx,y^BYwidth,ratio^BCN,height,f^FDdata^FS
        // ^FO - Field Origin (position)
        // ^BY - Barcode field defaults (width multiplier, ratio)
        // ^BCN - Code 128 barcode (N = normal orientation)
        // h - height
        // f - print interpretation line (Y/N)
        // ^FD - Field Data (uses placeholder for template)
        // ^FS - Field Separator
        const content = this.placeholder ? `%${this.placeholder}%` : this.previewData;
        const interpretation = this.showText ? 'Y' : 'N';
        return `^FO${this.x},${this.y}^BY${this.width},${this.ratio}^BCN,${this.height},${interpretation}^FD${content}^FS`;
    }

    renderPreview() {
        // Uses preview data for Labelary API visualization
        const interpretation = this.showText ? 'Y' : 'N';
        return `^FO${this.x},${this.y}^BY${this.width},${this.ratio}^BCN,${this.height},${interpretation}^FD${this.previewData}^FS`;
    }

    getDisplayName() {
        const displayText = this.placeholder || this.previewData;
        return `Barcode: "${displayText.substring(0, 20)}${displayText.length > 20 ? '...' : ''}"`;
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

    getBounds() {
        return { x: this.x, y: this.y, width: this.width, height: this.height };
    }
}

// Text Block Element Class
class TextBlockElement extends ZPLElement {
    constructor(x = 0, y = 0, previewText = '', fontSize = 30, fontWidth = 30, blockWidth = 200, maxLines = 1, lineSpacing = 0, justification = 'L', hangingIndent = 0, placeholder = '', fontId = '', reverse = false) {
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
        return `^FO${this.x},${this.y}${reverseCmd}^A${fontId}N,${this.fontSize},${this.fontWidth}^FB${this.blockWidth},${this.maxLines},${this.lineSpacing},${this.justification},${this.hangingIndent}^FD${content}^FS`;
    }

    renderPreview(defaultFontId = '0') {
        // Uses preview text for Labelary API visualization
        const fontId = this.fontId || defaultFontId;
        const reverseCmd = this.reverse ? '^FR' : '';
        return `^FO${this.x},${this.y}${reverseCmd}^A${fontId}N,${this.fontSize},${this.fontWidth}^FB${this.blockWidth},${this.maxLines},${this.lineSpacing},${this.justification},${this.hangingIndent}^FD${this.previewText}^FS`;
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

// QR Code capacity lookup table (byte mode)
const QR_BYTE_CAPACITY = {
    1: { L: 17, M: 14, Q: 11, H: 7 },
    2: { L: 32, M: 26, Q: 20, H: 14 },
    3: { L: 53, M: 42, Q: 32, H: 24 },
    4: { L: 78, M: 62, Q: 46, H: 34 },
    5: { L: 106, M: 84, Q: 60, H: 44 },
    6: { L: 134, M: 106, Q: 74, H: 58 },
    7: { L: 154, M: 122, Q: 86, H: 64 },
    8: { L: 192, M: 152, Q: 108, H: 84 },
    9: { L: 230, M: 180, Q: 130, H: 98 },
    10: { L: 271, M: 213, Q: 151, H: 119 },
    11: { L: 321, M: 251, Q: 177, H: 137 },
    12: { L: 367, M: 287, Q: 203, H: 155 },
    13: { L: 425, M: 331, Q: 241, H: 177 },
    14: { L: 458, M: 362, Q: 258, H: 194 },
    15: { L: 520, M: 412, Q: 292, H: 220 },
    16: { L: 586, M: 450, Q: 322, H: 250 },
    17: { L: 644, M: 504, Q: 364, H: 280 },
    18: { L: 718, M: 560, Q: 394, H: 310 },
    19: { L: 792, M: 624, Q: 442, H: 338 },
    20: { L: 858, M: 666, Q: 482, H: 382 },
    21: { L: 929, M: 711, Q: 509, H: 403 },
    22: { L: 1003, M: 779, Q: 565, H: 439 },
    23: { L: 1091, M: 857, Q: 611, H: 461 },
    24: { L: 1171, M: 911, Q: 661, H: 511 },
    25: { L: 1273, M: 997, Q: 715, H: 535 },
    26: { L: 1367, M: 1059, Q: 751, H: 593 },
    27: { L: 1465, M: 1125, Q: 805, H: 625 },
    28: { L: 1528, M: 1190, Q: 868, H: 658 },
    29: { L: 1628, M: 1264, Q: 908, H: 698 },
    30: { L: 1732, M: 1370, Q: 982, H: 742 },
    31: { L: 1840, M: 1452, Q: 1030, H: 790 },
    32: { L: 1952, M: 1538, Q: 1112, H: 842 },
    33: { L: 2068, M: 1628, Q: 1168, H: 898 },
    34: { L: 2188, M: 1722, Q: 1228, H: 958 },
    35: { L: 2303, M: 1809, Q: 1283, H: 983 },
    36: { L: 2431, M: 1911, Q: 1351, H: 1051 },
    37: { L: 2563, M: 1989, Q: 1423, H: 1093 },
    38: { L: 2699, M: 2099, Q: 1499, H: 1139 },
    39: { L: 2809, M: 2213, Q: 1579, H: 1219 },
    40: { L: 2953, M: 2331, Q: 1663, H: 1273 }
};

function calculateQRVersion(dataLength, errorCorrection) {
    if (dataLength === 0) return 1;

    for (let version = 1; version <= 40; version++) {
        const capacity = QR_BYTE_CAPACITY[version]?.[errorCorrection];
        if (capacity && dataLength <= capacity) {
            return version;
        }
    }

    return 40; // Cap at maximum version
}

function qrVersionToModules(version) {
    return 21 + 4 * (version - 1);
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

    getBounds() {
        // QR code size based on data length, error correction, and magnification
        const dataLength = this.previewData.length;
        const version = calculateQRVersion(dataLength, this.errorCorrection);
        const modules = qrVersionToModules(version);
        const size = modules * this.magnification;
        return { x: this.x, y: this.y, width: size, height: size };
    }
}


// Line Element Class
class LineElement extends ZPLElement {
    constructor(x = 0, y = 0, width = 100, thickness = 3, orientation = 'H') {
        super(x, y);
        this.type = 'LINE';
        this.width = width; // Acts as length
        this.thickness = thickness;
        this.orientation = orientation; // 'H' or 'V'
    }

    render() {
        // ZPL format: ^FOx,y^GBwidth,height,thickness,color,rounding^FS
        // For horizontal line: width=length, height=thickness
        // For vertical line: width=thickness, height=length
        let w, h;
        if (this.orientation === 'V') {
            w = this.thickness;
            h = this.width;
        } else {
            w = this.width;
            h = this.thickness;
        }
        return `^FO${this.x},${this.y}^GB${w},${h},${Math.min(w, h)},B,0^FS`;
    }

    renderPreview() {
        return this.render();
    }

    getDisplayName() {
        return `Line: ${this.width}px (${this.orientation === 'H' ? 'Horiz' : 'Vert'})`;
    }

    getBounds() {
        let w, h;
        if (this.orientation === 'V') {
            w = this.thickness;
            h = this.width;
        } else {
            w = this.width;
            h = this.thickness;
        }
        return { x: this.x, y: this.y, width: w, height: h };
    }
}

