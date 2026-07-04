import { test, expect } from '../fixtures';
import { Canvas, ElementsPanel } from '../page-objects';

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

        await canvas.touchTapAtLabelCoords(100, 75);

        expect(await canvas.getSelectionCount()).toBe(1);
    });

    test('should drag an element with touch events', async ({ page }) => {
        await page.goto('/');
        const elementsPanel = new ElementsPanel(page);
        const canvas = new Canvas(page);

        await elementsPanel.addBoxElement();
        const before = await canvas.getElementGeometry();

        await canvas.touchDragLabelCoords(75, 65, 155, 110);

        const after = await canvas.getElementGeometry();
        expect(after.x).toBeGreaterThan(before.x);
        expect(after.y).toBeGreaterThan(before.y);
    });

    test('should resize an element with touch events', async ({ page }) => {
        await page.goto('/');
        const elementsPanel = new ElementsPanel(page);
        const canvas = new Canvas(page);

        await elementsPanel.addBoxElement();
        const before = await canvas.getElementGeometry();

        // Grab the bottom-right resize handle at the element's actual corner.
        const cornerX = before.x + before.width;
        const cornerY = before.y + before.height;
        await canvas.touchDragLabelCoords(cornerX, cornerY, cornerX + 40, cornerY + 30);

        const after = await canvas.getElementGeometry();
        expect(after.width).toBeGreaterThan(before.width);
        expect(after.height).toBeGreaterThan(before.height);
    });

    test('should restore element position when a touch drag is cancelled', async ({ page }) => {
        await page.goto('/');
        const elementsPanel = new ElementsPanel(page);
        const canvas = new Canvas(page);

        await elementsPanel.addBoxElement();
        const before = await canvas.getElementGeometry();

        await canvas.touchDragLabelCoords(75, 65, 155, 110, true);

        const after = await canvas.getElementGeometry();
        expect(after.x).toBe(before.x);
        expect(after.y).toBe(before.y);

        // The cancelled gesture must fully release touch tracking: a fresh
        // tap still selects.
        await canvas.touchTapAtLabelCoords(100, 75);
        expect(await canvas.getSelectionCount()).toBe(1);
    });
});
