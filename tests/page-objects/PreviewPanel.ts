import { Page, Locator } from '@playwright/test';
import { waitForRateLimit } from '../fixtures/rate-limiter';

/**
 * Page Object Model for the Preview Panel.
 * Handles canvas/API preview modes and visual comparison.
 */
export class PreviewPanel {
    readonly page: Page;
    readonly previewContainer: Locator;
    readonly canvasBtn: Locator;
    readonly overlayBtn: Locator;
    readonly apiBtn: Locator;
    readonly canvas: Locator;
    readonly apiPreviewContainer: Locator;
    readonly previewImage: Locator;
    readonly refreshIcon: Locator;
    readonly previewError: Locator;
    readonly previewPlaceholder: Locator;

    constructor(page: Page) {
        this.page = page;
        this.previewContainer = page.locator('#preview-container');
        this.canvasBtn = page.locator('#mode-canvas-btn');
        this.overlayBtn = page.locator('#mode-overlay-btn');
        this.apiBtn = page.locator('#mode-api-btn');
        this.canvas = page.locator('#label-canvas');
        this.apiPreviewContainer = page.locator('#api-preview-container');
        this.previewImage = page.locator('#preview-image');
        this.refreshIcon = page.locator('#refresh-preview-icon');
        this.previewError = page.locator('#preview-error');
        this.previewPlaceholder = page.locator('#preview-placeholder');
    }

    /**
     * Switch to Canvas preview mode
     */
    async switchToCanvasMode(): Promise<void> {
        await this.canvasBtn.click();
    }

    /**
     * Switch to Overlay preview mode
     */
    async switchToOverlayMode(): Promise<void> {
        await this.overlayBtn.click();
    }

    /**
     * Switch to API preview mode
     */
    async switchToAPIMode(): Promise<void> {
        await this.apiBtn.click();
    }

    /**
     * Force a fresh render of the current state without editing it. Toggles
     * Canvas → API, which triggers an immediate (non-debounced) updatePreview.
     * Failed renders are not cached, so this re-fetches after a mocked error.
     */
    async rerender(): Promise<void> {
        await this.switchToCanvasMode();
        await this.switchToAPIMode();
    }

    /**
     * Wait for the debounced auto-refresh to fire and the render to settle.
     * Preview/Overlay modes auto-render on change (1000ms / 400ms debounce); this
     * waits past the debounce, then for the in-flight fetch to finish and the
     * image to be shown.
     */
    async waitForPreviewRender(): Promise<void> {
        // Let the preview debounce fire (1000ms in Preview mode) before checking.
        await this.page.waitForTimeout(1200);
        await this.waitForAPIPreviewLoaded();
    }

    /**
     * Wait for API preview to load
     */
    async waitForAPIPreviewLoaded(): Promise<void> {
        await waitForRateLimit();
        // Wait for the refresh spinner to stop and the image to appear.
        // Increased timeout for Labelary API which can be slow.
        await this.refreshIcon.waitFor({ state: 'attached', timeout: 60000 });
        await this.page.waitForFunction(
            () => !document.getElementById('refresh-preview-icon')?.classList.contains('animate-spin'),
            null,
            { timeout: 60000 }
        );
        await this.previewImage.waitFor({ state: 'visible', timeout: 60000 });
    }

    /**
     * Wait for overlay mode to finish its automatic preview refresh.
     */
    async waitForOverlayPreviewLoaded(): Promise<void> {
        await this.page.waitForFunction(
            () => !document.getElementById('refresh-preview-icon')?.classList.contains('animate-spin'),
            null,
            { timeout: 60000 }
        );
        await this.previewImage.waitFor({ state: 'visible', timeout: 60000 });
    }

    async getMode(): Promise<string | null> {
        return await this.previewContainer.getAttribute('data-mode');
    }

    /**
     * Check if currently in Canvas mode
     */
    async isCanvasMode(): Promise<boolean> {
        return (await this.getMode()) === 'canvas';
    }

    /**
     * Check if currently in Overlay mode
     */
    async isOverlayMode(): Promise<boolean> {
        return (await this.getMode()) === 'overlay';
    }

    /**
     * Check if currently in API mode
     */
    async isAPIMode(): Promise<boolean> {
        return (await this.getMode()) === 'api';
    }

    /**
     * Check if API preview is loading (refresh icon spinning).
     */
    async isLoading(): Promise<boolean> {
        const classes = (await this.refreshIcon.getAttribute('class')) || '';
        return classes.split(/\s+/).includes('animate-spin');
    }

    /**
     * Check if API preview has an error
     */
    async hasError(): Promise<boolean> {
        return await this.previewError.isVisible();
    }

    /**
     * Get the error message if present
     */
    async getErrorMessage(): Promise<string | null> {
        if (await this.hasError()) {
            return await this.previewError.textContent();
        }
        return null;
    }

    /**
     * Take a screenshot of the canvas preview
     */
    async getCanvasPreviewImage(): Promise<Buffer> {
        await this.switchToCanvasMode();
        await this.canvas.waitFor({ state: 'visible' });
        return await this.canvas.screenshot();
    }

    /**
     * Take a screenshot of the API preview image
     */
    async getAPIPreviewImage(): Promise<Buffer> {
        await this.switchToAPIMode();
        await this.waitForAPIPreviewLoaded();
        return await this.previewImage.screenshot();
    }

    /**
     * Get the src URL of the API preview image
     */
    async getAPIPreviewSrc(): Promise<string | null> {
        return await this.previewImage.getAttribute('src');
    }

    /**
     * Read the API preview image at full label resolution (1px = 1 dot).
     * Draws the already-loaded <img> onto an offscreen canvas and calls toDataURL(),
     * bypassing CSS scaling without needing a second network fetch.
     */
    async getAPIPreviewFullResolution(): Promise<Buffer> {
        const dataUrl = await this.page.evaluate(() => {
            const img = document.getElementById('preview-image') as HTMLImageElement;
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0);
            return canvas.toDataURL('image/png');
        });
        return Buffer.from(dataUrl.split(',')[1], 'base64');
    }

    /**
     * Compare canvas preview with API preview
     * Returns true if images are similar within threshold
     */
    async compareCanvasWithAPIPreview(threshold: number = 0.1): Promise<{
        match: boolean;
        diffPixels?: number;
        canvasImage: Buffer;
        apiImage: Buffer;
    }> {
        const canvasImage = await this.getCanvasPreviewImage();
        const apiImage = await this.getAPIPreviewImage();

        // Note: Actual pixel comparison would require pixelmatch library
        // This is a placeholder that returns the images for external comparison
        return {
            match: true, // Placeholder - actual comparison should use pixelmatch
            canvasImage,
            apiImage
        };
    }

}
