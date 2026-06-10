import { test, expect } from '../fixtures';
import { ElementsPanel, ZPLOutput } from '../page-objects';

test.describe('New template — start a blank label', () => {
    let elementsPanel: ElementsPanel;
    let zplOutput: ZPLOutput;

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        elementsPanel = new ElementsPanel(page);
        zplOutput = new ZPLOutput(page);
    });

    test('confirms, then resets canvas and label settings to defaults', async ({ page }) => {
        // Seed work: an element plus a non-default label width.
        await elementsPanel.addTextElement();
        await page.locator('#label-width').fill('75');
        await page.locator('#label-width').dispatchEvent('change');
        expect(await elementsPanel.getElementCount()).toBe(1);

        await zplOutput.openMoreActions();
        await page.locator('#new-template-btn').click();

        // In-app ConfirmModal must guard the destructive reset.
        await expect(page.locator('#confirm-modal')).toBeVisible();
        await page.locator('#confirm-ok-btn').click();

        // Canvas cleared and label width back to the boot default (100mm).
        await expect(page.locator('#elements-list .element-item')).toHaveCount(0);
        await expect(page.locator('#label-width')).toHaveValue('100');
    });

    test('keeps the current label when the confirm is cancelled', async ({ page }) => {
        await elementsPanel.addTextElement();
        const countBefore = await elementsPanel.getElementCount();

        await zplOutput.openMoreActions();
        await page.locator('#new-template-btn').click();
        await expect(page.locator('#confirm-modal')).toBeVisible();

        await page.locator('#confirm-cancel-btn').click();

        await expect(page.locator('#confirm-modal')).toBeHidden();
        expect(await elementsPanel.getElementCount()).toBe(countBefore);
    });

    test('does not prompt when the canvas is already blank', async ({ page }) => {
        await zplOutput.openMoreActions();
        await page.locator('#new-template-btn').click();

        // No work to lose → reset proceeds silently, no confirm dialog.
        await expect(page.locator('#confirm-modal')).toBeHidden();
        expect(await elementsPanel.getElementCount()).toBe(0);
    });
});
