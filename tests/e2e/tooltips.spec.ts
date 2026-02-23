import { test, expect } from '@playwright/test';

test.describe('Tooltips', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    // 1. Element buttons show tooltips after hover delay
    test('should show tooltip for Add Text button after hover delay', async ({ page }) => {
        await page.locator('#add-text-btn').hover();
        await page.waitForTimeout(600);
        const tooltip = page.locator('.zpl-tooltip');
        await expect(tooltip).toBeVisible();
        await expect(tooltip).toContainText('Add Text element');
    });

    test('should show tooltip for Add Barcode button', async ({ page }) => {
        await page.locator('#add-barcode-btn').hover();
        await page.waitForTimeout(600);
        const tooltip = page.locator('.zpl-tooltip');
        await expect(tooltip).toBeVisible();
        await expect(tooltip).toContainText('Add Barcode element');
    });

    test('should show tooltip for Add Circle button', async ({ page }) => {
        await page.locator('#add-circle-btn').hover();
        await page.waitForTimeout(600);
        const tooltip = page.locator('.zpl-tooltip');
        await expect(tooltip).toBeVisible();
        await expect(tooltip).toContainText('Add Circle element');
    });

    // 2. Canvas controls show tooltips
    test('should show tooltip for Undo button with keyboard shortcut', async ({ page }) => {
        await page.locator('#undo-btn').hover();
        await page.waitForTimeout(600);
        const tooltip = page.locator('.zpl-tooltip');
        await expect(tooltip).toBeVisible();
        await expect(tooltip).toContainText('Undo (Ctrl+Z)');
    });

    test('should show tooltip for Redo button with keyboard shortcut', async ({ page }) => {
        await page.locator('#redo-btn').hover();
        await page.waitForTimeout(600);
        const tooltip = page.locator('.zpl-tooltip');
        await expect(tooltip).toBeVisible();
        await expect(tooltip).toContainText('Redo (Ctrl+Shift+Z)');
    });

    test('should show tooltip for History toggle button', async ({ page }) => {
        await page.locator('#history-toggle-btn').hover();
        await page.waitForTimeout(600);
        const tooltip = page.locator('.zpl-tooltip');
        await expect(tooltip).toBeVisible();
        await expect(tooltip).toContainText('Toggle edit history panel');
    });

    test('should show Esc shortcut for cancel drag / resize in shortcuts panel', async ({ page }) => {
        const shortcutsButton = page.locator('button:has-text("Shortcuts")');
        await shortcutsButton.hover();
        await page.waitForTimeout(250);

        const cancelRow = page.locator('div.flex.justify-between.items-center').filter({
            hasText: 'Cancel drag / resize'
        });
        await expect(cancelRow).toBeVisible();
        await expect(cancelRow.locator('code')).toHaveText('Esc');
    });

    // 3. ZPL output buttons show tooltips
    test('should show tooltip for Copy button', async ({ page }) => {
        await page.locator('#copy-btn').hover();
        await page.waitForTimeout(600);
        const tooltip = page.locator('.zpl-tooltip');
        await expect(tooltip).toBeVisible();
        await expect(tooltip).toContainText('Copy ZPL code to clipboard');
    });

    test('should show tooltip for Import button', async ({ page }) => {
        await page.locator('#import-btn').hover();
        await page.waitForTimeout(600);
        const tooltip = page.locator('.zpl-tooltip');
        await expect(tooltip).toBeVisible();
        await expect(tooltip).toContainText('Import template from JSON file');
    });

    // 4. Tooltip disappears after mouse leaves
    test('should hide tooltip when mouse leaves button', async ({ page }) => {
        await page.locator('#add-text-btn').hover();
        await page.waitForTimeout(600);
        await expect(page.locator('.zpl-tooltip')).toBeVisible();

        // Move mouse away
        await page.mouse.move(0, 0);
        await expect(page.locator('.zpl-tooltip')).not.toBeVisible();
    });

    // 5. Tooltip does not appear before delay elapses
    test('should not show tooltip immediately on hover', async ({ page }) => {
        await page.locator('#add-text-btn').hover();
        // 200ms — well before the 500ms delay
        await page.waitForTimeout(200);
        // Use timeout:0 to check once without retrying past the 500ms delay
        await expect(page.locator('.zpl-tooltip')).not.toBeVisible({ timeout: 0 });
    });

    // 6. Tooltip updates correctly when moving between buttons (no flicker/wrong text)
    test('should show correct tooltip when moving from one button to another', async ({ page }) => {
        // Hover first button, wait for its tooltip to appear
        await page.locator('#add-text-btn').hover();
        await page.waitForTimeout(600);
        await expect(page.locator('.zpl-tooltip')).toContainText('Add Text element');

        // Move to a different button — tooltip should update to the new button's text
        await page.locator('#add-barcode-btn').hover();
        await page.waitForTimeout(600);
        await expect(page.locator('.zpl-tooltip')).toBeVisible();
        await expect(page.locator('.zpl-tooltip')).toContainText('Add Barcode element');
    });

    // 7. Properties panel buttons have tooltips (after adding an element)
    test('should show tooltip for Center Horizontally alignment button', async ({ page }) => {
        await page.locator('#add-box-btn').click();
        await page.locator('#prop-center-x').hover();
        await page.waitForTimeout(600);
        const tooltip = page.locator('.zpl-tooltip');
        await expect(tooltip).toBeVisible();
        await expect(tooltip).toContainText('Center Horizontally');
    });
});
