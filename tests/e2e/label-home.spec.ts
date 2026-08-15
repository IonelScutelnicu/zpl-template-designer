import { test, expect } from '../fixtures';

// ^LH (Label Home) — sequential origin state, flattened into field coordinates.
//
// ^LH replaces the origin for every field that follows and is not retroactive,
// but this editor exposes a single global Home X/Y. Import therefore parses in
// absolute dots and folds one adopted home back out. These tests pin
// which home is adopted, that a single-^LH label is untouched, and that the
// emitted commands stay inside ZPL's coordinate range.

// The assertions are pure module logic, but the modules are ES modules served by
// the app, so the page has to be on the app origin to import them.
const parseInPage = (page: any, zpl: string) => page.evaluate(async (src: string) => {
    const { ZPLParser } = await import('/src/services/ZPLParser.js');
    const result = new ZPLParser().parse(src);
    return {
        homeX: result.labelSettings.homeX,
        homeY: result.labelSettings.homeY,
        elements: result.elements.map((e: any) => ({ type: e.type, x: e.x, y: e.y })),
        warnings: result.warnings.map((w: any) => w.message),
        // Stamps the flattening uses internally must never survive the parse.
        stamps: result.elements.flatMap((e: any) => Object.keys(e).filter(
            k => k === '_fieldHome' || k === '_rawHome')),
    };
}, zpl);

/** parse -> element instances -> generateZPL -> parse again. */
const roundTripInPage = (page: any, zpl: string, patch: Record<string, number> = {}) =>
    page.evaluate(async ({ src, settingsPatch }: any) => {
        const { ZPLParser } = await import('/src/services/ZPLParser.js');
        const { ZPLGenerator } = await import('/src/services/ZPLGenerator.js');
        const { SerializationService } = await import('/src/services/SerializationService.js');
        const parser = new ZPLParser();
        const serializer = new SerializationService();

        const first = parser.parse(src);
        const elements = first.elements.map((e: any) => serializer.createElementFromData(e, { keepId: false }));
        const settings = { ...first.labelSettings, ...settingsPatch };
        const zplOut = new ZPLGenerator().generateZPL(elements, settings);
        const second = parser.parse(zplOut);

        const coords = (r: any) => r.elements.map((e: any) => ({ type: e.type, x: e.x, y: e.y }));
        return {
            zpl: zplOut,
            before: coords(first),
            after: coords(second),
            homeBefore: [settings.homeX, settings.homeY],
            homeAfter: [second.labelSettings.homeX, second.labelSettings.homeY],
            // Every field-origin command the document emits.
            origins: zplOut.match(/\^F[OT]\d+,\d+/g) || [],
            lhCount: (zplOut.match(/\^LH/g) || []).length,
        };
    }, { src: zpl, settingsPatch: patch });

const FLATTENED = /folded into their \^FO coordinates/;
const OVERFLOW = /span more than 32000 dots/;
const RAW_LOST = /Preserved raw ZPL was written under a different/;

test.describe('^LH label home — flattening on import', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('a mid-format ^LH change moves only the fields that follow it', async ({ page }) => {
        // The document from LH_command_findings.md. Both boxes are ^FO0,0; under
        // the old last-wins model they overlapped at y=50.
        const r = await parseInPage(page, [
            '^XA',
            '^LH0,0',
            '^FO0,0^GB560,18,18,B^FS',
            '^LH0,50',
            '^FO0,0^GB560,18,18,B^FS',
            '^XZ',
        ].join('\n'));

        expect(r.elements.map(e => e.y)).toEqual([0, 50]);
        expect(r.homeY).toBe(0);
        expect(r.warnings).toContainEqual(expect.stringMatching(FLATTENED));
    });

    test('a single ^LH is adopted whole, leaving field coordinates untouched', async ({ page }) => {
        const r = await parseInPage(page, '^XA^LH20,10^FO30,40^GB10,10,1^FS^XZ');

        expect(r.elements[0]).toMatchObject({ x: 30, y: 40 });
        expect([r.homeX, r.homeY]).toEqual([20, 10]);
        expect(r.warnings).toHaveLength(0);
    });

    test('an element under a single ^LH re-emits byte-for-byte', async ({ page }) => {
        const zpl = await page.evaluate(async () => {
            const { ZPLParser } = await import('/src/services/ZPLParser.js');
            const { SerializationService } = await import('/src/services/SerializationService.js');
            const data = new ZPLParser().parse('^XA^LH20,10^FO30,40^GB300,80,2,B^FS^XZ').elements[0];
            return new SerializationService().createElementFromData(data).render();
        });

        expect(zpl).toBe('^FO30,40^GB300,80,2,B^FS');
    });

    test('a field positioned implicitly keeps the home it was written under', async ({ page }) => {
        // The first field has no ^FO at all: the parser synthesises its group at
        // the ^FS, so it must still be counted under ^LH0,0.
        const r = await parseInPage(page, [
            '^XA',
            '^LH0,0',
            '^A0N,20,20^FDfirst^FS',
            '^LH0,50',
            '^FO0,0^A0N,20,20^FDsecond^FS',
            '^XZ',
        ].join('\n'));

        expect(r.elements.map(e => e.y)).toEqual([0, 50]);
        expect(r.homeY).toBe(0);
    });

    test('a descending ^LH adopts the smaller home, so nothing goes negative', async ({ page }) => {
        const r = await parseInPage(page,
            '^XA^LH0,50^FO0,0^GB10,10,1^FS^LH0,0^FO0,0^GB10,10,1^FS^XZ');

        expect(r.homeY).toBe(0);
        expect(r.elements.map(e => e.y)).toEqual([50, 0]);
    });

    test('the adopted home rises when the smallest one would overflow a coordinate', async ({ page }) => {
        // Absolute x is 20000 and 52000. Adopting the smaller home (0) would emit
        // ^FO52000; the home has to rise to 20000 for both to fit.
        const r = await parseInPage(page,
            '^XA^LH0,0^FO20000,0^GB10,10,1^FS^LH32000,0^FO20000,0^GB10,10,1^FS^XZ');

        expect(r.homeX).toBe(20000);
        expect(r.elements.map(e => e.x)).toEqual([0, 32000]);
        expect(r.warnings).not.toContainEqual(expect.stringMatching(OVERFLOW));
    });

    test('a group that produces no element does not constrain the home', async ({ page }) => {
        // ^FO0,0^FS describes nothing, so _buildElement drops it. Counting its
        // home would drag the adopted value down and clamp the real box.
        const r = await parseInPage(page,
            '^XA^LH0,0^FO0,0^FS^LH32000,0^FO32000,0^GB1,1,1^FS^XZ');

        expect(r.elements).toHaveLength(1);
        expect(r.homeX).toBe(32000);
        expect(r.elements[0].x).toBe(32000);
        expect(r.warnings).not.toContainEqual(expect.stringMatching(OVERFLOW));
    });

    test('a group replaced before its ^FS does not constrain the home either', async ({ page }) => {
        // The second ^FO replaces the group, so the first never closes.
        const r = await parseInPage(page,
            '^XA^LH0,0^FO0,0^LH0,80^FO50,50^GB10,10,1^FS^XZ');

        expect(r.elements).toHaveLength(1);
        // Only the surviving group counts, and it opened under ^LH0,80.
        expect(r.homeY).toBe(80);
        expect(r.elements[0]).toMatchObject({ x: 50, y: 50 });
    });

    test('the bound applies to the emitted ^FT command, not the model top-left', async ({ page }) => {
        // ^FT subtracts the 10000-dot height, so the model tops are 10000 and
        // 42000 while the commands are 20000 and 52000. Bounding the model
        // values would adopt 10000 and re-emit the invalid ^FT0,42000.
        const r = await roundTripInPage(page,
            '^XA^LH0,0^FT0,20000^GB100,10000,1^FS^LH0,32000^FT0,20000^GB100,10000,1^FS^XZ');

        expect(r.homeBefore).toEqual([0, 20000]);
        expect(r.origins).toEqual(['^FT0,0', '^FT0,32000']);
        for (const origin of r.origins) {
            const [, y] = origin.match(/\^FT\d+,(\d+)/)!;
            expect(Number(y)).toBeLessThanOrEqual(32000);
        }
    });

    test('a negative model coordinate is legitimate, not an overflow', async ({ page }) => {
        // fieldOriginFloor gives text no floor, so the normalized top
        // sits above the label while the emitted ^FT stays a valid 10.
        const r = await parseInPage(page, '^XA^LH0,0^FT0,10^A0N,30,30^FDtext^FS^XZ');

        expect(r.elements[0].y).toBeLessThan(0);
        expect([r.homeX, r.homeY]).toEqual([0, 0]);
        expect(r.warnings).not.toContainEqual(expect.stringMatching(OVERFLOW));

        const trip = await roundTripInPage(page, '^XA^LH0,0^FT0,10^A0N,30,30^FDtext^FS^XZ');
        expect(trip.origins).toEqual(['^FT0,10']);
    });

    test('commands that cannot fit under one ^LH are clamped and warn', async ({ page }) => {
        // A span wider than the coordinate range: no single ^LH can hold both.
        const r = await parseInPage(page,
            '^XA^LH0,0^FO0,0^GB10,10,1^FS^LH32000,0^FO32000,0^GB10,10,1^FS^XZ');

        expect(r.homeX).toBe(0);
        expect(r.elements.map(e => e.x)).toEqual([0, 32000]);
        expect(r.warnings).toContainEqual(expect.stringMatching(OVERFLOW));
    });

    // An omitted ^LH axis keeps its current value. Measured on Labelary at
    // 8dpmm with ^LH20,10 in force: ^LH,50 renders identically to ^LH20,50,
    // ^LH60, puts the field at (60,10), a bare ^LH changes nothing, and only an
    // explicit ^LH0,50 moves the field to x=0.
    const partials: Array<{ name: string; lh: string; home: number[] }> = [
        { name: 'an omitted x keeps the current x', lh: '^LH,50', home: [20, 50] },
        { name: 'an omitted y keeps the current y', lh: '^LH60,', home: [60, 10] },
        { name: 'a single parameter leaves y alone', lh: '^LH60', home: [60, 10] },
        { name: 'a bare ^LH changes nothing', lh: '^LH', home: [20, 10] },
        { name: 'an unreadable axis keeps the current value', lh: '^LHzz,50', home: [20, 50] },
        { name: 'an explicit zero really does reset the axis', lh: '^LH0,50', home: [0, 50] },
    ];

    for (const c of partials) {
        test(c.name, async ({ page }) => {
            // Both fields sit at ^FO0,0, so each one's absolute position is the
            // home in force where it was written.
            const r = await parseInPage(page,
                `^XA^LH20,10^FO0,0^GB10,10,1^FS${c.lh}^FO0,0^GB10,10,1^FS^XZ`);

            expect(r.elements).toHaveLength(2);
            // Absolute positions = element coordinate + the adopted home.
            const absolute = r.elements.map(e => [e.x + r.homeX, e.y + r.homeY]);
            expect(absolute).toEqual([[20, 10], c.home]);
        });
    }

    test('an ^LH that governs no field is ignored', async ({ page }) => {
        const r = await parseInPage(page, '^XA^LH0,0^FO0,0^GB10,10,1^FS^LH0,99^XZ');

        expect(r.homeY).toBe(0);
        expect(r.elements[0].y).toBe(0);
    });

    test('a label with no ^LH is untouched', async ({ page }) => {
        const r = await parseInPage(page, '^XA^FO30,40^GB10,10,1^FS^XZ');

        expect([r.homeX, r.homeY]).toEqual([0, 0]);
        expect(r.elements[0]).toMatchObject({ x: 30, y: 40 });
        expect(r.warnings).toHaveLength(0);
    });

    test('a label with no field at all keeps its last ^LH', async ({ page }) => {
        const r = await parseInPage(page, '^XA^LH7,9^XZ');

        expect([r.homeX, r.homeY]).toEqual([7, 9]);
    });

    test('the ^FT anchor inversion sees the absolute coordinate', async ({ page }) => {
        // ^GB lifts by its own height (80). Under ^LH0,50 the anchor is at
        // absolute y=250, so the top-left is 170 and the adopted home is 50.
        const r = await parseInPage(page, '^XA^LH0,50^FT100,200^GB300,80,2,B^FS^XZ');

        expect(r.homeY).toBe(50);
        expect(r.elements[0]).toMatchObject({ x: 100, y: 120, type: 'BOX' });
    });

    test('no internal stamp survives the parse', async ({ page }) => {
        const r = await parseInPage(page,
            '^XA^LH0,0^FO0,0^GB10,10,1^FS^LH0,50^FO0,0^ZZ^FS^XZ');

        expect(r.stamps).toEqual([]);

        const serialized = await page.evaluate(async () => {
            const { ZPLParser } = await import('/src/services/ZPLParser.js');
            const { SerializationService } = await import('/src/services/SerializationService.js');
            const parsed = new ZPLParser().parse(
                '^XA^LH0,0^FO0,0^GB10,10,1^FS^LH0,50^FO0,0^ZZ^FS^XZ');
            const serializer = new SerializationService();
            const elements = parsed.elements.map((e: any) => serializer.createElementFromData(e, { keepId: false }));
            return JSON.stringify(serializer.serializeAppState(elements, parsed.labelSettings));
        });

        expect(serialized).not.toContain('_fieldHome');
        expect(serialized).not.toContain('_rawHome');
    });
});

test.describe('^LH label home — preserved raw ZPL', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('warns when a RAW field was written under a home the label did not adopt', async ({ page }) => {
        const r = await parseInPage(page,
            '^XA^LH0,0^FO0,0^GB1,1,1^FS^LH50,0^FO0,0^ZZ^FS^XZ');

        expect(r.warnings).toContainEqual(expect.stringMatching(RAW_LOST));
    });

    test('the RAW warning reads the home the field opened under, not the closing one', async ({ page }) => {
        // An ^LH sits between the ^FO and the ^FS, so the closing home is back at
        // 0,0 while the field was actually positioned under ^LH50,0.
        const r = await parseInPage(page, [
            '^XA',
            '^LH0,0',
            '^FO0,0^GB1,1,1^FS',
            '^LH50,0',
            '^FO0,0^ZZ',
            '^LH0,0',
            '^FS',
            '^XZ',
        ].join('\n'));

        expect(r.warnings).toContainEqual(expect.stringMatching(RAW_LOST));
    });

    test('does not warn when every RAW field shares the adopted home', async ({ page }) => {
        const r = await parseInPage(page, '^XA^LH0,0^FO0,0^ZZ^FS^FO10,10^GB1,1,1^FS^XZ');

        expect(r.warnings).not.toContainEqual(expect.stringMatching(RAW_LOST));
    });

    test('does not warn for a preserved run that has no coordinates at all', async ({ page }) => {
        // RFID commands take no ^FO and never read the label home, so the home
        // they happened to be written under is irrelevant to them.
        const r = await parseInPage(page,
            '^XA^LH0,0^FO0,0^GB1,1,1^FS^LH50,0^RFW,H,1,2,1^FD1234^FS^XZ');

        expect(r.elements.some(e => e.type === 'RAW')).toBe(true);
        expect(r.warnings).not.toContainEqual(expect.stringMatching(RAW_LOST));
    });

    test('does not warn for a span that sets its own ^LH before its ^FO', async ({ page }) => {
        // The capture starts at the buffered ^A, so it carries the ^LH that
        // positions its own ^FO. It establishes its origin itself, and the
        // generator restores the label home behind it.
        const r = await parseInPage(page,
            '^XA^LH0,0^FO0,0^GB1,1,1^FS^A0N,30,30^LH50,0^FO10,10^ZZ^FS^XZ');

        expect(r.elements.some(e => e.type === 'RAW')).toBe(true);
        expect(r.warnings).not.toContainEqual(expect.stringMatching(RAW_LOST));
    });

    test('an ^LH inside a RAW span does not offset the elements after it', async ({ page }) => {
        // The RAW is verbatim, so its ^LH stays in force on the printer. Without
        // a restore behind it the following field would be shifted twice.
        const r = await roundTripInPage(page,
            '^XA^FO10,10^ZZ^LH0,60^FS^FO20,20^GB10,10,1^FS^XZ');

        expect(r.zpl).toContain('^ZZ^LH0,60^FS^LH0,60');
        expect(r.after).toEqual(r.before);
    });

    test('the restored ^LH follows a Home X/Y edit', async ({ page }) => {
        // Baking the restore into the RAW text at import would freeze the
        // import-time home and override the header for everything downstream.
        const r = await roundTripInPage(page,
            '^XA^FO10,10^ZZ^LH0,60^FS^FO20,20^GB10,10,1^FS^XZ', { homeX: 5, homeY: 7 });

        expect(r.zpl).toContain('^ZZ^LH0,60^FS^LH5,7');
        expect(r.homeAfter).toEqual([5, 7]);
        expect(r.after).toEqual(r.before);
    });

    test('the preview path restores the home the same way', async ({ page }) => {
        const zpl = await page.evaluate(async () => {
            const { ZPLParser } = await import('/src/services/ZPLParser.js');
            const { ZPLGenerator } = await import('/src/services/ZPLGenerator.js');
            const { SerializationService } = await import('/src/services/SerializationService.js');
            const parsed = new ZPLParser().parse('^XA^FO10,10^ZZ^LH0,60^FS^FO20,20^GB10,10,1^FS^XZ');
            const serializer = new SerializationService();
            const elements = parsed.elements.map((e: any) => serializer.createElementFromData(e, { keepId: false }));
            return new ZPLGenerator().generatePreviewZPL(elements, { ...parsed.labelSettings, homeX: 5, homeY: 7 });
        });

        expect(zpl).toContain('^ZZ^LH0,60^FS^LH5,7');
    });

    test('the mapped preview path restores the home, inside the byte map', async ({ page }) => {
        // generatePreviewZPLWithMap is what the app actually sends to Labelary, so
        // a RAW ^LH that is not restored here shifts every later element in the
        // rendered preview while the ZPL Output panel looks correct.
        const result = await page.evaluate(async () => {
            const { ZPLParser } = await import('/src/services/ZPLParser.js');
            const { ZPLGenerator } = await import('/src/services/ZPLGenerator.js');
            const { SerializationService } = await import('/src/services/SerializationService.js');
            const parsed = new ZPLParser().parse('^XA^FO10,10^ZZ^LH0,60^FS^FO20,20^GB10,10,1^FS^XZ');
            const serializer = new SerializationService();
            const elements = parsed.elements.map((e: any) => serializer.createElementFromData(e, { keepId: true }));
            const settings = { ...parsed.labelSettings, homeX: 5, homeY: 7 };
            const { zpl, byteMap } = new ZPLGenerator().generatePreviewZPLWithMap(elements, settings);
            return { zpl, byteMap, plain: new ZPLGenerator().generatePreviewZPL(elements, settings) };
        });

        expect(result.zpl).toContain('^ZZ^LH0,60^FS^LH5,7');
        // Same commands as the unmapped path, which the test above pins.
        expect(result.zpl).toBe(result.plain);

        // The restored ^LH belongs to the RAW element's own span. If it were
        // appended after the byte count instead, every later entry would be short
        // by its length and warnings would resolve to the wrong element.
        const bytes = new TextEncoder().encode(result.zpl);
        const span = (index: number) => new TextDecoder().decode(
            bytes.slice(result.byteMap[index].startByte, result.byteMap[index].endByte + 1));
        expect(span(0)).toBe('^FO10,10^ZZ^LH0,60^FS^LH5,7');
        expect(span(1)).toBe('^FO20,20^GB10,10,1,B^FS');
    });

    test('a hand-authored RAW element carrying ^LH is restored too', async ({ page }) => {
        const zpl = await page.evaluate(async () => {
            const { RawElement } = await import('/src/elements/RawElement.js');
            const { BoxElement } = await import('/src/elements/BoxElement.js');
            const { ZPLGenerator } = await import('/src/services/ZPLGenerator.js');
            const raw: any = new RawElement('^LH0,40');
            const box: any = new BoxElement(20, 20, 10, 10, 1, 'B');
            return new ZPLGenerator().generateZPL([raw, box], {
                width: 100, height: 50, dpmm: 8, homeX: 5, homeY: 7,
            });
        });

        expect(zpl).toContain('^LH0,40^LH5,7');
    });
});

test.describe('^LH label home — full generator round trip', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    const cases: Array<{ name: string; zpl: string; home: number[]; origins: string[] }> = [
        {
            name: 'mid-format home change',
            zpl: '^XA^LH0,0^FO0,0^GB560,18,18,B^FS^LH0,50^FO0,0^GB560,18,18,B^FS^XZ',
            home: [0, 0],
            origins: ['^FO0,0', '^FO0,50'],
        },
        {
            name: 'implicitly positioned field',
            zpl: '^XA^LH0,0^A0N,20,20^FDfirst^FS^LH0,50^FO0,0^A0N,20,20^FDsecond^FS^XZ',
            home: [0, 0],
            origins: ['^FO0,0', '^FO0,50'],
        },
        {
            name: 'descending homes',
            zpl: '^XA^LH0,50^FO0,0^GB10,10,1^FS^LH0,0^FO0,0^GB10,10,1^FS^XZ',
            home: [0, 0],
            origins: ['^FO0,50', '^FO0,0'],
        },
        {
            name: 'home raised to keep the commands in range',
            zpl: '^XA^LH0,0^FO20000,0^GB10,10,1^FS^LH32000,0^FO20000,0^GB10,10,1^FS^XZ',
            home: [20000, 0],
            origins: ['^FO0,0', '^FO32000,0'],
        },
        {
            name: 'group that produces no element',
            zpl: '^XA^LH0,0^FO0,0^FS^LH32000,0^FO32000,0^GB1,1,1^FS^XZ',
            home: [32000, 0],
            origins: ['^FO32000,0'],
        },
    ];

    for (const c of cases) {
        test(`${c.name} survives parse -> generate -> parse`, async ({ page }) => {
            const r = await roundTripInPage(page, c.zpl);

            expect(r.homeBefore).toEqual(c.home);
            expect(r.homeAfter).toEqual(c.home);
            expect(r.after).toEqual(r.before);
            expect(r.origins).toEqual(c.origins);
            expect(r.lhCount).toBe(1);
        });
    }
});
