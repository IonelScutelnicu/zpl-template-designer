import { test, expect } from '../fixtures';
import { Canvas, ElementsPanel, PropertiesPanel, ZPLOutput } from '../page-objects';

/**
 * Coverage for the Graphic Symbol element (^GS).
 *
 * ^GSo,h,w^FD<char>^FS prints one of five special symbols:
 *   A = ® registered trademark, B = © copyright, C = ™ trademark,
 *   D = UL approval mark, E = CSA approval mark.
 * o = N/R/I/B orientation; h/w in dots default to the last ^CF font size.
 * New graphic symbols are created as ® (A), 100×100, orientation N.
 */

/** Read the first element's fields straight from app state. */
async function firstElement(page: any) {
    return await page.evaluate(() => {
        const e = (window as any).appState?.elements?.[0];
        return e ? { type: e.type, x: e.x, y: e.y, width: e.width, height: e.height, symbol: e.symbol, orientation: e.orientation, reverse: e.reverse } : null;
    });
}

/** Import a ZPL string through the paste modal (confirms past the warnings step if shown). */
async function pasteZPL(page: any, zplOutput: ZPLOutput, zpl: string): Promise<void> {
    await zplOutput.openMoreActions();
    await page.locator('#import-zpl-btn').click();
    await expect(page.locator('#zpl-import-modal')).toBeVisible();
    await page.locator('#zpl-import-input').fill(zpl);
    await page.locator('#zpl-import-input').dispatchEvent('input');
    await page.locator('#zpl-import-confirm-btn').click();
    const warnings = page.locator('#zpl-import-warnings');
    if (await warnings.isVisible().catch(() => false)) {
        await page.locator('#zpl-import-confirm-btn').click();
    }
    await expect(page.locator('#elements-list .element-item')).toHaveCount(1, { timeout: 5000 });
}

test.describe('Graphic Symbol element (^GS)', () => {
    let canvas: Canvas;
    let elementsPanel: ElementsPanel;
    let propertiesPanel: PropertiesPanel;
    let zplOutput: ZPLOutput;

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        canvas = new Canvas(page);
        elementsPanel = new ElementsPanel(page);
        propertiesPanel = new PropertiesPanel(page);
        zplOutput = new ZPLOutput(page);
    });

    test.describe('Creation & defaults', () => {
        test('adds a graphic symbol when clicking the button', async () => {
            await elementsPanel.addGraphicSymbolElement();
            expect(await elementsPanel.getElementCount()).toBe(1);
        });

        test('generates ZPL with default props (® at 100×100, orientation N)', async () => {
            await elementsPanel.addGraphicSymbolElement();
            await zplOutput.verifyZPLContains('^FO50,50^GSN,100,100^FDA^FS');
        });
    });

    test.describe('Properties', () => {
        test.beforeEach(async () => {
            await elementsPanel.addGraphicSymbolElement();
            await elementsPanel.selectElementByIndex(0);
        });

        for (const symbol of ['B', 'C', 'D', 'E'] as const) {
            test(`selecting symbol ${symbol} updates ^FD`, async () => {
                await propertiesPanel.setSelectValue('prop-symbol', symbol);
                await zplOutput.verifyZPLContains(`^FD${symbol}^FS`);
            });
        }

        test('updating height/width reflects in ZPL', async () => {
            await propertiesPanel.setProperty('prop-height', 200);
            await propertiesPanel.setProperty('prop-width', 120);
            await zplOutput.verifyZPLContains('^GSN,200,120');
        });

        test('orientation buttons emit ^GSR/^GSI/^GSB', async ({ page }) => {
            for (const o of ['R', 'I', 'B'] as const) {
                await page.locator(`#properties-panel button[data-orientation="${o}"]`).click();
                await zplOutput.verifyZPLContains(`^GS${o},100,100`);
            }
        });

        test('height/width are clamped to 1–32000', async () => {
            await propertiesPanel.setProperty('prop-height', 50000);
            await zplOutput.verifyZPLContains('^GSN,32000,100');
        });
    });

    test.describe('Resize handles', () => {
        test('dragging the bottom-right handle resizes width & height', async ({ page }) => {
            await elementsPanel.addGraphicSymbolElement();
            await elementsPanel.selectElementByIndex(0);
            await page.waitForSelector('#properties-panel #prop-width');

            const w0 = parseInt(await propertiesPanel.getProperty('prop-width'));
            const h0 = parseInt(await propertiesPanel.getProperty('prop-height'));
            // Handles wrap the visible ink bounds, not the ^GS command box.
            const b = await page.evaluate(() => (window as any).appState.elements[0].getBounds());
            const hx = b.x + b.width;
            const hy = b.y + b.height;
            await canvas.dragLabelCoords(hx, hy, hx + 40, hy + 30);
            await canvas.waitForReady();

            const w1 = parseInt(await propertiesPanel.getProperty('prop-width'));
            const h1 = parseInt(await propertiesPanel.getProperty('prop-height'));
            expect(w1).toBeGreaterThan(w0);
            expect(h1).toBeGreaterThan(h0);
        });

        test('with orientation R the drag maps to swapped stored fields', async ({ page }) => {
            await elementsPanel.addGraphicSymbolElement();
            await elementsPanel.selectElementByIndex(0);
            await page.waitForSelector('#properties-panel #prop-width');
            await propertiesPanel.setProperty('prop-height', 120);
            await page.locator('#properties-panel button[data-orientation="R"]').click();
            await canvas.waitForReady();

            const b = await page.evaluate(() => (window as any).appState.elements[0].getBounds());
            const hx = b.x + b.width;
            const hy = b.y + b.height;
            await canvas.dragLabelCoords(hx, hy, hx + 40, hy + 20);
            await canvas.waitForReady();

            const el = await firstElement(page);
            // Visual width grew by ~40 → stored height; visual height by ~20 → stored width.
            expect(el?.height).toBeGreaterThan(120);
            expect(el?.width).toBeGreaterThan(100);
        });

        test('selection bounds wrap the visible ink, not the full command box', async ({ page }) => {
            await elementsPanel.addGraphicSymbolElement();
            await elementsPanel.selectElementByIndex(0);
            // ® ink spans ~61%×59% of the ^GS box (measured from Labelary).
            const b = await page.evaluate(() => (window as any).appState.elements[0].getBounds());
            expect(b).toMatchObject({ x: 50, y: 50, width: 61, height: 59 });
        });

        test('resizing a rotated symbol keeps the opposite ink edge anchored', async ({ page }) => {
            await elementsPanel.addGraphicSymbolElement();
            await elementsPanel.selectElementByIndex(0);
            await propertiesPanel.setProperty('prop-height', 150);
            await propertiesPanel.setProperty('prop-width', 150);
            await page.locator('#properties-panel button[data-orientation="R"]').click();
            await canvas.waitForReady();

            // With R the ink sits at x + cellH − inkH; growing the stored
            // height moves that offset, so ^FO must compensate to keep the
            // ink's left edge (the anchor of a right-handle drag) fixed.
            const b0 = await page.evaluate(() => (window as any).appState.elements[0].getBounds());
            await canvas.dragLabelCoords(b0.x + b0.width, b0.y + b0.height / 2, b0.x + b0.width + 50, b0.y + b0.height / 2);
            await canvas.waitForReady();

            const el = await firstElement(page);
            const b1 = await page.evaluate(() => (window as any).appState.elements[0].getBounds());
            expect(el?.height).toBeGreaterThan(150);
            expect(Math.abs(b1.x - b0.x)).toBeLessThanOrEqual(3);
        });

        test('rotated bounds pivot on the font cell, not the command box', async ({ page }) => {
            await elementsPanel.addGraphicSymbolElement();
            await elementsPanel.selectElementByIndex(0);
            await propertiesPanel.setProperty('prop-height', 150);
            await propertiesPanel.setProperty('prop-width', 150);
            // Cell at k=6 steps: 26·6−2=154 wide, 24·6−1=143 tall (measured
            // from Labelary — R/I/B rotate around the font cell). ® ink is
            // 91×89 at effective 150×150.
            await page.locator('#properties-panel button[data-orientation="I"]').click();
            let b = await page.evaluate(() => (window as any).appState.elements[0].getBounds());
            expect(b).toMatchObject({ x: 50 + 154 - 91, y: 50 + 143 - 89, width: 91, height: 89 });

            await page.locator('#properties-panel button[data-orientation="R"]').click();
            b = await page.evaluate(() => (window as any).appState.elements[0].getBounds());
            expect(b).toMatchObject({ x: 50 + 143 - 89, y: 50, width: 89, height: 91 });

            await page.locator('#properties-panel button[data-orientation="B"]').click();
            b = await page.evaluate(() => (window as any).appState.elements[0].getBounds());
            expect(b).toMatchObject({ x: 50, y: 50 + 154 - 91, width: 89, height: 91 });
        });

        test('bounds use the printer-quantized size (nearest 24-dot font step, 250 cap)', async ({ page }) => {
            await elementsPanel.addGraphicSymbolElement();
            await elementsPanel.selectElementByIndex(0);
            // Quantization is round(dots/24) ties-up, clamped 1..10, per axis
            // (swept against Labelary): w=228 → 9.5 steps → 250, h=60 → 2.5
            // steps → 75, and w=600 caps at 250.
            await propertiesPanel.setProperty('prop-width', 228);
            await propertiesPanel.setProperty('prop-height', 60);
            let b = await page.evaluate(() => (window as any).appState.elements[0].getBounds());
            expect(b).toMatchObject({ width: Math.round(250 * 0.607), height: Math.round(75 * 0.593) });

            // w=76 rounds DOWN to 75 (the old snap-up-to-25s model said 100)
            // and h=93 rounds up to 100 — the mismatch users saw vs the API.
            await propertiesPanel.setProperty('prop-width', 76);
            await propertiesPanel.setProperty('prop-height', 93);
            b = await page.evaluate(() => (window as any).appState.elements[0].getBounds());
            expect(b).toMatchObject({ width: Math.round(75 * 0.607), height: Math.round(100 * 0.593) });

            await propertiesPanel.setProperty('prop-width', 600);
            b = await page.evaluate(() => (window as any).appState.elements[0].getBounds());
            expect(b.width).toBe(Math.round(250 * 0.607));
        });
    });

    test.describe('Match label size', () => {
        test('Match Label Width sets the symbol width to the label width', async ({ page }) => {
            await elementsPanel.addGraphicSymbolElement();
            await elementsPanel.selectElementByIndex(0);
            await page.waitForSelector('#properties-panel #prop-match-width');

            const labelWidthDots = await page.evaluate(() => {
                const s = (window as any).appState.labelSettings;
                const dpi = Math.floor(s.dpmm * 25.4);
                return Math.floor((s.width / 25.4) * dpi);
            });
            await page.locator('#prop-match-width').click();

            const el = await firstElement(page);
            expect(el?.x).toBe(0);
            expect(el?.width).toBe(labelWidthDots);
        });

        test('Match Label Height with orientation R sets the stored width (visual height)', async ({ page }) => {
            await elementsPanel.addGraphicSymbolElement();
            await elementsPanel.selectElementByIndex(0);
            await page.waitForSelector('#properties-panel #prop-match-height');
            await page.locator('#properties-panel button[data-orientation="R"]').click();

            const labelHeightDots = await page.evaluate(() => {
                const s = (window as any).appState.labelSettings;
                const dpi = Math.floor(s.dpmm * 25.4);
                return Math.floor((s.height / 25.4) * dpi);
            });
            await page.locator('#prop-match-height').click();

            const el = await firstElement(page);
            expect(el?.y).toBe(0);
            expect(el?.width).toBe(labelHeightDots);
        });
    });

    test.describe('Import & round-trip', () => {
        test('^GS imports and round-trips byte-identically', async ({ page }) => {
            await pasteZPL(page, zplOutput, '^XA^FO30,30^GSN,150,150^FDA^FS^XZ');
            const el = await firstElement(page);
            expect(el).toMatchObject({ type: 'GRAPHICSYMBOL', x: 30, y: 30, symbol: 'A', height: 150, width: 150, orientation: 'N' });
            await zplOutput.verifyZPLContains('^FO30,30^GSN,150,150^FDA^FS');
        });

        test('omitted h/w resolve from the last ^CF; multi-char ^FD keeps first symbol', async ({ page }) => {
            await pasteZPL(page, zplOutput, '^XA^CF0,30^FO20,50^GS,16,16^FDABCDE^FS^XZ');
            const el = await firstElement(page);
            expect(el).toMatchObject({ type: 'GRAPHICSYMBOL', symbol: 'A', height: 16, width: 16, orientation: 'N' });
        });

        test('^GS with no params falls back to the ^CF font size', async ({ page }) => {
            await pasteZPL(page, zplOutput, '^XA^CF0,40^FO0,0^GS^FDB^FS^XZ');
            const el = await firstElement(page);
            expect(el).toMatchObject({ type: 'GRAPHICSYMBOL', symbol: 'B', height: 40, width: 40 });
        });

        test('^FH hex escapes in ^FD decode before symbol validation', async ({ page }) => {
            // _42 is hex for 'B'; Labelary renders it as © (verified), so the
            // import must decode rather than degrade the raw "_42" to A.
            await pasteZPL(page, zplOutput, '^XA^FO0,0^FH^GSN,80,80^FD_42^FS^XZ');
            expect((await firstElement(page))?.symbol).toBe('B');
        });

        test('^FR before ^GS imports as reverse', async ({ page }) => {
            await pasteZPL(page, zplOutput, '^XA^FO0,0^FR^GSN,100,100^FDC^FS^XZ');
            expect((await firstElement(page))?.reverse).toBe(true);
            await zplOutput.verifyZPLContains('^FR^GSN,100,100^FDC^FS');
        });

        test('invalid ^FD symbol degrades to A', async ({ page }) => {
            await pasteZPL(page, zplOutput, '^XA^FO0,0^GSN,80,80^FDZ^FS^XZ');
            expect((await firstElement(page))?.symbol).toBe('A');
        });
    });
});
