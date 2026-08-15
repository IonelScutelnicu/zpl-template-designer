import { ZPLElement } from './ZPLElement.js';
import { clampNumber } from '../utils/geometry.js';
import { fieldOriginCommand } from '../utils/fieldAnchor.js';

// Box Element Class
export class BoxElement extends ZPLElement {
    constructor(x = 0, y = 0, width = 100, height = 50, thickness = 3, color = 'B', rounding = 0, reverse = false) {
        super(x, y);
        this.type = 'BOX';
        // ^GB accepts w and h from the value of t up to 32000, and t from 1 to
        // 32000. A printer clamps w/h up to t, so a box smaller than its border
        // prints as a solid t x t block. Normalise here — the only chokepoint
        // both ElementService and SerializationService pass through — so state,
        // canvas and API preview always agree.
        this.thickness = clampNumber(thickness, 1, 32000);
        this.width = clampNumber(width, this.thickness, 32000);
        this.height = clampNumber(height, this.thickness, 32000);
        this.color = color;
        this.rounding = Math.max(0, Math.min(8, rounding));
        this.reverse = reverse; // ^FR (reverse print)
    }

    render() {
        // ZPL format: ^FOx,y^FR^GBwidth,height,thickness,color,rounding^FS
        // ^FR - Reverse print (optional)
        const reverseCmd = this.reverse ? '^FR' : '';
        const pos = fieldOriginCommand(this);
        if (this.rounding > 0) {
            return `${pos}${reverseCmd}^GB${this.width},${this.height},${this.thickness},${this.color},${this.rounding}^FS`;
        } else {
            return `${pos}${reverseCmd}^GB${this.width},${this.height},${this.thickness},${this.color}^FS`;
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
