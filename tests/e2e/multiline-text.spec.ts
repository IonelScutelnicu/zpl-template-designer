import { test, expect } from '../fixtures';
import { ElementsPanel } from '../page-objects/ElementsPanel';
import { PropertiesPanel } from '../page-objects/PropertiesPanel';
import { ZPLOutput } from '../page-objects/ZPLOutput';
import { Fullscreen } from '../page-objects/Fullscreen';

// Each ZPL text command breaks lines its own way, verified against the Labelary
// API: ^FB honours \& and discards raw line feeds, ^TB honours a real line feed
// (_0A under ^FH) and prints \& literally, and ^A supports neither — it drops
// everything after the break, so we collapse to a space. See docs/adr/0013.
const TWO_LINES = 'Line1\nLine2';

test.describe('Multiline text', () => {
    let elementsPanel: ElementsPanel;
    let propertiesPanel: PropertiesPanel;
    let zplOutput: ZPLOutput;

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        elementsPanel = new ElementsPanel(page);
        propertiesPanel = new PropertiesPanel(page);
        zplOutput = new ZPLOutput(page);
    });

    test.describe('line-break token per command', () => {
        test('^TB encodes the break as _0A and turns on ^FH', async () => {
            await elementsPanel.addTextBlockElement();
            await elementsPanel.selectElementByIndex(0);
            await propertiesPanel.setProperty('prop-content', TWO_LINES);

            await zplOutput.verifyZPLContains('^FH^FDLine1_0ALine2^FS');
            await zplOutput.verifyZPLNotContains('\\&');
        });

        test('^FB encodes the break as \\& and needs no ^FH', async () => {
            await elementsPanel.addFieldBlockElement();
            await elementsPanel.selectElementByIndex(0);
            await propertiesPanel.setProperty('prop-content', TWO_LINES);

            await zplOutput.verifyZPLContains('^FDLine1\\&Line2^FS');
            await zplOutput.verifyZPLNotContains('_0A');
        });

        test('^A collapses the break to a space', async () => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);
            await propertiesPanel.setProperty('prop-content', TWO_LINES);

            await zplOutput.verifyZPLContains('^FDLine1 Line2^FS');
            await zplOutput.verifyZPLNotContains('_0A');
        });

        test('^FB keeps the centre-justification marker after a real break', async ({ page }) => {
            await elementsPanel.addFieldBlockElement();
            await elementsPanel.selectElementByIndex(0);
            await propertiesPanel.setProperty('prop-content', TWO_LINES);
            await page.locator('button[data-justification="C"]').click();

            const zpl = await zplOutput.getZPLCode();
            // The break plus the trailing \& the centre justification appends.
            expect(zpl).toContain('^FDLine1\\&Line2\\&^FS');
            expect(zpl).toMatch(/\^FB\d+,\d+,\d+,C,\d+/);
        });

        test('a CRLF in ^TB Content does not emit a stray _0D', async ({ page }) => {
            const zpl = await page.evaluate(async () => {
                const { TextBlockElement } = await import('/src/elements/TextBlockElement.js');
                return new TextBlockElement(10, 20, 'Line1\r\nLine2').render();
            });

            expect(zpl).toContain('^FH^FDLine1_0ALine2^FS');
            expect(zpl).not.toContain('_0D');
        });
    });

    test.describe('round-trip through ZPL import', () => {
        test('^TB and ^FB restore the newline; ^A keeps the collapsed space', async ({ page }) => {
            const r = await page.evaluate(async () => {
                const [{ TextElement }, { TextBlockElement }, { FieldBlockElement }, { ZPLParser }] =
                    await Promise.all([
                        import('/src/elements/TextElement.js'),
                        import('/src/elements/TextBlockElement.js'),
                        import('/src/elements/FieldBlockElement.js'),
                        import('/src/services/ZPLParser.js'),
                    ]);

                const reparse = (zpl: string) =>
                    new ZPLParser().parse(`^XA${zpl}^XZ`, { dpmm: 8, labelHeight: 50 }).elements[0];

                const text = new TextElement(10, 20, 'Line1\nLine2', 30);
                const textBlock = new TextBlockElement(10, 60, 'Line1\nLine2', 30);
                const fieldBlock = new FieldBlockElement(10, 120, 'Line1\nLine2', 30);
                const centred = new FieldBlockElement(
                    10, 180, 'Line1\nLine2', 30, 0, 200, 2, 0, 'C');

                return {
                    text: reparse(text.render()).content,
                    textBlock: reparse(textBlock.render()).content,
                    fieldBlock: reparse(fieldBlock.render()).content,
                    centred: reparse(centred.render()).content,
                };
            });

            expect(r.textBlock).toBe('Line1\nLine2');
            expect(r.fieldBlock).toBe('Line1\nLine2');
            // The centre-justification \& is stripped, the real break survives.
            expect(r.centred).toBe('Line1\nLine2');
            // ^A never carried the break, so it comes back as the space it became.
            expect(r.text).toBe('Line1 Line2');
        });
    });

    test.describe('Preview Data', () => {
        test('the value control is a textarea that accepts a newline', async ({ page }) => {
            await elementsPanel.addTextBlockElement();
            await elementsPanel.selectElementByIndex(0);
            await propertiesPanel.setProperty('prop-content', '%msg%');

            await page.locator('details[data-fs-tab="preview-data"] summary').click();
            const value = page.locator('#preview-data-panel [data-placeholder="msg"]');
            await expect(value).toBeVisible();
            expect(await value.evaluate((el) => el.tagName)).toBe('TEXTAREA');

            await value.fill(TWO_LINES);
            await value.dispatchEvent('input');

            expect(await page.evaluate(() =>
                (window as any).appState.labelSettings.previewData,
            )).toEqual({ msg: 'Line1\nLine2' });
        });

        test('the inline Preview Value row is a textarea too', async ({ page }) => {
            await elementsPanel.addFieldBlockElement();
            await elementsPanel.selectElementByIndex(0);
            await propertiesPanel.setProperty('prop-content', '%msg%');

            const row = page.locator('[data-content-placeholder="msg"]');
            await expect(row).toBeVisible();
            expect(await row.evaluate((el) => el.tagName)).toBe('TEXTAREA');
        });

        // The panel re-renders whether or not it is on screen. A textarea inside a
        // display:none fullscreen tab reports scrollHeight 0, so measuring it there
        // used to pin height:0 and leave a collapsed sliver once the tab opened.
        test('a value box rendered while its tab is hidden opens at full height', async ({ page }) => {
            const fullscreen = new Fullscreen(page);

            await elementsPanel.addTextBlockElement();
            await elementsPanel.selectElementByIndex(0);

            await fullscreen.enter();
            await fullscreen.iconRailButton('add').click();

            // Creates the placeholder — and re-renders Preview Data — while hidden.
            await propertiesPanel.setProperty('prop-content', '%msg%');
            await fullscreen.iconRailButton('preview-data').click();

            const field = page.locator('#preview-data-panel [data-placeholder="msg"]');
            await expect(field).toBeVisible();
            const empty = (await field.boundingBox())!.height;
            expect(empty).toBeGreaterThan(20);

            // A multiline value arriving while hidden opens taller still.
            await fullscreen.iconRailButton('add').click();
            await page.locator('[data-content-placeholder="msg"]').fill('one\ntwo\nthree');
            await page.locator('[data-content-placeholder="msg"]').dispatchEvent('input');
            await fullscreen.iconRailButton('preview-data').click();

            expect((await field.boundingBox())!.height).toBeGreaterThan(empty * 2);
        });

        test('the value box grows and shrinks with the value while visible', async ({ page }) => {
            await elementsPanel.addTextBlockElement();
            await elementsPanel.selectElementByIndex(0);
            await propertiesPanel.setProperty('prop-content', '%msg%');

            await page.locator('details[data-fs-tab="preview-data"] summary').click();
            const field = page.locator('#preview-data-panel [data-placeholder="msg"]');
            const heightAfter = async (value: string) => {
                await field.fill(value);
                await field.dispatchEvent('input');
                return (await field.boundingBox())!.height;
            };

            const one = await heightAfter('a');
            const four = await heightAfter('a\nb\nc\nd');
            expect(four).toBeGreaterThan(one * 2);
            // Deleting lines must collapse it again, not leave a tall empty box.
            expect(await heightAfter('a')).toBe(one);
        });

        test('a multiline value uses each element type\'s own token in the preview ZPL', async ({ page }) => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);
            await propertiesPanel.setProperty('prop-content', '%msg%');

            await elementsPanel.addTextBlockElement();
            await elementsPanel.selectElementByIndex(1);
            await propertiesPanel.setProperty('prop-content', '%msg%');

            await elementsPanel.addFieldBlockElement();
            await elementsPanel.selectElementByIndex(2);
            await propertiesPanel.setProperty('prop-content', '%msg%');

            await page.locator('details[data-fs-tab="preview-data"] summary').click();
            const value = page.locator('#preview-data-panel [data-placeholder="msg"]');
            await value.fill(TWO_LINES);
            await value.dispatchEvent('input');

            const previewZpl = await page.evaluate(async () => {
                const { ZPLGenerator } = await import('/src/services/ZPLGenerator.js');
                const state = (window as any).appState;
                return new ZPLGenerator().generatePreviewZPL(state.elements, state.labelSettings);
            });

            expect(previewZpl).toContain('^FDLine1 Line2^FS');        // ^A
            expect(previewZpl).toContain('^FH^FDLine1_0ALine2^FS');   // ^TB
            expect(previewZpl).toContain('^FDLine1\\&Line2^FS');      // ^FB

            // Production ZPL still carries the placeholder, unresolved.
            await zplOutput.verifyZPLContains('^FD%msg%^FS');
        });
    });

    // A user can type the ^FB escape straight into the Content. The printer breaks
    // on it, so the canvas must too — but only for ^FB: ^TB and ^A print it as
    // literal characters (measured against Labelary).
    test.describe('a literal \\& typed into Content', () => {
        // Renders one element to an offscreen canvas and counts horizontal bands
        // of ink, i.e. how many lines of text were actually drawn.
        const inkLines = (page: any, type: string, content: string) => page.evaluate(
            async ({ type, content }: { type: string; content: string }) => {
                const [{ CanvasRenderer }, { TextElement }, { TextBlockElement }, { FieldBlockElement }] =
                    await Promise.all([
                        import('/src/canvas-renderer.js'),
                        import('/src/elements/TextElement.js'),
                        import('/src/elements/TextBlockElement.js'),
                        import('/src/elements/FieldBlockElement.js'),
                    ]);

                const element = type === 'TEXT' ? new TextElement(20, 30, content, 30)
                    : type === 'TEXTBLOCK' ? new TextBlockElement(20, 30, content, 30, 0, 360, 120)
                        : new FieldBlockElement(20, 30, content, 30, 0, 360, 4);

                const canvas = document.createElement('canvas');
                new CanvasRenderer(canvas).renderCanvas([element], {
                    width: 100, height: 76, dpmm: 8,
                    defaultFontHeight: 30, defaultFontWidth: 0, previewData: {},
                }, null);

                const ctx = canvas.getContext('2d')!;
                const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                let bands = 0, inBand = false;
                for (let y = 0; y < canvas.height; y++) {
                    let ink = false;
                    for (let x = 0; x < canvas.width && !ink; x++) {
                        const i = (y * canvas.width + x) * 4;
                        if (d[i + 3] > 40 && d[i] < 128) ink = true;
                    }
                    if (ink && !inBand) bands++;
                    inBand = ink;
                }
                return bands;
            }, { type, content });

        test('^FB draws it as a line break', async ({ page }) => {
            expect(await inkLines(page, 'FIELDBLOCK', 'Alpha\\&Beta')).toBe(2);
            // Same content without the escape stays on one line.
            expect(await inkLines(page, 'FIELDBLOCK', 'AlphaBeta')).toBe(1);
        });

        test('^TB and ^A draw it literally, as the printer does', async ({ page }) => {
            expect(await inkLines(page, 'TEXTBLOCK', 'Alpha\\&Beta')).toBe(1);
            expect(await inkLines(page, 'TEXT', 'Alpha\\&Beta')).toBe(1);
        });

        test('^FB passes it through to the ZPL untouched', async () => {
            await elementsPanel.addFieldBlockElement();
            await elementsPanel.selectElementByIndex(0);
            await propertiesPanel.setProperty('prop-content', 'Alpha\\&Beta');

            await zplOutput.verifyZPLContains('^FDAlpha\\&Beta^FS');
        });
    });

    test.describe('canvas wrapping', () => {
        test('wrapStyledText treats a newline as an explicit break', async ({ page }) => {
            const r = await page.evaluate(async () => {
                const { wrapStyledText } = await import('/src/utils/fontMetrics.js');
                const ctx = document.createElement('canvas').getContext('2d')!;
                ctx.font = '20px monospace';
                const wrap = (text: string) =>
                    wrapStyledText(ctx, text, {}, 20, 1, () => 10000);
                return {
                    simple: wrap('a\nb'),
                    // Consecutive breaks produce a blank line, as the printer does.
                    blank: wrap('a\n\nb'),
                    none: wrap('a b'),
                    empty: wrap(''),
                };
            });

            expect(r.simple).toEqual(['a', 'b']);
            expect(r.blank).toEqual(['a', '', 'b']);
            expect(r.none).toEqual(['a b']);
            expect(r.empty).toEqual([]);
        });

        test('an explicit break still wraps each line to the block width', async ({ page }) => {
            const lines = await page.evaluate(async () => {
                const { wrapStyledText } = await import('/src/utils/fontMetrics.js');
                const ctx = document.createElement('canvas').getContext('2d')!;
                ctx.font = '20px monospace';
                // Narrow enough that "aaa bbb" must wrap, on both sides of the break.
                const width = ctx.measureText('aaa bb').width;
                return wrapStyledText(ctx, 'aaa bbb\nccc ddd', {}, 20, 1, () => width);
            });

            expect(lines).toEqual(['aaa', 'bbb', 'ccc', 'ddd']);
        });
    });
});
