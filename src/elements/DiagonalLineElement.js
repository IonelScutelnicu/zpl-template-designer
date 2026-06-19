import { ZPLElement } from './ZPLElement.js';

// Diagonal Line Element Class
export class DiagonalLineElement extends ZPLElement {
    constructor(x = 0, y = 0, width = 100, height = 100, thickness = 3, color = 'B', orientation = 'R', reverse = false) {
        super(x, y);
        this.type = 'DIAGONALLINE';
        this.width = width; // bounding box width
        this.height = height; // bounding box height
        this.thickness = thickness;
        this.color = color; // 'B' or 'W'
        this.orientation = orientation; // 'R' (/) right-leaning or 'L' (\) left-leaning
        this.reverse = reverse; // ^FR (reverse print)
    }

    render() {
        // ZPL format: ^FOx,y^FR^GDwidth,height,thickness,color,orientation^FS
        // ^FR - Reverse print (optional)
        const reverseCmd = this.reverse ? '^FR' : '';
        return `^FO${this.x},${this.y}${reverseCmd}^GD${this.width},${this.height},${this.thickness},${this.color},${this.orientation}^FS`;
    }

    renderPreview() {
        return this.render();
    }

    getDisplayName() {
        return `${this.width}×${this.height} (${this.orientation === 'R' ? '/' : '\\'})`;
    }

    getBounds() {
        // ^GD thickens the corner-to-corner diagonal by t in the +x direction, so
        // the rendered parallelogram spans width + thickness horizontally. Report
        // that so the selection box and handles wrap the full visible shape.
        return { x: this.x, y: this.y, width: this.width + this.thickness, height: this.height };
    }
}
