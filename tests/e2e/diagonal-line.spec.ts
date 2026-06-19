import { test, expect } from '../fixtures';
import { Canvas, ElementsPanel, PropertiesPanel, ZPLOutput } from '../page-objects';

/**
 * Coverage for the Diagonal Line element (^GD).
 *
 * ^GDw,h,t,c,o draws a diagonal across a w×h box:
 *   o = R (or /) right-leaning, L (or \) left-leaning (default R).
 * New diagonal lines are created right-leaning (R), black, 150×100, thickness 3.
 */

/** Read the first element's fields straight from app state. */
async function firstElement(page: any) {
    return await page.evaluate(() => {
        const e = (window as any).appState?.elements?.[0];
        return e ? { type: e.type, x: e.x, y: e.y, width: e.width, height: e.height, thickness: e.thickness, color: e.color, orientation: e.orientation, reverse: e.reverse } : null;
    });
}

/** Import a ZPL string through the paste modal. */
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

test.describe('Diagonal Line element (^GD)', () => {
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

    test.describe('Creation & deletion', () => {
        test('adds a diagonal line when clicking the button', async () => {
            await elementsPanel.addDiagonalLineElement();
            expect(await elementsPanel.getElementCount()).toBe(1);
        });

        test('selecting shows the properties panel', async () => {
            await elementsPanel.addDiagonalLineElement();
            await elementsPanel.selectElementByIndex(0);
            expect(await propertiesPanel.hasNoElementSelected()).toBe(false);
        });

        test('deletes via the UI button', async () => {
            await elementsPanel.addDiagonalLineElement();
            await elementsPanel.deleteElementByIndex(0);
            expect(await elementsPanel.getElementCount()).toBe(0);
        });

        test('deletes via the Delete key', async ({ page }) => {
            await elementsPanel.addDiagonalLineElement();
            await elementsPanel.selectElementByIndex(0);
            await page.keyboard.press('Delete');
            expect(await elementsPanel.getElementCount()).toBe(0);
        });

        test('generates ZPL containing ^GD with default props', async () => {
            await elementsPanel.addDiagonalLineElement();
            await zplOutput.verifyZPLContains('^GD150,100,3,B,R');
        });
    });

    test.describe('Properties', () => {
        test.beforeEach(async () => {
            await elementsPanel.addDiagonalLineElement();
            await elementsPanel.selectElementByIndex(0);
        });

        test('updating width/height/thickness reflects in ZPL', async () => {
            await propertiesPanel.setProperty('prop-width', 200);
            await propertiesPanel.setProperty('prop-height', 120);
            await propertiesPanel.setProperty('prop-thickness', 5);
            await zplOutput.verifyZPLContains('^GD200,120,5,B,R');
        });

        test('toggling orientation switches R → L', async ({ page }) => {
            await page.locator('#properties-panel button[data-orientation="L"]').click();
            await zplOutput.verifyZPLContains(',L^FS');
            await zplOutput.verifyZPLNotContains(',R^FS');
            expect((await firstElement(page))?.orientation).toBe('L');
        });

        test('white color emits W', async () => {
            await propertiesPanel.page.locator('#properties-panel button[data-color="W"]').click();
            await zplOutput.verifyZPLContains('^GD150,100,3,W,R');
        });
    });

    test.describe('Resize handles', () => {
        test('dragging the bottom-right handle resizes width & height', async ({ page }) => {
            await elementsPanel.addDiagonalLineElement();
            await elementsPanel.selectElementByIndex(0);
            await page.waitForSelector('#properties-panel #prop-width');

            const w0 = parseInt(await propertiesPanel.getProperty('prop-width'));
            const h0 = parseInt(await propertiesPanel.getProperty('prop-height'));
            const x0 = parseInt(await propertiesPanel.getProperty('prop-x'));
            const y0 = parseInt(await propertiesPanel.getProperty('prop-y'));
            const t0 = parseInt(await propertiesPanel.getProperty('prop-thickness'));
            // Bottom-right handle sits at width + thickness (the band's full extent).
            const hx = x0 + w0 + t0;
            const hy = y0 + h0;
            await canvas.dragLabelCoords(hx, hy, hx + 40, hy + 30);
            await canvas.waitForReady();

            const w1 = parseInt(await propertiesPanel.getProperty('prop-width'));
            const h1 = parseInt(await propertiesPanel.getProperty('prop-height'));
            expect(w1).toBeGreaterThan(w0);
            expect(h1).toBeGreaterThan(h0);
        });

        test('dragging a thick line to the right edge keeps the visible band on-label', async ({ page }) => {
            await elementsPanel.addDiagonalLineElement();
            await elementsPanel.selectElementByIndex(0);
            await page.waitForSelector('#properties-panel #prop-width');
            await propertiesPanel.setProperty('prop-x', 0);
            await propertiesPanel.setProperty('prop-width', 150);
            await propertiesPanel.setProperty('prop-thickness', 20);

            const labelWidthDots = await page.evaluate(() => {
                const s = (window as any).appState.labelSettings;
                return s.width * s.dpmm;
            });
            const el0 = await firstElement(page);
            const hx = (el0?.x ?? 0) + (el0?.width ?? 0) + (el0?.thickness ?? 0);
            const hy = (el0?.y ?? 0) + (el0?.height ?? 0);

            await canvas.dragLabelCoords(hx, hy, labelWidthDots + 100, hy);
            await canvas.waitForReady();

            const el = await firstElement(page);
            expect((el?.x ?? 0) + (el?.width ?? 0) + (el?.thickness ?? 0)).toBeLessThanOrEqual(labelWidthDots);
        });
    });

    test.describe('Match label size', () => {
        test('Match Label Width sizes the band to fill the label width', async ({ page }) => {
            await elementsPanel.addDiagonalLineElement();
            await elementsPanel.selectElementByIndex(0);
            await page.waitForSelector('#properties-panel #prop-match-width');

            const labelWidthDots = await page.evaluate(() => {
                const s = (window as any).appState.labelSettings;
                const dpi = Math.floor(s.dpmm * 25.4);
                return Math.floor((s.width / 25.4) * dpi);
            });
            const t0 = parseInt(await propertiesPanel.getProperty('prop-thickness'));
            await page.locator('#prop-match-width').click();

            const el = await firstElement(page);
            expect(el?.x).toBe(0);
            // Visible band (width + thickness) fills the label width exactly.
            expect((el?.width ?? 0) + t0).toBe(labelWidthDots);
        });

        test('Match Label Height sizes the band to the label height', async ({ page }) => {
            await elementsPanel.addDiagonalLineElement();
            await elementsPanel.selectElementByIndex(0);
            await page.waitForSelector('#properties-panel #prop-match-height');

            const labelHeightDots = await page.evaluate(() => {
                const s = (window as any).appState.labelSettings;
                const dpi = Math.floor(s.dpmm * 25.4);
                return Math.floor((s.height / 25.4) * dpi);
            });
            await page.locator('#prop-match-height').click();

            const el = await firstElement(page);
            expect(el?.y).toBe(0);
            expect(el?.height).toBe(labelHeightDots);
        });
    });

    test.describe('Import & round-trip', () => {
        test('^GD imports and round-trips', async ({ page }) => {
            await pasteZPL(page, zplOutput, '^XA^FO50,50^GD200,150,4,B,L^FS^XZ');
            const el = await firstElement(page);
            expect(el).toMatchObject({ type: 'DIAGONALLINE', width: 200, height: 150, thickness: 4, color: 'B', orientation: 'L' });
            await zplOutput.verifyZPLContains('^GD200,150,4,B,L');
        });

        test('^GD without orientation defaults to R', async ({ page }) => {
            await pasteZPL(page, zplOutput, '^XA^FO0,0^GD100,80,2,B^FS^XZ');
            expect((await firstElement(page))?.orientation).toBe('R');
            await zplOutput.verifyZPLContains('^GD100,80,2,B,R');
        });

        test('^FR before ^GD imports as reverse', async ({ page }) => {
            await pasteZPL(page, zplOutput, '^XA^FO0,0^FR^GD100,80,2,B,R^FS^XZ');
            expect((await firstElement(page))?.reverse).toBe(true);
            await zplOutput.verifyZPLContains('^FR^GD100,80,2,B,R');
        });
    });
});
