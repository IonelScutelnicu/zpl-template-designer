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
}
