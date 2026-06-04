import { test, expect } from '../fixtures';
import { Canvas } from '../page-objects';
import { compareWithBaseline } from '../fixtures/image-comparison';

// Pixel-level appearance baselines for the four 1D barcode symbologies across
// every allowed Module Width (^BY first param, 1..10 dots), with the
// human-readable interpretation (HRI) line both above and under the bars.
// Each label stacks all 10 module widths; any regression in BarcodeRenderer /
// barcodeGeometry (bar widths, Code 39 ratio quantization, EAN/UPC guard bars,
// HRI placement/size) diffs visibly. Mirrors font-baseline.spec.ts.

const DPMM = 8;
const PADDING = 16;          // dots of margin around the stack
const GAP = 20;              // dots between stacked rows
const WIDTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// 1D symbologies + their default sample data (DEFAULT_PREVIEW_DATA in
// barcodeGeometry.js). Kept inline so the test is self-describing.
const SYMBOLOGIES = [
    { sym: 'CODE128', data: '1234567890' },
    { sym: 'CODE39', data: 'CODE39' },
    { sym: 'EAN13', data: '123456789012' },
    { sym: 'UPCA', data: '12345678901' },
];

const HRI_POSITIONS: Array<'above' | 'under'> = ['above', 'under'];

// Bar height grows with module width so wide-module symbols stay scannable.
const barHeight = (w: number) => 40 + 6 * w;
const eanUpcHriFont = (w: number) => w <= 1 ? 16 : w <= 6 ? 23 : 32;
// HRI band reserved above/below the bars. EAN-13/UPC-A use bucketed HRI sizes
// while Code 128/39 still grow proportionally with module width.
const hriFont = (sym: string, w: number) => (sym === 'EAN13' || sym === 'UPCA') ? eanUpcHriFont(w) : 9 * w;
const hriBand = (sym: string, w: number) => Math.ceil(1.6 * hriFont(sym, w)) + 16;

for (const { sym, data } of SYMBOLOGIES) {
    test.describe(`Barcode ${sym} module-width baseline`, () => {
        let canvas: Canvas;

        test.beforeEach(async ({ page }) => {
            await page.goto('/?e2e=1');
            canvas = new Canvas(page);
            await canvas.waitForReady();
        });

        for (const hri of HRI_POSITIONS) {
            test(`HRI ${hri}`, async ({ page }) => {
                await page.evaluate(async ({ sym, data, hri, WIDTHS, DPMM, PADDING, GAP }) => {
                    const [{ BarcodeElement }, { getBarcodeGeometry }] = await Promise.all([
                        import('/src/elements/BarcodeElement.js'),
                        import('/src/utils/barcodeGeometry.js'),
                    ]);

                    const above = hri === 'above';
                    const barH = (w: number) => 40 + 6 * w;
                    const eanUpcHriFont = (w: number) => w <= 1 ? 16 : w <= 6 ? 23 : 32;
                    // EAN/UPC above-bars HRI uses font A at requested height 9·min(w,9)
                    // (taller); below keeps the OCR-B bucket. Code 128/39 grow with width.
                    const hriFont = (sym: string, w: number, above: boolean) =>
                        (sym === 'EAN13' || sym === 'UPCA')
                            ? (above ? 9 * Math.min(w, 9) : eanUpcHriFont(w))
                            : 9 * w;
                    const band = (sym: string, w: number) => Math.ceil(1.6 * hriFont(sym, w, above)) + 16;

                    const elements: any[] = [];
                    let yCursor = PADDING;
                    let maxRight = 0;

                    for (const w of WIDTHS) {
                        const h = barH(w);
                        const b = band(sym, w);
                        // Above: reserve the HRI band above the bars so the line
                        // doesn't collide with the previous row. Under: bars sit at
                        // the cursor and the band follows below.
                        const y = above ? yCursor + b : yCursor;
                        const el = new (BarcodeElement as any)(
                            PADDING, y, data, h, w, 2.0, '', true, false, sym, false, 'N', above,
                        );
                        elements.push(el);

                        const geom = getBarcodeGeometry(el) as any;
                        const modules = geom.kind === 'linear' ? geom.modules : data.length * 11 + 35;
                        maxRight = Math.max(maxRight, PADDING + modules * w);

                        const rowBottom = above ? y + h + 13 : y + h + b;
                        yCursor = rowBottom + GAP;
                    }

                    const widthMm = Math.ceil((maxRight + PADDING) / DPMM);
                    const heightMm = Math.ceil((yCursor + PADDING) / DPMM);

                    const w = window as unknown as {
                        appState: {
                            setElements: (e: unknown[]) => void;
                            updateLabelSettings: (c: Record<string, unknown>) => void;
                            elements: unknown[];
                            labelSettings: unknown;
                        };
                        canvasRenderer: { renderCanvas: (e: unknown[], ls: unknown, sel: unknown) => void };
                    };
                    w.appState.updateLabelSettings({ width: widthMm, height: heightMm, dpmm: DPMM });
                    w.appState.setElements(elements);
                    w.canvasRenderer.renderCanvas(w.appState.elements, w.appState.labelSettings, null);
                }, { sym, data, hri, WIDTHS, DPMM, PADDING, GAP });

                const dataUrl = await page.evaluate(() => {
                    const w = window as unknown as {
                        appState: { elements: unknown[]; labelSettings: unknown };
                        canvasRenderer: {
                            setZoom: (zoom: number) => void;
                            renderCanvas: (els: unknown[], ls: unknown, sel: unknown) => void;
                        };
                    };
                    w.canvasRenderer.setZoom(1);
                    w.canvasRenderer.renderCanvas(w.appState.elements, w.appState.labelSettings, null);
                    return (document.getElementById('label-canvas') as HTMLCanvasElement).toDataURL('image/png');
                });
                const png = Buffer.from(dataUrl.split(',')[1], 'base64');
                const result = await compareWithBaseline(
                    png,
                    `barcode-${sym.toLowerCase()}-hri-${hri}`,
                    { threshold: 0.1 },
                );

                expect(result.diffPercentage).toBeLessThan(1);
            });
        }
    });
}
