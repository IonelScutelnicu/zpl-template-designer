import { ZPLElement } from './ZPLElement.js';

// Raw ZPL Element (passthrough)
//
// Holds ZPL the editor can't model — RFID (^RF/^RS/^RB/^WT), printer
// configuration, vendor extensions. The parser captures the original source
// span verbatim instead of dropping it, and render() re-emits it byte for byte.
//
// It has no geometry: any coordinates live inside the opaque text, so the
// element is never drawn on the canvas and isSpatial() keeps it out of every
// hit-test, drag, align and guide calculation.
export class RawElement extends ZPLElement {
    constructor(text = '') {
        super(0, 0);
        this.type = 'RAW';
        this.text = typeof text === 'string' ? text : '';
    }

    render() {
        return this.text || '';
    }

    renderPreview() {
        return this.render();
    }

    getDisplayName() {
        const flat = (this.text || '').replace(/\s+/g, ' ').trim();
        if (!flat) return 'Empty';
        return flat.length > 40 ? `${flat.slice(0, 40)}…` : flat;
    }

    // Literal zeros, not this.x/this.y: a stray position from a hand-edited
    // JSON file or a paste offset then stays inert.
    getBounds() {
        return { x: 0, y: 0, width: 0, height: 0 };
    }

    isSpatial() {
        return false;
    }

    canMatchLabelSize() {
        return false;
    }
}
