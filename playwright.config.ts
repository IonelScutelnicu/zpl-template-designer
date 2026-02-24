import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    reporter: 'html',

    use: {
        baseURL: 'http://localhost:3000',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        viewport: {
            width: 1920,
            height: 1080
        },
    },

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
            fullyParallel: true,
            workers: process.env.CI ? 2 : undefined,
        },
    ],

    webServer: {
        command: 'npx serve . -l 3000',
        port: 3000,
        reuseExistingServer: !process.env.CI,
    },
});
