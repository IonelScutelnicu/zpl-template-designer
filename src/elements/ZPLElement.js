// Base Element Class
export class ZPLElement {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
        this.id = Date.now() + Math.random();
        this.locked = false;
    }

    render() {
        throw new Error('render() must be implemented by subclass');
    }

    /**
     * Whether the "Match Label Width/Height" actions apply to this element.
     * Defaults to true; types whose dimensions are derived (TEXT — auto-sized
     * to glyphs, QRCODE — square modules, GRAPHIC — external raster) override
     * to return false.
     */
    canMatchLabelSize() {
        return true;
    }

    /**
     * Whether this element occupies a position on the label. Spatial elements
     * take part in hit-testing, dragging, marquee selection, arrow-key nudging,
     * alignment and smart guides; non-spatial ones (RAW — its coordinates live
     * inside opaque text) are stack-only and must be excluded from all of them,
     * or their phantom origin distorts operations on real elements.
     */
    isSpatial() {
        return true;
    }
}
