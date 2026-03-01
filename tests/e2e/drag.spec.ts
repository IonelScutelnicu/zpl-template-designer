import { test, expect } from '../fixtures';
import { ElementsPanel, PropertiesPanel, Canvas, ZPLOutput } from '../page-objects';

test.describe('Drag - Element Position', () => {
    let elementsPanel: ElementsPanel;
    let propertiesPanel: PropertiesPanel;
    let canvas: Canvas;
    let zplOutput: ZPLOutput;

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        elementsPanel = new ElementsPanel(page);
        propertiesPanel = new PropertiesPanel(page);
        canvas = new Canvas(page);
        zplOutput = new ZPLOutput(page);
        await canvas.waitForReady();
    });

    // Helper: set element to a known position and wait for canvas to settle
    async function setPosition(page: import('@playwright/test').Page, x: number, y: number): Promise<void> {
        await page.locator('#prop-x').fill(String(x));
        await page.locator('#prop-x').dispatchEvent('change');
        await page.locator('#prop-y').fill(String(y));
        await page.locator('#prop-y').dispatchEvent('change');
        await canvas.waitForReady();
    }

    // Helper: get the CSS display scale of the canvas element.
    // canvasRenderer.scale is always 1 (internal rendering); the canvas element is
    // CSS-scaled to fit its container, so mouse coordinates must use this ratio.
    async function getCSSScale(page: import('@playwright/test').Page): Promise<number> {
        return await page.evaluate(() => {
            const c = document.getElementById('label-canvas') as HTMLCanvasElement;
            if (!c || !c.width) return 1;
            return c.getBoundingClientRect().width / c.width;
        });
    }

    // Helper: drag element from its position to a new label coordinate position
    async function dragAndWait(fromX: number, fromY: number, toX: number, toY: number): Promise<void> {
        await canvas.dragLabelCoords(fromX, fromY, toX, toY);
        await canvas.waitForReady();
    }

    // Helper: drag from a label coordinate and cancel with Escape
    async function dragAndCancelWithEsc(
        page: import('@playwright/test').Page,
        fromX: number,
        fromY: number,
        toX: number,
        toY: number
    ): Promise<void> {
        const box = await canvas.getBoundingBox();
        if (!box) throw new Error('Canvas not found');

        const cssScale = await getCSSScale(page);
        await page.mouse.move(box.x + fromX * cssScale, box.y + fromY * cssScale);
        await page.mouse.down();
        await page.mouse.move(box.x + toX * cssScale, box.y + toY * cssScale, { steps: 10 });
        await page.keyboard.press('Escape');
        await page.mouse.up();
        await canvas.waitForReady();
    }

    // Helper: drag a resize handle to a new position (label dot coordinates)
    async function resizeAndWait(
        page: import('@playwright/test').Page,
        handleX: number,
        handleY: number,
        toX: number,
        toY: number
    ): Promise<void> {
        const box = await canvas.getBoundingBox();
        if (!box) throw new Error('Canvas not found');

        const cssScale = await getCSSScale(page);
        await page.mouse.move(box.x + handleX * cssScale, box.y + handleY * cssScale);
        await page.mouse.down();
        await page.mouse.move(box.x + toX * cssScale, box.y + toY * cssScale, { steps: 10 });
        await page.mouse.up();
        await canvas.waitForReady();
    }

    // Helper: drag a resize handle and cancel with Escape
    async function resizeAndCancelWithEsc(
        page: import('@playwright/test').Page,
        handleX: number,
        handleY: number,
        toX: number,
        toY: number
    ): Promise<void> {
        const box = await canvas.getBoundingBox();
        if (!box) throw new Error('Canvas not found');

        const cssScale = await getCSSScale(page);
        await page.mouse.move(box.x + handleX * cssScale, box.y + handleY * cssScale);
        await page.mouse.down();
        await page.mouse.move(box.x + toX * cssScale, box.y + toY * cssScale, { steps: 10 });
        await page.keyboard.press('Escape');
        await page.mouse.up();
        await canvas.waitForReady();
    }

    // ============== TEXT ELEMENT ==============
    test('should move TEXT element when dragged', async ({ page }) => {
        await elementsPanel.addTextElement();
        await elementsPanel.selectElementByIndex(0);
        await setPosition(page, 100, 100);

        const inside = 20;
        await dragAndWait(100 + inside, 100 + inside, 200, 150);

        await elementsPanel.selectElementByIndex(0);
        const newX = parseInt(await propertiesPanel.getProperty('prop-x'));
        const newY = parseInt(await propertiesPanel.getProperty('prop-y'));

        expect(newX).toBeGreaterThan(100);
        expect(newY).toBeGreaterThan(100);
    });

    // ============== BARCODE ELEMENT ==============
    test('should move BARCODE element when dragged', async ({ page }) => {
        await elementsPanel.addBarcodeElement();
        await elementsPanel.selectElementByIndex(0);
        await setPosition(page, 100, 100);

        const inside = 20;
        await dragAndWait(100 + inside, 100 + inside, 200, 160);

        await elementsPanel.selectElementByIndex(0);
        const newX = parseInt(await propertiesPanel.getProperty('prop-x'));
        const newY = parseInt(await propertiesPanel.getProperty('prop-y'));

        expect(newX).toBeGreaterThan(100);
        expect(newY).toBeGreaterThan(100);
    });

    test('should resize BARCODE element when dragged', async ({ page }) => {
        await elementsPanel.addBarcodeElement();
        await elementsPanel.selectElementByIndex(0);
        await page.waitForSelector('#properties-panel #prop-height');
        await setPosition(page, 100, 100);

        const height = parseInt(await propertiesPanel.getProperty('prop-height'));

        // Grab the bottom resize handle (mid-width estimate) and drag downward
        await resizeAndWait(page, 100 + 145, 100 + height, 100 + 145, 100 + height + 60);

        await elementsPanel.selectElementByIndex(0);
        const newHeight = parseInt(await propertiesPanel.getProperty('prop-height'));
        expect(newHeight).toBeGreaterThan(height);
    });

    test('should restore BARCODE height when Escape is pressed during resize', async ({ page }) => {
        await elementsPanel.addBarcodeElement();
        await elementsPanel.selectElementByIndex(0);
        await page.waitForSelector('#properties-panel #prop-height');
        await setPosition(page, 100, 100);

        const height = parseInt(await propertiesPanel.getProperty('prop-height'));

        await resizeAndCancelWithEsc(page, 100 + 145, 100 + height, 100 + 145, 100 + height + 60);

        await elementsPanel.selectElementByIndex(0);
        const heightAfter = parseInt(await propertiesPanel.getProperty('prop-height'));
        expect(heightAfter).toBe(height);
    });

    // ============== BOX ELEMENT ==============
    test('should move BOX element when dragged', async ({ page }) => {
        await elementsPanel.addBoxElement();
        await elementsPanel.selectElementByIndex(0);
        await setPosition(page, 50, 50);

        const inside = 20;
        await dragAndWait(50 + inside, 50 + inside, 160, 130);

        await elementsPanel.selectElementByIndex(0);
        const newX = parseInt(await propertiesPanel.getProperty('prop-x'));
        const newY = parseInt(await propertiesPanel.getProperty('prop-y'));

        expect(newX).toBeGreaterThan(50);
        expect(newY).toBeGreaterThan(50);
    });

    test('should resize BOX element when dragged', async ({ page }) => {
        await elementsPanel.addBoxElement();
        await elementsPanel.selectElementByIndex(0);
        await page.waitForSelector('#properties-panel #prop-width');
        await setPosition(page, 80, 80);

        const x = parseInt(await propertiesPanel.getProperty('prop-x'));
        const y = parseInt(await propertiesPanel.getProperty('prop-y'));
        const width = parseInt(await propertiesPanel.getProperty('prop-width'));
        const height = parseInt(await propertiesPanel.getProperty('prop-height'));

        // Drag bottom-right resize handle outward
        await resizeAndWait(page, x + width, y + height, x + width + 60, y + height + 40);

        await elementsPanel.selectElementByIndex(0);
        const newWidth = parseInt(await propertiesPanel.getProperty('prop-width'));
        const newHeight = parseInt(await propertiesPanel.getProperty('prop-height'));

        expect(newWidth).toBeGreaterThan(width);
        expect(newHeight).toBeGreaterThan(height);
    });

    test('should restore BOX position when Escape is pressed during drag', async ({ page }) => {
        await elementsPanel.addBoxElement();
        await elementsPanel.selectElementByIndex(0);
        await page.waitForSelector('#properties-panel #prop-width');
        await setPosition(page, 100, 100);

        // Start drag from inside the shape (away from resize handles), then cancel with Esc.
        const inside = 20;
        await dragAndCancelWithEsc(page, 100 + inside, 100 + inside, 260, 180);

        await elementsPanel.selectElementByIndex(0);
        const x = parseInt(await propertiesPanel.getProperty('prop-x'));
        const y = parseInt(await propertiesPanel.getProperty('prop-y'));

        expect(x).toBe(100);
        expect(y).toBe(100);
        expect(await zplOutput.getZPLCode()).toContain('^FO100,100');
    });

    test('should restore BOX size when Escape is pressed during resize', async ({ page }) => {
        await elementsPanel.addBoxElement();
        await elementsPanel.selectElementByIndex(0);
        await page.waitForSelector('#properties-panel #prop-width');
        await setPosition(page, 80, 80);

        const x = parseInt(await propertiesPanel.getProperty('prop-x'));
        const y = parseInt(await propertiesPanel.getProperty('prop-y'));
        const width = parseInt(await propertiesPanel.getProperty('prop-width'));
        const height = parseInt(await propertiesPanel.getProperty('prop-height'));

        // Drag bottom-right resize handle, then cancel with Esc.
        await resizeAndCancelWithEsc(page, x + width, y + height, x + width + 60, y + height + 40);

        await elementsPanel.selectElementByIndex(0);
        const widthAfter = parseInt(await propertiesPanel.getProperty('prop-width'));
        const heightAfter = parseInt(await propertiesPanel.getProperty('prop-height'));
        const xAfter = parseInt(await propertiesPanel.getProperty('prop-x'));
        const yAfter = parseInt(await propertiesPanel.getProperty('prop-y'));

        expect(widthAfter).toBe(width);
        expect(heightAfter).toBe(height);
        expect(xAfter).toBe(x);
        expect(yAfter).toBe(y);
    });

    // ============== FIELDBLOCK ELEMENT ==============
    test('should move FIELDBLOCK element when dragged', async ({ page }) => {
        await elementsPanel.addFieldBlockElement();
        await elementsPanel.selectElementByIndex(0);
        await setPosition(page, 100, 100);

        const inside = 20;
        await dragAndWait(100 + inside, 100 + inside, 200, 160);

        await elementsPanel.selectElementByIndex(0);
        const newX = parseInt(await propertiesPanel.getProperty('prop-x'));
        const newY = parseInt(await propertiesPanel.getProperty('prop-y'));

        expect(newX).toBeGreaterThan(100);
        expect(newY).toBeGreaterThan(100);
    });

    test('should resize FIELDBLOCK element when dragged', async ({ page }) => {
        await elementsPanel.addFieldBlockElement();
        await elementsPanel.selectElementByIndex(0);
        await page.waitForSelector('#properties-panel #prop-block-width');
        await setPosition(page, 100, 100);

        const x = 100;
        const y = 100;
        const blockWidth = parseInt(await propertiesPanel.getProperty('prop-block-width'));
        const maxLines = parseInt(await propertiesPanel.getProperty('prop-max-lines'));
        // FIELDBLOCK only has a bottom-right corner handle
        // Height = fontSize(default 20) * 1.2 * maxLines
        const fieldBlockHeight = 20 * 1.2 * maxLines;

        // Drag the bottom-right resize handle outward
        await resizeAndWait(page, x + blockWidth, y + fieldBlockHeight, x + blockWidth + 80, y + fieldBlockHeight);

        await elementsPanel.selectElementByIndex(0);
        const newBlockWidth = parseInt(await propertiesPanel.getProperty('prop-block-width'));
        expect(newBlockWidth).toBeGreaterThan(blockWidth);
    });

    test('should restore FIELDBLOCK width when Escape is pressed during resize', async ({ page }) => {
        await elementsPanel.addFieldBlockElement();
        await elementsPanel.selectElementByIndex(0);
        await page.waitForSelector('#properties-panel #prop-block-width');
        await setPosition(page, 100, 100);

        const x = 100;
        const y = 100;
        const blockWidth = parseInt(await propertiesPanel.getProperty('prop-block-width'));
        const maxLines = parseInt(await propertiesPanel.getProperty('prop-max-lines'));
        // FIELDBLOCK only has a bottom-right corner handle
        const fieldBlockHeight = 20 * 1.2 * maxLines;

        await resizeAndCancelWithEsc(page, x + blockWidth, y + fieldBlockHeight, x + blockWidth + 80, y + fieldBlockHeight);

        await elementsPanel.selectElementByIndex(0);
        const blockWidthAfter = parseInt(await propertiesPanel.getProperty('prop-block-width'));
        expect(blockWidthAfter).toBe(blockWidth);
    });

    // ============== QRCODE ELEMENT ==============
    test('should move QRCODE element when dragged', async ({ page }) => {
        await elementsPanel.addQRCodeElement();
        await elementsPanel.selectElementByIndex(0);
        await setPosition(page, 100, 100);

        const inside = 20;
        await dragAndWait(100 + inside, 100 + inside, 150, 150);

        await elementsPanel.selectElementByIndex(0);
        const newX = parseInt(await propertiesPanel.getProperty('prop-x'));
        const newY = parseInt(await propertiesPanel.getProperty('prop-y'));

        expect(newX).toBeGreaterThan(100);
        expect(newY).toBeGreaterThan(100);
    });

    // ============== LINE ELEMENT ==============
    test('should move LINE element when dragged', async ({ page }) => {
        await elementsPanel.addLineElement();
        await elementsPanel.selectElementByIndex(0);
        await setPosition(page, 100, 100);

        // Increase thickness to 50 dots for a larger hitbox
        await page.locator('#prop-thickness').fill('50');
        await page.locator('#prop-thickness').dispatchEvent('input');
        await canvas.waitForReady();

        const inside = 20;
        await dragAndWait(100 + inside, 100 + inside, 250, 200);

        await elementsPanel.selectElementByIndex(0);
        const newX = parseInt(await propertiesPanel.getProperty('prop-x'));
        const newY = parseInt(await propertiesPanel.getProperty('prop-y'));

        expect(newX).toBeGreaterThan(100);
        expect(newY).toBeGreaterThan(100);
    });

    test('should resize LINE element when dragged', async ({ page }) => {
        await elementsPanel.addLineElement();
        await elementsPanel.selectElementByIndex(0);
        await page.waitForSelector('#properties-panel #prop-width');
        await setPosition(page, 100, 100);

        // Use a thick line so the right-end resize handle has a larger hit area
        await page.locator('#prop-thickness').fill('20');
        await page.locator('#prop-thickness').dispatchEvent('input');
        await canvas.waitForReady();

        const x = 100;
        const y = 100;
        const width = parseInt(await propertiesPanel.getProperty('prop-width'));

        // Drag the right-end resize handle; y+10 is the vertical center of thickness=20
        await resizeAndWait(page, x + width, y + 10, x + width + 60, y + 10);

        await elementsPanel.selectElementByIndex(0);
        const newWidth = parseInt(await propertiesPanel.getProperty('prop-width'));
        expect(newWidth).toBeGreaterThan(width);
    });

    test('should restore LINE length when Escape is pressed during resize', async ({ page }) => {
        await elementsPanel.addLineElement();
        await elementsPanel.selectElementByIndex(0);
        await page.waitForSelector('#properties-panel #prop-width');
        await setPosition(page, 100, 100);

        await page.locator('#prop-thickness').fill('20');
        await page.locator('#prop-thickness').dispatchEvent('input');
        await canvas.waitForReady();

        const x = 100;
        const y = 100;
        const width = parseInt(await propertiesPanel.getProperty('prop-width'));

        await resizeAndCancelWithEsc(page, x + width, y + 10, x + width + 60, y + 10);

        await elementsPanel.selectElementByIndex(0);
        const widthAfter = parseInt(await propertiesPanel.getProperty('prop-width'));
        expect(widthAfter).toBe(width);
    });

    // ============== CIRCLE ELEMENT ==============
    test('should move CIRCLE element when dragged', async ({ page }) => {
        await elementsPanel.addCircleElement();
        await elementsPanel.selectElementByIndex(0);
        await setPosition(page, 100, 100);

        const inside = 20;
        await dragAndWait(100 + inside, 100 + inside, 200, 160);

        await elementsPanel.selectElementByIndex(0);
        const newX = parseInt(await propertiesPanel.getProperty('prop-x'));
        const newY = parseInt(await propertiesPanel.getProperty('prop-y'));

        expect(newX).toBeGreaterThan(100);
        expect(newY).toBeGreaterThan(100);
    });

    test('should resize CIRCLE element when dragged', async ({ page }) => {
        await elementsPanel.addCircleElement();
        await elementsPanel.selectElementByIndex(0);
        await page.waitForSelector('#properties-panel #prop-width');
        await setPosition(page, 100, 100);

        const x = 100;
        const y = 100;
        const width = parseInt(await propertiesPanel.getProperty('prop-width'));
        const height = parseInt(await propertiesPanel.getProperty('prop-height'));

        // Drag bottom-right resize handle outward
        await resizeAndWait(page, x + width, y + height, x + width + 60, y + height + 40);

        await elementsPanel.selectElementByIndex(0);
        const newWidth = parseInt(await propertiesPanel.getProperty('prop-width'));
        const newHeight = parseInt(await propertiesPanel.getProperty('prop-height'));

        expect(newWidth).toBeGreaterThan(width);
        expect(newHeight).toBeGreaterThan(height);
    });

    test('should restore CIRCLE size when Escape is pressed during resize', async ({ page }) => {
        await elementsPanel.addCircleElement();
        await elementsPanel.selectElementByIndex(0);
        await page.waitForSelector('#properties-panel #prop-width');
        await setPosition(page, 100, 100);

        const x = 100;
        const y = 100;
        const width = parseInt(await propertiesPanel.getProperty('prop-width'));
        const height = parseInt(await propertiesPanel.getProperty('prop-height'));

        await resizeAndCancelWithEsc(page, x + width, y + height, x + width + 60, y + height + 40);

        await elementsPanel.selectElementByIndex(0);
        const widthAfter = parseInt(await propertiesPanel.getProperty('prop-width'));
        const heightAfter = parseInt(await propertiesPanel.getProperty('prop-height'));

        expect(widthAfter).toBe(width);
        expect(heightAfter).toBe(height);
    });

    // ============== BOUNDARY: cannot drag above y=0 ==============
    test('should constrain drag so element cannot go above y=0', async ({ page }) => {
        await elementsPanel.addTextElement();
        await elementsPanel.selectElementByIndex(0);
        await setPosition(page, 100, 30);

        // Drag upward, trying to go above y=0
        await dragAndWait(100, 30, 100, -50);

        await elementsPanel.selectElementByIndex(0);
        const newY = parseInt(await propertiesPanel.getProperty('prop-y'));

        // Y should be clamped at 0, not negative
        expect(newY).toBeGreaterThanOrEqual(0);
    });

    // ============== REGRESSION: TEXT can reach right edge ==============
    test('should allow dragging TEXT element to the right edge of the label', async ({ page }) => {
        await elementsPanel.addTextElement();
        await elementsPanel.selectElementByIndex(0);
        await setPosition(page, 100, 100);

        // Default label width is 100mm * 8dpmm = 800 dots
        // Drag element toward the right edge
        const inside = 20;
        await dragAndWait(100 + inside, 100 + inside, 750, 100);

        await elementsPanel.selectElementByIndex(0);
        const newX = parseInt(await propertiesPanel.getProperty('prop-x'));

        // Element should have moved significantly to the right
        expect(newX).toBeGreaterThan(100);

        // Verify ZPL reflects a large X position
        const zpl = await zplOutput.getZPLCode();
        expect(zpl).toMatch(/\^FO\d{3,},/);
    });
});
