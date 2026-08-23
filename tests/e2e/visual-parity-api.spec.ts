import { test, expect } from '../fixtures';
import { ElementsPanel, Canvas, PreviewPanel, PropertiesPanel, ZPLOutput } from '../page-objects';
import { compareImages, findContentBounds, getImageDimensions } from '../fixtures/image-comparison';
import { PNG } from 'pngjs';

async function pasteZPL(page: any, zplOutput: ZPLOutput, zpl: string, elementCount: number): Promise<void> {
    await zplOutput.openMoreActions();
    await page.locator('#import-zpl-btn').click();
    await page.locator('#zpl-import-input').fill(zpl);
    await page.locator('#zpl-import-input').dispatchEvent('input');
    await page.locator('#zpl-import-confirm-btn').click();
    const warnings = page.locator('#zpl-import-warnings');
    if (await warnings.isVisible().catch(() => false)) {
        await page.locator('#zpl-import-confirm-btn').click();
    }
    await expect(page.locator('#elements-list .element-item')).toHaveCount(elementCount, { timeout: 5000 });
}

function stripBounds(image: Buffer, topDots: number, bottomDots: number, labelWidthDots: number, labelHeightDots: number) {
    const png = PNG.sync.read(image);
    const startY = Math.max(0, Math.floor(topDots * png.height / labelHeightDots));
    const endY = Math.min(png.height, Math.ceil(bottomDots * png.height / labelHeightDots));
    let left = png.width;
    let top = png.height;
    let right = -1;
    let bottom = -1;
    for (let y = startY; y < endY; y++) {
        for (let x = 0; x < png.width; x++) {
            const i = (y * png.width + x) * 4;
            if (png.data[i] <= 128 && png.data[i + 1] <= 128 && png.data[i + 2] <= 128) {
                left = Math.min(left, x);
                top = Math.min(top, y);
                right = Math.max(right, x);
                bottom = Math.max(bottom, y);
            }
        }
    }
    return {
        left: left * labelWidthDots / png.width,
        top: top * labelHeightDots / png.height,
        right: right * labelWidthDots / png.width,
        bottom: bottom * labelHeightDots / png.height,
    };
}

/**
 * Visual Parity Tests - Canvas vs API Preview
 * These tests compare canvas rendering with Labelary API preview output.
 * Runs sequentially to respect Labelary API rate limits (3 req/sec).
 */
test.describe('Visual Parity - Canvas vs API', () => {
    let elementsPanel: ElementsPanel;
    let canvas: Canvas;
    let previewPanel: PreviewPanel;
    let propertiesPanel: PropertiesPanel;
    let zplOutput: ZPLOutput;

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        elementsPanel = new ElementsPanel(page);
        canvas = new Canvas(page);
        previewPanel = new PreviewPanel(page);
        propertiesPanel = new PropertiesPanel(page);
        zplOutput = new ZPLOutput(page);
        await canvas.waitForReady();
    });

    test('should have similar rendering for Text element between canvas and API', async ({ page }) => {
        await elementsPanel.addTextElement();
        await elementsPanel.selectElementByIndex(0);

        await page.locator('#prop-x').fill('100');
        await page.locator('#prop-x').dispatchEvent('input');
        await page.locator('#prop-y').fill('100');
        await page.locator('#prop-y').dispatchEvent('input');
        await page.locator('#prop-content').fill('Parity');
        await page.locator('#prop-content').dispatchEvent('input');

        // Get canvas at full dot resolution (unaffected by CSS scaling)
        await canvas.waitForReady();
        const canvasImage = await canvas.takeFullResolutionScreenshot();

        // Get API preview at full dot resolution
        await previewPanel.switchToAPIMode();
        await previewPanel.waitForAPIPreviewLoaded();
        const apiImage = await previewPanel.getAPIPreviewFullResolution();

        // Compare - allow higher threshold due to rendering differences
        const result = await compareImages(canvasImage, apiImage, 'parity-text', { threshold: 0.3 });

        // Log result for debugging
        if (result.diffPercentage >= 0.005) console.log(`Text parity: ${result.diffPercentage.toFixed(2)}% difference`);

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
        await previewPanel.waitForAPIPreviewLoaded();
        const apiImage = await previewPanel.getAPIPreviewFullResolution();

        const result = await compareImages(canvasImage, apiImage, 'parity-box', { threshold: 0.3 });

        if (result.diffPercentage >= 0.005) console.log(`Box parity: ${result.diffPercentage.toFixed(2)}% difference`);
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
        await previewPanel.waitForAPIPreviewLoaded();
        const apiImage = await previewPanel.getAPIPreviewFullResolution();

        const result = await compareImages(canvasImage, apiImage, 'parity-box-rounded-4', { threshold: 0.3 });

        if (result.diffPercentage >= 0.005) console.log(`Box rounding=4 parity: ${result.diffPercentage.toFixed(2)}% difference`);
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
        await previewPanel.waitForAPIPreviewLoaded();
        const apiImage = await previewPanel.getAPIPreviewFullResolution();

        const result = await compareImages(canvasImage, apiImage, 'parity-box-rounded-8', { threshold: 0.3 });

        if (result.diffPercentage >= 0.005) console.log(`Box rounding=8 parity: ${result.diffPercentage.toFixed(2)}% difference`);
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
        await previewPanel.waitForAPIPreviewLoaded();
        const apiImage = await previewPanel.getAPIPreviewFullResolution();

        const result = await compareImages(canvasImage, apiImage, 'parity-line-rounded-4', { threshold: 0.3 });

        if (result.diffPercentage >= 0.005) console.log(`Line rounding=4 parity: ${result.diffPercentage.toFixed(2)}% difference`);
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
        await previewPanel.waitForAPIPreviewLoaded();
        const apiImage = await previewPanel.getAPIPreviewFullResolution();

        const result = await compareImages(canvasImage, apiImage, 'parity-barcode', { threshold: 0.3 });

        if (result.diffPercentage >= 0.005) console.log(`Barcode parity: ${result.diffPercentage.toFixed(2)}% difference`);
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
        await previewPanel.waitForAPIPreviewLoaded();
        const apiImage = await previewPanel.getAPIPreviewFullResolution();

        const result = await compareImages(canvasImage, apiImage, 'parity-multiple', { threshold: 0.3 });

        if (result.diffPercentage >= 0.005) console.log(`Multiple elements parity: ${result.diffPercentage.toFixed(2)}% difference`);
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
        await page.locator('#prop-content').fill('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
        await page.locator('#prop-content').dispatchEvent('input');

        const canvasImage = await canvas.takeFullResolutionScreenshot();

        await previewPanel.switchToAPIMode();
        await previewPanel.waitForAPIPreviewLoaded();
        const apiImage = await previewPanel.getAPIPreviewFullResolution();

        const result = await compareImages(canvasImage, apiImage, 'parity-textblock-long-word', { threshold: 0.3 });

        if (result.diffPercentage >= 0.005) console.log(`TextBlock long word parity: ${result.diffPercentage.toFixed(2)}% difference`);
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
        await page.locator('#prop-content').fill('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
        await page.locator('#prop-content').dispatchEvent('input');

        const canvasImage = await canvas.takeFullResolutionScreenshot();

        await previewPanel.switchToAPIMode();
        await previewPanel.waitForAPIPreviewLoaded();
        const apiImage = await previewPanel.getAPIPreviewFullResolution();

        const result = await compareImages(canvasImage, apiImage, 'parity-fieldblock-long-word', { threshold: 0.3 });

        if (result.diffPercentage >= 0.005) console.log(`FieldBlock long word parity: ${result.diffPercentage.toFixed(2)}% difference`);
        expect(result.diffPercentage).toBeLessThan(50);
    });

    test('should match API position for a rotated FieldBlock with line spacing', async () => {
        await zplOutput.openZplFromContent(`^XA
^FX{"labelMeta":{"w":102,"h":152,"dpmm":8}}
^PW815
^CFA,9
^FO73,60^AIR,67,47^FB554,5,17,L,0^FH^FDwrapped^FS
^XZ`);

        await canvas.waitForReady();
        const canvasImage = await canvas.takeFullResolutionScreenshot();
        await previewPanel.switchToAPIMode();
        await previewPanel.waitForAPIPreviewLoaded();
        const apiImage = await previewPanel.getAPIPreviewFullResolution();

        const canvasBounds = findContentBounds(canvasImage);
        const apiBounds = findContentBounds(apiImage);
        const canvasDims = getImageDimensions(canvasImage);
        const apiDims = getImageDimensions(apiImage);
        const canvasLeftDots = canvasBounds.left * apiDims.width / canvasDims.width;
        const canvasRightDots = canvasBounds.right * apiDims.width / canvasDims.width;
        expect(Math.abs(canvasLeftDots - apiBounds.left)).toBeLessThanOrEqual(4);
        expect(Math.abs(canvasRightDots - apiBounds.right)).toBeLessThanOrEqual(4);
    });

    test('should include the trailing-space advance when centering a wrapped FieldBlock line', async () => {
        await zplOutput.openZplFromContent(`^XA
^FX{"labelMeta":{"w":100,"h":25,"dpmm":8}}
^PW799
^CFA,9
^FO21,57^AAN,18^FB237,4,0,C,9999^FDnumber number number\\&^FS
^XZ`);

        await canvas.waitForReady();
        const canvasImage = await canvas.takeFullResolutionScreenshot();
        await previewPanel.switchToAPIMode();
        await previewPanel.waitForAPIPreviewLoaded();
        const apiImage = await previewPanel.getAPIPreviewFullResolution();

        const canvasBounds = findContentBounds(canvasImage);
        const apiBounds = findContentBounds(apiImage);
        const canvasDims = getImageDimensions(canvasImage);
        const apiDims = getImageDimensions(apiImage);
        const canvasLeftDots = canvasBounds.left * apiDims.width / canvasDims.width;
        const canvasRightDots = canvasBounds.right * apiDims.width / canvasDims.width;
        expect(Math.abs(canvasLeftDots - apiBounds.left)).toBeLessThanOrEqual(2);
        expect(Math.abs(canvasRightDots - apiBounds.right)).toBeLessThanOrEqual(2);
    });

    for (const regression of [
        {
            name: 'one-line bitmap field',
            command: '^FO25,12^ADN,18^FB381,1,0,C,9999^FDnumber\\&^FS',
        },
        {
            name: 'wider fallback-font field',
            command: '^FO30,120^AKN,24^FB376,2,0,C,9999^FH^FDnumber number number\\&^FS',
        },
        {
            name: 'forced character-wrapped field',
            command: '^FO139,60^AIN,24^FB269,4,0,C,0^FDaaaaaaaaaaaaaaaaaaa\\&^FS',
        },
    ]) {
        test(`should keep an imported explicit end break centered for a ${regression.name}`, async () => {
            await zplOutput.openZplFromContent(`^XA
^FX{"labelMeta":{"w":51,"h":25,"dpmm":8}}
${regression.command}
^XZ`);

            await canvas.waitForReady();
            const canvasImage = await canvas.takeFullResolutionScreenshot();
            await previewPanel.switchToAPIMode();
            await previewPanel.waitForAPIPreviewLoaded();
            const apiImage = await previewPanel.getAPIPreviewFullResolution();

            const canvasBounds = findContentBounds(canvasImage);
            const apiBounds = findContentBounds(apiImage);
            const canvasDims = getImageDimensions(canvasImage);
            const apiDims = getImageDimensions(apiImage);
            const canvasCenterDots = (canvasBounds.left + canvasBounds.right) / 2 * apiDims.width / canvasDims.width;
            const apiCenterDots = (apiBounds.left + apiBounds.right) / 2;
            expect(Math.abs(canvasCenterDots - apiCenterDots)).toBeLessThanOrEqual(2);
        });
    }

    // Each 2D symbology must place its symbol at the same spot and size as the
    // Labelary render (the canvas geometry comes from bwip-js; this confirms our
    // ^BQ/^BX/^B7/^B0 emission and module sizing track the printer).
    const TWO_D_SYMBOLOGIES = ['QR', 'DATAMATRIX', 'PDF417', 'AZTEC'] as const;

    for (const symbology of TWO_D_SYMBOLOGIES) {
        test(`should have matching ${symbology} bounding box between canvas and API`, async ({ page }) => {
            // Label is 100mm x 50mm at 8dpmm = 800 x 400 dots
            const labelWidthDots = 800;
            const labelHeightDots = 400;

            await elementsPanel.addQRCodeElement();
            await elementsPanel.selectElementByIndex(0);
            await propertiesPanel.setSelectValue('prop-symbology', symbology);

            await page.locator('#prop-x').fill('50');
            await page.locator('#prop-x').dispatchEvent('input');
            await page.locator('#prop-y').fill('50');
            await page.locator('#prop-y').dispatchEvent('input');

            await canvas.waitForReady();
            const canvasImage = await canvas.takeFullResolutionScreenshot();

            await previewPanel.switchToAPIMode();
            await previewPanel.waitForAPIPreviewLoaded();
            const apiImage = await previewPanel.getAPIPreviewFullResolution();

            // Find dark pixels only (barcode modules), ignoring label border/background
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

            const xDiff = Math.abs(canvasDots.left - apiDots.left);
            const yDiff = Math.abs(canvasDots.top - apiDots.top);
            const wDiff = Math.abs(canvasDots.width - apiDots.width);
            const hDiff = Math.abs(canvasDots.height - apiDots.height);

            if (xDiff >= 10 || yDiff >= 10 || wDiff >= 10 || hDiff >= 10) {
                console.log(`[${symbology}] Canvas image size:`, canvasDims);
                console.log(`[${symbology}] API image size:`, apiDims);
                console.log(`[${symbology}] Canvas pixel bounds:`, canvasBounds);
                console.log(`[${symbology}] API pixel bounds:`, apiBounds);
                console.log(`[${symbology}] Canvas dot-space:`, canvasDots);
                console.log(`[${symbology}] API dot-space:`, apiDots);
                console.log(`[${symbology}] Dot-space diff - X:`, (canvasDots.left - apiDots.left).toFixed(1), 'Y:', (canvasDots.top - apiDots.top).toFixed(1));
                console.log(`[${symbology}] Dot-space diff - W:`, (canvasDots.width - apiDots.width).toFixed(1), 'H:', (canvasDots.height - apiDots.height).toFixed(1));
            }

            // Width and height should match within 10 dots
            expect(Math.abs(canvasDots.width - apiDots.width)).toBeLessThan(10);
            expect(Math.abs(canvasDots.height - apiDots.height)).toBeLessThan(10);
            // Position should match within 10 dots
            expect(Math.abs(canvasDots.top - apiDots.top)).toBeLessThan(10);
            expect(Math.abs(canvasDots.left - apiDots.left)).toBeLessThan(10);
        });
    }

    // ^GS graphic symbols: each of the five symbols must land at the same spot
    // and roughly the same size as the Labelary render. The canvas glyphs are
    // vector approximations, so pixel diff is loose; the bounds check is the
    // real assertion. 'C' (™) is sparse ink that doesn't fill the command box,
    // so it only checks position.
    const GS_SYMBOLS = ['A', 'B', 'C', 'D', 'E'] as const;

    test('should align bare-^FT graphic symbols after ^FO text like the API', async ({ page }) => {
        const zpl = [
            '^XA',
            '^FX{"labelMeta":{"w":54,"h":86,"dpmm":8}}',
            '^CF0,48',
            '^FO10,20^FDA^FS^FT^GSN^FDA^FS',
            '^FO10,80^FDB^FS^FT^GSN^FDB^FS',
            '^FO10,140^FDC^FS^FT^GSN^FDC^FS',
            '^FO10,200^FDD^FS^FT^GSN^FDD^FS',
            '^FO10,260^FDE^FS^FT^GSN^FDE^FS',
            '^XZ',
        ].join('\n');
        await pasteZPL(page, zplOutput, zpl, 10);

        const canvasImage = await canvas.takeFullResolutionScreenshot();
        await previewPanel.switchToAPIMode();
        await previewPanel.waitForAPIPreviewLoaded();
        const apiImage = await previewPanel.getAPIPreviewFullResolution();

        const widthDots = 54 * 8;
        const heightDots = 86 * 8;
        for (let row = 0; row < 5; row++) {
            const top = row * 60;
            const canvasRow = stripBounds(canvasImage, top, top + 60, widthDots, heightDots);
            const apiRow = stripBounds(apiImage, top, top + 60, widthDots, heightDots);
            expect(Math.abs(canvasRow.top - apiRow.top), `row ${row} top`).toBeLessThan(3);
            expect(Math.abs(canvasRow.left - apiRow.left), `row ${row} left`).toBeLessThan(3);
            expect(Math.abs(canvasRow.bottom - apiRow.bottom), `row ${row} bottom`).toBeLessThan(10);
            expect(Math.abs(canvasRow.right - apiRow.right), `row ${row} right`).toBeLessThan(10);
        }
    });

    for (const symbol of GS_SYMBOLS) {
        test(`should have matching ^GS symbol ${symbol} bounding box between canvas and API`, async ({ page }) => {
            // Label is 100mm x 50mm at 8dpmm = 800 x 400 dots
            const labelWidthDots = 800;
            const labelHeightDots = 400;

            await elementsPanel.addGraphicSymbolElement();
            await elementsPanel.selectElementByIndex(0);
            await propertiesPanel.setSelectValue('prop-symbol', symbol);

            await page.locator('#prop-x').fill('50');
            await page.locator('#prop-x').dispatchEvent('input');
            await page.locator('#prop-y').fill('50');
            await page.locator('#prop-y').dispatchEvent('input');
            await page.locator('#prop-height').fill('150');
            await page.locator('#prop-height').dispatchEvent('input');
            await page.locator('#prop-width').fill('150');
            await page.locator('#prop-width').dispatchEvent('input');

            await canvas.waitForReady();
            const canvasImage = await canvas.takeFullResolutionScreenshot();

            await previewPanel.switchToAPIMode();
            await previewPanel.waitForAPIPreviewLoaded();
            const apiImage = await previewPanel.getAPIPreviewFullResolution();

            const canvasBounds = findContentBounds(canvasImage);
            const apiBounds = findContentBounds(apiImage);
            const canvasDims = getImageDimensions(canvasImage);
            const apiDims = getImageDimensions(apiImage);

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


            // Position must track within 20 dots for every symbol.
            expect(Math.abs(canvasDots.left - apiDots.left)).toBeLessThan(20);
            expect(Math.abs(canvasDots.top - apiDots.top)).toBeLessThan(20);

            if (symbol !== 'C') {
                // Ring-based symbols fill the 150×150 command box on both sides.
                expect(Math.abs(canvasDots.width - apiDots.width)).toBeLessThan(20);
                expect(Math.abs(canvasDots.height - apiDots.height)).toBeLessThan(20);

                const result = await compareImages(canvasImage, apiImage, `parity-gs-${symbol}`, { threshold: 0.3 });
                if (result.diffPercentage >= 0.005) console.log(`^GS ${symbol} parity: ${result.diffPercentage.toFixed(2)}% difference`);
                expect(result.diffPercentage).toBeLessThan(50);
            }
        });
    }

    // Non-uniform ^GS: the printer stretches the glyph anamorphically and
    // quantizes each axis to the nearest 24-dot font step (w=228 → 9.5 steps
    // → 250; w=76 → 3.17 steps → 75, i.e. it can round DOWN). The canvas
    // must track both effects or the box lands at the wrong size.
    const GS_NONUNIFORM_CASES = [
        { h: 100, w: 228, slug: 'nonuniform' }, // rounds up across the cap boundary
        { h: 93, w: 76, slug: 'rounddown' }, // w rounds down to 75 (user-reported mismatch)
    ];

    for (const { h, w, slug } of GS_NONUNIFORM_CASES) {
        test(`should have matching ^GS bounding box for non-square quantized size ${h}h×${w}w`, async ({ page }) => {
            const labelWidthDots = 800;
            const labelHeightDots = 400;

            await elementsPanel.addGraphicSymbolElement();
            await elementsPanel.selectElementByIndex(0);

            await page.locator('#prop-x').fill('50');
            await page.locator('#prop-x').dispatchEvent('input');
            await page.locator('#prop-y').fill('50');
            await page.locator('#prop-y').dispatchEvent('input');
            await page.locator('#prop-height').fill(String(h));
            await page.locator('#prop-height').dispatchEvent('input');
            await page.locator('#prop-width').fill(String(w));
            await page.locator('#prop-width').dispatchEvent('input');

            await canvas.waitForReady();
            const canvasImage = await canvas.takeFullResolutionScreenshot();

            await previewPanel.switchToAPIMode();
            await previewPanel.waitForAPIPreviewLoaded();
            const apiImage = await previewPanel.getAPIPreviewFullResolution();

            const canvasBounds = findContentBounds(canvasImage);
            const apiBounds = findContentBounds(apiImage);
            const canvasDims = getImageDimensions(canvasImage);
            const apiDims = getImageDimensions(apiImage);

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


            expect(Math.abs(canvasDots.left - apiDots.left)).toBeLessThan(20);
            expect(Math.abs(canvasDots.top - apiDots.top)).toBeLessThan(20);
            expect(Math.abs(canvasDots.width - apiDots.width)).toBeLessThan(20);
            expect(Math.abs(canvasDots.height - apiDots.height)).toBeLessThan(20);

            const result = await compareImages(canvasImage, apiImage, `parity-gs-${slug}`, { threshold: 0.3 });
            if (result.diffPercentage >= 0.005) console.log(`^GS ${slug} parity: ${result.diffPercentage.toFixed(2)}% difference`);
            expect(result.diffPercentage).toBeLessThan(50);
        });
    }

    // Rotated ^GS pivots on the font character cell (26k−2 × 24k−1 dots for
    // k quantization steps), not the command box. At h=250 the cell is 11
    // dots shorter than the box, so a box-pivot canvas render lands the ink
    // visibly off — tolerance here is deliberately tighter than the box error.
    test('should have matching ^GS position for rotated (I) orientation', async ({ page }) => {
        const labelWidthDots = 800;
        const labelHeightDots = 400;

        await elementsPanel.addGraphicSymbolElement();
        await elementsPanel.selectElementByIndex(0);

        await page.locator('#prop-x').fill('50');
        await page.locator('#prop-x').dispatchEvent('input');
        await page.locator('#prop-y').fill('50');
        await page.locator('#prop-y').dispatchEvent('input');
        await page.locator('#prop-height').fill('250');
        await page.locator('#prop-height').dispatchEvent('input');
        await page.locator('#prop-width').fill('100');
        await page.locator('#prop-width').dispatchEvent('input');
        await page.locator('#properties-panel button[data-orientation="I"]').click();

        await canvas.waitForReady();
        const canvasImage = await canvas.takeFullResolutionScreenshot();

        await previewPanel.switchToAPIMode();
        await previewPanel.waitForAPIPreviewLoaded();
        const apiImage = await previewPanel.getAPIPreviewFullResolution();

        const canvasBounds = findContentBounds(canvasImage);
        const apiBounds = findContentBounds(apiImage);
        const canvasDims = getImageDimensions(canvasImage);
        const apiDims = getImageDimensions(apiImage);

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

        expect(Math.abs(canvasDots.left - apiDots.left)).toBeLessThan(6);
        expect(Math.abs(canvasDots.top - apiDots.top)).toBeLessThan(6);
        expect(Math.abs(canvasDots.width - apiDots.width)).toBeLessThan(20);
        expect(Math.abs(canvasDots.height - apiDots.height)).toBeLessThan(20);
    });
    // ^FP (Field Parameter). The layout constants in src/utils/fieldParameter.js and
    // TextRenderer were derived by pixel-scanning Labelary output; these pin them, and
    // cover the two axes that interact — the direction itself and the ^A rotation.
    const FP_PARITY_CASES = [
        { name: 'vertical', zpl: '^FO200,60^AAN,18,10^FPV^FDABCD^FS' },
        { name: 'reverse', zpl: '^FO500,60^AAN,18,10^FPR^FDABCD^FS' },
        { name: 'horizontal gap', zpl: '^FO200,60^AAN,18,10^FPH,20^FDABCD^FS' },
        { name: 'vertical under a rotated font', zpl: '^FO200,60^AAR,18,10^FPV^FDABCD^FS' },
        { name: 'reverse under a rotated font', zpl: '^FO200,200^AAR,18,10^FPR^FDABCD^FS' },
        { name: 'vertical in font 0', zpl: '^FO200,60^A0N,40,40^FPV^FDABCD^FS' },
        // Blocks draw the gap (and wrap by it); the other two directions are warned
        // about rather than drawn, so they are deliberately not asserted here. Nor is
        // the wrap BOUNDARY: Labelary lets a block's last character start up to one
        // gap past the declared width, which no single measurement pins.
        { name: 'gap in an ^FB block', zpl: '^FO100,60^AAN,18,10^FPH,20^FB300,3,0,L^FDABCD^FS' },
        { name: 'gap in a ^TB block', zpl: '^FO100,60^AAN,18,10^FPH,20^TBN,300,60^FDABCD^FS' },
    ];

    for (const fpCase of FP_PARITY_CASES) {
        test(`should match the API bounding box for ^FP ${fpCase.name}`, async () => {
            const labelWidthDots = 800;
            const labelHeightDots = 400;
            await zplOutput.openZplFromContent(`^XA
^FX{"labelMeta":{"w":100,"h":50,"dpmm":8}}
^PW800
^CFA,9
${fpCase.zpl}
^XZ`);

            await canvas.waitForReady();
            const canvasImage = await canvas.takeFullResolutionScreenshot();
            await previewPanel.switchToAPIMode();
            await previewPanel.waitForAPIPreviewLoaded();
            const apiImage = await previewPanel.getAPIPreviewFullResolution();

            const canvasBounds = findContentBounds(canvasImage);
            const apiBounds = findContentBounds(apiImage);
            const canvasDims = getImageDimensions(canvasImage);
            const apiDims = getImageDimensions(apiImage);
            const toDots = (bounds: any, dims: any) => ({
                left: bounds.left * labelWidthDots / dims.width,
                top: bounds.top * labelHeightDots / dims.height,
                width: bounds.width * labelWidthDots / dims.width,
                height: bounds.height * labelHeightDots / dims.height,
            });
            const canvasDots = toDots(canvasBounds, canvasDims);
            const apiDots = toDots(apiBounds, apiDims);

            // The canvas approximates the printer's per-glyph integer advances, so a
            // few dots of residual is expected and is not worth chasing — the same
            // allowance the typeset-cursor advance documents.
            expect(Math.abs(canvasDots.left - apiDots.left), 'left').toBeLessThan(6);
            expect(Math.abs(canvasDots.top - apiDots.top), 'top').toBeLessThan(6);
            expect(Math.abs(canvasDots.width - apiDots.width), 'width').toBeLessThan(8);
            expect(Math.abs(canvasDots.height - apiDots.height), 'height').toBeLessThan(8);
        });
    }
});
