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
            // Re-select first: takeFullResolutionScreenshot() deselects (nulls
            // selection) between calls without re-rendering the panel, and a font
            // change now re-renders the panel from the live selection.
            await elementsPanel.selectElementByIndex(0);
            await propertiesPanel.setSelectValue('prop-font-id', fontId);
            await propertiesPanel.setFontHeight(h);
            await propertiesPanel.setFontWidth(w);
            await canvas.waitForReady();
            return await canvas.takeFullResolutionScreenshot();
        }

        // Note: intermediate-value bucketing (e.g. heights 14/18/22 collapsing to one
        // bucket) is no longer reachable through the UI — bitmap fonts now expose only
        // allowed sizes via dropdowns. The snap law itself is covered exhaustively by
        // the snapBitmapFontSize() pure-function tests above.

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
            await propertiesPanel.setFontHeight(18);
            await propertiesPanel.setProperty('prop-font-width', '');
            await canvas.waitForReady();
            await canvas.deselect();
            const blank = await measureGlyphBBox(page);

            // Explicit width 10 matches the bucket the no-width path snaps to
            // (height 18 → magnification 2 → advance bucket for width 10 on Font A).
            // scaleX differs only by 0.08% due to aspectRatio rounding (0.556 vs 5/9).
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

    // ============== Allowed-size dropdowns store & emit snapped values ==============
    test.describe('Bitmap-font size dropdowns', () => {
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
        });

        async function optionTexts(page: import('@playwright/test').Page, id: string): Promise<string[]> {
            return await page.locator(`#${id} option`).allTextContents();
        }

        test('Font A: size/width controls are dropdowns of the allowed values', async ({ page }) => {
            await propertiesPanel.setSelectValue('prop-font-id', 'A');
            const heightTag = await page.locator('#prop-font-size').evaluate((el) => el.tagName);
            expect(heightTag).toBe('SELECT');
            // Font A: magStep 9 → 9..90 ; magWidthStep 5 → 5..50, each plus a Default.
            expect(await optionTexts(page, 'prop-font-size')).toEqual(
                ['Default', '9', '18', '27', '36', '45', '54', '63', '72', '81', '90']
            );
            expect(await optionTexts(page, 'prop-font-width')).toEqual(
                ['Default (proportional)', '5', '10', '15', '20', '25', '30', '35', '40', '45', '50']
            );
        });

        test('Font A: selecting an allowed size stores & emits it verbatim', async () => {
            await propertiesPanel.setSelectValue('prop-font-id', 'A');
            await propertiesPanel.setFontHeight(36);
            await propertiesPanel.setFontWidth(10);
            await zplOutput.verifyZPLContains('^AAN,36,10');
        });

        test('Switching font A→B re-snaps the stored size to the new grid', async ({ page }) => {
            await propertiesPanel.setSelectValue('prop-font-id', 'A');
            await propertiesPanel.setFontHeight(36); // allowed for A (9×4)
            // Font B magStep 11 → 36 snaps to nearest 11×n: round(36/11)=3 → 33.
            await propertiesPanel.setSelectValue('prop-font-id', 'B');
            await expect(page.locator('#prop-font-size')).toHaveValue('33');
            await zplOutput.verifyZPLContains('^ABN,33');
        });

        test('Scalable Font 0 keeps a numeric input accepting arbitrary values', async ({ page }) => {
            await propertiesPanel.setSelectValue('prop-font-id', '0');
            const tag = await page.locator('#prop-font-size').evaluate((el) => el.tagName);
            expect(tag).toBe('INPUT');
            await propertiesPanel.setFontHeight(23);
            await zplOutput.verifyZPLContains('^A0N,23');
        });
    });

    // ============== ZPL import snaps to the allowed grid ==============
    test.describe('ZPL import snaps bitmap-font sizes', () => {
        test.beforeEach(async ({ page }) => {
            await page.goto('/?e2e=1');
        });

        test('imports off-grid heights/widths to the nearest allowed value', async ({ page }) => {
            const parsed = await page.evaluate(async () => {
                const mod = await import('/src/services/ZPLParser.js');
                const ParserClass = (mod as any).ZPLParser || (mod as any).default;
                const parser = new ParserClass();
                const opts = { dpmm: 8, labelHeight: 50 };
                // Font B (magStep 11, magWidthStep 7): 12,7 → round(12/11)=1→11, round(7/7)=1→7
                const b = parser.parse('^XA^FO50,50^ABN,12,7^FDHi^FS^XZ', opts).elements[0];
                // Font A (magStep 9, magWidthStep 5): 15,4 → round(15/9)=2→18, round(4/5)=1→5
                const a = parser.parse('^XA^FO10,10^AAN,15,4^FDX^FS^XZ', opts).elements[0];
                return {
                    b: { fontSize: b.fontSize, fontWidth: b.fontWidth },
                    a: { fontSize: a.fontSize, fontWidth: a.fontWidth },
                };
            });
            expect(parsed.b).toEqual({ fontSize: 11, fontWidth: 7 });
            expect(parsed.a).toEqual({ fontSize: 18, fontWidth: 5 });
        });
    });

    // ============== Inherited label default font ==============
    // Elements that inherit the label font (fontId === '') resolve their effective
    // font from labelSettings.fontId. When that default is a bitmap font, their sizes
    // must still snap to the allowed grid.
    test.describe('Inherited label default font', () => {
        test.beforeEach(async ({ page }) => {
            await page.goto('/?e2e=1');
        });

        test('createElementFromData snaps an inherited element to the passed label default', async ({ page }) => {
            const r = await page.evaluate(async () => {
                const mod = await import('/src/services/SerializationService.js');
                const Svc = (mod as any).SerializationService;
                const s = new Svc();
                // fontId '' inherits the label default. Font A: 33→36, 11→10.
                const el = s.createElementFromData(
                    { type: 'TEXT', x: 0, y: 0, previewText: 'X', fontId: '', fontSize: 33, fontWidth: 11, orientation: 'N', reverse: false },
                    { labelFontId: 'A' },
                );
                const elNoDefault = s.createElementFromData(
                    { type: 'TEXT', x: 0, y: 0, previewText: 'X', fontId: '', fontSize: 33, fontWidth: 11, orientation: 'N', reverse: false },
                    {},
                );
                return {
                    withDefault: { h: el.fontSize, w: el.fontWidth },
                    withoutDefault: { h: elNoDefault.fontSize, w: elNoDefault.fontWidth },
                };
            });
            expect(r.withDefault).toEqual({ h: 36, w: 10 });
            // No label default → resolves to scalable Font 0 → left unchanged.
            expect(r.withoutDefault).toEqual({ h: 33, w: 11 });
        });

        test('switching the label default to a bitmap font re-snaps inherited element sizes', async ({ page }) => {
            const elementsPanel = new ElementsPanel(page);
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);
            // Off-grid size while the default font is scalable (0): the size input is numeric.
            await page.locator('#prop-font-size').fill('33');
            await page.locator('#prop-font-size').dispatchEvent('input');
            // Switch the label default font to A (bitmap). The selector lives in a
            // collapsed section, so drive the change event directly.
            await page.evaluate(() => {
                const sel = document.getElementById('font-id') as HTMLSelectElement;
                sel.value = 'A';
                sel.dispatchEvent(new Event('change', { bubbles: true }));
            });
            const fontSize = await page.evaluate(() =>
                (window as unknown as { appState: { elements: Array<{ fontSize: number }> } }).appState.elements[0].fontSize);
            expect(fontSize).toBe(36); // 33 snapped to Font A's grid (9×4)
        });

        test('paste snaps an inherited element to the current label default bitmap font', async ({ page }) => {
            // Set label default to Font A (bitmap), then create a TEXT element that
            // inherits it (fontId === '') with an allowed size via the dropdown.
            // Inject an off-grid value into the serialised clipboard data directly
            // so that pasteElement receives an off-grid fontSize and must snap it.
            await page.evaluate(() => {
                const sel = document.getElementById('font-id') as HTMLSelectElement;
                sel.value = 'A';
                sel.dispatchEvent(new Event('change', { bubbles: true }));
            });
            const elementsPanel = new ElementsPanel(page);
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);

            // Inject an off-grid fontSize (33) into the app's internal clipboard,
            // bypassing the UI so we can test pasteElement in isolation.
            await page.evaluate(() => {
                const w = window as unknown as {
                    appState: { elements: Array<{ fontSize: number; fontId: string }> };
                    clipboardData?: { fontSize: number };
                };
                // Serialise the element then mutate the copy to be off-grid.
                const el = w.appState.elements[0];
                const copy = JSON.parse(JSON.stringify(el));
                copy.fontSize = 33; // off-grid for Font A (allowed: 9,18,27,36…)
                // Write into the interaction handler's clipboard (the object
                // the Ctrl+V handler pastes from).
                const ih = (window as any).interactionHandler;
                if (ih) ih.clipboardData = copy;
            });

            await page.keyboard.press('Control+v');
            await page.waitForTimeout(150);

            const pastedFontSize = await page.evaluate(() => {
                const w = window as unknown as { appState: { elements: Array<{ fontSize: number }> } };
                // The pasted element is the last one added.
                const els = w.appState.elements;
                return els[els.length - 1]?.fontSize;
            });
            // pasteElement passes labelFontId:'A' → 33 snaps to 36 (9×4).
            expect(pastedFontSize).toBe(36);
        });

        test('undo/redo restores inherited element sizes on the allowed grid', async ({ page }) => {
            // Set label default to Font B (bitmap) and create an inherited element.
            // Inject an off-grid snapshot into the history so that restore() receives
            // an off-grid fontSize and must snap it via labelFontId.
            await page.evaluate(() => {
                const sel = document.getElementById('font-id') as HTMLSelectElement;
                sel.value = 'B';
                sel.dispatchEvent(new Event('change', { bubbles: true }));
            });
            const elementsPanel = new ElementsPanel(page);
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);
            const propertiesPanel = new PropertiesPanel(page);
            await propertiesPanel.setFontHeight(22); // on-grid for Font B (11×2)
            await page.waitForTimeout(400); // flush history debounce

            // Push a second history entry with an off-grid fontSize baked in.
            // We do this by mutating the state directly then calling pushHistory
            // via the exposed appState so the snapshot carries fontSize=25.
            await page.evaluate(() => {
                const w = window as unknown as {
                    appState: {
                        elements: Array<{ fontSize: number }>;
                        addHistoryEntry: (e: object) => void;
                        getHistoryIndex: () => number;
                        labelSettings: object;
                    };
                };
                w.appState.elements[0].fontSize = 25; // off-grid for Font B
                // Capture the dirty snapshot manually.
                const snap = {
                    id: Date.now(),
                    label: 'test-off-grid',
                    timestamp: new Date(),
                    kind: 'edit',
                    detail: '',
                    state: {
                        elements: JSON.parse(JSON.stringify(w.appState.elements)),
                        labelSettings: JSON.parse(JSON.stringify(w.appState.labelSettings)),
                        selectedElementId: null,
                    }
                };
                w.appState.addHistoryEntry(snap);
            });

            // Undo: restore() should snap fontSize 25 → 22 (round(25/11)=2 → 11×2).
            await page.locator('body').click();
            await page.keyboard.press('Control+z');
            await page.waitForTimeout(200);
            const afterUndo = await page.evaluate(() =>
                (window as unknown as { appState: { elements: Array<{ fontSize: number }> } }).appState.elements[0]?.fontSize);
            expect(afterUndo).toBe(22);

            // Redo: same snapshot, same snap → still 22.
            await page.keyboard.press('Control+Shift+z');
            await page.waitForTimeout(200);
            const afterRedo = await page.evaluate(() =>
                (window as unknown as { appState: { elements: Array<{ fontSize: number }> } }).appState.elements[0]?.fontSize);
            expect(afterRedo).toBe(22);
        });
    });
});
