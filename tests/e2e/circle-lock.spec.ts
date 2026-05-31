import { test, expect } from '../fixtures';
import { Canvas, ElementsPanel, PropertiesPanel, ZPLOutput } from '../page-objects';

/**
 * Coverage for the Circle/Ellipse aspect lock (ADR 0004).
 *
 * A circular element is one type (CIRCLE) with an aspect lock:
 *   locked   → Circle,  exports ^GCdiameter,thickness,color (width == height)
 *   unlocked → Ellipse, exports ^GEwidth,height,thickness,color
 * New circles are created locked. Import keys the lock off the authored
 * command (^GC → locked, ^GE → unlocked, even when square). ^GE/^GC values are
 * clamped to the documented ranges (dim 3–4095, thickness 2–4095, color B/W).
 */

const LOCK_BTN = '#prop-circle-aspect-lock';

/** Read the first element's shape fields straight from app state. */
async function firstElement(page: any) {
    return await page.evaluate(() => {
        const e = (window as any).appState?.elements?.[0];
        return e ? { type: e.type, width: e.width, height: e.height, thickness: e.thickness, color: e.color, aspectLocked: e.aspectLocked } : null;
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

test.describe('Circle aspect lock (^GC / ^GE)', () => {
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

    test.describe('Default & toggle', () => {
        test.beforeEach(async () => {
            await elementsPanel.addCircleElement();
            await elementsPanel.selectElementByIndex(0);
        });

        test('new circle is locked: ^GC, lock button shown, height disabled', async ({ page }) => {
            await zplOutput.verifyZPLContains('^GC');
            await expect(page.locator(LOCK_BTN)).toBeVisible();
            await expect(page.locator('#prop-height')).toBeDisabled();
            expect((await firstElement(page))?.aspectLocked).toBe(true);
        });

        test('unlocking switches ^GC → ^GE and enables the height input', async ({ page }) => {
            await page.locator(LOCK_BTN).click();
            await zplOutput.verifyZPLContains('^GE');
            await zplOutput.verifyZPLNotContains('^GC');
            await expect(page.locator('#prop-height')).toBeEnabled();
            expect((await firstElement(page))?.aspectLocked).toBe(false);
        });

        test('editing width while locked mirrors height (1:1) and emits ^GC<width>', async ({ page }) => {
            await propertiesPanel.setProperty('prop-width', 150);
            await zplOutput.verifyZPLContains('^GC150,');
            const el = await firstElement(page);
            expect(el?.width).toBe(150);
            expect(el?.height).toBe(150);
        });

        test('re-locking snaps height back to width and returns to ^GC', async ({ page }) => {
            await page.locator(LOCK_BTN).click();           // unlock
            await propertiesPanel.setProperty('prop-height', 40);
            await zplOutput.verifyZPLContains('^GE80,40,');
            await page.locator(LOCK_BTN).click();           // re-lock
            await zplOutput.verifyZPLContains('^GC80,');
            const el = await firstElement(page);
            expect(el?.height).toBe(el?.width);
        });
    });

    test.describe('Import & round-trip', () => {
        test('^GC imports locked and round-trips to ^GC', async ({ page }) => {
            await pasteZPL(page, zplOutput, '^XA^FO50,50^GC120,2,B^FS^XZ');
            const el = await firstElement(page);
            expect(el).toMatchObject({ width: 120, height: 120, thickness: 2, aspectLocked: true });
            await zplOutput.verifyZPLContains('^GC120,2,B');
        });

        test('square ^GE imports unlocked (Ellipse) and round-trips to ^GE', async ({ page }) => {
            await pasteZPL(page, zplOutput, '^XA^FO50,50^GE100,100,3,B^FS^XZ');
            const el = await firstElement(page);
            expect(el).toMatchObject({ width: 100, height: 100, aspectLocked: false });
            await zplOutput.verifyZPLContains('^GE100,100,3,B');
            await zplOutput.verifyZPLNotContains('^GC');
        });
    });

    test.describe('Documented value clamping on import', () => {
        test('^GC diameter above 4095 is clamped', async ({ page }) => {
            await pasteZPL(page, zplOutput, '^XA^FO0,0^GC9000,2,B^FS^XZ');
            const el = await firstElement(page);
            expect(el?.width).toBe(4095);
            expect(el?.height).toBe(4095);
        });

        test('^GE width/height/thickness clamp to 3–4095 / 2–4095', async ({ page }) => {
            await pasteZPL(page, zplOutput, '^XA^FO0,0^GE9000,9000,9000,B^FS^XZ');
            const el = await firstElement(page);
            expect(el).toMatchObject({ width: 4095, height: 4095, thickness: 4095 });
        });

        test('thin thickness floors to 2 and invalid color normalizes to B', async ({ page }) => {
            await pasteZPL(page, zplOutput, '^XA^FO0,0^GE100,100,1,Q^FS^XZ');
            const el = await firstElement(page);
            expect(el?.thickness).toBe(2);
            expect(el?.color).toBe('B');
        });
    });

    test.describe('Canvas resize respects the lock', () => {
        async function dragBottomRight(page: any, withShift: boolean) {
            await page.waitForSelector('#properties-panel #prop-width');
            const w0 = parseInt(await propertiesPanel.getProperty('prop-width'));
            const h0 = parseInt(await propertiesPanel.getProperty('prop-height'));
            const x0 = parseInt(await propertiesPanel.getProperty('prop-x'));
            const y0 = parseInt(await propertiesPanel.getProperty('prop-y'));
            const cssScale = await page.evaluate(() => {
                const c = document.getElementById('label-canvas') as HTMLCanvasElement;
                return c.getBoundingClientRect().width / c.width;
            });
            const hx = (x0 + w0) * cssScale;
            const hy = (y0 + h0) * cssScale;
            if (withShift) await page.keyboard.down('Shift');
            await canvas.drag(hx, hy, hx + 30 * cssScale, hy + 30 * cssScale);
            if (withShift) await page.keyboard.up('Shift');
            await canvas.waitForReady();
        }

        test('locked circle stays 1:1 when a corner is dragged', async ({ page }) => {
            await elementsPanel.addCircleElement();
            await dragBottomRight(page, false);
            const el = await firstElement(page);
            expect(el?.aspectLocked).toBe(true);
            expect(el?.width).toBeGreaterThan(80);
            expect(el?.height).toBe(el?.width);
        });

        test('Shift + corner drag breaks the lock into an Ellipse', async ({ page }) => {
            await elementsPanel.addCircleElement();
            await dragBottomRight(page, true);
            expect((await firstElement(page))?.aspectLocked).toBe(false);
            await zplOutput.verifyZPLContains('^GE');
        });
    });
});
