import fs from 'node:fs';
import path from 'node:path';
import { test as base, expect, Page } from '@playwright/test';
import { ElementsPanel, EmbedHost } from '../page-objects';
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
        expect(result).toContain('"content": "Hello from host"');
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

    test('a host-supplied font is matched to the font the ZPL only names', async ({ page }) => {
        const host = new EmbedHost(page);
        await host.goto();

        // The ZPL declares ^CWK,E:OCRA.TTF and nothing else; the host sends OCRA.TTF.
        await host.loadFontZplBtn.click();
        await expect(host.frame.locator('#elements-list .element-item')).toHaveCount(1);

        await host.frame.locator('#fs-icon-rail [data-fs-tab="font"]').click();
        const fonts = host.frame.locator('#custom-fonts-list');
        await expect(fonts).toContainText('E:OCRA.TTF');
        await expect(fonts).toContainText('Ready');
        // Matched without the user attaching anything: the label renders in the real face.
        await expect(host.frame.locator('.replace-preview-font')).toHaveCSS('font-family', /zpl-custom-/);
        await expect(host.frame.locator('#zpl-output-raw')).toHaveValue(/\^CWK,E:OCRA\.TTF/);

        // A preview aid, not template content — the host gets its font back as
        // the reference-only entry the ZPL declared.
        await host.frame.locator('#embed-save-btn').click();
        await host.expectStatus('saved');
        const result = await host.getResultText();
        expect(result).toContain('E:OCRA.TTF');
        expect(result).not.toContain('"source"');
    });

    test('host-supplied preview data reaches the Preview Data panel', async ({ page }) => {
        const host = new EmbedHost(page);
        await host.goto();

        await host.setPreviewDataBtn.click();

        // The demo embeds with fullscreen=1, so the panel is reached from the
        // icon rail rather than by opening a <details>.
        await host.frame.locator('#fs-icon-rail [data-fs-tab="preview-data"]').click();
        const panel = host.frame.locator('#preview-data-panel');
        await expect(panel.locator('[data-placeholder="price"]')).toHaveValue('19.99');
        await expect(panel.locator('[data-placeholder="sku"]')).toHaveValue('KX-2219-B');
        // A host may define a placeholder without sampling it; it still appears.
        await expect(panel.locator('[data-placeholder="lot"]')).toHaveValue('');
    });

    // A template load is a whole-document swap, so it resets Preview Data to
    // whatever the incoming template carries. A host that wants its own values
    // to apply sends them in the same message.
    test('preview data sent with a template load applies to it', async ({ page }) => {
        const host = new EmbedHost(page);
        await host.goto();

        await page.evaluate(() => {
            (document.querySelector('#editor-container iframe') as HTMLIFrameElement)
                .contentWindow!.postMessage(
                    {
                        source: 'zpl-designer-host', version: 1, type: 'loadTemplate',
                        payload: {
                            template: {
                                labelSettings: { width: 100, height: 50, dpmm: 8 },
                                elements: [{ type: 'TEXT', x: 20, y: 20, content: 'Price: %price%', fontSize: 30 }],
                            },
                            previewData: { price: '19.99' },
                        },
                    },
                    '*',
                );
        });

        await expect(host.frame.locator('#elements-list .element-item')).toHaveCount(1);
        await host.frame.locator('#fs-icon-rail [data-fs-tab="preview-data"]').click();
        await expect(host.frame.locator('#preview-data-panel [data-placeholder="price"]'))
            .toHaveValue('19.99');

        // The sample value is preview-only — the saved ZPL still carries the placeholder.
        await host.frame.locator('#embed-save-btn').click();
        await host.expectStatus('saved');
        const result = await host.getResultText();
        expect(result).toContain('%price%');
        expect(result).not.toContain('^FDPrice: 19.99');
    });

    // Applying a message is asynchronous — fonts are hashed and registered
    // before the import — so a host that doesn't wait between messages must
    // still get its own order back: the second load wins, and the save that
    // follows both reports it rather than whatever had landed by then.
    test('host messages apply in order when an earlier load is slower', async ({ page }) => {
        const host = new EmbedHost(page);
        await host.goto();

        const fontBase64 = fs.readFileSync(path.resolve('src/fonts/OCRA.ttf')).toString('base64');
        await page.evaluate((data) => {
            const editor = (document.querySelector('#editor-container iframe') as HTMLIFrameElement).contentWindow!;
            const send = (type: string, payload: unknown) =>
                editor.postMessage({ source: 'zpl-designer-host', version: 1, type, payload }, '*');
            const template = (content: string) => ({
                labelSettings: { width: 100, height: 50, dpmm: 8 },
                elements: [{ type: 'TEXT', x: 20, y: 20, content, fontSize: 30 }],
            });
            // The first load drags: its font is hashed and registered before the import.
            send('loadTemplate', { template: template('SLOW FIRST'), fonts: [{ name: 'OCRA.ttf', data }] });
            send('loadTemplate', { template: template('FAST SECOND') });
            send('requestSave', {});
        }, fontBase64);

        await host.expectStatus('saved');
        const result = await host.getResultText();
        expect(result).toContain('FAST SECOND');
        expect(result).not.toContain('SLOW FIRST');
        await expect(host.frame.locator('#elements-list .element-item')).toHaveCount(1);
        await expect(host.frame.locator('#elements-list')).toContainText('FAST SECOND');
    });

    test('a bare template load resets host preview data to the template\'s own', async ({ page }) => {
        const host = new EmbedHost(page);
        await host.goto();

        await host.setPreviewDataBtn.click();
        await host.frame.locator('#fs-icon-rail [data-fs-tab="preview-data"]').click();
        await expect(host.frame.locator('#preview-data-panel [data-placeholder="price"]')).toHaveValue('19.99');

        await host.loadTemplateBtn.click();
        await expect(host.frame.locator('#elements-list .element-item')).toHaveCount(1);

        await expect(host.frame.locator('#preview-data-panel [data-placeholder="price"]')).toHaveCount(0);
    });

    test('an invalid placeholder name is rejected, not silently shown', async ({ page }) => {
        const host = new EmbedHost(page);
        await host.goto();

        await page.evaluate(() => {
            (document.querySelector('#editor-container iframe') as HTMLIFrameElement)
                .contentWindow!.postMessage(
                    {
                        source: 'zpl-designer-host', version: 1, type: 'setPreviewData',
                        payload: { previewData: { '9bad': 'x', good: 'y' } },
                    },
                    '*',
                );
        });

        await host.frame.locator('#fs-icon-rail [data-fs-tab="preview-data"]').click();
        const panel = host.frame.locator('#preview-data-panel');
        await expect(panel.locator('[data-placeholder="good"]')).toHaveValue('y');
        await expect(panel.locator('[data-placeholder="9bad"]')).toHaveCount(0);
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

    // A host that has moved on to a later revision of the envelope must not go
    // silent against an older editor: anything from v1 up is dispatched on its
    // type. Below v1 is not this protocol at all.
    test('a later protocol version is accepted; a lower one is ignored', async ({ page }) => {
        const host = new EmbedHost(page);
        await host.goto();
        await host.loadTemplateBtn.click();
        await expect(host.frame.locator('#elements-list .element-item')).toHaveCount(1);

        await page.evaluate(() => {
            const editor = (document.querySelector('#editor-container iframe') as HTMLIFrameElement).contentWindow!;
            editor.postMessage(
                { source: 'zpl-designer-host', version: 0, type: 'loadZPL', payload: { zpl: '^XA^FO10,10^A0N,30,30^FDv0^FS^XZ' } },
                '*',
            );
            editor.postMessage(
                { source: 'zpl-designer-host', version: '2', type: 'loadZPL', payload: { zpl: '^XA^FO10,10^A0N,30,30^FDstring^FS^XZ' } },
                '*',
            );
            editor.postMessage(
                { source: 'zpl-designer-host', version: 99, type: 'loadZPL', payload: { zpl: '^XA^FO10,10^A0N,30,30^FDv99^FS^XZ' } },
                '*',
            );
        });

        // Only the v99 message got through — the other two never reached the editor.
        await expect(host.frame.locator('#elements-list')).toContainText('v99');
        await expect(host.frame.locator('#elements-list')).not.toContainText('v0');
        await expect(host.frame.locator('#elements-list')).not.toContainText('string');
    });

    // `setZpl` is the whole-document ZPL load under the name a host that only
    // swaps the ZPL body uses. Everything below drives it the way such a host
    // does — raw postMessage, no SDK, no fonts on the message.
    test.describe('setZpl', () => {
        // Sends as the host would: the envelope at a version this editor was
        // not built against, dispatched on its type all the same.
        const setZpl = (page: Page, zpl: string, previewData?: Record<string, string>) =>
            page.evaluate(({ zpl, previewData }) => {
                const payload: Record<string, unknown> = { zpl };
                if (previewData) payload.previewData = previewData;
                (document.querySelector('#editor-container iframe') as HTMLIFrameElement)
                    .contentWindow!.postMessage(
                        { source: 'zpl-designer-host', version: 2, type: 'setZpl', payload },
                        '*',
                    );
            }, { zpl, previewData });

        test('replaces the document without a reload, and the last one wins', async ({ page }) => {
            const host = new EmbedHost(page);
            await host.goto();
            await host.loadZplBtn.click();
            await expect(host.frame.locator('#elements-list')).toContainText('Sample ZPL');

            // A mark on the editor's own window, which a reload would wipe —
            // the reload fallback this message exists to replace does exactly
            // that, and with it goes the font registry the swaps below reuse.
            await page.evaluate(() => {
                const editor = (document.querySelector('#editor-container iframe') as HTMLIFrameElement).contentWindow!;
                (editor as unknown as Record<string, string>).__noReloadProbe = 'kept';
            });

            await setZpl(page, '^XA^FO40,40^A0N,40,40^FDFirst body^FS^XZ');
            await expect(host.frame.locator('#elements-list')).toContainText('First body');

            await setZpl(page, '^XA^FO40,40^A0N,40,40^FDSecond body^FS^XZ');
            await expect(host.frame.locator('#elements-list .element-item')).toHaveCount(1);
            await expect(host.frame.locator('#elements-list')).toContainText('Second body');
            await expect(host.frame.locator('#elements-list')).not.toContainText('First body');

            // Same editor document throughout — no reload, so no font re-send.
            const probe = await page.evaluate(() => {
                const editor = (document.querySelector('#editor-container iframe') as HTMLIFrameElement).contentWindow!;
                return (editor as unknown as Record<string, string>).__noReloadProbe;
            });
            expect(probe).toBe('kept');
        });

        test('honours the labelMeta comment for the canvas size', async ({ page }) => {
            const host = new EmbedHost(page);
            await host.goto();

            // Same shape the generator emits: first command after ^XA, unterminated.
            await setZpl(page, '^XA\n^FX{"labelMeta":{"w":76.2,"h":25.4,"dpmm":12}}\n^FO20,20^A0N,30,30^FDMeta^FS\n^XZ');

            await expect(host.frame.locator('#elements-list')).toContainText('Meta');
            await expect(host.frame.locator('#label-width')).toHaveValue('76.2');
            await expect(host.frame.locator('#label-height')).toHaveValue('25.4');
            await expect(host.frame.locator('#label-dpmm')).toHaveValue('12');
        });

        test('renders in a font supplied only by an earlier message', async ({ page }) => {
            const host = new EmbedHost(page);
            await host.goto();

            // The font arrives once, with the demo's font-ZPL button.
            await host.loadFontZplBtn.click();
            await expect(host.frame.locator('#elements-list .element-item')).toHaveCount(1);

            // A later body naming the same printer font carries no font data.
            await setZpl(page, '^XA\n^CWK,E:OCRA.TTF\n^CI28\n^FO40,60^AKN,50,50^FDSecond run^FS\n^XZ');
            await expect(host.frame.locator('#elements-list')).toContainText('Second run');

            await host.frame.locator('#fs-icon-rail [data-fs-tab="font"]').click();
            await expect(host.frame.locator('#custom-fonts-list')).toContainText('Ready');
            await expect(host.frame.locator('.replace-preview-font')).toHaveCSS('font-family', /zpl-custom-/);
        });

        test('replaces preview data when the message carries it', async ({ page }) => {
            const host = new EmbedHost(page);
            await host.goto();
            await host.setPreviewDataBtn.click();

            await setZpl(page, '^XA^FO40,40^A0N,40,40^FDLot %lot%^FS^XZ', { lot: 'L-77' });

            await host.frame.locator('#fs-icon-rail [data-fs-tab="preview-data"]').click();
            const panel = host.frame.locator('#preview-data-panel');
            await expect(panel.locator('[data-placeholder="lot"]')).toHaveValue('L-77');
            // The values that belonged to the document it replaced are gone.
            await expect(panel.locator('[data-placeholder="price"]')).toHaveCount(0);
        });

        test('requestSave returns the new body plus the edits made since', async ({ page }) => {
            const host = new EmbedHost(page);
            await host.goto();
            await host.loadTemplateBtn.click();
            await expect(host.frame.locator('#elements-list')).toContainText('Hello from host');

            await setZpl(page, '^XA^FO40,40^A0N,40,40^FDFrom setZpl^FS^XZ');
            await expect(host.frame.locator('#elements-list')).toContainText('From setZpl');

            await host.frame.locator('#add-text-btn').click();
            await expect(host.frame.locator('#elements-list .element-item')).toHaveCount(2);

            await page.evaluate(() => {
                (document.querySelector('#editor-container iframe') as HTMLIFrameElement)
                    .contentWindow!.postMessage(
                        { source: 'zpl-designer-host', version: 2, type: 'requestSave', payload: {} },
                        '*',
                    );
            });

            await host.expectStatus('saved');
            const result = await host.getResultText();
            expect(result).toContain('From setZpl');
            expect(result).not.toContain('Hello from host');
            // The element added after the swap is in the payload too.
            expect(result.match(/"type": "TEXT"/g)).toHaveLength(2);
        });

        test('applies as one undoable step, keeping the history it landed on', async ({ page }) => {
            const host = new EmbedHost(page);
            await host.goto();
            await host.loadZplBtn.click();
            await expect(host.frame.locator('#elements-list')).toContainText('Sample ZPL');

            // `init` opened the session (one entry) and the demo's own load
            // landed on top of it as a second — the same undoable swap.
            const chip = host.frame.locator('#history-count-chip');
            await expect(chip).toHaveText('2');

            await setZpl(page, '^XA^FO40,40^A0N,40,40^FDSwapped in^FS^XZ');
            await expect(host.frame.locator('#elements-list')).toContainText('Swapped in');
            await expect(chip).toHaveText('3');

            await host.frame.locator('#undo-btn').click();
            await expect(host.frame.locator('#elements-list')).toContainText('Sample ZPL');
            await expect(host.frame.locator('#elements-list')).not.toContainText('Swapped in');

            await host.frame.locator('#redo-btn').click();
            await expect(host.frame.locator('#elements-list')).toContainText('Swapped in');
        });

        test('a body with no ZPL in it is refused, not imported over the document', async ({ page }) => {
            const host = new EmbedHost(page);
            await host.goto();
            await host.loadZplBtn.click();
            await expect(host.frame.locator('#elements-list .element-item')).toHaveCount(2);

            await setZpl(page, 'this is not ZPL');

            await host.expectStatus('error: ZPL could not be parsed');
            // The canvas was left alone rather than blanked.
            await expect(host.frame.locator('#elements-list .element-item')).toHaveCount(2);
            await expect(host.frame.locator('#elements-list')).toContainText('Sample ZPL');
        });
    });

    // The host's own chrome may need to point the user at the settings that fix
    // a problem it detected — it can't drive the editor's navigation across
    // origins any other way.
    test.describe('focusPanel', () => {
        const focusPanel = (page: Page, panel: unknown) =>
            page.evaluate((panel) => {
                (document.querySelector('#editor-container iframe') as HTMLIFrameElement)
                    .contentWindow!.postMessage(
                        { source: 'zpl-designer-host', version: 2, type: 'focusPanel', payload: { panel } },
                        '*',
                    );
            }, panel);

        test('opens the named panel in the icon rail', async ({ page }) => {
            const host = new EmbedHost(page);
            await host.goto();

            // The demo launches fullscreen, which lands on Add element.
            const rail = host.frame.locator('#fs-icon-rail');
            await expect(rail.locator('[data-fs-tab="add"]')).toHaveClass(/active/);
            await expect(host.frame.locator('#label-width')).toBeHidden();

            await focusPanel(page, 'labelSetup');

            await expect(rail.locator('[data-fs-tab="label-setup"]')).toHaveClass(/active/);
            await expect(rail.locator('[data-fs-tab="add"]')).not.toHaveClass(/active/);
            await expect(host.frame.locator('#label-width')).toBeVisible();
        });

        test('accepts the editor\'s own kebab-case tab key too', async ({ page }) => {
            const host = new EmbedHost(page);
            await host.goto();

            await focusPanel(page, 'preview-data');

            await expect(host.frame.locator('#fs-icon-rail [data-fs-tab="preview-data"]')).toHaveClass(/active/);
            await expect(host.frame.locator('#preview-data-panel')).toBeVisible();
        });

        test('re-opens a rail the user had collapsed', async ({ page }) => {
            const host = new EmbedHost(page);
            await host.goto();

            // Clicking the active icon collapses the panel to just the rail.
            await host.frame.locator('#fs-icon-rail [data-fs-tab="add"]').click();
            await expect(host.frame.locator('#view-editor')).toHaveClass(/fs-rail-collapsed/);

            await focusPanel(page, 'labelSetup');

            await expect(host.frame.locator('#view-editor')).not.toHaveClass(/fs-rail-collapsed/);
            await expect(host.frame.locator('#label-width')).toBeVisible();
        });

        test('leaves the document alone', async ({ page }) => {
            const host = new EmbedHost(page);
            await host.goto();
            await host.loadZplBtn.click();
            await expect(host.frame.locator('#elements-list')).toContainText('Sample ZPL');

            await focusPanel(page, 'labelSetup');
            await expect(host.frame.locator('#label-width')).toBeVisible();

            // Same elements, and no dirty ping — this is chrome, not an edit.
            await expect(host.frame.locator('#elements-list .element-item')).toHaveCount(2);
            await host.expectStatus('editor ready');
        });

        test('an unknown panel is reported with the names that work', async ({ page }) => {
            const host = new EmbedHost(page);
            await host.goto();

            await focusPanel(page, 'nope');

            await host.expectStatus('error: Unknown panel');
            const result = await host.getResultText();
            expect(result).toContain('labelSetup');
            expect(result).toContain('previewData');
            // The panel the user was on is untouched.
            await expect(host.frame.locator('#fs-icon-rail [data-fs-tab="add"]')).toHaveClass(/active/);
        });

        test('outside fullscreen it opens the panel\'s accordion section', async ({ page }) => {
            await page.goto('/embed/demo.html');
            await page.locator('#fullscreen-cb').uncheck();
            const host = new EmbedHost(page);
            await expect(host.status).toHaveText('editor ready', { timeout: 15000 });

            // Label Setup happens to start open; Font Settings does not.
            await expect(host.frame.locator('#add-custom-font-btn')).toBeHidden();

            await focusPanel(page, 'font');

            await expect(host.frame.locator('#add-custom-font-btn')).toBeVisible();
            await expect(host.frame.locator('#font-picker')).toBeVisible();
        });

        test('the SDK exposes it as handle.focusPanel()', async ({ page }) => {
            const host = new EmbedHost(page);
            await host.goto();

            await host.focusPanelBtn.click();

            await expect(host.frame.locator('#fs-icon-rail [data-fs-tab="label-setup"]')).toHaveClass(/active/);
            await expect(host.frame.locator('#label-width')).toBeVisible();
        });
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
                hideElements: { barcode: true, qrcode: true, raw: true },
                template: {
                    elements: [{ type: 'BARCODE', x: 20, y: 20, data: '12345' }],
                    labelSettings: { width: 100, height: 50, dpmm: 8 },
                },
            });
        });

        await expect(page.locator('#elements-container iframe'))
            .toHaveAttribute('src', /hideElements=barcode%2Cqrcode%2Craw/);
        const frame = page.frameLocator('#elements-container iframe');
        await expect(frame.locator('#add-barcode-btn')).toBeHidden();
        await expect(frame.locator('#add-qrcode-btn')).toBeHidden();
        await expect(frame.locator('#add-raw-btn')).toBeHidden();
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
        expect(result).toContain('"content": "Hello from host"');
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

    test('SDK hidePanels.fullscreenToggle pins the launch layout', async ({ page }) => {
        const host = new EmbedHost(page);
        await host.goto();

        await page.evaluate(() => {
            const container = document.createElement('div');
            container.id = 'lock-container';
            document.body.appendChild(container);
            (window as any).ZplDesigner.embed({
                container,
                url: new URL('..', window.location.href).href,
                fullscreen: true,
                hidePanels: { fullscreenToggle: true },
            });
        });

        await expect(page.locator('#lock-container iframe'))
            .toHaveAttribute('src', /hidePanels=fullscreenToggle/);
        const frame = page.frameLocator('#lock-container iframe');
        // Launched in fullscreen with no way out — both buttons are gone.
        await expect(frame.locator('#view-editor')).toHaveClass(/\bis-fullscreen\b/);
        await expect(frame.locator('#fullscreen-exit-btn')).toBeHidden();
        await expect(frame.locator('#fullscreen-toggle-btn')).toBeHidden();
        // The editing surface is untouched.
        await expect(frame.locator('#preview-card')).toBeVisible();
    });

    test('?embed=1&hidePanels=fullscreenToggle locks normal view too', async ({ page }) => {
        await page.goto('/?embed=1&hidePanels=fullscreenToggle&fullscreen=0');
        await page.waitForFunction(() => document.documentElement.dataset.viewReady !== undefined);
        await expect(page.locator('#view-editor')).not.toHaveClass(/\bis-fullscreen\b/);
        await expect(page.locator('#fullscreen-toggle-btn')).toBeHidden();
        await expect(page.locator('#fullscreen-exit-btn')).toBeHidden();
    });

    for (const fullscreen of ['0', '1']) {
        test(`?embed=1&hidePanels=previewMode pins the editor to Edit mode (fullscreen=${fullscreen})`, async ({ page }) => {
            await page.goto(`/?embed=1&hidePanels=previewMode&fullscreen=${fullscreen}`);
            await page.waitForFunction(() => document.documentElement.dataset.viewReady !== undefined);
            // The whole switcher goes, wrapper included — in fullscreen that
            // wrapper is the floating pill, which would otherwise stay behind.
            await expect(page.locator('#preview-mode-switch')).toBeHidden();
            // The mode it boots into is the mode it stays in, canvas editing untouched.
            await expect(page.locator('#preview-container')).toHaveAttribute('data-mode', 'canvas');
            await expect(page.locator('#label-canvas')).toBeVisible();
            // Undo/redo/History stay in the last grid column: with the switcher
            // gone they generate no box for auto-placement to skip over.
            const gap = await page.evaluate(() => {
                const header = document.querySelector('#preview-card > .border-b')!.getBoundingClientRect();
                const controls = document.getElementById('header-controls')!.getBoundingClientRect();
                return { toRightEdge: header.right - controls.right, inRightHalf: controls.left > header.left + header.width / 2 };
            });
            expect(gap.toRightEdge).toBeLessThan(32);
            expect(gap.inRightHalf).toBe(true);
        });
    }

    // Every doc link is an anchor into docs.zebra.com, so one rule takes all
    // four surfaces they live on. They stay in the DOM — hence :visible.
    const docLinks = (page: Page) => page.locator('a[href*="docs.zebra.com"]:visible');

    test('?embed=1&hidePanels=docLinks drops every ZPL command reference link', async ({ page }) => {
        await page.goto('/?embed=1&hidePanels=docLinks&fullscreen=0');
        await page.waitForFunction(() => document.documentElement.dataset.viewReady !== undefined);
        const elementsPanel = new ElementsPanel(page);
        await elementsPanel.addTextElement();
        await elementsPanel.selectElementByIndex(0);

        await expect(docLinks(page)).toHaveCount(0);
        // #zpl-doc-link is the one the app un-hides itself on selection, so it
        // is what would come back if the rule ever lost !important.
        await expect(page.locator('#zpl-doc-link')).toBeHidden();

        // Only the links go: every surface that carried one still works.
        await expect(page.locator('#settings-card')).toBeVisible();
        await expect(page.locator('#zpl-card')).toBeVisible();
        await expect(page.locator('#properties-card')).toBeVisible();
        await expect(page.getByText('Label Media Tracking (Optional)')).toBeVisible();
        await expect(page.locator('[data-media-tracking="Y"]')).toBeVisible();
        await expect(page.locator('[data-reverse="N"]')).toBeVisible();
        await expect(page.locator('#prop-field-hex')).toBeAttached();
    });

    test('?embed=1 alone keeps the ZPL command reference links', async ({ page }) => {
        await page.goto('/?embed=1&fullscreen=0');
        await page.waitForFunction(() => document.documentElement.dataset.viewReady !== undefined);
        const elementsPanel = new ElementsPanel(page);
        await elementsPanel.addTextElement();
        await elementsPanel.selectElementByIndex(0);

        await expect(page.locator('#zpl-doc-link')).toBeVisible();
        await expect(page.locator('#zpl-doc-link')).toHaveText('^A docs');
        expect(await docLinks(page).count()).toBeGreaterThan(1);
    });

    test('hidePanels=docLinks without embed=1 is inert', async ({ page }) => {
        await page.goto('/?hidePanels=docLinks&fullscreen=0');
        await page.waitForFunction(() => document.documentElement.dataset.viewReady !== undefined);
        expect(await docLinks(page).count()).toBeGreaterThan(0);
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
        expect(await host.getResultText()).toContain('"content": "Hello from host"');
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
        expect(await host.getResultText()).toContain('"content": "Hello from host"');
    });

    // In embed mode the editor registers no beforeunload guard — the host owns
    // the close decision and gets `change` pings to warn on its own terms. The
    // new-tab flow is where such a prompt would otherwise reach the user.
    test.describe('closing the editor tab', () => {
        const openEditorTab = async (host: EmbedHost, context: any) => {
            const [popup] = await Promise.all([
                context.waitForEvent('page'),
                host.openTabBtn.click(),
            ]);
            await setupLabelaryCacheInterceptor(popup as Page);
            await popup.waitForFunction(() => document.documentElement.dataset.viewReady !== undefined);
            await expect(popup.locator('#elements-list .element-item')).toHaveCount(1);
            return popup as Page;
        };

        test('an unsaved edit does not warn', async ({ page, context }) => {
            const host = new EmbedHost(page);
            await host.goto();
            const popup = await openEditorTab(host, context);

            const dialogs: string[] = [];
            popup.on('dialog', (d) => { dialogs.push(d.type()); d.accept().catch(() => { }); });

            await popup.locator('#add-text-btn').click();
            await host.expectStatus('unsaved changes');

            await popup.close({ runBeforeUnload: true });
            await expect.poll(() => popup.isClosed()).toBe(true);
            expect(dialogs).toEqual([]);
        });

        test('a saved edit does not warn', async ({ page, context }) => {
            const host = new EmbedHost(page);
            await host.goto();
            const popup = await openEditorTab(host, context);

            const dialogs: string[] = [];
            popup.on('dialog', (d) => { dialogs.push(d.type()); d.accept().catch(() => { }); });

            await popup.locator('#add-text-btn').click();
            await popup.locator('#embed-save-btn').click();
            await host.expectStatus('saved');

            await popup.close({ runBeforeUnload: true });
            await expect.poll(() => popup.isClosed()).toBe(true);
            expect(dialogs).toEqual([]);
        });
    });
});
