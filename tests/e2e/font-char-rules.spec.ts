import { test, expect } from '../fixtures';

test.describe('font character rules', () => {
    test('glyph xRatio/yRatio move ink without changing advance or wrapping', async ({ page }) => {
        await page.goto('/?e2e=1');

        const result = await page.evaluate(async () => {
            const { drawStyledText, measureStyledText, wrapStyledText } =
                await import('/src/utils/fontMetrics.js');
            await document.fonts.ready;

            const fontSize = 40;
            const baseRule = { type: 'glyph', advanceRatio: 1.2, widthRatio: 0.75 };
            const shiftedRule = { ...baseRule, xRatio: 0.25, yRatio: 0.2 };
            const fontConfig = (rule: typeof baseRule | typeof shiftedRule) => ({
                charRules: { H: rule },
            });

            const renderBounds = (rule: typeof baseRule | typeof shiftedRule) => {
                const canvas = document.createElement('canvas');
                canvas.width = 240;
                canvas.height = 180;
                const ctx = canvas.getContext('2d')!;
                ctx.font = `${fontSize}px Arial`;
                ctx.textBaseline = 'alphabetic';
                ctx.fillStyle = '#000';
                drawStyledText(ctx, 'H', 80, 80, fontConfig(rule), fontSize);

                const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                let left = canvas.width;
                let top = canvas.height;
                let right = -1;
                let bottom = -1;
                for (let y = 0; y < canvas.height; y++) {
                    for (let x = 0; x < canvas.width; x++) {
                        if (pixels[(y * canvas.width + x) * 4 + 3] === 0) continue;
                        left = Math.min(left, x);
                        top = Math.min(top, y);
                        right = Math.max(right, x);
                        bottom = Math.max(bottom, y);
                    }
                }
                return { left, top, right, bottom };
            };

            const measureAndWrap = (rule: typeof baseRule | typeof shiftedRule) => {
                const ctx = document.createElement('canvas').getContext('2d')!;
                ctx.font = `${fontSize}px Arial`;
                const config = fontConfig(rule);
                const measure = (text: string) => measureStyledText(ctx, text, config, fontSize, 1);
                const maxWidth = measure('HH') + 0.1;
                return {
                    width: measure('HHHH'),
                    lines: wrapStyledText(ctx, 'HHHH', config, fontSize, 1, () => maxWidth),
                };
            };

            return {
                baseBounds: renderBounds(baseRule),
                shiftedBounds: renderBounds(shiftedRule),
                baseLayout: measureAndWrap(baseRule),
                shiftedLayout: measureAndWrap(shiftedRule),
            };
        });

        expect(result.shiftedBounds.left - result.baseBounds.left).toBe(10);
        expect(result.shiftedBounds.right - result.baseBounds.right).toBe(10);
        expect(result.shiftedBounds.top - result.baseBounds.top).toBe(8);
        expect(result.shiftedBounds.bottom - result.baseBounds.bottom).toBe(8);
        expect(result.shiftedLayout.width).toBe(result.baseLayout.width);
        expect(result.shiftedLayout.lines).toEqual(result.baseLayout.lines);
        expect(result.baseLayout.lines).toEqual(['HH', 'HH']);
    });

    test('glyph heightRatio scales ink about the baseline without changing advance', async ({ page }) => {
        await page.goto('/?e2e=1');

        const result = await page.evaluate(async () => {
            const { drawStyledText, measureStyledText } = await import('/src/utils/fontMetrics.js');
            await document.fonts.ready;

            const fontSize = 40;
            const baseRule = { type: 'glyph', advanceRatio: 1.2, widthRatio: 0.75 };
            const shortRule = { ...baseRule, heightRatio: 0.5 };
            const fontConfig = (rule: typeof baseRule | typeof shortRule) => ({
                charRules: { H: rule },
            });

            const renderBounds = (rule: typeof baseRule | typeof shortRule) => {
                const canvas = document.createElement('canvas');
                canvas.width = 240;
                canvas.height = 180;
                const ctx = canvas.getContext('2d')!;
                ctx.font = `${fontSize}px Arial`;
                ctx.textBaseline = 'alphabetic';
                ctx.fillStyle = '#000';
                drawStyledText(ctx, 'H', 80, 80, fontConfig(rule), fontSize);

                const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                let left = canvas.width;
                let top = canvas.height;
                let right = -1;
                let bottom = -1;
                for (let y = 0; y < canvas.height; y++) {
                    for (let x = 0; x < canvas.width; x++) {
                        if (pixels[(y * canvas.width + x) * 4 + 3] === 0) continue;
                        left = Math.min(left, x);
                        top = Math.min(top, y);
                        right = Math.max(right, x);
                        bottom = Math.max(bottom, y);
                    }
                }
                return { left, top, right, bottom };
            };

            const measure = (rule: typeof baseRule | typeof shortRule) => {
                const ctx = document.createElement('canvas').getContext('2d')!;
                ctx.font = `${fontSize}px Arial`;
                return measureStyledText(ctx, 'HHHH', fontConfig(rule), fontSize, 1);
            };

            return {
                baseBounds: renderBounds(baseRule),
                shortBounds: renderBounds(shortRule),
                baseWidth: measure(baseRule),
                shortWidth: measure(shortRule),
            };
        });

        const baseHeight = result.baseBounds.bottom - result.baseBounds.top;
        const shortHeight = result.shortBounds.bottom - result.shortBounds.top;
        expect(shortHeight).toBeGreaterThan(0);
        expect(Math.abs(shortHeight - baseHeight / 2)).toBeLessThanOrEqual(1.5);
        // Baseline-anchored: the ink bottom and the horizontal extent don't move.
        expect(Math.abs(result.shortBounds.bottom - result.baseBounds.bottom)).toBeLessThanOrEqual(1);
        expect(Math.abs(result.shortBounds.left - result.baseBounds.left)).toBeLessThanOrEqual(1);
        expect(Math.abs(result.shortBounds.right - result.baseBounds.right)).toBeLessThanOrEqual(1);
        expect(result.shortWidth).toBe(result.baseWidth);
    });
});
