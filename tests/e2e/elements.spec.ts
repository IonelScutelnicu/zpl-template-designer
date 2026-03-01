import { test, expect } from '../fixtures';
import { ElementsPanel, PropertiesPanel, ZPLOutput } from '../page-objects';

test.describe('Elements - Add, Select, Delete', () => {
    let elementsPanel: ElementsPanel;
    let propertiesPanel: PropertiesPanel;
    let zplOutput: ZPLOutput;

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        elementsPanel = new ElementsPanel(page);
        propertiesPanel = new PropertiesPanel(page);
        zplOutput = new ZPLOutput(page);
    });

    // ============== TEXT ELEMENT ==============
    test.describe('Text Element', () => {
        test('should add a Text element when clicking Add Text button', async () => {
            await elementsPanel.addTextElement();
            expect(await elementsPanel.getElementCount()).toBe(1);
        });

        test('should select Text element and show properties panel when clicking element in list', async () => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);
            expect(await propertiesPanel.hasNoElementSelected()).toBe(false);
        });

        test('should delete Text element via UI delete button', async () => {
            await elementsPanel.addTextElement();
            expect(await elementsPanel.getElementCount()).toBe(1);
            await elementsPanel.deleteElementByIndex(0);
            expect(await elementsPanel.getElementCount()).toBe(0);
        });

        test('should delete Text element via Delete key when element is selected', async ({ page }) => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);
            expect(await elementsPanel.getElementCount()).toBe(1);
            await page.keyboard.press('Delete');
            expect(await elementsPanel.getElementCount()).toBe(0);
        });

        test('should generate ZPL containing ^FD command for Text element', async () => {
            await elementsPanel.addTextElement();
            await zplOutput.verifyZPLContains('^FD');
        });
    });

    // ============== FIELD BLOCK ELEMENT ==============
    test.describe('FieldBlock Element', () => {
        test('should add a FieldBlock element when clicking Add Text Block button', async () => {
            await elementsPanel.addFieldBlockElement();
            expect(await elementsPanel.getElementCount()).toBe(1);
        });

        test('should select FieldBlock element and show properties panel', async () => {
            await elementsPanel.addFieldBlockElement();
            await elementsPanel.selectElementByIndex(0);
            expect(await propertiesPanel.hasNoElementSelected()).toBe(false);
        });

        test('should delete FieldBlock element via UI delete button', async () => {
            await elementsPanel.addFieldBlockElement();
            await elementsPanel.deleteElementByIndex(0);
            expect(await elementsPanel.getElementCount()).toBe(0);
        });

        test('should delete FieldBlock element via Delete key', async ({ page }) => {
            await elementsPanel.addFieldBlockElement();
            await elementsPanel.selectElementByIndex(0);
            await page.keyboard.press('Delete');
            expect(await elementsPanel.getElementCount()).toBe(0);
        });

        test('should generate ZPL containing ^FB command for FieldBlock element', async () => {
            await elementsPanel.addFieldBlockElement();
            await zplOutput.verifyZPLContains('^FB');
        });
    });

    // ============== BARCODE ELEMENT ==============
    test.describe('Barcode Element', () => {
        test('should add a Barcode element when clicking Add Barcode button', async () => {
            await elementsPanel.addBarcodeElement();
            expect(await elementsPanel.getElementCount()).toBe(1);
        });

        test('should select Barcode element and show properties panel', async () => {
            await elementsPanel.addBarcodeElement();
            await elementsPanel.selectElementByIndex(0);
            expect(await propertiesPanel.hasNoElementSelected()).toBe(false);
        });

        test('should delete Barcode element via UI delete button', async () => {
            await elementsPanel.addBarcodeElement();
            await elementsPanel.deleteElementByIndex(0);
            expect(await elementsPanel.getElementCount()).toBe(0);
        });

        test('should delete Barcode element via Delete key', async ({ page }) => {
            await elementsPanel.addBarcodeElement();
            await elementsPanel.selectElementByIndex(0);
            await page.keyboard.press('Delete');
            expect(await elementsPanel.getElementCount()).toBe(0);
        });

        test('should generate ZPL containing ^BC command for Barcode element', async () => {
            await elementsPanel.addBarcodeElement();
            await zplOutput.verifyZPLContains('^BC');
        });
    });

    // ============== QR CODE ELEMENT ==============
    test.describe('QR Code Element', () => {
        test('should add a QR Code element when clicking Add QR Code button', async () => {
            await elementsPanel.addQRCodeElement();
            expect(await elementsPanel.getElementCount()).toBe(1);
        });

        test('should select QR Code element and show properties panel', async () => {
            await elementsPanel.addQRCodeElement();
            await elementsPanel.selectElementByIndex(0);
            expect(await propertiesPanel.hasNoElementSelected()).toBe(false);
        });

        test('should delete QR Code element via UI delete button', async () => {
            await elementsPanel.addQRCodeElement();
            await elementsPanel.deleteElementByIndex(0);
            expect(await elementsPanel.getElementCount()).toBe(0);
        });

        test('should delete QR Code element via Delete key', async ({ page }) => {
            await elementsPanel.addQRCodeElement();
            await elementsPanel.selectElementByIndex(0);
            await page.keyboard.press('Delete');
            expect(await elementsPanel.getElementCount()).toBe(0);
        });

        test('should generate ZPL containing ^BQ command for QR Code element', async () => {
            await elementsPanel.addQRCodeElement();
            await zplOutput.verifyZPLContains('^BQ');
        });
    });

    // ============== BOX ELEMENT ==============
    test.describe('Box Element', () => {
        test('should add a Box element when clicking Add Box button', async () => {
            await elementsPanel.addBoxElement();
            expect(await elementsPanel.getElementCount()).toBe(1);
        });

        test('should select Box element and show properties panel', async () => {
            await elementsPanel.addBoxElement();
            await elementsPanel.selectElementByIndex(0);
            expect(await propertiesPanel.hasNoElementSelected()).toBe(false);
        });

        test('should delete Box element via UI delete button', async () => {
            await elementsPanel.addBoxElement();
            await elementsPanel.deleteElementByIndex(0);
            expect(await elementsPanel.getElementCount()).toBe(0);
        });

        test('should delete Box element via Delete key', async ({ page }) => {
            await elementsPanel.addBoxElement();
            await elementsPanel.selectElementByIndex(0);
            await page.keyboard.press('Delete');
            expect(await elementsPanel.getElementCount()).toBe(0);
        });

        test('should generate ZPL containing ^GB command for Box element', async () => {
            await elementsPanel.addBoxElement();
            await zplOutput.verifyZPLContains('^GB');
        });
    });

    // ============== LINE ELEMENT ==============
    test.describe('Line Element', () => {
        test('should add a Line element when clicking Add Line button', async () => {
            await elementsPanel.addLineElement();
            expect(await elementsPanel.getElementCount()).toBe(1);
        });

        test('should select Line element and show properties panel', async () => {
            await elementsPanel.addLineElement();
            await elementsPanel.selectElementByIndex(0);
            expect(await propertiesPanel.hasNoElementSelected()).toBe(false);
        });

        test('should delete Line element via UI delete button', async () => {
            await elementsPanel.addLineElement();
            expect(await elementsPanel.getElementCount()).toBe(1);
            await elementsPanel.deleteElementByIndex(0);
            expect(await elementsPanel.getElementCount()).toBe(0);
        });

        test('should delete Line element via Delete key', async ({ page }) => {
            await elementsPanel.addLineElement();
            await elementsPanel.selectElementByIndex(0);
            expect(await elementsPanel.getElementCount()).toBe(1);
            await page.keyboard.press('Delete');
            expect(await elementsPanel.getElementCount()).toBe(0);
        });

        test('should generate ZPL containing ^GB command for Line element', async () => {
            await elementsPanel.addLineElement();
            await zplOutput.verifyZPLContains('^GB');
        });
    });

    // ============== CIRCLE ELEMENT ==============
    test.describe('Circle Element', () => {
        test('should add a Circle element when clicking Add Circle button', async () => {
            await elementsPanel.addCircleElement();
            expect(await elementsPanel.getElementCount()).toBe(1);
        });

        test('should select Circle element and show properties panel', async () => {
            await elementsPanel.addCircleElement();
            await elementsPanel.selectElementByIndex(0);
            expect(await propertiesPanel.hasNoElementSelected()).toBe(false);
        });

        test('should delete Circle element via UI delete button', async () => {
            await elementsPanel.addCircleElement();
            await elementsPanel.deleteElementByIndex(0);
            expect(await elementsPanel.getElementCount()).toBe(0);
        });

        test('should delete Circle element via Delete key', async ({ page }) => {
            await elementsPanel.addCircleElement();
            await elementsPanel.selectElementByIndex(0);
            await page.keyboard.press('Delete');
            expect(await elementsPanel.getElementCount()).toBe(0);
        });

        test('should generate ZPL containing ^GE command for Circle element', async () => {
            await elementsPanel.addCircleElement();
            await zplOutput.verifyZPLContains('^GE');
        });
    });

    // ============== MULTIPLE ELEMENTS ==============
    test.describe('Multiple Elements', () => {
        test('should add multiple elements of different types', async () => {
            await elementsPanel.addTextElement();
            await elementsPanel.addBarcodeElement();
            await elementsPanel.addQRCodeElement();
            await elementsPanel.addBoxElement();
            await elementsPanel.addFieldBlockElement();
            expect(await elementsPanel.getElementCount()).toBe(5);
        });

        test('should delete all elements one by one', async () => {
            await elementsPanel.addTextElement();
            await elementsPanel.addBarcodeElement();
            await elementsPanel.addBoxElement();
            expect(await elementsPanel.getElementCount()).toBe(3);

            await elementsPanel.deleteElementByIndex(2);
            expect(await elementsPanel.getElementCount()).toBe(2);

            await elementsPanel.deleteElementByIndex(1);
            expect(await elementsPanel.getElementCount()).toBe(1);

            await elementsPanel.deleteElementByIndex(0);
            expect(await elementsPanel.getElementCount()).toBe(0);
        });

        test('should show placeholder text when all elements are deleted', async () => {
            await elementsPanel.addTextElement();
            await elementsPanel.deleteElementByIndex(0);
            expect(await elementsPanel.hasNoElements()).toBe(true);
        });
    });

    // ============== KEYBOARD NAVIGATION ==============
    test.describe('Keyboard Navigation', () => {
        test('should move selected element with arrow keys', async ({ page }) => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);

            // Get initial position
            const initialX = await propertiesPanel.getProperty('prop-x');

            // Press arrow key
            await page.keyboard.press('ArrowRight');

            // Position should have changed
            const newX = await propertiesPanel.getProperty('prop-x');
            expect(parseInt(newX)).toBeGreaterThan(parseInt(initialX));
        });
    });
});
