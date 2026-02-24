import { test, expect } from '../fixtures';
import { ElementsPanel, PropertiesPanel, ZPLOutput } from '../page-objects';

/**
 * Alignment Features E2E Tests
 *
 * Default label settings: 100mm × 50mm @ 8 dpmm = 800 × 400 dots
 *
 * All elements are created at x=50, y=50 by default (ElementService).
 *
 * Default element sizes (as created by the app):
 *   BOX:       width=100, height=50
 *   LINE (H):  width=200, thickness=3
 *   CIRCLE:    width=80,  height=80
 *   TEXTBLOCK: blockWidth=200, maxLines=3
 *   BARCODE:   width=2 (multiplier), height=50, data='1234567890'
 *   QRCODE:    magnification=5, data='https://example.com'
 */

// Label size in dots for default 100mm × 50mm @ 8dpmm
const LABEL_WIDTH = 800;
const LABEL_HEIGHT = 400;

test.describe('Alignment Features', () => {
    let elementsPanel: ElementsPanel;
    let propertiesPanel: PropertiesPanel;
    let zplOutput: ZPLOutput;

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        elementsPanel = new ElementsPanel(page);
        propertiesPanel = new PropertiesPanel(page);
        zplOutput = new ZPLOutput(page);
    });

    /** Helper: click an alignment button by action name */
    async function clickAlignment(page: import('@playwright/test').Page, action: string) {
        await page.locator(`#prop-${action}`).click();
    }

    // =============================================
    // CENTER HORIZONTALLY
    // =============================================
    test.describe('Center Horizontally (center-x)', () => {

        test('should center a Box element horizontally on the label', async ({ page }) => {
            await elementsPanel.addBoxElement();
            await elementsPanel.selectElementByIndex(0);

            // Move box to a non-centered position
            await propertiesPanel.setProperty('prop-x', 10);
            await propertiesPanel.verifyPropertyValue('prop-x', 10);

            // Box default width = 100, label width = 800
            // Expected x = Math.round((800 - 100) / 2) = 350
            await clickAlignment(page, 'center-x');

            await propertiesPanel.verifyPropertyValue('prop-x', 350);
        });

        test('should center a Circle element horizontally on the label', async ({ page }) => {
            await elementsPanel.addCircleElement();
            await elementsPanel.selectElementByIndex(0);

            await propertiesPanel.setProperty('prop-x', 10);

            // Circle default width = 80, label width = 800
            // Expected x = Math.round((800 - 80) / 2) = 360
            await clickAlignment(page, 'center-x');

            await propertiesPanel.verifyPropertyValue('prop-x', 360);
        });

        test('should center a TextBlock element horizontally on the label', async ({ page }) => {
            await elementsPanel.addTextBlockElement();
            await elementsPanel.selectElementByIndex(0);

            await propertiesPanel.setProperty('prop-x', 10);

            // TextBlock default blockWidth = 200, label width = 800
            // Expected x = Math.round((800 - 200) / 2) = 300
            await clickAlignment(page, 'center-x');

            await propertiesPanel.verifyPropertyValue('prop-x', 300);
        });

        test('should center a horizontal Line element horizontally on the label', async ({ page }) => {
            await elementsPanel.addLineElement();
            await elementsPanel.selectElementByIndex(0);

            await propertiesPanel.setProperty('prop-x', 50);

            // Line width = 200 (as created by app), label width = 800
            // Expected x = Math.round((800 - 200) / 2) = 300
            await clickAlignment(page, 'center-x');

            await propertiesPanel.verifyPropertyValue('prop-x', 300);
        });

        test('should clamp x to 0 when element is wider than the label', async ({ page }) => {
            await elementsPanel.addBoxElement();
            await elementsPanel.selectElementByIndex(0);

            // Set box wider than label (900 > 800)
            await propertiesPanel.setProperty('prop-width', 900);
            await propertiesPanel.setProperty('prop-x', 50);

            // Expected x = Math.max(0, Math.round((800 - 900) / 2)) = 0
            await clickAlignment(page, 'center-x');

            await propertiesPanel.verifyPropertyValue('prop-x', 0);
        });

        test('should only affect the selected element, not other elements', async ({ page }) => {
            // Add a Box — starts at default x=50
            await elementsPanel.addBoxElement();

            // Verify the ZPL has one ^FO at position 50
            await zplOutput.verifyZPLContains('^FO50,50');

            // Add a Circle — also starts at default x=50
            await elementsPanel.addCircleElement();

            // Both elements should be at x=50 before alignment
            // Count occurrences of ^FO50, (both elements at x=50)
            const countBefore = await zplOutput.countPatternOccurrences(/\^FO50,/g);
            expect(countBefore).toBe(2);

            // Select the Circle (the last added element is auto-selected)
            // and center it horizontally
            await clickAlignment(page, 'center-x');

            // After centering Circle (width=80): its x = 360
            // The Box should still be at x=50
            // ZPL should have exactly one ^FO50, (Box) and one ^FO360, (Circle)
            await zplOutput.verifyZPLContains('^FO50,');
            await zplOutput.verifyZPLContains('^FO360,');
        });

        test('should update the ZPL output after centering', async ({ page }) => {
            await elementsPanel.addBoxElement();
            await elementsPanel.selectElementByIndex(0);

            await propertiesPanel.setProperty('prop-x', 10);
            await clickAlignment(page, 'center-x');

            // ZPL should now contain ^FO350, for the centered position
            await zplOutput.verifyZPLContains('^FO350,');
        });
    });

    // =============================================
    // CENTER VERTICALLY
    // =============================================
    test.describe('Center Vertically (center-y)', () => {

        test('should center a Box element vertically on the label', async ({ page }) => {
            await elementsPanel.addBoxElement();
            await elementsPanel.selectElementByIndex(0);

            await propertiesPanel.setProperty('prop-y', 10);

            // Box default height = 50, label height = 400
            // Expected y = Math.round((400 - 50) / 2) = 175
            await clickAlignment(page, 'center-y');

            await propertiesPanel.verifyPropertyValue('prop-y', 175);
        });

        test('should center a Circle element vertically on the label', async ({ page }) => {
            await elementsPanel.addCircleElement();
            await elementsPanel.selectElementByIndex(0);

            await propertiesPanel.setProperty('prop-y', 10);

            // Circle default height = 80, label height = 400
            // Expected y = Math.round((400 - 80) / 2) = 160
            await clickAlignment(page, 'center-y');

            await propertiesPanel.verifyPropertyValue('prop-y', 160);
        });

        test('should clamp y to 0 when element is taller than the label', async ({ page }) => {
            await elementsPanel.addBoxElement();
            await elementsPanel.selectElementByIndex(0);

            // Set box taller than label (500 > 400)
            await propertiesPanel.setProperty('prop-height', 500);
            await propertiesPanel.setProperty('prop-y', 50);

            // Expected y = Math.max(0, Math.round((400 - 500) / 2)) = 0
            await clickAlignment(page, 'center-y');

            await propertiesPanel.verifyPropertyValue('prop-y', 0);
        });

        test('should update the ZPL output after centering vertically', async ({ page }) => {
            await elementsPanel.addBoxElement();
            await elementsPanel.selectElementByIndex(0);

            await propertiesPanel.setProperty('prop-y', 10);
            await clickAlignment(page, 'center-y');

            // ZPL should contain the centered y position: ^FO{x},175
            await zplOutput.verifyZPLContains(',175');
        });
    });

    // =============================================
    // MATCH LABEL WIDTH
    // =============================================
    test.describe('Match Label Width (match-width)', () => {

        test('should expand Box width to match label width and set x to 0', async ({ page }) => {
            await elementsPanel.addBoxElement();
            await elementsPanel.selectElementByIndex(0);

            // Start with a smaller box at a non-zero position
            await propertiesPanel.setProperty('prop-width', 50);
            await propertiesPanel.setProperty('prop-x', 100);

            await clickAlignment(page, 'match-width');

            // Box width should now be label width (800), x should be 0
            await propertiesPanel.verifyPropertyValue('prop-width', LABEL_WIDTH);
            await propertiesPanel.verifyPropertyValue('prop-x', 0);
        });

        test('should expand horizontal Line width to match label width', async ({ page }) => {
            await elementsPanel.addLineElement();
            await elementsPanel.selectElementByIndex(0);

            await propertiesPanel.setProperty('prop-x', 50);

            await clickAlignment(page, 'match-width');

            // Horizontal line width = label width (800), x = 0
            await propertiesPanel.verifyPropertyValue('prop-width', LABEL_WIDTH);
            await propertiesPanel.verifyPropertyValue('prop-x', 0);
        });

        test('should expand TextBlock blockWidth to match label width', async ({ page }) => {
            await elementsPanel.addTextBlockElement();
            await elementsPanel.selectElementByIndex(0);

            await propertiesPanel.setProperty('prop-x', 50);

            await clickAlignment(page, 'match-width');

            // TextBlock blockWidth = label width (800), x = 0
            await propertiesPanel.verifyPropertyValue('prop-block-width', LABEL_WIDTH);
            await propertiesPanel.verifyPropertyValue('prop-x', 0);
        });

        test('should expand Circle width to match label width', async ({ page }) => {
            await elementsPanel.addCircleElement();
            await elementsPanel.selectElementByIndex(0);

            await propertiesPanel.setProperty('prop-x', 50);

            await clickAlignment(page, 'match-width');

            // Circle width = label width (800), x = 0
            await propertiesPanel.verifyPropertyValue('prop-width', LABEL_WIDTH);
            await propertiesPanel.verifyPropertyValue('prop-x', 0);
        });

        test('should update ZPL output after matching width', async ({ page }) => {
            await elementsPanel.addBoxElement();
            await elementsPanel.selectElementByIndex(0);

            await clickAlignment(page, 'match-width');

            // ZPL should contain ^FO0, (x reset) and ^GB800, (full label width)
            await zplOutput.verifyZPLContains('^FO0,');
            await zplOutput.verifyZPLContains('^GB800,');
        });

        test('should be disabled for Text elements', async ({ page }) => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);

            const matchWidthBtn = page.locator('#prop-match-width');
            await expect(matchWidthBtn).toBeDisabled();
        });

        test('should be disabled for QR Code elements', async ({ page }) => {
            await elementsPanel.addQRCodeElement();
            await elementsPanel.selectElementByIndex(0);

            const matchWidthBtn = page.locator('#prop-match-width');
            await expect(matchWidthBtn).toBeDisabled();
        });
    });

    // =============================================
    // MATCH LABEL HEIGHT
    // =============================================
    test.describe('Match Label Height (match-height)', () => {

        test('should expand Box height to match label height and set y to 0', async ({ page }) => {
            await elementsPanel.addBoxElement();
            await elementsPanel.selectElementByIndex(0);

            await propertiesPanel.setProperty('prop-height', 30);
            await propertiesPanel.setProperty('prop-y', 50);

            await clickAlignment(page, 'match-height');

            // Box height should now be label height (400), y should be 0
            await propertiesPanel.verifyPropertyValue('prop-height', LABEL_HEIGHT);
            await propertiesPanel.verifyPropertyValue('prop-y', 0);
        });

        test('should expand Barcode height to match label height', async ({ page }) => {
            await elementsPanel.addBarcodeElement();
            await elementsPanel.selectElementByIndex(0);

            await propertiesPanel.setProperty('prop-y', 50);

            await clickAlignment(page, 'match-height');

            // Barcode height = label height (400), y = 0
            await propertiesPanel.verifyPropertyValue('prop-height', LABEL_HEIGHT);
            await propertiesPanel.verifyPropertyValue('prop-y', 0);
        });

        test('should expand Circle height to match label height', async ({ page }) => {
            await elementsPanel.addCircleElement();
            await elementsPanel.selectElementByIndex(0);

            await propertiesPanel.setProperty('prop-y', 50);

            await clickAlignment(page, 'match-height');

            // Circle height = label height (400), y = 0
            await propertiesPanel.verifyPropertyValue('prop-height', LABEL_HEIGHT);
            await propertiesPanel.verifyPropertyValue('prop-y', 0);
        });

        test('should update ZPL output after matching height', async ({ page }) => {
            await elementsPanel.addBoxElement();
            await elementsPanel.selectElementByIndex(0);

            await clickAlignment(page, 'match-height');

            // match-height sets y=0 and height=400 (does NOT change x)
            // Default element x=50, so ZPL should contain ^FO50,0 and ,400,
            await zplOutput.verifyZPLContains('^FO50,0');
            await zplOutput.verifyZPLContains(',400,');
        });

        test('should be disabled for Text elements', async ({ page }) => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);

            const matchHeightBtn = page.locator('#prop-match-height');
            await expect(matchHeightBtn).toBeDisabled();
        });

        test('should be disabled for QR Code elements', async ({ page }) => {
            await elementsPanel.addQRCodeElement();
            await elementsPanel.selectElementByIndex(0);

            const matchHeightBtn = page.locator('#prop-match-height');
            await expect(matchHeightBtn).toBeDisabled();
        });
    });

    // =============================================
    // COMBINED ALIGNMENT OPERATIONS
    // =============================================
    test.describe('Combined Alignment Operations', () => {

        test('should fully center a Box using center-x then center-y', async ({ page }) => {
            await elementsPanel.addBoxElement();
            await elementsPanel.selectElementByIndex(0);

            await propertiesPanel.setProperty('prop-x', 10);
            await propertiesPanel.setProperty('prop-y', 10);

            await clickAlignment(page, 'center-x');
            await clickAlignment(page, 'center-y');

            // Box (100×50) centered on 800×400 label
            await propertiesPanel.verifyPropertyValue('prop-x', 350);
            await propertiesPanel.verifyPropertyValue('prop-y', 175);
        });

        test('should fill the entire label using match-width then match-height on a Box', async ({ page }) => {
            await elementsPanel.addBoxElement();
            await elementsPanel.selectElementByIndex(0);

            await propertiesPanel.setProperty('prop-x', 50);
            await propertiesPanel.setProperty('prop-y', 50);

            await clickAlignment(page, 'match-width');
            await clickAlignment(page, 'match-height');

            await propertiesPanel.verifyPropertyValue('prop-x', 0);
            await propertiesPanel.verifyPropertyValue('prop-y', 0);
            await propertiesPanel.verifyPropertyValue('prop-width', LABEL_WIDTH);
            await propertiesPanel.verifyPropertyValue('prop-height', LABEL_HEIGHT);
        });

        test('should center-x and center-y buttons be enabled for Text elements', async ({ page }) => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);

            const centerXBtn = page.locator('#prop-center-x');
            const centerYBtn = page.locator('#prop-center-y');

            await expect(centerXBtn).toBeEnabled();
            await expect(centerYBtn).toBeEnabled();
        });

        test('should center-x and center-y buttons be enabled for QR Code elements', async ({ page }) => {
            await elementsPanel.addQRCodeElement();
            await elementsPanel.selectElementByIndex(0);

            const centerXBtn = page.locator('#prop-center-x');
            const centerYBtn = page.locator('#prop-center-y');

            await expect(centerXBtn).toBeEnabled();
            await expect(centerYBtn).toBeEnabled();
        });
    });
});
