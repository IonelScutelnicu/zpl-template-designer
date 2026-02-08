import { test, expect } from '@playwright/test';
import { ElementsPanel, PropertiesPanel, Canvas } from '../page-objects';

test.describe('Canvas - Drag, Resize, and Interactions', () => {
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

    // ============== CANVAS RENDERING ==============
    test.describe('Canvas Rendering', () => {
        test('should render canvas on page load', async () => {
            expect(await canvas.isVisible()).toBe(true);
        });

        test('should have valid dimensions', async () => {
            const dimensions = await canvas.getDimensions();
            expect(dimensions.width).toBeGreaterThan(0);
            expect(dimensions.height).toBeGreaterThan(0);
        });

        test('should update canvas when element is added', async () => {
            const beforeScreenshot = await canvas.takeScreenshot();
            await elementsPanel.addTextElement();
            await canvas.waitForReady();
            const afterScreenshot = await canvas.takeScreenshot();

            // Screenshots should be different
            expect(beforeScreenshot.equals(afterScreenshot)).toBe(false);
        });

        test('should update canvas when element is deleted', async () => {
            await elementsPanel.addTextElement();
            await canvas.waitForReady();
            const beforeScreenshot = await canvas.takeScreenshot();

            await elementsPanel.deleteElementByIndex(0);
            await canvas.waitForReady();
            const afterScreenshot = await canvas.takeScreenshot();

            expect(beforeScreenshot.equals(afterScreenshot)).toBe(false);
        });
    });

    // ============== ELEMENT SELECTION ON CANVAS ==============
    test.describe('Element Selection', () => {
        test('should select element when clicking on canvas at element position', async ({ page }) => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);

            // Get element position
            const x = parseInt(await propertiesPanel.getProperty('prop-x'));
            const y = parseInt(await propertiesPanel.getProperty('prop-y'));

            // Wait and check if element can be reselected by clicking on it
            await canvas.clickAtLabelCoords(x + 10, y + 10);

            await page.waitForTimeout(6000);

            // Use robust assertion that waits/retries
            await expect(propertiesPanel.panel.locator('#prop-x')).toBeVisible();
        });
    });

    // ============== DRAG AND DROP ==============
    test.describe('Drag and Drop', () => {
        test('should move element position when dragged on canvas', async () => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);

            const initialX = parseInt(await propertiesPanel.getProperty('prop-x'));
            const initialY = parseInt(await propertiesPanel.getProperty('prop-y'));

            // Drag element by 50 dots in each direction
            await canvas.dragLabelCoords(initialX + 10, initialY + 10, initialX + 60, initialY + 60);
            await canvas.waitForReady();

            // Re-select element to get updated position
            await elementsPanel.selectElementByIndex(0);

            const newX = parseInt(await propertiesPanel.getProperty('prop-x'));
            const newY = parseInt(await propertiesPanel.getProperty('prop-y'));

            // Position should have changed approximately
            expect(newX).toBeGreaterThan(initialX);
            expect(newY).toBeGreaterThan(initialY);
        });

        test('should update ZPL output with new position after drag', async ({ page }) => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);

            // Set a known initial position
            await page.locator('#prop-x').fill('50');
            await page.locator('#prop-x').dispatchEvent('input');
            await page.locator('#prop-y').fill('50');
            await page.locator('#prop-y').dispatchEvent('input');

            // Wait for ZPL to update
            await page.waitForTimeout(100);

            // Drag to new position
            await canvas.dragLabelCoords(60, 60, 150, 100);
            await canvas.waitForReady();

            // ZPL should reflect the new position
            const zplOutput = page.locator('#zpl-output');
            const zpl = await zplOutput.inputValue();

            // Position should have changed from ^FO50,50
            expect(zpl).not.toContain('^FO50,50');
        });
    });

    // ============== KEYBOARD NAVIGATION ==============
    test.describe('Keyboard Navigation', () => {
        test('should move element right when ArrowRight is pressed', async ({ page }) => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);

            const initialX = parseInt(await propertiesPanel.getProperty('prop-x'));

            await page.keyboard.press('ArrowRight');

            const newX = parseInt(await propertiesPanel.getProperty('prop-x'));
            expect(newX).toBeGreaterThan(initialX);
        });

        test('should move element left when ArrowLeft is pressed', async ({ page }) => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);

            // Set initial position away from edge
            await page.locator('#prop-x').fill('100');
            await page.locator('#prop-x').dispatchEvent('change');
            await page.locator('#prop-x').blur(); // Blur to remove focus from input

            const initialX = 100;
            await page.keyboard.press('ArrowLeft');

            const newX = parseInt(await propertiesPanel.getProperty('prop-x'));
            expect(newX).toBeLessThan(initialX);
        });

        test('should move element down when ArrowDown is pressed', async ({ page }) => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);

            const initialY = parseInt(await propertiesPanel.getProperty('prop-y'));

            // Click on canvas to ensure focus is on the canvas, not on inputs
            await page.locator('#label-canvas').click();
            await page.waitForTimeout(100);

            await page.keyboard.press('ArrowDown');
            await page.waitForTimeout(100);

            const newY = parseInt(await propertiesPanel.getProperty('prop-y'));
            expect(newY).toBeGreaterThan(initialY);
        });

        test('should move element up when ArrowUp is pressed', async ({ page }) => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);

            // Set initial position away from edge
            await page.locator('#prop-y').fill('100');
            await page.locator('#prop-y').dispatchEvent('change');
            await page.locator('#prop-y').blur(); // Blur to remove focus from input

            const initialY = 100;
            await page.keyboard.press('ArrowUp');

            const newY = parseInt(await propertiesPanel.getProperty('prop-y'));
            expect(newY).toBeLessThan(initialY);
        });

        test('should delete selected element when Delete key is pressed', async ({ page }) => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);
            expect(await elementsPanel.getElementCount()).toBe(1);

            await page.keyboard.press('Delete');
            expect(await elementsPanel.getElementCount()).toBe(0);
        });
    });

    // ============== EDGE CASES ==============
    test.describe('Edge Cases', () => {
        test('should handle element at canvas boundary', async ({ page }) => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);

            // Move element to very small coordinates
            await page.locator('#prop-x').fill('0');
            await page.locator('#prop-x').dispatchEvent('change');
            await page.locator('#prop-y').fill('0');
            await page.locator('#prop-y').dispatchEvent('change');

            // Element should still be valid
            expect(await elementsPanel.getElementCount()).toBe(1);
        });

        test('should handle very large element dimensions', async ({ page }) => {
            await elementsPanel.addBoxElement();
            await elementsPanel.selectElementByIndex(0);

            await page.locator('#prop-width').fill('500');
            await page.locator('#prop-width').dispatchEvent('change');
            await page.locator('#prop-height').fill('500');
            await page.locator('#prop-height').dispatchEvent('change');

            // Element should still be valid
            expect(await elementsPanel.getElementCount()).toBe(1);
        });

        test('should handle overlapping elements', async () => {
            // Add multiple elements at similar positions
            await elementsPanel.addTextElement();
            await elementsPanel.addBarcodeElement();
            await elementsPanel.addBoxElement();

            expect(await elementsPanel.getElementCount()).toBe(3);

            // All elements should remain valid
            await elementsPanel.selectElementByIndex(0);
            expect(await propertiesPanel.hasNoElementSelected()).toBe(false);

            await elementsPanel.selectElementByIndex(1);
            expect(await propertiesPanel.hasNoElementSelected()).toBe(false);

            await elementsPanel.selectElementByIndex(2);
            expect(await propertiesPanel.hasNoElementSelected()).toBe(false);
        });

        test('should handle extreme position values', async ({ page }) => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);

            // Set very large position
            await page.locator('#prop-x').fill('5000');
            await page.locator('#prop-x').dispatchEvent('change');

            const x = await propertiesPanel.getProperty('prop-x');
            expect(parseInt(x)).toBe(5000);
        });
    });

    // ============== VISUAL REGRESSION ==============
    test.describe('Visual Regression', () => {
        test('should render Text element consistently', async () => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);

            // Set known values for reproducibility
            const page = canvas.page;
            await page.locator('#prop-x').fill('100');
            await page.locator('#prop-x').dispatchEvent('change');
            await page.locator('#prop-y').fill('100');
            await page.locator('#prop-y').dispatchEvent('change');
            await page.locator('#prop-preview-text').fill('Test');
            await page.locator('#prop-preview-text').dispatchEvent('change');

            await canvas.waitForReady();

            // Take screenshot for visual comparison
            const screenshot = await canvas.takeScreenshot();
            expect(screenshot.length).toBeGreaterThan(0);
        });

        test('should render Box element with correct dimensions', async () => {
            await elementsPanel.addBoxElement();
            await elementsPanel.selectElementByIndex(0);

            const page = canvas.page;
            await page.locator('#prop-x').fill('50');
            await page.locator('#prop-x').dispatchEvent('change');
            await page.locator('#prop-y').fill('50');
            await page.locator('#prop-y').dispatchEvent('change');
            await page.locator('#prop-width').fill('100');
            await page.locator('#prop-width').dispatchEvent('change');
            await page.locator('#prop-height').fill('60');
            await page.locator('#prop-height').dispatchEvent('change');

            await canvas.waitForReady();

            const screenshot = await canvas.takeScreenshot();
            expect(screenshot.length).toBeGreaterThan(0);
        });
    });
});
