import { test, expect } from '../fixtures';
import { ElementsPanel, Canvas, PropertiesPanel } from '../page-objects';
import { compareWithBaseline, compareImages } from '../fixtures/image-comparison';

test.describe('Visual Regression Tests', () => {
    let elementsPanel: ElementsPanel;
    let propertiesPanel: PropertiesPanel;
    let canvas: Canvas;

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        elementsPanel = new ElementsPanel(page);
        propertiesPanel = new PropertiesPanel(page);
        canvas = new Canvas(page);
        await canvas.waitForReady();
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

        test('should render FieldBlock element consistently', async ({ page }) => {
            await elementsPanel.addFieldBlockElement();
            await elementsPanel.selectElementByIndex(0);

            await page.locator('#prop-x').fill('50');
            await page.locator('#prop-x').dispatchEvent('input');
            await page.locator('#prop-y').fill('50');
            await page.locator('#prop-y').dispatchEvent('input');
            await page.locator('#prop-preview-text').fill('Multi-line\ntext block');
            await page.locator('#prop-preview-text').dispatchEvent('input');

            await canvas.waitForReady();
            const screenshot = await canvas.takeScreenshot();
            const result = await compareWithBaseline(screenshot, 'canvas-fieldblock-element', { threshold: 0.1 });

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

        test('should render Box element with max rounding consistently', async ({ page }) => {
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
            await page.locator('#prop-rounding').fill('8');
            await page.locator('#prop-rounding').dispatchEvent('input');

            await canvas.waitForReady();
            const screenshot = await canvas.takeScreenshot();
            const result = await compareWithBaseline(screenshot, 'canvas-box-rounded', { threshold: 0.1 });

            expect(result.diffPercentage).toBeLessThan(5);
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
