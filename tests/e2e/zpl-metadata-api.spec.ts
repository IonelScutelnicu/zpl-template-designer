import { test, expect } from '../fixtures';

// Pure-logic tests of the ^FX label metadata contract: ZPLGenerator stamps
// width/height/dpmm into a JSON comment, and ZPLParser reads it back, validates
// it, and lets it override the caller-supplied options (current editor state).
test.describe('ZPL label metadata (^FX) export/import', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('export stamps width/height/dpmm into an ^FX JSON comment', async ({ page }) => {
        const meta = await page.evaluate(async () => {
            const { ZPLGenerator } = await import('/src/services/ZPLGenerator.js');
            const settings = { width: 101, height: 152.4, dpmm: 12, fontId: '0', defaultFontHeight: 20 };
            const els = [{ render: () => '^FO10,10^A0N,30,30^FDx^FS' }];
            const zpl = new (ZPLGenerator as any)().generateZPL(els, settings);
            const m = zpl.match(/\^FX(\{.*?\})\^FS/);
            return { found: !!m, json: m ? m[1] : null };
        });

        expect(meta.found).toBe(true);
        const parsed = JSON.parse(meta.json as string);
        expect(parsed.labelMeta).toEqual({ w: 101, h: 152.4, dpmm: 12 });
    });

    test('import metadata overrides wrong caller options', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const { ZPLParser } = await import('/src/services/ZPLParser.js');
            const zpl =
                '^XA\n^FX{"labelMeta":{"w":101,"h":152.4,"dpmm":12}}^FS\n^PW808\n' +
                '^FO10,10^A0N,30,30^FDx^FS\n^XZ';
            // Deliberately-wrong options (a different editor's state).
            const r = new (ZPLParser as any)().parse(zpl, { dpmm: 8, labelHeight: 50 });
            return { width: r.labelSettings.width, height: r.labelSettings.height, dpmm: r.labelSettings.dpmm, warnings: r.warnings.length };
        });

        expect(result.dpmm).toBe(12);
        expect(result.height).toBe(152.4);
        expect(result.width).toBe(101);
        expect(result.warnings).toBe(0);
    });

    test('out-of-range values are ignored and warn; settings fall back', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const { ZPLParser } = await import('/src/services/ZPLParser.js');
            const zpl =
                '^XA\n^FX{"labelMeta":{"w":9999,"h":152.4,"dpmm":99}}^FS\n^PW808\n' +
                '^FO10,10^A0N,30,30^FDx^FS\n^XZ';
            const r = new (ZPLParser as any)().parse(zpl, { dpmm: 8, labelHeight: 50 });
            return {
                width: r.labelSettings.width,
                height: r.labelSettings.height,
                dpmm: r.labelSettings.dpmm,
                warnings: r.warnings.map((w: { message: string }) => w.message),
            };
        });

        // h is valid -> applied; w and dpmm rejected -> fall back.
        expect(result.height).toBe(152.4);
        expect(result.dpmm).toBe(8);
        expect(result.width).toBe(Math.round(808 / 8)); // ^PW-derived fallback
        expect(result.warnings.some(m => /width/i.test(m))).toBe(true);
        expect(result.warnings.some(m => /dpmm/i.test(m))).toBe(true);
    });

    test('unknown keys are silently ignored (no warning)', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const { ZPLParser } = await import('/src/services/ZPLParser.js');
            const zpl =
                '^XA\n^FX{"labelMeta":{"w":101,"h":152.4,"dpmm":12,"future":42}}^FS\n^PW808\n' +
                '^FO10,10^A0N,30,30^FDx^FS\n^XZ';
            const r = new (ZPLParser as any)().parse(zpl, { dpmm: 8, labelHeight: 50 });
            return { dpmm: r.labelSettings.dpmm, warnings: r.warnings.length };
        });

        expect(result.dpmm).toBe(12);
        expect(result.warnings).toBe(0);
    });

    test('malformed / non-sentinel ^FX falls back cleanly without throwing', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const { ZPLParser } = await import('/src/services/ZPLParser.js');
            const parser = new (ZPLParser as any)();
            const base = (fx: string) =>
                `^XA\n${fx}\n^PW808\n^FO10,10^A0N,30,30^FDx^FS\n^XZ`;

            // Malformed JSON and a human-authored note: both ignored, no sentinel.
            const malformed = parser.parse(base('^FX{not json}^FS'), { dpmm: 8, labelHeight: 50 });
            const human = parser.parse(base('^FXPrinted by Acme^FS'), { dpmm: 8, labelHeight: 50 });

            return {
                malformedDpmm: malformed.labelSettings.dpmm,
                malformedHeight: malformed.labelSettings.height,
                humanDpmm: human.labelSettings.dpmm,
            };
        });

        expect(result.malformedDpmm).toBe(8);
        expect(result.malformedHeight).toBe(50);
        expect(result.humanDpmm).toBe(8);
    });

    test('^FX comment body is inert — embedded commands do not execute', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const { ZPLParser } = await import('/src/services/ZPLParser.js');
            // The comment body contains a ^PW999 that must NOT rewrite the width.
            const zpl =
                '^XA\n^PW808\n^FXnote ^PW999^FS\n^FO10,10^A0N,30,30^FDx^FS\n^XZ';
            const r = new (ZPLParser as any)().parse(zpl, { dpmm: 8, labelHeight: 50 });
            return { width: r.labelSettings.width, warnings: r.warnings.length };
        });

        // ^PW808 @ 8dpmm -> 101mm; the commented-out ^PW999 (would be 125mm) is ignored.
        expect(result.width).toBe(Math.round(808 / 8));
        expect(result.warnings).toBe(0);
    });

    test('a body ^FX comment cannot override the canonical leading metadata', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const { ZPLParser } = await import('/src/services/ZPLParser.js');
            const parser = new (ZPLParser as any)();

            // Canonical metadata in the leading slot; a stale body comment later.
            const withCanonical =
                '^XA\n^FX{"labelMeta":{"w":101,"h":152.4,"dpmm":12}}^FS\n^PW808\n' +
                '^FO10,10^A0N,30,30^FDx^FS\n' +
                '^FX{"labelMeta":{"w":50,"h":20,"dpmm":6}}^FS\n^XZ';
            const canonical = parser.parse(withCanonical, { dpmm: 8, labelHeight: 50 });

            // No leading metadata — only a body comment, which must be ignored.
            const bodyOnly =
                '^XA\n^PW808\n^FO10,10^A0N,30,30^FDx^FS\n' +
                '^FX{"labelMeta":{"w":50,"h":20,"dpmm":6}}^FS\n^XZ';
            const ignored = parser.parse(bodyOnly, { dpmm: 8, labelHeight: 50 });

            return {
                canonical: { w: canonical.labelSettings.width, h: canonical.labelSettings.height, dpmm: canonical.labelSettings.dpmm },
                ignored: { w: ignored.labelSettings.width, h: ignored.labelSettings.height, dpmm: ignored.labelSettings.dpmm },
            };
        });

        expect(result.canonical).toEqual({ w: 101, h: 152.4, dpmm: 12 });
        // Body comment ignored -> falls back to ^PW-derived width + option dpmm/height.
        expect(result.ignored).toEqual({ w: Math.round(808 / 8), h: 50, dpmm: 8 });
    });

    // ^B tokenizes as command 'B' (the digit goes into params). Only ^B0 (Aztec),
    // ^B1 (Code 11), ^B2 (Interleaved 2 of 5), ^B3 (Code 39), ^B7 (PDF417), ^B8 (EAN-8)
    // and ^B9 (UPC-E) have a dispatch branch; other numeric variants have none and are
    // dropped, so they must still surface an "Unsupported command" warning.
    test('unsupported numeric ^B variants warn; supported ones do not', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const { ZPLParser } = await import('/src/services/ZPLParser.js');
            const parser = new (ZPLParser as any)();
            const base = (bc: string) =>
                `^XA\n^PW808\n^FO10,10${bc}^FD123^FS\n^XZ`;
            const warns = (bc: string) =>
                parser.parse(base(bc), { dpmm: 8, labelHeight: 50 })
                    .warnings.some((w: { message: string }) => /Unsupported command/i.test(w.message));
            return {
                b4: warns('^B4N,50,Y,N'),     // Code 49 — unsupported
                b5: warns('^B5N,50,Y,N'),     // Planet Code — unsupported
                b1: warns('^B1N,N,50,Y,N'),   // Code 11 — supported
                b2: warns('^B2N,50,Y,N'),     // Interleaved 2 of 5 — supported
                b3: warns('^B3N,N,50,Y,N'),   // Code 39 — supported
                b7: warns('^B7N,2,50'),       // PDF417 — supported
                b8: warns('^B8N,50,Y,N'),     // EAN-8 — supported
                b9: warns('^B9N,50,Y,N'),     // UPC-E — supported
            };
        });

        expect(result.b4).toBe(true);
        expect(result.b5).toBe(true);
        expect(result.b1).toBe(false);
        expect(result.b2).toBe(false);
        expect(result.b3).toBe(false);
        expect(result.b7).toBe(false);
        expect(result.b8).toBe(false);
        expect(result.b9).toBe(false);
    });
});
