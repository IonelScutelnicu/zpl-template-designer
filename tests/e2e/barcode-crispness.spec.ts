import { test, expect } from '../fixtures';

test.describe('Barcode canvas crispness', () => {
    test('keeps 1D bar edges binary at fractional zoom in every orientation', async ({ page }) => {
        await page.goto('/?e2e=1');

        const results = await page.evaluate(async () => {
            const [{ CanvasRenderer }, { BarcodeElement }] = await Promise.all([
                import('/src/canvas-renderer.js'),
                import('/src/elements/BarcodeElement.js'),
            ]);

            return ['N', 'R', 'I', 'B'].map((orientation) => {
                const canvas = document.createElement('canvas');
                const renderer = new CanvasRenderer(canvas);
                const barcode = new BarcodeElement(
                    10, 20, '1234567890', 50, 1, 3, false, false,
                    'CODE128', false, orientation,
                );
                renderer.setZoom(1.35);
                renderer.renderCanvas([barcode], {
                    width: 57,
                    height: 32,
                    dpmm: 8,
                    homeX: 0,
                    homeY: 0,
                    labelTop: 0,
                    printOrientation: 'N',
                    printMirror: 'N',
                });

                const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
                let black = 0;
                let intermediate = 0;
                for (let i = 0; i < data.length; i += 4) {
                    if (data[i + 3] !== 255) continue;
                    const isBlack = data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0;
                    const isWhite = data[i] === 255 && data[i + 1] === 255 && data[i + 2] === 255;
                    if (isBlack) black += 1;
                    else if (!isWhite) intermediate += 1;
                }
                return { orientation, black, intermediate };
            });
        });

        for (const result of results) {
            expect(result.black, `${result.orientation} should draw barcode ink`).toBeGreaterThan(100);
            expect(result.intermediate, `${result.orientation} should not antialias bar edges`).toBe(0);
        }
    });
});
