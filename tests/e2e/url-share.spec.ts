import { test, expect } from '../fixtures';
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
            await zplOutput.shareBtn.click();

            const clipboardUrl = await page.evaluate(() => navigator.clipboard.readText());
            expect(clipboardUrl).toContain('#template=');
            // Verify it's a valid URL
            expect(clipboardUrl).toMatch(/^https?:\/\//);
        });

        test('should show "Link Copied!" feedback', async ({ page, context }) => {
            await context.grantPermissions(['clipboard-read', 'clipboard-write']);

            await elementsPanel.addTextElement();
            await zplOutput.shareBtn.click();

            await expect(zplOutput.shareBtn).toHaveText('Link Copied!');
            await expect(zplOutput.shareBtn).toHaveClass(/bg-green-600/);

            // Wait for feedback to revert
            await expect(zplOutput.shareBtn).toHaveText('Share', { timeout: 3000 });
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
            await zplOutput.shareBtn.click();
            const sharedUrl = await page.evaluate(() => navigator.clipboard.readText());

            // Navigate to shared URL
            await page.goto(sharedUrl);

            // Verify element was imported
            const elementCount = await elementsPanel.getElementCount();
            expect(elementCount).toBe(1);

            // Verify element properties
            await elementsPanel.selectElementByIndex(0);
            await expect(page.locator('#prop-preview-text')).toHaveValue('Shared Text');
        });

        test('should clean URL hash after import', async ({ page, context }) => {
            await context.grantPermissions(['clipboard-read', 'clipboard-write']);

            await elementsPanel.addTextElement();
            await zplOutput.shareBtn.click();
            const sharedUrl = await page.evaluate(() => navigator.clipboard.readText());

            await page.goto(sharedUrl);

            // Wait for async import to complete
            await expect(async () => {
                const hash = await page.evaluate(() => window.location.hash);
                expect(hash).toBe('');
            }).toPass({ timeout: 3000 });
        });

        test('should handle invalid hash data gracefully', async ({ page }) => {
            await page.goto('/#template=INVALID_DATA_HERE');

            // App should load normally without errors
            await expect(page.locator('#label-canvas')).toBeVisible();

            // Hash should be cleaned
            await expect(async () => {
                const hash = await page.evaluate(() => window.location.hash);
                expect(hash).toBe('');
            }).toPass({ timeout: 3000 });
        });

        test('should preserve label settings in shared URL', async ({ page, context }) => {
            await context.grantPermissions(['clipboard-read', 'clipboard-write']);

            // Modify label settings
            await page.locator('#label-width').fill('80');
            await page.locator('#label-width').dispatchEvent('input');
            await page.locator('#label-height').fill('40');
            await page.locator('#label-height').dispatchEvent('input');

            await elementsPanel.addTextElement();
            await zplOutput.shareBtn.click();
            const sharedUrl = await page.evaluate(() => navigator.clipboard.readText());

            // Navigate to shared URL
            await page.goto(sharedUrl);

            // Wait for import
            await expect(async () => {
                const count = await elementsPanel.getElementCount();
                expect(count).toBe(1);
            }).toPass({ timeout: 3000 });

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
            await zplOutput.shareBtn.click();
            const sharedUrl = await page.evaluate(() => navigator.clipboard.readText());

            // Navigate to shared URL
            await page.goto(sharedUrl);

            // Verify all elements were imported
            await expect(async () => {
                const count = await elementsPanel.getElementCount();
                expect(count).toBe(3);
            }).toPass({ timeout: 3000 });
        });
    });
});
