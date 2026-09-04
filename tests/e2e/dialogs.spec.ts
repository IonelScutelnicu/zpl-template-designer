import { test, expect } from '../fixtures';

test.beforeEach(async ({ page }) => {
    await page.goto('/');
});

test('shortcuts modal opens with ? and dismisses on Esc and backdrop click', async ({ page }) => {
    const modal = page.locator('#shortcuts-modal');
    await expect(modal).toBeHidden();

    await page.keyboard.press('?');
    await expect(modal).toBeVisible();
    // showModal() moves focus into the dialog and makes the page behind it inert.
    await expect(page.locator('#shortcuts-close')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();

    await page.locator('#shortcuts-btn').click();
    await expect(modal).toBeVisible();
    await page.mouse.click(8, 8); // ::backdrop, outside the dialog box
    await expect(modal).toBeHidden();
});

test('history drawer fills the viewport height and dismisses on Esc and backdrop click', async ({ page }) => {
    const drawer = page.locator('#history-panel');
    await expect(drawer).toBeHidden();

    await page.locator('#history-toggle-btn').click();
    await expect(drawer).toBeVisible();

    const geometry = await page.evaluate(() => {
        const r = document.getElementById('history-panel')!.getBoundingClientRect();
        const root = document.documentElement;
        return { fullHeight: r.height === root.clientHeight, gapRight: root.clientWidth - r.right };
    });
    expect(geometry.fullHeight).toBe(true);
    expect(geometry.gapRight).toBeLessThanOrEqual(20); // scrollbar gutter only

    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();

    await page.locator('#history-toggle-btn').click();
    await expect(drawer).toBeVisible();
    await page.mouse.click(8, 8);
    await expect(drawer).toBeHidden();
});
