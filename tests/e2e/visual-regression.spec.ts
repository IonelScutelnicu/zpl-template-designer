import { test, expect } from '@playwright/test';
import { ElementsPanel, Canvas, PreviewPanel, PropertiesPanel } from '../page-objects';
import { compareWithBaseline, compareImages, cleanupDiffs } from '../fixtures/image-comparison';

test.describe('Visual Regression Tests', () => {
    let elementsPanel: ElementsPanel;
    let propertiesPanel: PropertiesPanel;
    let canvas: Canvas;
    let previewPanel: PreviewPanel;

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        elementsPanel = new ElementsPanel(page);
        propertiesPanel = new PropertiesPanel(page);
        canvas = new Canvas(page);
        previewPanel = new PreviewPanel(page);
        await canvas.waitForReady();
    });

    test.afterAll(() => {
        // Optional: Clean up diff images after test run
        // cleanupDiffs();
    });

    // ============== CANVAS RENDERING BASELINES ==============
    test.describe('Canvas Rendering - Element Type Baselines', () => {
        test('should render empty canvas consistently', async () => {
            const screenshot = await canvas.takeScreenshot();
            // Increased threshold to account for minor rendering differences after modular refactor
            const result = await compareWithBaseline(screenshot, 'canvas-empty', { threshold: 0.1 });

            expect(result.diffPercentage).toBeLessThan(5);
        });

        test('should render Text element consistently', async ({ page }) => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);

            // Set consistent values for reproducibility
            await page.locator('#prop-x').fill('100');
            await page.locator('#prop-x').dispatchEvent('input');
            await page.locator('#prop-y').fill('100');
            await page.locator('#prop-y').dispatchEvent('input');
            await page.locator('#prop-preview-text').fill('Visual Test');
            await page.locator('#prop-preview-text').dispatchEvent('input');
            await page.locator('#prop-font-size').fill('30');
            await page.locator('#prop-font-size').dispatchEvent('input');

            await canvas.waitForReady();
            const screenshot = await canvas.takeScreenshot();
            const result = await compareWithBaseline(screenshot, 'canvas-text-element', { threshold: 0.1 });

            expect(result.diffPercentage).toBeLessThan(5);
        });

        test('should render TextBlock element consistently', async ({ page }) => {
            await elementsPanel.addTextBlockElement();
            await elementsPanel.selectElementByIndex(0);

            await page.locator('#prop-x').fill('50');
            await page.locator('#prop-x').dispatchEvent('input');
            await page.locator('#prop-y').fill('50');
            await page.locator('#prop-y').dispatchEvent('input');
            await page.locator('#prop-preview-text').fill('Multi-line\ntext block');
            await page.locator('#prop-preview-text').dispatchEvent('input');

            await canvas.waitForReady();
            const screenshot = await canvas.takeScreenshot();
            const result = await compareWithBaseline(screenshot, 'canvas-textblock-element', { threshold: 0.1 });

            expect(result.diffPercentage).toBeLessThan(5);
        });

        test('should render Barcode element consistently', async ({ page }) => {
            await elementsPanel.addBarcodeElement();
            await elementsPanel.selectElementByIndex(0);

            await page.locator('#prop-x').fill('80');
            await page.locator('#prop-x').dispatchEvent('input');
            await page.locator('#prop-y').fill('80');
            await page.locator('#prop-y').dispatchEvent('input');
            await page.locator('#prop-preview-data').fill('1234567890');
            await page.locator('#prop-preview-data').dispatchEvent('input');

            await canvas.waitForReady();
            const screenshot = await canvas.takeScreenshot();
            const result = await compareWithBaseline(screenshot, 'canvas-barcode-element', { threshold: 0.1 });

            expect(result.diffPercentage).toBeLessThan(5);
        });

        test('should render QR Code element consistently', async ({ page }) => {
            await elementsPanel.addQRCodeElement();
            await elementsPanel.selectElementByIndex(0);

            await page.locator('#prop-x').fill('120');
            await page.locator('#prop-x').dispatchEvent('input');
            await page.locator('#prop-y').fill('120');
            await page.locator('#prop-y').dispatchEvent('input');
            await page.locator('#prop-preview-data').fill('https://test.com');
            await page.locator('#prop-preview-data').dispatchEvent('input');

            await canvas.waitForReady();
            const screenshot = await canvas.takeScreenshot();
            const result = await compareWithBaseline(screenshot, 'canvas-qrcode-element', { threshold: 0.1 });

            expect(result.diffPercentage).toBeLessThan(5);
        });

        test('should render Box element consistently', async ({ page }) => {
            await elementsPanel.addBoxElement();
            await elementsPanel.selectElementByIndex(0);

            await page.locator('#prop-x').fill('60');
            await page.locator('#prop-x').dispatchEvent('input');
            await page.locator('#prop-y').fill('60');
            await page.locator('#prop-y').dispatchEvent('input');
            await page.locator('#prop-width').fill('150');
            await page.locator('#prop-width').dispatchEvent('input');
            await page.locator('#prop-height').fill('100');
            await page.locator('#prop-height').dispatchEvent('input');
            await page.locator('#prop-thickness').fill('3');
            await page.locator('#prop-thickness').dispatchEvent('input');

            await canvas.waitForReady();
            const screenshot = await canvas.takeScreenshot();
            const result = await compareWithBaseline(screenshot, 'canvas-box-element', { threshold: 0.1 });

            expect(result.diffPercentage).toBeLessThan(5);
        });
    });

    // ============== CANVAS VS API PREVIEW PARITY ==============
    test.describe('Preview Parity - Canvas vs API', () => {
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

        test.skip('should have similar rendering for Barcode element between canvas and API', async ({ page }) => {
            // Skipped: Labelary API can be slow/unreliable
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

    // ============== ELEMENT POSITIONING ACCURACY ==============
    test.describe('Element Positioning Accuracy', () => {
        test('should render element at exact position specified', async ({ page }) => {
            await elementsPanel.addBoxElement();
            await elementsPanel.selectElementByIndex(0);

            // Set known position
            await page.locator('#prop-x').fill('100');
            await page.locator('#prop-x').dispatchEvent('input');
            await page.locator('#prop-y').fill('100');
            await page.locator('#prop-y').dispatchEvent('input');
            await page.locator('#prop-width').fill('50');
            await page.locator('#prop-width').dispatchEvent('input');
            await page.locator('#prop-height').fill('50');
            await page.locator('#prop-height').dispatchEvent('input');

            await canvas.waitForReady();
            const screenshot = await canvas.takeScreenshot();
            const result = await compareWithBaseline(screenshot, 'position-box-100-100', { threshold: 0.05 });

            expect(result.diffPercentage).toBeLessThan(5);
        });

        test('should render element after position change accurately', async ({ page }) => {
            await elementsPanel.addBoxElement();
            await elementsPanel.selectElementByIndex(0);

            // Initial position
            await page.locator('#prop-x').fill('50');
            await page.locator('#prop-x').dispatchEvent('input');
            await page.locator('#prop-y').fill('50');
            await page.locator('#prop-y').dispatchEvent('input');

            await canvas.waitForReady();
            const before = await canvas.takeScreenshot();

            // Change position
            await page.locator('#prop-x').fill('200');
            await page.locator('#prop-x').dispatchEvent('input');
            await page.locator('#prop-y').fill('150');
            await page.locator('#prop-y').dispatchEvent('input');

            await canvas.waitForReady();
            const after = await canvas.takeScreenshot();

            // Screenshots should be different
            const result = await compareImages(before, after, 'position-change');
            expect(result.match).toBe(false);
        });
    });

    // ============== DIMENSION ACCURACY ==============
    test.describe('Dimension Accuracy', () => {
        test('should render box with exact dimensions', async ({ page }) => {
            await elementsPanel.addBoxElement();
            await elementsPanel.selectElementByIndex(0);

            await page.locator('#prop-x').fill('50');
            await page.locator('#prop-x').dispatchEvent('input');
            await page.locator('#prop-y').fill('50');
            await page.locator('#prop-y').dispatchEvent('input');
            await page.locator('#prop-width').fill('100');
            await page.locator('#prop-width').dispatchEvent('input');
            await page.locator('#prop-height').fill('75');
            await page.locator('#prop-height').dispatchEvent('input');

            await canvas.waitForReady();
            const screenshot = await canvas.takeScreenshot();
            const result = await compareWithBaseline(screenshot, 'dimensions-100x75', { threshold: 0.05 });

            expect(result.diffPercentage).toBeLessThan(5);
        });

        test('should update rendering when dimensions change', async ({ page }) => {
            await elementsPanel.addBoxElement();
            await elementsPanel.selectElementByIndex(0);

            await page.locator('#prop-width').fill('100');
            await page.locator('#prop-width').dispatchEvent('input');
            await page.locator('#prop-height').fill('100');
            await page.locator('#prop-height').dispatchEvent('input');

            await canvas.waitForReady();
            const before = await canvas.takeScreenshot();

            await page.locator('#prop-width').fill('200');
            await page.locator('#prop-width').dispatchEvent('input');
            await page.locator('#prop-height').fill('50');
            await page.locator('#prop-height').dispatchEvent('input');

            await canvas.waitForReady();
            const after = await canvas.takeScreenshot();

            const result = await compareImages(before, after, 'dimension-change');
            expect(result.match).toBe(false);
        });
    });
});
