import { test, expect } from '../fixtures';
import { ElementsPanel } from '../page-objects';

// ^FT (Field Typeset) — graphics families (plan_ft.md Phase 1).
//
// ^FT anchors the bottom-left corner of a graphic (bottom-right when z=1),
// where ^FO anchors the top-left. The model always stores the visual top-left;
// positionType is an emit-style flag. These tests pin both directions and the
// round-trip, which is the real regression guard.

test.describe('^FT field typeset — graphics', () => {
    // The assertions are pure module logic, but the modules are ES modules
    // served by the app, so the page has to be on the app origin to import them.
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('imports ^FT graphics at the top-left, lifted by the emitted height', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const { ZPLParser } = await import('/src/services/ZPLParser.js');
            const parser = new ZPLParser();
            const parse = (zpl: string) => parser.parse('^XA' + zpl + '^XZ');

            const box = parse('^FT100,200^GB300,80,2,B^FS');
            const ellipse = parse('^FT100,200^GE60,40,1,B^FS');
            // ^GC ignores height and draws square on the diameter.
            const circle = parse('^FT100,200^GC50,1,B^FS');
            const diagonal = parse('^FT100,200^GD70,90,3,B,R^FS');
            // ^GB whose thickness equals min(w,h) is a LINE; vertical here, so
            // the emitted extent is thickness x length.
            const vline = parse('^FT100,200^GB4,120,4,B^FS');

            return {
                box: box.elements[0],
                ellipse: ellipse.elements[0],
                circle: circle.elements[0],
                diagonal: diagonal.elements[0],
                vline: vline.elements[0],
                boxWarnings: box.warnings.map((w: any) => w.command),
            };
        });

        expect(r.box).toMatchObject({ type: 'BOX', x: 100, y: 120, positionType: 'FT' });
        expect(r.ellipse).toMatchObject({ type: 'CIRCLE', x: 100, y: 160 });
        expect(r.circle).toMatchObject({ type: 'CIRCLE', x: 100, y: 150 });
        expect(r.diagonal).toMatchObject({ type: 'DIAGONALLINE', x: 100, y: 110 });
        expect(r.vline).toMatchObject({ type: 'LINE', x: 100, y: 80 });

        // The FT->FO conversion warning must NOT fire for a family we can anchor.
        expect(r.boxWarnings).not.toContain('^FT');
    });

    test('right-justified ^FT anchors the bottom-right corner', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const { ZPLParser } = await import('/src/services/ZPLParser.js');
            const parser = new ZPLParser();
            const parse = (zpl: string) => parser.parse('^XA' + zpl + '^XZ').elements[0];
            const auto = parser.parse('^XA^FT400,200,2^GB300,80,2,B^FS^XZ');
            return {
                right: parse('^FT400,200,1^GB300,80,2,B^FS'),
                // z=2 (auto) collapses to left: no bidi support here.
                auto: auto.elements[0],
                autoWarnings: auto.warnings.map((w: any) => w.message),
            };
        });

        expect(r.right).toMatchObject({ x: 100, y: 120, positionType: 'FT', fieldJustify: 'R' });
        expect(r.auto).toMatchObject({ x: 400, y: 120, positionType: 'FT' });
        expect(r.auto.fieldJustify).toBe('L');
        // The demotion must be visible, not silent.
        expect(r.autoWarnings.join(' ')).toContain('auto justification');
    });

    test('takes the ^FW default when ^FT omits its own z', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const { ZPLParser } = await import('/src/services/ZPLParser.js');
            const { SerializationService } = await import('/src/services/SerializationService.js');
            const parser = new ZPLParser();
            const serializer = new SerializationService();
            const parse = (zpl: string) => parser.parse('^XA' + zpl + '^XZ');
            const inherited = parse('^FWN,1^FT400,200^GB300,80,2,B^FS');
            const explicitResult = parse('^FWN,1^FT400,200,0^GB300,80,2,B^FS');
            const explicit = explicitResult.elements.find((e: any) => e.type === 'BOX');
            return {
                inherited: inherited.elements.find((e: any) => e.type === 'BOX'),
                // ^FW is consumed, not preserved: both of its defaults (rotation
                // and justification) are modelled, and every element re-emits its
                // own orientation, so nothing is dropped.
                raw: inherited.elements.find((e: any) => e.type === 'RAW')?.text,
                // An explicit z on the field always wins over the ^FW default.
                explicit,
                explicitOut: serializer.createElementFromData(explicit)?.render(),
            };
        });

        expect(r.inherited).toMatchObject({ x: 100, y: 120, fieldJustify: 'R' });
        expect(r.raw).toBeUndefined();
        expect(r.explicit).toMatchObject({ x: 400, y: 120, fieldJustify: 'L' });
        expect(r.explicitOut).toContain('^FT400,200,0');
    });

    test('emits ^FT only when the element is typeset, and ^FO otherwise', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const { BoxElement } = await import('/src/elements/BoxElement.js');
            const plain: any = new BoxElement(100, 120, 300, 80, 2, 'B');
            const typeset: any = new BoxElement(100, 120, 300, 80, 2, 'B');
            typeset.positionType = 'FT';
            const justified: any = new BoxElement(100, 120, 300, 80, 2, 'B');
            justified.positionType = 'FT';
            justified.fieldJustify = 'R';
            return {
                plain: plain.render(),
                typeset: typeset.render(),
                justified: justified.render(),
            };
        });

        expect(r.plain).toContain('^FO100,120');
        expect(r.typeset).toContain('^FT100,200');
        expect(r.typeset).not.toContain('^FO');
        expect(r.justified).toContain('^FT400,200,1');
    });

    test('round-trips ^FT graphics byte-for-byte', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const { ZPLParser } = await import('/src/services/ZPLParser.js');
            const { SerializationService } = await import('/src/services/SerializationService.js');
            const parser = new ZPLParser();
            const serializer = new SerializationService();

            const sources: any[] = [
                '^FT100,200^GB300,80,2,B^FS',
                // x must leave room for the width: a z=1 anchor narrower than
                // the box is off the left edge, and import clamps that (see
                // 'clamps a graphic whose ^FT anchor lands off the top or left
                // edge'), so it re-emits at the clamped coordinate by design.
                '^FT400,200,1^GB300,80,2,B^FS',
                '^FT100,200^GE60,40,2,B^FS',
                '^FT100,200^GC50,2,B^FS',
                '^FT100,200^GD70,90,3,B,R^FS',
                '^FT100,200^GB4,120,4,B^FS',
                // ^GF: 2 bytes/row x 4 rows = 16 x 4 dots, so the anchor lifts by 4.
                // Payload only compares up to the anchor: the emitter now
                // re-encodes ^GFA with Zebra's ACS run-length compression, so
                // the bytes legitimately differ from the plain-hex source.
                { src: '^FT100,200^GFA,8,8,2,F0F0F0F0F0F0F0F0^FS', anchorOnly: true },
                // ^GF with an encoding we can't decode is stashed verbatim and
                // re-emitted with a recomputed position command.
                '^FT100,200^GFB,8,8,2,F0F0F0F0F0F0F0F0^FS',
                // ^FO must keep emitting ^FO — no silent migration.
                '^FO100,200^GB300,80,2,B^FS',
            ];

            return sources.map((entry) => {
                const src = typeof entry === 'string' ? entry : entry.src;
                const anchorOnly = typeof entry === 'string' ? false : entry.anchorOnly;
                const data = parser.parse('^XA' + src + '^XZ').elements[0];
                const element: any = serializer.createElementFromData(data);
                return { src, anchorOnly, out: element.render() };
            });
        });

        for (const { src, anchorOnly, out } of r) {
            if (anchorOnly) {
                const anchor = src.slice(0, src.indexOf('^GF'));
                expect(out.slice(0, anchor.length), `anchor round-trip of ${src}`).toBe(anchor);
            } else {
                expect(out, `round-trip of ${src}`).toBe(src);
            }
        }
    });

    // The printer does not draw a graphic above or left of the label: an anchor
    // that lands off the edge shifts the WHOLE field back onto it. Measured on
    // Labelary — ^FT50,50^GB300,200,10 prints at y 0..199, not clipped to the
    // bottom 50 dots. Import reproduces the shift so the canvas and the API
    // preview agree; the emitted anchor is then the shifted one (^FT50,200),
    // which prints identically without relying on the firmware clamp.
    test('clamps a graphic whose ^FT anchor lands off the top or left edge', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const { ZPLParser } = await import('/src/services/ZPLParser.js');
            const { SerializationService } = await import('/src/services/SerializationService.js');
            const parser = new ZPLParser();
            const serializer = new SerializationService();
            const parse = (zpl: string) => parser.parse('^XA' + zpl + '^XZ').elements[0];
            const repro: any = parse('^FT50,50^GB300,200,10,B^FS');
            return {
                repro,
                reproOut: serializer.createElementFromData(repro).render(),
                // z=1 takes the x off the left edge as well.
                bothAxes: parse('^FT100,50,1^GB300,200,10,B^FS'),
                // One dot above the edge clamps; one dot below it does not.
                justOver: parse('^FT50,199^GB300,200,10,B^FS'),
                justUnder: parse('^FT50,201^GB300,200,10,B^FS'),
                circle: parse('^FT50,20^GC200,10,B^FS'),
                // The clamp is on the resulting origin, not on ^FT: a
                // right-justified ^FO backs up past the same edge.
                foJustified: parse('^FO100,300,1^GB300,80,2,B^FS'),
            };
        });

        expect(r.repro).toMatchObject({ type: 'BOX', x: 50, y: 0, positionType: 'FT' });
        expect(r.reproOut).toContain('^FT50,200');
        expect(r.bothAxes).toMatchObject({ x: 0, y: 0 });
        expect(r.justOver.y).toBe(0);
        expect(r.justUnder.y).toBe(1);
        expect(r.circle).toMatchObject({ x: 50, y: 0 });
        expect(r.foJustified).toMatchObject({ x: 0, y: 300, fieldJustify: 'R' });
    });

    test('keeps the conversion warning for families that are not anchored yet', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const { ZPLParser } = await import('/src/services/ZPLParser.js');
            const parser = new ZPLParser();
            // ^GS is excluded from ^FT on purpose: its bounds are
            // anchor-independent, so a flip would move the print silently.
            const res = parser.parse('^XA^FT100,200^GSN,40,40^FDA^FS^XZ');
            return {
                type: res.elements[0]?.type,
                y: res.elements[0]?.y,
                positionType: res.elements[0]?.positionType,
                warnings: res.warnings.map((w: any) => w.command),
            };
        });

        expect(r.type).toBe('GRAPHICSYMBOL');
        expect(r.y).toBe(200);
        expect(r.positionType).toBeUndefined();
        expect(r.warnings).toContain('^FT');
    });
});

// Phase 2. Every constant below was measured against Labelary by
// tests/e2e/field-typeset-calibration.spec.ts — capDrop for Font 0 is
// floor(0.75 * height), ^FB adds (lines-1)*(height+spacing), and ^TB anchors
// the bottom of its declared block box outright.
test.describe('^FT field typeset — text', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('imports ^FT text at the cap top, lifted by the measured baseline drop', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const { ZPLParser } = await import('/src/services/ZPLParser.js');
            const parser = new ZPLParser();
            const parse = (zpl: string) => parser.parse('^XA' + zpl + '^XZ').elements[0];
            return {
                // Font 0 at 30 dots: floor(0.75 * 30) = 22.
                text: parse('^FT100,200^A0N,30,30^FDHello^FS'),
                // Bitmap font D: cap height 14, no cell padding.
                bitmap: parse('^FT100,200^ADN,18,10^FDHello^FS'),
                // Bitmap font E: cap height 20 plus 3 dots of cell padding.
                padded: parse('^FT100,200^AEN,28,15^FDHello^FS'),
                // ^FB: 22 + 2 * (30 + 5) = 92.
                block: parse('^FT100,200^A0N,30,30^FB300,3,5,L,0^FDHello^FS'),
                // ^TB anchors the bottom of the block box: 200 - 60.
                tb: parse('^FT100,200^A0N,30,30^TBN,300,60^FDHello^FS'),
            };
        });

        expect(r.text).toMatchObject({ type: 'TEXT', x: 100, y: 178, positionType: 'FT' });
        expect(r.bitmap).toMatchObject({ y: 186, positionType: 'FT' });
        expect(r.padded).toMatchObject({ y: 177, positionType: 'FT' });
        expect(r.block).toMatchObject({ type: 'FIELDBLOCK', y: 108, positionType: 'FT' });
        expect(r.tb).toMatchObject({ type: 'TEXTBLOCK', y: 140, positionType: 'FT' });
    });

    // Text is the family that is NOT clamped: measured on Labelary, a baseline
    // anchored near the top edge prints the glyphs clipped where they fall
    // rather than shifting the field down, and the canvas clips identically.
    test('keeps a text anchor that lands above the top edge', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const { ZPLParser } = await import('/src/services/ZPLParser.js');
            const parser = new ZPLParser();
            return parser.parse('^XA^FT50,10^A0N,50,50^FDHg^FS^XZ').elements[0];
        });

        // capDrop for Font 0 at height 50 is floor(0.75 * 50) = 37.
        expect(r).toMatchObject({ type: 'TEXT', x: 50, y: -27, positionType: 'FT' });
    });

    test('resolves the ^CF default when the element inherits its font size', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const { ZPLParser } = await import('/src/services/ZPLParser.js');
            const parser = new ZPLParser();
            // ^A matches the ^CF default, so the element stores fontSize 0 and
            // inherits 40. The anchor must resolve that, not fall back to the
            // built-in 20: floor(0.75 * 40) = 30.
            const el = parser.parse('^XA^CF0,40^FT100,200^A0N,40,40^FDHello^FS^XZ').elements[0];
            return { y: el?.y, fontSize: el?.fontSize, positionType: el?.positionType };
        });
        expect(r.fontSize).toBe(0);
        expect(r.positionType).toBe('FT');
        expect(r.y).toBe(170);
    });

    test('anchors a font-inheriting field to whatever height is emitted', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const { ZPLParser } = await import('/src/services/ZPLParser.js');
            const { SerializationService } = await import('/src/services/SerializationService.js');
            const parser = new ZPLParser();
            const serializer = new SerializationService();
            // No ^CF, and ^A matching the parser's power-up default (font A at 9),
            // so the element stores fontSize 0 and inherits. Both directions must
            // then use the SAME height or the anchor drifts silently.
            const res = parser.parse('^XA^FT100,200^AAN,9^FDX^FS^XZ');
            const data: any = res.elements[0];
            const el: any = serializer.createElementFromData(data);
            return {
                y: data.y,
                fontSize: data.fontSize,
                labelHeight: res.labelSettings.defaultFontHeight,
                // The real path: the generator always threads label settings.
                withSettings: el.render(res.labelSettings.fontId, res.labelSettings.defaultFontHeight, 0),
                // Bare defaults emit a different font, so the baseline moves too.
                bare: el.render(),
            };
        });

        expect(r.fontSize).toBe(0);
        expect(r.labelHeight).toBe(9);
        // Font A at magnification 1: cap height 7.
        expect(r.y).toBe(193);
        expect(r.withSettings).toBe('^FT100,200^AAN,9^FDX^FS');
        // At the new-label default (18 = magnification 2) the cap height is 14,
        // so the anchor follows the font rather than staying put — the anchor is
        // always consistent with the ^A actually emitted beside it.
        expect(r.bare).toBe('^FT100,207^AAN,18^FDX^FS');
    });

    test('round-trips ^FT text byte-for-byte', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const { ZPLParser } = await import('/src/services/ZPLParser.js');
            const { SerializationService } = await import('/src/services/SerializationService.js');
            const parser = new ZPLParser();
            const serializer = new SerializationService();
            const sources = [
                '^FT100,200^A0N,30,30^FDHello^FS',
                '^FT100,200^ADN,18,10^FDHello^FS',
                '^FT100,200^AEN,28,15^FDHello^FS',
                '^FT100,200^A0N,30,30^FB300,3,5,L,0^FDHello^FS',
                '^FT100,200^A0N,30,30^TBN,300,60^FDHello^FS',
                '^FO100,200^A0N,30,30^FDHello^FS',
            ];
            return sources.map((src) => {
                const data = parser.parse('^XA' + src + '^XZ').elements[0];
                const el: any = serializer.createElementFromData(data);
                return { src, out: el.render('0', 20, 0) };
            });
        });
        for (const { src, out } of r) {
            expect(out, `round-trip of ${src}`).toBe(src);
        }
    });

    test('anchors all four rotations and right-justified text', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const { ZPLParser } = await import('/src/services/ZPLParser.js');
            const { SerializationService } = await import('/src/services/SerializationService.js');
            const parser = new ZPLParser();
            const serializer = new SerializationService();
            const sources = [
                '^FT300,400^A0N,30,30^FDWidget^FS',
                '^FT300,400^A0R,30,30^FDWidget^FS',
                '^FT300,400^A0I,30,30^FDWidget^FS',
                '^FT300,400^A0B,30,30^FDWidget^FS',
                '^FT300,400,1^A0N,30,30^FDWidget^FS',
                '^FT300,400^ADI,18,10^FDHELLO^FS',
            ];
            return sources.map((src) => {
                const data = parser.parse('^XA' + src + '^XZ').elements[0];
                const el: any = serializer.createElementFromData(data);
                return { src, positionType: data?.positionType, x: data?.x, y: data?.y, out: el.render('0', 20, 0) };
            });
        });

        for (const row of r) {
            expect(row.positionType, `${row.src} anchored`).toBe('FT');
            expect(row.out, `round-trip of ${row.src}`).toBe(row.src);
        }
        const by = Object.fromEntries(r.map((x: any) => [x.src, x]));
        // capDrop 22, descender 8 at height 30 — the measured table.
        expect(by['^FT300,400^A0N,30,30^FDWidget^FS']).toMatchObject({ x: 300, y: 378 });
        expect(by['^FT300,400^A0R,30,30^FDWidget^FS']).toMatchObject({ x: 292, y: 400 });
        // I is (advance, descender) and B is (capDrop, advance) — so I's y and
        // B's x are the fixed terms; the advance-carrying axes depend on the
        // text model, and the round-trip above pins their inverse.
        expect(by['^FT300,400^A0I,30,30^FDWidget^FS'].y).toBe(392);
        expect(by['^FT300,400^A0B,30,30^FDWidget^FS'].x).toBe(278);
    });

    test('measures an escaped %% as the one percent the field data carries', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const { TextElement } = await import('/src/elements/TextElement.js');
            const mk = (content: string, extra: any) =>
                Object.assign(new TextElement(100, 100, content, 30), { positionType: 'FT' }, extra);
            const row = (extra: any) => ({
                // Content "%" and "%%" both emit ^FD% — one glyph — so they must
                // anchor alike; "%%%%" emits two and must anchor like any pair.
                onePercent: mk('%', extra).render('A', 30, 0, []),
                escapedPercent: mk('%%', extra).render('A', 30, 0, []),
                twoEscaped: mk('%%%%', extra).render('A', 30, 0, []),
                twoGlyphs: mk('AB', extra).render('A', 30, 0, []),
                preview: mk('%%%%', extra).renderPreview('A', 30, 0, {}, []),
            });
            return { inverted: row({ orientation: 'I' }), rightJustified: row({ fieldJustify: 'R' }) };
        });

        for (const [name, out] of Object.entries(r)) {
            const anchor = (zpl: string) => zpl.slice(0, zpl.indexOf('^A'));
            expect(anchor(out.escapedPercent), `${name} escaped percent`).toBe(anchor(out.onePercent));
            expect(anchor(out.twoEscaped), `${name} two escaped percents`).toBe(anchor(out.twoGlyphs));
            expect(out.preview, `${name} preview`).toBe(out.twoEscaped);
            // The pair has to differ from the single glyph, or the equalities
            // above would hold for a measurement that ignored the content.
            expect(anchor(out.twoEscaped), `${name} pair vs single`).not.toBe(anchor(out.onePercent));
        }
        expect(r.inverted.onePercent).toContain('^AAI,30^FD%^FS');
        expect(r.inverted.twoEscaped).toContain('^AAI,30^FD%%^FS');
    });

    test('measures width-dependent custom-font anchors only with the real font source', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const { TextElement } = await import('/src/elements/TextElement.js');
            const { ZPLGenerator } = await import('/src/services/ZPLGenerator.js');
            const { supportsFieldTypeset } = await import('/src/utils/fieldAnchor.js');
            const { measureTextAdvanceDots } = await import('/src/utils/fontMetrics.js');
            const { bytesToBase64, customFontFamily } = await import('/src/utils/customFonts.js');
            const buffer = await fetch('/src/fonts/VeraMono.ttf').then(res => res.arrayBuffer());
            const source = { data: bytesToBase64(new Uint8Array(buffer)), sha256: 'a'.repeat(64) };
            const font = { id: 'M', fontFile: 'E:VERA.TTF', source };
            const face = new FontFace(customFontFamily(source), buffer);
            await face.load();
            document.fonts.add(face);

            const el: any = new TextElement(100, 120, 'Custom width', 30, 0, 'M', 'I');
            el.positionType = 'FT';
            const withoutSource = el.render('0', 20, 0, []);
            const directWithSource = el.render('0', 20, 0, [font]);
            const defaults = { fontId: '0', defaultFontHeight: 20, defaultFontWidth: 0, customFonts: [font] };
            const support = supportsFieldTypeset('TEXT', el, defaults);
            const advance = measureTextAdvanceDots(el, defaults, el.content);
            const withSource = new ZPLGenerator().generateZPL([el], {
                width: 100,
                height: 50,
                dpmm: 8,
                fontId: '0',
                defaultFontHeight: 20,
                defaultFontWidth: 0,
                customFonts: [font],
            });
            return {
                withoutSource,
                directWithSource,
                withSource,
                support,
                // Rotation I anchors the far reading end, so x carries the
                // advance and y the descender space: 30 - floor(0.75 * 30).
                expected: `^FT${100 + Math.floor(advance)},128`,
            };
        });

        expect(r.withoutSource).toContain('^FO100,120');
        expect(r.support).toBe(true);
        // Pinned to the measurement, not just "some ^FT": measuring the browser
        // fallback instead of the real face still yields a number, and only the
        // coordinate tells the two apart.
        expect(r.directWithSource).toContain(r.expected);
        expect(r.withSource).toContain(r.expected);
    });

    test('refuses a width-dependent anchor for a font it cannot measure at parse time', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const { ZPLParser } = await import('/src/services/ZPLParser.js');
            // A ~DY payload has no sha256 until the async import path hashes it,
            // so during this synchronous parse the face is not registered under
            // any family the canvas can measure.
            const preamble = '~DYE:VERA,A,T,4,,DEADBEEF^CWM,E:VERA.TTF';
            const parse = (zpl: string) => new ZPLParser().parse(`^XA${preamble}${zpl}^XZ`);
            const rotated = parse('^FT300,400^AMI,30,30^FDWidget^FS');
            const upright = parse('^FT300,400^AMN,30,30^FDWidget^FS');
            const pick = (res: any) => {
                const el = res.elements.find((e: any) => e.type === 'TEXT');
                return { x: el.x, y: el.y, positionType: el.positionType };
            };
            return {
                rotated: pick(rotated),
                upright: pick(upright),
                warnings: rotated.warnings.map((w: any) => w.command),
            };
        });

        // Rotation I needs the advance width. Measuring the browser fallback
        // would give a plausible number and a wrong coordinate, so the anchor is
        // refused and the legacy ^FO conversion (plus its warning) stands.
        expect(r.rotated).toMatchObject({ x: 300, y: 400 });
        expect(r.rotated.positionType).toBeUndefined();
        expect(r.warnings).toContain('^FT');
        // Rotation N needs no width: the baseline is 0.75 * height for any
        // downloaded face, so this one still anchors.
        expect(r.upright).toMatchObject({ x: 300, y: 378, positionType: 'FT' });
    });

    // ^FT anchors the START of the reading direction, on the baseline of the
    // LAST line — so a block's extent enters N and B but cancels out of R and I,
    // where it collapses to the plain descender. The reading extent is the
    // DECLARED ^FB/^TB width, never a measurement, which is what lets blocks
    // anchor at every rotation.
    test('anchors blocks at every rotation off their declared extents', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const { ZPLParser } = await import('/src/services/ZPLParser.js');
            const parse = (zpl: string) => new ZPLParser().parse('^XA' + zpl + '^XZ');
            const out: any = {};
            for (const rot of ['N', 'R', 'I', 'B']) {
                const fb = parse(`^FT100,200^A0${rot},30,30^FB300,3,0,L,0^FDHello^FS`);
                const tb = parse(`^FT100,200^A0${rot},30,30^TB${rot},300,90^FDHello^FS`);
                out['FB' + rot] = [fb.elements[0]?.x, fb.elements[0]?.y, fb.elements[0]?.positionType, fb.warnings.length];
                out['TB' + rot] = [tb.elements[0]?.x, tb.elements[0]?.y, tb.elements[0]?.positionType, tb.warnings.length];
            }
            return out;
        });

        // h=30, 3 lines, spacing 0 => capDrop 22, blockExtent 60, linesExtent 90,
        // anchorDrop 82; reading extent is the declared ^FB width, 300.
        expect(r.FBN).toEqual([100, 200 - 82, 'FT', 0]);
        expect(r.FBR).toEqual([100 - (90 - 82), 200, 'FT', 0]);
        expect(r.FBI).toEqual([100 - 300, 200 - (90 - 82), 'FT', 0]);
        expect(r.FBB).toEqual([100 - 82, 200 - 300, 'FT', 0]);

        // ^TB anchors the declared box's bottom edge outright, so anchorDrop and
        // linesExtent coincide and R's offset falls out to zero entirely.
        expect(r.TBN).toEqual([100, 200 - 90, 'FT', 0]);
        expect(r.TBR).toEqual([100, 200, 'FT', 0]);
        expect(r.TBI).toEqual([100 - 300, 200, 'FT', 0]);
        expect(r.TBB).toEqual([100 - 90, 200 - 300, 'FT', 0]);
    });

    test('refuses right-justified blocks, keeping the warning', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const { ZPLParser } = await import('/src/services/ZPLParser.js');
            const { TextElement } = await import('/src/elements/TextElement.js');
            const justified = new ZPLParser().parse('^XA^FT100,200,1^A0N,30,30^FB300,3,0,L,0^FDHello^FS^XZ');

            // A flag that survives onto an unsupported element must not emit ^FT
            // — hand-edited JSON and older saves can carry one.
            const el: any = new TextElement(100, 178, 'Hello', 30, 30, '0', 'Q');
            el.positionType = 'FT';

            return {
                justifiedY: justified.elements[0]?.y,
                justifiedType: justified.elements[0]?.positionType,
                justifiedWarn: justified.warnings.map((w: any) => w.command),
                emitted: el.render('0', 20, 0),
            };
        });

        // z=1 moves the anchor to the far edge of the BLOCK rather than of the
        // ink, and nothing pins that — so it stays on the legacy path.
        expect(r.justifiedY).toBe(200);
        expect(r.justifiedType).toBeUndefined();
        expect(r.justifiedWarn).toContain('^FT');
        // Emit refuses too, so a stale flag can never produce an anchor we
        // cannot read back.
        expect(r.emitted).toContain('^FO100,178');
    });

    // The template that motivated rotated-block anchoring: two ^FWB ^FB blocks
    // whose raw ^FT coordinates sat hundreds of dots from where the printer puts
    // them. Kept whole because the interaction — ^FW supplying the rotation, an
    // omitted ^A height, a multi-line block and a ^FR over a ^GB bar — is what
    // made it break.
    test('anchors the ^FWB ^FB template that motivated this', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const { ZPLParser } = await import('/src/services/ZPLParser.js');
            const { SerializationService } = await import('/src/services/SerializationService.js');
            const zpl = [
                '^XA',
                '^FWB',
                '^FT839,350^A0,,42^FB348,2,10,L,^FDDHL eCommerce UK^FS',
                '^FO690,690^GB102,477,102,B^FS',
                '^FWB',
                '^FT775,1167^A0,,85^FR^FB477,1,19,C,^FDGL55 6HU^FS',
                '^XZ',
            ].join('\n');
            const parsed = new ZPLParser().parse(zpl);
            const ser = new SerializationService();
            return {
                blocks: parsed.elements
                    .filter((e: any) => e.type === 'FIELDBLOCK')
                    .map((e: any) => [e.x, e.y, e.orientation, e.fontSize, e.positionType]),
                warnings: parsed.warnings.map((w: any) => w.command),
                emitted: parsed.elements.map((d: any) =>
                    ser.createElementFromData(ser.serializeElement(d)).render('0', 30, 0)),
            };
        });

        // ^A0,,42 is height-omitted/width-42, which resolves 1:1 for a scalable
        // font. B => (anchorDrop, blockWidth): (31 + 1*(42+10), 348) and (63, 477).
        expect(r.blocks[0]).toEqual([839 - 83, 350 - 348, 'B', 42, 'FT']);
        // Lands inside the ^GB bar at x 690..792, y 690..1167 — which is what
        // makes its ^FR print white on black.
        expect(r.blocks[1]).toEqual([775 - 63, 1167 - 477, 'B', 85, 'FT']);
        expect(r.warnings).toEqual([]);
        // Both anchors survive the round trip byte for byte.
        expect(r.emitted[0]).toContain('^FT839,350');
        expect(r.emitted[2]).toContain('^FT775,1167');
    });

    test('persists positionType through serialization', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const { BoxElement } = await import('/src/elements/BoxElement.js');
            const { SerializationService } = await import('/src/services/SerializationService.js');
            const serializer = new SerializationService();
            const box: any = new BoxElement(100, 120, 300, 80, 2, 'B');
            box.positionType = 'FT';
            box.fieldJustify = 'R';
            const restored: any = serializer.createElementFromData(serializer.serializeElement(box));
            return { positionType: restored.positionType, justify: restored.fieldJustify, zpl: restored.render() };
        });

        expect(r.positionType).toBe('FT');
        expect(r.justify).toBe('R');
        expect(r.zpl).toContain('^FT400,200,1');
    });
});

// Phase 3 (1D). ^FT anchors "the base of barcode, at the left edge" (spec,
// verbatim). Measured: the drop is the ^B height whether the interpretation
// line is below, above, or absent, and the four rotations follow the clean
// rotate-about-anchor composition that text does not.
test.describe('^FT field typeset — barcodes', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('anchors the bar base and round-trips every rotation', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const { ZPLParser } = await import('/src/services/ZPLParser.js');
            const { SerializationService } = await import('/src/services/SerializationService.js');
            const parser = new ZPLParser();
            const serializer = new SerializationService();
            const sources = [
                '^FT100,300^BY2,3^BCN,100,N,N,N^FD12345^FS',
                '^FT100,300^BY2,3^BCN,100,Y,N,N^FD12345^FS',
                '^FT100,300^BY2,3^BCN,100,Y,Y,N^FD12345^FS',
                '^FT100,300^BY2,3^BCR,100,N,N,N^FD12345^FS',
                '^FT100,300^BY2,3^BCI,100,N,N,N^FD12345^FS',
                '^FT100,300^BY2,3^BCB,100,N,N,N^FD12345^FS',
                '^FT100,300^BY2,3^B3N,N,80,Y,N^FD12345^FS',
            ];
            return sources.map((src) => {
                const data = parser.parse('^XA' + src + '^XZ').elements[0];
                const el: any = serializer.createElementFromData(data);
                return { src, positionType: data?.positionType, x: data?.x, y: data?.y, out: el.render() };
            });
        });

        for (const row of r) {
            expect(row.positionType, `${row.src} anchored`).toBe('FT');
            // The barcode emitter canonicalises symbology params (^BCN,100,N,N,N
            // -> ^BCN,100,N), so compare the position command rather than the
            // whole field: that is the part ^FT owns, and it must come back
            // exactly as it went in.
            const anchor = row.src.slice(0, row.src.indexOf('^BY'));
            expect(row.out.slice(0, anchor.length), `anchor round-trip of ${row.src}`).toBe(anchor);
        }
        const by = Object.fromEntries(r.map((x: any) => [x.src, x]));
        // N lifts by the ^B height, regardless of the interpretation line.
        expect(by['^FT100,300^BY2,3^BCN,100,N,N,N^FD12345^FS']).toMatchObject({ x: 100, y: 200 });
        expect(by['^FT100,300^BY2,3^BCN,100,Y,N,N^FD12345^FS']).toMatchObject({ x: 100, y: 200 });
        expect(by['^FT100,300^BY2,3^BCN,100,Y,Y,N^FD12345^FS']).toMatchObject({ x: 100, y: 200 });
        // R is the identity cell.
        expect(by['^FT100,300^BY2,3^BCR,100,N,N,N^FD12345^FS']).toMatchObject({ x: 100, y: 300 });
        // B shifts x by the bar height.
        expect(by['^FT100,300^BY2,3^BCB,100,N,N,N^FD12345^FS'].x).toBe(0);
        // ^B3 at height 80.
        expect(by['^FT100,300^BY2,3^B3N,N,80,Y,N^FD12345^FS'].y).toBe(220);
    });

    test('anchors QR and Data Matrix at rotation N', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const { ZPLParser } = await import('/src/services/ZPLParser.js');
            const { SerializationService } = await import('/src/services/SerializationService.js');
            const parser = new ZPLParser();
            const serializer = new SerializationService();
            const sources = [
                '^FT100,300^BQN,2,4^FDQA,HELLO^FS',
                '^FT100,300^BQN,2,8^FDQA,HELLO^FS',
                '^FT100,300^BXN,6,200^FDHELLO^FS',
            ];
            return sources.map((src) => {
                const data = parser.parse('^XA' + src + '^XZ').elements[0];
                const el: any = serializer.createElementFromData(data);
                return { src, positionType: data?.positionType, y: data?.y, out: el.render() };
            });
        });
        for (const row of r) {
            expect(row.positionType, `${row.src} anchored`).toBe('FT');
            const anchor = row.src.slice(0, row.src.indexOf('^B'));
            expect(row.out.slice(0, anchor.length), `anchor round-trip of ${row.src}`).toBe(anchor);
        }
        // 21 modules at mag 4 = 84, plus 3*4 + 10 = 106.
        expect(r[0].y).toBe(300 - 106);
        // 21 modules at mag 8 = 168, plus 3*8 + 10 = 202.
        expect(r[1].y).toBe(300 - 202);
    });

    test('accounts for version growth when importing an ^FT QR code', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const { ZPLParser } = await import('/src/services/ZPLParser.js');
            const { SerializationService } = await import('/src/services/SerializationService.js');
            const parser = new ZPLParser();
            const serializer = new SerializationService();
            const zpl = [
                '^XA',
                '^FX{"labelMeta":{"w":101.625,"h":203.25,"dpmm":8}}',
                '^PW812',
                '^LH6,0',
                '^FO26,12^GB8,420,8,B^FS',
                '^FO26,430^GB630,8,8,B^FS',
                '^FT34,500^BQN,2,10^FH^FDQA,HM,B002012345678901234567890^FS',
                '^XZ',
            ].join('\n');
            const data: any = parser.parse(zpl).elements.find((element: any) => element.type === 'QRCODE');
            const element: any = serializer.createElementFromData(data);
            const bounds = element.getBounds(8);
            return {
                y: data.y,
                bottom: bounds.y + bounds.height,
                zpl: element.render(),
            };
        });

        // Version 2 is 25 modules. Its ^FT lift is 7 modules rather than the
        // version-1 lift of 3, putting the QR bottom on the y=430 rule.
        expect(r.y).toBe(170);
        expect(r.bottom).toBe(430);
        expect(r.zpl).toContain('^FT34,500');
    });

    // Same off-label shift as the graphics, with two measured differences: a
    // linear barcode clamps its base but CLIPS on x (rotation I keeps its
    // negative left edge), and a QR clamps the origin it has before the
    // version-dependent ^FT lift and the 10-dot ^FO bias — so its floor is that far
    // above 0, not 0. Data Matrix has neither term and clamps outright.
    test('clamps a barcode or matrix symbol anchored off the top edge', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const { ZPLParser } = await import('/src/services/ZPLParser.js');
            const parser = new ZPLParser();
            const parse = (zpl: string) => parser.parse('^XA' + zpl + '^XZ').elements[0];
            return {
                linear: parse('^FT50,20^BY2,3^BCN,100,N,N,N^FD12345^FS'),
                // Rotation I takes x negative, which the printer clips.
                clippedX: parse('^FT100,300^BY2,3^BCI,100,N,N,N^FD12345^FS'),
                qr: parse('^FT50,60^BQN,2,5^FDQA,HELLO^FS'),
                dataMatrix: parse('^FT50,20^BXN,5,200^FDHELLO^FS'),
            };
        });

        expect(r.linear).toMatchObject({ x: 50, y: 0 });
        expect(r.clippedX.x).toBeLessThan(0);
        // 3 * 5 + 10: the lift and the bias the clamp happens above.
        expect(r.qr.y).toBe(-25);
        expect(r.dataMatrix.y).toBe(0);
    });

    test('refuses the combinations that are not measured', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const { ZPLParser } = await import('/src/services/ZPLParser.js');
            const parser = new ZPLParser();
            const parse = (zpl: string) => parser.parse('^XA' + zpl + '^XZ').elements[0];
            return {
                // Rotation + right-justify for text: measured for N only.
                rotJustifiedText: parse('^FT100,200,1^A0R,30,30^FDHello^FS'),
                // Right-justified barcode: not measured.
                justifiedBarcode: parse('^FT100,300,1^BY2,3^BCN,100,N,N,N^FD12345^FS'),
                // A rotated matrix symbol is its own case. ^BQ's orientation
                // slot is normal-only per Zebra, so this uses ^BX, which has a
                // real one.
                rotatedMatrix: parse('^FT100,300^BXR,6,200^FDHELLO^FS'),
                // A 2D symbology with no measurement at all.
                pdf417: parse('^FT100,300^B7N,2,10,5,20,N^FDHELLO^FS'),
                // These anchors depend on the runtime value, while exported
                // ZPL preserves the placeholder for a downstream template
                // engine that cannot also rewrite the coordinate.
                dynamicText: parse('^FT100,300^A0I,30,30^FD%value%^FS'),
                dynamicBarcode: parse('^FT100,300^BY2,3^BCI,100,N,N,N^FD%code%^FS'),
                dynamicQr: parse('^FT100,300^BQN,2,5^FDQA,%code%^FS'),
                safeDynamicBarcode: parse('^FT100,300^BY2,3^BCN,100,N,N,N^FD%code%^FS'),
            };
        });
        expect(r.rotJustifiedText.positionType).toBeUndefined();
        expect(r.rotJustifiedText.y).toBe(200);
        expect(r.justifiedBarcode.positionType).toBeUndefined();
        expect(r.pdf417.positionType).toBeUndefined();
        expect(r.rotatedMatrix.positionType).toBeUndefined();
        expect(r.rotatedMatrix.y).toBe(300);
        expect(r.dynamicText.positionType).toBeUndefined();
        expect(r.dynamicBarcode.positionType).toBeUndefined();
        expect(r.dynamicQr.positionType).toBeUndefined();
        expect(r.safeDynamicBarcode.positionType).toBe('FT');
    });
});

// Phase 5. The toggle is a pure emit-style switch: x/y always mean the visual
// top-left, so flipping it moves nothing and prints in the same place — only
// the coordinate written into the ZPL changes.
test.describe('^FT field typeset — properties panel', () => {
    test('toggles the anchor without moving the element', async ({ page }) => {
        await page.goto('/?e2e=1');
        const panel = new ElementsPanel(page);
        await panel.addBoxElement();

        const zplOut = () => page.evaluate(
            () => document.getElementById('zpl-output-highlight')?.textContent || '');
        const state = () => page.evaluate(() => {
            const el = (window as any).appState.elements[0];
            return { x: el.x, y: el.y, positionType: el.positionType };
        });

        await expect(page.locator('[data-position-type="FT"]')).toBeVisible();
        const before = await state();
        expect(before.positionType).toBeUndefined();
        expect(await zplOut()).toContain('^FO');

        await page.locator('[data-position-type="FT"]').click();
        const after = await state();
        // The model must not move — only the emitted anchor changes.
        expect(after.x).toBe(before.x);
        expect(after.y).toBe(before.y);
        expect(after.positionType).toBe('FT');
        expect(await zplOut()).toContain('^FT');

        await page.locator('[data-position-type="FO"]').click();
        const back = await state();
        expect(back.positionType).toBeUndefined();
        expect(back.y).toBe(before.y);
        expect(await zplOut()).toContain('^FO');
    });

    test('hides the toggle for types whose ^FT anchor is not modelled', async ({ page }) => {
        await page.goto('/?e2e=1');
        const panel = new ElementsPanel(page);
        await panel.addGraphicSymbolElement();
        await expect(page.locator('[data-position-type]')).toHaveCount(0);
    });

    test('hides and restores the toggle without losing the ^FT choice', async ({ page }) => {
        await page.goto('/?e2e=1');
        const panel = new ElementsPanel(page);
        await panel.addTextElement();

        const state = () => page.evaluate(() => {
            const el = (window as any).appState.elements[0];
            return { positionType: el.positionType, zpl: el.render() };
        });

        // A placeholder is fine at N, whose anchor needs no advance width.
        await page.locator('#prop-content').fill('%sku%');
        await page.locator('[data-position-type="FT"]').click();
        await expect(page.locator('[data-position-type="FT"]')).toHaveAttribute('aria-pressed', 'true');
        expect((await state()).zpl).toContain('^FT');

        // Scoped to the panel: the label's own ^PO control shares the attribute.
        const orientation = (value: string) =>
            page.locator(`#properties-panel [data-orientation="${value}"]`);

        // Rotation I anchors the far end of the advance, which a downstream
        // substitution changes — so the toggle goes and emit falls back to ^FO.
        // The flag is not the panel's to throw away, and x/y still mean the
        // visual top-left either way.
        await orientation('I').click();
        await expect(page.locator('[data-position-type]')).toHaveCount(0);
        const rotated = await state();
        expect(rotated.positionType).toBe('FT');
        expect(rotated.zpl).toContain('^FO');

        await orientation('N').click();
        await expect(page.locator('[data-position-type="FT"]')).toHaveAttribute('aria-pressed', 'true');
        expect((await state()).zpl).toContain('^FT');
    });

    test('keeps the toggle on a rotated block', async ({ page }) => {
        await page.goto('/?e2e=1');
        const panel = new ElementsPanel(page);
        await panel.addFieldBlockElement();

        await page.locator('[data-position-type="FT"]').click();
        // A block's reading extent is declared, not measured, so rotation costs
        // it nothing — the toggle stays and emit keeps anchoring.
        await page.locator('#properties-panel [data-orientation="B"]').click();
        await expect(page.locator('[data-position-type="FT"]')).toHaveAttribute('aria-pressed', 'true');
        const zpl = await page.evaluate(() => (window as any).appState.elements[0].render());
        expect(zpl).toContain('^FT');
    });

    test('keeps focus in Content while typing a placeholder that hides the toggle', async ({ page }) => {
        await page.goto('/?e2e=1');
        const panel = new ElementsPanel(page);
        await panel.addQRCodeElement();

        await page.locator('[data-position-type="FT"]').click();
        const content = page.locator('#prop-content');
        await content.fill('');
        // A QR anchor is measured from the encoded symbol, which a downstream
        // substitution changes — so the toggle disappears on the closing '%'.
        // It must not take the caret with it: the user is still mid-field.
        await content.pressSequentially('%code%');

        await expect(page.locator('[data-position-type]')).toHaveCount(0);
        expect(await page.evaluate(() => document.activeElement?.id)).toBe('prop-content');
        expect(await content.inputValue()).toBe('%code%');
    });
});
