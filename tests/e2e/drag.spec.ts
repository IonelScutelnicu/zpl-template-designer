import { test, expect } from '@playwright/test';
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

        const scale = await canvas.getScale();
        await page.mouse.move(box.x + handleX * scale, box.y + handleY * scale);
        await page.mouse.down();
        await page.mouse.move(box.x + toX * scale, box.y + toY * scale, { steps: 10 });
        await page.keyboard.press('Escape');
        await page.mouse.up();
        await canvas.waitForReady();
    }

    // ============== TEXT ELEMENT DRAG ==============
    test('should move TEXT element when dragged', async ({ page }) => {
        await elementsPanel.addTextElement();
        await elementsPanel.selectElementByIndex(0);
        await setPosition(page, 100, 100);

        await dragAndWait(100, 100, 200, 150);

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

        // Grab slightly inside the element (5 dots from corner) to ensure hitbox hit
        await dragAndWait(105, 105, 200, 160);

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

        await dragAndWait(50, 50, 160, 130);

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
        await dragAndCancelWithEsc(page, 130, 120, 260, 180);

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
        await dragAndWait(105, 105, 200, 160);

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
        await setPosition(page, 40, 40);

        await dragAndWait(40, 40, 140, 110);

        await elementsPanel.selectElementByIndex(0);
        const newX = parseInt(await propertiesPanel.getProperty('prop-x'));
        const newY = parseInt(await propertiesPanel.getProperty('prop-y'));

        expect(newX).toBeGreaterThan(40);
        expect(newY).toBeGreaterThan(40);
    });

    // ============== LINE ELEMENT DRAG ==============
    test('should move LINE element when dragged', async ({ page }) => {
        await elementsPanel.addLineElement();
        await elementsPanel.selectElementByIndex(0);
        await setPosition(page, 100, 100);

        // Increase thickness to 30 dots for a larger hitbox
        await page.locator('#prop-thickness').fill('30');
        await page.locator('#prop-thickness').dispatchEvent('input');
        await canvas.waitForReady();

        // Deselect the element by clicking empty canvas area near the bottom-right.
        // When an element is selected, resize handles are checked first on mousedown, which
        // can intercept the drag. Deselecting first avoids this.
        const box = await canvas.getBoundingBox();
        if (box) {
            await page.mouse.click(box.x + box.width - 20, box.y + box.height - 20);
        }
        await page.waitForTimeout(150);

        // LINE at (100,100), width=200, height=30 (thickness).
        // Grab at CSS pixel y=100. The canvas is CSS-scaled (~0.88), so
        // label coord y ≈ 100/0.88 ≈ 114, safely inside the 30-dot LINE body [100,130].
        await dragAndWait(150, 100, 250, 200);

        // Verify the ZPL position changed
        const zpl = await zplOutput.getZPLCode();
        expect(zpl).not.toContain('^FO100,100');
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
        await dragAndWait(100, 100, 750, 100);

        await elementsPanel.selectElementByIndex(0);
        const newX = parseInt(await propertiesPanel.getProperty('prop-x'));

        // Element should have moved significantly to the right
        expect(newX).toBeGreaterThan(100);

        // Verify ZPL reflects a large X position
        const zpl = await zplOutput.getZPLCode();
        expect(zpl).toMatch(/\^FO\d{3,},/);
    });
});
