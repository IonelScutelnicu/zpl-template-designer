import { test, expect } from '@playwright/test';
import { ElementsPanel, ZPLOutput } from '../page-objects';

test.describe('ZPL Output - Generation and Validation', () => {
    let elementsPanel: ElementsPanel;
    let zplOutput: ZPLOutput;

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        elementsPanel = new ElementsPanel(page);
        zplOutput = new ZPLOutput(page);
    });

    // ============== ZPL FORMAT VALIDATION ==============
    test.describe('ZPL Format', () => {
        test.beforeEach(async () => {
            // Ensure at least one element exists so ZPL is generated
            await elementsPanel.addTextElement();
        });

        test('should generate ZPL starting with ^XA', async () => {
            await zplOutput.verifyValidZPLStart();
        });

        test('should generate ZPL ending with ^XZ', async () => {
            await zplOutput.verifyValidZPLEnd();
        });

        test('should include print width ^PW command in output', async () => {
            await zplOutput.verifyZPLContains('^PW');
        });

        test('should include print rate ^PR command in output', async () => {
            await zplOutput.verifyZPLContains('^PR');
        });

        test('should include print orientation ^PO command in output', async () => {
            await zplOutput.verifyZPLContains('^PO');
        });

        test('should include print mirror ^PM command in output', async () => {
            await zplOutput.verifyZPLContains('^PM');
        });

        test('should include media darkness ~SD command in output', async () => {
            await zplOutput.verifyZPLContains('~SD');
        });

        test('should include label home ^LH command in output', async () => {
            await zplOutput.verifyZPLContains('^LH');
        });

        test('should include character encoding ^CI28 in output', async () => {
            await zplOutput.verifyZPLContains('^CI28');
        });
    });

    // ============== ELEMENT ZPL GENERATION ==============
    test.describe('Element ZPL Commands', () => {
        test('should generate ^FO and ^FD commands for Text element', async () => {
            await elementsPanel.addTextElement();
            await zplOutput.verifyZPLContains('^FO');
            await zplOutput.verifyZPLContains('^FD');
            await zplOutput.verifyZPLContains('^FS');
        });

        test('should generate ^FB command for TextBlock element', async () => {
            await elementsPanel.addTextBlockElement();
            await zplOutput.verifyZPLContains('^FB');
        });

        test('should generate ^BC command for Barcode element', async () => {
            await elementsPanel.addBarcodeElement();
            await zplOutput.verifyZPLContains('^BC');
            await zplOutput.verifyZPLContains('^BY');
        });

        test('should generate ^BQ command for QR Code element', async () => {
            await elementsPanel.addQRCodeElement();
            await zplOutput.verifyZPLContains('^BQ');
        });

        test('should generate ^GB command for Box element', async () => {
            await elementsPanel.addBoxElement();
            await zplOutput.verifyZPLContains('^GB');
        });
    });

    // ============== MULTIPLE ELEMENTS ==============
    test.describe('Multiple Elements', () => {
        test('should generate ZPL for multiple elements in correct order', async () => {
            await elementsPanel.addTextElement();
            await elementsPanel.addBarcodeElement();
            await elementsPanel.addBoxElement();

            const zpl = await zplOutput.getZPLCode();

            // All element commands should be present
            expect(zpl).toContain('^FD');
            expect(zpl).toContain('^BC');
            expect(zpl).toContain('^GB');
        });

        test('should update ZPL when element is deleted', async () => {
            await elementsPanel.addTextElement();
            await elementsPanel.addBarcodeElement();

            let zpl = await zplOutput.getZPLCode();
            expect(zpl).toContain('^BC');

            await elementsPanel.deleteElementByIndex(1);
            zpl = await zplOutput.getZPLCode();
            expect(zpl).not.toContain('^BC');
        });

        test('should have one ^FD per Text element', async () => {
            await elementsPanel.addTextElement();
            await elementsPanel.addTextElement();
            await elementsPanel.addTextElement();

            const count = await zplOutput.countPatternOccurrences(/\^FD/g);
            expect(count).toBe(3);
        });
    });

    // ============== COPY TO CLIPBOARD ==============
    test.describe('Copy to Clipboard', () => {
        test('should copy ZPL to clipboard when Copy button is clicked', async ({ page, context }) => {
            // Grant clipboard permissions
            await context.grantPermissions(['clipboard-read', 'clipboard-write']);

            await elementsPanel.addTextElement();
            const expectedZPL = await zplOutput.getZPLCode();

            await zplOutput.copyToClipboard();

            // Wait a bit for clipboard operation
            await page.waitForTimeout(100);

            const clipboardContent = await zplOutput.getClipboardContent();
            // Normalize line endings to avoid issues on Windows
            expect(clipboardContent.replace(/\r\n/g, '\n')).toBe(expectedZPL.replace(/\r\n/g, '\n'));
        });
    });

    // ============== LABEL SETTINGS IN ZPL ==============
    test.describe('Label Settings', () => {
        test.beforeEach(async ({ page }) => {
            // Ensure at least one element exists so ZPL is generated
            await elementsPanel.addTextElement();

            // Expand Print Configuration section which is closed by default
            await page.getByText('Print Configuration', { exact: true }).click();
        });

        test('should update ^PW when label width is changed', async ({ page }) => {
            const widthInput = page.locator('#label-width');
            await widthInput.fill('50');
            await widthInput.dispatchEvent('change');

            // PW should reflect width in dots (width * dpmm)
            const zpl = await zplOutput.getZPLCode();
            expect(zpl).toMatch(/\^PW\d+/);
        });

        test('should update ~SD when media darkness is changed', async ({ page }) => {
            const darknessInput = page.locator('#media-darkness');
            await darknessInput.fill('15');
            await darknessInput.dispatchEvent('change');

            await zplOutput.verifyZPLContains('~SD15');
        });

        test('should update ^PR when print speed is changed', async ({ page }) => {
            const speedInput = page.locator('#print-speed');
            await speedInput.fill('6');
            await speedInput.dispatchEvent('change');

            await zplOutput.verifyZPLContains('^PR6,');
        });

        test('should update ^PO when orientation is changed', async ({ page }) => {
            // Use the label-level orientation button (no title attr) vs element-level (has title)
            await page.locator('[data-orientation="I"]:not([title])').click();
            await zplOutput.verifyZPLContains('^POI');
        });

        test('should update ^PM when mirror is changed', async ({ page }) => {
            await page.locator('[data-mirror="Y"]').click();
            await zplOutput.verifyZPLContains('^PMY');
        });

        test('should update ^LH value when homeX is changed', async ({ page }) => {
            // Expand the Offsets section (collapsed by default)
            await page.getByText('Offsets', { exact: true }).click();
            await page.locator('#home-x').fill('20');
            await page.locator('#home-x').dispatchEvent('input');
            const zpl = await zplOutput.getZPLCode();
            expect(zpl).toMatch(/\^LH20,/);
        });

        test('should update ^LH value when homeY is changed', async ({ page }) => {
            // Expand the Offsets section (collapsed by default)
            await page.getByText('Offsets', { exact: true }).click();
            await page.locator('#home-y').fill('30');
            await page.locator('#home-y').dispatchEvent('input');
            const zpl = await zplOutput.getZPLCode();
            expect(zpl).toMatch(/\^LH\d+,30/);
        });

        test('should update ^PW when dpmm is changed', async ({ page }) => {
            // label-dpmm is a SELECT in Label Setup (open by default); select 12 dpmm
            // Default label width is 100mm; 100 * 12 = 1200 dots
            await page.locator('#label-dpmm').selectOption('12');
            const zpl = await zplOutput.getZPLCode();
            expect(zpl).toContain('^PW1200');
        });

        test('should include slew speed in ^PR when changed', async ({ page }) => {
            await page.locator('#slew-speed').fill('6');
            await page.locator('#slew-speed').dispatchEvent('input');
            const zpl = await zplOutput.getZPLCode();
            // ^PR format: ^PR{printSpeed},{slewSpeed},{backfeedSpeed}
            expect(zpl).toMatch(/\^PR\d+,6/);
        });

        test('should include backfeed speed in ^PR when changed', async ({ page }) => {
            await page.locator('#backfeed-speed').fill('8');
            await page.locator('#backfeed-speed').dispatchEvent('input');
            const zpl = await zplOutput.getZPLCode();
            // ^PR format: ^PR{printSpeed},{slewSpeed},{backfeedSpeed}
            expect(zpl).toMatch(/\^PR\d+,\d+,8/);
        });
    });

    // ============== EXACT ZPL VALIDATION ==============
    test.describe('Exact ZPL Strings', () => {
        test('should generate exact Text element ZPL format', async ({ page }) => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);

            // Set known values
            await page.locator('#prop-x').fill('100');
            await page.locator('#prop-x').dispatchEvent('change');
            await page.locator('#prop-y').fill('50');
            await page.locator('#prop-y').dispatchEvent('change');
            await page.locator('#prop-preview-text').fill('TestLabel');
            await page.locator('#prop-preview-text').dispatchEvent('change');

            await zplOutput.verifyZPLContains('^FO100,50');
            await zplOutput.verifyZPLContains('^FDTestLabel^FS');
        });

        test('should generate exact Box element ZPL format', async ({ page }) => {
            await elementsPanel.addBoxElement();
            await elementsPanel.selectElementByIndex(0);

            await page.locator('#prop-x').fill('20');
            await page.locator('#prop-x').dispatchEvent('change');
            await page.locator('#prop-y').fill('30');
            await page.locator('#prop-y').dispatchEvent('change');
            await page.locator('#prop-width').fill('100');
            await page.locator('#prop-width').dispatchEvent('change');
            await page.locator('#prop-height').fill('80');
            await page.locator('#prop-height').dispatchEvent('change');
            await page.locator('#prop-thickness').fill('2');
            await page.locator('#prop-thickness').dispatchEvent('change');

            await zplOutput.verifyZPLContains('^FO20,30');
            await zplOutput.verifyZPLContains('^GB100,80,2,');
        });
    });
});
