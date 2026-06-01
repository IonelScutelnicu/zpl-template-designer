import { test, expect } from '../fixtures';
import { compareImages } from '../fixtures/image-comparison';
import { readdirSync } from 'fs';
import { join } from 'path';

const TEMPLATES = readdirSync(join(__dirname, '../../templates'))
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));

// For each gallery template: render it, generate its ZPL, parse that ZPL back,
// render the parsed result, and assert the two canvas images match. This proves
// a copy-ZPL -> import-ZPL round trip reproduces the same label — relying on the
// ^FX metadata comment to carry width/height/dpmm that ZPL doesn't otherwise.
test.describe('ZPL round-trip rendering parity', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/?view=gallery');
    });

    for (const templateId of TEMPLATES) {
        test(`round-trip: ${templateId}`, async ({ page }) => {
            const { before, after } = await page.evaluate(async (id) => {
                const [
                    { CanvasRenderer },
                    { SerializationService },
                    { ZPLGenerator },
                    { ZPLParser },
                    json,
                ] = await Promise.all([
                    import('/src/canvas-renderer.js'),
                    import('/src/services/SerializationService.js'),
                    import('/src/services/ZPLGenerator.js'),
                    import('/src/services/ZPLParser.js'),
                    fetch(`/templates/${id}.json`).then(r => r.json()),
                ]);

                const svc = new SerializationService();
                const build = (data: unknown[]) => data
                    .map((d: unknown) => svc.createElementFromData(d, { keepId: true }))
                    .filter((el: unknown) => el !== null);

                const renderToDataUrl = (elements: unknown[], settings: unknown) => {
                    const canvas = document.createElement('canvas');
                    const renderer = new CanvasRenderer(canvas);
                    renderer.renderCanvas(elements, settings, null);
                    return canvas.toDataURL('image/png');
                };

                // BEFORE: the template as authored.
                const beforeElements = build(json.elements ?? []);
                const before = renderToDataUrl(beforeElements, json.labelSettings);

                // Round trip: generate ZPL, then parse it back. We use the
                // PREVIEW ZPL because that is what the canvas depicts — the
                // production ZPL substitutes %placeholder% for field values, so
                // re-importing it would render placeholder names, not the preview.
                // dpmm/labelHeight options match the template (the realistic
                // "same editor" case); the ^FX comment carries them through.
                const zpl = new ZPLGenerator().generatePreviewZPL(beforeElements, json.labelSettings);
                const parsed = new ZPLParser().parse(zpl, {
                    dpmm: json.labelSettings.dpmm,
                    labelHeight: json.labelSettings.height,
                });

                const afterElements = build(parsed.elements);
                const after = renderToDataUrl(afterElements, parsed.labelSettings);

                return { before, after };
            }, templateId);

            const toBuffer = (dataUrl: string) =>
                Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');

            const result = await compareImages(
                toBuffer(before),
                toBuffer(after),
                `roundtrip-${templateId}`
            );

            const message =
                `Template "${templateId}" canvas changed after ZPL round-trip: ` +
                `${result.diffPixels} pixels (${result.diffPercentage.toFixed(2)}%). ` +
                (result.diffImagePath ? `Diff: ${result.diffImagePath}` : '');

            expect(result.diffPercentage, message).toBeLessThan(1);
        });
    }
});
