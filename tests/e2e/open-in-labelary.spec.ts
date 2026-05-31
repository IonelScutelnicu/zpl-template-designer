import { test, expect } from '../fixtures';
import { ElementsPanel, PropertiesPanel } from '../page-objects';

// The "Open in Labelary" item in the ZPL More menu launches the Labelary
// online viewer in a new tab with the current ZPL pre-loaded. We assert the
// URL shape instead of opening a real tab — capture window.open.

test.describe('Open in Labelary', () => {
    let elementsPanel: ElementsPanel;
    let propertiesPanel: PropertiesPanel;

    test.beforeEach(async ({ page }) => {
        await page.goto('/?e2e=1');
        elementsPanel = new ElementsPanel(page);
        propertiesPanel = new PropertiesPanel(page);
    });

    // Capture window.open in the page, click the menu item, return the args.
    async function captureLabelaryUrl(page: import('@playwright/test').Page): Promise<{ url: string; target: string; features: string }> {
        await page.evaluate(() => {
            (window as unknown as { __labelaryCapture?: unknown[] }).__labelaryCapture = null;
            const original = window.open;
            window.open = function (...args) {
                (window as unknown as { __labelaryCapture: unknown[] }).__labelaryCapture = args;
                return null;
            };
            (window as unknown as { __labelaryOriginalOpen: typeof window.open }).__labelaryOriginalOpen = original;
        });

        await page.locator('#zpl-more-btn').click();
        await page.locator('#open-labelary-btn').click();

        const captured = await page.evaluate(() => {
            const w = window as unknown as {
                __labelaryCapture: unknown[];
                __labelaryOriginalOpen: typeof window.open;
            };
            window.open = w.__labelaryOriginalOpen;
            return w.__labelaryCapture as [string, string, string] | null;
        });

        if (!captured) throw new Error('window.open was not called');
        return { url: captured[0], target: captured[1], features: captured[2] };
    }

    test('menu item is present and labeled', async ({ page }) => {
        await page.locator('#zpl-more-btn').click();
        const btn = page.locator('#open-labelary-btn');
        await expect(btn).toBeVisible();
        await expect(btn).toContainText('Open in Labelary');
    });

    test('opens labelary.com viewer in a new tab with noopener', async ({ page }) => {
        await elementsPanel.addTextElement();
        const captured = await captureLabelaryUrl(page);

        expect(captured.url).toMatch(/^https:\/\/labelary\.com\/viewer\.html\?/);
        expect(captured.target).toBe('_blank');
        expect(captured.features).toContain('noopener');
    });

    test('URL includes the label dimensions, density, and required viewer params', async ({ page }) => {
        await elementsPanel.addTextElement();
        const { url } = await captureLabelaryUrl(page);
        const params = new URL(url).searchParams;

        // Defaults set by AppState — 100×50 mm, 8 dpmm.
        expect(params.get('density')).toBe('8');
        expect(params.get('width')).toBe('100');
        expect(params.get('height')).toBe('50');
        expect(params.get('units')).toBe('mm');
        expect(params.get('index')).toBe('0');
        expect(params.get('rotation')).toBe('0');
        expect(params.get('quality')).toBe('grayscale');
    });

    test('URL includes the current ZPL in the zpl param', async ({ page }) => {
        await elementsPanel.addTextElement();
        await elementsPanel.selectElementByIndex(0);
        await propertiesPanel.setSelectValue('prop-font-id', 'A');
        await propertiesPanel.setFontHeight(72); // allowed value for Font A (9×8)
        await propertiesPanel.setProperty('prop-preview-text', 'Sample Text');

        const { url } = await captureLabelaryUrl(page);
        const zpl = new URL(url).searchParams.get('zpl') || '';

        expect(zpl).toContain('^XA');
        expect(zpl).toContain('^XZ');
        expect(zpl).toContain('^AAN,72');
        expect(zpl).toContain('^FDSample Text^FS');
    });

    test('closes the More menu after clicking', async ({ page }) => {
        await elementsPanel.addTextElement();
        await page.evaluate(() => { window.open = () => null; });

        await page.locator('#zpl-more-btn').click();
        await expect(page.locator('#zpl-more-menu')).not.toHaveClass(/hidden/);
        await page.locator('#open-labelary-btn').click();
        await expect(page.locator('#zpl-more-menu')).toHaveClass(/hidden/);
    });

    test('works with an empty canvas (opens viewer with blank zpl)', async ({ page }) => {
        const { url } = await captureLabelaryUrl(page);
        const params = new URL(url).searchParams;
        // ZPLGenerator emits '' when there are no elements; the viewer URL is
        // still well-formed and includes the empty zpl param.
        expect(params.has('zpl')).toBe(true);
        expect(params.get('zpl')).toBe('');
        expect(params.get('density')).toBe('8');
    });
});
