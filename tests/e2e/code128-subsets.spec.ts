import { test, expect } from '../fixtures';

/**
 * Coverage for Code 128 subset handling.
 *
 * ZPL picks the subset with a start code in ^FD (`>9`/`>:`/`>;`) and switches it
 * mid-field with invocation codes, whose meaning depends on the subset in force.
 * Symbol width in modules is the observable: a Code 128 symbol is
 * 11 × (start + data + check) + 13, so every expectation below is a codeword
 * count. The values were measured on Labelary except where marked, which are the
 * Subset A cases Labelary does not implement.
 */

/** Encoded module count for ^FD data at a given start subset. */
async function modules(page: any, data: string, subset: string): Promise<number> {
    return await page.evaluate(async ([text, code128Subset]: string[]) => {
        const [{ BarcodeElement }, { getBarcodeGeometry }] = await Promise.all([
            import('/src/elements/BarcodeElement.js'),
            import('/src/utils/barcodeGeometry.js'),
        ]);
        const element: any = new BarcodeElement(0, 0, text);
        element.code128Subset = code128Subset;
        return getBarcodeGeometry(element).modules;
    }, [data, subset]);
}

/** Codewords for ^FD data at a given start subset, start code included. */
async function codewords(page: any, data: string, subset: string): Promise<number[]> {
    return await page.evaluate(async ([text, startSubset]: string[]) => {
        const { encodeCode128 } = await import('/src/barcodes/code128Encoder.js');
        return encodeCode128(text, startSubset).codewords;
    }, [data, subset]);
}

/** Codewords an automatic mode (^BC m=A) picks for ^FD data. */
async function autoCodewords(page: any, data: string): Promise<number[]> {
    return await page.evaluate(async (text: string) => {
        const { encodeCode128Auto } = await import('/src/barcodes/code128Encoder.js');
        return encodeCode128Auto(text, false).codewords;
    }, data);
}

/** The readable line an automatic mode prints. */
async function autoText(page: any, data: string): Promise<string> {
    return await page.evaluate(async (text: string) => {
        const { code128AutoText } = await import('/src/barcodes/code128Encoder.js');
        return code128AutoText(text);
    }, data);
}

/** The human-readable line the renderer draws under the bars. */
async function hri(page: any, data: string, subset: string): Promise<string> {
    return await page.evaluate(async ([text, code128Subset]: string[]) => {
        const [{ BarcodeElement }, { getBarcodeSymbology }] = await Promise.all([
            import('/src/elements/BarcodeElement.js'),
            import('/src/barcodes/BarcodeSymbologies.js'),
        ]);
        const element: any = new BarcodeElement(0, 0, text);
        element.code128Subset = code128Subset;
        return getBarcodeSymbology('CODE128').displayText(element, text);
    }, [data, subset]);
}

test.describe('Code 128 subsets', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('the start subset changes the encoding', async ({ page }) => {
        // A and B both carry "6566" as four single characters, so they are the
        // same width — but not the same bars: only the start codeword differs.
        expect(await modules(page, '6566', 'A')).toBe(79);
        expect(await modules(page, '6566', 'B')).toBe(79);
        // C pairs the digits, which is two codewords instead of four.
        expect(await modules(page, '6566', 'C')).toBe(57);

        const codewords = await page.evaluate(async () => {
            const { encodeCode128 } = await import('/src/barcodes/code128Encoder.js');
            return {
                a: encodeCode128('6566', 'A').codewords,
                b: encodeCode128('6566', 'B').codewords,
            };
        });
        expect(codewords.a).toEqual([103, 22, 21, 22, 22]);
        expect(codewords.b).toEqual([104, 22, 21, 22, 22]);
    });

    test('a digit run stays in the current subset — no automatic switch', async ({ page }) => {
        // bwip-js would compact these eight digits into Subset C on its own;
        // Zebra only switches when an invocation code says so.
        expect(await modules(page, 'ABC12345678', 'B')).toBe(156);
    });

    test('invocation codes resolve against the subset in force', async ({ page }) => {
        // >5 = Code C: the eight digits become four pairs.
        expect(await modules(page, 'ABC>512345678', 'B')).toBe(123);
        // >6 is FNC4 inside B — one codeword, still Subset B, so lowercase follows.
        expect(await modules(page, 'AB>6cd', 'B')).toBe(90);
        expect(await modules(page, 'ABcd', 'B')).toBe(79);
        // ...but Code B inside C, which is what lets the letters encode at all.
        expect(await modules(page, '1234>6ABC', 'C')).toBe(101);
        // >8 = FNC1 (the GS1-128 opener), >3 = FNC2, >2 = FNC3, >1 = a plain value.
        for (const code of ['>8', '>3', '>2', '>1']) {
            expect(await modules(page, `ABC${code}abc`, 'B'), code).toBe(112);
        }
        // Code A from B keeps the digits single — Labelary renders this as Code C.
        expect(await modules(page, 'ABC>712345678', 'B')).toBe(167);
    });

    test('>> is an escaped literal, not an invocation', async ({ page }) => {
        expect(await modules(page, 'A>>B', 'B')).toBe(68);
        expect(await hri(page, 'A>>B', 'B')).toBe('A>B');
    });

    test('characters the subset cannot carry are dropped from bars and HRI', async ({ page }) => {
        // Letters have no Subset C representation; a lone trailing digit has no pair.
        expect(await modules(page, 'ABC', 'C')).toBe(35);
        expect(await hri(page, 'ABC', 'C')).toBe('');
        expect(await modules(page, '123', 'C')).toBe(46);
        expect(await hri(page, '123', 'C')).toBe('12');
    });

    test('the readable line never shows invocation codes', async ({ page }) => {
        expect(await hri(page, '382436>6CODE128>752375152', 'C')).toBe('382436CODE12852375152');
        expect(await hri(page, 'ABC>512345678', 'B')).toBe('ABC12345678');
    });

    test('a Subset C invocation that is a digit pair reaches the bars and the HRI', async ({ page }) => {
        // Values 95–98 are the pairs "95"–"98" inside C (Zebra's ^BC table). They
        // used to be encoded into the bars but omitted from the readable line, so
        // the two disagreed. Labelary drops them outright — a deliberate
        // divergence, pinned in code128-auto-parity-api.spec.ts.
        expect(await codewords(page, '>112', 'C')).toEqual([105, 95, 12]);
        expect(await hri(page, '>112', 'C')).toBe('9512');
    });

    test('a start invocation for the subset already in force is dropped', async ({ page }) => {
        // 103/104/105 are Start codes, not data — emitting one mid-symbol is not
        // valid Code 128, so a redundant one carries nothing.
        expect(await codewords(page, '>;12', 'C')).toEqual([105, 12]);
        expect(await codewords(page, '>:AB', 'B')).toEqual([104, 33, 34]);
        // ...but a start invocation that really does switch still latches.
        expect(await codewords(page, '>;12', 'B')).toEqual([104, 105, 12]);
    });
});

test.describe('Code 128 automatic modes (^BC m=A/D/U)', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('Start C is for a leading run of four, or for exactly two digits', async ({ page }) => {
        // ISO/IEC 15417 Annex B. 105 = Start C, 104 = Start B.
        expect(await autoCodewords(page, '12')).toEqual([105, 12]);
        // Three digits stays in B: the odd digit has to be spent there anyway.
        expect(await autoCodewords(page, '123')).toEqual([104, 17, 18, 19]);
        expect(await autoCodewords(page, '1234')).toEqual([105, 12, 34]);
        expect(await autoCodewords(page, '12345')).toEqual([105, 12, 34, 100, 21]);
    });

    test('>> is a literal pair here, unlike mode N', async ({ page }) => {
        // Measured on Labelary: m=A `A>>B` encodes four characters, not three.
        expect(await autoCodewords(page, 'A>>B')).toEqual([104, 33, 30, 30, 34]);
        expect(await autoText(page, 'A>>B')).toBe('A>>B');
    });

    test('a start-subset prefix is data, not a start code', async ({ page }) => {
        // The automatic modes read no invocation code except >8.
        expect(await autoCodewords(page, '>;99')).toEqual([104, 30, 27, 25, 25]);
    });
});
