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

/**
 * The same contract mid-label: a new ^FO/^FT ends the field before it.
 *
 * The group opened by ^FO/^FT used to be overwritten by the next one, so every
 * unterminated field except the last was silently discarded. ^GF is the type
 * most exposed to it — its payload lives in its own params, so nothing else in
 * the stream hints the field is still open — but it is not ^GF-specific.
 */
test.describe('^FO/^FT ends a field that omitted its ^FS', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('a ^GF field followed by another ^FO is imported, not dropped', async ({ page }) => {
        const { elements, warnings } = await parse(
            page,
            '^XA^FO633,848^GFA,8,8,2,F0F0F0F0F0F0F0F0^FO420,1170^A0N,28,28^FDRIF: 10822^FS^XZ'
        );
        expect(elements).toMatchObject([
            { type: 'GRAPHIC', x: 633, y: 848, widthDots: 16, heightDots: 4 },
            { type: 'TEXT', x: 420, y: 1170, content: 'RIF: 10822' },
        ]);
        expect(warnings).toEqual([]);
    });

    test('a text field followed by another ^FO is imported, not dropped', async ({ page }) => {
        const { elements, warnings } = await parse(page, '^XA^FO0,0^A0N,20,20^FDone^FO20,20^A0N,20,20^FDtwo^FS^XZ');
        expect(elements).toMatchObject([
            { type: 'TEXT', x: 0, y: 0, content: 'one' },
            { type: 'TEXT', x: 20, y: 20, content: 'two' },
        ]);
        expect(warnings).toEqual([]);
        const withFS = await parse(page, '^XA^FO0,0^A0N,20,20^FDone^FS^FO20,20^A0N,20,20^FDtwo^FS^XZ');
        expect(elements).toEqual(withFS.elements);
    });

    test('back-to-back graphics with no ^FS at all both survive', async ({ page }) => {
        const { elements } = await parse(
            page,
            '^XA^FO0,0^GFA,8,8,2,F0F0F0F0F0F0F0F0^FO20,20^GFA,8,8,2,F0F0F0F0F0F0F0F0^XZ'
        );
        expect(elements).toMatchObject([
            { type: 'GRAPHIC', x: 0, y: 0 },
            { type: 'GRAPHIC', x: 20, y: 20 },
        ]);
    });

    test('a preserved group stops short of the next ^FO', async ({ page }) => {
        const { elements, warnings } = await parse(page, '^XA^FO10,10^RFW,H^FDx^FO50,50^A0N,20,20^FDhi^FS^XZ');
        expect(elements).toMatchObject([
            { type: 'RAW', text: '^FO10,10^RFW,H^FDx' },
            { type: 'TEXT', x: 50, y: 50, content: 'hi' },
        ]);
        expect(warnings).toEqual(['^RF']);
    });

    test('the ^FT anchor inversion still runs when a ^FT ends the field', async ({ page }) => {
        const { elements } = await parse(page, '^XA^FT100,200^A0N,20,20^FDhi^FT100,300^A0N,20,20^FDbye^FS^XZ');
        const withFS = await parse(page, '^XA^FT100,200^A0N,20,20^FDhi^FS^FT100,300^A0N,20,20^FDbye^FS^XZ');
        expect(elements[0].y).toBeLessThan(200);
        expect(elements).toEqual(withFS.elements);
    });

    test('the reported template round-trips with its graphic intact', async ({ page }) => {
        // The real shape that exposed this: a ^FX metadata comment, an ACS
        // run-length ^GFA with no ^FS, then a normal ^FS-terminated text field.
        const zpl = [
            '^XA',
            '^FX{"labelMeta":{"w":101.625,"h":203.25,"dpmm":8}}',
            '^FO633,848^GFA,429,429,13, ,::::J0GCL0G1G8L0G6L0I0G1GCL0G3G8L0G7L0I0G1GEL0G3GCL0GFL0I0G3GFL0G7GEK0G1GFG8K0I0G7GFL0G7GEK0G1GFGCK0I0H7G8K0GEG7K0G3GBGCK0I0GFG3G8J0G1GEG7K0G3G9GEK0H0G1GEG1GCJ0G1GCG3G8J0G7G0GEK0H0G1GCG1GEJ0G3G8G3GCJ0GFG0G7K0H0G3GCG0GEJ0G7G8G1GCJ0GEG0G7G8J0H0G3G8G0G7J0G7G0G1GEI0G1GCG0G3G8J0H0G7G8G0G7G8I0GFH0GFI0G3GCG0G3GCJ0H0G7H0G3G8H0G1GEH0G7I0G3G8G0G1GCJ0H0GEH0G3GCH0G1GCH0G7G8H0G7G8H0GEJ0G0G1GEH0G1GCH0G3GCH0G3G8H0GFI0GFJ0G0G1GCH0G1GEH0G3G8H0G3GCH0GEI0G7J0G0G3G8I0GFH0G7G8H0G1GEG0G1GEI0G3G8I0G0G7G8I0G7H0GFJ0GEG0G1GCI0G3G8I0G0G7J0G7G8G0GEJ0GFG0G3GCI0G1GCI0G0GFJ0G3GCG1GEJ0G7G0G7G8I0G1GEI0G0GEJ0G3GCG1GCJ0G3G8G7K0GEI0G1LFGEG3LFGCMFI0G3LFGEG3LFGCMFI0G3MFG7TFG8H0,:::',
            '^FO420,1170^A0N,28,28^FDRIF: 10822^FS',
            '^XZ',
        ].join('\n');

        const { elements, warnings } = await parse(page, zpl);
        expect(elements).toMatchObject([
            { type: 'GRAPHIC', x: 633, y: 848, widthDots: 104, heightDots: 33 },
            { type: 'TEXT', x: 420, y: 1170, content: 'RIF: 10822' },
        ]);
        expect(warnings).toEqual([]);

        // Re-export and re-import: the graphic must not be lost on the way out.
        const again = await page.evaluate(async (src: string) => {
            const [{ ZPLParser }, { ZPLGenerator }, { SerializationService }] = await Promise.all([
                import('/src/services/ZPLParser.js'),
                import('/src/services/ZPLGenerator.js'),
                import('/src/services/SerializationService.js'),
            ]);
            const first = new ZPLParser().parse(src, { dpmm: 8, labelHeight: 50 });
            // parse() yields plain data; the generator needs real element models.
            const svc = new SerializationService();
            const models = first.elements
                .map((d: unknown) => svc.createElementFromData(d))
                .filter((el: unknown) => el !== null);
            const out = new ZPLGenerator().generatePreviewZPL(models, first.labelSettings);
            const second = new ZPLParser().parse(out, { dpmm: 8, labelHeight: 50 });
            return {
                hasGF: /\^GF/.test(out),
                types: second.elements.map((e: any) => e.type),
            };
        }, zpl);
        expect(again.hasGF).toBe(true);
        expect(again.types).toEqual(['GRAPHIC', 'TEXT']);
    });

    test('a modal command before the ^FO mints nothing', async ({ page }) => {
        // ^BY is buffered before the ^FO and belongs to the barcode that follows,
        // so the implicit close must let it through instead of promoting it.
        const { elements } = await parse(page, '^XA^BY3,2,60^FO10,10^BCN,50,Y,N,N^FD123^FS^XZ');
        expect(elements).toMatchObject([{ type: 'BARCODE', x: 10, y: 10, content: '123' }]);
    });
});
