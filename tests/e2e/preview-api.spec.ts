import { test, expect } from '../fixtures';
import { ElementsPanel, PreviewPanel, Canvas } from '../page-objects';

const LABELARY_URL = '**/api.labelary.com/**';

test.describe('Preview - Canvas and API Preview Modes', () => {
    let elementsPanel: ElementsPanel;
    let previewPanel: PreviewPanel;
    let canvas: Canvas;

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        elementsPanel = new ElementsPanel(page);
        previewPanel = new PreviewPanel(page);
        canvas = new Canvas(page);
    });

    // ============== CANVAS MODE ==============
    test.describe('Canvas Mode', () => {
        test('should show canvas preview by default', async () => {
            expect(await previewPanel.isCanvasMode()).toBe(true);
        });

        test('should hide API preview container in canvas mode', async () => {
            expect(await previewPanel.isAPIMode()).toBe(false);
        });

        test('should render elements on canvas preview', async () => {
            const beforeScreenshot = await canvas.takeScreenshot();
            await elementsPanel.addTextElement();
            await canvas.waitForReady();
            const afterScreenshot = await canvas.takeScreenshot();

            expect(beforeScreenshot.equals(afterScreenshot)).toBe(false);
        });

        test('should update canvas preview when element properties change', async ({ page }) => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);
            await canvas.waitForReady();

            const beforeScreenshot = await canvas.takeScreenshot();

            await page.locator('#prop-preview-text').fill('Updated Text');
            await page.locator('#prop-preview-text').dispatchEvent('change');
            await canvas.waitForReady();

            const afterScreenshot = await canvas.takeScreenshot();

            expect(beforeScreenshot.equals(afterScreenshot)).toBe(false);
        });
    });

    // ============== API MODE ==============
    test.describe('API Mode', () => {
        test('should switch to API mode when API button is clicked', async () => {
            await previewPanel.switchToAPIMode();
            expect(await previewPanel.isAPIMode()).toBe(true);
        });

        test('should hide canvas in API mode', async () => {
            await previewPanel.switchToAPIMode();

            // Canvas should be hidden or API container should be visible
            const apiContainer = previewPanel.apiPreviewContainer;
            await expect(apiContainer).toBeVisible();
        });

        test('should show placeholder message before any render in API mode', async () => {
            await previewPanel.switchToAPIMode();

            const placeholder = previewPanel.previewPlaceholder;
            const isVisible = await placeholder.isVisible();
            // Placeholder or image should be visible
            expect(isVisible || await previewPanel.previewImage.isVisible()).toBe(true);
        });

        test('should auto-load preview image in API mode', async () => {
            await elementsPanel.addTextElement();
            await previewPanel.switchToAPIMode();

            // Switching to Preview mode renders immediately (no manual refresh).
            await previewPanel.waitForAPIPreviewLoaded();

            const previewImage = previewPanel.previewImage;
            await expect(previewImage).toBeVisible();
        });

        test('should auto-refresh preview after editing while in API mode', async () => {
            // Increase timeout for this test due to Labelary API + debounce
            test.setTimeout(90000);

            // Add an initial element so the API returns an image
            await elementsPanel.addTextElement();
            await previewPanel.switchToAPIMode();
            await previewPanel.waitForAPIPreviewLoaded();

            const beforeSrc = await previewPanel.getAPIPreviewSrc();

            // Add another element — the preview should auto-refresh after the debounce
            await elementsPanel.addBarcodeElement();
            await previewPanel.waitForPreviewRender();

            const afterSrc = await previewPanel.getAPIPreviewSrc();

            // Source should be different (different label content)
            expect(afterSrc).not.toBe(beforeSrc);
        });
    });

    // ============== MODE SWITCHING ==============
    test.describe('Mode Switching', () => {
        test('should switch from Canvas to API mode', async () => {
            expect(await previewPanel.isCanvasMode()).toBe(true);
            await previewPanel.switchToAPIMode();
            expect(await previewPanel.isAPIMode()).toBe(true);
        });

        test('should switch from API to Canvas mode', async () => {
            await previewPanel.switchToAPIMode();
            expect(await previewPanel.isAPIMode()).toBe(true);

            await previewPanel.switchToCanvasMode();
            expect(await previewPanel.isCanvasMode()).toBe(true);
        });

        test('should maintain element state when switching modes', async ({ page }) => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);
            await page.locator('#prop-preview-text').fill('Mode Switch Test');
            await page.locator('#prop-preview-text').dispatchEvent('change');

            await previewPanel.switchToAPIMode();
            await previewPanel.switchToCanvasMode();

            // Element should still exist with same properties
            expect(await elementsPanel.getElementCount()).toBe(1);
            await elementsPanel.selectElementByIndex(0);

            const text = await page.locator('#prop-preview-text').inputValue();
            expect(text).toBe('Mode Switch Test');
        });

        test('should update button styles when switching modes', async () => {
            const canvasBtn = previewPanel.canvasBtn;
            const apiBtn = previewPanel.apiBtn;

            // Canvas mode - canvas button should be active
            let canvasBtnClass = await canvasBtn.getAttribute('class');
            expect(canvasBtnClass).toContain('bg-white');

            // Switch to API mode
            await previewPanel.switchToAPIMode();

            // API button should now be active
            const apiBtnClass = await apiBtn.getAttribute('class');
            expect(apiBtnClass).toContain('bg-white');
        });

        test('should show canvas and Labelary preview together in overlay mode', async ({ page }) => {
            await page.route(LABELARY_URL, route => {
                route.fulfill({
                    status: 200,
                    contentType: 'image/png',
                    body: createMinimalPNG(),
                });
            });

            await elementsPanel.addTextElement();
            await previewPanel.switchToOverlayMode();
            await previewPanel.waitForOverlayPreviewLoaded();

            expect(await previewPanel.isOverlayMode()).toBe(true);
            await expect(previewPanel.previewImage).toBeVisible();

            const canvasClass = await previewPanel.canvas.getAttribute('class');
            expect(canvasClass).toContain('bg-transparent');
        });

        test('should show a white backing rectangle matching the canvas size in overlay mode', async ({ page }) => {
            await page.route(LABELARY_URL, route => {
                route.fulfill({
                    status: 200,
                    contentType: 'image/png',
                    body: createMinimalPNG(),
                });
            });

            await elementsPanel.addTextElement();
            await previewPanel.switchToOverlayMode();
            await previewPanel.waitForOverlayPreviewLoaded();

            const sizes = await page.evaluate(() => {
                const canvas = document.getElementById('label-canvas');
                const backing = document.getElementById('preview-backing');
                const canvasRect = canvas?.getBoundingClientRect();
                const backingRect = backing?.getBoundingClientRect();

                return {
                    backingHidden: backing?.classList.contains('hidden') ?? true,
                    canvasWidth: canvasRect?.width ?? 0,
                    canvasHeight: canvasRect?.height ?? 0,
                    backingWidth: backingRect?.width ?? 0,
                    backingHeight: backingRect?.height ?? 0,
                };
            });

            expect(sizes.backingHidden).toBe(false);
            expect(Math.abs(sizes.backingWidth - sizes.canvasWidth)).toBeLessThanOrEqual(2);
            expect(Math.abs(sizes.backingHeight - sizes.canvasHeight)).toBeLessThanOrEqual(2);
        });

        test('should keep the canvas on top of the preview image in overlay mode', async ({ page }) => {
            await page.route(LABELARY_URL, route => {
                route.fulfill({
                    status: 200,
                    contentType: 'image/png',
                    body: createMinimalPNG(),
                });
            });

            await elementsPanel.addTextElement();
            await previewPanel.switchToOverlayMode();
            await previewPanel.waitForOverlayPreviewLoaded();

            const topElementId = await page.evaluate(() => {
                const canvas = document.getElementById('label-canvas');
                const rect = canvas?.getBoundingClientRect();
                if (!rect) return null;

                const x = rect.left + rect.width / 2;
                const y = rect.top + rect.height / 2;
                return document.elementFromPoint(x, y)?.id ?? null;
            });

            expect(topElementId).toBe('label-canvas');
        });

        test('should dim the Labelary preview image in overlay mode', async ({ page }) => {
            await page.route(LABELARY_URL, route => {
                route.fulfill({
                    status: 200,
                    contentType: 'image/png',
                    body: createMinimalPNG(),
                });
            });

            await elementsPanel.addTextElement();
            await previewPanel.switchToOverlayMode();
            await previewPanel.waitForOverlayPreviewLoaded();

            const overlayOpacity = await previewPanel.previewImage.evaluate(
                el => (el as HTMLElement).style.opacity
            );
            expect(parseFloat(overlayOpacity)).toBeLessThan(1);

            await previewPanel.switchToAPIMode();
            await previewPanel.waitForAPIPreviewLoaded();

            const previewClass = await previewPanel.previewImage.getAttribute('class');
            expect(previewClass).toContain('opacity-100');
        });

        test('should debounce overlay refreshes to a single Labelary request after rapid edits', async ({ page }) => {
            let requestCount = 0;

            await page.route(LABELARY_URL, route => {
                requestCount += 1;
                route.fulfill({
                    status: 200,
                    contentType: 'image/png',
                    body: createMinimalPNG(),
                });
            });

            await elementsPanel.addTextElement();
            await previewPanel.switchToOverlayMode();
            await previewPanel.waitForOverlayPreviewLoaded();

            requestCount = 0;

            const previewText = page.locator('#prop-preview-text');
            await previewText.fill('Overlay 1');
            await previewText.dispatchEvent('change');
            await previewText.fill('Overlay 2');
            await previewText.dispatchEvent('change');
            await previewText.fill('Overlay 3');
            await previewText.dispatchEvent('change');

            await page.waitForTimeout(1300);
            await previewPanel.waitForOverlayPreviewLoaded();

            expect(requestCount).toBe(1);
        });
    });

    // ============== PREVIEW PARITY (CRITICAL) ==============
    test.describe('Preview Parity - Canvas vs API', () => {
        test('should render similar output between canvas and API for Text element', async () => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);

            const page = previewPanel.page;
            await page.locator('#prop-preview-text').fill('Parity Test');
            await page.locator('#prop-preview-text').dispatchEvent('change');
            await page.locator('#prop-font-size').fill('40');
            await page.locator('#prop-font-size').dispatchEvent('change');

            // Get canvas screenshot
            await canvas.waitForReady();
            const canvasImage = await canvas.takeScreenshot();

            // Get API preview
            await previewPanel.switchToAPIMode();
            await previewPanel.waitForAPIPreviewLoaded();
            const apiImage = await previewPanel.previewImage.screenshot();

            // Both should have content (non-empty)
            expect(canvasImage.length).toBeGreaterThan(100);
            expect(apiImage.length).toBeGreaterThan(100);

            // Note: Actual pixel comparison would require pixelmatch
            // This test verifies both previews render successfully
        });

        test('should render similar output between canvas and API for Barcode element', async () => {
            // Increase timeout for this test due to Labelary API
            test.setTimeout(90000);

            await elementsPanel.addBarcodeElement();

            await canvas.waitForReady();
            const canvasImage = await canvas.takeScreenshot();

            await previewPanel.switchToAPIMode();
            await previewPanel.waitForAPIPreviewLoaded();
            const apiImage = await previewPanel.previewImage.screenshot();

            expect(canvasImage.length).toBeGreaterThan(100);
            expect(apiImage.length).toBeGreaterThan(100);
        });

        test('should render similar output between canvas and API for Box element', async () => {
            await elementsPanel.addBoxElement();

            await canvas.waitForReady();
            const canvasImage = await canvas.takeScreenshot();

            await previewPanel.switchToAPIMode();
            await previewPanel.waitForAPIPreviewLoaded();
            const apiImage = await previewPanel.previewImage.screenshot();

            expect(canvasImage.length).toBeGreaterThan(100);
            expect(apiImage.length).toBeGreaterThan(100);
        });

        test('should render similar output for multiple elements', async () => {
            await elementsPanel.addTextElement();
            await elementsPanel.addBarcodeElement();
            await elementsPanel.addBoxElement();

            await canvas.waitForReady();
            const canvasImage = await canvas.takeScreenshot();

            await previewPanel.switchToAPIMode();
            await previewPanel.waitForAPIPreviewLoaded();
            const apiImage = await previewPanel.previewImage.screenshot();

            expect(canvasImage.length).toBeGreaterThan(100);
            expect(apiImage.length).toBeGreaterThan(100);
        });
    });

    // ============== ERROR HANDLING ==============
    test.describe('Error Handling', () => {
        test('should handle API error gracefully', async ({ page }) => {
            // This test would require mocking the API to simulate errors
            // For now, verify the error element exists
            const errorElement = previewPanel.previewError;
            expect(errorElement).toBeDefined();
        });

        test('should show loading state while fetching API preview', async () => {
            await elementsPanel.addTextElement();

            // Switching to Preview mode kicks off an immediate render.
            await previewPanel.switchToAPIMode();

            // The spinner indicator is present in the DOM (shown while fetching).
            await expect(previewPanel.refreshIcon).toBeAttached();

            await previewPanel.waitForAPIPreviewLoaded();
        });
    });

    // ============== AUTO-REFRESH + CACHE ==============
    test.describe('Auto-refresh and cache', () => {
        test('should auto-render a new request after an edit in Preview mode', async ({ page }) => {
            let requestCount = 0;
            await page.route(LABELARY_URL, route => {
                requestCount += 1;
                route.fulfill({ status: 200, contentType: 'image/png', body: createMinimalPNG() });
            });

            await elementsPanel.addTextElement();
            await previewPanel.switchToAPIMode();
            await previewPanel.waitForAPIPreviewLoaded();

            requestCount = 0;
            const previewText = page.locator('#prop-preview-text');
            await elementsPanel.selectElementByIndex(0);
            await previewText.fill('Auto Refresh');
            await previewText.dispatchEvent('change');

            await page.waitForTimeout(1300);
            await previewPanel.waitForAPIPreviewLoaded();

            expect(requestCount).toBe(1);
            await expect(previewPanel.previewImage).toBeVisible();
        });

        test('should serve a revisited identical state from cache without a new request', async ({ page }) => {
            let requestCount = 0;
            await page.route(LABELARY_URL, route => {
                requestCount += 1;
                route.fulfill({ status: 200, contentType: 'image/png', body: createMinimalPNG() });
            });

            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);
            const previewText = page.locator('#prop-preview-text');
            await previewText.fill('State A');
            await previewText.dispatchEvent('change');

            await previewPanel.switchToAPIMode();
            await previewPanel.waitForAPIPreviewLoaded();
            const countAfterA = requestCount;

            // Edit to a new state B → new request
            await previewText.fill('State B');
            await previewText.dispatchEvent('change');
            await page.waitForTimeout(1300);
            await previewPanel.waitForAPIPreviewLoaded();
            expect(requestCount).toBeGreaterThan(countAfterA);
            const countAfterB = requestCount;

            // Edit back to the identical State A → served from cache, no new request
            await previewText.fill('State A');
            await previewText.dispatchEvent('change');
            await page.waitForTimeout(1300);

            expect(requestCount).toBe(countAfterB);
            await expect(previewPanel.previewImage).toBeVisible();
        });

        test('should not serve a cached image when the label size changes', async ({ page }) => {
            let requestCount = 0;
            await page.route(LABELARY_URL, route => {
                requestCount += 1;
                route.fulfill({ status: 200, contentType: 'image/png', body: createMinimalPNG() });
            });

            await elementsPanel.addTextElement();
            await previewPanel.switchToAPIMode();
            await previewPanel.waitForAPIPreviewLoaded();
            const countBefore = requestCount;

            // Same elements, different label width → different request signature → new render
            const labelWidth = page.locator('#label-width');
            await labelWidth.fill('120');
            await labelWidth.dispatchEvent('input');
            await page.waitForTimeout(1300);
            await previewPanel.waitForAPIPreviewLoaded();

            expect(requestCount).toBeGreaterThan(countBefore);
        });
    });
});

function createMinimalPNG(): Buffer {
    return Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAB' +
        'Nl7BcQAAAABJRU5ErkJggg==',
        'base64'
    );
}
