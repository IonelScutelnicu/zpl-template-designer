import { ZPLElement } from './ZPLElement.js';

// Box Element Class
export class BoxElement extends ZPLElement {
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
