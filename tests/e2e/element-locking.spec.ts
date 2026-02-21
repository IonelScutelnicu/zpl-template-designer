import { test, expect } from '@playwright/test';
import { ElementsPanel, PropertiesPanel, Canvas, ZPLOutput } from '../page-objects';
import * as path from 'path';
import * as fs from 'fs';

test.describe('Element Locking', () => {
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

    async function lockElementByIndex(page: import('@playwright/test').Page, index: number): Promise<void> {
        const item = page.locator('#elements-list .element-item').nth(index);
        await item.hover();
        await item.locator('.lock-btn').click();
    }

    async function setPosition(page: import('@playwright/test').Page, x: number, y: number): Promise<void> {
        await page.locator('#prop-x').fill(String(x));
        await page.locator('#prop-x').dispatchEvent('change');
        await page.locator('#prop-y').fill(String(y));
        await page.locator('#prop-y').dispatchEvent('change');
        await canvas.waitForReady();
    }

    // ============== LOCK TOGGLE ==============
    test('should toggle lock state via sidebar button', async ({ page }) => {
        await elementsPanel.addBoxElement();
        const item = page.locator('#elements-list .element-item').nth(0);

        // Initially unlocked — lock button only visible on hover
        await item.hover();
        const lockBtn = item.locator('.lock-btn');
        await expect(lockBtn).toBeVisible();

        // Click to lock
        await lockBtn.click();

        // Lock icon should now be always visible (amber color)
        await expect(lockBtn).toHaveClass(/text-amber-500/);

        // Click again to unlock
        await item.hover();
        await lockBtn.click();
        await expect(lockBtn).not.toHaveClass(/text-amber-500/);
    });

    // ============== LOCKED ELEMENT CANNOT BE DRAGGED ==============
    test('should not move locked element when dragged', async ({ page }) => {
        await elementsPanel.addBoxElement();
        await elementsPanel.selectElementByIndex(0);
        await setPosition(page, 100, 100);

        // Lock the element
        await lockElementByIndex(page, 0);

        // Attempt to drag
        await canvas.dragLabelCoords(120, 120, 250, 250);
        await canvas.waitForReady();

        // Select element to read position
        await elementsPanel.selectElementByIndex(0);
        const newX = parseInt(await propertiesPanel.getProperty('prop-x'));
        const newY = parseInt(await propertiesPanel.getProperty('prop-y'));

        expect(newX).toBe(100);
        expect(newY).toBe(100);
    });

    // ============== LOCKED ELEMENT CANNOT BE DELETED VIA DELETE KEY ==============
    test('should not delete locked element via Delete key', async ({ page }) => {
        await elementsPanel.addBoxElement();
        await elementsPanel.selectElementByIndex(0);

        // Lock the element
        await lockElementByIndex(page, 0);

        // Select it on canvas and press Delete
        await elementsPanel.selectElementByIndex(0);
        await canvas.canvas.focus();
        await page.keyboard.press('Delete');

        // Element should still exist
        expect(await elementsPanel.getElementCount()).toBe(1);
    });

    // ============== LOCKED ELEMENT CANNOT BE DELETED VIA SIDEBAR ==============
    test('should not delete locked element via sidebar delete button', async ({ page }) => {
        await elementsPanel.addBoxElement();

        // Lock the element
        await lockElementByIndex(page, 0);

        // Hover and try clicking delete button — it should be pointer-events-none
        const item = page.locator('#elements-list .element-item').nth(0);
        await item.hover();
        const deleteBtn = item.locator('.delete-btn');

        // The delete button should be in a container with pointer-events-none when locked
        const deleteContainer = deleteBtn.locator('..');
        await expect(deleteContainer).toHaveClass(/pointer-events-none/);

        // Element should still exist
        expect(await elementsPanel.getElementCount()).toBe(1);
    });

    // ============== LOCKED ELEMENT CAN STILL BE SELECTED ==============
    test('should still select locked element and show properties', async ({ page }) => {
        await elementsPanel.addBoxElement();
        await elementsPanel.selectElementByIndex(0);
        await setPosition(page, 50, 50);

        // Lock the element
        await lockElementByIndex(page, 0);

        // Click on canvas where element is
        await canvas.clickAtLabelCoords(70, 70);
        await canvas.waitForReady();

        // Properties panel should show the element
        const propX = await propertiesPanel.getProperty('prop-x');
        expect(parseInt(propX)).toBe(50);
    });

    // ============== ARROW KEYS DON'T MOVE LOCKED ELEMENT ==============
    test('should not move locked element with arrow keys', async ({ page }) => {
        await elementsPanel.addBoxElement();
        await elementsPanel.selectElementByIndex(0);
        await setPosition(page, 100, 100);

        // Lock the element
        await lockElementByIndex(page, 0);

        // Select on canvas and try arrow keys
        await canvas.clickAtLabelCoords(120, 120);
        await canvas.waitForReady();
        await canvas.moveSelectedWithArrowKeys('right', 10);
        await canvas.moveSelectedWithArrowKeys('down', 10);
        await canvas.waitForReady();

        // Position should be unchanged
        await elementsPanel.selectElementByIndex(0);
        const newX = parseInt(await propertiesPanel.getProperty('prop-x'));
        const newY = parseInt(await propertiesPanel.getProperty('prop-y'));
        expect(newX).toBe(100);
        expect(newY).toBe(100);
    });

    // ============== LOCK STATE PERSISTS THROUGH EXPORT/IMPORT ==============
    test('should preserve lock state through export and import', async ({ page }) => {
        await elementsPanel.addBoxElement();

        // Lock the element
        await lockElementByIndex(page, 0);

        // Export
        const downloadPromise = page.waitForEvent('download');
        await zplOutput.exportTemplate();
        const download = await downloadPromise;

        const tempPath = path.join(__dirname, '../fixtures/temp-export-lock.json');
        await download.saveAs(tempPath);

        const content = fs.readFileSync(tempPath, 'utf-8');
        const json = JSON.parse(content);

        // Verify locked property in exported JSON
        expect(json.elements[0].locked).toBe(true);

        // Import the file back
        const fileChooserPromise = page.waitForEvent('filechooser');
        await page.locator('#import-btn').click();
        // Accept the confirmation dialog
        page.on('dialog', dialog => dialog.accept());
        await page.locator('#import-btn').click();
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles(tempPath);

        await canvas.waitForReady();

        // Verify element is still locked (lock button should have amber color)
        const item = page.locator('#elements-list .element-item').nth(0);
        const lockBtn = item.locator('.lock-btn');
        await expect(lockBtn).toHaveClass(/text-amber-500/);

        // Cleanup
        fs.unlinkSync(tempPath);
    });

    // ============== REORDER BUTTONS DISABLED WHEN LOCKED ==============
    test('should dim reorder and delete buttons when element is locked', async ({ page }) => {
        await elementsPanel.addBoxElement();

        // Lock the element
        await lockElementByIndex(page, 0);

        // The reorder/delete container should have opacity-30
        const item = page.locator('#elements-list .element-item').nth(0);
        await item.hover();
        const actionsContainer = item.locator('.lock-btn').locator('..').locator('> div');
        await expect(actionsContainer).toHaveClass(/opacity-30/);
    });
});
