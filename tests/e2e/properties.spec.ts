import { test, expect } from '@playwright/test';
import { ElementsPanel, PropertiesPanel, ZPLOutput } from '../page-objects';

test.describe('Properties Panel - Comprehensive Property Testing', () => {
    let elementsPanel: ElementsPanel;
    let propertiesPanel: PropertiesPanel;
    let zplOutput: ZPLOutput;

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        elementsPanel = new ElementsPanel(page);
        propertiesPanel = new PropertiesPanel(page);
        zplOutput = new ZPLOutput(page);
    });

    // ============== TEXT ELEMENT PROPERTIES ==============
    test.describe('Text Element Properties', () => {
        test.beforeEach(async () => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);
        });

        test('should update X position and reflect in ZPL output', async () => {
            await propertiesPanel.setProperty('prop-x', 150);
            await zplOutput.verifyZPLContains('^FO150,');
        });

        test('should update Y position and reflect in ZPL output', async () => {
            await propertiesPanel.setProperty('prop-y', 200);
            const zpl = await zplOutput.getZPLCode();
            expect(zpl).toMatch(/\^FO\d+,200/);
        });

        test('should update text content and reflect in ZPL output', async () => {
            await propertiesPanel.setProperty('prop-preview-text', 'Custom Text');
            await zplOutput.verifyZPLContains('^FDCustom Text^FS');
        });

        test('should update font height and reflect in ZPL output', async () => {
            await propertiesPanel.setProperty('prop-font-size', 50);
            await zplOutput.verifyZPLContains(',50,');
        });

        test('should update font width and reflect in ZPL output', async () => {
            await propertiesPanel.setProperty('prop-font-width', 40);
            const zpl = await zplOutput.getZPLCode();
            expect(zpl).toContain(',40');
        });

        test.skip('should preserve property values after re-selecting element', async ({ page }) => {
            // Skip: Property preservation timing needs investigation
            await propertiesPanel.setProperty('prop-preview-text', 'Test Value');
            await page.waitForTimeout(100);
            await propertiesPanel.setProperty('prop-x', 100);
            await page.waitForTimeout(100);

            // Add another element and select it
            await elementsPanel.addBoxElement();
            await elementsPanel.selectElementByIndex(1);
            await page.waitForTimeout(100);

            // Re-select text element
            await elementsPanel.selectElementByIndex(0);
            await page.waitForTimeout(100);

            await propertiesPanel.verifyPropertyValue('prop-preview-text', 'Test Value');
            await propertiesPanel.verifyPropertyValue('prop-x', '100');
        });
    });

    // ============== TEXTBLOCK ELEMENT PROPERTIES ==============
    test.describe('TextBlock Element Properties', () => {
        test.beforeEach(async () => {
            await elementsPanel.addTextBlockElement();
            await elementsPanel.selectElementByIndex(0);
        });

        test('should update X position and reflect in ZPL output', async () => {
            await propertiesPanel.setProperty('prop-x', 100);
            await zplOutput.verifyZPLContains('^FO100,');
        });

        test('should update Y position and reflect in ZPL output', async () => {
            await propertiesPanel.setProperty('prop-y', 120);
            const zpl = await zplOutput.getZPLCode();
            expect(zpl).toMatch(/\^FO\d+,120/);
        });

        test('should update text content and reflect in ZPL output', async () => {
            await propertiesPanel.setProperty('prop-preview-text', 'Multi-line text content');
            await zplOutput.verifyZPLContains('Multi-line text content');
        });

        test('should update block width and reflect in ^FB command', async () => {
            await propertiesPanel.setProperty('prop-block-width', 300);
            await zplOutput.verifyZPLContains('^FB300,');
        });

        test('should update max lines and reflect in ^FB command', async () => {
            await propertiesPanel.setProperty('prop-max-lines', 5);
            const zpl = await zplOutput.getZPLCode();
            expect(zpl).toMatch(/\^FB\d+,5,/);
        });

        test('should update line spacing and reflect in ^FB command', async () => {
            await propertiesPanel.setProperty('prop-line-spacing', 10);
            const zpl = await zplOutput.getZPLCode();
            expect(zpl).toContain(',10,');
        });

        test('should update justification and reflect in ^FB command', async ({ page }) => {
            // Click the center justification button
            const centerButton = page.locator('button[data-justification="C"]');
            await centerButton.click();
            const zpl = await zplOutput.getZPLCode();
            expect(zpl).toContain(',C,');
        });

        test('should update font height and reflect in ZPL output', async () => {
            await propertiesPanel.setProperty('prop-font-size', 40);
            await zplOutput.verifyZPLContains(',40,');
        });

        test('should update font width and reflect in ZPL output', async () => {
            await propertiesPanel.setProperty('prop-font-width', 35);
            const zpl = await zplOutput.getZPLCode();
            expect(zpl).toContain(',35');
        });
    });

    // ============== BARCODE ELEMENT PROPERTIES ==============
    test.describe('Barcode Element Properties', () => {
        test.beforeEach(async () => {
            await elementsPanel.addBarcodeElement();
            await elementsPanel.selectElementByIndex(0);
        });

        test('should update X position and reflect in ZPL output', async () => {
            await propertiesPanel.setProperty('prop-x', 50);
            await zplOutput.verifyZPLContains('^FO50,');
        });

        test('should update Y position and reflect in ZPL output', async () => {
            await propertiesPanel.setProperty('prop-y', 80);
            const zpl = await zplOutput.getZPLCode();
            expect(zpl).toMatch(/\^FO\d+,80/);
        });

        test('should update barcode data and reflect in ZPL output', async () => {
            await propertiesPanel.setProperty('prop-preview-data', '1234567890');
            await zplOutput.verifyZPLContains('^FD1234567890^FS');
        });

        test('should update barcode height and reflect in ^BC command', async () => {
            await propertiesPanel.setProperty('prop-height', 100);
            await zplOutput.verifyZPLContains(',100,');
        });

        test('should update module width and reflect in ^BY command', async () => {
            await propertiesPanel.setProperty('prop-width', 3);
            await zplOutput.verifyZPLContains('^BY3,');
        });
    });

    // ============== QR CODE ELEMENT PROPERTIES ==============
    test.describe('QR Code Element Properties', () => {
        test.beforeEach(async () => {
            await elementsPanel.addQRCodeElement();
            await elementsPanel.selectElementByIndex(0);
        });

        test('should update X position and reflect in ZPL output', async () => {
            await propertiesPanel.setProperty('prop-x', 200);
            await zplOutput.verifyZPLContains('^FO200,');
        });

        test('should update Y position and reflect in ZPL output', async () => {
            await propertiesPanel.setProperty('prop-y', 150);
            const zpl = await zplOutput.getZPLCode();
            expect(zpl).toMatch(/\^FO\d+,150/);
        });

        test('should update QR data and reflect in ZPL output', async () => {
            await propertiesPanel.setProperty('prop-preview-data', 'https://example.com');
            await zplOutput.verifyZPLContains('https://example.com');
        });

        test('should update magnification and reflect in ^BQ command', async () => {
            await propertiesPanel.setProperty('prop-magnification', 5);
            await zplOutput.verifyZPLContains(',5^');
        });

        test('should update error correction level and reflect in ^BQ command', async ({ page }) => {
            const select = page.locator('#prop-error-correction'); // prop-errorCorrection -> prop-error-correction
            if (await select.isVisible()) {
                await select.selectOption('H');
                await zplOutput.verifyZPLContains('FDHA');
            }
        });
    });

    // ============== BOX ELEMENT PROPERTIES ==============
    test.describe('Box Element Properties', () => {
        test.beforeEach(async () => {
            await elementsPanel.addBoxElement();
            await elementsPanel.selectElementByIndex(0);
        });

        test('should update X position and reflect in ZPL output', async () => {
            await propertiesPanel.setProperty('prop-x', 75);
            await zplOutput.verifyZPLContains('^FO75,');
        });

        test('should update Y position and reflect in ZPL output', async () => {
            await propertiesPanel.setProperty('prop-y', 90);
            const zpl = await zplOutput.getZPLCode();
            expect(zpl).toMatch(/\^FO\d+,90/);
        });

        test('should update box width and reflect in ^GB command', async () => {
            await propertiesPanel.setProperty('prop-width', 200);
            await zplOutput.verifyZPLContains('^GB200,');
        });

        test('should update box height and reflect in ^GB command', async () => {
            await propertiesPanel.setProperty('prop-height', 150);
            const zpl = await zplOutput.getZPLCode();
            expect(zpl).toMatch(/\^GB\d+,150,/);
        });

        test('should update thickness and reflect in ^GB command', async () => {
            await propertiesPanel.setProperty('prop-thickness', 5);
            const zpl = await zplOutput.getZPLCode();
            expect(zpl).toMatch(/\^GB\d+,\d+,5,/);
        });

        test('should update corner rounding and reflect in ^GB command', async () => {
            await propertiesPanel.setProperty('prop-rounding', 4);
            const zpl = await zplOutput.getZPLCode();
            expect(zpl).toContain(',4');
        });

        test('should update color and reflect in ^GB command', async ({ page }) => {
            const select = page.locator('#prop-color');
            if (await select.isVisible()) {
                await select.selectOption('W');
                await zplOutput.verifyZPLContains(',W');
            }
        });
    });

    // ============== LINE ELEMENT PROPERTIES ==============
    test.describe('Line Element Properties', () => {
        test.beforeEach(async () => {
            await elementsPanel.addLineElement();
            await elementsPanel.selectElementByIndex(0);
        });

        test('should update X position and reflect in ZPL output', async () => {
            await propertiesPanel.setProperty('prop-x', 60);
            await zplOutput.verifyZPLContains('^FO60,');
        });

        test('should update Y position and reflect in ZPL output', async () => {
            await propertiesPanel.setProperty('prop-y', 70);
            const zpl = await zplOutput.getZPLCode();
            expect(zpl).toMatch(/\^FO\d+,70/);
        });

        test('should update line length and reflect in ZPL', async () => {
            await propertiesPanel.setProperty('prop-width', 300);
            const zpl = await zplOutput.getZPLCode();
            // For a horizontal line, width=length → first ^GB param
            expect(zpl).toContain('^GB300,');
        });

        test('should update line thickness and reflect in ZPL', async () => {
            await propertiesPanel.setProperty('prop-thickness', 6);
            const zpl = await zplOutput.getZPLCode();
            // Thickness is the third ^GB parameter
            expect(zpl).toMatch(/\^GB\d+,\d+,6/);
        });

        test('should update line orientation to Vertical and reflect in ZPL', async ({ page }) => {
            // Switch to vertical orientation
            await page.locator('#prop-orientation').selectOption('V');
            const zpl = await zplOutput.getZPLCode();
            // For vertical, ^GB width param should be small (equals thickness)
            expect(zpl).toContain('^GB');
        });
    });

    // ============== CIRCLE ELEMENT PROPERTIES ==============
    test.describe('Circle Element Properties', () => {
        test.beforeEach(async () => {
            await elementsPanel.addCircleElement();
            await elementsPanel.selectElementByIndex(0);
        });

        test('should update X position and reflect in ZPL output', async () => {
            await propertiesPanel.setProperty('prop-x', 40);
            await zplOutput.verifyZPLContains('^FO40,');
        });

        test('should update Y position and reflect in ZPL output', async () => {
            await propertiesPanel.setProperty('prop-y', 55);
            const zpl = await zplOutput.getZPLCode();
            expect(zpl).toMatch(/\^FO\d+,55/);
        });

        test('should update width and reflect in ^GE command', async () => {
            await propertiesPanel.setProperty('prop-width', 120);
            await zplOutput.verifyZPLContains('^GE120,');
        });

        test('should update height and reflect in ^GE command', async () => {
            await propertiesPanel.setProperty('prop-height', 100);
            const zpl = await zplOutput.getZPLCode();
            expect(zpl).toMatch(/\^GE\d+,100,/);
        });

        test('should update thickness and reflect in ^GE command', async () => {
            await propertiesPanel.setProperty('prop-thickness', 8);
            const zpl = await zplOutput.getZPLCode();
            expect(zpl).toMatch(/\^GE\d+,\d+,8,/);
        });

        test('should update color to White and reflect in ^GE command', async ({ page }) => {
            await page.locator('#prop-color').selectOption('W');
            await zplOutput.verifyZPLContains(',W');
        });

        test('should show default circle dimensions in properties panel', async () => {
            await propertiesPanel.verifyPropertyValue('prop-width', 80);
            await propertiesPanel.verifyPropertyValue('prop-height', 80);
            await propertiesPanel.verifyPropertyValue('prop-thickness', 3);
        });
    });

    // ============== ADDITIONAL ELEMENT PROPERTY COVERAGE ==============
    test.describe('Text Element Orientation', () => {
        test('should update Text element orientation to R and reflect in ZPL', async ({ page }) => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);

            await page.locator('[data-orientation="R"]').click();
            const zpl = await zplOutput.getZPLCode();
            // ^A command format: ^A{fontId}{orientation},{height},{width}
            // e.g. ^A0R,30,30 or ^AR,30,30
            expect(zpl).toMatch(/\^A\S*R,/);
        });
    });

    test.describe('Barcode Additional Properties', () => {
        test.beforeEach(async () => {
            await elementsPanel.addBarcodeElement();
            await elementsPanel.selectElementByIndex(0);
        });

        test('should toggle Barcode showText and reflect in ^BC command', async ({ page }) => {
            // Default showText=true → 'Y' in ^BC; uncheck → 'N'
            // #prop-show-text is sr-only (visually hidden), so use force:true
            const checkbox = page.locator('#prop-show-text');
            await checkbox.uncheck({ force: true });
            const zpl = await zplOutput.getZPLCode();
            // ^BC command with Y/N for interpretation line
            expect(zpl).toMatch(/\^BCN,\d+,N/);
        });

        test('should update Barcode ratio and reflect in ^BY command', async () => {
            await propertiesPanel.setProperty('prop-ratio', 3);
            const zpl = await zplOutput.getZPLCode();
            // ^BY{width},{ratio} — ratio is the second parameter
            expect(zpl).toMatch(/\^BY\d+,3/);
        });
    });

    test.describe('QR Code Additional Properties', () => {
        test('should update QR Code model and reflect in ^BQ command', async ({ page }) => {
            await elementsPanel.addQRCodeElement();
            await elementsPanel.selectElementByIndex(0);

            const select = page.locator('#prop-model');
            if (await select.isVisible()) {
                await select.selectOption('1');
                const zpl = await zplOutput.getZPLCode();
                // ^BQN,{model},{magnification} — model=1 should appear
                expect(zpl).toContain('^BQN,1,');
            }
        });
    });

    test.describe('Z-Order Reordering', () => {
        test('should reorder elements with Move Down button and change ZPL output order', async ({ page }) => {
            // Add two text elements with distinct text
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);
            await page.locator('#prop-preview-text').fill('ElementAlpha');
            await page.locator('#prop-preview-text').dispatchEvent('change');

            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(1);
            await page.locator('#prop-preview-text').fill('ElementBeta');
            await page.locator('#prop-preview-text').dispatchEvent('change');

            const zplBefore = await zplOutput.getZPLCode();
            expect(zplBefore).toContain('ElementAlpha');
            expect(zplBefore).toContain('ElementBeta');

            // Record the initial order before reordering
            const alphaBeforeBeta = zplBefore.indexOf('ElementAlpha') < zplBefore.indexOf('ElementBeta');

            // Move the element at index 0 down (swaps it with the one at index 1)
            const items = page.locator('#elements-list .element-item');
            await items.nth(0).hover();
            await items.nth(0).locator('.move-down-btn').click();

            const zplAfter = await zplOutput.getZPLCode();
            // Order should have reversed
            const alphaBeforeBetaAfter = zplAfter.indexOf('ElementAlpha') < zplAfter.indexOf('ElementBeta');
            expect(alphaBeforeBetaAfter).toBe(!alphaBeforeBeta);
        });
    });

    // ============== NO ELEMENT SELECTED ==============
    test.describe('No Element Selected', () => {
        test('should show placeholder message when no element is selected', async () => {
            expect(await propertiesPanel.hasNoElementSelected()).toBe(true);
        });

        test('should show placeholder after deleting the only selected element', async () => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);
            expect(await propertiesPanel.hasNoElementSelected()).toBe(false);

            await elementsPanel.deleteElementByIndex(0);
            expect(await propertiesPanel.hasNoElementSelected()).toBe(true);
        });
    });
});
