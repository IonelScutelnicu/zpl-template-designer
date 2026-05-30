import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for the FullscreenController editor surface.
 * Exposes the toggle button, ZPL collapse button, icon-rail tabs,
 * and convenience helpers for entering / exiting fullscreen.
 */
export class Fullscreen {
    readonly page: Page;
    readonly viewEditor: Locator;
    /** Floating "Enter fullscreen" button on the canvas (normal view only). */
    readonly toggleBtn: Locator;
    readonly toggleIcon: Locator;
    readonly toggleLabel: Locator;
    /** Static "Exit fullscreen" button in the header (fullscreen only). */
    readonly exitBtn: Locator;
    readonly zplCollapseBtn: Locator;
    readonly zplCollapseIcon: Locator;
    readonly zplOutputInline: Locator;
    readonly iconRail: Locator;
    readonly zoomControls: Locator;
    readonly headerControls: Locator;
    readonly elementsCard: Locator;
    readonly propertiesCard: Locator;
    readonly settingsCard: Locator;
    readonly warningsPanel: Locator;

    constructor(page: Page) {
        this.page = page;
        this.viewEditor = page.locator('#view-editor');
        this.toggleBtn = page.locator('#fullscreen-toggle-btn');
        this.toggleIcon = page.locator('#fullscreen-toggle-icon');
        this.toggleLabel = page.locator('#fullscreen-toggle-label');
        this.exitBtn = page.locator('#fullscreen-exit-btn');
        this.zplCollapseBtn = page.locator('#zpl-collapse-btn');
        this.zplCollapseIcon = page.locator('#zpl-collapse-icon');
        this.zplOutputInline = page.locator('#zpl-output-inline');
        this.iconRail = page.locator('#fs-icon-rail');
        this.zoomControls = page.locator('#zoom-controls');
        this.headerControls = page.locator('#header-controls');
        this.elementsCard = page.locator('#elements-card');
        this.propertiesCard = page.locator('#properties-card');
        this.settingsCard = page.locator('#settings-card');
        this.warningsPanel = page.locator('#warnings-panel');
    }

    /** Enter fullscreen — idempotent. */
    async enter(): Promise<void> {
        if (!(await this.isOn())) await this.toggleBtn.click();
    }

    /** Exit fullscreen — idempotent. */
    async exit(): Promise<void> {
        if (await this.isOn()) await this.exitBtn.click();
    }

    /** Toggle fullscreen state using the appropriate button for the current state. */
    async toggle(): Promise<void> {
        if (await this.isOn()) await this.exitBtn.click();
        else await this.toggleBtn.click();
    }

    /** Whether #view-editor currently has the is-fullscreen class. */
    async isOn(): Promise<boolean> {
        const cls = (await this.viewEditor.getAttribute('class')) || '';
        return cls.split(/\s+/).includes('is-fullscreen');
    }

    /** Locator for an icon-rail button by its data-fs-tab value. */
    iconRailButton(tab: string): Locator {
        return this.iconRail.locator(`.fs-icon-btn[data-fs-tab="${tab}"]`);
    }

    /** Read the --hdr CSS variable set on #view-editor on enter. */
    async getHeaderVar(): Promise<string> {
        return await this.viewEditor.evaluate(
            (el) => getComputedStyle(el).getPropertyValue('--hdr').trim()
        );
    }

    /** Read the id of the parentElement of #zoom-controls (for teleport assertions). */
    async zoomControlsParentId(): Promise<string> {
        return await this.zoomControls.evaluate((el) => el.parentElement?.id || '');
    }

    /** Read whether #zoom-controls' parentElement is document.body. */
    async zoomControlsParentIsBody(): Promise<boolean> {
        return await this.zoomControls.evaluate((el) => el.parentElement === document.body);
    }

}
