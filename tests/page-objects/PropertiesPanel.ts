import { Page, Locator, expect } from '@playwright/test';

/**
 * Page Object Model for the Properties Panel.
 * Handles getting and setting element properties.
 */
export class PropertiesPanel {
    readonly page: Page;
    readonly panel: Locator;

    constructor(page: Page) {
        this.page = page;
        this.panel = page.locator('#properties-panel');
    }

    /**
     * Check if the properties panel shows the placeholder (no element selected)
     */
    async hasNoElementSelected(): Promise<boolean> {
        const placeholder = this.panel.locator('p.italic');
        return await placeholder.isVisible();
    }

    /**
     * Get the value of a property input by its ID
     */
    async getProperty(propertyId: string): Promise<string> {
        const input = this.panel.locator(`#${propertyId}`);
        return await input.inputValue();
    }

    /**
     * Set the value of a property input by its ID
     */
    async setProperty(propertyId: string, value: string | number): Promise<void> {
        const input = this.panel.locator(`#${propertyId}`);
        await input.fill(String(value));
        // Trigger change event
        await input.dispatchEvent('change');
    }

    /**
     * Set property and blur to ensure change is applied
     */
    async setPropertyWithBlur(propertyId: string, value: string | number): Promise<void> {
        const input = this.panel.locator(`#${propertyId}`);
        await input.fill(String(value));
        await input.blur();
    }

    /**
     * Verify that a property has the expected value
     */
    async verifyPropertyValue(propertyId: string, expectedValue: string | number): Promise<void> {
        const input = this.panel.locator(`#${propertyId}`);
        await expect(input).toHaveValue(String(expectedValue));
    }

    /**
     * Get the selected option value from a select element
     */
    async getSelectValue(selectId: string): Promise<string> {
        const select = this.panel.locator(`#${selectId}`);
        return await select.inputValue();
    }

    /**
     * Set the selected option in a select element
     */
    async setSelectValue(selectId: string, value: string): Promise<void> {
        const select = this.panel.locator(`#${selectId}`);
        await select.selectOption(value);
    }

    // Common property accessors for Text elements
    async getTextX(): Promise<string> { return this.getProperty('prop-x'); }
    async setTextX(value: number): Promise<void> { await this.setProperty('prop-x', value); }

    async getTextY(): Promise<string> { return this.getProperty('prop-y'); }
    async setTextY(value: number): Promise<void> { await this.setProperty('prop-y', value); }

    async getTextContent(): Promise<string> { return this.getProperty('prop-preview-text'); }
    async setTextContent(value: string): Promise<void> { await this.setProperty('prop-preview-text', value); }

    async getFontHeight(): Promise<string> { return this.getProperty('prop-font-size'); }
    async setFontHeight(value: number): Promise<void> { await this.setProperty('prop-font-size', value); }

    async getFontWidth(): Promise<string> { return this.getProperty('prop-font-width'); }
    async setFontWidth(value: number): Promise<void> { await this.setProperty('prop-font-width', value); }

    // Barcode properties
    async getBarcodeData(): Promise<string> { return this.getProperty('prop-preview-data'); }
    async setBarcodeData(value: string): Promise<void> { await this.setProperty('prop-preview-data', value); }

    async getBarcodeHeight(): Promise<string> { return this.getProperty('prop-height'); }
    async setBarcodeHeight(value: number): Promise<void> { await this.setProperty('prop-height', value); }

    // Box properties
    async getBoxWidth(): Promise<string> { return this.getProperty('prop-width'); }
    async setBoxWidth(value: number): Promise<void> { await this.setProperty('prop-width', value); }

    // FieldBlock properties
    async getBlockWidth(): Promise<string> { return this.getProperty('prop-block-width'); }
    async setBlockWidth(value: number): Promise<void> { await this.setProperty('prop-block-width', value); }

    async getMaxLines(): Promise<string> { return this.getProperty('prop-max-lines'); }
    async setMaxLines(value: number): Promise<void> { await this.setProperty('prop-max-lines', value); }

    async getLineSpacing(): Promise<string> { return this.getProperty('prop-line-spacing'); }
    async setLineSpacing(value: number): Promise<void> { await this.setProperty('prop-line-spacing', value); }

    async getJustification(): Promise<string> { return this.getSelectValue('prop-justification'); }
    async setJustification(value: string): Promise<void> { await this.setSelectValue('prop-justification', value); }
}
