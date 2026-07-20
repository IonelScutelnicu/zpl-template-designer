import { test, expect } from '@playwright/test';

test.describe('safe localStorage removal', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('removes an available key', async ({ page }) => {
        const value = await page.evaluate(async () => {
            localStorage.setItem('storage-test', 'value');
            const { safeLocalStorageRemove } = await import('/src/utils/storage.js');
            safeLocalStorageRemove('storage-test');
            return localStorage.getItem('storage-test');
        });

        expect(value).toBeNull();
    });

    test('does not throw when removal is blocked', async ({ page }) => {
        const error = await page.evaluate(async () => {
            const { safeLocalStorageRemove } = await import('/src/utils/storage.js');
            const originalRemoveItem = Storage.prototype.removeItem;
            Storage.prototype.removeItem = () => {
                throw new DOMException('Access denied', 'SecurityError');
            };

            try {
                safeLocalStorageRemove('storage-test');
                return null;
            } catch (caught) {
                return String(caught);
            } finally {
                Storage.prototype.removeItem = originalRemoveItem;
            }
        });

        expect(error).toBeNull();
    });
});
