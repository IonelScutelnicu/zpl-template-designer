import { ZPLElement } from './ZPLElement.js';
import { fieldOriginCommand } from '../utils/fieldAnchor.js';
import {
    graphicSymbolEffectiveSize,
    graphicSymbolCellWidth,
    graphicSymbolCellHeight,
} from '../utils/graphicSymbolGeometry.js';

export {
    graphicSymbolEffectiveSize,
    graphicSymbolCellWidth,
    graphicSymbolCellHeight,
} from '../utils/graphicSymbolGeometry.js';

// Graphic Symbol Element Class (^GS)
// Prints one of five special symbols selected via ^FD: A ® | B © | C ™ | D UL mark | E CSA mark
export const GRAPHIC_SYMBOL_LABELS = { A: '®', B: '©', C: '™', D: 'UL', E: 'CSA' };

// Fraction of the ^GS command box (h×w) that each symbol's main ink
// actually covers, measured from Labelary renders. The ® and © glyphs only
// span ~60% of the box; selection bounds and resize math use these so the
// handles wrap the visible symbol, not the command box. ™ counts just the
// letterforms: the font also prints a stray ~2×3-dot speck lower in the
// cell, dropped from the traced path — wrapping it made the selection box
// 2.3× the height of the visible ™, and drawing it looked like an artifact.
export const GRAPHIC_SYMBOL_INK_RATIOS = {
    A: { w: 0.607, h: 0.593 },
    B: { w: 0.607, h: 0.593 },
    C: { w: 0.760, h: 0.404 },
    D: { w: 0.960, h: 0.960 },
    E: { w: 0.880, h: 0.960 },
};

export class GraphicSymbolElement extends ZPLElement {
    constructor(x = 0, y = 0, symbol = 'A', height = 100, width = 100, orientation = 'N', reverse = false) {
        super(x, y);
        this.type = 'GRAPHICSYMBOL';
        this.symbol = symbol; // 'A'–'E'
        this.height = height; // dots, 1–32000
        this.width = width; // dots, 1–32000
        this.orientation = orientation; // N, R, I, B
        this.reverse = reverse; // ^FR (reverse print)
    }

    render() {
        // ZPL format: ^FO/^FTx,y^FR^GSorientation,height,width^FDsymbol^FS
        const reverseCmd = this.reverse ? '^FR' : '';
        const pos = fieldOriginCommand(this);
        return `${pos}${reverseCmd}^GS${this.orientation},${this.height},${this.width}^${this.fieldDataCommand === 'FV' ? 'FV' : 'FD'}${this.symbol}^FS`;
    }

    renderPreview() {
        return this.render();
    }

    getDisplayName() {
        return `${GRAPHIC_SYMBOL_LABELS[this.symbol] || this.symbol} ${this.height}×${this.width}`;
    }

    getBounds() {
        // Report the visible ink extent (not the full command box) so the
        // selection box and handles wrap the drawn symbol. Sizes go through
        // the quantized effective size the printer actually renders at. The
        // glyph is anchored at the field origin in its local frame; rotation
        // swings it around the font cell (see graphicSymbolCellWidth), so the
        // rotated ink hugs the far corner of the cell, not the command box.
        const ratio = GRAPHIC_SYMBOL_INK_RATIOS[this.symbol] || GRAPHIC_SYMBOL_INK_RATIOS.A;
        const inkW = Math.round(graphicSymbolEffectiveSize(this.width) * ratio.w);
        const inkH = Math.round(graphicSymbolEffectiveSize(this.height) * ratio.h);
        const cellW = graphicSymbolCellWidth(this.width);
        const cellH = graphicSymbolCellHeight(this.height);
        switch (this.orientation) {
            case 'R': // 90° CW — ink hugs the top-right corner of the rotated cell
                return { x: this.x + cellH - inkH, y: this.y, width: inkH, height: inkW };
            case 'I': // 180° — bottom-right corner
                return { x: this.x + cellW - inkW, y: this.y + cellH - inkH, width: inkW, height: inkH };
            case 'B': // 270° CW — bottom-left corner
                return { x: this.x, y: this.y + cellW - inkW, width: inkH, height: inkW };
            default: // N — top-left corner
                return { x: this.x, y: this.y, width: inkW, height: inkH };
        }
    }
}
