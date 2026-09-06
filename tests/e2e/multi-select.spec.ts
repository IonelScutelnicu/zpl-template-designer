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

    async function getYs(page: Page): Promise<number[]> {
        return await page.evaluate(() =>
            (window as unknown as { appState: { elements: Array<{ y: number }> } }).appState.elements.map(e => e.y));
    }

    async function getWidths(page: Page): Promise<number[]> {
        return await page.evaluate(() =>
            (window as unknown as { appState: { elements: Array<{ width: number }> } }).appState.elements.map(e => e.width));
    }

    // Set a BOX's width/height directly and re-render.
    async function setSize(page: Page, index: number, width: number, height: number): Promise<void> {
        await page.evaluate(({ index, width, height }) => {
            const w = window as unknown as {
                appState: { elements: Array<{ width: number; height: number }>; labelSettings: unknown; getSelectedElements: () => unknown[] };
                canvasRenderer: { renderCanvas: (e: unknown[], l: unknown, s: unknown) => void };
            };
            w.appState.elements[index].width = width;
            w.appState.elements[index].height = height;
            w.canvasRenderer.renderCanvas(w.appState.elements, w.appState.labelSettings, w.appState.getSelectedElements());
        }, { index, width, height });
        await canvas.waitForReady();
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

    // ===== Marquee from the workspace (outside the canvas) =====

    test('marquee started in the workspace selects touched elements and skips locked ones', async ({ page }) => {
        await addBoxAt(page, 50, 50);    // box 0
        await addBoxAt(page, 300, 50);   // box 1
        await addBoxAt(page, 50, 200);   // box 2 (will be locked)
        await setLocked(page, 2, true);

        // Press in the grey area above-left of the label, drag over all three boxes.
        await canvas.marqueeDragFromWorkspace(5, 5, 460, 300);
        await canvas.waitForReady();

        expect(await canvas.getSelectionCount()).toBe(2);
    });

    test('shift+marquee from the workspace adds to the existing selection', async ({ page }) => {
        await addBoxAt(page, 50, 50);    // box 0 → center (100,75)
        await addBoxAt(page, 500, 200);  // box 1

        await canvas.clickAtLabelCoords(550, 225); // box 1's centre
        expect(await canvas.getSelectionCount()).toBe(1);

        // Additive marquee from the workspace over the first box keeps the second.
        await canvas.marqueeDragFromWorkspace(5, 5, 150, 120, true);
        await canvas.waitForReady();
        expect(await canvas.getSelectionCount()).toBe(2);
    });

    test('the marquee band spans the workspace and is hidden on release', async ({ page }) => {
        await addBoxAt(page, 50, 50);

        const canvasBox = await canvas.getBoundingBox();
        if (!canvasBox) throw new Error('no canvas');
        const workspaceBox = await page.locator('#preview-container').boundingBox();
        if (!workspaceBox) throw new Error('no workspace');

        expect(await canvas.isMarqueeOverlayVisible()).toBe(false);

        await page.mouse.move(workspaceBox.x + 5, workspaceBox.y + 5);
        await page.mouse.down();
        await page.mouse.move(canvasBox.x + 200, canvasBox.y + 150, { steps: 10 });

        // The band is drawn in screen space: it starts where the press happened,
        // left of and above the canvas, rather than being clipped to the label.
        expect(await canvas.isMarqueeOverlayVisible()).toBe(true);
        const band = await canvas.getMarqueeOverlayBox();
        if (!band) throw new Error('no band');
        expect(Math.abs(band.x - (workspaceBox.x + 5))).toBeLessThanOrEqual(1);
        expect(Math.abs(band.y - (workspaceBox.y + 5))).toBeLessThanOrEqual(1);
        expect(band.x).toBeLessThan(canvasBox.x);
        expect(Math.abs(band.x + band.width - (canvasBox.x + 200))).toBeLessThanOrEqual(1);

        await page.mouse.up();
        await canvas.waitForReady();

        expect(await canvas.isMarqueeOverlayVisible()).toBe(false);
        expect(await canvas.getSelectionCount()).toBe(1);
    });

    test('Escape cancels a workspace marquee and hides the band', async ({ page }) => {
        await addBoxAt(page, 50, 50);

        const canvasBox = await canvas.getBoundingBox();
        if (!canvasBox) throw new Error('no canvas');
        const workspaceBox = await page.locator('#preview-container').boundingBox();
        if (!workspaceBox) throw new Error('no workspace');

        await page.mouse.move(workspaceBox.x + 5, workspaceBox.y + 5);
        await page.mouse.down();
        await page.mouse.move(canvasBox.x + 200, canvasBox.y + 150, { steps: 5 });
        expect(await canvas.isMarqueeOverlayVisible()).toBe(true);

        await page.keyboard.press('Escape');
        expect(await canvas.isMarqueeOverlayVisible()).toBe(false);
        expect(await page.evaluate(() =>
            (window as unknown as { interactionHandler: { isMarquee: boolean } }).interactionHandler.isMarquee)).toBe(false);

        await page.mouse.up(); // release after the cancel changes nothing
        expect(await canvas.isMarqueeOverlayVisible()).toBe(false);
    });

    test('a plain click in the workspace clears the selection', async ({ page }) => {
        await addBoxAt(page, 50, 50);
        await canvas.clickAtLabelCoords(100, 75);
        expect(await canvas.getSelectionCount()).toBe(1);

        const workspaceBox = await page.locator('#preview-container').boundingBox();
        if (!workspaceBox) throw new Error('no workspace');
        await page.mouse.click(workspaceBox.x + 5, workspaceBox.y + 5);
        await canvas.waitForReady();

        expect(await canvas.getSelectionCount()).toBe(0);
        expect(await canvas.isMarqueeOverlayVisible()).toBe(false);
    });

    test('space+drag in the workspace pans instead of starting a marquee', async ({ page }) => {
        await addBoxAt(page, 50, 50);
        await canvas.clickAtLabelCoords(100, 75);
        expect(await canvas.getSelectionCount()).toBe(1);

        const before = await canvas.getBoundingBox();
        const workspaceBox = await page.locator('#preview-container').boundingBox();
        if (!before || !workspaceBox) throw new Error('no geometry');

        await page.keyboard.down('Space');
        await page.mouse.move(workspaceBox.x + 5, workspaceBox.y + 5);
        await page.mouse.down();
        await page.mouse.move(workspaceBox.x + 60, workspaceBox.y + 40, { steps: 5 });
        expect(await canvas.isMarqueeOverlayVisible()).toBe(false);
        await page.mouse.up();
        await page.keyboard.up('Space');

        // The label moved with the pan and the selection is untouched.
        const after = await canvas.getBoundingBox();
        if (!after) throw new Error('no canvas');
        expect(after.x - before.x).toBeCloseTo(55, 0);
        expect(after.y - before.y).toBeCloseTo(35, 0);
        expect(await canvas.getSelectionCount()).toBe(1);
    });

    test('pressing a floating control in the workspace does not start a marquee', async ({ page }) => {
        await addBoxAt(page, 50, 50);
        await canvas.clickAtLabelCoords(100, 75);

        // The zoom island sits inside the workspace; it must stay clickable.
        await page.locator('#zoom-level-btn').click();
        expect(await canvas.isMarqueeOverlayVisible()).toBe(false);
        await expect(page.locator('#zoom-presets-menu')).toBeVisible();
        expect(await canvas.getSelectionCount()).toBe(1);
    });

    test('a workspace drag does not start a marquee in api preview mode', async ({ page }) => {
        await addBoxAt(page, 50, 50);
        await addBoxAt(page, 300, 50); // adding selects it → selection of 1

        const canvasBox = await canvas.getBoundingBox();
        if (!canvasBox) throw new Error('no canvas');

        await page.route('**/api.labelary.com/**', route => route.abort());

        // The canvas is hidden in api mode, so there is nothing to select on.
        await page.locator('#mode-api-btn').click();
        await expect(page.locator('#label-canvas')).toBeHidden();

        const workspaceBox = await page.locator('#preview-container').boundingBox();
        if (!workspaceBox) throw new Error('no workspace');
        await page.mouse.move(workspaceBox.x + 5, workspaceBox.y + 5);
        await page.mouse.down();
        await page.mouse.move(canvasBox.x + 400, canvasBox.y + 300, { steps: 5 });
        expect(await canvas.isMarqueeOverlayVisible()).toBe(false);
        await page.mouse.up();

        // A marquee that had started would have cleared the selection on press.
        expect(await canvas.getSelectionCount()).toBe(1);
        expect(await page.evaluate(() =>
            (window as unknown as { interactionHandler: { isMarquee: boolean } }).interactionHandler.isMarquee)).toBe(false);
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

    test('align to label right edge pins the group to the right, preserving offsets', async ({ page }) => {
        await addBoxAt(page, 50, 50);    // box 0
        await addBoxAt(page, 300, 80);   // box 1 (offset +250 in x)

        await canvas.selectAll();
        await page.locator('[data-group-align-label="right"]').click();
        await canvas.waitForReady();

        const labelWidthDots = await page.evaluate(() =>
            (window as unknown as { canvasRenderer: { labelWidthDots: number } }).canvasRenderer.labelWidthDots);
        const xs = await getXs(page);
        expect(xs[1] - xs[0]).toBe(250);                       // relative offset preserved
        expect(Math.max(...xs) + 100).toBe(labelWidthDots);    // group's right edge at the label width
    });

    test('align to label top edge pins the group to the top, preserving offsets', async ({ page }) => {
        await addBoxAt(page, 50, 80);    // box 0
        await addBoxAt(page, 300, 200);  // box 1 (offset +120 in y)

        await canvas.selectAll();
        await page.locator('[data-group-align-label="top"]').click();
        await canvas.waitForReady();

        const ys = await getYs(page);
        expect(Math.min(...ys)).toBe(0);   // group's top edge at y=0
        expect(ys[1] - ys[0]).toBe(120);   // relative offset preserved
    });

    test('match width resizes resizable elements to the largest, leaving positions unchanged', async ({ page }) => {
        await addBoxAt(page, 50, 50);
        await addBoxAt(page, 300, 50);
        await setSize(page, 0, 80, 50);
        await setSize(page, 1, 150, 60);

        await canvas.selectAll();
        const xsBefore = await getXs(page);
        await page.locator('[data-group-match="width"]').click();
        await canvas.waitForReady();

        const widths = await getWidths(page);
        expect(widths[0]).toBe(150);
        expect(widths[1]).toBe(150);
        // Positions are untouched (resize in place).
        expect(await getXs(page)).toEqual(xsBefore);
    });

    test('match size is disabled with fewer than 2 resizable elements', async ({ page }) => {
        await addBoxAt(page, 50, 50);          // resizable
        await elementsPanel.addTextElement();  // auto-sized → not resizable

        await canvas.selectAll();
        await expect(page.locator('#properties-panel')).toContainText('2 elements selected');
        await expect(page.locator('[data-group-match="width"]')).toBeDisabled();
    });

    test('match size skips locked elements', async ({ page }) => {
        await addBoxAt(page, 50, 50);
        await addBoxAt(page, 300, 50);
        await addBoxAt(page, 50, 200);
        await setSize(page, 0, 80, 50);
        await setSize(page, 1, 150, 50);
        await setSize(page, 2, 60, 50);
        await setLocked(page, 2, true); // locked box must not be resized

        await canvas.selectAll();
        await page.locator('[data-group-match="width"]').click();
        await canvas.waitForReady();

        const widths = await getWidths(page);
        expect(widths[0]).toBe(150);
        expect(widths[1]).toBe(150);
        expect(widths[2]).toBe(60); // locked box unchanged
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
