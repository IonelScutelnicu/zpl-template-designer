import { test, expect } from '../fixtures';
import { ElementsPanel } from '../page-objects';

// Drive is configured (real creds in drive-config.js) but the default test
// session is NOT connected — so the Save items render disabled and the
// dirty dot (gated on isConfigured) still works without mocking a connection.
test.describe('Template menu — Drive items & header name', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('Save / Save as / Edit details are present but disabled when disconnected', async ({ page }) => {
        await page.locator('#zpl-more-btn').click();
        await expect(page.locator('#zpl-more-menu')).toBeVisible();

        await expect(page.locator('#drive-menu-save')).toBeVisible();
        await expect(page.locator('#drive-menu-save')).toBeDisabled();
        await expect(page.locator('#drive-menu-save-as')).toBeDisabled();
        await expect(page.locator('#drive-menu-rename')).toBeDisabled();
    });

    test('header shows the template name in Editor view', async ({ page }) => {
        await expect(page.locator('#editor-doc-name')).toBeVisible();
        await expect(page.locator('#editor-doc-name-text')).toHaveText('Untitled template');
    });

    test('dirty dot appears after an edit', async ({ page }) => {
        const elements = new ElementsPanel(page);
        await expect(page.locator('#editor-doc-dot')).toBeHidden();

        await elements.addTextElement();
        await expect(page.locator('#elements-list .element-item')).toHaveCount(1);

        await expect(page.locator('#editor-doc-dot')).toBeVisible();
    });

    test('header name is hidden in Gallery view', async ({ page }) => {
        await page.locator('#view-tab-gallery').click();
        await page.waitForFunction(
            () => document.documentElement.dataset.viewReady === 'gallery',
            undefined,
            { timeout: 15000 }
        );
        await expect(page.locator('#editor-doc-name')).toBeHidden();
    });
});
