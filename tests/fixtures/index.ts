import { test as base, expect } from '@playwright/test';
import { setupLabelaryCacheInterceptor } from './labelary-cache';

export const test = base.extend<{}>({
    page: async ({ page }, use) => {
        await setupLabelaryCacheInterceptor(page);
        await use(page);
    },
});

export { expect };
