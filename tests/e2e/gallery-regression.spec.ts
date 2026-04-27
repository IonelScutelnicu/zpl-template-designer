import { test, expect } from '../fixtures';
import { compareWithBaseline } from '../fixtures/image-comparison';

const TEMPLATES = [
    'labelary-example',
    'amazon-fba-fnsku',
    'warehouse-shelf-location',
    'retail-price-tag',
    'blood-bag-isbt-128',
];

test.describe('Gallery template rendering regression', () => {
    test.beforeEach(async ({ page }) => {
        // Any served page gives us same-origin access for dynamic imports
        await page.goto('/gallery.html');
    });

    for (const templateId of TEMPLATES) {
        test(`template: ${templateId}`, async ({ page }) => {
            const dataUrl = await page.evaluate(async (id) => {
                const [{ CanvasRenderer }, { SerializationService }, json] = await Promise.all([
                    import('/src/canvas-renderer.js'),
                    import('/src/services/SerializationService.js'),
                    fetch(`/gallery/templates/${id}.json`).then(r => r.json()),
                ]);

                const svc = new SerializationService();
                const elements = (json.elements ?? [])
                    .map((d: unknown) => svc.createElementFromData(d, { keepId: true }))
                    .filter((el: unknown) => el !== null);

                const canvas = document.createElement('canvas');
                const renderer = new CanvasRenderer(canvas);
                renderer.renderCanvas(elements, json.labelSettings, null);

                return canvas.toDataURL('image/png');
            }, templateId);

            expect(dataUrl).toBeTruthy();

            const buffer = Buffer.from(
                dataUrl.replace(/^data:image\/png;base64,/, ''),
                'base64'
            );

            const result = await compareWithBaseline(buffer, `gallery-template-${templateId}`);

            const message = result.diffPixels === -1
                ? `No baseline found for "${templateId}". Run "npm run baselines" to generate.`
                : `Template "${templateId}" differs from baseline: ` +
                  `${result.diffPixels} pixels (${result.diffPercentage.toFixed(2)}%). ` +
                  (result.diffImagePath ? `Diff: ${result.diffImagePath}` : '');

            expect(result.match, message).toBe(true);
        });
    }
});
