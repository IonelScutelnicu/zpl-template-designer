import { test, expect } from '../fixtures';

test.describe('loadImage', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('resolves with the decoded image', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const { loadImage } = await import('/src/utils/loadImage.js');
            const image = await loadImage(
                'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="7" height="5"/>',
            );
            return {
                width: image.naturalWidth,
                height: image.naturalHeight,
            };
        });

        expect(result).toEqual({ width: 7, height: 5 });
    });

    test('rejects with the caller-provided message', async ({ page }) => {
        const message = await page.evaluate(async () => {
            const { loadImage } = await import('/src/utils/loadImage.js');
            try {
                await loadImage('data:image/png;base64,invalid', 'Could not decode graphic');
            } catch (error) {
                return (error as Error).message;
            }
        });

        expect(message).toBe('Could not decode graphic');
    });
});
