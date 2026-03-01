import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for the Elements Panel.
 * Handles adding, selecting, and deleting elements.
 */
export class ElementsPanel {
    readonly page: Page;
    readonly addTextBlockBtn: Locator;
    readonly addFieldBlockBtn: Locator;
    readonly addTextBtn: Locator;
    readonly addBarcodeBtn: Locator;
    readonly addQRCodeBtn: Locator;
    readonly addBoxBtn: Locator;
    readonly elementsList: Locator;

    constructor(page: Page) {
        this.page = page;
        this.addTextBlockBtn = page.locator('#add-textblock-btn');
        this.addFieldBlockBtn = page.locator('#add-fieldblock-btn');
        this.addTextBtn = page.locator('#add-text-btn');
        this.addBarcodeBtn = page.locator('#add-barcode-btn');
        this.addQRCodeBtn = page.locator('#add-qrcode-btn');
        this.addBoxBtn = page.locator('#add-box-btn');
        this.elementsList = page.locator('#elements-list');
    }

    async addTextElement(): Promise<void> {
        await this.addTextBtn.click();
    }

    async addTextBlockElement(): Promise<void> {
        await this.addTextBlockBtn.click();
    }

    async addFieldBlockElement(): Promise<void> {
        await this.addFieldBlockBtn.click();
    }

    async addBarcodeElement(): Promise<void> {
        await this.addBarcodeBtn.click();
    }

    async addQRCodeElement(): Promise<void> {
        await this.addQRCodeBtn.click();
    }

    async addBoxElement(): Promise<void> {
        await this.addBoxBtn.click();
    }

    async addLineElement(): Promise<void> {
        await this.page.locator('#add-line-btn').click();
    }

    async addCircleElement(): Promise<void> {
        await this.page.locator('#add-circle-btn').click();
    }

    async getElementCount(): Promise<number> {
        // Count element items in the list (excluding the placeholder message)
        const items = this.elementsList.locator('.element-item');
        return await items.count();
    }

    async selectElementByIndex(index: number): Promise<void> {
        const items = this.elementsList.locator('.element-item');
        await items.nth(index).click();
    }

    async selectElementById(elementId: string): Promise<void> {
        await this.elementsList.locator(`.element-item[data-id="${elementId}"]`).click();
    }

    async deleteElementByIndex(index: number): Promise<void> {
        const items = this.elementsList.locator('.element-item');
        const item = items.nth(index);
        // Hover to make delete button visible
        await item.hover();
        await item.locator('.delete-btn').click();
    }

    async deleteElementById(elementId: string): Promise<void> {
        const item = this.elementsList.locator(`.element-item[data-id="${elementId}"]`);
        await item.hover();
        await item.locator('.delete-btn').click();
    }

    async deleteSelectedElement(): Promise<void> {
        // Delete via keyboard
        await this.page.keyboard.press('Delete');
    }

    async getElementIds(): Promise<string[]> {
        const items = this.elementsList.locator('.element-item');
        const count = await items.count();
        const ids: string[] = [];
        for (let i = 0; i < count; i++) {
            const id = await items.nth(i).getAttribute('data-id');
            if (id) ids.push(id);
        }
        return ids;
    }

    async isElementSelected(elementId: string): Promise<boolean> {
        const element = this.elementsList.locator(`.element-item[data-id="${elementId}"]`);
        const classAttr = await element.getAttribute('class');
        return classAttr?.includes('ring-1') || classAttr?.includes('border-blue') || false;
    }

    async hasNoElements(): Promise<boolean> {
        const placeholder = this.elementsList.locator('p.italic');
        return await placeholder.isVisible();
    }
}

