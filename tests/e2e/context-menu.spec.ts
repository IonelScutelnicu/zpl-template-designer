import { test, expect } from '../fixtures';
import { ElementsPanel, PropertiesPanel, Canvas } from '../page-objects';

test.describe('Canvas Context Menu', () => {
    let elementsPanel: ElementsPanel;
    let propertiesPanel: PropertiesPanel;
    let canvas: Canvas;

    const menuSelector = '#canvas-context-menu';

    function menuItem(page: import('@playwright/test').Page, action: string) {
        return page.locator(`${menuSelector} button[data-action="${action}"]`);
    }

    async function loadApp(page: import('@playwright/test').Page, viewport?: { width: number; height: number }) {
        if (viewport) {
            await page.setViewportSize(viewport);
        }

        await page.goto('/?e2e=1');
        elementsPanel = new ElementsPanel(page);
        propertiesPanel = new PropertiesPanel(page);
        canvas = new Canvas(page);
        await canvas.waitForReady();
    }

    async function getBoundingBoxOrThrow(locator: import('@playwright/test').Locator, name: string) {
        const box = await locator.boundingBox();
        if (!box) {
            throw new Error(`${name} not found`);
        }
        return box;
    }

    test.beforeEach(async ({ page }) => {
        await loadApp(page);
    });

    async function getElementPosition(page: import('@playwright/test').Page, index: number) {
        return await page.evaluate((idx) => {
            // @ts-ignore
            const el = window.appState.elements[idx];
            return { x: el.x + 10, y: el.y + 10 };
        }, index);
    }

    async function setPosition(page: import('@playwright/test').Page, x: number, y: number) {
        await page.locator('#prop-x').fill(String(x));
        await page.locator('#prop-x').dispatchEvent('change');
        await page.locator('#prop-y').fill(String(y));
        await page.locator('#prop-y').dispatchEvent('change');
        await canvas.waitForReady();
    }

    // ============== EMPTY CANVAS ==============

    test('should show disabled paste-only menu on empty canvas right-click', async ({ page }) => {
        await canvas.rightClickAt(100, 100);
        const menu = page.locator(menuSelector);
        await expect(menu).toBeVisible();

        const items = menu.locator('button[role="menuitem"]');
        await expect(items).toHaveCount(1);
        await expect(menuItem(page, 'paste')).toBeDisabled();
    });

    // ============== ELEMENT CONTEXT MENU ==============

    test('should show full menu when right-clicking on element', async ({ page }) => {
        await elementsPanel.addBoxElement();
        await canvas.waitForReady();

        const position = await getElementPosition(page, 0);
        await canvas.rightClickAt(position.x, position.y);

        const menu = page.locator(menuSelector);
        await expect(menu).toBeVisible();

        // Verify all expected items exist
        await expect(menuItem(page, 'copy')).toBeVisible();
        await expect(menuItem(page, 'paste')).toBeVisible();
        await expect(menuItem(page, 'duplicate')).toBeVisible();
        await expect(menuItem(page, 'move-up')).toBeVisible();
        await expect(menuItem(page, 'move-down')).toBeVisible();
        await expect(menuItem(page, 'center-horizontally')).toBeVisible();
        await expect(menuItem(page, 'center-vertically')).toBeVisible();
        await expect(menuItem(page, 'match-label-width')).toBeVisible();
        await expect(menuItem(page, 'match-label-height')).toBeVisible();
        await expect(menuItem(page, 'lock')).toBeVisible();
        await expect(menuItem(page, 'delete')).toBeVisible();
    });

    test('should select element on right-click', async ({ page }) => {
        await elementsPanel.addBoxElement();
        await elementsPanel.selectElementByIndex(0);
        await setPosition(page, 100, 100);

        await elementsPanel.addTextElement();
        await elementsPanel.selectElementByIndex(1);
        await setPosition(page, 300, 300);
        await canvas.waitForReady();

        // Select first element via sidebar
        await elementsPanel.selectElementByIndex(0);

        // Right-click on second element
        await canvas.rightClickAt(310, 310);

        // Verify the second element is now selected
        const selectedId = await page.evaluate(() => {
            // @ts-ignore
            return String(window.appState.selectedElement?.id);
        });
        const secondId = await page.evaluate(() => {
            // @ts-ignore
            return String(window.appState.elements[1].id);
        });
        expect(selectedId).toBe(secondId);
    });

    // ============== MENU ACTIONS ==============

    test('should copy element and enable paste', async ({ page }) => {
        await elementsPanel.addBoxElement();
        await canvas.waitForReady();

        const position = await getElementPosition(page, 0);

        // Right-click and copy
        await canvas.rightClickAt(position.x, position.y);
        await menuItem(page, 'copy').click();

        // Right-click again - Paste should now be enabled
        await canvas.rightClickAt(position.x, position.y);
        await expect(menuItem(page, 'paste')).toBeEnabled();
    });

    test('should duplicate element via context menu', async ({ page }) => {
        await elementsPanel.addBoxElement();
        await canvas.waitForReady();
        expect(await elementsPanel.getElementCount()).toBe(1);

        const position = await getElementPosition(page, 0);

        await canvas.rightClickAt(position.x, position.y);
        await menuItem(page, 'duplicate').click();

        expect(await elementsPanel.getElementCount()).toBe(2);
    });

    test('should delete element via context menu', async ({ page }) => {
        await elementsPanel.addBoxElement();
        await canvas.waitForReady();
        expect(await elementsPanel.getElementCount()).toBe(1);

        const position = await getElementPosition(page, 0);

        await canvas.rightClickAt(position.x, position.y);
        await menuItem(page, 'delete').click();

        expect(await elementsPanel.getElementCount()).toBe(0);
    });

    test('should paste element on empty canvas after copying', async ({ page }) => {
        await elementsPanel.addBoxElement();
        await canvas.waitForReady();

        const position = await getElementPosition(page, 0);

        // Copy via context menu
        await canvas.rightClickAt(position.x, position.y);
        await menuItem(page, 'copy').click();

        // Right-click on empty area and paste
        await canvas.rightClickAt(5, 5);
        await menuItem(page, 'paste').click();

        expect(await elementsPanel.getElementCount()).toBe(2);
    });


    test('should paste element at the context-menu click position', async ({ page }) => {
        await elementsPanel.addBoxElement();
        await canvas.waitForReady();

        const position = await getElementPosition(page, 0);

        await canvas.rightClickAt(position.x, position.y);
        await menuItem(page, 'copy').click();

        await canvas.rightClickAt(200, 150);
        await menuItem(page, 'paste').click();

        const pastedPosition = await page.evaluate(() => {
            // @ts-ignore
            const elements = window.appState.elements;
            const pasted = elements[elements.length - 1];
            return { x: pasted.x, y: pasted.y };
        });

        expect(pastedPosition).toEqual({ x: 200, y: 150 });
    });

    test('should clamp pasted element inside the label bounds', async ({ page }) => {
        await elementsPanel.addBoxElement();
        await canvas.waitForReady();

        const position = await getElementPosition(page, 0);

        await canvas.rightClickAt(position.x, position.y);
        await menuItem(page, 'copy').click();

        const labelBounds = await page.evaluate(() => {
            // @ts-ignore
            return {
                width: window.appState.labelSettings.width * window.appState.labelSettings.dpmm,
                height: window.appState.labelSettings.height * window.appState.labelSettings.dpmm
            };
        });

        await canvas.rightClickAt(labelBounds.width - 5, labelBounds.height - 5);
        await menuItem(page, 'paste').click();

        const pasted = await page.evaluate(() => {
            // @ts-ignore
            const elements = window.appState.elements;
            const pasted = elements[elements.length - 1];
            // @ts-ignore
            const labelSettings = window.appState.labelSettings;
            return {
                x: pasted.x,
                y: pasted.y,
                width: pasted.width,
                height: pasted.height,
                labelWidth: labelSettings.width * labelSettings.dpmm,
                labelHeight: labelSettings.height * labelSettings.dpmm
            };
        });

        expect(pasted.x + pasted.width).toBeLessThanOrEqual(pasted.labelWidth);
        expect(pasted.y + pasted.height).toBeLessThanOrEqual(pasted.labelHeight);
        expect(pasted.x).toBe(pasted.labelWidth - pasted.width);
        expect(pasted.y).toBe(pasted.labelHeight - pasted.height);
    });
    // ============== LOCK/UNLOCK ==============

    test('should toggle lock via context menu', async ({ page }) => {
        await elementsPanel.addBoxElement();
        await canvas.waitForReady();

        const position = await getElementPosition(page, 0);

        // Lock via context menu
        await canvas.rightClickAt(position.x, position.y);
        await menuItem(page, 'lock').click();

        // Verify locked
        const isLocked = await page.evaluate(() => {
            // @ts-ignore
            return window.appState.elements[0].locked;
        });
        expect(isLocked).toBe(true);

        // Right-click again - should now say "Unlock"
        await canvas.rightClickAt(position.x, position.y);
        await expect(menuItem(page, 'unlock')).toBeVisible();
    });

    test('should disable actions for locked elements', async ({ page }) => {
        await elementsPanel.addBoxElement();
        await canvas.waitForReady();

        // Lock via appState
        await page.evaluate(() => {
            // @ts-ignore
            window.appState.elements[0].locked = true;
        });

        const position = await getElementPosition(page, 0);

        await canvas.rightClickAt(position.x, position.y);

        // Duplicate, move, alignment, match-size, and delete actions should be disabled
        await expect(menuItem(page, 'duplicate')).toBeDisabled();
        await expect(menuItem(page, 'move-up')).toBeDisabled();
        await expect(menuItem(page, 'move-down')).toBeDisabled();
        await expect(menuItem(page, 'center-horizontally')).toBeDisabled();
        await expect(menuItem(page, 'center-vertically')).toBeDisabled();
        await expect(menuItem(page, 'match-label-width')).toBeDisabled();
        await expect(menuItem(page, 'match-label-height')).toBeDisabled();
        await expect(menuItem(page, 'delete')).toBeDisabled();

        // Unlock should be enabled
        await expect(menuItem(page, 'unlock')).toBeEnabled();
        // Copy should still be enabled
        await expect(menuItem(page, 'copy')).toBeEnabled();
    });

    // ============== MOVE UP/DOWN ==============

    test('should move element order via context menu', async ({ page }) => {
        // Add two elements at different positions so we can target each one
        await elementsPanel.addBoxElement();
        await elementsPanel.selectElementByIndex(0);
        await setPosition(page, 50, 50);

        await elementsPanel.addTextElement();
        await elementsPanel.selectElementByIndex(1);
        await setPosition(page, 300, 300);
        await canvas.waitForReady();

        const idsBefore = await elementsPanel.getElementIds();

        // Right-click on first element (index 0) at position (50,50)
        await canvas.rightClickAt(60, 60);

        // Move Up should be disabled for first element
        await expect(menuItem(page, 'move-up')).toBeDisabled();

        // Move Down should be enabled
        await menuItem(page, 'move-down').click();

        const idsAfter = await elementsPanel.getElementIds();
        expect(idsAfter[0]).toBe(idsBefore[1]);
        expect(idsAfter[1]).toBe(idsBefore[0]);
    });

    // ============== CENTER ALIGNMENT ==============

    test('should center element horizontally via context menu', async ({ page }) => {
        await elementsPanel.addBoxElement();
        await elementsPanel.selectElementByIndex(0);
        await setPosition(page, 10, 50);
        await canvas.waitForReady();

        await canvas.rightClickAt(20, 60);
        await menuItem(page, 'center-horizontally').click();

        const newX = await page.evaluate(() => {
            // @ts-ignore
            return window.appState.elements[0].x;
        });
        // Element should have moved from x=10 to somewhere more centered
        expect(newX).not.toBe(10);
    });

    test('should match element width to the label via context menu', async ({ page }) => {
        await elementsPanel.addBoxElement();
        await elementsPanel.selectElementByIndex(0);
        await setPosition(page, 40, 60);
        await propertiesPanel.setProperty('prop-width', 80);
        await canvas.waitForReady();

        await canvas.rightClickAt(50, 70);
        await menuItem(page, 'match-label-width').click();
        await canvas.waitForReady();

        const box = await page.evaluate(() => {
            // @ts-ignore
            const element = window.appState.elements[0];
            // @ts-ignore
            const labelSettings = window.appState.labelSettings;
            return {
                x: element.x,
                width: element.width,
                labelWidth: labelSettings.width * labelSettings.dpmm
            };
        });

        expect(box.x).toBe(0);
        expect(box.width).toBe(box.labelWidth);
    });

    test('should match element height to the label via context menu', async ({ page }) => {
        await elementsPanel.addBoxElement();
        await elementsPanel.selectElementByIndex(0);
        await setPosition(page, 40, 60);
        await propertiesPanel.setProperty('prop-height', 40);
        await canvas.waitForReady();

        await canvas.rightClickAt(50, 70);
        await menuItem(page, 'match-label-height').click();
        await canvas.waitForReady();

        const box = await page.evaluate(() => {
            // @ts-ignore
            const element = window.appState.elements[0];
            // @ts-ignore
            const labelSettings = window.appState.labelSettings;
            return {
                y: element.y,
                height: element.height,
                labelHeight: labelSettings.height * labelSettings.dpmm
            };
        });

        expect(box.y).toBe(0);
        expect(box.height).toBe(box.labelHeight);
    });

    test('should disable match-label actions for text elements', async ({ page }) => {
        await elementsPanel.addTextElement();
        await canvas.waitForReady();

        const position = await getElementPosition(page, 0);

        await canvas.rightClickAt(position.x, position.y);
        await expect(menuItem(page, 'match-label-width')).toBeDisabled();
        await expect(menuItem(page, 'match-label-height')).toBeDisabled();
    });

    test('should disable match-label actions for QR code elements', async ({ page }) => {
        await elementsPanel.addQRCodeElement();
        await canvas.waitForReady();

        const position = await getElementPosition(page, 0);

        await canvas.rightClickAt(position.x, position.y);
        await expect(menuItem(page, 'match-label-width')).toBeDisabled();
        await expect(menuItem(page, 'match-label-height')).toBeDisabled();
    });

    // ============== POSITIONING ==============

    test('should position the menu near the cursor after page scroll', async ({ page }) => {
        await loadApp(page, { width: 1280, height: 520 });
        await page.locator('#preview-container').scrollIntoViewIfNeeded();

        const scrollY = await page.evaluate(() => window.scrollY);
        expect(scrollY).toBeGreaterThan(0);

        const canvasBox = await getBoundingBoxOrThrow(page.locator('#label-canvas'), 'Canvas');
        const clickX = Math.round(canvasBox.x + Math.min(canvasBox.width * 0.25, 160));
        const clickY = Math.round(canvasBox.y + Math.min(canvasBox.height * 0.25, 160));

        await page.mouse.click(clickX, clickY, { button: 'right' });

        const menuBox = await getBoundingBoxOrThrow(page.locator(menuSelector), 'Context menu');
        expect(Math.abs(menuBox.x - clickX)).toBeLessThan(20);
        expect(Math.abs(menuBox.y - clickY)).toBeLessThan(20);
    });

    test('should keep the menu inside the preview container on narrow layouts', async ({ page }) => {
        await loadApp(page, { width: 640, height: 520 });
        await page.locator('#preview-container').scrollIntoViewIfNeeded();

        const canvasBox = await getBoundingBoxOrThrow(page.locator('#label-canvas'), 'Canvas');
        const clickX = Math.round(canvasBox.x + canvasBox.width - 10);
        const clickY = Math.round(canvasBox.y + canvasBox.height - 10);

        await page.mouse.click(clickX, clickY, { button: 'right' });

        const containerBox = await getBoundingBoxOrThrow(page.locator('#preview-container'), 'Preview container');
        const menuBox = await getBoundingBoxOrThrow(page.locator(menuSelector), 'Context menu');

        expect(menuBox.x).toBeGreaterThanOrEqual(containerBox.x + 7);
        expect(menuBox.y).toBeGreaterThanOrEqual(containerBox.y + 7);
        expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(containerBox.x + containerBox.width - 7);
        expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(containerBox.y + containerBox.height - 7);
    });

    // ============== CLOSING BEHAVIOR ==============

    test('should close menu on Escape', async ({ page }) => {
        await elementsPanel.addBoxElement();
        await canvas.waitForReady();

        const position = await getElementPosition(page, 0);

        await canvas.rightClickAt(position.x, position.y);
        const menu = page.locator(menuSelector);
        await expect(menu).toBeVisible();

        await page.keyboard.press('Escape');
        await expect(menu).toBeHidden();
    });

    test('should close menu on click outside', async ({ page }) => {
        await elementsPanel.addBoxElement();
        await canvas.waitForReady();

        const position = await getElementPosition(page, 0);

        await canvas.rightClickAt(position.x, position.y);
        const menu = page.locator(menuSelector);
        await expect(menu).toBeVisible();

        // Click elsewhere on the page
        await page.locator('body').click({ position: { x: 10, y: 10 } });
        await expect(menu).toBeHidden();
    });

    test('should close menu when item is clicked', async ({ page }) => {
        await elementsPanel.addBoxElement();
        await canvas.waitForReady();

        const position = await getElementPosition(page, 0);

        await canvas.rightClickAt(position.x, position.y);
        const menu = page.locator(menuSelector);
        await expect(menu).toBeVisible();

        await menuItem(page, 'copy').click();
        await expect(menu).toBeHidden();
    });

    // ============== NATIVE MENU SUPPRESSION ==============

    test('should suppress browser context menu on canvas', async ({ page }) => {
        await canvas.rightClickAt(100, 100);
        const menu = page.locator(menuSelector);
        await expect(menu).toBeVisible();
    });
});
