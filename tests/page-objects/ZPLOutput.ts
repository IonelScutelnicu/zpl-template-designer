import { Page, Locator, expect } from '@playwright/test';

/**
 * Page Object Model for the ZPL Output section.
 * Handles retrieving and validating ZPL code.
 */
export class ZPLOutput {
    readonly page: Page;
    readonly output: Locator;
    readonly highlightedOutput: Locator;
    readonly copyBtn: Locator;
    readonly moreBtn: Locator;
    readonly moreMenu: Locator;
    readonly exportBtn: Locator;
    readonly shareBtn: Locator;
    readonly importBtn: Locator;
    readonly importFile: Locator;

    constructor(page: Page) {
        this.page = page;
        this.output = page.locator('#zpl-output-raw');
        this.highlightedOutput = page.locator('#zpl-output-highlight');
        this.copyBtn = page.locator('#copy-btn');
        this.moreBtn = page.locator('#zpl-more-btn');
        this.moreMenu = page.locator('#zpl-more-menu');
        this.exportBtn = page.locator('#export-btn');
        this.shareBtn = page.locator('#share-btn');
        this.importBtn = page.locator('#import-btn');
        this.importFile = page.locator('#import-file');
    }

    async openMoreActions(): Promise<void> {
        const isExpanded = await this.moreBtn.getAttribute('aria-expanded');
        if (isExpanded !== 'true') {
            await this.moreBtn.click();
        }
        await expect(this.moreMenu).toBeVisible();
    }

    /**
     * Get the full ZPL code from the output textarea
     */
    async getZPLCode(): Promise<string> {
        return await this.output.inputValue();
    }

    async getHighlightedHtml(): Promise<string> {
        return await this.highlightedOutput.innerHTML();
    }

    /**
     * Copy the ZPL code to clipboard
     */
    async copyToClipboard(): Promise<void> {
        await this.copyBtn.click();
    }

    /**
     * Get the clipboard contents after copying
     * Note: Requires clipboard permissions in browser context
     */
    async getClipboardContent(): Promise<string> {
        return await this.page.evaluate(async () => {
            return await navigator.clipboard.readText();
        });
    }

    /**
     * Verify that the ZPL output contains a specific string
     */
    async verifyZPLContains(expectedZPL: string): Promise<void> {
        // Use web-first assertion with regex to allow retries and partial matching
        // Escape special regex characters in the expected string
        const escaped = expectedZPL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        await expect(this.output).toHaveValue(new RegExp(escaped));
    }

    /**
     * Verify that the ZPL output does not contain a specific string
     */
    async verifyZPLNotContains(unexpectedZPL: string): Promise<void> {
        const zpl = await this.getZPLCode();
        expect(zpl).not.toContain(unexpectedZPL);
    }

    /**
     * Verify exact ZPL output match
     */
    async verifyZPLEquals(expectedZPL: string): Promise<void> {
        const zpl = await this.getZPLCode();
        expect(zpl.trim()).toBe(expectedZPL.trim());
    }

    /**
     * Verify the ZPL starts with ^XA (required for valid ZPL)
     */
    async verifyValidZPLStart(): Promise<void> {
        const zpl = await this.getZPLCode();
        expect(zpl.trim()).toMatch(/^\^XA/);
    }

    /**
     * Verify the ZPL ends with ^XZ (required for valid ZPL)
     */
    async verifyValidZPLEnd(): Promise<void> {
        const zpl = await this.getZPLCode();
        expect(zpl.trim()).toMatch(/\^XZ$/);
    }

    /**
     * Verify ZPL has valid start and end markers
     */
    async verifyValidZPLFormat(): Promise<void> {
        await this.verifyValidZPLStart();
        await this.verifyValidZPLEnd();
    }

    /**
     * Export the template as JSON
     * Note: This will trigger a download
     */
    async exportTemplate(): Promise<void> {
        await this.openMoreActions();
        await this.exportBtn.click();
    }

    /**
     * Import a template from a JSON file
     */
    async importTemplate(filePath: string): Promise<void> {
        await this.importFile.setInputFiles(filePath);
    }

    /**
     * Import JSON content directly (creates a temporary file)
     */
    async importTemplateFromJSON(jsonContent: string): Promise<void> {
        // Create a file chooser promise before clicking import
        const fileChooserPromise = this.page.waitForEvent('filechooser');
        await this.openMoreActions();
        await this.importBtn.click();
        const fileChooser = await fileChooserPromise;

        // Create a temporary buffer with the JSON content
        const buffer = Buffer.from(jsonContent);
        await fileChooser.setFiles({
            name: 'template.json',
            mimeType: 'application/json',
            buffer: buffer
        });
    }

    /**
     * Count occurrences of a pattern in ZPL output
     */
    async countPatternOccurrences(pattern: string | RegExp): Promise<number> {
        const zpl = await this.getZPLCode();
        if (typeof pattern === 'string') {
            return (zpl.match(new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
        }
        return (zpl.match(pattern) || []).length;
    }
}
