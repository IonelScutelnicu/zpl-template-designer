import { test, expect } from '../fixtures';
import { ElementsPanel, PropertiesPanel, Canvas, ZPLOutput } from '../page-objects';

test.describe('ZPL bitmap font bucketing', () => {

    // ============== snapBitmapFontSize pure-function tests ==============
    test.describe('snapBitmapFontSize() helper', () => {
        test.beforeEach(async ({ page }) => {
            await page.goto('/?e2e=1');
        });

        test('Font A: magStep=9 → rendered cap height capStep(7)·round(h/9)', async ({ page }) => {
            const result = await page.evaluate(async () => {
                const { snapBitmapFontSize } = await import('/src/utils/zplFontSnap.js');
                return [1, 9, 13, 14, 18, 22, 23, 27, 31, 32, 40, 41].map(h => ({
                    h,
                    snapped: snapBitmapFontSize('A', h, 5).height,
                }));
            });
            expect(result).toEqual([
                { h: 1,  snapped: 7 },   // n=1
                { h: 9,  snapped: 7 },   // n=1
                { h: 13, snapped: 7 },   // n=1
                { h: 14, snapped: 14 },  // n=2
                { h: 18, snapped: 14 },  // n=2
                { h: 22, snapped: 14 },  // n=2
                { h: 23, snapped: 21 },  // n=3
                { h: 27, snapped: 21 },  // n=3
                { h: 31, snapped: 21 },  // n=3
                { h: 32, snapped: 28 },  // n=4
                { h: 40, snapped: 28 },  // n=4
                { h: 41, snapped: 35 },  // n=5
            ]);
        });

        test('Font A snaps width independently: advStep(6)·round(w/5)', async ({ page }) => {
            const result = await page.evaluate(async () => {
                const { snapBitmapFontSize } = await import('/src/utils/zplFontSnap.js');
                return [1, 5, 7, 8, 10, 12, 13, 15, 17, 18].map(w => ({
                    w,
                    snapped: snapBitmapFontSize('A', 18, w).width,
                }));
            });
            expect(result).toEqual([
                { w: 1,  snapped: 6 },   // m=1
                { w: 5,  snapped: 6 },   // m=1
                { w: 7,  snapped: 6 },   // m=1
                { w: 8,  snapped: 12 },  // m=2
                { w: 10, snapped: 12 },  // m=2
                { w: 12, snapped: 12 },  // m=2
                { w: 13, snapped: 18 },  // m=3
                { w: 15, snapped: 18 },  // m=3
                { w: 17, snapped: 18 },  // m=3
                { w: 18, snapped: 24 },  // m=4
            ]);
        });

        test('Font B: magStep=11 → rendered cap height capStep(11)·round(h/11)', async ({ page }) => {
            const result = await page.evaluate(async () => {
                const { snapBitmapFontSize } = await import('/src/utils/zplFontSnap.js');
                return [11, 16, 17, 22, 27, 28].map(h => ({
                    h,
                    snapped: snapBitmapFontSize('B', h, 7).height,
                }));
            });
            expect(result).toEqual([
                { h: 11, snapped: 11 },  // n=1
                { h: 16, snapped: 11 },  // n=1
                { h: 17, snapped: 22 },  // n=2
                { h: 22, snapped: 22 },  // n=2
                { h: 27, snapped: 22 },  // n=2
                { h: 28, snapped: 33 },  // n=3
            ]);
        });

        test('Font E: magStep=28 → rendered cap height capStep(20)·round(h/28)', async ({ page }) => {
            const result = await page.evaluate(async () => {
                const { snapBitmapFontSize } = await import('/src/utils/zplFontSnap.js');
                return [14, 28, 41, 42, 56].map(h => ({
                    h,
                    snapped: snapBitmapFontSize('E', h, 15).height,
                }));
            });
            expect(result).toEqual([
                { h: 14, snapped: 20 },  // n=1 (round(0.5)=1)
                { h: 28, snapped: 20 },  // n=1
                { h: 41, snapped: 20 },  // n=1
                { h: 42, snapped: 40 },  // n=2
                { h: 56, snapped: 40 },  // n=2
            ]);
        });

        test('magnification clamps at maxMag=10', async ({ page }) => {
            const result = await page.evaluate(async () => {
                const { snapBitmapFontSize } = await import('/src/utils/zplFontSnap.js');
                // Font B: 11·10 = 110 cap height, 9·10 = 90 advance, regardless of how large.
                return [200, 500, 1000].map(h => snapBitmapFontSize('B', h, 0));
            });
            expect(result).toEqual([
                { height: 110, width: 90 },
                { height: 110, width: 90 },
                { height: 110, width: 90 },
            ]);
        });

        test('no explicit width → width magnification follows height (natural)', async ({ page }) => {
            const result = await page.evaluate(async () => {
                const { snapBitmapFontSize } = await import('/src/utils/zplFontSnap.js');
                // Font B n=round(46/11)=4 → cap 44, advance 9·4=36.
                return snapBitmapFontSize('B', 46, 0);
            });
            expect(result).toEqual({ height: 44, width: 36 });
        });

        test('Font 0 (scalable) passes through unchanged', async ({ page }) => {
            const result = await page.evaluate(async () => {
                const { snapBitmapFontSize } = await import('/src/utils/zplFontSnap.js');
                return [10, 14, 18, 23, 100].map(h => snapBitmapFontSize('0', h, h));
            });
            expect(result).toEqual([
                { height: 10,  width: 10 },
                { height: 14,  width: 14 },
                { height: 18,  width: 18 },
                { height: 23,  width: 23 },
                { height: 100, width: 100 },
            ]);
        });

        test('unknown fontId passes through unchanged', async ({ page }) => {
            const result = await page.evaluate(async () => {
                const { snapBitmapFontSize } = await import('/src/utils/zplFontSnap.js');
                return snapBitmapFontSize('Z', 14, 7);
            });
            expect(result).toEqual({ height: 14, width: 7 });
        });

        test('zero and negative input still snap to magnification 1 minimum', async ({ page }) => {
            const result = await page.evaluate(async () => {
                const { snapBitmapFontSize } = await import('/src/utils/zplFontSnap.js');
                return [0, -1, -5].map(v => snapBitmapFontSize('A', v, v));
            });
            // Math.max(1, round(...)) clamps to magnification 1; non-positive width
            // is treated as "no width" so the advance follows the height (capStep 7, advStep 6).
            expect(result).toEqual([
                { height: 7, width: 6 },
                { height: 7, width: 6 },
                { height: 7, width: 6 },
            ]);
        });

        test('per-font line height resolves from configured ratios', async ({ page }) => {
            const result = await page.evaluate(async () => {
                const { resolveFontLineHeight, resolveFontMetrics } = await import('/src/utils/fontMetrics.js');
                const { ZPL_FONTS } = await import('/src/config/constants.js');
                const labelSettings = { fontId: '0', defaultFontHeight: 20, defaultFontWidth: 0 };

                const fontA = resolveFontMetrics({ fontId: 'A', fontSize: 18, fontWidth: 10 }, labelSettings, 1);
                const fontB = resolveFontMetrics({ fontId: 'B', fontSize: 22, fontWidth: 14 }, labelSettings, 1);
                const fontE = resolveFontMetrics({ fontId: 'E', fontSize: 28, fontWidth: 15 }, labelSettings, 1);

                return {
                    aField: resolveFontLineHeight(fontA, 1.0),
                    aTextBlock: resolveFontLineHeight(fontA, 1, 1, 'textBlockLineHeightRatio', 'fontSize'),
                    bField: resolveFontLineHeight(fontB, 1.0),
                    eField: resolveFontLineHeight(fontE, 1.0),
                    expectedAField: fontA.snappedHeight * ZPL_FONTS.A.lineHeightRatio,
                    expectedATextBlock: fontA.fontSize * ZPL_FONTS.A.textBlockLineHeightRatio,
                    expectedBField: fontB.snappedHeight * ZPL_FONTS.B.lineHeightRatio,
                    expectedEField: fontE.snappedHeight * ZPL_FONTS.E.lineHeightRatio,
                };
            });

            expect(result.aField).toBeCloseTo(result.expectedAField, 2);
            expect(result.aTextBlock).toBeCloseTo(result.expectedATextBlock, 2);
            expect(result.bField).toBeCloseTo(result.expectedBField, 2);
            expect(result.eField).toBeCloseTo(result.expectedEField, 2);
        });
    });

    // ============== Canvas rendering snaps to bucket ==============
    test.describe('Canvas rendering snaps bitmap-font sizes', () => {
        let elementsPanel: ElementsPanel;
        let propertiesPanel: PropertiesPanel;
        let canvas: Canvas;

        test.beforeEach(async ({ page }) => {
            await page.goto('/?e2e=1');
            elementsPanel = new ElementsPanel(page);
            propertiesPanel = new PropertiesPanel(page);
            canvas = new Canvas(page);
            await canvas.waitForReady();
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);
            // Pin the preview text so screenshot equality isn't shifted by
            // default text-content changes between runs.
            await propertiesPanel.setProperty('prop-preview-text', 'Hello');
        });

        async function renderAt(fontId: string, h: number, w: number): Promise<Buffer> {
            await propertiesPanel.setSelectValue('prop-font-id', fontId);
            await propertiesPanel.setFontHeight(h);
            await propertiesPanel.setFontWidth(w);
            await canvas.waitForReady();
            return await canvas.takeFullResolutionScreenshot();
        }

        test('Font A: heights 14/18/22 produce identical pixels (bucket 2)', async () => {
            const a = await renderAt('A', 14, 10);
            const b = await renderAt('A', 18, 10);
            const c = await renderAt('A', 22, 10);
            expect(a.equals(b)).toBe(true);
            expect(b.equals(c)).toBe(true);
        });

        test('Font A: heights 23/27/31 produce identical pixels (bucket 3)', async () => {
            const a = await renderAt('A', 23, 15);
            const b = await renderAt('A', 27, 15);
            const c = await renderAt('A', 31, 15);
            expect(a.equals(b)).toBe(true);
            expect(b.equals(c)).toBe(true);
        });

        test('Font A: heights 13 vs 14 differ (bucket 1 vs bucket 2 boundary)', async () => {
            const a = await renderAt('A', 13, 5);
            const b = await renderAt('A', 14, 10);
            expect(a.equals(b)).toBe(false);
        });

        test('Font A: widths 8/10/12 produce identical pixels at fixed height (width bucket 2)', async () => {
            const a = await renderAt('A', 18, 8);
            const b = await renderAt('A', 18, 10);
            const c = await renderAt('A', 18, 12);
            expect(a.equals(b)).toBe(true);
            expect(b.equals(c)).toBe(true);
        });

        test('Font A: widths 12 vs 13 differ (width bucket boundary at fixed height)', async () => {
            const a = await renderAt('A', 18, 12);
            const b = await renderAt('A', 18, 13);
            expect(a.equals(b)).toBe(false);
        });

        test('Font 0 (scalable): heights 14 vs 18 differ — no bucketing', async () => {
            const a = await renderAt('0', 14, 14);
            const b = await renderAt('0', 18, 18);
            expect(a.equals(b)).toBe(false);
        });

        // ============== No explicit font width: natural-width fallback ==============
        // When neither element.fontWidth nor labelSettings.defaultFontWidth is
        // set, the canvas must render at the font's natural proportional width
        // (matching ZPL/Labelary "^A...,h" with no comma+width). Regression
        // guard for commit 61d81c2 ("Improve the fonts rendering"): the prior
        // |20 fallback produced scaleX ≈ 20/74 ≈ 0.27 for Font 0 at h=74.

        async function measureGlyphBBox(page: import('@playwright/test').Page): Promise<{ w: number; h: number; darkCount: number }> {
            return await page.evaluate(() => {
                const canvas = document.getElementById('label-canvas') as HTMLCanvasElement;
                const ctx = canvas.getContext('2d')!;
                const { width, height } = canvas;
                const data = ctx.getImageData(0, 0, width, height).data;
                let top = -1, bot = -1, left = -1, right = -1, dark = 0;
                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        const i = (y * width + x) * 4;
                        if (data[i] < 60 && data[i + 1] < 60 && data[i + 2] < 60 && data[i + 3] > 200) {
                            if (top === -1) top = y;
                            bot = y;
                            if (left === -1 || x < left) left = x;
                            if (x > right) right = x;
                            dark++;
                        }
                    }
                }
                return { w: right - left + 1, h: bot - top + 1, darkCount: dark };
            });
        }

        test('Font 0 with no explicit width renders at natural proportional width', async ({ page }) => {
            await propertiesPanel.setSelectValue('prop-font-id', '0');
            await propertiesPanel.setFontHeight(74);
            // Clear fontWidth — exercises the no-explicit-width path.
            await propertiesPanel.setProperty('prop-font-width', '');
            await canvas.waitForReady();
            await canvas.deselect();

            const elementFontWidth = await page.evaluate(() => {
                const w = window as unknown as { appState?: { elements: Array<{ fontWidth?: number }> } };
                return w.appState?.elements[0]?.fontWidth;
            });
            expect(elementFontWidth).toBe(0);

            const bbox = await measureGlyphBBox(page);
            // Bug case: scaleX ≈ 20/74 ≈ 0.27 → bbox.w ≈ natural × 0.27
            // ≈ 40 px ("Hello"). Fixed (scaleX=1): bbox.w follows Roboto
            // Condensed Bold natural width (~147 px observed). Threshold at
            // 0.3 × fontSize × charCount = 111 px separates them with margin.
            const fontSize = 74;
            const charCount = 5; // "Hello"
            expect(bbox.w).toBeGreaterThan(0.3 * fontSize * charCount);
        });

        test('Font A with no width matches Font A with explicit bucket width', async ({ page }) => {
            await propertiesPanel.setSelectValue('prop-font-id', 'A');
            await propertiesPanel.setFontHeight(14);
            await propertiesPanel.setProperty('prop-font-width', '');
            await canvas.waitForReady();
            await canvas.deselect();
            const blank = await measureGlyphBBox(page);

            // Explicit width 10 matches the bucket the no-width path snaps to
            // (height 14 → bucket 18×10 for Font A). scaleX differs only by
            // 0.08% due to aspectRatio rounding (0.556 vs exact 5/9).
            await propertiesPanel.setFontWidth(10);
            await canvas.waitForReady();
            await canvas.deselect();
            const explicit = await measureGlyphBBox(page);

            expect(Math.abs(blank.w - explicit.w)).toBeLessThanOrEqual(2);
            expect(Math.abs(blank.h - explicit.h)).toBeLessThanOrEqual(2);
            // Dark-pixel count within ~5% covers rounding/AA differences.
            const denom = Math.max(blank.darkCount, explicit.darkCount, 1);
            expect(Math.abs(blank.darkCount - explicit.darkCount) / denom).toBeLessThan(0.05);
        });

        test('Font 0 with no width is pixel-equal to Font 0 with width=fontSize', async () => {
            await propertiesPanel.setSelectValue('prop-font-id', '0');
            await propertiesPanel.setFontHeight(30);
            await propertiesPanel.setProperty('prop-font-width', '');
            await canvas.waitForReady();
            const blank = await canvas.takeFullResolutionScreenshot();

            // For non-monospace Font 0, scaleX = fontWidth/fontSize = 1, which
            // matches the no-width scaleX=1 path exactly.
            await propertiesPanel.setFontWidth(30);
            await canvas.waitForReady();
            const explicit = await canvas.takeFullResolutionScreenshot();

            expect(blank.equals(explicit)).toBe(true);
        });

        // Regression guard for the two-constant bitmap model: a single per-font
        // aspectRatio could only match one size, so the rendered glyph aspect drifted
        // as the font grew (the bug this replaced). With scaleX constant per font, the
        // drawn glyph-box aspect (width/height) must stay stable across magnifications.
        test('Font B: glyph aspect ratio is scale-invariant across magnifications', async ({ page }) => {
            await propertiesPanel.setSelectValue('prop-font-id', 'B');
            await propertiesPanel.setProperty('prop-font-width', '');
            await propertiesPanel.setProperty('prop-preview-text', 'HHHHHH');

            const aspects: number[] = [];
            for (const h of [22, 44, 66, 99]) { // magnifications n = 2,4,6,9
                await propertiesPanel.setFontHeight(h);
                await canvas.waitForReady();
                await canvas.deselect();
                const b = await measureGlyphBBox(page);
                aspects.push(b.w / b.h);
            }

            const min = Math.min(...aspects);
            const max = Math.max(...aspects);
            // All within 6% of each other (allows sub-pixel/AA rounding at small sizes).
            expect((max - min) / min).toBeLessThan(0.06);
        });
    });

    // ============== ZPL output preserves raw values ==============
    test.describe('ZPL output is not rewritten by snap', () => {
        let elementsPanel: ElementsPanel;
        let propertiesPanel: PropertiesPanel;
        let zplOutput: ZPLOutput;

        test.beforeEach(async ({ page }) => {
            await page.goto('/?e2e=1');
            elementsPanel = new ElementsPanel(page);
            propertiesPanel = new PropertiesPanel(page);
            zplOutput = new ZPLOutput(page);
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);
            await propertiesPanel.setSelectValue('prop-font-id', 'A');
        });

        test('Font A: emits ^AAN,14,8 even though canvas snaps to bucket 2 (18×10)', async () => {
            await propertiesPanel.setFontHeight(14);
            await propertiesPanel.setFontWidth(8);
            await zplOutput.verifyZPLContains('^AAN,14,8');
        });

        test('Font A: emits ^AAN,23,15 verbatim (canvas snaps to bucket 3)', async () => {
            await propertiesPanel.setFontHeight(23);
            await propertiesPanel.setFontWidth(15);
            await zplOutput.verifyZPLContains('^AAN,23,15');
        });
    });
});
