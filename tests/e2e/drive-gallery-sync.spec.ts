import { test as base, expect } from '@playwright/test';
import { setupLabelaryCacheInterceptor } from '../fixtures/labelary-cache';

const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/**';
const DRIVE_LIST_URL = 'https://www.googleapis.com/drive/v3/files?*';
const GIS_URL = '**/accounts.google.com/gsi/client';

const test = base.extend<{}>({
    page: async ({ page }, use) => {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await setupLabelaryCacheInterceptor(page);

        await page.addInitScript(() => {
            localStorage.setItem('zebra-walkthrough-complete', '1');
            (window as unknown as { __E2E__: boolean }).__E2E__ = true;
            localStorage.setItem('zebra.drive.token', 'mock-token');
            localStorage.setItem('zebra.drive.token_expiry', String(Date.now() + 3600000));
            localStorage.setItem('zebra.drive.folder_id', 'mock-folder');
            localStorage.setItem('zebra.drive.folder_name', 'Test Folder');
            localStorage.setItem('zebra.drive.profile', JSON.stringify({
                name: 'Test User', email: 'test@example.com', picture: '',
            }));
        });

        // Mock GIS script with a functional token client
        await page.route(GIS_URL, route =>
            route.fulfill({
                status: 200,
                contentType: 'application/javascript',
                body: `window.google = { accounts: { oauth2: {
                    initTokenClient: function(config) {
                        return {
                            callback: config.callback,
                            requestAccessToken: function(opts) {
                                this.callback({ access_token: 'mock-token', expires_in: 3600 });
                            }
                        };
                    },
                    revoke: function(token, cb) { if (cb) cb(); }
                }}};`,
            })
        );

        // Mock Google userinfo API (for refreshProfileIfMissing)
        await page.route('**/googleapis.com/oauth2/**', route =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ name: 'Test User', email: 'test@example.com', picture: '' }),
            })
        );

        // Mock Drive list → empty folder
        await page.route(DRIVE_LIST_URL, route =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ files: [] }),
            })
        );

        const originalGoto = page.goto.bind(page);
        page.goto = async (url, options?) => {
            const response = await originalGoto(url, options);
            if (url && !url.startsWith('about:')) {
                await page.waitForFunction(
                    () => document.documentElement.dataset.viewReady !== undefined,
                    { timeout: 15000 }
                );
            }
            return response;
        };

        await use(page);
    },
});

async function switchToView(page: import('@playwright/test').Page, view: 'editor' | 'gallery') {
    await page.locator(`#view-tab-${view}`).click();
    await page.waitForFunction(
        (v) => document.documentElement.dataset.viewReady === v,
        view,
        { timeout: 15000 }
    );
}

async function saveNewToDrive(page: import('@playwright/test').Page, name: string, desc: string) {
    await page.locator('#add-text-btn').click();
    await expect(page.locator('#elements-list .element-item')).toHaveCount(1, { timeout: 5000 });

    await page.locator('#zpl-more-btn').click();
    await expect(page.locator('#drive-menu-save')).toBeVisible();
    await expect(page.locator('#drive-menu-save')).toBeEnabled();
    await page.locator('#drive-menu-save').click();

    await expect(page.locator('#export-gallery-modal')).toBeVisible({ timeout: 5000 });
    await page.locator('#gallery-name').fill(name);
    await page.locator('#gallery-desc').fill(desc);
    await page.locator('#export-gallery-confirm-btn').click();

    await expect(page.locator('#toast-host')).toContainText('Saved to Drive', { timeout: 10000 });
}

test.describe('Drive → Gallery cache sync', () => {

    test('saving a new template to Drive makes it appear in gallery without reload', async ({ page }) => {
        await page.route(DRIVE_UPLOAD_URL, route =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    id: 'new-file-123',
                    name: 'My Test Template.json',
                    modifiedTime: new Date().toISOString(),
                    createdTime: new Date().toISOString(),
                }),
            })
        );

        // Initialize gallery first so event listener is registered
        await page.goto('/?view=gallery');
        await expect(page.locator('#view-gallery')).not.toBeHidden();

        // Switch to editor
        await switchToView(page, 'editor');

        await saveNewToDrive(page, 'My Test Template', 'A test template');

        // Switch to gallery — card should already be injected
        await switchToView(page, 'gallery');

        const card = page.locator('.tcard[data-id="drive:new-file-123"]');
        await expect(card).toBeVisible();
        await expect(card.locator('.name')).toHaveText('My Test Template');
    });

    test('header dirty dot appears on edit and clears after saving to Drive', async ({ page }) => {
        await page.route(DRIVE_UPLOAD_URL, route =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    id: 'dot-file-1',
                    name: 'Dot Test.json',
                    modifiedTime: new Date().toISOString(),
                    createdTime: new Date().toISOString(),
                }),
            })
        );

        await page.goto('/');
        await switchToView(page, 'editor');

        // Clean canvas → name shown, dot hidden.
        await expect(page.locator('#editor-doc-name')).toBeVisible();
        await expect(page.locator('#editor-doc-dot')).toBeHidden();

        // An edit makes the doc dirty → amber dot.
        await page.locator('#add-text-btn').click();
        await expect(page.locator('#elements-list .element-item')).toHaveCount(1, { timeout: 5000 });
        await expect(page.locator('#editor-doc-dot')).toBeVisible();

        // Save via the Template menu → clean again → dot hidden.
        await page.locator('#zpl-more-btn').click();
        await expect(page.locator('#drive-menu-save')).toBeEnabled();
        await page.locator('#drive-menu-save').click();
        await expect(page.locator('#export-gallery-modal')).toBeVisible({ timeout: 5000 });
        await page.locator('#gallery-name').fill('Dot Test');
        await page.locator('#gallery-desc').fill('A dirty-dot test');
        await page.locator('#export-gallery-confirm-btn').click();
        await expect(page.locator('#toast-host')).toContainText('Saved to Drive', { timeout: 10000 });

        await expect(page.locator('#editor-doc-dot')).toBeHidden();
    });

    test('saving a second template after gallery init appears instantly', async ({ page }) => {
        let uploadCount = 0;
        await page.route(DRIVE_UPLOAD_URL, route => {
            uploadCount++;
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    id: `file-${uploadCount}`,
                    name: `Template ${uploadCount}.json`,
                    modifiedTime: new Date().toISOString(),
                    createdTime: new Date().toISOString(),
                }),
            });
        });

        // Initialize gallery first
        await page.goto('/?view=gallery');
        await expect(page.locator('#view-gallery')).not.toBeHidden();

        // Switch to editor
        await switchToView(page, 'editor');

        await saveNewToDrive(page, 'Second Template', 'Another one');

        // Switch to gallery — card should already be there
        await switchToView(page, 'gallery');

        const card = page.locator('.tcard[data-id="drive:file-1"]');
        await expect(card).toBeVisible();
        await expect(card.locator('.name')).toHaveText('Second Template');
    });

    test('updating an existing Drive template updates the gallery card', async ({ page }) => {
        await page.route(DRIVE_UPLOAD_URL, route => {
            const method = route.request().method();
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    id: 'existing-file',
                    name: 'Updated Template.json',
                    modifiedTime: new Date().toISOString(),
                    ...(method === 'POST' ? { createdTime: new Date().toISOString() } : {}),
                }),
            });
        });

        // Inject a template via sessionStorage so the editor loads with a Drive file
        await page.addInitScript(() => {
            sessionStorage.setItem('gallery_template', JSON.stringify({
                metadata: { name: 'Original Name', use: 'shipping', desc: 'Original desc', tags: [] },
                elements: [{ type: 'TEXT', x: 50, y: 50, text: 'Hello', fontSize: 20, fontWidth: 20, fontId: '0' }],
                labelSettings: { width: 100, height: 50, dpmm: 8 },
                driveFileId: 'existing-file',
                driveFolderId: 'mock-folder',
            }));
        });

        // Initialize gallery first
        await page.goto('/?view=gallery');
        await expect(page.locator('#view-gallery')).not.toBeHidden();

        // Switch to editor — rehydrateFromHandoff loads the template
        await switchToView(page, 'editor');
        await expect(page.locator('#elements-list .element-item')).not.toHaveCount(0, { timeout: 10000 });

        // Silent save via Ctrl+S
        await page.keyboard.press('Control+s');
        await expect(page.locator('#toast-host')).toContainText('Saved', { timeout: 10000 });

        // Switch to gallery — card should be updated
        await switchToView(page, 'gallery');

        const card = page.locator('.tcard[data-id="drive:existing-file"]');
        await expect(card).toBeVisible();
    });

    test('gallery template count includes newly saved Drive template', async ({ page }) => {
        await page.route(DRIVE_UPLOAD_URL, route =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    id: 'count-test-file',
                    name: 'Count Test.json',
                    modifiedTime: new Date().toISOString(),
                    createdTime: new Date().toISOString(),
                }),
            })
        );

        // Visit gallery first to initialize and note the initial count. Wait for
        // the initial Drive folder listing to resolve before moving on: on gallery
        // init loadMyTemplates() runs async and assigns MY_TEMPLATES from the
        // (empty) response. Under load that response can land AFTER the
        // drive:template-saved event fires below, overwriting the just-saved
        // template and reverting the count. Settling the list first removes the race.
        await Promise.all([
            page.waitForResponse(r => /\/drive\/v3\/files\?/.test(r.url())),
            page.goto('/?view=gallery'),
        ]);
        const initialCount = await page.locator('#stat-templates').textContent();

        // Switch to editor
        await switchToView(page, 'editor');

        await saveNewToDrive(page, 'Count Test', 'Testing count');

        // Switch back to gallery
        await switchToView(page, 'gallery');

        // Count should have increased by 1
        await expect(page.locator('#stat-templates')).toHaveText(String(Number(initialCount) + 1));
    });
});
