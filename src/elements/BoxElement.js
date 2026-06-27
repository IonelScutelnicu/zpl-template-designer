import { ZPLElement } from './ZPLElement.js';

// Box Element Class
export class BoxElement extends ZPLElement {
    constructor(x = 0, y = 0, width = 100, height = 50, thickness = 3, color = 'B', rounding = 0, reverse = false) {
        super(x, y);
        this.type = 'BOX';
        this.width = width;
        this.height = height;
        this.thickness = thickness;
        this.color = color;
        this.rounding = Math.max(0, Math.min(8, rounding));
        this.reverse = reverse; // ^FR (reverse print)
    }

    render() {
        // ZPL format: ^FOx,y^FR^GBwidth,height,thickness,color,rounding^FS
        // ^FR - Reverse print (optional)
        const reverseCmd = this.reverse ? '^FR' : '';
        if (this.rounding > 0) {
            return `^FO${this.x},${this.y}${reverseCmd}^GB${this.width},${this.height},${this.thickness},${this.color},${this.rounding}^FS`;
        } else {
            return `^FO${this.x},${this.y}${reverseCmd}^GB${this.width},${this.height},${this.thickness},${this.color}^FS`;
        }
    }

    renderPreview() {
        // Box has no text content, so render and renderPreview are identical
        return this.render();
    }

    getDisplayName() {
        return `${this.width}x${this.height} (${this.color === 'B' ? 'Black' : 'White'})`;
    }

    getBounds() {
        return { x: this.x, y: this.y, width: this.width, height: this.height };
    }
}
