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
}
