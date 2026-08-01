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
        // Panels are only hidden when the host asks (?hidePanels=).
        await expect(host.frame.locator('#zpl-card')).toBeVisible();
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

    test('SDK hidePanels option reaches the editor as ?hidePanels=', async ({ page }) => {
        const host = new EmbedHost(page);
        await host.goto();

        // A second instance on the same host page, this time with the panel
        // hidden — covers SDK option → URL param → CSS in one hop.
        await page.evaluate(() => {
            const container = document.createElement('div');
            container.id = 'panels-container';
            document.body.appendChild(container);
            (window as any).ZplDesigner.embed({
                container,
                url: new URL('..', window.location.href).href,
                hidePanels: { zplOutput: true },
            });
        });

        await expect(page.locator('#panels-container iframe')).toHaveAttribute('src', /hidePanels=zplOutput/);
        const hidden = page.frameLocator('#panels-container iframe');
        await expect(hidden.locator('#preview-card')).toBeVisible();
        await expect(hidden.locator('#zpl-card')).toBeHidden();
    });

    test('SDK hideElements option trims the Add palette without filtering content', async ({ page }) => {
        const host = new EmbedHost(page);
        await host.goto();

        await page.evaluate(() => {
            const container = document.createElement('div');
            container.id = 'elements-container';
            document.body.appendChild(container);
            (window as any).ZplDesigner.embed({
                container,
                url: new URL('..', window.location.href).href,
                hideElements: { barcode: true, qrcode: true },
                template: {
                    elements: [{ type: 'BARCODE', x: 20, y: 20, data: '12345' }],
                    labelSettings: { width: 100, height: 50, dpmm: 8 },
                },
            });
        });

        await expect(page.locator('#elements-container iframe'))
            .toHaveAttribute('src', /hideElements=barcode%2Cqrcode/);
        const frame = page.frameLocator('#elements-container iframe');
        await expect(frame.locator('#add-barcode-btn')).toBeHidden();
        await expect(frame.locator('#add-qrcode-btn')).toBeHidden();
        await expect(frame.locator('#add-text-btn')).toBeVisible();
        // Only the palette is trimmed — the host's barcode still loaded.
        await expect(frame.locator('#elements-list .element-item')).toHaveCount(1);
    });

    test('hideElements is inert outside embed mode', async ({ page }) => {
        await page.goto('/?hideElements=barcode');
        await page.waitForFunction(() => document.documentElement.dataset.viewReady !== undefined);
        await expect(page.locator('#add-barcode-btn')).toBeVisible();
    });

    test('handle.save() returns the result without the in-frame button', async ({ page }) => {
        const host = new EmbedHost(page);
        await host.goto();

        // Hide the action bar, then drive Save from the host's own control.
        await page.evaluate(() => {
            const boxes = document.querySelectorAll<HTMLInputElement>('#panels input[data-panel]');
            boxes.forEach((b) => { if (b.dataset.panel === 'actions') b.click(); });
        });
        const frame = page.frameLocator('#editor-container iframe');
        await expect(frame.locator('#embed-actions')).toBeHidden();
        await expect(frame.locator('#preview-card')).toBeVisible();

        await host.loadTemplateBtn.click();
        await expect(frame.locator('#elements-list .element-item')).toHaveCount(1);

        await page.locator('#host-save-btn').click();
        await host.expectStatus('saved');
        const result = await host.getResultText();
        expect(result).toContain('"previewText": "Hello from host"');
        expect(result).toContain('^XA');
    });

    test('hiding the action bar gives its height back to the canvas', async ({ page }) => {
        await page.goto('/?embed=1&hidePanels=actions&fullscreen=1');
        await page.waitForFunction(() => document.documentElement.dataset.viewReady !== undefined);

        await expect(page.locator('#embed-actions')).toBeHidden();
        const barVar = await page.evaluate(() =>
            getComputedStyle(document.documentElement).getPropertyValue('--embed-bar-h').trim()
        );
        expect(barVar).toBe('0px');
        // Fullscreen canvas runs to the bottom edge again.
        const card = await page.locator('#preview-card').boundingBox();
        expect(Math.round(card!.y + card!.height)).toBe(page.viewportSize()!.height);
    });

    test('fullscreen embed leaves the page with nothing to scroll', async ({ page }) => {
        // The action bar reserves its height as body padding-bottom, which in
        // fullscreen is pure overflow — the fixed panels already stop at the bar.
        await page.goto('/?embed=1&fullscreen=1');
        await page.waitForFunction(() => document.documentElement.dataset.viewReady !== undefined);

        const overflow = await page.evaluate(() => {
            const de = document.documentElement;
            return de.scrollHeight - de.clientHeight;
        });
        expect(overflow).toBe(0);
    });

    test('open() refuses to hide the action bar', async ({ page }) => {
        const host = new EmbedHost(page);
        await host.goto();

        // Stub window.open so no real popup is needed; open() returns null.
        const url = await page.evaluate(() => {
            const original = window.open;
            let captured = '';
            (window as any).open = (u: string) => { captured = u; return null; };
            (window as any).ZplDesigner.open({
                url: new URL('..', window.location.href).href,
                hidePanels: { zplOutput: true, actions: true },
            });
            window.open = original;
            return captured;
        });
        expect(url).toContain('hidePanels=zplOutput');
        expect(url).not.toContain('actions');
    });

    test('SDK fullscreen option reaches the editor as ?fullscreen=', async ({ page }) => {
        const host = new EmbedHost(page);
        await host.goto();

        await page.evaluate(() => {
            const container = document.createElement('div');
            container.id = 'fs-container';
            document.body.appendChild(container);
            (window as any).ZplDesigner.embed({
                container,
                url: new URL('..', window.location.href).href,
                fullscreen: true,
            });
        });

        await expect(page.locator('#fs-container iframe')).toHaveAttribute('src', /fullscreen=1/);
        await expect(page.frameLocator('#fs-container iframe').locator('#view-editor'))
            .toHaveClass(/\bis-fullscreen\b/);
    });

    test('?embed=1&view=gallery still lands on the editor', async ({ page }) => {
        await page.goto('/?embed=1&view=gallery');
        await page.waitForFunction(() => document.documentElement.dataset.viewReady !== undefined);
        await expect(page.locator('#view-editor')).toBeVisible();
        await expect(page.locator('#view-gallery')).toBeHidden();
    });

    test('?embed=1&hidePanels=header drops the header, keeping the action bar', async ({ page }) => {
        await page.goto('/?embed=1&hidePanels=header');
        await page.waitForFunction(() => document.documentElement.dataset.viewReady !== undefined);
        await expect(page.locator('header')).toBeHidden();
        await expect(page.locator('#embed-save-btn')).toBeVisible();
        await expect(page.locator('#embed-cancel-btn')).toBeVisible();
        await expect(page.locator('#preview-card')).toBeVisible();
    });

    test('the action bar sits at the bottom, buttons on the right', async ({ page }) => {
        await page.goto('/?embed=1');
        await page.waitForFunction(() => document.documentElement.dataset.viewReady !== undefined);

        const bar = await page.locator('#embed-actions').boundingBox();
        const cancel = await page.locator('#embed-cancel-btn').boundingBox();
        const save = await page.locator('#embed-save-btn').boundingBox();
        const viewport = page.viewportSize()!;
        // Flush with the bottom edge of the viewport...
        expect(Math.round(bar!.y + bar!.height)).toBe(viewport.height);
        // ...and the buttons hug the right edge, Save trailing Cancel.
        expect(save!.x).toBeGreaterThan(viewport.width * 0.75);
        expect(save!.x).toBeGreaterThan(cancel!.x);
    });

    test('?embed=1&hidePanels= hides the listed panels', async ({ page }) => {
        await page.goto('/?embed=1&hidePanels=zplOutput,warnings');
        await page.waitForFunction(() => document.documentElement.dataset.viewReady !== undefined);
        await expect(page.locator('#zpl-card')).toBeHidden();
        // Both keys parsed out of the comma-separated param...
        await expect(page.locator('html')).toHaveClass(/hide-panel-zplOutput/);
        await expect(page.locator('html')).toHaveClass(/hide-panel-warnings/);
        // ...and the editing surface is untouched.
        await expect(page.locator('#preview-card')).toBeVisible();
        await expect(page.locator('#properties-card')).toBeVisible();
    });

    test('standalone app is unchanged (regression guard)', async ({ page }) => {
        await page.goto('/');
        await page.waitForFunction(() => document.documentElement.dataset.viewReady !== undefined);
        await expect(page.locator('#view-toggle')).toBeVisible();
        await expect(page.locator('#embed-save-btn')).toBeHidden();
        await expect(page.locator('#embed-cancel-btn')).toBeHidden();
    });

    test('hidePanels without embed=1 is inert', async ({ page }) => {
        await page.goto('/?hidePanels=zplOutput');
        await page.waitForFunction(() => document.documentElement.dataset.viewReady !== undefined);
        await expect(page.locator('#zpl-card')).toBeVisible();
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
