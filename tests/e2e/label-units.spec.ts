import { test, expect } from '../fixtures';
import { ElementsPanel, ZPLOutput } from '../page-objects';

test.describe('Label dimension unit toggle (mm/in)', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('should switch display to inches without changing the ZPL', async ({ page }) => {
        const elementsPanel = new ElementsPanel(page);
        const zplOutput = new ZPLOutput(page);
        await elementsPanel.addTextElement();
        const zplBefore = await zplOutput.getZPLCode();

        await page.locator('#label-unit-in').click();

        await expect(page.locator('#label-width')).toHaveValue('3.94');
        await expect(page.locator('#label-height')).toHaveValue('1.97');
        await expect(page.locator('#label-width-label')).toHaveText('Width (in)');
        await expect(page.locator('#label-height-label')).toHaveText('Height (in)');
        await expect(page.locator('#label-unit-in')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('#label-unit-mm')).toHaveAttribute('aria-pressed', 'false');
        await expect(page.locator('#label-width')).toHaveAttribute('min', '0.39');
        await expect(page.locator('#label-width')).toHaveAttribute('max', '15');
        await expect(page.locator('#label-width')).toHaveAttribute('step', '0.01');

        expect(await zplOutput.getZPLCode()).toBe(zplBefore);
    });

    test('should store the correct mm value when entering inches', async ({ page }) => {
        const elementsPanel = new ElementsPanel(page);
        const zplOutput = new ZPLOutput(page);
        await elementsPanel.addTextElement();

        await page.locator('#label-unit-in').click();
        await page.locator('#label-width').fill('5');

        // 5 in = 127 mm exactly; dots use the app's dpi-floor conversion:
        // floor((127 / 25.4) × floor(8 × 25.4)) = 5 × 203 = 1015
        const zpl = await zplOutput.getZPLCode();
        expect(zpl).toContain('^PW1015');
        expect(zpl).toContain('"w":127');

        await page.locator('#label-unit-mm').click();
        await expect(page.locator('#label-width')).toHaveValue('127');
    });

    test('should clamp inch entry to the label mm range', async ({ page }) => {
        await page.locator('#label-unit-in').click();

        await page.locator('#label-width').fill('20');
        await page.locator('#label-unit-mm').click();
        await expect(page.locator('#label-width')).toHaveValue('381');

        await page.locator('#label-unit-in').click();
        await page.locator('#label-width').fill('0.1');
        await page.locator('#label-unit-mm').click();
        await expect(page.locator('#label-width')).toHaveValue('10');
    });

    test('should persist the unit preference across reloads', async ({ page }) => {
        await page.locator('#label-unit-in').click();
        expect(await page.evaluate(() => localStorage.getItem('zebra-label-unit'))).toBe('in');

        await page.reload();
        await page.waitForFunction(() => document.documentElement.dataset.viewReady !== undefined);

        await expect(page.locator('#label-unit-in')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('#label-width')).toHaveValue('3.94');
        await expect(page.locator('#label-width-label')).toHaveText('Width (in)');
    });

    test('should render programmatic input updates in the active unit', async ({ page }) => {
        const elementsPanel = new ElementsPanel(page);
        const zplOutput = new ZPLOutput(page);
        await elementsPanel.addTextElement();
        await page.locator('#label-unit-in').click();

        // New template resets label settings to 100×50 mm through
        // syncLabelSettingsInputs — the inputs must stay in inches.
        await zplOutput.openMoreActions();
        await page.locator('#new-template-btn').click();
        const confirmShown = await page.locator('#confirm-modal')
            .waitFor({ state: 'visible', timeout: 500 }).then(() => true).catch(() => false);
        if (confirmShown) await page.locator('#confirm-ok-btn').click();

        await expect(page.locator('#label-width')).toHaveValue('3.94');
        await expect(page.locator('#label-height')).toHaveValue('1.97');
        await expect(page.locator('#label-width-label')).toHaveText('Width (in)');
    });
});
