import { test, expect } from '@playwright/test';
import { ElementsPanel, PreviewPanel } from '../page-objects';

/**
 * Labelary API Error Scenario Tests
 *
 * These tests use page.route() to mock API responses, so they never hit the
 * real Labelary API. We import directly from @playwright/test (not ../fixtures)
 * to avoid the cache interceptor which would absorb our mocked routes.
 */

const LABELARY_URL = '**/api.labelary.com/**';

test.describe('Labelary API - Error Scenarios', () => {
    let elementsPanel: ElementsPanel;
    let previewPanel: PreviewPanel;

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        elementsPanel = new ElementsPanel(page);
        previewPanel = new PreviewPanel(page);
    });

    // =============================================
    // HTTP ERROR RESPONSES
    // =============================================
    test.describe('HTTP Error Responses', () => {

        test('should display error message on HTTP 500 server error', async ({ page }) => {
            await page.route(LABELARY_URL, route => {
                route.fulfill({
                    status: 500,
                    contentType: 'text/plain',
                    body: 'Internal Server Error',
                });
            });

            await elementsPanel.addTextElement();
            await previewPanel.switchToAPIMode();
            await previewPanel.refreshBtn.click();

            // Wait for the error to appear
            await previewPanel.previewError.waitFor({ state: 'visible', timeout: 10000 });

            expect(await previewPanel.hasError()).toBe(true);
            const errorMsg = await previewPanel.getErrorMessage();
            expect(errorMsg).toContain('Error loading preview');
            expect(errorMsg).toContain('500');
        });

        test('should display error message on HTTP 429 rate limit', async ({ page }) => {
            await page.route(LABELARY_URL, route => {
                route.fulfill({
                    status: 429,
                    contentType: 'text/plain',
                    body: 'Too Many Requests',
                });
            });

            await elementsPanel.addTextElement();
            await previewPanel.switchToAPIMode();
            await previewPanel.refreshBtn.click();

            await previewPanel.previewError.waitFor({ state: 'visible', timeout: 10000 });

            expect(await previewPanel.hasError()).toBe(true);
            const errorMsg = await previewPanel.getErrorMessage();
            expect(errorMsg).toContain('Error loading preview');
            expect(errorMsg).toContain('429');
        });

        test('should display error message on HTTP 400 bad request', async ({ page }) => {
            await page.route(LABELARY_URL, route => {
                route.fulfill({
                    status: 400,
                    contentType: 'text/plain',
                    body: 'Bad Request',
                });
            });

            await elementsPanel.addTextElement();
            await previewPanel.switchToAPIMode();
            await previewPanel.refreshBtn.click();

            await previewPanel.previewError.waitFor({ state: 'visible', timeout: 10000 });

            expect(await previewPanel.hasError()).toBe(true);
            const errorMsg = await previewPanel.getErrorMessage();
            expect(errorMsg).toContain('400');
        });
    });

    // =============================================
    // NETWORK FAILURES
    // =============================================
    test.describe('Network Failures', () => {

        test('should display error on network failure (request aborted)', async ({ page }) => {
            await page.route(LABELARY_URL, route => {
                route.abort('failed');
            });

            await elementsPanel.addTextElement();
            await previewPanel.switchToAPIMode();
            await previewPanel.refreshBtn.click();

            await previewPanel.previewError.waitFor({ state: 'visible', timeout: 10000 });

            expect(await previewPanel.hasError()).toBe(true);
            const errorMsg = await previewPanel.getErrorMessage();
            expect(errorMsg).toContain('Error loading preview');
        });

        test('should display error on connection timeout', async ({ page }) => {
            await page.route(LABELARY_URL, route => {
                route.abort('timedout');
            });

            await elementsPanel.addTextElement();
            await previewPanel.switchToAPIMode();
            await previewPanel.refreshBtn.click();

            await previewPanel.previewError.waitFor({ state: 'visible', timeout: 10000 });

            expect(await previewPanel.hasError()).toBe(true);
        });

        test('should display error when connection is refused', async ({ page }) => {
            await page.route(LABELARY_URL, route => {
                route.abort('connectionrefused');
            });

            await elementsPanel.addTextElement();
            await previewPanel.switchToAPIMode();
            await previewPanel.refreshBtn.click();

            await previewPanel.previewError.waitFor({ state: 'visible', timeout: 10000 });

            expect(await previewPanel.hasError()).toBe(true);
        });
    });

    // =============================================
    // UI STATE AFTER ERRORS
    // =============================================
    test.describe('UI State After Errors', () => {

        test('should hide loading indicator after error', async ({ page }) => {
            await page.route(LABELARY_URL, route => {
                route.fulfill({ status: 500, contentType: 'text/plain', body: 'Error' });
            });

            await elementsPanel.addTextElement();
            await previewPanel.switchToAPIMode();
            await previewPanel.refreshBtn.click();

            await previewPanel.previewError.waitFor({ state: 'visible', timeout: 10000 });

            // Loading indicator should be hidden (finally block)
            expect(await previewPanel.isLoading()).toBe(false);
        });

        test('should not show the preview image after error', async ({ page }) => {
            await page.route(LABELARY_URL, route => {
                route.fulfill({ status: 500, contentType: 'text/plain', body: 'Error' });
            });

            await elementsPanel.addTextElement();
            await previewPanel.switchToAPIMode();
            await previewPanel.refreshBtn.click();

            await previewPanel.previewError.waitFor({ state: 'visible', timeout: 10000 });

            // Preview image should be hidden
            await expect(previewPanel.previewImage).toBeHidden();
        });

        test('should show placeholder when label has no elements', async ({ page }) => {
            // Don't add any elements
            await previewPanel.switchToAPIMode();
            await previewPanel.refreshBtn.click();

            // Should show placeholder, not error
            await expect(previewPanel.previewPlaceholder).toBeVisible();
            expect(await previewPanel.hasError()).toBe(false);
        });
    });

    // =============================================
    // ERROR RECOVERY
    // =============================================
    test.describe('Error Recovery', () => {

        test('should recover after a transient error when API succeeds on retry', async ({ page }) => {
            let shouldFail = true;

            await page.route(LABELARY_URL, async (route) => {
                if (shouldFail) {
                    await route.fulfill({
                        status: 500,
                        contentType: 'text/plain',
                        body: 'Server Error',
                    });
                } else {
                    await route.fulfill({
                        status: 200,
                        contentType: 'image/png',
                        body: createMinimalPNG(),
                    });
                }
            });

            await elementsPanel.addTextElement();
            await previewPanel.switchToAPIMode();

            // Attempt while server is down — should fail
            await previewPanel.refreshBtn.click();
            await previewPanel.previewError.waitFor({ state: 'visible', timeout: 10000 });
            expect(await previewPanel.hasError()).toBe(true);

            // "Fix" the server, then retry — should succeed
            shouldFail = false;
            await previewPanel.refreshBtn.click();
            await previewPanel.previewImage.waitFor({ state: 'visible', timeout: 10000 });

            // Error should be gone, image should be visible
            expect(await previewPanel.hasError()).toBe(false);
            await expect(previewPanel.previewImage).toBeVisible();
        });

        test('should clear previous error when a new refresh succeeds', async ({ page }) => {
            let shouldFail = true;

            await page.route(LABELARY_URL, async (route) => {
                if (shouldFail) {
                    await route.fulfill({ status: 503, contentType: 'text/plain', body: 'Service Unavailable' });
                } else {
                    await route.fulfill({ status: 200, contentType: 'image/png', body: createMinimalPNG() });
                }
            });

            await elementsPanel.addTextElement();
            await previewPanel.switchToAPIMode();

            // Trigger error
            await previewPanel.refreshBtn.click();
            await previewPanel.previewError.waitFor({ state: 'visible', timeout: 10000 });
            const errorMsg = await previewPanel.getErrorMessage();
            expect(errorMsg).toContain('503');

            // Fix the "server" and retry
            shouldFail = false;
            await previewPanel.refreshBtn.click();
            await previewPanel.previewImage.waitFor({ state: 'visible', timeout: 10000 });

            // Error message should be hidden
            await expect(previewPanel.previewError).toBeHidden();
        });

        test('should allow multiple retries after repeated failures', async ({ page }) => {
            let shouldFail = true;

            await page.route(LABELARY_URL, async (route) => {
                if (shouldFail) {
                    await route.fulfill({ status: 500, contentType: 'text/plain', body: 'Error' });
                } else {
                    await route.fulfill({ status: 200, contentType: 'image/png', body: createMinimalPNG() });
                }
            });

            await elementsPanel.addTextElement();
            await previewPanel.switchToAPIMode();

            // Fail multiple times while server is down
            for (let i = 0; i < 3; i++) {
                await previewPanel.refreshBtn.click();
                await previewPanel.previewError.waitFor({ state: 'visible', timeout: 10000 });
                expect(await previewPanel.hasError()).toBe(true);
            }

            // "Fix" the server and retry — should succeed
            shouldFail = false;
            await previewPanel.refreshBtn.click();
            await previewPanel.previewImage.waitFor({ state: 'visible', timeout: 10000 });
            expect(await previewPanel.hasError()).toBe(false);
        });
    });

    // =============================================
    // ERROR MESSAGE CONTENT
    // =============================================
    test.describe('Error Message Content', () => {

        test('should include HTTP status code in error message for server errors', async ({ page }) => {
            await page.route(LABELARY_URL, route => {
                route.fulfill({ status: 502, contentType: 'text/plain', body: 'Bad Gateway' });
            });

            await elementsPanel.addTextElement();
            await previewPanel.switchToAPIMode();
            await previewPanel.refreshBtn.click();

            await previewPanel.previewError.waitFor({ state: 'visible', timeout: 10000 });

            const errorMsg = await previewPanel.getErrorMessage();
            expect(errorMsg).toContain('502');
        });

        test('should show descriptive error for network failures', async ({ page }) => {
            await page.route(LABELARY_URL, route => {
                route.abort('failed');
            });

            await elementsPanel.addTextElement();
            await previewPanel.switchToAPIMode();
            await previewPanel.refreshBtn.click();

            await previewPanel.previewError.waitFor({ state: 'visible', timeout: 10000 });

            const errorMsg = await previewPanel.getErrorMessage();
            // Should have a meaningful error, not just empty string
            expect(errorMsg).toBeTruthy();
            expect(errorMsg!.length).toBeGreaterThan(10);
        });

        test('should replace old error message with new one on subsequent failure', async ({ page }) => {
            let status = 500;

            await page.route(LABELARY_URL, route => {
                route.fulfill({ status, contentType: 'text/plain', body: 'Error' });
            });

            await elementsPanel.addTextElement();
            await previewPanel.switchToAPIMode();

            // First error: 500
            await previewPanel.refreshBtn.click();
            await previewPanel.previewError.waitFor({ state: 'visible', timeout: 10000 });
            const firstError = await previewPanel.getErrorMessage();
            expect(firstError).toContain('500');

            // Second error: 503
            status = 503;
            await previewPanel.refreshBtn.click();
            await previewPanel.previewError.waitFor({ state: 'visible', timeout: 10000 });
            const secondError = await previewPanel.getErrorMessage();
            expect(secondError).toContain('503');
        });
    });
});

/**
 * Create a minimal valid 1x1 PNG for mock successful responses.
 * This is the smallest valid PNG file (67 bytes).
 */
function createMinimalPNG(): Buffer {
    return Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAB' +
        'Nl7BcQAAAABJRU5ErkJggg==',
        'base64'
    );
}
