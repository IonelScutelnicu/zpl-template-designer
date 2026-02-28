import { test, expect } from '../fixtures';
import { Page } from '@playwright/test';
import { ElementsPanel, PropertiesPanel, ZPLOutput } from '../page-objects';

test.describe('URL Sharing', () => {
    let elementsPanel: ElementsPanel;
    let propertiesPanel: PropertiesPanel;
    let zplOutput: ZPLOutput;

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        elementsPanel = new ElementsPanel(page);
        propertiesPanel = new PropertiesPanel(page);
        zplOutput = new ZPLOutput(page);
    });

    async function shareAndReadUrl(): Promise<string> {
        await zplOutput.shareBtn.click();
        await expect(zplOutput.page.locator('#share-btn-label')).toHaveText('Link Copied!');
        return await zplOutput.page.evaluate(() => navigator.clipboard.readText());
    }

    /** Navigate to a shared URL, ensuring a full page reload */
    async function navigateToSharedUrl(page: Page, sharedUrl: string): Promise<void> {
        await page.goto('about:blank');
        await page.goto(sharedUrl);
    }

    // ============== SHARE BUTTON STATE ==============
    test.describe('Share Button State', () => {
        test('should be disabled when no elements exist', async () => {
            await expect(zplOutput.shareBtn).toBeDisabled();
            await expect(zplOutput.shareBtn).toHaveClass(/opacity-50/);
        });

        test('should be enabled after adding an element', async () => {
            await elementsPanel.addTextElement();
            await expect(zplOutput.shareBtn).toBeEnabled();
            await expect(zplOutput.shareBtn).not.toHaveClass(/opacity-50/);
        });

        test('should be disabled again after deleting all elements', async ({ page }) => {
            await elementsPanel.addTextElement();
            await expect(zplOutput.shareBtn).toBeEnabled();

            // Select and delete the element
            await elementsPanel.selectElementByIndex(0);
            await page.keyboard.press('Delete');

            await expect(zplOutput.shareBtn).toBeDisabled();
        });
    });

    // ============== SHARE FLOW ==============
    test.describe('Share Flow', () => {
        test('should copy URL with #template= hash to clipboard', async ({ page, context }) => {
            await context.grantPermissions(['clipboard-read', 'clipboard-write']);

            await elementsPanel.addTextElement();
            const clipboardUrl = await shareAndReadUrl();
            expect(clipboardUrl).toContain('#template=');
            // Verify it's a valid URL
            expect(clipboardUrl).toMatch(/^https?:\/\//);
        });

        test('should show "Link Copied!" feedback', async ({ page, context }) => {
            await context.grantPermissions(['clipboard-read', 'clipboard-write']);

            await elementsPanel.addTextElement();
            await zplOutput.shareBtn.click();

            await expect(page.locator('#share-btn-label')).toHaveText('Link Copied!');
            await expect(zplOutput.shareBtn).toHaveClass(/bg-green-600/);

            // Wait for feedback to revert
            await expect(page.locator('#share-btn-label')).toHaveText('Share', { timeout: 3000 });
            await expect(zplOutput.shareBtn).toHaveClass(/bg-indigo-600/);
        });
    });

    // ============== IMPORT FROM URL ==============
    test.describe('Import from URL', () => {
        test('should import template when navigating to a shared URL', async ({ page, context }) => {
            await context.grantPermissions(['clipboard-read', 'clipboard-write']);

            // Create a template with a text element
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);
            await page.locator('#prop-preview-text').fill('Shared Text');
            await page.locator('#prop-preview-text').dispatchEvent('change');

            // Share and get URL
            const sharedUrl = await shareAndReadUrl();

            // Navigate to shared URL (via about:blank to ensure full reload)
            await navigateToSharedUrl(page, sharedUrl);

            // Wait for async import to complete
            await expect(async () => {
                const count = await elementsPanel.getElementCount();
                expect(count).toBe(1);
            }).toPass({ timeout: 5000 });

            // Verify element properties
            await elementsPanel.selectElementByIndex(0);
            await expect(page.locator('#prop-preview-text')).toHaveValue('Shared Text');
        });

        test('should clean URL hash after import', async ({ page, context }) => {
            await context.grantPermissions(['clipboard-read', 'clipboard-write']);

            await elementsPanel.addTextElement();
            const sharedUrl = await shareAndReadUrl();

            await navigateToSharedUrl(page, sharedUrl);

            // Wait for async import to complete and hash to be cleaned
            await expect(async () => {
                const hash = await page.evaluate(() => window.location.hash);
                expect(hash).toBe('');
            }).toPass({ timeout: 5000 });
        });

        test('should handle invalid hash data gracefully', async ({ page }) => {
            // Navigate directly to an invalid shared URL
            await page.goto('about:blank');
            await page.goto('/#template=INVALID_DATA_HERE');

            // App should load normally without errors
            await expect(page.locator('#label-canvas')).toBeVisible();

            // Hash should be cleaned
            await expect(async () => {
                const hash = await page.evaluate(() => window.location.hash);
                expect(hash).toBe('');
            }).toPass({ timeout: 5000 });
        });

        test('should preserve label settings in shared URL', async ({ page, context }) => {
            await context.grantPermissions(['clipboard-read', 'clipboard-write']);

            // Modify label settings
            await page.locator('#label-width').fill('80');
            await page.locator('#label-width').dispatchEvent('input');
            await page.locator('#label-height').fill('40');
            await page.locator('#label-height').dispatchEvent('input');

            await elementsPanel.addTextElement();
            const sharedUrl = await shareAndReadUrl();

            // Navigate to shared URL (via about:blank to ensure full reload)
            await navigateToSharedUrl(page, sharedUrl);

            // Wait for import
            await expect(async () => {
                const count = await elementsPanel.getElementCount();
                expect(count).toBe(1);
            }).toPass({ timeout: 5000 });

            await expect(page.locator('#label-width')).toHaveValue('80');
            await expect(page.locator('#label-height')).toHaveValue('40');
        });
    });

    // ============== ROUND-TRIP ==============
    test.describe('Round-trip', () => {
        test('should preserve multiple element types through share and import', async ({ page, context }) => {
            await context.grantPermissions(['clipboard-read', 'clipboard-write']);

            // Add multiple element types
            await elementsPanel.addTextElement();
            await elementsPanel.addBarcodeElement();
            await elementsPanel.addBoxElement();

            // Share
            const sharedUrl = await shareAndReadUrl();

            // Navigate to shared URL (via about:blank to ensure full reload)
            await navigateToSharedUrl(page, sharedUrl);

            // Verify all elements were imported
            await expect(async () => {
                const count = await elementsPanel.getElementCount();
                expect(count).toBe(3);
            }).toPass({ timeout: 5000 });
        });
    });
});
