import { test, expect } from '../fixtures';

/**
 * Coverage for ^FP (Field Parameter) — one field's print direction and its
 * additional inter-character gap.
 *
 * Before ^FP was modelled it was an unknown command, so ADR 0011's capture rule
 * turned the whole field into an opaque RAW element: invisible on the canvas,
 * un-editable, and enough to mark the typeset cursor unreliable for every
 * following bare ^FT. Most of what is asserted here is that this no longer
 * happens and that the direction survives a round trip.
 *
 * The layout the renderer draws was measured against Labelary; see the ADR.
 */

/** Parse ZPL in-page and re-render each element back to ZPL. */
async function roundTrip(page: any, zpl: string) {
    return await page.evaluate(async (src: string) => {
        const [{ ZPLParser }, { SerializationService }] = await Promise.all([
            import('/src/services/ZPLParser.js'),
            import('/src/services/SerializationService.js'),
        ]);
        const parsed = new ZPLParser().parse(src, { dpmm: 8, labelHeight: 50 });
        const serializer = new SerializationService();
        return {
            warnings: parsed.warnings.map((w: any) => w.command),
            // Read the built element, not the parsed data: an absent ^FP leaves no
            // property behind and the element's own default is what emit uses.
            elements: parsed.elements.map((e: any) => {
                const built: any = serializer.createElementFromData(e);
                return {
                    type: e.type,
                    printDirection: built?.printDirection,
                    charGap: built?.charGap,
                    zpl: built?.render(),
                };
            }),
        };
    }, zpl);
}

test.describe('^FP field parameter', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('a ^FP field is modelled as TEXT rather than preserved as RAW', async ({ page }) => {
        const { warnings, elements } = await roundTrip(page, '^XA^FO50,50^A0N,30^FPV,4^FDHELLO^FS^XZ');
        expect(warnings).toEqual([]);
        expect(elements).toHaveLength(1);
        expect(elements[0].type).toBe('TEXT');
        expect(elements[0].printDirection).toBe('V');
        expect(elements[0].charGap).toBe(4);
        expect(elements[0].zpl).toContain('^FPV,4');
    });

    test('each direction round-trips, and ^FP is emitted after ^A', async ({ page }) => {
        for (const direction of ['V', 'R']) {
            const { elements } = await roundTrip(page, `^XA^FO50,50^A0N,30^FP${direction}^FD${direction}^FS^XZ`);
            expect(elements[0].printDirection).toBe(direction);
            expect(elements[0].zpl).toContain(`^A0N,30^FP${direction},0^FD`);
        }
    });

    test('a horizontal gap round-trips', async ({ page }) => {
        const { elements } = await roundTrip(page, '^XA^FO50,50^A0N,30^FPH,20^FDGAP^FS^XZ');
        expect(elements[0].printDirection).toBe('H');
        expect(elements[0].charGap).toBe(20);
        expect(elements[0].zpl).toContain('^FPH,20');
    });

    test('^FP does not leak past ^FS', async ({ page }) => {
        const { elements } = await roundTrip(
            page,
            '^XA^FO50,50^A0N,30^FPV^FDONE^FS^FO200,50^A0N,30^FDTWO^FS^XZ'
        );
        expect(elements).toHaveLength(2);
        expect(elements[0].printDirection).toBe('V');
        expect(elements[1].printDirection).toBe('H');
        expect(elements[1].zpl).not.toContain('^FP');
    });

    test('unrecognised, empty and lowercase directions follow the printer', async ({ page }) => {
        const cases: Array<[string, string]> = [['X', 'H'], ['', 'H'], ['v', 'V'], ['r', 'R']];
        for (const [input, expected] of cases) {
            const { elements } = await roundTrip(page, `^XA^FO50,50^A0N,30^FP${input}^FDT^FS^XZ`);
            expect(elements[0].printDirection, `^FP${input}`).toBe(expected);
        }
    });

    test('a gap outside 0-9999 clamps and says so at either end', async ({ page }) => {
        for (const [input, expected] of [['-5', 0], ['10000', 9999]] as Array<[string, number]>) {
            const { warnings, elements } = await roundTrip(page, `^XA^FO50,50^A0N,30^FPH,${input}^FDT^FS^XZ`);
            expect(elements[0].charGap, input).toBe(expected);
            expect(warnings, input).toContain('^FP');
        }
    });

    test('a gap inside the range does not warn', async ({ page }) => {
        const { warnings, elements } = await roundTrip(page, '^XA^FO50,50^A0N,30^FPH,9999^FDT^FS^XZ');
        expect(elements[0].charGap).toBe(9999);
        expect(warnings).toEqual([]);
    });

    test('vertical and reverse place by grapheme cluster, horizontal by code point', async ({ page }) => {
        // 'e' + U+0301 + 'X' is three code points but two clusters. Measured on
        // Labelary: two cells stacked vertically and two positions reversed, but the
        // horizontal gap still falls between all three code points.
        const segments = await page.evaluate(async () => {
            const { segmentForDirection } = await import('/src/utils/fieldParameter.js');
            const combining = 'e\u0301X';
            return {
                H: segmentForDirection(combining, 'H').length,
                V: segmentForDirection(combining, 'V').length,
                R: segmentForDirection(combining, 'R').length,
                astral: segmentForDirection('A\u{1F600}B', 'V').length,
            };
        });
        expect(segments).toEqual({ H: 3, V: 2, R: 2, astral: 3 });
    });

    test('a reversed run bounds its own ink at every rotation', async ({ page }) => {
        // ^FPR walks back from the origin, but only on the rotations whose reading
        // axis points along a positive label axis; I and B anchor the far reading end
        // and grow forward. Getting that backwards puts the selection box, the resize
        // handles and the ^FR capture rect on the opposite side from the glyphs.
        const result = await page.evaluate(async () => {
            const [{ CanvasRenderer }, { SerializationService }] = await Promise.all([
                import('/src/canvas-renderer.js'),
                import('/src/services/SerializationService.js'),
            ]);
            const cv = document.createElement('canvas');
            cv.width = 800;
            cv.height = 400;
            const renderer = new CanvasRenderer(cv);
            renderer.scale = 1;
            renderer.homeX = 0;
            renderer.homeY = 0;
            renderer.labelTop = 0;
            const labelSettings = { fontId: 'A', defaultFontHeight: 18, dpmm: 8 };
            const ser = new SerializationService();
            const out = {};
            for (const orientation of ['N', 'R', 'I', 'B']) {
                const el = ser.createElementFromData({
                    type: 'TEXT', x: 300, y: 200, content: 'ABCD', fontSize: 18,
                    fontWidth: 10, fontId: 'A', orientation, printDirection: 'R', charGap: 0,
                });
                const b = renderer.measureTextBounds(el, labelSettings);
                const ctx = cv.getContext('2d');
                ctx.clearRect(0, 0, 800, 400);
                ctx.fillStyle = '#fff';
                ctx.fillRect(0, 0, 800, 400);
                renderer.renderers.TEXT.render(ctx, cv, el, labelSettings, { scale: 1, homeX: 0, homeY: 0, labelTop: 0 });
                const d = ctx.getImageData(0, 0, 800, 400).data;
                let x0 = 800, y0 = 400, x1 = -1, y1 = -1;
                for (let y = 0; y < 400; y++) {
                    for (let x = 0; x < 800; x++) {
                        if (d[(y * 800 + x) * 4] < 128) {
                            if (x < x0) x0 = x;
                            if (x > x1) x1 = x;
                            if (y < y0) y0 = y;
                            if (y > y1) y1 = y;
                        }
                    }
                }
                out[orientation] = x0 >= b.x - 2 && x1 <= b.x + b.width + 2
                    && y0 >= b.y - 2 && y1 <= b.y + b.height + 2;
            }
            return out;
        });
        expect(result).toEqual({ N: true, R: true, I: true, B: true });
    });

    test('centering a reversed run centres the glyphs, not the origin', async ({ page }) => {
        const offset = await page.evaluate(async () => {
            const [{ CanvasRenderer }, { SerializationService }, alignment] = await Promise.all([
                import('/src/canvas-renderer.js'),
                import('/src/services/SerializationService.js'),
                import('/src/services/AlignmentService.js'),
            ]);
            const cv = document.createElement('canvas');
            cv.width = 800;
            cv.height = 400;
            const renderer = new CanvasRenderer(cv);
            renderer.scale = 1;
            renderer.homeX = 0;
            renderer.homeY = 0;
            renderer.labelTop = 0;
            const labelSettings = { fontId: 'A', defaultFontHeight: 18, dpmm: 8, width: 100, height: 50 };
            const el = new SerializationService().createElementFromData({
                type: 'TEXT', x: 300, y: 200, content: 'ABCD', fontSize: 18,
                fontWidth: 10, fontId: 'A', orientation: 'N', printDirection: 'R', charGap: 0,
            });
            new alignment.AlignmentService().applyAlignment('center-x', el, labelSettings, renderer);
            const b = renderer.measureTextBounds(el, labelSettings);
            // The measured box, not the element origin, is what should end up centred.
            const labelWidthDots = Math.floor((100 / 25.4) * Math.floor(8 * 25.4));
            return Math.round(b.x - (labelWidthDots - b.width) / 2);
        });
        expect(Math.abs(offset)).toBeLessThanOrEqual(1);
    });

    test('a block field draws the gap and warns about the other directions', async ({ page }) => {
        const gap = await roundTrip(page, '^XA^FO50,50^A0N,30^FPH,20^FB300,2,0,L^FDBLOCK^FS^XZ');
        expect(gap.elements[0].type).toBe('FIELDBLOCK');
        expect(gap.elements[0].charGap).toBe(20);
        expect(gap.warnings).toEqual([]);

        for (const direction of ['V', 'R']) {
            const { warnings, elements } = await roundTrip(
                page,
                `^XA^FO50,50^A0N,30^FP${direction}^FB300,2,0,L^FDBLOCK^FS^XZ`
            );
            expect(elements[0].printDirection, direction).toBe(direction);
            expect(warnings, direction).toContain('^FP');
        }
    });

    test('plain horizontal text emits no ^FP at all', async ({ page }) => {
        const { elements } = await roundTrip(page, '^XA^FO50,50^A0N,30^FPH,0^FDT^FS^XZ');
        expect(elements[0].zpl).not.toContain('^FP');
    });

    test('^FP has no effect on a barcode field', async ({ page }) => {
        const { warnings, elements } = await roundTrip(page, '^XA^FO50,50^FPV,9^BY2^BCN,60,Y,N,N^FD12345^FS^XZ');
        expect(warnings).toEqual([]);
        expect(elements[0].type).toBe('BARCODE');
        expect(elements[0].zpl).not.toContain('^FP');
    });

    test('the character gap rescales with print density, as one history entry', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const [{ SerializationService }, { applyRescale }] = await Promise.all([
                import('/src/services/SerializationService.js'),
                import('/src/services/DensityRescaleService.js'),
            ]);
            const element = new SerializationService().createElementFromData({
                type: 'TEXT', x: 10, y: 10, content: 'T', fontSize: 30, charGap: 20,
            });
            applyRescale({ elements: [element], labelSettings: { fontId: 'A' }, oldDpmm: 8, newDpmm: 12 });
            return element.charGap;
        });
        expect(result).toBe(30);
    });
});
