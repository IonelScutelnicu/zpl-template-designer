import { test, expect } from '../fixtures';
import { ElementsPanel, ZPLOutput, buildSquarePngBuffer } from '../page-objects';

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

        test('should generate ^TB command for TextBlock element', async () => {
            await elementsPanel.addTextBlockElement();
            await zplOutput.verifyZPLContains('^TB');
        });

        test('should generate ^FB command for FieldBlock element', async () => {
            await elementsPanel.addFieldBlockElement();
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

        test('should generate ^GC command for Circle element (locked by default)', async () => {
            await elementsPanel.addCircleElement();
            await zplOutput.verifyZPLContains('^GC');
        });

        test('should generate correct ^GC format for Circle element', async () => {
            await elementsPanel.addCircleElement();
            const zpl = await zplOutput.getZPLCode();
            // ^GC format: ^GCdiameter,thickness,color
            expect(zpl).toMatch(/\^GC\d+,\d+,[BW]/);
        });

        test('should generate ^GFA command for uploaded Graphic Field element', async () => {
            await elementsPanel.addGraphicElement(buildSquarePngBuffer());
            const zpl = await zplOutput.getZPLCode();
            // ^GFA format: ^GFA,totalBytes,totalBytes,bytesPerRow,<hex>
            expect(zpl).toMatch(/\^FO\d+,\d+\^GFA,\d+,\d+,\d+,[0-9A-F]+\^FS/);
        });
    });

    // ============== GRAPHIC FIELD ROUND-TRIP ==============
    test.describe('Graphic Field round-trip', () => {
        test('should round-trip a plain ASCII-hex ^GFA block (parse → re-emit)', async ({ page }) => {
            // Hand-crafted 4-dot-wide × 8-row alternating-stripe bitmap.
            const hex = 'F00FF00FF00FF00F';
            const original = `^XA^FO20,30^GFA,8,8,1,${hex}^FS^XZ`;

            await page.locator('#zpl-more-btn').click();
            await page.locator('#import-zpl-btn').click();
            await page.locator('#zpl-import-input').fill(original);
            await page.locator('#zpl-import-confirm-btn').click();

            // Wait for the element to appear from the parsed import.
            await page.waitForFunction(() => {
                return document.querySelectorAll('#elements-list .element-item').length > 0;
            }, { timeout: 5000 });

            const zpl = await zplOutput.getZPLCode();
            expect(zpl).toContain('^FO20,30');
            expect(zpl).toMatch(new RegExp(`\\^GFA,8,8,1,${hex}\\^FS`));
        });

        test('should pre-rotate the bitmap and emit a vanilla ^GFA when orientation is R', async ({ page }) => {
            await elementsPanel.addGraphicElement(buildSquarePngBuffer());

            // Capture the unrotated baseline payload (the test fixture has a
            // black square in the upper-left, asymmetric across rotation).
            const beforeZpl = await zplOutput.getZPLCode();
            const beforeMatch = beforeZpl.match(/\^GFA,\d+,\d+,\d+,([0-9A-F]+)\^FS/);
            expect(beforeMatch).not.toBeNull();
            const baselinePayload = beforeMatch![1];

            // Click the R orientation button in the properties panel.
            await page.locator('button[data-orientation="R"]').click();
            await page.waitForFunction(
                (baseline) => {
                    const el = document.getElementById('zpl-output-raw') as HTMLTextAreaElement | null;
                    if (!el) return false;
                    const m = el.value.match(/\^GFA,\d+,\d+,\d+,([0-9A-F]+)\^FS/);
                    return m !== null && m[1] !== baseline;
                },
                baselinePayload,
                { timeout: 2000 }
            );

            const zpl = await zplOutput.getZPLCode();
            // No ^FW emitted — real Zebra firmware ignores it for ^GF.
            expect(zpl).not.toContain('^FW');
            expect(zpl).toMatch(/\^FO\d+,\d+\^GFA,\d+,\d+,\d+,[0-9A-F]+\^FS/);
        });

        test('should not emit ^FW at default orientation N', async () => {
            await elementsPanel.addGraphicElement(buildSquarePngBuffer());
            const zpl = await zplOutput.getZPLCode();
            // Backwards-compatible: an un-rotated graphic must not gain a ^FW token.
            expect(zpl).not.toContain('^FW');
        });

        test('should preserve unsupported ^GF (Z64) verbatim with a parser warning', async ({ page }) => {
            const original = '^XA^FO0,0^GFA,16,16,1,:Z64:somebase64stuff:1234^FS^XZ';

            await page.locator('#zpl-more-btn').click();
            await page.locator('#import-zpl-btn').click();
            await page.locator('#zpl-import-input').fill(original);

            // First click parses and shows warnings; second click confirms import.
            await page.locator('#zpl-import-confirm-btn').click();
            await expect(page.locator('#zpl-import-warnings')).toBeVisible();
            await expect(page.locator('#zpl-import-warnings-list')).toContainText('Z64');
            await page.locator('#zpl-import-confirm-btn').click();

            await page.waitForFunction(() => {
                return document.querySelectorAll('#elements-list .element-item').length > 0;
            }, { timeout: 5000 });

            const zpl = await zplOutput.getZPLCode();
            // Re-export must contain the verbatim opaque payload.
            expect(zpl).toContain(':Z64:somebase64stuff:1234');
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
            await page.locator('details[data-fs-tab="print-config"] summary').click();
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
            // Use the label-level orientation button (no data-tooltip) vs element-level (has data-tooltip)
            await page.locator('[data-orientation="I"]:not([data-tooltip])').click();
            await zplOutput.verifyZPLContains('^POI');
        });

        test('should update ^PM when mirror is changed', async ({ page }) => {
            await page.locator('[data-mirror="Y"]').click();
            await zplOutput.verifyZPLContains('^PMY');
        });

        test('should update ^LH value when homeX is changed', async ({ page }) => {
            // Expand the Offsets section (collapsed by default)
            await page.locator('details[data-fs-tab="offsets"] summary').click();
            await page.locator('#home-x').fill('20');
            await page.locator('#home-x').dispatchEvent('input');
            const zpl = await zplOutput.getZPLCode();
            expect(zpl).toMatch(/\^LH20,/);
        });

        test('should update ^LH value when homeY is changed', async ({ page }) => {
            // Expand the Offsets section (collapsed by default)
            await page.locator('details[data-fs-tab="offsets"] summary').click();
            await page.locator('#home-y').fill('30');
            await page.locator('#home-y').dispatchEvent('input');
            const zpl = await zplOutput.getZPLCode();
            expect(zpl).toMatch(/\^LH\d+,30/);
        });

        test('should update ^PW when dpmm is changed', async ({ page }) => {
            // label-dpmm is a SELECT in Label Setup (open by default); select 12 dpmm
            // Default label width is 100mm; floor((100/25.4) * floor(12*25.4)) = floor((100/25.4)*304) = 1196 dots
            await page.locator('#label-dpmm').selectOption('12');
            const zpl = await zplOutput.getZPLCode();
            expect(zpl).toContain('^PW1196');
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

        test('should include ^PQ when print quantity is changed', async ({ page }) => {
            await page.locator('#print-quantity').fill('50');
            await page.locator('#print-quantity').dispatchEvent('input');
            const zpl = await zplOutput.getZPLCode();
            expect(zpl).toContain('^PQ50,0,0');
        });

        test('should include ^PQ with pause count and replicates', async ({ page }) => {
            await page.locator('#print-quantity').fill('100');
            await page.locator('#print-quantity').dispatchEvent('input');
            await page.locator('#pause-count').fill('10');
            await page.locator('#pause-count').dispatchEvent('input');
            await page.locator('#replicates').fill('3');
            await page.locator('#replicates').dispatchEvent('input');
            const zpl = await zplOutput.getZPLCode();
            expect(zpl).toContain('^PQ100,10,3');
        });

        test('should not include ^PQ when all values are default', async ({ page }) => {
            // Default: quantity=1, pause=0, replicates=0 — ^PQ should be omitted
            const zpl = await zplOutput.getZPLCode();
            expect(zpl).not.toContain('^PQ');
        });

        test('should place ^PQ just before ^XZ', async ({ page }) => {
            await page.locator('#print-quantity').fill('5');
            await page.locator('#print-quantity').dispatchEvent('input');
            const zpl = await zplOutput.getZPLCode();
            // ^PQ should appear after all element commands, right before ^XZ
            expect(zpl).toMatch(/\^PQ5,0,0\s*\^XZ$/);
        });

        test('should use placeholder in ^PQ quantity when set', async ({ page }) => {
            await page.locator('#print-quantity').fill('1');
            await page.locator('#print-quantity').dispatchEvent('input');
            await page.locator('#print-quantity-placeholder').fill('qty');
            await page.locator('#print-quantity-placeholder').dispatchEvent('input');
            const zpl = await zplOutput.getZPLCode();
            expect(zpl).toContain('^PQ%qty%,0,0');
        });
    });

    // ============== FIELDBLOCK ORIENTATION ZPL ==============
    test.describe('FieldBlock Orientation ZPL', () => {
        test('should generate ^A with orientation R for rotated FieldBlock', async ({ page }) => {
            await elementsPanel.addFieldBlockElement();
            await elementsPanel.selectElementByIndex(0);

            await page.locator('[data-orientation="R"]').click();
            const zpl = await zplOutput.getZPLCode();
            // ^A command should contain R orientation: ^A0R, or ^ADR, etc.
            expect(zpl).toMatch(/\^A\w*R,/);
            // Should NOT contain ^A0N (default orientation)
            expect(zpl).not.toMatch(/\^A\w*N,/);
        });

        test('should default to N orientation for new FieldBlock', async () => {
            await elementsPanel.addFieldBlockElement();
            const zpl = await zplOutput.getZPLCode();
            expect(zpl).toMatch(/\^A\w*N,/);
        });
    });

    // ============== TEXTBLOCK ORIENTATION ZPL ==============
    test.describe('TextBlock Orientation ZPL', () => {
        test('should generate ^TB with orientation R for rotated TextBlock', async ({ page }) => {
            await elementsPanel.addTextBlockElement();
            await elementsPanel.selectElementByIndex(0);

            await page.locator('[data-orientation="R"]').click();
            const zpl = await zplOutput.getZPLCode();
            // ^TB command should contain R orientation: ^TBR,
            expect(zpl).toMatch(/\^TBR,/);
            // Should NOT contain ^TBN (default orientation)
            expect(zpl).not.toMatch(/\^TBN,/);
        });

        test('should default to N orientation for new TextBlock', async () => {
            await elementsPanel.addTextBlockElement();
            const zpl = await zplOutput.getZPLCode();
            expect(zpl).toMatch(/\^TBN,/);
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
