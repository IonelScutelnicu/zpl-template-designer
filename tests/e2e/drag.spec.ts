import { test, expect } from '../fixtures';
import { ElementsPanel, PropertiesPanel, Canvas, ZPLOutput } from '../page-objects';

test.describe('Drag - Element Position', () => {
    let elementsPanel: ElementsPanel;
    let propertiesPanel: PropertiesPanel;
    let canvas: Canvas;
    let zplOutput: ZPLOutput;

    test.use({ viewport: { width: 1920, height: 1080 } });

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

    // Helper: drag element from its position to a new label coordinate position
    // Grabs the element slightly inside its top-left corner, moves to destination
    async function dragAndWait(fromX: number, fromY: number, toX: number, toY: number): Promise<void> {
        await canvas.dragLabelCoords(fromX, fromY, toX, toY);
        await canvas.waitForReady();
    }

    async function dragAndCancelWithEsc(
        page: import('@playwright/test').Page,
        fromX: number,
        fromY: number,
        toX: number,
        toY: number
    ): Promise<void> {
        const box = await canvas.getBoundingBox();
        if (!box) throw new Error('Canvas not found');

        const scale = await canvas.getScale();
        await page.mouse.move(box.x + fromX * scale, box.y + fromY * scale);
        await page.mouse.down();
        await page.mouse.move(box.x + toX * scale, box.y + toY * scale, { steps: 10 });
        await page.keyboard.press('Escape');
        await page.mouse.up();
        await canvas.waitForReady();
    }

    async function resizeAndCancelWithEsc(
        page: import('@playwright/test').Page,
        handleX: number,
        handleY: number,
        toX: number,
        toY: number
    ): Promise<void> {
        const box = await canvas.getBoundingBox();
        if (!box) throw new Error('Canvas not found');

        // Use the CSS display scale (rect.width / canvas.width) to correctly convert
        // label dot coordinates to viewport pixel offsets. canvasRenderer.scale is
        // always 1 (internal rendering), but the canvas element is CSS-scaled to fit
        // its container, so we must account for that here.
        const cssScale = await page.evaluate(() => {
            const c = document.getElementById('label-canvas') as HTMLCanvasElement;
            if (!c || !c.width) return 1;
            return c.getBoundingClientRect().width / c.width;
        });

        await page.mouse.move(box.x + handleX * cssScale, box.y + handleY * cssScale);
        await page.mouse.down();
        await page.mouse.move(box.x + toX * cssScale, box.y + toY * cssScale, { steps: 10 });
        await page.keyboard.press('Escape');
        await page.mouse.up();
        await canvas.waitForReady();
    }

    // ============== TEXT ELEMENT DRAG ==============
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

    // ============== BARCODE ELEMENT DRAG ==============
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

    // ============== BOX ELEMENT DRAG ==============
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

    // ============== TEXTBLOCK ELEMENT DRAG ==============
    test('should move TEXTBLOCK element when dragged', async ({ page }) => {
        await elementsPanel.addTextBlockElement();
        await elementsPanel.selectElementByIndex(0);
        await setPosition(page, 100, 100);

        // Grab slightly inside the element (5 dots from corner) to ensure hitbox hit
        const inside = 20;
        await dragAndWait(100 + inside, 100 + inside, 200, 160);

        await elementsPanel.selectElementByIndex(0);
        const newX = parseInt(await propertiesPanel.getProperty('prop-x'));
        const newY = parseInt(await propertiesPanel.getProperty('prop-y'));

        expect(newX).toBeGreaterThan(100);
        expect(newY).toBeGreaterThan(100);
    });

    // ============== QRCODE ELEMENT DRAG ==============
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

    // ============== LINE ELEMENT DRAG ==============
    test('should move LINE element when dragged', async ({ page }) => {
        await elementsPanel.addLineElement();
        await elementsPanel.selectElementByIndex(0);
        await setPosition(page, 100, 100);

        // Increase thickness to 30 dots for a larger hitbox
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
