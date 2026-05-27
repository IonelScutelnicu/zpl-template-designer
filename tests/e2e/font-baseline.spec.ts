import { test, expect } from '../fixtures';
import { ElementsPanel, PropertiesPanel, Canvas } from '../page-objects';
import { compareWithBaseline } from '../fixtures/image-comparison';

// Pixel-level appearance baselines for the 8 ZPL bitmap fonts (A-H).
// Each font gets 3 sweeps — height-only, width-only, both — at multipliers
// 1x..5x of its native base size. font-bucketing.spec.ts covers the snap
// function; this spec covers actual glyph rendering: any regression in font
// family fallback, letter spacing, scaleX math, or AA will diff visibly.

interface FontDef {
    id: string;
    baseH: number;
    baseW: number;
}

const FONTS: FontDef[] = [
    { id: 'A', baseH: 9,  baseW: 5  },
    { id: 'B', baseH: 11, baseW: 7  },
    { id: 'C', baseH: 18, baseW: 10 },
    { id: 'D', baseH: 18, baseW: 10 },
    { id: 'E', baseH: 28, baseW: 15 },
    { id: 'F', baseH: 26, baseW: 15 },
    { id: 'G', baseH: 60, baseW: 40 },
    { id: 'H', baseH: 21, baseW: 13 },
];

const BUCKETS = [1, 2, 3, 4, 5];
const SAMPLE_TEXT = 'Sample Text';
const PADDING = 10;
const DPMM = 8;
const FIXED_HEIGHT_MULT = 3;

interface Sweep {
    name: 'height' | 'width' | 'both';
    sizes: (mult: number, baseH: number, baseW: number) => { h: number; w: number };
}

const SWEEPS: Sweep[] = [
    { name: 'height', sizes: (k, bH, bW) => ({ h: bH * k, w: bW }) },
    { name: 'width',  sizes: (k, bH, bW) => ({ h: bH * FIXED_HEIGHT_MULT, w: bW * k }) },
    { name: 'both',   sizes: (k, bH, bW) => ({ h: bH * k, w: bW * k }) },
];

function labelSizeMm(font: FontDef): { widthMm: number; heightMm: number } {
    const maxK = Math.max(...BUCKETS);
    const widestDots = font.baseW * maxK * SAMPLE_TEXT.length + 2 * PADDING;
    const heightSweepDots = BUCKETS.reduce((s, k) => s + font.baseH * k, 0)
        + PADDING * (BUCKETS.length + 1);
    const widthSweepDots = BUCKETS.length * font.baseH * FIXED_HEIGHT_MULT
        + PADDING * (BUCKETS.length + 1);
    const tallestDots = Math.max(heightSweepDots, widthSweepDots);
    return {
        widthMm: Math.ceil(widestDots / DPMM),
        heightMm: Math.ceil(tallestDots / DPMM),
    };
}

for (const font of FONTS) {
    test.describe(`Font ${font.id} baseline`, () => {
        let elementsPanel: ElementsPanel;
        let propertiesPanel: PropertiesPanel;
        let canvas: Canvas;

        test.beforeEach(async ({ page }) => {
            await page.goto('/?e2e=1');
            elementsPanel = new ElementsPanel(page);
            propertiesPanel = new PropertiesPanel(page);
            canvas = new Canvas(page);

            const { widthMm, heightMm } = labelSizeMm(font);
            // Nobody listens to labelSettingsChanged, so resize the canvas
            // ourselves before adding elements.
            await page.evaluate(({ widthMm, heightMm, dpmm }) => {
                const w = window as unknown as {
                    appState: {
                        updateLabelSettings: (changes: Record<string, unknown>) => void;
                        elements: unknown[];
                        labelSettings: unknown;
                    };
                    canvasRenderer: {
                        renderCanvas: (e: unknown[], ls: unknown, sel: unknown) => void;
                    };
                };
                w.appState.updateLabelSettings({ width: widthMm, height: heightMm, dpmm });
                w.canvasRenderer.renderCanvas(w.appState.elements, w.appState.labelSettings, null);
            }, { widthMm, heightMm, dpmm: DPMM });

            await canvas.waitForReady();
        });

        for (const sweep of SWEEPS) {
            test(`${sweep.name} sweep`, async () => {
                let yCursor = PADDING;
                for (let i = 0; i < BUCKETS.length; i++) {
                    const k = BUCKETS[i];
                    const { h, w } = sweep.sizes(k, font.baseH, font.baseW);

                    await elementsPanel.addTextElement();
                    await elementsPanel.selectElementByIndex(i);
                    await propertiesPanel.setSelectValue('prop-font-id', font.id);
                    await propertiesPanel.setProperty('prop-preview-text', SAMPLE_TEXT);
                    await propertiesPanel.setProperty('prop-x', PADDING);
                    await propertiesPanel.setProperty('prop-y', yCursor);
                    await propertiesPanel.setFontHeight(h);
                    await propertiesPanel.setFontWidth(w);

                    yCursor += h + PADDING;
                }

                await canvas.waitForReady();
                const png = await canvas.takeFullResolutionScreenshot();
                const result = await compareWithBaseline(
                    png,
                    `font-${font.id}-${sweep.name}-sweep`,
                    { threshold: 0.1 },
                );

                expect(result.diffPercentage).toBeLessThan(1);
            });
        }
    });
}

// Rotation baselines: guard that rotated text stays aligned. Two regressions
// are covered: (1) per-font x/y nudges must travel in the local frame, not the
// screen frame; (2) the R/I rotation pivot must include the glyph descender,
// not just cap-ink height (snappedHeight) — otherwise descender-bearing bitmap
// fonts shift by the descender depth at R and I. Coverage:
//   '0' — scalable, exercises the y nudge
//   'A' — bitmap WITH descenders ('p' in Sample), guards the descender pivot
//   'H' — bitmap, largest xOffset (filters lowercase → no descender)
const ROTATION_FONTS = ['0', 'A', 'H'];
const ORIENTATIONS = ['R', 'I', 'B'];
const ROT_SIZE = 40;

for (const fontId of ROTATION_FONTS) {
    test.describe(`Font ${fontId} rotation baseline`, () => {
        let elementsPanel: ElementsPanel;
        let propertiesPanel: PropertiesPanel;
        let canvas: Canvas;

        test.beforeEach(async ({ page }) => {
            await page.goto('/?e2e=1');
            elementsPanel = new ElementsPanel(page);
            propertiesPanel = new PropertiesPanel(page);
            canvas = new Canvas(page);

            await page.evaluate((dpmm) => {
                const w = window as unknown as {
                    appState: {
                        updateLabelSettings: (changes: Record<string, unknown>) => void;
                        elements: unknown[];
                        labelSettings: unknown;
                    };
                    canvasRenderer: {
                        renderCanvas: (e: unknown[], ls: unknown, sel: unknown) => void;
                    };
                };
                w.appState.updateLabelSettings({ width: 50, height: 50, dpmm });
                w.canvasRenderer.renderCanvas(w.appState.elements, w.appState.labelSettings, null);
            }, DPMM);

            await canvas.waitForReady();
        });

        for (const orientation of ORIENTATIONS) {
            test(`orientation ${orientation}`, async ({ page }) => {
                await elementsPanel.addTextElement();
                await elementsPanel.selectElementByIndex(0);
                await propertiesPanel.setSelectValue('prop-font-id', fontId);
                await propertiesPanel.setProperty('prop-preview-text', 'Sample');
                await propertiesPanel.setProperty('prop-x', 60);
                await propertiesPanel.setProperty('prop-y', 60);
                await propertiesPanel.setFontHeight(ROT_SIZE);
                await page.locator(`#properties-panel [data-orientation="${orientation}"]`).click();

                await canvas.waitForReady();
                const png = await canvas.takeFullResolutionScreenshot();
                const result = await compareWithBaseline(
                    png,
                    `font-${fontId}-rot-${orientation}`,
                    { threshold: 0.1 },
                );

                expect(result.diffPercentage).toBeLessThan(1);
            });
        }
    });
}
