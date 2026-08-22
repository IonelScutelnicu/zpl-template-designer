import { test, expect } from '../fixtures';

/**
 * The typeset cursor: `^FT` with a missing coordinate continues from where the last
 * field ended. Every expectation here is a Labelary measurement, and the three reference
 * ports disagree with it.
 */

const FONT = '^A0N,30,20';

type Parsed = {
    elements: Array<{ type: string; x: number; y: number; content?: string; positionType?: string; symbol?: string }>;
    warnings: Array<{ command: string; message: string }>;
    home: { x: number; y: number };
};

async function parse(page: import('@playwright/test').Page, zpl: string): Promise<Parsed> {
    return page.evaluate(async (source) => {
        const { ZPLParser } = await import('/src/services/ZPLParser.js');
        const result = new ZPLParser().parse(source, { dpmm: 8, labelHeight: 152 });
        return {
            elements: result.elements.map((e: any) => ({
                type: e.type,
                x: e.x,
                y: e.y,
                content: e.content,
                positionType: e.positionType,
                symbol: e.symbol,
            })),
            warnings: result.warnings.map((w: any) => ({ command: w.command, message: w.message })),
            // _flattenLabelHome folds one ^LH out of every coordinate, so a home-relative
            // assertion has to add it back to reach what the printer sees.
            home: { x: result.labelSettings.homeX, y: result.labelSettings.homeY },
        };
    }, zpl);
}

/** Advance in dots the parser measures for a run, so a chain assertion states the rule
 *  rather than a magic number. */
async function advanceOf(page: import('@playwright/test').Page, content: string, height: number, width: number) {
    return page.evaluate(async ({ content, height, width }) => {
        const { measureTextAdvanceDots } = await import('/src/utils/fontMetrics.js');
        const element = { type: 'TEXT', fontId: '0', fontSize: height, fontWidth: width, orientation: 'N', content };
        const defaults = { fontId: '0', defaultFontHeight: height, defaultFontWidth: width };
        return Math.floor(measureTextAdvanceDots(element as any, defaults as any, content) as number);
    }, { content, height, width });
}

const CHAINED = [
    '^XA',
    '^FX{"labelMeta":{"w":102,"h":152,"dpmm":8}}',
    `^FT10,200${FONT}^FDACME ^FS`,
    `^FT${FONT}^FDSummer ^FS`,
    '^FT^A0N,60,50^FDClearance ^FS',
    '^FT^A0N,120,100^FDSale ^FS',
    '^XZ',
].join('\n');

test.describe('^FT typeset cursor', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        // Every advance here is a canvas text measurement, which reads the fallback face
        // until the label fonts finish loading. Measuring across that boundary makes the
        // chained coordinates drift by a few dots.
        await page.evaluate(() => document.fonts.ready);
    });

    test('chains bare ^FT fields along one baseline', async ({ page }) => {
        const { elements } = await parse(page, CHAINED);
        expect(elements).toHaveLength(4);

        // ^FT anchors the baseline, and the chain shares it: y + capDrop is the same 200
        // for every field, whatever its font height. capDrop is floor(0.75 * height).
        const baselines = elements.map((e, i) => e.y + Math.floor(0.75 * [30, 30, 60, 120][i]));
        expect(baselines).toEqual([200, 200, 200, 200]);

        // Measured on Labelary: the printer chains this label at 10, 62, 135, 347. The
        // per-field tolerance is the gap between a canvas advance and the printer's
        // per-glyph integer metrics, which no rounding rule closes.
        const printer = [10, 62, 135, 347];
        elements.forEach((element, i) => {
            expect(Math.abs(element.x - printer[i]),
                `field ${i} at x=${element.x}, printer chains it at ${printer[i]}`).toBeLessThanOrEqual(1);
        });

        // And the chain is cumulative, not coincidence: each run starts one advance on.
        const advances = [
            await advanceOf(page, 'ACME ', 30, 20),
            await advanceOf(page, 'Summer ', 30, 20),
            await advanceOf(page, 'Clearance ', 60, 50),
        ];
        expect(elements.map(e => e.x)).toEqual([
            10,
            10 + advances[0],
            10 + advances[0] + advances[1],
            10 + advances[0] + advances[1] + advances[2],
        ]);
    });

    test('falls back per axis, not all at once', async ({ page }) => {
        // ^FT,600 keeps the explicit y and takes x from the cursor.
        const commaY = await parse(page, `^XA^FT200,300${FONT}^FDAAA^FS^FT,600${FONT}^FDHH^FS^XZ`);
        expect(commaY.elements[1].x).toBe(200 + await advanceOf(page, 'AAA', 30, 20));
        expect(commaY.elements[1].y + 22).toBe(600);

        // ^FT600 does the reverse: explicit x, cursor y.
        const onlyX = await parse(page, `^XA^FT200,300${FONT}^FDAAA^FS^FT600${FONT}^FDHH^FS^XZ`);
        expect(onlyX.elements[1].x).toBe(600);
        expect(onlyX.elements[1].y).toBe(onlyX.elements[0].y);
    });

    test('starts at 0,0 and ignores ^LH, which still applies to an explicit axis', async ({ page }) => {
        // No preceding field: the cursor is 0,0 and the home does not move it, so the
        // baseline sits at y=0 and the top-left goes negative (text clips).
        const bare = await parse(page, `^XA^FT${FONT}^FDHH^FS^XZ`);
        expect({ x: bare.elements[0].x, y: bare.elements[0].y }).toEqual({ x: 0, y: -22 });

        const homed = await parse(page, `^XA^LH50,50^FT${FONT}^FDHH^FS^XZ`);
        expect({ x: homed.elements[0].x, y: homed.elements[0].y }).toEqual({ x: 0, y: -22 });

        // The explicit axis of a partial ^FT still takes the home; the inherited one does
        // not — so the chained field prints at y=650 while the field it chains from,
        // whose own y was inherited, keeps the x the cursor already carried the home into.
        const partial = await parse(page, `^XA^LH50,50^FT200,300${FONT}^FDAAA^FS^FT,600${FONT}^FDHH^FS^XZ`);
        expect(partial.elements[1].y + partial.home.y + 22).toBe(650);
        expect(partial.elements[1].x + partial.home.x).toBe(250 + await advanceOf(page, 'AAA', 30, 20));
    });

    test('advances after ^FO text, off its baseline', async ({ page }) => {
        const { elements } = await parse(page, `^XA^FO200,600${FONT}^FDAAA^FS^FT${FONT}^FDHH^FS^XZ`);
        // ^FO's y is the top edge; the cursor it leaves is the baseline below it, so the
        // chained field lands back on the same top edge.
        expect(elements[1].y).toBe(600);
        expect(elements[1].x).toBe(200 + await advanceOf(page, 'AAA', 30, 20));
    });

    test('places bare-^FT graphic symbols from the preceding ^FO text cursor', async ({ page }) => {
        const letters = ['A', 'B', 'C', 'D', 'E'];
        const origins = [20, 80, 140, 200, 260];
        const body = letters.flatMap((letter, i) => [
            `^FO10,${origins[i]}^FD${letter}^FS`,
            `^FT^GSN^FD${letter}^FS`,
        ]).join('');
        const source = `^XA^CF0,48${body}^XZ`;
        const { elements, warnings } = await parse(page, source);

        expect(elements).toHaveLength(10);
        for (let i = 0; i < letters.length; i++) {
            const text = elements[i * 2];
            const symbol = elements[i * 2 + 1];
            expect(text).toMatchObject({ type: 'TEXT', x: 10, y: origins[i] });
            expect(symbol).toMatchObject({
                type: 'GRAPHICSYMBOL',
                x: 10 + await advanceOf(page, letters[i], 48, 0),
                y: origins[i] - 12,
                symbol: letters[i],
                positionType: 'FT',
            });
        }
        expect(warnings.filter(w => /typeset anchor is not modelled/.test(w.message))).toHaveLength(0);

        const roundTrip = await page.evaluate(async (zpl) => {
            const { ZPLParser } = await import('/src/services/ZPLParser.js');
            const { ZPLGenerator } = await import('/src/services/ZPLGenerator.js');
            const { SerializationService } = await import('/src/services/SerializationService.js');
            const parser = new ZPLParser();
            const serializer = new SerializationService();
            const first = parser.parse(zpl);
            const generated = new ZPLGenerator().generateZPL(
                first.elements.map((data: any) => serializer.createElementFromData(data)),
                first.labelSettings
            );
            const second = parser.parse(generated);
            const geometry = (result: any) => result.elements.map((e: any) => ({
                type: e.type, x: e.x, y: e.y, positionType: e.positionType,
            }));
            return { generated, before: geometry(first), after: geometry(second) };
        }, source);
        expect(roundTrip.generated).not.toContain('^FT^GS');
        expect(roundTrip.generated.match(/\^FT\d+,\d+\^GS/g)).toHaveLength(5);
        expect(roundTrip.after).toEqual(roundTrip.before);
    });

    test('advances a following bare ^FT after a graphic symbol', async ({ page }) => {
        const { elements } = await parse(
            page,
            '^XA^FT100,200^GSN,48,48^FDA^FS^FT^A0N,48,48^FDZ^FS^XZ'
        );
        expect(elements[0]).toMatchObject({ type: 'GRAPHICSYMBOL', x: 100, y: 152, positionType: 'FT' });
        // k=2 ^GS reading advance is 26k-1 = 51; the following Font 0 field
        // shares the 200-dot baseline and therefore stores y=200-floor(.75*48).
        expect(elements[1]).toMatchObject({ type: 'TEXT', x: 151, y: 164, positionType: 'FT' });
    });

    test('advances after a barcode and a box, to their right edge on the ^FT y', async ({ page }) => {
        // ^BY2 over 6 digits encodes 101 modules -> 202 dots of bars.
        const barcode = await parse(page, `^XA^FT200,700^BY2^BCN,20,N^FD123456^FS^FT${FONT}^FDHH^FS^XZ`);
        expect({ x: barcode.elements[1].x, y: barcode.elements[1].y + 22 }).toEqual({ x: 402, y: 700 });

        const box = await parse(page, `^XA^FT200,700^GB120,20,4^FS^FT${FONT}^FDHH^FS^XZ`);
        expect({ x: box.elements[1].x, y: box.elements[1].y + 22 }).toEqual({ x: 320, y: 700 });
    });

    test('advances after a block by its declared width', async ({ page }) => {
        const { elements } = await parse(page, `^XA^FT100,300^FB300,1,0,L${FONT}^FDAAA^FS^FT${FONT}^FDHH^FS^XZ`);
        expect(elements[1].x).toBe(400);
        expect(elements[1].y).toBe(elements[0].y);
    });

    test('advances rotated text along its reading axis', async ({ page }) => {
        const { elements } = await parse(page, '^XA^FT300,300^A0R,30,20^FDAAA^FS^FT^A0R,30,20^FDHH^FS^XZ');
        expect(elements[1].x).toBe(elements[0].x);
        expect(elements[1].y).toBe(300 + await advanceOf(page, 'AAA', 30, 20));
    });

    test('refuses a matrix symbol and warns instead of guessing', async ({ page }) => {
        const { warnings } = await parse(page, `^XA^FT200,700^BQN,2,5^FDQA,HELLO^FS^FT${FONT}^FDHH^FS^XZ`);
        expect(warnings.filter(w => /could not be measured/.test(w.message))).toHaveLength(1);
    });

    test('keeps the cursor unreliable for every field after an unmeasurable one', async ({ page }) => {
        // Two chained fields follow the matrix symbol; the warning is raised once but the
        // second continuation must not silently regain confidence.
        const { warnings } = await parse(
            page,
            `^XA^FT200,700^BQN,2,5^FDQA,HELLO^FS^FT${FONT}^FDHH^FS^FT${FONT}^FDII^FS^XZ`
        );
        expect(warnings.filter(w => /could not be measured/.test(w.message))).toHaveLength(1);

        // An explicit ^FT in between restores it: nothing was inherited.
        const restored = await parse(
            page,
            `^XA^FT200,700^BQN,2,5^FDQA,HELLO^FS^FT10,900${FONT}^FDHH^FS^FT${FONT}^FDII^FS^XZ`
        );
        expect(restored.elements[2].x).toBe(10 + await advanceOf(page, 'HH', 30, 20));
    });

    test('warns when placeholder content or preserved ZPL precedes a chained field', async ({ page }) => {
        const dynamic = await parse(page, `^XA^FT100,300${FONT}^FD%NAME%^FS^FT${FONT}^FDHH^FS^XZ`);
        expect(dynamic.warnings.filter(w => /could not be measured/.test(w.message))).toHaveLength(1);

        // ^JJ is unknown, so the whole group is preserved verbatim and its text still
        // moves the printer's cursor while nothing here can follow it.
        const raw = await parse(page, `^XA^FT100,300^JJ${FONT}^FDAAA^FS^FT${FONT}^FDHH^FS^XZ`);
        expect(raw.warnings.filter(w => /could not be measured/.test(w.message))).toHaveLength(1);
    });

    test('raises the structure warning once and resolves to absolute coordinates', async ({ page }) => {
        const { warnings } = await parse(page, CHAINED);
        expect(warnings.filter(w => /does not preserve the bare \^FT/.test(w.message))).toHaveLength(1);

        // Round-trip: the chain re-exports as explicit ^FT and re-imports unchanged.
        const roundTrip = await page.evaluate(async (source) => {
            const { ZPLParser } = await import('/src/services/ZPLParser.js');
            const { ZPLGenerator } = await import('/src/services/ZPLGenerator.js');
            const { SerializationService } = await import('/src/services/SerializationService.js');
            const serializer = new SerializationService();
            const first = new ZPLParser().parse(source, { dpmm: 8, labelHeight: 152 });
            const elements = first.elements.map((d: any) => serializer.createElementFromData(d));
            const zpl = new ZPLGenerator().generateZPL(elements, first.labelSettings);
            const second = new ZPLParser().parse(zpl, { dpmm: 8, labelHeight: 152 });
            return {
                zpl,
                before: first.elements.map((e: any) => ({ x: e.x, y: e.y })),
                after: second.elements.map((e: any) => ({ x: e.x, y: e.y })),
                warnings: second.warnings.map((w: any) => w.message),
            };
        }, CHAINED);

        expect(roundTrip.zpl).not.toMatch(/\^FT\^/);
        expect(roundTrip.after).toEqual(roundTrip.before);
        expect(roundTrip.warnings.filter(m => /does not preserve the bare \^FT/.test(m))).toHaveLength(0);
    });

    test('leaves an explicit ^FT untouched', async ({ page }) => {
        const { elements, warnings } = await parse(
            page,
            `^XA^FT200,300${FONT}^FDAAA^FS^FT400,500${FONT}^FDHH^FS^XZ`
        );
        expect(elements.map(e => e.x)).toEqual([200, 400]);
        expect(warnings.filter(w => w.command === '^FT')).toHaveLength(0);
    });
});
