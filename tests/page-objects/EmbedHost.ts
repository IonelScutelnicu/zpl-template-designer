import { Page, FrameLocator, Locator, expect } from '@playwright/test';

/**
 * Page Object Model for the embed demo host page (embed/demo.html), which
 * iframes the editor in embed mode and exercises the postMessage protocol.
 */
export class EmbedHost {
    readonly page: Page;
    readonly frame: FrameLocator;
    readonly status: Locator;
    readonly result: Locator;
    readonly loadTemplateBtn: Locator;
    readonly loadZplBtn: Locator;
    readonly openTabBtn: Locator;
    readonly setPreviewDataBtn: Locator;

    constructor(page: Page) {
        this.page = page;
        this.frame = page.frameLocator('#editor-container iframe');
        this.status = page.locator('#status');
        this.result = page.locator('#result');
        this.loadTemplateBtn = page.locator('#load-template-btn');
        this.loadZplBtn = page.locator('#load-zpl-btn');
        this.openTabBtn = page.locator('#open-tab-btn');
        this.setPreviewDataBtn = page.locator('#set-preview-data-btn');
    }

    /** Navigate to the demo and wait for the ready handshake. */
    async goto(): Promise<void> {
        await this.page.goto('/embed/demo.html');
        await expect(this.status).toHaveText('editor ready', { timeout: 15000 });
    }

    async expectStatus(text: string): Promise<void> {
        await expect(this.status).toHaveText(text);
    }

    /** The last save payload rendered by the demo page. */
    async getResultText(): Promise<string> {
        return await this.result.textContent() ?? '';
    }
}
