import { test, expect } from '../fixtures';
import { Canvas, ElementsPanel, Fullscreen, PropertiesPanel } from '../page-objects';

test.describe('Fullscreen editor', () => {
    let fullscreen: Fullscreen;
    let canvas: Canvas;
    let elementsPanel: ElementsPanel;
    let propertiesPanel: PropertiesPanel;

    test.beforeEach(async ({ page }) => {
        await page.goto('/?e2e=1');
        fullscreen = new Fullscreen(page);
        canvas = new Canvas(page);
        elementsPanel = new ElementsPanel(page);
        propertiesPanel = new PropertiesPanel(page);
        await canvas.waitForReady();
        // Defensive: the fullscreen state is module-global on app.js, so make
        // sure we're starting in normal mode even if a prior test left it on.
        await fullscreen.exit();
    });

    test.describe('Toggle button', () => {
        test('entering applies is-fullscreen and updates icon/label/tooltip', async () => {
            expect(await fullscreen.isOn()).toBe(false);

            await fullscreen.toggle();

            await expect(fullscreen.viewEditor).toHaveClass(/\bis-fullscreen\b/);
            await expect(fullscreen.toggleLabel).toHaveText('Exit');
            await expect(fullscreen.toggleIcon).toHaveText('zoom_in_map');
            await expect(fullscreen.toggleBtn).toHaveAttribute('data-tooltip', 'Exit fullscreen (Esc)');
        });

        test('exiting removes is-fullscreen and restores icon/label/tooltip', async () => {
            await fullscreen.enter();
            await fullscreen.toggle();

            await expect(fullscreen.viewEditor).not.toHaveClass(/\bis-fullscreen\b/);
            await expect(fullscreen.toggleLabel).toHaveText('Fullscreen');
            await expect(fullscreen.toggleIcon).toHaveText('zoom_out_map');
            await expect(fullscreen.toggleBtn).toHaveAttribute('data-tooltip', 'Enter fullscreen');
        });
    });

    test.describe('Escape key', () => {
        test('exits fullscreen when on', async ({ page }) => {
            await fullscreen.enter();
            expect(await fullscreen.isOn()).toBe(true);

            await page.keyboard.press('Escape');

            await expect(fullscreen.viewEditor).not.toHaveClass(/\bis-fullscreen\b/);
            expect(await fullscreen.isOn()).toBe(false);
        });

        test('does not enter fullscreen when off', async ({ page }) => {
            expect(await fullscreen.isOn()).toBe(false);

            await page.keyboard.press('Escape');

            expect(await fullscreen.isOn()).toBe(false);
        });
    });

    test.describe('DOM teleports', () => {
        test('on enter: zoom-controls moves to body and toggle button moves to header', async () => {
            // Pre-conditions
            expect(await fullscreen.zoomControlsParentId()).toBe('preview-container');
            await expect(fullscreen.toggleBtn).toHaveClass(/\bfullscreen-btn-floating\b/);

            await fullscreen.enter();

            expect(await fullscreen.zoomControlsParentIsBody()).toBe(true);
            await expect(fullscreen.zoomControls).toHaveClass(/\bfs-zoom-detached\b/);
            expect(await fullscreen.toggleBtnParentId()).toBe('header-controls');
            await expect(fullscreen.toggleBtn).not.toHaveClass(/\bfullscreen-btn-floating\b/);
        });

        test('on exit: both elements are restored to their original parents', async () => {
            await fullscreen.enter();
            await fullscreen.exit();

            expect(await fullscreen.zoomControlsParentId()).toBe('preview-container');
            await expect(fullscreen.zoomControls).not.toHaveClass(/\bfs-zoom-detached\b/);
            expect(await fullscreen.toggleBtnParentId()).not.toBe('header-controls');
            await expect(fullscreen.toggleBtn).toHaveClass(/\bfullscreen-btn-floating\b/);
        });
    });

    test.describe('Card collapse state on enter', () => {
        test('settings is collapsed; elements + properties are open; warnings chip is collapsed', async () => {
            await fullscreen.enter();

            await expect(fullscreen.settingsCard).toHaveClass(/\bfs-collapsed\b/);
            await expect(fullscreen.elementsCard).not.toHaveClass(/\bfs-collapsed\b/);
            await expect(fullscreen.propertiesCard).not.toHaveClass(/\bfs-collapsed\b/);
            await expect(fullscreen.warningsPanel).not.toHaveClass(/\bfs-chip-expanded\b/);
        });

        test('on exit: all card collapse classes are cleared', async () => {
            await fullscreen.enter();
            // Force every card into the collapsed state — the elements-card chevron
            // header is hidden in fullscreen, so we set the class directly. The point
            // of this test is exit()'s cleanup, not how a user reaches the state.
            await fullscreen.elementsCard.evaluate((el) => el.classList.add('fs-collapsed'));
            await fullscreen.propertiesCard.evaluate((el) => el.classList.add('fs-collapsed'));
            await fullscreen.warningsPanel.evaluate((el) => el.classList.add('fs-chip-expanded'));
            await expect(fullscreen.elementsCard).toHaveClass(/\bfs-collapsed\b/);

            await fullscreen.exit();

            await expect(fullscreen.settingsCard).not.toHaveClass(/\bfs-collapsed\b/);
            await expect(fullscreen.elementsCard).not.toHaveClass(/\bfs-collapsed\b/);
            await expect(fullscreen.propertiesCard).not.toHaveClass(/\bfs-collapsed\b/);
            await expect(fullscreen.warningsPanel).not.toHaveClass(/\bfs-chip-expanded\b/);
        });
    });

    test.describe('<details> open-state save/restore in settings-card', () => {
        test('a closed details is force-opened on enter (with data-fs-prev-open=0) and restored on exit', async ({ page }) => {
            const firstDetails = page.locator('#settings-card details').first();
            await expect(firstDetails).toHaveCount(1);

            // Force closed before entering
            await firstDetails.evaluate((el: HTMLDetailsElement) => { el.open = false; });
            expect(await firstDetails.evaluate((el: HTMLDetailsElement) => el.open)).toBe(false);

            await fullscreen.enter();

            expect(await firstDetails.evaluate((el: HTMLDetailsElement) => el.open)).toBe(true);
            await expect(firstDetails).toHaveAttribute('data-fs-prev-open', '0');

            await fullscreen.exit();

            expect(await firstDetails.evaluate((el: HTMLDetailsElement) => el.open)).toBe(false);
            // Attribute removed after restore
            expect(await firstDetails.getAttribute('data-fs-prev-open')).toBeNull();
        });
    });

    test.describe('Icon-rail active tab', () => {
        test('defaults to "add" on enter', async () => {
            await fullscreen.enter();

            await expect(fullscreen.viewEditor).toHaveAttribute('data-fs-active-tab', 'add');
            await expect(fullscreen.iconRailButton('add')).toHaveClass(/\bactive\b/);
        });

        test('clicking another icon switches the active tab', async () => {
            await fullscreen.enter();

            await fullscreen.iconRailButton('layers').click();

            await expect(fullscreen.viewEditor).toHaveAttribute('data-fs-active-tab', 'layers');
            await expect(fullscreen.iconRailButton('layers')).toHaveClass(/\bactive\b/);
            await expect(fullscreen.iconRailButton('add')).not.toHaveClass(/\bactive\b/);
        });
    });

    test.describe('ZPL collapse toggle', () => {
        test('starts collapsed; click toggles class, icon, and tooltip', async () => {
            await fullscreen.enter();

            // Default on enter: zpl-collapsed is applied
            await expect(fullscreen.viewEditor).toHaveClass(/\bzpl-collapsed\b/);
            await expect(fullscreen.zplCollapseIcon).toHaveText('expand_more');
            await expect(fullscreen.zplCollapseBtn).toHaveAttribute('data-tooltip', 'Expand');

            await fullscreen.zplCollapseBtn.click();
            await expect(fullscreen.viewEditor).not.toHaveClass(/\bzpl-collapsed\b/);
            await expect(fullscreen.zplCollapseIcon).toHaveText('expand_less');
            await expect(fullscreen.zplCollapseBtn).toHaveAttribute('data-tooltip', 'Collapse');

            await fullscreen.zplCollapseBtn.click();
            await expect(fullscreen.viewEditor).toHaveClass(/\bzpl-collapsed\b/);
            await expect(fullscreen.zplCollapseIcon).toHaveText('expand_more');
            await expect(fullscreen.zplCollapseBtn).toHaveAttribute('data-tooltip', 'Expand');
        });
    });

    test.describe('Inline ZPL preview', () => {
        test('reflects current ZPL on a single line and updates on element edits', async () => {
            await elementsPanel.addTextElement();
            await canvas.waitForReady();
            await fullscreen.enter();

            const initial = (await fullscreen.zplOutputInline.textContent()) || '';
            expect(initial.length).toBeGreaterThan(0);
            expect(initial).not.toContain('\n');
            expect(initial).toMatch(/\^XA/);

            // Edit the text content so the ZPL must regenerate.
            await propertiesPanel.setProperty('prop-preview-text', 'INLINE-FS-PROBE');

            await expect(fullscreen.zplOutputInline).toContainText('INLINE-FS-PROBE');
            const updated = (await fullscreen.zplOutputInline.textContent()) || '';
            expect(updated).not.toContain('\n');
        });
    });

    test.describe('--hdr CSS variable', () => {
        test('is set to a non-empty px value on enter', async () => {
            await fullscreen.enter();

            const hdr = await fullscreen.getHeaderVar();
            expect(hdr).toMatch(/^\d+px$/);
        });
    });

    test.describe('Cross-view persistence', () => {
        test('is-fullscreen survives a round trip through the templates view', async ({ page }) => {
            await fullscreen.enter();
            await expect(fullscreen.viewEditor).toHaveClass(/\bis-fullscreen\b/);

            await page.locator('#view-tab-gallery').click();
            await page.waitForFunction(
                () => document.documentElement.dataset.viewReady === 'gallery'
            );
            // Class persists on the (now-hidden) editor container
            await expect(fullscreen.viewEditor).toHaveClass(/\bis-fullscreen\b/);

            await page.locator('#view-tab-editor').click();
            await page.waitForFunction(
                () => document.documentElement.dataset.viewReady === 'editor'
            );

            await expect(fullscreen.viewEditor).toHaveClass(/\bis-fullscreen\b/);
            await expect(fullscreen.toggleLabel).toHaveText('Exit');
        });
    });
});
