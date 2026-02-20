import { ZPLElement } from './ZPLElement.js';

// Circle/Ellipse Element Class
export class CircleElement extends ZPLElement {
    constructor(x = 0, y = 0, width = 80, height = 80, thickness = 3, color = 'B') {
        super(x, y);
        this.type = 'CIRCLE';
        this.width = width;
        this.height = height;
        this.thickness = thickness;
        this.color = color;
    }

    render() {
        // ZPL format: ^FOx,y^GEwidth,height,thickness,color^FS
        // ^FO - Field Origin (position)
        // ^GE - Graphic Ellipse
        // width, height - ellipse dimensions
        // thickness - border thickness
        // color - B (black) or W (white)
        // ^FS - Field Separator
        return `^FO${this.x},${this.y}^GE${this.width},${this.height},${this.thickness},${this.color}^FS`;
    }

    renderPreview() {
        return this.render();
    }

    getDisplayName() {
        const shape = this.width === this.height ? 'Circle' : 'Ellipse';
        return `${shape}: ${this.width}x${this.height} (${this.color === 'B' ? 'Black' : 'White'})`;
    }

    getBounds() {
        return { x: this.x, y: this.y, width: this.width, height: this.height };
    }
}
