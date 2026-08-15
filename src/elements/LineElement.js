import { ZPLElement } from './ZPLElement.js';
import { clampNumber } from '../utils/geometry.js';
import { fieldOriginCommand } from '../utils/fieldAnchor.js';

// Line Element Class
export class LineElement extends ZPLElement {
    constructor(x = 0, y = 0, width = 100, thickness = 3, orientation = 'H', color = 'B', rounding = 0, reverse = false) {
        super(x, y);
        this.type = 'LINE';
        // render() forces the ^GB thickness to min(w,h), so w >= t always holds;
        // only the 1..32000 floor needs enforcing.
        this.width = clampNumber(width, 1, 32000); // Acts as length
        this.thickness = clampNumber(thickness, 1, 32000);
        this.orientation = orientation; // 'H' or 'V'
        this.color = color;
        this.rounding = Math.max(0, Math.min(8, rounding));
        this.reverse = reverse; // ^FR (reverse print)
    }

    render() {
        // ZPL format: ^FOx,y^FR^GBwidth,height,thickness,color,rounding^FS
        // ^FR - Reverse print (optional)
        let w, h;
        if (this.orientation === 'V') {
            w = this.thickness;
            h = this.width;
        } else {
            w = this.width;
            h = this.thickness;
        }
        const roundingPart = this.rounding > 0 ? `,${this.rounding}` : '';
        const reverseCmd = this.reverse ? '^FR' : '';
        const pos = fieldOriginCommand(this);
        return `${pos}${reverseCmd}^GB${w},${h},${Math.min(w, h)},${this.color}${roundingPart}^FS`;
    }

    renderPreview() {
        return this.render();
    }

    getDisplayName() {
        return `${this.width}px (${this.orientation === 'H' ? 'Horiz' : 'Vert'})`;
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
