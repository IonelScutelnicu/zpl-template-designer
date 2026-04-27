import { test, expect } from '../fixtures';

test.describe('Gallery', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/gallery.html');
        await expect(page.locator('.tcard')).toHaveCount(5, { timeout: 15000 });
    });

    test('page loads and shows all template cards', async ({ page }) => {
        await expect(page.locator('.tcard')).toHaveCount(5);
        await expect(page.locator('.grid')).toBeVisible();
        await expect(page.locator('#stat-templates')).toHaveText('5');
    });

    test('search filters the grid', async ({ page }) => {
        await page.locator('#search-input').fill('amazon');
        await expect(page.locator('.tcard')).toHaveCount(1);
        await expect(page.locator('.tcard .name')).toHaveText('Amazon FBA · FNSKU');

        await page.locator('#search-input').fill('');
        await expect(page.locator('.tcard')).toHaveCount(5);
    });

    test('filter checkbox reduces results', async ({ page }) => {
        await page.locator('[data-filter="use"][data-val="shipping"]').check();
        const filteredCount = await page.locator('.tcard').count();
        expect(filteredCount).toBeGreaterThan(0);
        expect(filteredCount).toBeLessThan(5);
    });

    test('clicking a card opens the modal with correct template name', async ({ page }) => {
        const firstCard = page.locator('.tcard').first();
        const templateName = await firstCard.locator('.name').textContent();

        await firstCard.click();

        await expect(page.locator('#modal-scrim')).toBeVisible();
        await expect(page.locator('#modal-title')).toHaveText(templateName!.trim());
    });

    test('Use template navigates to editor and loads template via sessionStorage', async ({ page }) => {
        await page.locator('.tcard').first().click();
        await expect(page.locator('#modal-scrim')).toBeVisible();

        await page.locator('#use-template-btn').click();

        // npx serve redirects /index.html → /, so check elements directly on the editor page
        await expect(page.locator('#elements-list .element-item')).not.toHaveCount(0, { timeout: 15000 });
    });

    test('Copy ZPL writes ZPL to clipboard and shows confirmation', async ({ page, context }) => {
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);

        await page.locator('.tcard').first().click();
        await expect(page.locator('#modal-scrim')).toBeVisible();

        await page.locator('#copy-zpl-btn').click();
        await expect(page.locator('#copy-zpl-btn .label')).toHaveText('Copied!');

        const text = await page.evaluate(() => navigator.clipboard.readText());
        expect(text).toMatch(/^\^XA/);
        expect(text).toContain('^XZ');

        await expect(page.locator('#copy-zpl-btn .label')).toHaveText('Copy ZPL');
    });

    test('Export JSON triggers download with correct filename', async ({ page }) => {
        const firstCard = page.locator('.tcard').first();
        const templateId = await firstCard.getAttribute('data-id');

        await firstCard.click();
        await expect(page.locator('#modal-scrim')).toBeVisible();

        const downloadPromise = page.waitForEvent('download');
        await page.locator('#export-json-btn').click();
        const download = await downloadPromise;

        expect(download.suggestedFilename()).toBe(templateId + '.json');
    });
});
