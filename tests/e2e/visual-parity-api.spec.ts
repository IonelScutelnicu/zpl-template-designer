import { test, expect } from '../fixtures';
import { ElementsPanel, Canvas, PreviewPanel, PropertiesPanel } from '../page-objects';
import { compareImages } from '../fixtures/image-comparison';

/**
 * Visual Parity Tests - Canvas vs API Preview
 * These tests compare canvas rendering with Labelary API preview output.
 * Runs sequentially to respect Labelary API rate limits (3 req/sec).
 */
test.describe('Visual Parity - Canvas vs API', () => {
    let elementsPanel: ElementsPanel;
    let canvas: Canvas;
    let previewPanel: PreviewPanel;

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        elementsPanel = new ElementsPanel(page);
        canvas = new Canvas(page);
        previewPanel = new PreviewPanel(page);
        await canvas.waitForReady();
    });

    test('should have similar rendering for Text element between canvas and API', async ({ page }) => {
        await elementsPanel.addTextElement();
        await elementsPanel.selectElementByIndex(0);

        await page.locator('#prop-x').fill('100');
        await page.locator('#prop-x').dispatchEvent('input');
        await page.locator('#prop-y').fill('100');
        await page.locator('#prop-y').dispatchEvent('input');
        await page.locator('#prop-preview-text').fill('Parity');
        await page.locator('#prop-preview-text').dispatchEvent('input');

        // Get canvas screenshot
        await canvas.waitForReady();
        const canvasImage = await canvas.takeScreenshot();

        // Get API preview
        await previewPanel.switchToAPIMode();
        await previewPanel.refreshPreview();
        await previewPanel.waitForAPIPreviewLoaded();
        const apiImage = await previewPanel.previewImage.screenshot();

        // Compare - allow higher threshold due to rendering differences
        const result = await compareImages(canvasImage, apiImage, 'parity-text', { threshold: 0.3 });

        // Log result for debugging
        console.log(`Text parity: ${result.diffPercentage.toFixed(2)}% difference`);

        // We expect some difference due to font rendering, but should be similar
        expect(result.diffPercentage).toBeLessThan(50);
    });

    test('should have similar rendering for Box element between canvas and API', async ({ page }) => {
        await elementsPanel.addBoxElement();
        await elementsPanel.selectElementByIndex(0);

        await page.locator('#prop-x').fill('50');
        await page.locator('#prop-x').dispatchEvent('input');
        await page.locator('#prop-y').fill('50');
        await page.locator('#prop-y').dispatchEvent('input');
        await page.locator('#prop-width').fill('200');
        await page.locator('#prop-width').dispatchEvent('input');
        await page.locator('#prop-height').fill('100');
        await page.locator('#prop-height').dispatchEvent('input');

        const canvasImage = await canvas.takeScreenshot();

        await previewPanel.switchToAPIMode();
        await previewPanel.refreshPreview();
        await previewPanel.waitForAPIPreviewLoaded();
        const apiImage = await previewPanel.previewImage.screenshot();

        const result = await compareImages(canvasImage, apiImage, 'parity-box', { threshold: 0.3 });

        console.log(`Box parity: ${result.diffPercentage.toFixed(2)}% difference`);
        expect(result.diffPercentage).toBeLessThan(50);
    });

    test('should have similar rendering for Barcode element between canvas and API', async ({ page }) => {
        await elementsPanel.addBarcodeElement();
        await elementsPanel.selectElementByIndex(0);

        await page.locator('#prop-x').fill('100');
        await page.locator('#prop-x').dispatchEvent('input');
        await page.locator('#prop-y').fill('100');
        await page.locator('#prop-y').dispatchEvent('input');

        const canvasImage = await canvas.takeScreenshot();

        await previewPanel.switchToAPIMode();
        await previewPanel.refreshPreview();
        await previewPanel.waitForAPIPreviewLoaded();
        const apiImage = await previewPanel.previewImage.screenshot();

        const result = await compareImages(canvasImage, apiImage, 'parity-barcode', { threshold: 0.3 });

        console.log(`Barcode parity: ${result.diffPercentage.toFixed(2)}% difference`);
        expect(result.diffPercentage).toBeLessThan(50);
    });

    test('should have similar rendering for multiple elements between canvas and API', async ({ page }) => {
        // Add multiple elements
        await elementsPanel.addTextElement();
        await elementsPanel.addBoxElement();
        await elementsPanel.addBarcodeElement();

        await canvas.waitForReady();
        const canvasImage = await canvas.takeScreenshot();

        await previewPanel.switchToAPIMode();
        await previewPanel.refreshPreview();
        await previewPanel.waitForAPIPreviewLoaded();
        const apiImage = await previewPanel.previewImage.screenshot();

        const result = await compareImages(canvasImage, apiImage, 'parity-multiple', { threshold: 0.3 });

        console.log(`Multiple elements parity: ${result.diffPercentage.toFixed(2)}% difference`);
        expect(result.diffPercentage).toBeLessThan(60);
    });
});
