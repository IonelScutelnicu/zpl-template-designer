import { test as base, expect, Page } from '@playwright/test';
import { EmbedHost } from '../page-objects';
import { setupLabelaryCacheInterceptor } from '../fixtures/labelary-cache';

// The shared fixture's goto override waits for the app's viewReady marker,
// which the demo host page never sets — so this spec does its own setup.
// The walkthrough-suppression init script goes on the context so it also
// applies to the new-tab popup.
const test = base.extend<{}>({
    page: async ({ page, context }, use) => {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await setupLabelaryCacheInterceptor(page);
        await context.addInitScript(() => {
            try { localStorage.setItem('zebra-walkthrough-complete', '1'); } catch { }
        });
        await use(page);
    },
});

test.describe('Embed mode', () => {
    test('demo host completes the ready handshake', async ({ page }) => {
        const host = new EmbedHost(page);
        await host.goto();
    });

    test('embed chrome is trimmed inside the iframe', async ({ page }) => {
        const host = new EmbedHost(page);
        await host.goto();
        await expect(host.frame.locator('#view-toggle')).toBeHidden();
        await expect(host.frame.locator('#tour-btn')).toBeHidden();
        await expect(host.frame.locator('#drive-auth-chip')).toBeHidden();
        await expect(host.frame.locator('#embed-save-btn')).toBeVisible();
        await expect(host.frame.locator('#embed-cancel-btn')).toBeVisible();
    });

    test('loadTemplate populates the editor and save round-trips the result', async ({ page }) => {
        const host = new EmbedHost(page);
        await host.goto();

        await host.loadTemplateBtn.click();
        await expect(host.frame.locator('#elements-list .element-item')).toHaveCount(1);
        await expect(host.frame.locator('#elements-list')).toContainText('Hello from host');

        await host.frame.locator('#embed-save-btn').click();
        await host.expectStatus('saved');
        const result = await host.getResultText();
        expect(result).toContain('"previewText": "Hello from host"');
        expect(result).toContain('^XA');
        expect(result).toContain('^XZ');
    });

    test('loadZPL parses ZPL into elements', async ({ page }) => {
        const host = new EmbedHost(page);
        await host.goto();

        await host.loadZplBtn.click();
        await expect(host.frame.locator('#elements-list .element-item')).toHaveCount(2);
        await expect(host.frame.locator('#elements-list')).toContainText('Sample ZPL');
    });

    test('user edits emit a change ping; cancel notifies the host', async ({ page }) => {
        const host = new EmbedHost(page);
        await host.goto();

        await host.frame.locator('#add-text-btn').click();
        await host.expectStatus('unsaved changes');

        await host.frame.locator('#embed-cancel-btn').click();
        await host.expectStatus('cancelled');
    });

    test('invalid template payload reports an error to the host', async ({ page }) => {
        const host = new EmbedHost(page);
        await host.goto();

        await page.evaluate(() => {
            const iframe = document.querySelector('iframe') as HTMLIFrameElement;
            iframe.contentWindow!.postMessage(
                { source: 'zpl-designer-host', version: 1, type: 'loadTemplate', payload: { template: { nope: true } } },
                '*',
            );
        });
        await host.expectStatus('error: Invalid template');
    });

    test('protocol-version mismatches are ignored', async ({ page }) => {
        const host = new EmbedHost(page);
        await host.goto();
        await host.loadTemplateBtn.click();
        await expect(host.frame.locator('#elements-list .element-item')).toHaveCount(1);

        await page.evaluate(() => {
            const iframe = document.querySelector('iframe') as HTMLIFrameElement;
            iframe.contentWindow!.postMessage(
                { source: 'zpl-designer-host', version: 99, type: 'loadTemplate', payload: { template: null } },
                '*',
            );
        });
        // Element still present — the message was ignored.
        await expect(host.frame.locator('#elements-list .element-item')).toHaveCount(1);
    });

    test('?embed=1&view=gallery still lands on the editor', async ({ page }) => {
        await page.goto('/?embed=1&view=gallery');
        await page.waitForFunction(() => document.documentElement.dataset.viewReady !== undefined);
        await expect(page.locator('#view-editor')).toBeVisible();
        await expect(page.locator('#view-gallery')).toBeHidden();
    });

    test('standalone app is unchanged (regression guard)', async ({ page }) => {
        await page.goto('/');
        await page.waitForFunction(() => document.documentElement.dataset.viewReady !== undefined);
        await expect(page.locator('#view-toggle')).toBeVisible();
        await expect(page.locator('#embed-save-btn')).toBeHidden();
        await expect(page.locator('#embed-cancel-btn')).toBeHidden();
    });

    test('messages from a window other than the host are ignored', async ({ page }) => {
        const host = new EmbedHost(page);
        await host.goto();
        await host.loadTemplateBtn.click();
        await expect(host.frame.locator('#elements-list .element-item')).toHaveCount(1);

        // A sibling same-origin iframe posts a valid loadTemplate at the
        // editor window — its event.source is not the editor's parent, so
        // the bridge must drop it.
        await page.evaluate(() => {
            const evil = document.createElement('iframe');
            document.body.appendChild(evil);
            const script = evil.contentWindow!.document.createElement('script');
            script.textContent = `
                parent.document.querySelector('#editor-container iframe').contentWindow.postMessage(
                    { source: 'zpl-designer-host', version: 1, type: 'loadTemplate',
                      payload: { template: { elements: [], labelSettings: { width: 10, height: 10, dpmm: 8 } } } },
                    '*');
            `;
            evil.contentWindow!.document.body.appendChild(script);
        });
        // Content unchanged — the spoofed message was ignored.
        await expect(host.frame.locator('#elements-list .element-item')).toHaveCount(1);
    });

    test('strict sandbox (no allow-same-origin) completes the handshake and save', async ({ page }) => {
        // Opaque-origin frames fetch ES modules in CORS mode; the production
        // host (GitHub Pages) sends ACAO — emulate that for the test server.
        await page.route('http://localhost:3000/**', async (route) => {
            const response = await route.fetch();
            await route.fulfill({
                response,
                headers: { ...response.headers(), 'access-control-allow-origin': '*' },
            });
        });
        const host = new EmbedHost(page);
        await host.goto();

        // Replace the demo's default embed with a strictly sandboxed one.
        await page.evaluate(() => {
            const w = window as any;
            w.handle.destroy();
            document.getElementById('status')!.textContent = 'waiting for editor…';
            w.handle = w.ZplDesigner.embed(Object.assign({
                container: '#editor-container',
                url: new URL('..', window.location.href).href,
                sandbox: 'allow-scripts',
                template: w.sampleTemplate,
            }, w.callbacks));
        });
        await host.expectStatus('editor ready');
        await expect(host.frame.locator('#elements-list .element-item')).toHaveCount(1);
        await host.frame.locator('#embed-save-btn').click();
        await host.expectStatus('saved');
        expect(await host.getResultText()).toContain('"previewText": "Hello from host"');
    });

    test('new-tab flow round-trips a save through window.opener', async ({ page, context }) => {
        const host = new EmbedHost(page);
        await host.goto();

        const [popup] = await Promise.all([
            context.waitForEvent('page'),
            host.openTabBtn.click(),
        ]);
        await setupLabelaryCacheInterceptor(popup as Page);
        await popup.waitForFunction(() => document.documentElement.dataset.viewReady !== undefined);

        // Host re-inits the popup with the sample template on its ready message.
        await expect(popup.locator('#elements-list .element-item')).toHaveCount(1);
        await popup.locator('#embed-save-btn').click();
        await host.expectStatus('saved');
        expect(await host.getResultText()).toContain('"previewText": "Hello from host"');
    });
});
