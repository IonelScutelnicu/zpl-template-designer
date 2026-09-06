import { test, expect } from '../fixtures';
import { ElementsPanel } from '../page-objects/ElementsPanel';
import { PropertiesPanel } from '../page-objects/PropertiesPanel';
import { ZPLOutput } from '../page-objects/ZPLOutput';
import { Fullscreen } from '../page-objects/Fullscreen';

// Each ZPL text command breaks lines its own way, verified against the Labelary
// API: ^FB honours \& and discards raw line feeds, ^TB honours a real line feed
// (_0A under ^FH) and prints \& literally, and ^A supports neither — it drops
// everything after the break, so we collapse to a space.
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
        test('^TB encodes the break as _0A and turns on ^FH', async ({ page }) => {
            await elementsPanel.addTextBlockElement();
            await elementsPanel.selectElementByIndex(0);
            await propertiesPanel.setProperty('prop-content', TWO_LINES);

            await zplOutput.verifyZPLContains('^FH^FDLine1_0ALine2^FS');
            await zplOutput.verifyZPLNotContains('\\&');
            await expect(page.locator('#prop-field-hex')).toBeChecked();
            await expect(page.locator('#prop-field-hex')).toBeDisabled();
        });

        test('^FB encodes the break as \\& and needs no ^FH', async ({ page }) => {
            await elementsPanel.addFieldBlockElement();
            await elementsPanel.selectElementByIndex(0);
            await propertiesPanel.setProperty('prop-content', TWO_LINES);

            await zplOutput.verifyZPLContains('^FDLine1\\&Line2^FS');
            await zplOutput.verifyZPLNotContains('_0A');
            await expect(page.locator('#prop-field-hex')).not.toBeChecked();
        });

        test('^A collapses the break to a space', async ({ page }) => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);
            await propertiesPanel.setProperty('prop-content', TWO_LINES);

            await zplOutput.verifyZPLContains('^FDLine1 Line2^FS');
            await zplOutput.verifyZPLNotContains('_0A');
            await expect(page.locator('#prop-field-hex')).not.toBeChecked();
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

        test('^FB ignores physical source newlines beside explicit \\& breaks', async ({ page }) => {
            const result = await page.evaluate(async () => {
                const [{ ZPLParser }, { FieldBlockElement }] = await Promise.all([
                    import('/src/services/ZPLParser.js'),
                    import('/src/elements/FieldBlockElement.js'),
                ]);
                const zpl = '^XA^FO15,360^A0N,18^FB208,7,5,C^FD%field_x%\\&\r\n'
                    + '%field_a%\\&\n%field_b%\\&\r%field_c% - %field_d%^FS^XZ';
                const parsed = new ZPLParser().parse(zpl, { dpmm: 8, labelHeight: 80 }).elements[0];
                const element = new FieldBlockElement(
                    parsed.x, parsed.y, parsed.content, parsed.fontSize, parsed.fontWidth,
                    parsed.blockWidth, parsed.maxLines, parsed.lineSpacing,
                    parsed.justification, parsed.hangingIndent, parsed.fontId,
                    parsed.reverse, parsed.orientation, parsed.fieldHex,
                );
                element.endBreak = parsed.endBreak;

                return { content: parsed.content, rendered: element.render() };
            });

            expect(result.content).toBe('%field_x%\n%field_a%\n%field_b%\n%field_c% - %field_d%');
            // The source carried no terminating \&, so the re-render must not invent one.
            expect(result.rendered).toContain(
                '^FD%field_x%\\&%field_a%\\&%field_b%\\&%field_c% - %field_d%^FS',
            );
            expect(result.rendered).not.toContain('\\&\\&');
        });

        test('^FB round-trips whether the field data carried a terminating \\&', async ({ page }) => {
            const result = await page.evaluate(async () => {
                const [{ ZPLParser }, { SerializationService }] = await Promise.all([
                    import('/src/services/ZPLParser.js'),
                    import('/src/services/SerializationService.js'),
                ]);
                const serializer = new SerializationService();

                const roundTrip = (fieldData: string) => {
                    const zpl = '^XA^FO10,10^A0N,25^FB200,2,0,C,0^FD' + fieldData + '^FS^XZ';
                    const parsed = new ZPLParser().parse(zpl, { dpmm: 8, labelHeight: 80 }).elements[0];
                    const element = serializer.createElementFromData(parsed);
                    return { endBreak: element.endBreak, rendered: element.render() };
                };

                return { open: roundTrip('number'), closed: roundTrip('number\\&') };
            });

            // A trailing \& terminates the last line without creating another one, and
            // Zebra centres an end-of-field line as if a space followed it. The marker
            // therefore has to survive import instead of being discarded or invented.
            expect(result.open.endBreak).toBe(false);
            expect(result.open.rendered).toContain('^FDnumber^FS');
            expect(result.closed.endBreak).toBe(true);
            expect(result.closed.rendered).toContain('^FDnumber\\&^FS');
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
                // Scalable Font 0: counting ink bands needs lines that don't touch, and
                // the bitmap fonts stack ^FB lines tightly enough to merge the bands.
                new CanvasRenderer(canvas).renderCanvas([element], {
                    width: 100, height: 76, dpmm: 8, fontId: '0',
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

        test('wrap metadata distinguishes soft wraps, forced splits, hard breaks, and field ends', async ({ page }) => {
            const result = await page.evaluate(async () => {
                const { wrapStyledText, wrapStyledTextDetailed } = await import('/src/utils/fontMetrics.js');
                const ctx = document.createElement('canvas').getContext('2d')!;
                ctx.font = '20px monospace';
                const width = (ctx.measureText('number number').width + ctx.measureText('number number number').width) / 2;
                const maxWidth = () => width;

                return {
                    softEnd: wrapStyledTextDetailed(ctx, 'number number number', {}, 20, 1, maxWidth),
                    forcedEnd: wrapStyledTextDetailed(ctx, 'aaaaaaaaaaaa', {}, 20, 1,
                        () => ctx.measureText('aaaa').width),
                    hardEnd: wrapStyledTextDetailed(ctx, 'number number\nnumber', {}, 20, 1, maxWidth),
                    stringOnly: wrapStyledText(ctx, 'number number number', {}, 20, 1, maxWidth),
                };
            });

            expect(result.softEnd).toEqual([
                { text: 'number number', termination: 'soft' },
                { text: 'number', termination: 'end' },
            ]);
            expect(result.hardEnd).toEqual([
                { text: 'number number', termination: 'hard' },
                { text: 'number', termination: 'end' },
            ]);
            expect(result.forcedEnd).toEqual([
                { text: 'aaaa', termination: 'forced' },
                { text: 'aaaa', termination: 'forced' },
                { text: 'aaaa', termination: 'end' },
            ]);
            expect(result.stringOnly).toEqual(['number number', 'number']);
        });

        test('centering applies the trailing-space bias only to soft wraps', async ({ page }) => {
            const bounds = await page.evaluate(async () => {
                const [{ CanvasRenderer }, { FieldBlockElement }] = await Promise.all([
                    import('/src/canvas-renderer.js'),
                    import('/src/elements/FieldBlockElement.js'),
                ]);
                await document.fonts.ready;

                const render = (content: string, justification: string) => {
                    const canvas = document.createElement('canvas');
                    const element = new FieldBlockElement(
                        21, 57, content, 18, 0, 237, 4, 0, justification, 9999, 'A', false, 'N',
                    );
                    new CanvasRenderer(canvas).renderCanvas([element], {
                        width: 100, height: 25, dpmm: 8, fontId: 'A',
                        defaultFontHeight: 18, defaultFontWidth: 0, previewData: {},
                    }, null);

                    const ctx = canvas.getContext('2d')!;
                    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    let left = canvas.width;
                    let right = 0;
                    for (let y = 0; y < canvas.height; y++) {
                        for (let x = 0; x < canvas.width; x++) {
                            const i = (y * canvas.width + x) * 4;
                            if (image.data[i] < 128 && image.data[i + 3] > 40) {
                                left = Math.min(left, x);
                                right = Math.max(right, x);
                            }
                        }
                    }
                    return { left, right };
                };

                return {
                    centered: {
                        soft: render('number number number\\&', 'C'),
                        end: render('number number', 'C'),
                        hard: render('number number\\&', 'C'),
                    },
                    left: {
                        end: render('number number', 'L'),
                        hard: render('number number\\&', 'L'),
                    },
                    right: {
                        end: render('number number', 'R'),
                        hard: render('number number\\&', 'R'),
                    },
                };
            });

            expect(bounds.centered.end).toEqual(bounds.centered.hard);
            expect(bounds.centered.end.left - bounds.centered.soft.left).toBeGreaterThanOrEqual(2);
            expect(bounds.left.hard).toEqual(bounds.left.end);
            expect(bounds.right.hard).toEqual(bounds.right.end);
        });

        test('centering biases an end line unless the field carried a closing \\&', async ({ page }) => {
            const lefts = await page.evaluate(async () => {
                const [{ CanvasRenderer }, { FieldBlockElement }] = await Promise.all([
                    import('/src/canvas-renderer.js'),
                    import('/src/elements/FieldBlockElement.js'),
                ]);
                await document.fonts.ready;

                const render = (content: string, endBreak: boolean) => {
                    const canvas = document.createElement('canvas');
                    const element = new FieldBlockElement(
                        21, 57, content, 18, 0, 237, 4, 0, 'C', 9999, 'A', false, 'N',
                    );
                    element.endBreak = endBreak;
                    new CanvasRenderer(canvas).renderCanvas([element], {
                        width: 100, height: 25, dpmm: 8, fontId: 'A',
                        defaultFontHeight: 18, defaultFontWidth: 0, previewData: {},
                    }, null);

                    const ctx = canvas.getContext('2d')!;
                    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    let left = canvas.width;
                    for (let y = 0; y < canvas.height; y++) {
                        for (let x = 0; x < canvas.width; x++) {
                            const i = (y * canvas.width + x) * 4;
                            if (image.data[i] < 128 && image.data[i + 3] > 40) left = Math.min(left, x);
                        }
                    }
                    return left;
                };

                return {
                    closed: render('number number', true),
                    open: render('number number', false),
                    openTrailingSpace: render('number number ', false),
                };
            });

            // Measured against Labelary: an end-of-field line centres on its width plus
            // the space that terminates it, so dropping the \& moves it half a space left.
            expect(lefts.closed - lefts.open).toBeGreaterThanOrEqual(2);
            // ...unless the line already ends in a space. That space *is* the terminator
            // and is already inside the measured width, so it must not be counted twice.
            expect(Math.abs(lefts.openTrailingSpace - lefts.open)).toBeLessThanOrEqual(1);
        });

        test('positive line spacing extends only the R and I far-edge pivots', async ({ page }) => {
            const bounds = await page.evaluate(async () => {
                const [{ CanvasRenderer }, { FieldBlockElement }] = await Promise.all([
                    import('/src/canvas-renderer.js'),
                    import('/src/elements/FieldBlockElement.js'),
                ]);
                await document.fonts.ready;

                const render = (orientation: string, lineSpacing: number) => {
                    const canvas = document.createElement('canvas');
                    const element = new FieldBlockElement(
                        100, 100, 'wrapped', 30, 30, 200, 1, lineSpacing,
                        'L', 0, '0', false, orientation,
                    );
                    new CanvasRenderer(canvas).renderCanvas([element], {
                        width: 100, height: 100, dpmm: 8, fontId: '0',
                        defaultFontHeight: 30, defaultFontWidth: 30, previewData: {},
                    }, null);

                    const ctx = canvas.getContext('2d')!;
                    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    let top = canvas.height, left = canvas.width, bottom = 0, right = 0;
                    for (let y = 0; y < canvas.height; y++) {
                        for (let x = 0; x < canvas.width; x++) {
                            const i = (y * canvas.width + x) * 4;
                            if (image.data[i] < 128 && image.data[i + 3] > 40) {
                                top = Math.min(top, y);
                                left = Math.min(left, x);
                                bottom = Math.max(bottom, y);
                                right = Math.max(right, x);
                            }
                        }
                    }
                    return { top, left, bottom, right };
                };

                return Object.fromEntries(['N', 'R', 'I', 'B'].map(orientation => [
                    orientation,
                    { zero: render(orientation, 0), spaced: render(orientation, 17) },
                ]));
            });

            expect(bounds.R.spaced.left - bounds.R.zero.left).toBe(17);
            expect(bounds.R.spaced.right - bounds.R.zero.right).toBe(17);
            expect(bounds.I.spaced.top - bounds.I.zero.top).toBe(17);
            expect(bounds.I.spaced.bottom - bounds.I.zero.bottom).toBe(17);
            expect(bounds.N.spaced).toEqual(bounds.N.zero);
            expect(bounds.B.spaced).toEqual(bounds.B.zero);
        });
    });
});
