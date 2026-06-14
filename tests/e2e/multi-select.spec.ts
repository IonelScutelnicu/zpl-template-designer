import { test, expect } from '../fixtures';
import { ElementsPanel, PropertiesPanel, Canvas } from '../page-objects';
import type { Page } from '@playwright/test';

/**
 * Multi-select: shift-click toggle, marquee drag-select (touch semantics,
 * locked-skip), Ctrl+A, group move/delete as single undo entries, and
 * element-to-element align/distribute. Uses BOX elements (simple rectangular
 * bounds) so canvas hit-testing is deterministic. Runs with ?e2e=1 to read
 * selection/history state off window.appState.
 */
test.describe('Multi-select', () => {
    let elementsPanel: ElementsPanel;
    let propertiesPanel: PropertiesPanel;
    let canvas: Canvas;

    test.beforeEach(async ({ page }) => {
        await page.goto('/?e2e=1');
        elementsPanel = new ElementsPanel(page);
        propertiesPanel = new PropertiesPanel(page);
        canvas = new Canvas(page);
        await canvas.waitForReady();
    });

    // Add a BOX and position it deterministically at (x, y) in label dots.
    async function addBoxAt(page: Page, x: number, y: number): Promise<void> {
        await elementsPanel.addBoxElement();
        await page.evaluate(({ x, y }) => {
            const w = window as unknown as {
                appState: { elements: Array<{ x: number; y: number }>; labelSettings: unknown; getSelectedElements: () => unknown[] };
                canvasRenderer: { renderCanvas: (e: unknown[], l: unknown, s: unknown) => void };
            };
            const els = w.appState.elements;
            const el = els[els.length - 1];
            el.x = x; el.y = y;
            w.canvasRenderer.renderCanvas(els, w.appState.labelSettings, w.appState.getSelectedElements());
        }, { x, y });
        await canvas.waitForReady();
    }

    async function setLocked(page: Page, index: number, locked: boolean): Promise<void> {
        await page.evaluate(({ index, locked }) => {
            (window as unknown as { appState: { elements: Array<{ locked: boolean }> } }).appState.elements[index].locked = locked;
        }, { index, locked });
    }

    async function getXs(page: Page): Promise<number[]> {
        return await page.evaluate(() =>
            (window as unknown as { appState: { elements: Array<{ x: number }> } }).appState.elements.map(e => e.x));
    }

    test('shift+click toggles elements in and out of the selection', async ({ page }) => {
        await addBoxAt(page, 50, 50);    // box 0 → center (100, 75)
        await addBoxAt(page, 300, 50);   // box 1 → center (350, 75)

        // Plain click selects one.
        await canvas.clickAtLabelCoords(100, 75);
        expect(await canvas.getSelectionCount()).toBe(1);

        // Shift+click the second adds it.
        await canvas.shiftClickAtLabelCoords(350, 75);
        expect(await canvas.getSelectionCount()).toBe(2);

        // Shift+click the second again removes it.
        await canvas.shiftClickAtLabelCoords(350, 75);
        expect(await canvas.getSelectionCount()).toBe(1);

        // Clicking empty canvas clears.
        await canvas.clickAtLabelCoords(600, 300);
        expect(await canvas.getSelectionCount()).toBe(0);
    });

    test('Ctrl+A selects every element', async ({ page }) => {
        await addBoxAt(page, 50, 50);
        await addBoxAt(page, 300, 50);
        await addBoxAt(page, 50, 200);

        await canvas.selectAll();
        expect(await canvas.getSelectionCount()).toBe(3);
    });

    test('marquee selects touched elements and skips locked ones', async ({ page }) => {
        await addBoxAt(page, 50, 50);    // box 0
        await addBoxAt(page, 300, 50);   // box 1
        await addBoxAt(page, 50, 200);   // box 2 (will be locked)
        await setLocked(page, 2, true);

        // Drag a rectangle from empty top-left over all three boxes.
        await canvas.marqueeDrag(5, 5, 460, 300);
        await canvas.waitForReady();

        // Only the two unlocked boxes are selected.
        expect(await canvas.getSelectionCount()).toBe(2);
    });

    test('marquee keeps tracking past the canvas edge and finalizes on release outside', async ({ page }) => {
        await addBoxAt(page, 50, 50);    // box 0
        await addBoxAt(page, 300, 50);   // box 1

        const box = await canvas.getBoundingBox();
        if (!box) throw new Error('no canvas');

        // Start a marquee on empty canvas, drag past the right/bottom edge, and
        // release the button OUTSIDE the canvas entirely.
        await page.mouse.move(box.x + 5, box.y + 5);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width - 10, box.y + box.height - 10, { steps: 5 });
        await page.mouse.move(box.x + box.width + 150, box.y + box.height + 150, { steps: 5 });

        // Still selecting while off-canvas (operation did not break).
        expect(await canvas.getSelectionCount()).toBe(2);

        await page.mouse.up(); // released off-canvas
        await canvas.waitForReady();

        // Selection finalized; marquee no longer active.
        expect(await canvas.getSelectionCount()).toBe(2);
        const stuck = await page.evaluate(() =>
            (window as unknown as { interactionHandler: { isMarquee: boolean } }).interactionHandler.isMarquee);
        expect(stuck).toBe(false);
    });

    test('shift+marquee adds to the existing selection', async ({ page }) => {
        await addBoxAt(page, 50, 50);    // box 0 → center (100,75)
        await addBoxAt(page, 500, 200);  // box 1

        await canvas.clickAtLabelCoords(100, 75);
        expect(await canvas.getSelectionCount()).toBe(1);

        // Additive marquee around the second box keeps the first selected.
        await canvas.marqueeDrag(440, 150, 640, 290, true);
        await canvas.waitForReady();
        expect(await canvas.getSelectionCount()).toBe(2);
    });

    test('group drag moves all selected elements together as one undo entry', async ({ page }) => {
        // Use default-position boxes so the pre-move state is itself a history
        // checkpoint (manual evaluate-positioning would not record history, so a
        // single undo could revert past it).
        await elementsPanel.addBoxElement();
        await elementsPanel.addBoxElement();
        await canvas.waitForReady();

        await canvas.selectAll();
        expect(await canvas.getSelectionCount()).toBe(2);

        const before = await getXs(page);
        const historyBefore = await canvas.getHistoryCount();

        // Both boxes spawn at (50,50); drag from their shared center (100,75).
        await canvas.dragLabelCoords(100, 75, 180, 120);
        await canvas.waitForReady();

        const after = await getXs(page);
        // Both boxes shifted by the same positive delta.
        const d0 = after[0] - before[0];
        const d1 = after[1] - before[1];
        expect(d0).toBeGreaterThan(0);
        expect(d1).toBe(d0);

        // Exactly one new history entry for the whole group move.
        expect(await canvas.getHistoryCount()).toBe(historyBefore + 1);

        // One undo restores both.
        await page.keyboard.press('Control+z');
        await canvas.waitForReady();
        const restored = await getXs(page);
        expect(restored[0]).toBe(before[0]);
        expect(restored[1]).toBe(before[1]);
    });

    test('group delete removes all selected and restores them in one undo', async ({ page }) => {
        await addBoxAt(page, 50, 50);
        await addBoxAt(page, 300, 50);
        await addBoxAt(page, 50, 200);

        await canvas.selectAll();
        const historyBefore = await canvas.getHistoryCount();

        await page.keyboard.press('Delete');
        await canvas.waitForReady();
        expect(await elementsPanel.getElementCount()).toBe(0);
        expect(await canvas.getHistoryCount()).toBe(historyBefore + 1);

        await page.keyboard.press('Control+z');
        await canvas.waitForReady();
        expect(await elementsPanel.getElementCount()).toBe(3);
    });

    test('align-left aligns all selected to the leftmost edge', async ({ page }) => {
        await addBoxAt(page, 50, 50);
        await addBoxAt(page, 300, 80);
        await addBoxAt(page, 120, 200);

        await canvas.selectAll();
        // Trigger group align via the properties summary panel.
        await page.locator('[data-group-align="left"]').click();
        await canvas.waitForReady();

        const xs = await getXs(page);
        expect(xs[0]).toBe(50);
        expect(xs[1]).toBe(50);
        expect(xs[2]).toBe(50);
    });

    test('center-x on label centers the group as a unit, preserving relative offsets', async ({ page }) => {
        // Default label is 800 dots wide; boxes are 100 dots wide.
        await addBoxAt(page, 50, 50);    // box 0
        await addBoxAt(page, 300, 80);   // box 1 (offset +250 in x)

        await canvas.selectAll();
        await page.locator('[data-group-align-label="center-x"]').click();
        await canvas.waitForReady();

        const xs = await getXs(page);
        // Relative offset is preserved.
        expect(xs[1] - xs[0]).toBe(250);
        // Group bounding box (50..400 → width 350) is centered on the 800-dot label.
        const minX = Math.min(xs[0], xs[1]);
        const maxX = Math.max(xs[0], xs[1]) + 100;
        expect((minX + maxX) / 2).toBe(400);
    });

    test('properties summary shows count and group actions, hides per-field editing', async ({ page }) => {
        await addBoxAt(page, 50, 50);
        await addBoxAt(page, 300, 50);

        await canvas.selectAll();

        // Summary header + no single-element X field.
        await expect(page.locator('#properties-panel')).toContainText('2 elements selected');
        expect(await page.locator('#properties-panel #prop-x').count()).toBe(0);

        // Distribute is disabled with only 2 elements.
        await expect(page.locator('[data-group-distribute="horizontal"]')).toBeDisabled();

        // A third element enables distribute.
        await addBoxAt(page, 50, 200);
        await canvas.selectAll();
        await expect(page.locator('#properties-panel')).toContainText('3 elements selected');
        await expect(page.locator('[data-group-distribute="horizontal"]')).toBeEnabled();
    });
});
