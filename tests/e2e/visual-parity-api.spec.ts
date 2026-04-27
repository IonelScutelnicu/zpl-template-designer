import { test, expect } from '../fixtures';
import { ElementsPanel, Canvas, PreviewPanel } from '../page-objects';
import { compareImages, findContentBounds, getImageDimensions } from '../fixtures/image-comparison';

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

        // Get canvas at full dot resolution (unaffected by CSS scaling)
        await canvas.waitForReady();
        const canvasImage = await canvas.takeFullResolutionScreenshot();

        // Get API preview at full dot resolution
        await previewPanel.switchToAPIMode();
        await previewPanel.refreshPreview();
        await previewPanel.waitForAPIPreviewLoaded();
        const apiImage = await previewPanel.getAPIPreviewFullResolution();

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

        const canvasImage = await canvas.takeFullResolutionScreenshot();

        await previewPanel.switchToAPIMode();
        await previewPanel.refreshPreview();
        await previewPanel.waitForAPIPreviewLoaded();
        const apiImage = await previewPanel.getAPIPreviewFullResolution();

        const result = await compareImages(canvasImage, apiImage, 'parity-box', { threshold: 0.3 });

        console.log(`Box parity: ${result.diffPercentage.toFixed(2)}% difference`);
        expect(result.diffPercentage).toBeLessThan(50);
    });

    test('should have similar rendering for Box with rounding=4 between canvas and API', async ({ page }) => {
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
        await page.locator('#prop-rounding').fill('4');
        await page.locator('#prop-rounding').dispatchEvent('input');

        const canvasImage = await canvas.takeFullResolutionScreenshot();

        await previewPanel.switchToAPIMode();
        await previewPanel.refreshPreview();
        await previewPanel.waitForAPIPreviewLoaded();
        const apiImage = await previewPanel.getAPIPreviewFullResolution();

        const result = await compareImages(canvasImage, apiImage, 'parity-box-rounded-4', { threshold: 0.3 });

        console.log(`Box rounding=4 parity: ${result.diffPercentage.toFixed(2)}% difference`);
        expect(result.diffPercentage).toBeLessThan(50);
    });

    test('should have similar rendering for Box with rounding=8 between canvas and API', async ({ page }) => {
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
        await page.locator('#prop-rounding').fill('8');
        await page.locator('#prop-rounding').dispatchEvent('input');

        const canvasImage = await canvas.takeFullResolutionScreenshot();

        await previewPanel.switchToAPIMode();
        await previewPanel.refreshPreview();
        await previewPanel.waitForAPIPreviewLoaded();
        const apiImage = await previewPanel.getAPIPreviewFullResolution();

        const result = await compareImages(canvasImage, apiImage, 'parity-box-rounded-8', { threshold: 0.3 });

        console.log(`Box rounding=8 parity: ${result.diffPercentage.toFixed(2)}% difference`);
        expect(result.diffPercentage).toBeLessThan(50);
    });

    test('should have similar rendering for Line with rounding=4 between canvas and API', async ({ page }) => {
        await elementsPanel.addLineElement();
        await elementsPanel.selectElementByIndex(0);

        await page.locator('#prop-x').fill('50');
        await page.locator('#prop-x').dispatchEvent('input');
        await page.locator('#prop-y').fill('50');
        await page.locator('#prop-y').dispatchEvent('input');
        await page.locator('#prop-width').fill('200');
        await page.locator('#prop-width').dispatchEvent('input');
        await page.locator('#prop-thickness').fill('30');
        await page.locator('#prop-thickness').dispatchEvent('input');
        await page.locator('#prop-rounding').fill('4');
        await page.locator('#prop-rounding').dispatchEvent('input');

        const canvasImage = await canvas.takeFullResolutionScreenshot();

        await previewPanel.switchToAPIMode();
        await previewPanel.refreshPreview();
        await previewPanel.waitForAPIPreviewLoaded();
        const apiImage = await previewPanel.getAPIPreviewFullResolution();

        const result = await compareImages(canvasImage, apiImage, 'parity-line-rounded-4', { threshold: 0.3 });

        console.log(`Line rounding=4 parity: ${result.diffPercentage.toFixed(2)}% difference`);
        expect(result.diffPercentage).toBeLessThan(50);
    });

    test('should have similar rendering for Barcode element between canvas and API', async ({ page }) => {
        await elementsPanel.addBarcodeElement();
        await elementsPanel.selectElementByIndex(0);

        await page.locator('#prop-x').fill('100');
        await page.locator('#prop-x').dispatchEvent('input');
        await page.locator('#prop-y').fill('100');
        await page.locator('#prop-y').dispatchEvent('input');

        const canvasImage = await canvas.takeFullResolutionScreenshot();

        await previewPanel.switchToAPIMode();
        await previewPanel.refreshPreview();
        await previewPanel.waitForAPIPreviewLoaded();
        const apiImage = await previewPanel.getAPIPreviewFullResolution();

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
        const canvasImage = await canvas.takeFullResolutionScreenshot();

        await previewPanel.switchToAPIMode();
        await previewPanel.refreshPreview();
        await previewPanel.waitForAPIPreviewLoaded();
        const apiImage = await previewPanel.getAPIPreviewFullResolution();

        const result = await compareImages(canvasImage, apiImage, 'parity-multiple', { threshold: 0.3 });

        console.log(`Multiple elements parity: ${result.diffPercentage.toFixed(2)}% difference`);
        expect(result.diffPercentage).toBeLessThan(60);
    });

    test('should have similar rendering for TextBlock with long word between canvas and API', async ({ page }) => {
        await elementsPanel.addTextBlockElement();
        await elementsPanel.selectElementByIndex(0);

        await page.locator('#prop-x').fill('50');
        await page.locator('#prop-x').dispatchEvent('input');
        await page.locator('#prop-y').fill('50');
        await page.locator('#prop-y').dispatchEvent('input');
        await page.locator('#prop-block-width').fill('200');
        await page.locator('#prop-block-width').dispatchEvent('input');
        await page.locator('#prop-block-height').fill('200');
        await page.locator('#prop-block-height').dispatchEvent('input');
        // Long word without spaces — must be hard-split
        await page.locator('#prop-preview-text').fill('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
        await page.locator('#prop-preview-text').dispatchEvent('input');

        const canvasImage = await canvas.takeFullResolutionScreenshot();

        await previewPanel.switchToAPIMode();
        await previewPanel.refreshPreview();
        await previewPanel.waitForAPIPreviewLoaded();
        const apiImage = await previewPanel.getAPIPreviewFullResolution();

        const result = await compareImages(canvasImage, apiImage, 'parity-textblock-long-word', { threshold: 0.3 });

        console.log(`TextBlock long word parity: ${result.diffPercentage.toFixed(2)}% difference`);
        expect(result.diffPercentage).toBeLessThan(50);
    });

    test('should have similar rendering for FieldBlock with long word between canvas and API', async ({ page }) => {
        await elementsPanel.addFieldBlockElement();
        await elementsPanel.selectElementByIndex(0);

        await page.locator('#prop-x').fill('50');
        await page.locator('#prop-x').dispatchEvent('input');
        await page.locator('#prop-y').fill('50');
        await page.locator('#prop-y').dispatchEvent('input');
        await page.locator('#prop-block-width').fill('200');
        await page.locator('#prop-block-width').dispatchEvent('input');
        await page.locator('#prop-max-lines').fill('5');
        await page.locator('#prop-max-lines').dispatchEvent('input');
        // Long word without spaces — must be hard-split
        await page.locator('#prop-preview-text').fill('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
        await page.locator('#prop-preview-text').dispatchEvent('input');

        const canvasImage = await canvas.takeFullResolutionScreenshot();

        await previewPanel.switchToAPIMode();
        await previewPanel.refreshPreview();
        await previewPanel.waitForAPIPreviewLoaded();
        const apiImage = await previewPanel.getAPIPreviewFullResolution();

        const result = await compareImages(canvasImage, apiImage, 'parity-fieldblock-long-word', { threshold: 0.3 });

        console.log(`FieldBlock long word parity: ${result.diffPercentage.toFixed(2)}% difference`);
        expect(result.diffPercentage).toBeLessThan(50);
    });

    test('should have matching QR code bounding box between canvas and API', async ({ page }) => {
        // Label is 100mm x 50mm at 8dpmm = 800 x 400 dots
        const labelWidthDots = 800;
        const labelHeightDots = 400;

        await elementsPanel.addQRCodeElement();
        await elementsPanel.selectElementByIndex(0);

        await page.locator('#prop-x').fill('50');
        await page.locator('#prop-x').dispatchEvent('input');
        await page.locator('#prop-y').fill('50');
        await page.locator('#prop-y').dispatchEvent('input');

        await canvas.waitForReady();
        const canvasImage = await canvas.takeFullResolutionScreenshot();

        await previewPanel.switchToAPIMode();
        await previewPanel.refreshPreview();
        await previewPanel.waitForAPIPreviewLoaded();
        const apiImage = await previewPanel.getAPIPreviewFullResolution();

        // Find dark pixels only (QR code modules), ignoring label border/background
        const canvasBounds = findContentBounds(canvasImage);
        const apiBounds = findContentBounds(apiImage);

        const canvasDims = getImageDimensions(canvasImage);
        const apiDims = getImageDimensions(apiImage);

        // Convert pixel bounds to dot-space using image dimensions
        const canvasDots = {
            left: canvasBounds.left * labelWidthDots / canvasDims.width,
            top: canvasBounds.top * labelHeightDots / canvasDims.height,
            width: canvasBounds.width * labelWidthDots / canvasDims.width,
            height: canvasBounds.height * labelHeightDots / canvasDims.height,
        };
        const apiDots = {
            left: apiBounds.left * labelWidthDots / apiDims.width,
            top: apiBounds.top * labelHeightDots / apiDims.height,
            width: apiBounds.width * labelWidthDots / apiDims.width,
            height: apiBounds.height * labelHeightDots / apiDims.height,
        };

        console.log('Canvas image size:', canvasDims);
        console.log('API image size:', apiDims);
        console.log('Canvas pixel bounds:', canvasBounds);
        console.log('API pixel bounds:', apiBounds);
        console.log('Canvas dot-space:', canvasDots);
        console.log('API dot-space:', apiDots);
        console.log('Dot-space diff - X:', (canvasDots.left - apiDots.left).toFixed(1), 'Y:', (canvasDots.top - apiDots.top).toFixed(1));
        console.log('Dot-space diff - W:', (canvasDots.width - apiDots.width).toFixed(1), 'H:', (canvasDots.height - apiDots.height).toFixed(1));

        // Width and height should match within 10 dots
        expect(Math.abs(canvasDots.width - apiDots.width)).toBeLessThan(10);
        expect(Math.abs(canvasDots.height - apiDots.height)).toBeLessThan(10);
        // Position should match within 10 dots
        expect(Math.abs(canvasDots.top - apiDots.top)).toBeLessThan(10);
        expect(Math.abs(canvasDots.left - apiDots.left)).toBeLessThan(10);
    });
});
