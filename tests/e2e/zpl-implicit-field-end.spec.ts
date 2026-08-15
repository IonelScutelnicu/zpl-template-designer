import { test, expect } from '../fixtures';

/**
 * A field whose ^FS is missing is still ended by ^XZ.
 *
 * The printer closes the last field at the end of the label, and Labelary
 * renders such a template byte-identically with and without the final ^FS.
 * The parser used to build elements only in its ^FS branch, so the field was
 * dropped — not even kept as a RAW passthrough. The passthrough path already
 * had this covered ("a dangling run with no ^FS is still flushed",
 * raw-element.spec.ts); these guard the modelled-element path.
 */

/** Parse ZPL in-page and report element shape plus warnings. */
async function parse(page: any, zpl: string) {
    return await page.evaluate(async (src: string) => {
        const { ZPLParser } = await import('/src/services/ZPLParser.js');
        const result = new ZPLParser().parse(src, { dpmm: 8, labelHeight: 50 });
        return {
            elements: result.elements.map((e: any) => ({
                type: e.type,
                x: e.x,
                y: e.y,
                content: e.content,
                text: e.text,
                widthDots: e.widthDots,
                heightDots: e.heightDots,
            })),
            warnings: result.warnings.map((w: any) => w.command),
        };
    }, zpl);
}

test.describe('^XZ ends a field that omitted its ^FS', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('a text field is imported, not dropped', async ({ page }) => {
        const { elements, warnings } = await parse(page, '^XA^FO10,10^A0N,20,20^FDhi^XZ');
        expect(elements).toMatchObject([{ type: 'TEXT', x: 10, y: 10, content: 'hi' }]);
        expect(warnings).toEqual([]);
    });

    test('a graphic field is imported, not dropped', async ({ page }) => {
        // 2 bytes/row x 4 rows — the shape of the ^FO0,0^GFA...^XZ template that
        // exposed this: a ^GF is the one element type that carries its data in
        // the command's own params, so nothing else hints the field is open.
        const { elements, warnings } = await parse(page, '^XA^FO0,0^GFA,8,8,2,F0F0F0F0F0F0F0F0^XZ');
        expect(elements).toMatchObject([{ type: 'GRAPHIC', x: 0, y: 0, widthDots: 16, heightDots: 4 }]);
        expect(warnings).toEqual([]);
    });

    test('the ^FT anchor inversion still runs on the implicit close', async ({ page }) => {
        // ^FT is a baseline anchor: y lifts by the font height on import. The
        // close is shared with ^FS, so this must match — not land at y=200.
        const { elements } = await parse(page, '^XA^FT100,200^A0N,20,20^FDhi^XZ');
        const withFS = await parse(page, '^XA^FT100,200^A0N,20,20^FDhi^FS^XZ');
        expect(elements).toMatchObject([{ type: 'TEXT', x: 100 }]);
        expect(elements[0].y).toBeLessThan(200);
        expect(elements).toEqual(withFS.elements);
    });

    test('a preserved group stops short of the ^XZ', async ({ page }) => {
        const { elements, warnings } = await parse(page, '^XA^FO10,10^RFW,H^FDx^XZ');
        expect(elements).toMatchObject([{ type: 'RAW', text: '^FO10,10^RFW,H^FDx' }]);
        expect(warnings).toEqual(['^RF']);
    });

    test('a trailing ^FO with no field of its own produces nothing', async ({ page }) => {
        const { elements } = await parse(page, '^XA^FO10,10^A0N,20,20^FDhi^FS^FO50,50^XZ');
        expect(elements).toMatchObject([{ type: 'TEXT', x: 10, y: 10 }]);
    });

    test('a field that never positioned itself is imported, not dropped', async ({ page }) => {
        // No ^FO/^FT and no ^FS — the field is held in the pending buffer right up
        // to the ^XZ. It prints at the label home, so it has to survive the close.
        const { elements, warnings } = await parse(page, '^XA^A0N,20,20^FDhi^XZ');
        expect(elements).toMatchObject([{ type: 'TEXT', x: 0, y: 0, content: 'hi' }]);
        expect(warnings).toEqual([]);
        // The ^FS form already worked; both must land in the same place.
        const withFS = await parse(page, '^XA^A0N,20,20^FDhi^FS^XZ');
        expect(elements).toEqual(withFS.elements);
    });

    test('a trailing modal command with no data mints nothing', async ({ page }) => {
        // ^A and ^BY describe whatever field comes next. At the end of a label
        // there is none, so promoting them would invent an empty element.
        const { elements } = await parse(page, '^XA^FO10,10^A0N,20,20^FDhi^FS^A0N,40,40^XZ');
        expect(elements).toMatchObject([{ type: 'TEXT', x: 10, y: 10, content: 'hi' }]);
        const byOnly = await parse(page, '^XA^FO10,10^A0N,20,20^FDhi^FS^BY3,2,60^XZ');
        expect(byOnly.elements).toHaveLength(1);
    });
});
