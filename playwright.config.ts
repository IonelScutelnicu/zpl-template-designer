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
    },

    projects: [
        {
            name: 'core',
            testMatch: /.*\.spec\.ts/,
            testIgnore: /.*-api\.spec\.ts/,
            use: { ...devices['Desktop Chrome'] },
            fullyParallel: true,
            workers: process.env.CI ? 2 : undefined, // Parallel for fast core tests
        },
        {
            name: 'api-integration',
            testMatch: /.*-api\.spec\.ts/,
            use: { ...devices['Desktop Chrome'] },
            fullyParallel: false,
            workers: 1, // Sequential to respect Labelary rate limits
        },
    ],

    webServer: {
        command: 'npx serve . -l 3000',
        port: 3000,
        reuseExistingServer: !process.env.CI,
    },
});
