import { test, expect } from '../fixtures';
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

            // Wait for the error to appear
            await previewPanel.previewError.waitFor({ state: 'visible', timeout: 10000 });

            expect(await previewPanel.hasError()).toBe(true);
            const errorMsg = await previewPanel.getErrorMessage();
            expect(errorMsg).toContain("Couldn't render the preview");
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

            await previewPanel.previewError.waitFor({ state: 'visible', timeout: 10000 });

            expect(await previewPanel.hasError()).toBe(true);
            const errorMsg = await previewPanel.getErrorMessage();
            expect(errorMsg).toContain("Couldn't render the preview");
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

            await previewPanel.previewError.waitFor({ state: 'visible', timeout: 10000 });

            expect(await previewPanel.hasError()).toBe(true);
            const errorMsg = await previewPanel.getErrorMessage();
            expect(errorMsg).toContain("Couldn't render the preview");
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

            await previewPanel.previewError.waitFor({ state: 'visible', timeout: 10000 });

            expect(await previewPanel.hasError()).toBe(true);
            const errorMsg = await previewPanel.getErrorMessage();
            expect(errorMsg).toContain("Couldn't render the preview");
        });

        test('should display error on connection timeout', async ({ page }) => {
            await page.route(LABELARY_URL, route => {
                route.abort('timedout');
            });

            await elementsPanel.addTextElement();
            await previewPanel.switchToAPIMode();

            await previewPanel.previewError.waitFor({ state: 'visible', timeout: 10000 });

            expect(await previewPanel.hasError()).toBe(true);
        });

        test('should display error when connection is refused', async ({ page }) => {
            await page.route(LABELARY_URL, route => {
                route.abort('connectionrefused');
            });

            await elementsPanel.addTextElement();
            await previewPanel.switchToAPIMode();

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

            await previewPanel.previewError.waitFor({ state: 'visible', timeout: 10000 });

            // Preview image should be hidden
            await expect(previewPanel.previewImage).toBeHidden();
        });

        test('should show placeholder when label has no elements', async ({ page }) => {
            // Don't add any elements
            await previewPanel.switchToAPIMode();

            // Should show placeholder, not error
            await expect(previewPanel.previewPlaceholder).toBeVisible();
            expect(await previewPanel.hasError()).toBe(false);
        });

        test('should keep the editor canvas visible when overlay mode preview fails', async ({ page }) => {
            await page.route(LABELARY_URL, route => {
                route.fulfill({ status: 500, contentType: 'text/plain', body: 'Error' });
            });

            await elementsPanel.addTextElement();
            await previewPanel.switchToOverlayMode();
            await previewPanel.previewError.waitFor({ state: 'visible', timeout: 10000 });

            expect(await previewPanel.isOverlayMode()).toBe(true);
            expect(await previewPanel.hasError()).toBe(true);
            await expect(previewPanel.canvas).toBeVisible();
        });

        test('should hide a stale preview image when a later refresh fails', async ({ page }) => {
            let shouldFail = false;

            await page.route(LABELARY_URL, async (route) => {
                if (shouldFail) {
                    await route.fulfill({ status: 500, contentType: 'text/plain', body: 'Error' });
                    return;
                }

                await route.fulfill({
                    status: 200,
                    contentType: 'image/png',
                    body: createMinimalPNG(),
                });
            });

            await elementsPanel.addTextElement();
            await previewPanel.switchToAPIMode();
            await previewPanel.previewImage.waitFor({ state: 'visible', timeout: 10000 });

            shouldFail = true;
            await page.locator('#prop-preview-text').fill('Failure case');
            await page.locator('#prop-preview-text').dispatchEvent('change');
            // The edit auto-refreshes (debounced); the new fetch fails.
            await previewPanel.previewError.waitFor({ state: 'visible', timeout: 10000 });

            await expect(previewPanel.previewImage).toBeHidden();
        });
    });

    // =============================================
    // ERROR RECOVERY
    // =============================================
    test.describe('Error Recovery', () => {

        test('should automatically recover from a transient 429 rate limit response', async ({ page }) => {
            test.setTimeout(15000);
            let requestCount = 0;

            await page.route(LABELARY_URL, async (route) => {
                requestCount += 1;

                if (requestCount === 1) {
                    await route.fulfill({
                        status: 429,
                        contentType: 'text/plain',
                        body: 'Too Many Requests',
                    });
                    return;
                }

                await route.fulfill({
                    status: 200,
                    contentType: 'image/png',
                    body: createMinimalPNG(),
                });
            });

            await elementsPanel.addTextElement();
            await previewPanel.switchToAPIMode();
            await previewPanel.previewImage.waitFor({ state: 'visible', timeout: 10000 });

            expect(requestCount).toBe(2);
            expect(await previewPanel.hasError()).toBe(false);
        });

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

            // Attempt while server is down — switching to API mode renders, fails
            await previewPanel.previewError.waitFor({ state: 'visible', timeout: 10000 });
            expect(await previewPanel.hasError()).toBe(true);

            // "Fix" the server, then retry — should succeed
            shouldFail = false;
            await previewPanel.rerender();
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

            // Trigger error — switching to API mode renders, fails
            await previewPanel.previewError.waitFor({ state: 'visible', timeout: 10000 });
            const errorMsg = await previewPanel.getErrorMessage();
            expect(errorMsg).toContain("Couldn't render the preview");

            // Fix the "server" and retry
            shouldFail = false;
            await previewPanel.rerender();
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
                await previewPanel.rerender();
                await previewPanel.previewError.waitFor({ state: 'visible', timeout: 10000 });
                expect(await previewPanel.hasError()).toBe(true);
            }

            // "Fix" the server and retry — should succeed
            shouldFail = false;
            await previewPanel.rerender();
            await previewPanel.previewImage.waitFor({ state: 'visible', timeout: 10000 });
            expect(await previewPanel.hasError()).toBe(false);
        });
    });

    // =============================================
    // ERROR MESSAGE CONTENT
    // =============================================
    test.describe('Error Message Content', () => {

        test('should show the error card for server errors', async ({ page }) => {
            await page.route(LABELARY_URL, route => {
                route.fulfill({ status: 502, contentType: 'text/plain', body: 'Bad Gateway' });
            });

            await elementsPanel.addTextElement();
            await previewPanel.switchToAPIMode();

            await previewPanel.previewError.waitFor({ state: 'visible', timeout: 10000 });

            const errorMsg = await previewPanel.getErrorMessage();
            expect(errorMsg).toContain("Couldn't render the preview");
        });

        test('should show descriptive error for network failures', async ({ page }) => {
            await page.route(LABELARY_URL, route => {
                route.abort('failed');
            });

            await elementsPanel.addTextElement();
            await previewPanel.switchToAPIMode();

            await previewPanel.previewError.waitFor({ state: 'visible', timeout: 10000 });

            const errorMsg = await previewPanel.getErrorMessage();
            // Should have a meaningful error, not just empty string
            expect(errorMsg).toBeTruthy();
            expect(errorMsg!.length).toBeGreaterThan(10);
        });

        test('should keep showing the error card after a subsequent failure', async ({ page }) => {
            let status = 500;

            await page.route(LABELARY_URL, route => {
                route.fulfill({ status, contentType: 'text/plain', body: 'Error' });
            });

            await elementsPanel.addTextElement();
            await previewPanel.switchToAPIMode();

            // First failure — switching to API mode renders, fails
            await previewPanel.previewError.waitFor({ state: 'visible', timeout: 10000 });
            const firstError = await previewPanel.getErrorMessage();
            expect(firstError).toContain("Couldn't render the preview");

            // Second failure — the friendly error card stays visible
            status = 503;
            await previewPanel.rerender();
            await previewPanel.previewError.waitFor({ state: 'visible', timeout: 10000 });
            expect(await previewPanel.hasError()).toBe(true);
        });

        test('should retry from the error card and recover when the service is back', async ({ page }) => {
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
            await previewPanel.previewError.waitFor({ state: 'visible', timeout: 10000 });

            // "Fix" the service, then click Try again in the error card
            shouldFail = false;
            await page.locator('#preview-error-retry').click();

            await previewPanel.previewImage.waitFor({ state: 'visible', timeout: 10000 });
            expect(await previewPanel.hasError()).toBe(false);
        });

        test('should return to Edit mode from the error card', async ({ page }) => {
            await page.route(LABELARY_URL, route => {
                route.fulfill({ status: 500, contentType: 'text/plain', body: 'Error' });
            });

            await elementsPanel.addTextElement();
            await previewPanel.switchToAPIMode();
            await previewPanel.previewError.waitFor({ state: 'visible', timeout: 10000 });

            await page.locator('#preview-error-back').click();

            expect(await previewPanel.isCanvasMode()).toBe(true);
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
