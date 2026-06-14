import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for the Canvas.
 * Handles element selection, drag-and-drop, resizing, and screenshots.
 */
export class Canvas {
    readonly page: Page;
    readonly canvas: Locator;

    constructor(page: Page) {
        this.page = page;
        this.canvas = page.locator('#label-canvas');
    }

    /**
     * Wait for the canvas to be visible and ready
     */
    async waitForReady(): Promise<void> {
        await this.canvas.waitFor({ state: 'visible' });
        // Wait a bit for rendering to complete
        await this.page.waitForTimeout(100);
    }

    /**
     * Scroll the page to the top so the canvas sits at its stable position
     * below the sticky header. The editor is a normally-scrolling page; when the
     * side panels are tall, Playwright's auto-scroll on panel interactions can
     * leave the canvas partly (or fully) under the header. Pointer math here is
     * boundingBox()-relative, so a scrolled canvas makes drag/resize coordinates
     * land off-target. Resetting scroll before reading canvas geometry keeps
     * those coordinates accurate.
     */
    private async resetScroll(): Promise<void> {
        await this.page.evaluate(() => window.scrollTo(0, 0));
    }

    /**
     * Get the canvas bounding box
     */
    async getBoundingBox(): Promise<{ x: number; y: number; width: number; height: number } | null> {
        await this.resetScroll();
        return await this.canvas.boundingBox();
    }

    /**
     * Click at a specific position on the canvas (relative to canvas origin)
     */
    async clickAt(x: number, y: number): Promise<void> {
        await this.canvas.click({ position: { x, y } });
    }

    /**
     * Select an element by clicking at its approximate position
     * Note: This requires knowing where the element is rendered on the canvas
     */
    async selectElementAtPosition(x: number, y: number): Promise<void> {
        await this.clickAt(x, y);
    }

    /**
     * Drag from one position to another on the canvas
     */
    async drag(fromX: number, fromY: number, toX: number, toY: number): Promise<void> {
        const box = await this.getBoundingBox();
        if (!box) throw new Error('Canvas not found');

        await this.page.mouse.move(box.x + fromX, box.y + fromY);
        await this.page.mouse.down();
        await this.page.mouse.move(box.x + toX, box.y + toY, { steps: 10 });
        await this.page.mouse.up();
    }

    /**
     * Drag an element by a delta amount
     */
    async dragElement(elementX: number, elementY: number, deltaX: number, deltaY: number): Promise<void> {
        await this.drag(elementX, elementY, elementX + deltaX, elementY + deltaY);
    }

    /**
     * Move the selected element using arrow keys
     */
    async moveSelectedWithArrowKeys(direction: 'up' | 'down' | 'left' | 'right', times: number = 1): Promise<void> {
        const keyMap = {
            up: 'ArrowUp',
            down: 'ArrowDown',
            left: 'ArrowLeft',
            right: 'ArrowRight'
        };

        for (let i = 0; i < times; i++) {
            await this.page.keyboard.press(keyMap[direction]);
        }
    }

    /**
     * Delete the selected element using keyboard
     */
    async deleteSelected(): Promise<void> {
        await this.page.keyboard.press('Delete');
    }

    /**
     * Clear any active canvas selection so screenshots don't include
     * the selection indicator. Requires window.appState and window.canvasRenderer
     * (exposed in tests via window.__E2E__).
     */
    async deselect(): Promise<void> {
        await this.page.evaluate(() => {
            const w = window as unknown as {
                appState?: { selectedElement: unknown; setSelectedElement: (v: null) => void; elements: unknown[]; labelSettings: unknown };
                canvasRenderer?: { renderCanvas: (els: unknown[], ls: unknown, sel: unknown) => void };
            };
            if (!w.appState || !w.canvasRenderer) return;
            if (w.appState.selectedElement) w.appState.setSelectedElement(null);
            w.canvasRenderer.renderCanvas(w.appState.elements, w.appState.labelSettings, null);
        });
    }

    /**
     * Take a screenshot of the canvas only (CSS display size — scaled to fit editor)
     */
    async takeScreenshot(): Promise<Buffer> {
        await this.deselect();
        // Reset scroll so the sticky header doesn't occlude the canvas top in the
        // captured image (which would hide content near y=0 and make distinct
        // states compare equal). See resetScroll() for context.
        await this.resetScroll();
        return await this.canvas.screenshot();
    }

    /**
     * Read the canvas pixel data at full label resolution (1px = 1 dot).
     * Uses canvas.toDataURL() so the result is not affected by CSS scaling.
     */
    async takeFullResolutionScreenshot(): Promise<Buffer> {
        await this.deselect();
        const dataUrl = await this.page.evaluate(() => {
            const canvas = document.getElementById('label-canvas') as HTMLCanvasElement;
            return canvas.toDataURL('image/png');
        });
        return Buffer.from(dataUrl.split(',')[1], 'base64');
    }

    /**
     * Take a screenshot and save to a file
     */
    async takeScreenshotToFile(path: string): Promise<void> {
        await this.deselect();
        await this.canvas.screenshot({ path });
    }

    /**
     * Get the canvas dimensions
     */
    async getDimensions(): Promise<{ width: number; height: number }> {
        const box = await this.getBoundingBox();
        if (!box) throw new Error('Canvas not found');
        return { width: box.width, height: box.height };
    }

    /**
     * Check if the canvas is visible
     */
    async isVisible(): Promise<boolean> {
        return await this.canvas.isVisible();
    }

    /**
     * Get canvas pixel data at a specific point (for advanced testing)
     * Note: This evaluates JavaScript in the browser context
     */
    async getPixelColor(x: number, y: number): Promise<{ r: number; g: number; b: number; a: number }> {
        return await this.page.evaluate(({ x, y }) => {
            const canvas = document.getElementById('label-canvas') as HTMLCanvasElement;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Could not get canvas context');
            const imageData = ctx.getImageData(x, y, 1, 1);
            return {
                r: imageData.data[0],
                g: imageData.data[1],
                b: imageData.data[2],
                a: imageData.data[3]
            };
        }, { x, y });
    }

    /**
     * Get the current canvas scale factor from the renderer.
     * Note: the canvas internal rendering scale is always 1 (1 dot = 1 pixel).
     * The CSS display scale may differ, but this returns the rendering scale.
     */
    async getScale(): Promise<number> {
        return await this.page.evaluate(() => {
            // @ts-ignore - canvasRenderer is global
            return window.canvasRenderer ? window.canvasRenderer.scale : 1;
        });
    }

    /**
     * Click at a specific position using label coordinates (dots)
     * Handles scaling automatically
     */
    async clickAtLabelCoords(labelX: number, labelY: number): Promise<void> {
        const scale = await this.getScale();
        // Convert label coords (dots) to canvas pixels
        // Add a small offset (1px) to ensure we're inside if on border
        const pixelX = labelX * scale;
        const pixelY = labelY * scale;
        await this.clickAt(pixelX, pixelY);
    }

    /**
     * Right-click at a specific position on the canvas (relative to canvas origin)
     */
    async rightClickAt(x: number, y: number): Promise<void> {
        await this.canvas.click({ position: { x, y }, button: 'right' });
    }

    // ===== Multi-select helpers (require ?e2e=1 for selection introspection) =====

    /** Shift+Click at label coordinates (toggles selection membership). */
    async shiftClickAtLabelCoords(labelX: number, labelY: number): Promise<void> {
        const scale = await this.getScale();
        await this.canvas.click({ position: { x: labelX * scale, y: labelY * scale }, modifiers: ['Shift'] });
    }

    /**
     * Drag a marquee rectangle (label coords) over empty canvas. Pass
     * additive=true to hold Shift and add to the existing selection.
     */
    async marqueeDrag(fromX: number, fromY: number, toX: number, toY: number, additive = false): Promise<void> {
        const box = await this.getBoundingBox();
        if (!box) throw new Error('Canvas not found');
        const scale = await this.getScale();
        if (additive) await this.page.keyboard.down('Shift');
        await this.page.mouse.move(box.x + fromX * scale, box.y + fromY * scale);
        await this.page.mouse.down();
        await this.page.mouse.move(box.x + toX * scale, box.y + toY * scale, { steps: 10 });
        await this.page.mouse.up();
        if (additive) await this.page.keyboard.up('Shift');
    }

    /** Select all elements via Ctrl+A. */
    async selectAll(): Promise<void> {
        await this.page.keyboard.press('Control+a');
    }

    /** Number of currently selected elements (reads window.appState). */
    async getSelectionCount(): Promise<number> {
        return await this.page.evaluate(() =>
            (window as unknown as { appState: { selectionCount: number } }).appState.selectionCount);
    }

    /** Currently selected element ids (reads window.appState). */
    async getSelectionIds(): Promise<string[]> {
        return await this.page.evaluate(() =>
            [...(window as unknown as { appState: { selectedIds: string[] } }).appState.selectedIds]);
    }

    /** Number of undo/redo history entries (reads window.appState). */
    async getHistoryCount(): Promise<number> {
        return await this.page.evaluate(() =>
            (window as unknown as { appState: { getHistoryEntries: () => unknown[] } }).appState.getHistoryEntries().length);
    }

    /**
     * Drag using label coordinates
     */
    async dragLabelCoords(fromX: number, fromY: number, toLabelX: number, toLabelY: number): Promise<void> {
        const scale = await this.getScale();
        const startPixelX = fromX * scale;
        const startPixelY = fromY * scale;
        const endPixelX = toLabelX * scale;
        const endPixelY = toLabelY * scale;
        await this.drag(startPixelX, startPixelY, endPixelX, endPixelY);
    }
}
