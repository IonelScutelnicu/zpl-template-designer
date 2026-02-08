import { ZPLElement } from './ZPLElement.js';

// Line Element Class
export class LineElement extends ZPLElement {
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
