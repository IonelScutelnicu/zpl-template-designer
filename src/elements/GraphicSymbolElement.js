import { ZPLElement } from './ZPLElement.js';

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

// The printer renders ^GS h/w quantized to a font magnification k of the
// 24-dot base cell: k = round(dots/24) with ties up, clamped to 1..10, per
// axis (both axes divide by 24 — the cell HEIGHT — not the 26-dot cell
// width). Effective box is 25k dots. Swept against Labelary at every step
// boundary: 26→25, 36→50, 76→75, 84→100, 90(w)→100, 228→250, 600→250.
function graphicSymbolSteps(dots) {
    return Math.min(Math.max(Math.round(dots / 24), 1), 10);
}

export function graphicSymbolEffectiveSize(dots) {
    return 25 * graphicSymbolSteps(dots);
}

// R/I/B rotate the glyph around the font's character cell, not the ^GS
// command box. Measured from Labelary I/R renders at effective sizes
// 50/150/250 (identical for all five symbols): with k quantization steps,
// the cell is (26k − 2) wide × (24k − 1) tall — slightly wider and shorter
// than the 25k command box.
export function graphicSymbolCellWidth(dots) {
    return 26 * graphicSymbolSteps(dots) - 2;
}

export function graphicSymbolCellHeight(dots) {
    return 24 * graphicSymbolSteps(dots) - 1;
}

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
        // ZPL format: ^FOx,y^FR^GSorientation,height,width^FDsymbol^FS
        const reverseCmd = this.reverse ? '^FR' : '';
        return `^FO${Math.round(this.x)},${Math.round(this.y)}${reverseCmd}^GS${this.orientation},${this.height},${this.width}^FD${this.symbol}^FS`;
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
