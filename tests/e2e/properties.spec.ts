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
            // Centered field blocks must end with \& before ^FS to avoid layout issues
            expect(zpl).toMatch(/\^FD.*\\&\^FS/);
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
