import { test, expect } from '../fixtures';
import { Canvas, ElementsPanel } from '../page-objects';

async function dispatchCanvasTouch(
    canvas: Canvas,
    type: 'touchstart' | 'touchmove' | 'touchend',
    labelX: number,
    labelY: number
): Promise<void> {
    const box = await canvas.getBoundingBox();
    if (!box) throw new Error('Canvas not found');
    const scale = await canvas.getScale();
    const clientX = box.x + labelX * scale;
    const clientY = box.y + labelY * scale;

    await canvas.canvas.evaluate((el, { type, clientX, clientY }) => {
        const touch = { identifier: 1, target: el, clientX, clientY };
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperties(event, {
            touches: { value: type === 'touchend' ? [] : [touch] },
            targetTouches: { value: type === 'touchend' ? [] : [touch] },
            changedTouches: { value: [touch] },
        });
        el.dispatchEvent(event);
    }, { type, clientX, clientY });
}

async function touchDragCanvas(canvas: Canvas, fromX: number, fromY: number, toX: number, toY: number): Promise<void> {
    await dispatchCanvasTouch(canvas, 'touchstart', fromX, fromY);
    await dispatchCanvasTouch(canvas, 'touchmove', toX, toY);
    await dispatchCanvasTouch(canvas, 'touchend', toX, toY);
}

test.describe('Mobile touch canvas interactions', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
    });

    test('should select an element with a tap', async ({ page }) => {
        await page.goto('/');
        const elementsPanel = new ElementsPanel(page);
        const canvas = new Canvas(page);

        await elementsPanel.addBoxElement();
        await canvas.clickAtLabelCoords(600, 300);
        expect(await canvas.getSelectionCount()).toBe(0);

        await dispatchCanvasTouch(canvas, 'touchstart', 100, 75);
        await dispatchCanvasTouch(canvas, 'touchend', 100, 75);

        expect(await canvas.getSelectionCount()).toBe(1);
    });

    test('should drag an element with touch events', async ({ page }) => {
        await page.goto('/');
        const elementsPanel = new ElementsPanel(page);
        const canvas = new Canvas(page);

        await elementsPanel.addBoxElement();
        const before = await page.evaluate(() => {
            const el = (window as unknown as { appState: { elements: Array<{ x: number; y: number }> } }).appState.elements[0];
            return { x: el.x, y: el.y };
        });

        await touchDragCanvas(canvas, 75, 65, 155, 110);

        const after = await page.evaluate(() => {
            const el = (window as unknown as { appState: { elements: Array<{ x: number; y: number }> } }).appState.elements[0];
            return { x: el.x, y: el.y };
        });
        expect(after.x).toBeGreaterThan(before.x);
        expect(after.y).toBeGreaterThan(before.y);
    });

    test('should resize an element with touch events', async ({ page }) => {
        await page.goto('/');
        const elementsPanel = new ElementsPanel(page);
        const canvas = new Canvas(page);

        await elementsPanel.addBoxElement();
        const before = await page.evaluate(() => {
            const el = (window as unknown as { appState: { elements: Array<{ width: number; height: number }> } }).appState.elements[0];
            return { width: el.width, height: el.height };
        });

        await touchDragCanvas(canvas, 150, 100, 190, 130);

        const after = await page.evaluate(() => {
            const el = (window as unknown as { appState: { elements: Array<{ width: number; height: number }> } }).appState.elements[0];
            return { width: el.width, height: el.height };
        });
        expect(after.width).toBeGreaterThan(before.width);
        expect(after.height).toBeGreaterThan(before.height);
    });
});
