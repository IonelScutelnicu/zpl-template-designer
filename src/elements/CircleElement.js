import { ZPLElement } from './ZPLElement.js';

// Circle/Ellipse Element Class
export class CircleElement extends ZPLElement {
    constructor(x = 0, y = 0, width = 80, height = 80, thickness = 3, color = 'B', reverse = false, aspectLocked = true) {
        super(x, y);
        this.type = 'CIRCLE';
        this.width = width;
        this.height = height;
        this.thickness = thickness;
        this.color = color;
        this.reverse = reverse; // ^FR (reverse print)
        // Aspect Lock: locked → Circle (^GC, width/height pinned 1:1);
        // unlocked → Ellipse (^GE, independent dimensions). See ADR 0004.
        this.aspectLocked = aspectLocked;
    }

    render() {
        // ^FR - Reverse print (optional)
        const reverseCmd = this.reverse ? '^FR' : '';
        if (this.aspectLocked) {
            // Circle: ^FOx,y^FR^GCdiameter,thickness,color^FS (width is authoritative)
            return `^FO${this.x},${this.y}${reverseCmd}^GC${this.width},${this.thickness},${this.color}^FS`;
        }
        // Ellipse: ^FOx,y^FR^GEwidth,height,thickness,color^FS
        return `^FO${this.x},${this.y}${reverseCmd}^GE${this.width},${this.height},${this.thickness},${this.color}^FS`;
    }

    renderPreview() {
        return this.render();
    }

    getDisplayName() {
        const shape = this.aspectLocked ? 'Circle' : 'Ellipse';
        return `${shape} ${this.width}x${this.height} (${this.color === 'B' ? 'Black' : 'White'})`;
    }

    getBounds() {
        return { x: this.x, y: this.y, width: this.width, height: this.height };
    }
}
