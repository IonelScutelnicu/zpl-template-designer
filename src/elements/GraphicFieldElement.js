import { ZPLElement } from './ZPLElement.js';
import { bytesToHex, bytesToB64WithCrc, bitmapToImageData, rotateBitmap } from '../utils/graphicField.js';

// Graphic Field Element (^GF / ^GFA)
//
// Two flavors:
// - "editable": has sourceDataUrl + bytes. Threshold/width are tunable; the
//   element re-rasterizes from the source when those change.
// - "parsed":   no sourceDataUrl, only bytes (decoded from pasted ZPL).
//   Editable=false. Width/threshold inputs disabled in the panel.
// - "opaque":   unsupported encoding (Z64, B, C, ACS hex). Stores opaqueRaw
//   verbatim and re-emits it on render(). bytes/imageData are absent.
export class GraphicFieldElement extends ZPLElement {
    constructor(x = 0, y = 0, options = {}) {
        super(x, y);
        this.type = 'GRAPHIC';

        const validOrientations = ['N', 'R', 'I', 'B'];
        const orientation = validOrientations.includes(options.orientation) ? options.orientation : 'N';

        if (options.opaqueRaw) {
            this.opaqueRaw = options.opaqueRaw;
            this.widthDots = options.widthDots || 0;
            this.heightDots = options.heightDots || 0;
            this.bytesPerRow = options.bytesPerRow || 0;
            this.encodingFormat = options.encodingFormat || 'OPAQUE';
            this.orientation = orientation;
            return;
        }

        this.sourceDataUrl = options.sourceDataUrl || null;
        this.widthDots = options.widthDots || 0;
        this.heightDots = options.heightDots || 0;
        this.bytesPerRow = options.bytesPerRow || Math.ceil(this.widthDots / 8);
        this.threshold = options.threshold ?? 128;
        this.encodingFormat = options.encodingFormat === 'B64' ? 'B64' : 'A';
        this.bytes = options.bytes || null; // Uint8Array
        this.crcWarning = options.crcWarning || false;
        this.orientation = orientation;

        // ImageData isn't always passed in (e.g. after deserialization). Build it
        // lazily from bytes when first needed via ensureImageData().
        this._imageData = options.imageData || null;

        // Transient UI state — not serialized. Re-initialized to locked on every
        // load. naturalAspectRatio is the source bitmap's height/width and is
        // used to snap height when the user re-locks after free editing.
        this.aspectLocked = true;
        this.naturalAspectRatio = options.naturalAspectRatio || null;
    }

    isOpaque() {
        return !!this.opaqueRaw;
    }

    isEditable() {
        return !this.opaqueRaw && !!this.sourceDataUrl;
    }

    /** Returns the cached ImageData, building it from bytes if needed. */
    ensureImageData() {
        if (this._imageData) return this._imageData;
        if (this.bytes && this.widthDots && this.heightDots && this.bytesPerRow) {
            this._imageData = bitmapToImageData(this.bytes, this.widthDots, this.heightDots, this.bytesPerRow);
        }
        return this._imageData;
    }

    /** Replace the raster (after re-encoding). Invalidates the cached ImageData. */
    setBitmap({ bytes, widthDots, heightDots, bytesPerRow, imageData, naturalAspectRatio }) {
        this.bytes = bytes;
        this.widthDots = widthDots;
        this.heightDots = heightDots;
        this.bytesPerRow = bytesPerRow;
        this._imageData = imageData || null;
        if (naturalAspectRatio) this.naturalAspectRatio = naturalAspectRatio;
    }

    render() {
        if (this.opaqueRaw) {
            // Re-emit verbatim. Opaque graphics can't be rotated (we don't
            // have the decoded bitmap); the orientation control is hidden
            // for them in the properties panel.
            return this.opaqueRaw.replace(/^\^FO\d+,\d+/, `^FO${this.x},${this.y}`);
        }
        if (!this.bytes || !this.bytesPerRow || !this.heightDots) {
            return '';
        }
        // Real Zebra firmware ignores ^FW for ^GF, so rotation must be baked
        // into the bitmap bytes before emitting ^GFA.
        const rotated = rotateBitmap(this.bytes, this.widthDots, this.heightDots, this.bytesPerRow, this.orientation);
        const total = rotated.bytesPerRow * rotated.heightDots;
        const fo = `^FO${this.x},${this.y}`;
        const payload = this.encodingFormat === 'B64'
            ? bytesToB64WithCrc(rotated.bytes)
            : bytesToHex(rotated.bytes);
        return `${fo}^GFA,${total},${total},${rotated.bytesPerRow},${payload}^FS`;
    }

    renderPreview() {
        return this.render();
    }

    getDisplayName() {
        if (this.opaqueRaw) return `Graphic (unsupported encoding)`;
        return `Graphic ${this.widthDots}×${this.heightDots}`;
    }

    getBounds() {
        if (this.orientation === 'R' || this.orientation === 'B') {
            return { x: this.x, y: this.y, width: this.heightDots, height: this.widthDots };
        }
        return { x: this.x, y: this.y, width: this.widthDots, height: this.heightDots };
    }

    canMatchLabelSize() { return false; }

    /**
     * JSON form. Strips the regenerable ImageData cache, and stores `bytes`
     * as a plain base64 string under `bytesB64` (default JSON encoding of
     * Uint8Array would yield an unwieldy `{0:..,1:..}` object).
     */
    toJSON() {
        const out = {};
        for (const key of Object.keys(this)) {
            if (key === '_imageData' || key === 'bytes' || key === 'aspectLocked') continue;
            out[key] = this[key];
        }
        if (this.bytes) {
            let bin = '';
            for (let i = 0; i < this.bytes.length; i++) bin += String.fromCharCode(this.bytes[i]);
            out.bytesB64 = btoa(bin);
        }
        return out;
    }
}
