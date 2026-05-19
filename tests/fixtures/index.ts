import { test as base, expect } from '@playwright/test';
import { setupLabelaryCacheInterceptor } from './labelary-cache';

export const test = base.extend<{}>({
    page: async ({ page }, use) => {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await setupLabelaryCacheInterceptor(page);
        // Skip onboarding walkthrough in tests; expose internals for tests
        await page.addInitScript(() => {
            localStorage.setItem('zebra-walkthrough-complete', '1');
            (window as unknown as { __E2E__: boolean }).__E2E__ = true;
        });

        const originalGoto = page.goto.bind(page);
        page.goto = async (url, options?) => {
            const response = await originalGoto(url, options);
            if (url && !url.startsWith('about:')) {
                await page.waitForFunction(
                    () => document.documentElement.dataset.viewReady !== undefined,
                    { timeout: 15000 }
                );
            }
            return response;
        };

        await use(page);
    },
});

export { expect };
