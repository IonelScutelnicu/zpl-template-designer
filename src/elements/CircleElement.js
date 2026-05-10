import { ZPLElement } from './ZPLElement.js';

// Circle/Ellipse Element Class
export class CircleElement extends ZPLElement {
    constructor(x = 0, y = 0, width = 80, height = 80, thickness = 3, color = 'B', reverse = false) {
        super(x, y);
        this.type = 'CIRCLE';
        this.width = width;
        this.height = height;
        this.thickness = thickness;
        this.color = color;
        this.reverse = reverse; // ^FR (reverse print)
    }

    render() {
        // ZPL format: ^FOx,y^FR^GEwidth,height,thickness,color^FS
        // ^FR - Reverse print (optional)
        const reverseCmd = this.reverse ? '^FR' : '';
        return `^FO${this.x},${this.y}${reverseCmd}^GE${this.width},${this.height},${this.thickness},${this.color}^FS`;
    }

    renderPreview() {
        return this.render();
    }

    getDisplayName() {
        const shape = this.width === this.height ? 'Circle' : 'Ellipse';
        return `${this.width}x${this.height} (${this.color === 'B' ? 'Black' : 'White'})`;
    }

    getBounds() {
        return { x: this.x, y: this.y, width: this.width, height: this.height };
    }
}
