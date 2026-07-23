import { test, expect } from '../fixtures';

test('history panel mutes redoable entries while preserving applied and active styling', async ({ page }) => {
    await page.goto('/');

    await page.locator('#add-text-btn').click();
    await page.locator('#add-box-btn').click();
    await expect(page.locator('#undo-btn')).toBeEnabled();
    await page.locator('#undo-btn').click();
    await page.locator('#history-toggle-btn').click();

    const applied = page.locator('[data-history-state="applied"]').last();
    const active = page.locator('[data-history-state="active"]');
    const redoable = page.locator('[data-history-state="redoable"]');

    await expect(applied.locator('.text-xs')).toHaveClass(/text-slate-700/);
    await expect(active.locator('.text-xs')).toHaveClass(/text-blue-600/);
    await expect(redoable.locator('.text-xs')).toHaveClass(/text-slate-400/);
    await expect(redoable.locator('.rounded-full')).toHaveClass(/text-slate-400/);
});
