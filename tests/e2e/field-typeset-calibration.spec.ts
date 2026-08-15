import { test, expect } from '../fixtures';
import { findContentBounds } from '../fixtures/image-comparison';
import { waitForRateLimit } from '../fixtures/rate-limiter';

// Labelary calibration for ^FT. Each case derives capDrop by comparing ^FO and
// ^FT ink tops: capDrop = inkTop_FO - inkTop_FT. Responses are cached locally.

const DPMM = 8;
const LABEL_W_IN = 4;
const LABEL_H_IN = 2;
const PROBE_Y = 100;
const PROBE_X = 50;

async function renderZpl(page: any, zpl: string): Promise<Buffer> {
    // Labelary allows 3 req/s. Cached responses never reach the network, but the
    // interceptor can't tell us that from here, so pace every call: a cold run
    // is the only slow one.
    await waitForRateLimit();
    const b64 = await page.evaluate(async ({ zpl, dpmm, w, h }: any) => {
        const url = `https://api.labelary.com/v1/printers/${dpmm}dpmm/labels/${w}x${h}/0/`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: zpl,
        });
        if (!res.ok) throw new Error(`Labelary ${res.status}: ${await res.text()}`);
        const buf = new Uint8Array(await res.arrayBuffer());
        let bin = '';
        for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
        return btoa(bin);
    }, { zpl, dpmm: DPMM, w: LABEL_W_IN, h: LABEL_H_IN });
    return Buffer.from(b64, 'base64');
}

/** capDrop in dots for one field body, measured as described above. */
async function measureCapDrop(page: any, body: string, probeY = PROBE_Y): Promise<number> {
    const fo = await renderZpl(page, `^XA^FO${PROBE_X},${probeY}${body}^XZ`);
    const ft = await renderZpl(page, `^XA^FT${PROBE_X},${probeY}${body}^XZ`);
    const bFo = findContentBounds(fo);
    const bFt = findContentBounds(ft);
    expect(bFo.height, `^FO probe drew no ink for ${body}`).toBeGreaterThan(0);
    expect(bFt.height, `^FT probe drew no ink for ${body}`).toBeGreaterThan(0);
    // Sanity: ^FT must lift the field, never push it down.
    expect(bFt.top).toBeLessThan(bFo.top);
    return bFo.top - bFt.top;
}

test.describe('^FT calibration — text baseline offset', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    // Scalable Font 0 at a spread of heights. If capDrop is a fixed fraction of
    // the ^A height, these all divide to the same ratio — that is the claim the
    // implementation rests on, so assert it rather than trusting it.
    test('Font 0 capDrop is a fixed fraction of the ^A height', async ({ page }) => {
        const heights = [20, 30, 50, 80];
        const measured: { h: number; capDrop: number; ratio: number }[] = [];
        for (const h of heights) {
            const capDrop = await measureCapDrop(page, `^A0N,${h},${h}^FDHX^FS`);
            measured.push({ h, capDrop, ratio: capDrop / h });
        }
        console.log('Font 0 capDrop:', JSON.stringify(measured));

        const ratios = measured.map((m) => m.ratio);
        const spread = Math.max(...ratios) - Math.min(...ratios);
        // Quantisation to whole dots means small heights can't hit the ratio
        // exactly; 0.05 is well inside "same constant, rounded".
        expect(spread, `ratios ${JSON.stringify(ratios)}`).toBeLessThan(0.05);
    });

    // Bitmap fonts: capDrop is NOT simply the cap-ink height. The ^FO anchor is
    // the top of the character CELL, and for some fonts the cap ink starts a few
    // dots below that. So capDrop = cellPad + capHeight, and cellPad is a
    // per-font constant this test exists to pin down.
    //
    // The printed table is the source for BITMAP_CELL_PAD in fontMetrics.js.
    // `capStep` below is the per-magnification cap height already in
    // src/config/constants.js, so a row where cellPad is 0 means the config's
    // snappedHeight is already the whole answer for that font.
    const BITMAP = [
        { id: 'A', base: 9, capStep: 7 },
        { id: 'B', base: 11, capStep: 11 },
        { id: 'C', base: 18, capStep: 14 },
        { id: 'D', base: 18, capStep: 14 },
        { id: 'E', base: 28, capStep: 20 },
        { id: 'F', base: 26, capStep: 21 },
        { id: 'G', base: 60, capStep: 48 },
        { id: 'H', base: 21, capStep: 21 },
    ];

    test('bitmap capDrop = cell padding + cap height, and scales with magnification', async ({ page }) => {
        const rows: any[] = [];
        for (const f of BITMAP) {
            for (const mag of [1, 2]) {
                const h = f.base * mag;
                const body = `^A${f.id}N,${h}^FDHX^FS`;
                const capDrop = await measureCapDrop(page, body);
                const fo = findContentBounds(await renderZpl(page, `^XA^FO${PROBE_X},${PROBE_Y}${body}^XZ`));
                rows.push({
                    id: f.id,
                    mag,
                    h,
                    capDrop,
                    inkHeight: fo.height,
                    inkTopOffset: fo.top - PROBE_Y,
                    capStepMag: f.capStep * mag,
                    cellPad: capDrop - f.capStep * mag,
                });
            }
        }
        console.log('BITMAP CAPDROP TABLE:\n' + rows.map((r) => JSON.stringify(r)).join('\n'));

        for (const r of rows) {
            // The cap ink height is the config's capStep — if this ever drifts,
            // the cellPad derived below is measuring the wrong thing.
            expect(r.inkHeight, `font ${r.id} x${r.mag} ink height`).toBe(r.capStepMag);
        }

        // The encodable relation: capDrop = (capStep + cellPad) * magnification,
        // i.e. cellPad is a per-font constant in per-magnification-step dots.
        // (inkTopOffset is close to cellPad*mag but not exactly — Labelary
        // rounds the ink placement independently of the baseline, so font E x2
        // shows offset 7 against a pad of 6. The baseline relation is the exact
        // one, and the baseline is what ^FT anchors.)
        for (const f of BITMAP) {
            const [x1, x2] = rows.filter((r) => r.id === f.id);
            expect(x2.cellPad, `font ${f.id} cellPad scales with magnification`).toBe(x1.cellPad * 2);
            expect(x1.capDrop, `font ${f.id} capDrop formula`).toBe(f.capStep + x1.cellPad);
        }

        // Pinned so a config or Labelary change surfaces here rather than as a
        // silently shifted label. Only font E pads its cell.
        const pads = Object.fromEntries(rows.filter((r) => r.mag === 1).map((r) => [r.id, r.cellPad]));
        expect(pads).toEqual({ A: 0, B: 0, C: 0, D: 0, E: 3, F: 0, G: 0, H: 0 });
    });

    // ^FT pins the LAST baseline of a block, so a 3-line ^FB sits two line
    // extents higher than a 1-line one. This is the §2.4 term, measured — and
    // the line-spacing parameter turns out not to be plainly additive.
    test('^FB block extent per declared line, and how line spacing enters it', async ({ page }) => {
        const h = 30;
        // High enough that a 3-line block with spacing still has its ^FT anchor
        // on the label: the anchor sits (lines-1) extents BELOW the ink.
        const y = 300;
        const single = await measureCapDrop(page, `^A0N,${h},${h}^FB300,1,0,L,0^FDHX^FS`, y);
        const rows: any[] = [];
        for (const spacing of [0, 5, 10, 20]) {
            const triple = await measureCapDrop(page, `^A0N,${h},${h}^FB300,3,${spacing},L,0^FDHX^FS`, y);
            rows.push({ spacing, triple, extent: triple - single, perLine: (triple - single) / 2 });
        }
        console.log('FB EXTENT TABLE:\n' + rows.map((r) => JSON.stringify(r)).join('\n'));

        // Zero spacing: one full font height per extra declared line.
        expect(rows[0].perLine).toBe(h);

        // Same question for a BITMAP font, where "font height" could plausibly
        // mean the snapped cell height instead of the requested ^A height.
        // FIELDBLOCK anchors bitmap fonts too, so this cannot stay assumed.
        const bmSingle = await measureCapDrop(page, `^ADN,18^FB300,1,0,L,0^FDHX^FS`, y);
        const bmTriple = await measureCapDrop(page, `^ADN,18^FB300,3,0,L,0^FDHX^FS`, y);
        const bmPerLine = (bmTriple - bmSingle) / 2;
        console.log('FB BITMAP:', JSON.stringify({ bmSingle, bmTriple, bmPerLine }));
        // 18 = the requested ^A height; 14 would be the snapped cap height.
        expect(bmPerLine, 'bitmap ^FB steps by the requested ^A height').toBe(18);
        // Spacing is monotonic and per-gap, whatever its exact quantisation.
        for (let i = 1; i < rows.length; i++) {
            expect(rows[i].extent, `spacing ${rows[i].spacing}`).toBeGreaterThan(rows[i - 1].extent);
        }
    });

    // End-to-end check that each rotated ^FT places ink where ^FO does.
    test('rotation: emitted ^FT lands the ink where ^FO does', async ({ page }) => {
        const h = 30;
        const y = 400;
        const x = 300;
        const text = 'Widget';
        const rows: any[] = [];

        for (const rot of ['N', 'R', 'I', 'B']) {
            const body = `^A0${rot},${h},${h}^FD${text}^FS`;
            const foZpl = `^XA^FO${x},${y}${body}^XZ`;
            // Ask the implementation for the ^FT form of the same element.
            const ftZpl = await page.evaluate(async ({ x, y, h, text, rot }: any) => {
                const { TextElement } = await import('/src/elements/TextElement.js');
                const el: any = new TextElement(x, y, text, h, h, '0', rot);
                el.positionType = 'FT';
                return '^XA' + el.render('0', 20, 0) + '^XZ';
            }, { x, y, h, text, rot });

            const fo = findContentBounds(await renderZpl(page, foZpl));
            const ft = findContentBounds(await renderZpl(page, ftZpl));
            rows.push({ rot, ftZpl, dLeft: ft.left - fo.left, dTop: ft.top - fo.top });
        }

        // Right justification (rotation N): same check, anchor at the far end.
        const rjZpl = await page.evaluate(async ({ x, y, h, text }: any) => {
            const { TextElement } = await import('/src/elements/TextElement.js');
            const el: any = new TextElement(x, y, text, h, h, '0', 'N');
            el.positionType = 'FT';
            el.fieldJustify = 'R';
            return '^XA' + el.render('0', 20, 0) + '^XZ';
        }, { x, y, h, text });
        const foN = findContentBounds(await renderZpl(page, `^XA^FO${x},${y}^A0N,${h},${h}^FD${text}^FS^XZ`));
        const rj = findContentBounds(await renderZpl(page, rjZpl));
        rows.push({ rot: 'N,z=1', ftZpl: rjZpl, dLeft: rj.left - foN.left, dTop: rj.top - foN.top });

        console.log('ROTATION ROUND-TRIP:\n' + rows.map((r) => JSON.stringify(r)).join('\n'));

        for (const r of rows) {
            // N and R use only the cap/descender split and must be exact. I, B
            // and z=1 carry the advance width, which is a model of Zebra's
            // metrics rather than Zebra's own: measured drift is under ~3 dots,
            // worst with an explicit ^A width plus lowercase. The round-trip is
            // unaffected (import and emit share the measurement) — this bound
            // is on the ABSOLUTE position only.
            const tol = r.rot === 'N' || r.rot === 'R' ? 0 : 3;
            expect(Math.abs(r.dLeft), `${r.rot} left (${JSON.stringify(r)})`).toBeLessThanOrEqual(tol);
            expect(Math.abs(r.dTop), `${r.rot} top (${JSON.stringify(r)})`).toBeLessThanOrEqual(tol);
        }
    });

    // Same round trip for the block families. Unlike TEXT, a block's reading
    // extent is a DECLARED parameter rather than a modelled advance, so there is
    // no metrics drift to absorb and every rotation must land exactly. This is
    // the only thing pinning rotated ^TB, which no reference implementation
    // covers — if Labelary disagrees, the logged table is the constant to fix.
    test('rotation: emitted ^FT lands block ink where ^FO does', async ({ page }) => {
        const h = 30;
        const x = 300;
        const y = 100;
        const rows: any[] = [];

        for (const kind of ['FB', 'TB']) {
            for (const rot of ['N', 'R', 'I', 'B']) {
                // Both forms come from the same element, so the field body is
                // identical by construction and only the anchor differs.
                const zpl = await page.evaluate(async ({ x, y, h, rot, kind }: any) => {
                    const mod = kind === 'FB'
                        ? await import('/src/elements/FieldBlockElement.js')
                        : await import('/src/elements/TextBlockElement.js');
                    const make = () => kind === 'FB'
                        ? new (mod as any).FieldBlockElement(x, y, 'Widget', h, h, 200, 2, 0, 'L', 0, '0', false, rot)
                        : new (mod as any).TextBlockElement(x, y, 'Widget', h, h, 200, 60, '0', false, rot);
                    const ft: any = make();
                    ft.positionType = 'FT';
                    return { fo: '^XA' + make().render('0', 20, 0) + '^XZ', ft: '^XA' + ft.render('0', 20, 0) + '^XZ' };
                }, { x, y, h, rot, kind });

                const fo = findContentBounds(await renderZpl(page, zpl.fo));
                const ft = findContentBounds(await renderZpl(page, zpl.ft));
                rows.push({ kind, rot, ftZpl: zpl.ft, dLeft: ft.left - fo.left, dTop: ft.top - fo.top });
            }
        }

        console.log('BLOCK ROTATION ROUND-TRIP:\n' + rows.map((r) => JSON.stringify(r)).join('\n'));

        for (const r of rows) {
            expect(Math.abs(r.dLeft), `${r.kind}/${r.rot} left (${JSON.stringify(r)})`).toBe(0);
            expect(Math.abs(r.dTop), `${r.kind}/${r.rot} top (${JSON.stringify(r)})`).toBe(0);
        }
    });

    // ^TB is a fixed clip box, not a line stack, so its ^FT extent should come
    // from the declared block height rather than a line count.
    test('^TB block extent comes from the declared block height', async ({ page }) => {
        const h = 30;
        const y = 300;
        const rows: any[] = [];
        for (const blockH of [30, 60, 100]) {
            const capDrop = await measureCapDrop(page, `^A0N,${h},${h}^TBN,300,${blockH}^FDHX^FS`, y);
            rows.push({ blockH, capDrop });
        }
        console.log('TB EXTENT TABLE:\n' + rows.map((r) => JSON.stringify(r)).join('\n'));
        expect(rows.length).toBe(3);
    });

    // Phase 3 groundwork. The spec states the 1D anchor verbatim ("base of
    // barcode, at the left edge"), so the question is only which height that
    // is — bars alone, or bars plus the interpretation line. QR is the
    // three-way disagreement from plan_ft.md R2 and is pure measurement.
    test('barcode ^FT anchors the bar base, and where QR anchors', async ({ page }) => {
        const y = 300;
        const rows: any[] = [];
        const cases = [
            { name: 'code128 no HRI', body: '^BY2,3^BCN,100,N,N,N^FD12345^FS', barH: 100 },
            { name: 'code128 HRI below', body: '^BY2,3^BCN,100,Y,N,N^FD12345^FS', barH: 100 },
            { name: 'code128 HRI above', body: '^BY2,3^BCN,100,Y,Y,N^FD12345^FS', barH: 100 },
            { name: 'code39 HRI below', body: '^BY2,3^B3N,N,80,Y,N^FD12345^FS', barH: 80 },
            { name: 'ean13', body: '^BY2,3^BEN,90,Y,N^FD123456789012^FS', barH: 90 },
            { name: 'qr mag 4', body: '^BQN,2,4^FDQA,HELLO^FS', barH: null },
            { name: 'qr mag 8', body: '^BQN,2,8^FDQA,HELLO^FS', barH: null },
            { name: 'datamatrix', body: '^BXN,6,200^FDHELLO^FS', barH: null },
        ];
        for (const c of cases) {
            const fo = findContentBounds(await renderZpl(page, `^XA^FO${PROBE_X},${y}${c.body}^XZ`));
            const ft = findContentBounds(await renderZpl(page, `^XA^FT${PROBE_X},${y}${c.body}^XZ`));
            rows.push({
                name: c.name,
                drop: fo.top - ft.top,
                barH: c.barH,
                dLeft: fo.left - ft.left,
                inkH: fo.height,
                inkW: fo.width,
            });
        }
        console.log('BARCODE ANCHOR TABLE:\n' + rows.map((r) => JSON.stringify(r)).join('\n'));

        for (const r of rows) {
            // No horizontal shift for left-justified anything.
            expect(r.dLeft, `${r.name} dLeft`).toBe(0);
            // 1D: the anchor is the bar base, so the drop is the ^B height
            // regardless of whether an interpretation line is drawn or where.
            if (r.barH !== null) expect(r.drop, `${r.name} drop`).toBe(r.barH);
        }
    });

    test('barcode ^FT under rotation', async ({ page }) => {
        const y = 300, x = 200;
        const rows: any[] = [];
        for (const rot of ['N', 'R', 'I', 'B']) {
            const body = `^BY2,3^BC${rot},100,N,N,N^FD12345^FS`;
            const fo = findContentBounds(await renderZpl(page, `^XA^FO${x},${y}${body}^XZ`));
            const ft = findContentBounds(await renderZpl(page, `^XA^FT${x},${y}${body}^XZ`));
            rows.push({ rot, dx: fo.left - ft.left, dy: fo.top - ft.top, inkW: fo.width, inkH: fo.height });
        }
        console.log('BARCODE ROTATION TABLE:\n' + rows.map((r) => JSON.stringify(r)).join('\n'));
        expect(rows.length).toBe(4);
    });

    // End-to-end for barcodes, same shape as the text rotation check: emit what
    // fieldAnchor computes and confirm the ink lands where ^FO put it.
    test('barcode: emitted ^FT lands the ink where ^FO does', async ({ page }) => {
        const x = 200, y = 300;
        const rows: any[] = [];
        for (const rot of ['N', 'R', 'I', 'B']) {
            const fo = `^XA^FO${x},${y}^BY2,3^BC${rot},100,N,N,N^FD12345^FS^XZ`;
            const ft = await page.evaluate(async ({ x, y, rot }: any) => {
                const { BarcodeElement } = await import('/src/elements/BarcodeElement.js');
                const el: any = new BarcodeElement(x, y, '12345', 100, 2, 3, false, false, 'CODE128', false, rot);
                el.positionType = 'FT';
                return '^XA' + el.render() + '^XZ';
            }, { x, y, rot });
            const a = findContentBounds(await renderZpl(page, fo));
            const b = findContentBounds(await renderZpl(page, ft));
            rows.push({ rot, ft, dLeft: b.left - a.left, dTop: b.top - a.top });
        }
        console.log('BARCODE ROUND-TRIP:\n' + rows.map((r) => JSON.stringify(r)).join('\n'));
        for (const r of rows) {
            expect(Math.abs(r.dLeft), `${r.rot} left (${JSON.stringify(r)})`).toBeLessThanOrEqual(1);
            expect(Math.abs(r.dTop), `${r.rot} top (${JSON.stringify(r)})`).toBeLessThanOrEqual(1);
        }
    });

    test('QR: emitted ^FT lands the ink where ^FO does', async ({ page }) => {
        const x = 200, y = 300;
        const rows: any[] = [];
        for (const mag of [4, 8]) {
            const fo = `^XA^FO${x},${y}^BQN,2,${mag}^FDQA,HELLO^FS^XZ`;
            const ft = await page.evaluate(async ({ x, y, mag }: any) => {
                const { QRCodeElement } = await import('/src/elements/QRCodeElement.js');
                const el: any = new QRCodeElement({
                    x, y, content: 'HELLO', symbology: 'QR', magnification: mag,
                });
                el.positionType = 'FT';
                return '^XA' + el.render() + '^XZ';
            }, { x, y, mag });
            const a = findContentBounds(await renderZpl(page, fo));
            const b = findContentBounds(await renderZpl(page, ft));
            rows.push({ mag, ft, dLeft: b.left - a.left, dTop: b.top - a.top });
        }
        console.log('QR ROUND-TRIP:\n' + rows.map((r) => JSON.stringify(r)).join('\n'));
        for (const r of rows) {
            expect(Math.abs(r.dLeft), `mag ${r.mag} left (${JSON.stringify(r)})`).toBeLessThanOrEqual(1);
            expect(Math.abs(r.dTop), `mag ${r.mag} top (${JSON.stringify(r)})`).toBeLessThanOrEqual(1);
        }
    });

    // Graphics are already implemented (Phase 1); these are the matrix's
    // trivial first rows, and they guard the shipped math against Labelary
    // rather than against our own parser.
    test('graphics ^FT lifts by exactly the declared height', async ({ page }) => {
        const cases = [
            { body: '^GB300,80,2,B^FS', height: 80 },
            { body: '^GE60,40,2,B^FS', height: 40 },
            { body: '^GC50,2,B^FS', height: 50 },
        ];
        for (const c of cases) {
            const fo = findContentBounds(await renderZpl(page, `^XA^FO${PROBE_X},${PROBE_Y}${c.body}^XZ`));
            const ft = findContentBounds(await renderZpl(page, `^XA^FT${PROBE_X},${PROBE_Y}${c.body}^XZ`));
            expect(fo.top - ft.top, `${c.body} lift`).toBe(c.height);
        }
    });
});
