import { test, expect } from '../fixtures';
import { waitForRateLimit } from '../fixtures/rate-limiter';
import { PNG } from 'pngjs';

/**
 * Canvas/Labelary parity for ambiguous ^BC automatic-mode cases: three-digit
 * Start C, `>>` escaping, and redundant start invocations. At ^BY1, ink width
 * directly exposes the Code 128 module count.
 */

const DPMM = 8;
const LABEL_WIDTH_IN = 4;
const LABEL_HEIGHT_IN = 4;
const FIELD_X = 20;
const FIELD_Y = 20;
const FIELD_STEP = 60;
const BAR_HEIGHT = 40;

type Case = {
    /** What the case pins down, used as the assertion label. */
    name: string;
    /** ^FD content, invocation codes included. */
    data: string;
    /** ^BC m parameter. */
    mode: 'N' | 'A' | 'D' | 'U';
    /** Start subset for mode N, written into ^FD as its invocation prefix. */
    subset?: 'A' | 'B' | 'C';
};

const START_PREFIX = { A: '>9', B: '>:', C: '>;' };

const CASES: Case[] = [
    // Annex B's Start C rules: exactly two digits, or a leading run of four or more.
    { name: 'm=A, 2 digits', data: '12', mode: 'A' },
    { name: 'm=A, 3 digits', data: '123', mode: 'A' },
    { name: 'm=A, 4 digits', data: '1234', mode: 'A' },
    { name: 'm=A, 5 digits', data: '12345', mode: 'A' },
    // Does the mode-N `>>` escape apply here too?
    { name: 'm=A, >> escape', data: 'A>>B', mode: 'A' },
    // `>;` measured as two literal characters under a mode. Re-pin it.
    { name: 'm=A, start prefix is literal', data: '>;99', mode: 'A' },
    { name: 'm=D, parentheses', data: '(01)12345', mode: 'D' },
    { name: 'm=U, short field left-pads to 19', data: '12345', mode: 'U' },
    // Mode N: a start invocation for the subset already in force is dropped by
    // both, so it belongs in the parity table.
    { name: 'm=N, C: >; already in C', data: '>;12', mode: 'N', subset: 'C' },
    // ZPL programs A as decimal codeword pairs: 52/37/51/52 decode to TEST.
    { name: 'm=N, C to B to A fixture', data: '382436>6CODE128>752375152', mode: 'N', subset: 'C' },
];

/**
 * Mode N, Subset C, `>1` — value 95. Zebra's ^BC table makes it the digit pair
 * "95"; Labelary drops it. The canvas follows Zebra's table rather than
 * Labelary's, so this divergence is deliberate and is pinned here rather than
 * being asserted as parity. The split was recorded as Subset-A-only; this is the
 * case that shows it is not.
 */
const ZEBRA_TABLE_DIVERGENCE: Case = {
    name: 'm=N, C: >1 is the pair 95',
    data: '>112',
    mode: 'N',
    subset: 'C',
};

async function renderLabelary(page: any, zpl: string): Promise<Buffer> {
    for (let attempt = 0; attempt < 7; attempt++) {
        await waitForRateLimit();
        const result = await page.evaluate(async ({ zpl, dpmm, width, height }: any) => {
            const response = await fetch(
                `https://api.labelary.com/v1/printers/${dpmm}dpmm/labels/${width}x${height}/0/`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: zpl,
                },
            );
            if (response.status === 429) return { retry: true };
            if (!response.ok) throw new Error(`Labelary ${response.status}: ${await response.text()}`);
            const bytes = new Uint8Array(await response.arrayBuffer());
            let binary = '';
            for (const byte of bytes) binary += String.fromCharCode(byte);
            return { base64: btoa(binary) };
        }, { zpl, dpmm: DPMM, width: LABEL_WIDTH_IN, height: LABEL_HEIGHT_IN });

        if (result.base64) return Buffer.from(result.base64, 'base64');
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
    throw new Error('Labelary rate limit exceeded after 7 attempts');
}

/**
 * Bar/space run lengths of the symbol on the given row band, starting on the
 * first bar and ending on the last — the same alternating shape bwip reports as
 * `sbs`. At ^BY1 one module is one dot, so these are module counts.
 *
 * Width alone cannot separate two encodings of equal codeword count (Start C
 * with a Code B latch is exactly as wide as four Subset B characters), which is
 * why the comparison is on the pattern rather than on the total.
 */
function runsAt(png: PNG, fieldIndex: number): number[] {
    const top = FIELD_Y + fieldIndex * FIELD_STEP + Math.floor(BAR_HEIGHT / 2);
    const runs: number[] = [];
    let inked = false;
    let started = false;
    for (let x = 0; x < png.width; x++) {
        const isInk = png.data[(top * png.width + x) * 4] < 128;
        if (!started) {
            if (!isInk) continue;
            started = true;
            inked = true;
            runs.push(1);
            continue;
        }
        if (isInk === inked) runs[runs.length - 1] += 1;
        else { inked = isInk; runs.push(1); }
    }
    // Drop a trailing white run: the quiet zone is not part of the symbol.
    if (runs.length && !inked) runs.pop();
    return runs;
}

/** One ^BC field per row, ^BY1 so a module is a dot and f=N so only bars ink. */
function buildZpl(cases: Case[]): string {
    let zpl = '^XA';
    cases.forEach((testCase, index) => {
        const y = FIELD_Y + index * FIELD_STEP;
        const data = testCase.mode === 'N' && testCase.subset
            ? `${START_PREFIX[testCase.subset]}${testCase.data}`
            : testCase.data;
        // ^BCo,h,f,g,e,m
        zpl += `^FO${FIELD_X},${y}^BY1^BCN,${BAR_HEIGHT},N,N,N,${testCase.mode}^FD${data}^FS`;
    });
    return `${zpl}^XZ`;
}

async function canvasRunsFor(page: any, cases: Case[]): Promise<number[][]> {
    return await page.evaluate(async (cases: Case[]) => {
        const [{ BarcodeElement }, { getBarcodeGeometry }] = await Promise.all([
            import('/src/elements/BarcodeElement.js'),
            import('/src/utils/barcodeGeometry.js'),
        ]);
        return cases.map((testCase) => {
            const element: any = new BarcodeElement(0, 0, testCase.data);
            element.width = 1;
            element.code128Mode = testCase.mode;
            element.code128Subset = testCase.subset || 'B';
            const geom: any = getBarcodeGeometry(element);
            const sbs = Array.from(geom.sbs, Number);
            // sbs alternates bar/space from index 0; an even length means it ends
            // on the trailing gap, which prints nothing.
            return sbs.length % 2 === 0 ? sbs.slice(0, -1) : sbs;
        });
    }, cases);
}

test('Code 128 canvas bars match Labelary', async ({ page }) => {
    await page.goto('/');

    const all = [...CASES, ZEBRA_TABLE_DIVERGENCE];
    const apiPng = PNG.sync.read(await renderLabelary(page, buildZpl(all)));
    const apiRuns = all.map((_, index) => runsAt(apiPng, index));
    const canvasRuns = await canvasRunsFor(page, all);

    // Report every case at once rather than failing on the first mismatch — the
    // point of this spec is the whole table.
    const describe = (index: number) =>
        `${all[index].name}\n  canvas: ${canvasRuns[index].join(',')}\n  api:    ${apiRuns[index].join(',')}`;
    const matches = (index: number) => JSON.stringify(canvasRuns[index]) === JSON.stringify(apiRuns[index]);

    const mismatched = CASES.map((_, index) => index).filter((index) => !matches(index)).map(describe);
    expect(mismatched).toEqual([]);

    // The one case where following Zebra's table means NOT matching Labelary.
    // Asserted as a divergence so that Labelary changing its mind is a failure
    // here rather than a silent drift in the parity table above.
    const divergenceIndex = all.length - 1;
    expect(matches(divergenceIndex), describe(divergenceIndex)).toBe(false);
    // Zebra: Start C, pair "95", pair "12". Labelary drops the invocation.
    expect(canvasRuns[divergenceIndex].length).toBe(apiRuns[divergenceIndex].length + 6);
});
