import { test, expect } from '../fixtures';

/**
 * Coverage for the ^B7 high-level encoder.
 *
 * bwip-js compacts PDF417 optimally; Zebra's firmware runs a greedy pass with one
 * character of lookahead, so the two encode the same data into different codewords
 * and print visibly different symbols. src/barcodes/pdf417Encoder.js reproduces
 * Zebra's choices, and every expectation below is a codeword stream read back off a
 * Labelary render of the same ^FD data (the symbol decoded through the PDF417
 * cluster tables), so these are observations, not derivations.
 */

/** Data codewords the encoder produces for ^FD data — no length descriptor, no padding. */
async function codewords(page: any, data: string): Promise<number[]> {
    return await page.evaluate(async (text: string) => {
        const { pdf417Codewords } = await import('/src/barcodes/pdf417Encoder.js');
        return pdf417Codewords(text);
    }, data);
}

test.describe('PDF417 high-level encoding', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    // Text Compaction submode switching. Zebra only reconsiders the submode when the
    // current one cannot hold the character, and then looks one character ahead:
    // a submode holding both wins a latch, otherwise the character takes a shift.
    const TEXT_CASES: [string, number[]][] = [
        ['AB;CD', [1, 870, 63]],                        // lone punctuation -> shift
        ['AB;;CD', [1, 865, 0, 872, 119]],              // two in a row -> latch to Punctuation
        ['AB;;;CD', [1, 865, 0, 29, 63]],
        ['AB..CD', [1, 857, 538, 63]],                  // '.' is Mixed too, and Mixed wins
        ['AB.;CD', [1, 865, 510, 872, 119]],            // ...unless the pair only fits Punctuation
        ['AB;.CD', [1, 865, 17, 872, 119]],
        ['AB;1CD', [1, 870, 841, 842, 119]],            // no submode holds both -> shift, then latch
        ["AB'ABC", [1, 898, 1, 89]],
        ['A;a;A', [29, 27, 29, 27, 29]],
        ['abcD', [810, 32, 813]],                       // single upper from Lower -> shift
        ['abcDEF', [810, 32, 868, 94, 179]],            // two uppers -> latch to Alpha
        ['abD e', [810, 58, 843, 807, 149]],            // a space counts as Alpha for the lookahead
        ['abc;de', [810, 32, 870, 94]],
        ['abc;;de', [810, 32, 865, 0, 897, 94]],
        ['ab;;AB', [810, 58, 750, 29, 1]],
        ['ab12cd', [810, 58, 32, 812, 119]],
        ['ab$$cd', [810, 58, 558, 812, 119]],
        ['ab 1cd', [810, 56, 841, 812, 119]],
        ['12;AB', [841, 89, 28, 1]],
        ['12;;AB', [841, 85, 0, 870, 59]],
        ['12.;AB', [841, 77, 870, 840, 59]],
        ['12 AB', [841, 86, 840, 59]],
        ['12 ab', [841, 86, 810, 59]],
        ['AB .CD', [1, 809, 512, 119]],
        ['AB 1CD', [1, 808, 58, 63]],
        ['AB ab', [1, 807, 1]],
        ['AB  CD', [1, 806, 63]],
        ['AB;  CD', [1, 870, 806, 63]],
    ];
    for (const [data, expected] of TEXT_CASES) {
        test(`Text Compaction: ${JSON.stringify(data)}`, async ({ page }) => {
            expect(await codewords(page, data)).toEqual(expected);
        });
    }

    test('Numeric Compaction starts at a run of 8 digits, not the spec-suggested 13', async ({ page }) => {
        // Labelary keeps a 7-digit run in Text Compaction and latches (902) at 8.
        const runs = await Promise.all([4, 6, 7, 8, 9, 13].map((n) =>
            codewords(page, `ABC${'1234567890123'.slice(0, n)}ABC`)));
        expect(runs.map((cws) => cws.includes(902))).toEqual([false, false, false, true, true, true]);
        expect(runs[2]).toEqual([1, 88, 32, 94, 156, 238, 1, 89]);            // 7 digits, text
        expect(runs[3]).toEqual([1, 89, 902, 138, 628, 478, 900, 1, 89]);     // 8 digits, numeric
    });

    test('the submode lookahead stops where Numeric Compaction takes over', async ({ page }) => {
        // The '/' before the tracking number can't latch to Mixed on the strength of
        // the '9' that follows it — those digits are leaving Text Compaction — so it
        // takes a Punctuation shift instead.
        expect(await codewords(page, 'https://example.com/track/9988776655')).toEqual(
            [817, 589, 468, 854, 589, 814, 690, 375, 334, 887, 74, 389, 589, 510, 70, 889, 902, 27, 377, 451, 755]);
    });

    test('Numeric Compaction re-latches every 44 digits', async ({ page }) => {
        const cws = await codewords(page, `AB${'1234567890'.repeat(10)}`);
        expect(cws).toEqual([1, 902, 491, 81, 137, 450, 302, 67, 15, 174, 492, 862, 667, 475, 869, 12, 434,
            902, 685, 326, 422, 57, 117, 339, 377, 238, 839, 698, 145, 870, 348, 517, 378,
            902, 2, 808, 3, 153, 190]);
    });

    test('Byte Compaction latches by length and returns through a text latch', async ({ page }) => {
        // 924 is the latch for a byte count that is a multiple of 6, 901 otherwise, and
        // a lone byte takes the 913 shift — but Zebra still emits 900 to resume text.
        expect(await codewords(page, '\x80ABCDEF')).toEqual([913, 128, 900, 1, 63, 125]);
        expect(await codewords(page, '\x80\x81\x82ABC')).toEqual([901, 128, 129, 130, 900, 1, 89]);
        expect(await codewords(page, '\x80\x81\x82\x83\x84\x85ABC')).toEqual([924, 215, 318, 502, 193, 33, 900, 1, 89]);
    });

    test('an EDIFACT payload encodes exactly as the printer does', async ({ page }) => {
        // The mixed-case, punctuation-heavy, digit-run-heavy shape that first exposed
        // the difference: bwip-js compacts this into 180 codewords, Zebra into 184.
        const data = "UNH+2876965+IFTMIN:D:96B:UN+DHL5.6.0/AWESOME'BGM+787+999994760001+9'DTM+186:20240312:102'"
            + "TSR+++10'TOD+Z02++CPT'NAD+OS+0464651'NAD+CN+++MEVR. SOME PERSONE+STREET 17 E+SOMEPLACE++0+DE'"
            + "CTA+GR'COM+SOMEEMAIL@GMAIL.COM:EM'GID+0+1'MEA+WT++KGM:2'PCI+ZZ1+JVGL09999999999994760001'UNT+13+123546798'";
        const cws = await codewords(page, data);
        expect(cws.length).toBe(184);
        expect(cws.slice(0, 12)).toEqual([613, 238, 602, 247, 189, 185, 628, 245, 582, 253, 884, 118]);
        expect(cws.slice(-6)).toEqual([1, 487, 85, 298, 900, 898]);

        // ...and the symbol that payload prints at ^BY2^B7N,6,5,,30,N.
        const geom = await page.evaluate(async (content: string) => {
            const { getBarcodeGeometry } = await import('/src/utils/barcodeGeometry.js');
            const g: any = getBarcodeGeometry({
                type: 'QRCODE', symbology: 'PDF417', content,
                moduleWidth: 2, rowHeight: 6, securityLevel: 5, columns: 0, rows: 30,
            } as any);
            return { kind: g.kind, cols: g.cols, rows: g.rows };
        }, data);
        expect(geom).toEqual({ kind: 'matrix', cols: 222, rows: 30 });  // 9 data columns
    });

    test('^B7 field data drops the line breaks the printer ignores', async ({ page }) => {
        // A ^FD whose data starts on the next line is the common way to write a long
        // payload; the printer treats that break as a stream terminator, not as data.
        const contents = await page.evaluate(async () => {
            const { ZPLParser } = await import('/src/services/ZPLParser.js');
            const parse = (zpl: string) => (new ZPLParser().parse(zpl, { dpmm: 8, labelHeight: 50 }).elements[0] as any).content;
            return {
                split: parse('^XA^FO10,10^BY2^B7N,6,5,,30,N^FD\nHELLO WORLD\n^FS^XZ'),
                inline: parse('^XA^FO10,10^BY2^B7N,6,5,,30,N^FDHELLO WORLD^FS^XZ'),
            };
        });
        expect(contents.split).toBe('HELLO WORLD');
        expect(contents.split).toBe(contents.inline);
    });

    test('...but keeps a ^FH-escaped line break, which is data', async ({ page }) => {
        // _0A/_0D survive: ^FH decodes after the stream has been split into commands,
        // so the printer does encode them (Labelary puts them in the Punctuation
        // submode). Stripping breaks after the hex decode would silently delete them.
        const contents = await page.evaluate(async () => {
            const { ZPLParser } = await import('/src/services/ZPLParser.js');
            const parse = (zpl: string) => (new ZPLParser().parse(zpl, { dpmm: 8, labelHeight: 50 }).elements[0] as any).content;
            return {
                lf: parse('^XA^FO10,10^BY2^B7N,6,5,,30,N^FH^FDABC_0ADEF^FS^XZ'),
                cr: parse('^XA^FO10,10^BY2^B7N,6,5,,30,N^FH^FDABC_0DDEF^FS^XZ'),
                // ...and a physical break around escaped data still goes.
                both: parse('^XA^CI28^FO10,10^BY2^B7N,6,5,,30,N^FH^FD\nAB_C3_A9CD\n^FS^XZ'),
            };
        });
        expect(contents.lf).toBe('ABC\nDEF');
        expect(contents.cr).toBe('ABC\rDEF');
        expect(contents.both).toBe('ABéCD');
        expect(await codewords(page, 'ABC\nDEF')).toEqual([1, 89, 453, 125]);
        expect(await codewords(page, 'ABC\rDEF')).toEqual([1, 89, 333, 125]);
    });

    test('a character wider than one byte is dropped, not truncated to one', async ({ page }) => {
        // Byte Compaction carries single bytes. Under ^CI28 the printer resolves a
        // ^FD to code points, encodes anything up to U+00FF as its own byte, and drops
        // the rest — "AB<CJK><é>CD" comes back with the é as a lone shifted byte.
        expect(await codewords(page, 'ABéCD')).toEqual([1, 913, 233, 900, 63]);
        expect(await codewords(page, 'ABéüCD')).toEqual([1, 901, 233, 252, 900, 63]);
        expect(await codewords(page, 'AB漢éCD')).toEqual([1, 913, 233, 900, 63]);
        expect(await codewords(page, 'AB漢水CD')).toEqual([1, 63]);
        expect(await codewords(page, 'AB\u{1f600}CD')).toEqual([1, 63]);
    });
});
