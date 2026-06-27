import { test, expect } from '../fixtures';

test.describe('Editor Drive header', () => {
    test('shows a Connect Drive button when configured but disconnected', async ({ page }) => {
        await page.goto('/');

        await expect(page.locator('#editor-drive-connect-btn')).toBeVisible();
        await expect(page.locator('#editor-drive-connect-btn')).toHaveText('Connect Drive');
        await expect(page.locator('#editor-drive-profile-btn')).toHaveCount(0);
    });
});
