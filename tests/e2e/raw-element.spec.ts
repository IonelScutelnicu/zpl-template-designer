import { test, expect } from '../fixtures';
import { ElementsPanel, PropertiesPanel, ZPLOutput } from '../page-objects';

/**
 * Coverage for the RAW passthrough element.
 *
 * ZPL the parser can't model (RFID ^RF/^RS/^RB, vendor extensions) used to be
 * warned about and dropped. It's now captured verbatim into a RAW element that
 * shows in the stack, is editable as text, and re-emits byte for byte.
 *
 * The capture contract is deliberately narrow: only commands outside
 * KNOWN_COMMANDS. The known-but-discarded no-ops (^FN/^FC/^FE/^SO) stay
 * no-ops — see zpl-parser-noop-commands.spec.ts, which guards that boundary.
 */

/** Parse ZPL in-page and report element types plus RAW payloads. */
async function parse(page: any, zpl: string) {
    return await page.evaluate(async (src: string) => {
        const { ZPLParser } = await import('/src/services/ZPLParser.js');
        const result = new ZPLParser().parse(src, { dpmm: 8, labelHeight: 50 });
        return {
            elements: result.elements.map((e: any) => ({ type: e.type, text: e.text })),
            warnings: result.warnings.map((w: any) => w.command),
        };
    }, zpl);
}

/** Import a ZPL string through the paste modal, confirming past the warnings step. */
async function pasteZPL(page: any, zplOutput: ZPLOutput, zpl: string, expectedCount: number): Promise<void> {
    await zplOutput.openMoreActions();
    await page.locator('#import-zpl-btn').click();
    await expect(page.locator('#zpl-import-modal')).toBeVisible();
    await page.locator('#zpl-import-input').fill(zpl);
    await page.locator('#zpl-import-input').dispatchEvent('input');
    await page.locator('#zpl-import-confirm-btn').click();
    const warnings = page.locator('#zpl-import-warnings');
    if (await warnings.isVisible().catch(() => false)) {
        await page.locator('#zpl-import-confirm-btn').click();
    }
    await expect(page.locator('#elements-list .element-item')).toHaveCount(expectedCount, { timeout: 5000 });
}

test.describe('RAW passthrough element', () => {
    let elementsPanel: ElementsPanel;
    let propertiesPanel: PropertiesPanel;
    let zplOutput: ZPLOutput;

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        elementsPanel = new ElementsPanel(page);
        propertiesPanel = new PropertiesPanel(page);
        zplOutput = new ZPLOutput(page);
    });

    test.describe('Parser capture', () => {
        test('an RFID command outside a group becomes its own RAW element', async ({ page }) => {
            const { elements, warnings } = await parse(page, '^XA^FO50,50^A0N,30,30^FDHi^FS^RFW,H,1,2,1^FD1234^FS^XZ');
            expect(elements).toEqual([
                { type: 'TEXT', text: undefined },
                { type: 'RAW', text: '^RFW,H,1,2,1^FD1234^FS' },
            ]);
            expect(warnings).toEqual(['^RF']);
        });

        test('a group mixing known and unknown commands becomes one RAW, losing nothing', async ({ page }) => {
            const { elements } = await parse(page, '^XA^FO10,10^A0N,30,30^RFW,H^FDText^FS^XZ');
            expect(elements).toEqual([{ type: 'RAW', text: '^FO10,10^A0N,30,30^RFW,H^FDText^FS' }]);
        });

        test('a group with nothing recognizable is preserved instead of dropped', async ({ page }) => {
            const { elements } = await parse(page, '^XA^FO10,10^RFW,H^FDx^FS^XZ');
            expect(elements).toEqual([{ type: 'RAW', text: '^FO10,10^RFW,H^FDx^FS' }]);
        });

        test('an unsupported numeric barcode variant (^B6) is preserved', async ({ page }) => {
            const { elements, warnings } = await parse(page, '^XA^FO10,10^B6N,50,Y,N^FDabc^FS^XZ');
            expect(elements).toEqual([{ type: 'RAW', text: '^FO10,10^B6N,50,Y,N^FDabc^FS' }]);
            expect(warnings).toEqual(['^B']);
        });

        test('consecutive unknown commands coalesce into one run', async ({ page }) => {
            const { elements } = await parse(page, '^XA^RS8,,,3^RFW,H^FD9^FS^XZ');
            expect(elements).toEqual([{ type: 'RAW', text: '^RS8,,,3^RFW,H^FD9^FS' }]);
        });

        test('a dangling run with no ^FS is still flushed', async ({ page }) => {
            const { elements } = await parse(page, '^XA^RS8,,,3^XZ');
            expect(elements).toEqual([{ type: 'RAW', text: '^RS8,,,3' }]);
        });

        test('source order is preserved: first, between, and last', async ({ page }) => {
            const { elements } = await parse(
                page,
                '^XA^RSa^FS^FO10,10^A0N,20,20^FDone^FS^RSb^FS^FO20,20^A0N,20,20^FDtwo^FS^RSc^FS^XZ'
            );
            expect(elements.map((e: any) => e.type)).toEqual(['RAW', 'TEXT', 'RAW', 'TEXT', 'RAW']);
        });

        test('a preserved barcode carries the external ^BY defaults governing it', async ({ page }) => {
            // ^BY is modal and the generator emits it per known barcode, not in
            // the header — without this the barcode round-trips at the wrong
            // module width, ratio and height.
            const { elements } = await parse(page, '^XA^BY4,3,90^FO10,10^B6N,50,Y,N^FDabc^FS^XZ');
            expect(elements).toEqual([{ type: 'RAW', text: '^BY4,3,90^FO10,10^B6N,50,Y,N^FDabc^FS' }]);
        });

        test('a group with its own ^BY is not given a duplicate', async ({ page }) => {
            const { elements } = await parse(page, '^XA^BY4,3,90^FO10,10^BY2^B6N,50^FDabc^FS^XZ');
            expect(elements).toEqual([{ type: 'RAW', text: '^FO10,10^BY2^B6N,50^FDabc^FS' }]);
        });

        test('a non-barcode capture is not polluted with ^BY', async ({ page }) => {
            const group = await parse(page, '^XA^BY4,3,90^FO10,10^RFW,H^FDz^FS^XZ');
            expect(group.elements).toEqual([{ type: 'RAW', text: '^FO10,10^RFW,H^FDz^FS' }]);

            const run = await parse(page, '^XA^BY4,3,90^FO9,9^BCN,50,Y^FD1^FS^RFW,H^FD2^FS^XZ');
            expect(run.elements).toEqual([
                { type: 'BARCODE', text: undefined },
                { type: 'RAW', text: '^RFW,H^FD2^FS' },
            ]);
        });

        test('known-but-discarded no-ops stay no-ops (narrow scope contract)', async ({ page }) => {
            const { elements, warnings } = await parse(page, '^XA^FC%,&^SO1^FO10,10^FN1^FE^A0N,30,30^FDExample^FS^XZ');
            expect(elements).toEqual([{ type: 'TEXT', text: undefined }]);
            expect(warnings).toEqual([]);
        });
    });

    test.describe('Verbatim fidelity', () => {
        test('^FT is preserved as ^FT, not rewritten to ^FO', async ({ page }) => {
            const { elements, warnings } = await parse(page, '^XA^FT20,40^RFW,H^FDz^FS^XZ');
            expect(elements).toEqual([{ type: 'RAW', text: '^FT20,40^RFW,H^FDz^FS' }]);
            // Nothing was converted, so the ^FT conversion notice must not fire.
            expect(warnings).toEqual(['^RF']);
        });

        test('a third ^FO parameter the parser never reads survives', async ({ page }) => {
            const { elements } = await parse(page, '^XA^FO10,10,2^RB8,1^FDq^FS^XZ');
            expect(elements).toEqual([{ type: 'RAW', text: '^FO10,10,2^RB8,1^FDq^FS' }]);
        });

        test('original lowercase command casing survives', async ({ page }) => {
            const { elements } = await parse(page, '^XA^rfw,h,1,2^FD9^FS^XZ');
            expect(elements).toEqual([{ type: 'RAW', text: '^rfw,h,1,2^FD9^FS' }]);
        });

        test('generate then re-parse is idempotent', async ({ page }) => {
            const zpl = '^XA^FO50,50^A0N,30,30^FDHi^FS^RFW,H,1,2,1^FD1234^FS^XZ';
            await pasteZPL(page, zplOutput, zpl, 2);
            await zplOutput.verifyZPLContains('^RFW,H,1,2,1^FD1234^FS');

            const regenerated = await zplOutput.getZPLCode();
            const { elements } = await parse(page, regenerated);
            expect(elements).toEqual([
                { type: 'TEXT', text: undefined },
                { type: 'RAW', text: '^RFW,H,1,2,1^FD1234^FS' },
            ]);
        });
    });

    test.describe('Non-spatial behaviour', () => {
        test('a RAW at the origin does not clamp a multi-element drag', async ({ page }) => {
            const span = await page.evaluate(async () => {
                const { RawElement } = await import('/src/elements/RawElement.js');
                const { TextElement } = await import('/src/elements/TextElement.js');
                const { InteractionHandler } = await import('/src/interaction-handler.js');
                const primary = new TextElement(400, 300, 'A');
                const other = new TextElement(500, 340, 'B');
                const raw = new RawElement('^RFW,H^FDz^FS');
                const handler: any = Object.create(InteractionHandler.prototype);
                handler.callbacks = { getSelectedElements: () => [primary, other, raw] };
                handler.buildDragGroup(primary, true);
                return { members: handler.dragGroup.length, minDx: handler.dragGroupOriginSpan.minDx };
            });
            // minDx of -400 would pin the selection against the left edge.
            expect(span).toEqual({ members: 2, minDx: 0 });
        });

        test('a RAW does not distort alignment of real elements', async ({ page }) => {
            const result = await page.evaluate(async () => {
                const { RawElement } = await import('/src/elements/RawElement.js');
                const { TextElement } = await import('/src/elements/TextElement.js');
                const { AlignmentService } = await import('/src/services/AlignmentService.js');
                const first = new TextElement(400, 300, 'A');
                const second = new TextElement(500, 340, 'B');
                const raw = new RawElement('^RFW,H^FDz^FS');
                new AlignmentService().alignElements('left', [first, second, raw], { width: 100, height: 50, dpmm: 8 }, null);
                return { firstX: first.x, secondX: second.x };
            });
            // Aligned to the leftmost real element, not to the RAW's phantom origin.
            expect(result).toEqual({ firstX: 400, secondX: 400 });
        });

        test('a RAW does not shift an align-to-label group', async ({ page }) => {
            const result = await page.evaluate(async () => {
                const { RawElement } = await import('/src/elements/RawElement.js');
                const { TextElement } = await import('/src/elements/TextElement.js');
                const { AlignmentService } = await import('/src/services/AlignmentService.js');
                const labelSettings = { width: 100, height: 50, dpmm: 8 };
                const service = new AlignmentService();

                const withRaw = [new TextElement(400, 300, 'A'), new TextElement(500, 340, 'B')];
                service.alignElementsToLabel('center-x', [...withRaw, new RawElement('^RFW,H^FDz^FS')], labelSettings, null);

                const without = [new TextElement(400, 300, 'A'), new TextElement(500, 340, 'B')];
                service.alignElementsToLabel('center-x', without, labelSettings, null);

                return { withRaw: withRaw.map(e => e.x), without: without.map(e => e.x) };
            });
            // The RAW's phantom origin would drag the group's bbox left, pushing
            // the real elements to 525/625 instead of 325/425.
            expect(result.withRaw).toEqual(result.without);
            expect(result.withRaw).toEqual([325, 425]);
        });

        test('a RAW contributes no smart-guide reference edge', async ({ page }) => {
            const guided = await page.evaluate(async () => {
                const { RawElement } = await import('/src/elements/RawElement.js');
                const { TextElement } = await import('/src/elements/TextElement.js');
                const { SmartGuideService } = await import('/src/services/SmartGuideService.js');
                const dragged = new TextElement(400, 300, 'A');
                const raw = new RawElement('^RFW,H^FDz^FS');
                const service: any = new SmartGuideService();
                const edges = service._collectReferenceEdges(dragged, [dragged, raw], { width: 100, height: 50, dpmm: 8 }, null, 800, 400);
                return edges.x.filter((e: any) => e.type === 'element-edge').length;
            });
            expect(guided).toBe(0);
        });

        test('a RAW is not selectable by clicking the canvas origin', async ({ page }) => {
            const hit = await page.evaluate(async () => {
                const { RawElement } = await import('/src/elements/RawElement.js');
                const { InteractionHandler } = await import('/src/interaction-handler.js');
                const handler: any = Object.create(InteractionHandler.prototype);
                handler.elements = [new RawElement('^RFW,H^FDz^FS')];
                handler.labelSettings = { width: 100, height: 50, dpmm: 8 };
                return handler.getElementAtPosition(0, 0);
            });
            expect(hit).toBeNull();
        });
    });

    test.describe('Lifecycle', () => {
        test('the toolbar creates an empty RAW whose text reaches the output', async ({ page }) => {
            await page.locator('#add-raw-btn').click();
            expect(await elementsPanel.getElementCount()).toBe(1);

            await propertiesPanel.setProperty('prop-raw-text', '^RFW,H,1,2,1^FDABCD^FS');
            await zplOutput.verifyZPLContains('^RFW,H,1,2,1^FDABCD^FS');
        });

        test('typing an envelope command surfaces a warning', async ({ page }) => {
            await page.locator('#add-raw-btn').click();
            const warning = page.locator('#prop-raw-envelope-warning');
            await expect(warning).toBeHidden();

            await propertiesPanel.setProperty('prop-raw-text', '^RFW,H^FDx^FS^XZ');
            await expect(warning).toBeVisible();
        });

        test('reordering a RAW moves it in the ZPL output', async ({ page }) => {
            await pasteZPL(page, zplOutput, '^XA^FO50,50^A0N,30,30^FDHi^FS^RFW,H^FD1^FS^XZ', 2);

            const before = await zplOutput.getZPLCode();
            expect(before.indexOf('^RFW,H^FD1^FS')).toBeGreaterThan(before.indexOf('^FDHi^FS'));

            await page.locator('#elements-list .element-item').nth(1).locator('.move-up-btn').click();

            const after = await zplOutput.getZPLCode();
            expect(after.indexOf('^RFW,H^FD1^FS')).toBeLessThan(after.indexOf('^FDHi^FS'));
        });

        test('a RAW survives a JSON export/import round trip', async ({ page }) => {
            await pasteZPL(page, zplOutput, '^XA^FO50,50^A0N,30,30^FDHi^FS^RFW,H,1,2,1^FD1234^FS^XZ', 2);

            const json = await page.evaluate(async () => {
                const { SerializationService } = await import('/src/services/SerializationService.js');
                const service = new SerializationService();
                const state = (window as any).appState;
                return service.exportTemplate(state.elements, state.labelSettings);
            });
            expect(JSON.parse(json).elements.some((e: any) => e.type === 'RAW' && e.text === '^RFW,H,1,2,1^FD1234^FS')).toBe(true);

            await zplOutput.importTemplateFromJSON(json);
            await expect(page.locator('#elements-list .element-item')).toHaveCount(2, { timeout: 5000 });
            await zplOutput.verifyZPLContains('^RFW,H,1,2,1^FD1234^FS');
        });

        test('a non-string text in a hand-edited JSON file cannot break render()', async ({ page }) => {
            const rendered = await page.evaluate(async () => {
                const { SerializationService } = await import('/src/services/SerializationService.js');
                const element = new SerializationService().createElementFromData({ type: 'RAW', text: { evil: true } });
                return { text: element.text, rendered: element.render() };
            });
            expect(rendered).toEqual({ text: '', rendered: '' });
        });

        test('the density dialog reports RAW elements as unscalable', async ({ page }) => {
            const analysis = await page.evaluate(async () => {
                const { analyzeRescale } = await import('/src/services/DensityRescaleService.js');
                const { RawElement } = await import('/src/elements/RawElement.js');
                return analyzeRescale({
                    elements: [new RawElement('^FO10,10^RFW,H^FDz^FS')],
                    labelSettings: { width: 100, height: 50, dpmm: 8 },
                    oldDpmm: 8,
                    newDpmm: 12,
                });
            });
            expect(analysis.rawElementCount).toBe(1);
        });
    });
});
