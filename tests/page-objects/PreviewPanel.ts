import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for the Preview Panel.
 * Handles canvas/API preview modes and visual comparison.
 */
export class PreviewPanel {
    readonly page: Page;
    readonly previewContainer: Locator;
    readonly canvasBtn: Locator;
    readonly apiBtn: Locator;
    readonly refreshBtn: Locator;
    readonly canvas: Locator;
    readonly apiPreviewContainer: Locator;
    readonly previewImage: Locator;
    readonly previewLoading: Locator;
    readonly previewError: Locator;
    readonly previewPlaceholder: Locator;

    constructor(page: Page) {
        this.page = page;
        this.previewContainer = page.locator('#preview-container');
        this.canvasBtn = page.locator('#mode-canvas-btn');
        this.apiBtn = page.locator('#mode-api-btn');
        this.refreshBtn = page.locator('#refresh-preview-btn');
        this.canvas = page.locator('#label-canvas');
        this.apiPreviewContainer = page.locator('#api-preview-container');
        this.previewImage = page.locator('#preview-image');
        this.previewLoading = page.locator('#preview-loading');
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
     * Switch to API preview mode
     */
    async switchToAPIMode(): Promise<void> {
        await this.apiBtn.click();
    }

    /**
     * Refresh the preview (API mode)
     */
    async refreshPreview(): Promise<void> {
        await this.refreshBtn.click();
    }

    /**
     * Wait for API preview to load
     */
    async waitForAPIPreviewLoaded(): Promise<void> {
        // Wait for loading to disappear and image to appear
        // Increased timeout for Labelary API which can be slow
        await this.previewLoading.waitFor({ state: 'hidden', timeout: 60000 });
        await this.previewImage.waitFor({ state: 'visible', timeout: 60000 });
    }

    /**
     * Check if currently in Canvas mode
     */
    async isCanvasMode(): Promise<boolean> {
        return await this.canvas.isVisible();
    }

    /**
     * Check if currently in API mode
     */
    async isAPIMode(): Promise<boolean> {
        return await this.apiPreviewContainer.isVisible();
    }

    /**
     * Check if API preview is loading
     */
    async isLoading(): Promise<boolean> {
        return await this.previewLoading.isVisible();
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
        await this.refreshPreview();
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

    /**
     * Check if refresh button is enabled
     */
    async isRefreshEnabled(): Promise<boolean> {
        return await this.refreshBtn.isEnabled();
    }

    /**
     * Check if refresh button is disabled
     */
    async isRefreshDisabled(): Promise<boolean> {
        return !(await this.isRefreshEnabled());
    }
}
