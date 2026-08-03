import { test, expect } from '../fixtures';
import { ElementsPanel } from '../page-objects/ElementsPanel';
import { PropertiesPanel } from '../page-objects/PropertiesPanel';
import { ZPLOutput } from '../page-objects/ZPLOutput';

// Content is a template string that mixes literal text with %name% placeholders.
// Production ZPL keeps the placeholders; the canvas and the Labelary preview resolve them
// against the label's Preview Data. See docs/adr/0012.
const previewData = (page: any) =>
    page.evaluate(() => (window as any).appState.labelSettings.previewData);

test.describe('Content placeholders and Preview Data', () => {
    let elementsPanel: ElementsPanel;
    let propertiesPanel: PropertiesPanel;
    let zplOutput: ZPLOutput;

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        elementsPanel = new ElementsPanel(page);
        propertiesPanel = new PropertiesPanel(page);
        zplOutput = new ZPLOutput(page);
    });

    test.describe('placeholder grammar', () => {
        test('resolves, escapes and rejects near-misses', async ({ page }) => {
            const r = await page.evaluate(async () => {
                const { resolvePlaceholders, placeholderNames, placeholderName } =
                    await import('/src/utils/placeholders.js');
                return {
                    mixed: resolvePlaceholders('Price: %price%', { price: '19.99' }),
                    // An unset placeholder resolves to its bare name, so it stays legible.
                    unset: resolvePlaceholders('Price: %price%', {}),
                    empty: resolvePlaceholders('Price: %price%', { price: '' }),
                    // %% is a literal percent and must never start a placeholder.
                    escaped: resolvePlaceholders('50%% off %sku%', { sku: 'A1' }),
                    // The identifier grammar is what keeps these from matching.
                    lonePercent: resolvePlaceholders('50% off', {}),
                    spanningSpaces: resolvePlaceholders('50% off %sku%', { sku: 'A1' }),
                    dashDigits: resolvePlaceholders('50%-70% off', {}),
                    repeated: resolvePlaceholders('%a% and %a%', { a: 'x' }),
                    names: placeholderNames('a %x% b %y% c %x%'),
                    namesNone: placeholderNames('50% off'),
                    whole: placeholderName('%price%'),
                    notWhole: placeholderName('Price: %price%'),
                };
            });

            expect(r.mixed).toBe('Price: 19.99');
            expect(r.unset).toBe('Price: price');
            expect(r.empty).toBe('Price: price');
            expect(r.escaped).toBe('50% off A1');
            expect(r.lonePercent).toBe('50% off');
            expect(r.spanningSpaces).toBe('50% off A1');
            expect(r.dashDigits).toBe('50%-70% off');
            expect(r.repeated).toBe('x and x');
            expect(r.names).toEqual(['x', 'y']);
            expect(r.namesNone).toEqual([]);
            expect(r.whole).toBe('price');
            expect(r.notWhole).toBe('');
        });

        test('hex escaping applies to the literals, never the placeholder', async ({ page }) => {
            const r = await page.evaluate(async () => {
                const { renderFieldDataCommand } = await import('/src/utils/zplFieldData.js');
                return {
                    around: renderFieldDataCommand('Café ^x %price%'),
                    escapedPercent: renderFieldDataCommand('50%% off'),
                    plain: renderFieldDataCommand('%price%'),
                };
            });

            // ^ and é are escaped; %price% passes through untouched.
            expect(r.around).toBe('^FH^FDCaf_C3_A9 _5Ex %price%');
            // %% collapses to one literal %, which needs no escaping (so no ^FH).
            expect(r.escapedPercent).toBe('^FD50% off');
            expect(r.plain).toBe('^FD%price%');
        });
    });

    test.describe('production ZPL', () => {
        test('keeps literal text and placeholders together in one ^FD', async () => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);
            await propertiesPanel.setProperty('prop-content', 'Price: %price%');

            await zplOutput.verifyZPLContains('^FDPrice: %price%^FS');
        });

        test('emits the ^PQ quantity placeholder as a %name%', async ({ page }) => {
            await elementsPanel.addTextElement();
            await page.locator('details[data-fs-tab="print-config"] summary').click();
            await page.locator('#print-quantity-placeholder').fill('qty');
            await page.locator('#print-quantity-placeholder').dispatchEvent('input');

            await zplOutput.verifyZPLContains('^PQ%qty%,0,0');
        });
    });

    test.describe('Preview Data', () => {
        test('discovers placeholders from element Content', async ({ page }) => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);
            await propertiesPanel.setProperty('prop-content', '%brand% — %price%');

            await page.locator('details[data-fs-tab="preview-data"] summary').click();
            const panel = page.locator('#preview-data-panel');
            await expect(panel.locator('[data-placeholder="brand"]')).toBeVisible();
            await expect(panel.locator('[data-placeholder="price"]')).toBeVisible();
        });

        test('resolves in the preview ZPL while production keeps the placeholder', async ({ page }) => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);
            await propertiesPanel.setProperty('prop-content', 'Price: %price%');

            await page.locator('details[data-fs-tab="preview-data"] summary').click();
            const value = page.locator('#preview-data-panel [data-placeholder="price"]');
            await value.fill('19.99');
            await value.dispatchEvent('input');

            const previewZpl = await page.evaluate(async () => {
                const { ZPLGenerator } = await import('/src/services/ZPLGenerator.js');
                const state = (window as any).appState;
                return new ZPLGenerator().generatePreviewZPL(state.elements, state.labelSettings);
            });

            expect(previewZpl).toContain('^FDPrice: 19.99^FS');
            await zplOutput.verifyZPLContains('^FDPrice: %price%^FS');
        });

        test('an unset placeholder previews as its bare name', async ({ page }) => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);
            await propertiesPanel.setProperty('prop-content', 'Price: %price%');

            const previewZpl = await page.evaluate(async () => {
                const { ZPLGenerator } = await import('/src/services/ZPLGenerator.js');
                const state = (window as any).appState;
                return new ZPLGenerator().generatePreviewZPL(state.elements, state.labelSettings);
            });

            expect(previewZpl).toContain('^FDPrice: price^FS');
        });

        test('a placeholder can be defined by hand and removed once unused', async ({ page }) => {
            await page.locator('details[data-fs-tab="preview-data"] summary').click();
            const panel = page.locator('#preview-data-panel');

            await panel.locator('#preview-data-new').fill('lot');
            await panel.locator('#preview-data-add').click();
            await expect(panel.locator('[data-placeholder="lot"]')).toBeVisible();
            // Nothing references it yet, so it files under the unused heading.
            await expect(panel).toContainText('Not used on this label');

            await panel.locator('[data-placeholder="lot"]').fill('L-77');
            await panel.locator('[data-placeholder="lot"]').dispatchEvent('input');
            expect(await previewData(page)).toEqual({ lot: 'L-77' });

            await panel.locator('[data-remove-placeholder="lot"]').click();
            await expect(panel.locator('[data-placeholder="lot"]')).toHaveCount(0);
            expect(await previewData(page)).toEqual({});
        });

        test('rejects a name the Content grammar could never match', async ({ page }) => {
            await page.locator('details[data-fs-tab="preview-data"] summary').click();
            const panel = page.locator('#preview-data-panel');

            await panel.locator('#preview-data-new').fill('9lives');
            await panel.locator('#preview-data-add').click();

            await expect(panel.locator('#preview-data-new-error')).toBeVisible();
            expect(await previewData(page)).toEqual({});
        });

        test('a placeholder in use cannot be removed', async ({ page }) => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);
            await propertiesPanel.setProperty('prop-content', '%price%');

            await page.locator('details[data-fs-tab="preview-data"] summary').click();
            const panel = page.locator('#preview-data-panel');
            await expect(panel.locator('[data-placeholder="price"]')).toBeVisible();
            await expect(panel.locator('[data-remove-placeholder="price"]')).toHaveCount(0);
        });
    });

    test.describe('Element Properties', () => {
        test('shows a Preview Value row per placeholder as the Content is typed', async ({ page }) => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);

            const content = page.locator('#prop-content');
            await content.fill('Price: %price%');
            await content.dispatchEvent('input');
            await expect(page.locator('[data-content-placeholder="price"]')).toBeVisible();

            // The rows follow the Content without a panel rebuild.
            await content.fill('Price: %price% / %sku%');
            await content.dispatchEvent('input');
            await expect(page.locator('[data-content-placeholder="sku"]')).toBeVisible();

            await content.fill('no placeholders here');
            await content.dispatchEvent('input');
            await expect(page.locator('[data-content-placeholder]')).toHaveCount(0);
        });

        test('editing a Preview Value inline is the same edit as in the panel', async ({ page }) => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);
            await propertiesPanel.setProperty('prop-content', 'Price: %price%');

            const inline = page.locator('[data-content-placeholder="price"]');
            await inline.fill('19.99');
            await inline.dispatchEvent('input');
            expect(await previewData(page)).toEqual({ price: '19.99' });

            // ...and the panel mirrors it without a re-render stealing focus.
            await page.locator('details[data-fs-tab="preview-data"] summary').click();
            await expect(page.locator('#preview-data-panel [data-placeholder="price"]')).toHaveValue('19.99');

            // The reverse direction syncs the inline row back.
            const panelInput = page.locator('#preview-data-panel [data-placeholder="price"]');
            await panelInput.fill('24.50');
            await panelInput.dispatchEvent('input');
            await expect(inline).toHaveValue('24.50');
        });
    });

    test.describe('autocomplete', () => {
        // Seeds two known names, then types a partial placeholder in a second element.
        const seed = async (page: any, typed: string) => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);
            await propertiesPanel.setProperty('prop-content', '%price% %product_url%');

            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(1);
            const content = page.locator('#prop-content');
            await content.click();
            await content.fill(typed);
            await content.dispatchEvent('input');
            return content;
        };

        test('a bare % offers every known placeholder', async ({ page }) => {
            await seed(page, 'Total: %');

            const list = page.locator('#prop-content-autocomplete');
            await expect(list).toBeVisible();
            await expect(list.locator('[data-name]')).toHaveCount(2);
            await expect(list.locator('[data-name="price"]')).toBeVisible();
            await expect(list.locator('[data-name="product_url"]')).toBeVisible();
        });

        // _accept() dispatches an input event, leaving the caret after the closing
        // %. That must read as an ending, not a fresh bare-% trigger.
        test('completing a placeholder does not immediately reopen the list', async ({ page }) => {
            const content = await seed(page, 'Total: %pri');
            await content.press('Enter');

            await expect(content).toHaveValue('Total: %price%');
            await expect(page.locator('#prop-content-autocomplete')).toBeHidden();
        });

        test('the closing % of an existing placeholder does not open the list', async ({ page }) => {
            await seed(page, 'Total: %price%');
            await expect(page.locator('#prop-content-autocomplete')).toBeHidden();
        });

        test('narrows as more is typed and closes when nothing matches', async ({ page }) => {
            await seed(page, 'Total: %pri');
            const list = page.locator('#prop-content-autocomplete');
            await expect(list.locator('[data-name]')).toHaveCount(1);

            await page.locator('#prop-content').fill('Total: %zzz');
            await page.locator('#prop-content').dispatchEvent('input');
            await expect(list).toBeHidden();
        });

        test('Enter completes the placeholder and updates the element', async ({ page }) => {
            const content = await seed(page, 'Total: %pri');
            await content.press('Enter');

            await expect(content).toHaveValue('Total: %price%');
            await expect(page.locator('#prop-content-autocomplete')).toBeHidden();
            await zplOutput.verifyZPLContains('^FDTotal: %price%^FS');
        });

        test('Escape dismisses without completing', async ({ page }) => {
            const content = await seed(page, 'Total: %pri');
            await content.press('Escape');

            await expect(page.locator('#prop-content-autocomplete')).toBeHidden();
            await expect(content).toHaveValue('Total: %pri');
        });

        test('an escaped %% never opens the list', async ({ page }) => {
            const list = page.locator('#prop-content-autocomplete');

            // The first % of the pair legitimately opens it...
            const content = await seed(page, '50%');
            await expect(list).toBeVisible();

            // ...and the second closes it again: %% is a literal percent.
            await content.fill('50%%');
            await content.dispatchEvent('input');
            await expect(list).toBeHidden();

            await content.fill('50%% p');
            await content.dispatchEvent('input');
            await expect(list).toBeHidden();
        });
    });

    test.describe('insert menu', () => {
        // Seeds three named placeholders with values, then selects a second,
        // empty element to insert into.
        const seed = async (page: any) => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);
            await propertiesPanel.setProperty('prop-content', '%sku% %price% %qty%');
            for (const [name, value] of [['sku', 'KX-2219-B'], ['price', '19.99'], ['qty', '12']]) {
                const row = page.locator(`[data-content-placeholder="${name}"]`);
                await row.fill(value);
                await row.dispatchEvent('input');
            }
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(1);
            return {
                content: page.locator('#prop-content'),
                button: page.locator('#prop-insert-placeholder'),
                menu: page.locator('#prop-insert-placeholder-menu'),
            };
        };

        test('lists every known placeholder with its preview value', async ({ page }) => {
            const { button, menu } = await seed(page);
            await button.click();

            await expect(menu).toBeVisible();
            await expect(menu.locator('[data-insert]')).toHaveCount(3);
            await expect(menu.locator('[data-insert="price"]')).toContainText('%price%');
            await expect(menu.locator('[data-insert="price"]')).toContainText('19.99');
        });

        test('inserts at the caret, not at the end', async ({ page }) => {
            const { content, button, menu } = await seed(page);

            await content.fill('Item:  - done');
            await content.dispatchEvent('input');
            // Park the caret right after "Item: ".
            await content.evaluate((el: HTMLInputElement) => {
                el.focus();
                el.setSelectionRange(6, 6);
                el.dispatchEvent(new Event('click', { bubbles: true }));
            });

            await button.click();
            await menu.locator('[data-insert="sku"]').click();

            await expect(content).toHaveValue('Item: %sku% - done');
            await expect(menu).toBeHidden();
            await zplOutput.verifyZPLContains('^FDItem: %sku% - done^FS');
        });

        test('search narrows the list and Enter takes the top match', async ({ page }) => {
            const { content, button, menu } = await seed(page);
            await content.fill('');
            await content.dispatchEvent('input');

            await button.click();
            await menu.locator('[data-search]').fill('pri');
            await expect(menu.locator('[data-insert]')).toHaveCount(1);

            await menu.locator('[data-search]').press('Enter');
            await expect(content).toHaveValue('%price%');
        });

        test('defines a new placeholder and inserts it', async ({ page }) => {
            const { content, button, menu } = await seed(page);
            await content.fill('');
            await content.dispatchEvent('input');

            await button.click();
            const define = menu.locator('[data-define]');
            await expect(define).toBeDisabled();

            await menu.locator('[data-search]').fill('batch');
            await expect(define).toBeEnabled();
            await define.click();

            await expect(content).toHaveValue('%batch%');
            expect(await previewData(page)).toHaveProperty('batch', '');
            await page.locator('details[data-fs-tab="preview-data"] summary').click();
            await expect(page.locator('#preview-data-panel [data-placeholder="batch"]')).toBeVisible();
        });

        test('refuses a name the grammar could never match, or one that exists', async ({ page }) => {
            const { button, menu } = await seed(page);
            await button.click();
            const define = menu.locator('[data-define]');

            await menu.locator('[data-search]').fill('9bad');
            await expect(define).toBeDisabled();
            await expect(menu).toContainText('Start with a letter or _');

            await menu.locator('[data-search]').fill('sku');
            await expect(define).toBeDisabled();
        });

        test('closes on an outside click', async ({ page }) => {
            const { menu, button } = await seed(page);
            await button.click();
            await expect(menu).toBeVisible();

            await page.locator('#prop-x').click();
            await expect(menu).toBeHidden();
        });
    });

    test.describe('geometry', () => {
        // The handles have to wrap what is actually drawn. A barcode's width comes
        // from the encoded string, so a placeholder-backed barcode must measure
        // identically to one whose Content is the resolved value spelled out.
        test('selection bounds match the resolved value, not the placeholder', async ({ page }) => {
            const widths = await page.evaluate(async () => {
                const { ElementService } = await import('/src/services/ElementService.js');
                const state = (window as any).appState;
                const handler = (window as any).interactionHandler;

                const measure = (content: string, previewData: Record<string, string>) => {
                    state.setElements([]);
                    state.updateLabelSettings({ previewData });
                    new ElementService(state).createElement('BARCODE', { x: 20, y: 20, content });
                    const el = state.elements[0];
                    return {
                        selection: handler.getSelectionBounds(el).width,
                        element: el.getBounds(state.labelSettings.dpmm, state.labelSettings.previewData).width,
                    };
                };

                return {
                    literal: measure('X001NP49XJ', {}),
                    viaPlaceholder: measure('%barcode%', { barcode: 'X001NP49XJ' }),
                    // The bare-name fallback is a different length again (7 vs 10),
                    // which is what the bug was measuring.
                    unset: measure('%barcode%', {}),
                };
            });

            expect(widths.viaPlaceholder.selection).toBe(widths.literal.selection);
            expect(widths.viaPlaceholder.selection).toBe(widths.viaPlaceholder.element);
            // Guards the test itself: the wrong string really would differ.
            expect(widths.unset.selection).not.toBe(widths.literal.selection);
        });
    });

    test.describe('round-trip', () => {
        test('mixed content survives ZPL import unchanged', async ({ page }) => {
            const r = await page.evaluate(async () => {
                const { ZPLParser } = await import('/src/services/ZPLParser.js');
                const parsed = new ZPLParser().parse(
                    '^XA^PW799^FO50,50^A0N,20^FDPrice: %price%^FS' +
                    '^FO50,100^BY2,2^BCN,50,Y,N^FD>:%sku%^FS^PQ%qty%,0,0^XZ'
                );
                return {
                    contents: parsed.elements.map((e: any) => e.content),
                    qty: parsed.labelSettings.printQuantityPlaceholder,
                };
            });

            // The old parser collapsed a placeholder field to its bare name, losing the
            // literal text around it. Content now comes back verbatim.
            expect(r.contents).toEqual(['Price: %price%', '%sku%']);
            expect(r.qty).toBe('qty');
        });

        test('a pre-Content template migrates to Content + Preview Data', async ({ page }) => {
            const r = await page.evaluate(async () => {
                const { SerializationService } = await import('/src/services/SerializationService.js');
                const svc = new SerializationService();
                const legacy = {
                    elements: [
                        { type: 'TEXT', x: 1, y: 2, previewText: '$19.99', placeholder: 'price', fontSize: 20 },
                        { type: 'BARCODE', x: 3, y: 4, previewData: '1234', placeholder: 'sku', height: 50, width: 2, ratio: 2 },
                        { type: 'TEXT', x: 5, y: 6, previewText: 'Plain text', placeholder: '', fontSize: 20 },
                    ],
                    labelSettings: { width: 100, height: 50, dpmm: 8 },
                };
                svc.migrateTemplate(legacy);
                const elements = legacy.elements.map((d) => svc.createElementFromData(d) as any);
                return {
                    previewData: (legacy.labelSettings as any).previewData,
                    contents: elements.map((e) => e.content),
                    zpl: elements[0].render('0', 20, 0),
                };
            });

            // Lossless: the old sample value becomes the placeholder's Preview Data value.
            expect(r.previewData).toEqual({ price: '$19.99', sku: '1234' });
            expect(r.contents).toEqual(['%price%', '%sku%', 'Plain text']);
            expect(r.zpl).toContain('^FD%price%^FS');
        });
    });
});
