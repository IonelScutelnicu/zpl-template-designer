import { test, expect } from '../fixtures';

test.describe('canvas render performance safeguards', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('reverse print composites opaque overlaps without pixel readback', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const { drawWithReverse } = await import('/src/rendering/reverseOverlay.js');
            const canvas = document.createElement('canvas');
            canvas.width = 100;
            canvas.height = 40;
            const ctx = canvas.getContext('2d')!;

            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#000000';
            ctx.fillRect(10, 10, 50, 20);

            const originalGetImageData = ctx.getImageData.bind(ctx);
            let readbacks = 0;
            ctx.getImageData = (...args: Parameters<CanvasRenderingContext2D['getImageData']>) => {
                readbacks += 1;
                return originalGetImageData(...args);
            };

            drawWithReverse(
                ctx,
                canvas,
                { x: 30, y: 10, width: 40, height: 20 },
                (targetCtx: CanvasRenderingContext2D, color: string) => {
                    targetCtx.fillStyle = color;
                    targetCtx.fillRect(30, 10, 25, 20);
                    targetCtx.fillRect(50, 10, 20, 20);
                },
                { reverse: true, color: '#000000', transparentBackground: false }
            );

            const pixel = (x: number, y: number) => Array.from(originalGetImageData(x, y, 1, 1).data);
            return {
                readbacks,
                existingInk: pixel(20, 15),
                overlap: pixel(35, 15),
                selfOverlap: pixel(52, 15),
                newInk: pixel(65, 15),
                background: pixel(80, 15)
            };
        });

        expect(result.readbacks).toBe(0);
        expect(result.existingInk).toEqual([0, 0, 0, 255]);
        expect(result.overlap).toEqual([255, 255, 255, 255]);
        expect(result.selfOverlap).toEqual([255, 255, 255, 255]);
        expect(result.newInk).toEqual([0, 0, 0, 255]);
        expect(result.background).toEqual([255, 255, 255, 255]);
    });

    test('reverse print preserves transparent overlay semantics without pixel readback', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const { drawWithReverse } = await import('/src/rendering/reverseOverlay.js');
            const canvas = document.createElement('canvas');
            canvas.width = 100;
            canvas.height = 50;
            const ctx = canvas.getContext('2d')!;

            ctx.fillStyle = '#000000';
            ctx.fillRect(10, 0, 50, 20);
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(10, 25, 40, 20);

            const originalGetImageData = ctx.getImageData.bind(ctx);
            let readbacks = 0;
            ctx.getImageData = (...args: Parameters<CanvasRenderingContext2D['getImageData']>) => {
                readbacks += 1;
                return originalGetImageData(...args);
            };

            drawWithReverse(
                ctx,
                canvas,
                { x: 30, y: 0, width: 40, height: 45 },
                (targetCtx: CanvasRenderingContext2D, color: string) => {
                    targetCtx.fillStyle = color;
                    targetCtx.fillRect(30, 0, 25, 45);
                    targetCtx.fillRect(50, 0, 20, 45);
                },
                { reverse: true, color: '#000000', transparentBackground: true }
            );

            const pixel = (x: number, y: number) => Array.from(originalGetImageData(x, y, 1, 1).data);
            return {
                readbacks,
                blackOverlap: pixel(35, 10),
                selfOverlap: pixel(52, 10),
                whiteOverlap: pixel(35, 35),
                transparentInk: pixel(65, 10),
                untouched: pixel(80, 10)
            };
        });

        expect(result.readbacks).toBe(0);
        expect(result.blackOverlap).toEqual([255, 255, 255, 255]);
        expect(result.selfOverlap).toEqual([255, 255, 255, 255]);
        expect(result.whiteOverlap).toEqual([0, 0, 0, 255]);
        expect(result.transparentInk).toEqual([0, 0, 0, 255]);
        expect(result.untouched).toEqual([0, 0, 0, 0]);
    });

    test('a real reversed text element renders on opaque and transparent overlay pixels', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const [{ TextRenderer }, { TextElement }] = await Promise.all([
                import('/src/rendering/TextRenderer.js'),
                import('/src/elements/TextElement.js')
            ]);
            const width = 500;
            const height = 90;
            const maskCanvas = document.createElement('canvas');
            maskCanvas.width = width;
            maskCanvas.height = height;
            const maskCtx = maskCanvas.getContext('2d')!;
            const outputCanvas = document.createElement('canvas');
            outputCanvas.width = width;
            outputCanvas.height = height;
            const outputCtx = outputCanvas.getContext('2d')!;
            const renderer = new TextRenderer();
            const element = new TextElement(10, 10, 'ABCDEF-GH', 50, 50, 'D', 'N', false);
            const labelSettings = {
                fontId: '0',
                defaultFontHeight: 30,
                defaultFontWidth: 30,
                customFonts: []
            };
            const transform = {
                scale: 1,
                homeX: 0,
                homeY: 0,
                labelTop: 0,
                transparentBackground: true
            };

            renderer.render(maskCtx, maskCanvas, element, labelSettings, transform);
            outputCtx.fillStyle = '#000000';
            outputCtx.fillRect(0, 0, 200, height);
            element.reverse = true;
            renderer.render(outputCtx, outputCanvas, element, labelSettings, transform);

            const mask = maskCtx.getImageData(0, 0, width, height).data;
            const output = outputCtx.getImageData(0, 0, width, height).data;
            let opaquePixels = 0;
            let transparentPixels = 0;
            let opaqueMismatches = 0;
            let transparentMismatches = 0;
            let firstMismatch = null;
            for (let y = 0; y < height; y += 1) {
                for (let x = 0; x < width; x += 1) {
                    const index = (y * width + x) * 4;
                    if (mask[index + 3] !== 255) continue;
                    if (x < 200) {
                        opaquePixels += 1;
                        if (output[index] < 254 || output[index + 1] < 254
                            || output[index + 2] < 254 || output[index + 3] < 254) {
                            opaqueMismatches += 1;
                            firstMismatch ||= { x, y, side: 'opaque', output: Array.from(output.slice(index, index + 4)) };
                        }
                    } else {
                        transparentPixels += 1;
                        if (output[index] > 1 || output[index + 1] > 1
                            || output[index + 2] > 1 || output[index + 3] < 254) {
                            transparentMismatches += 1;
                            firstMismatch ||= { x, y, side: 'transparent', output: Array.from(output.slice(index, index + 4)) };
                        }
                    }
                }
            }
            return { opaquePixels, transparentPixels, opaqueMismatches, transparentMismatches, firstMismatch };
        });

        expect(result.opaquePixels).toBeGreaterThan(0);
        expect(result.transparentPixels).toBeGreaterThan(0);
        expect(result.opaqueMismatches, JSON.stringify(result.firstMismatch)).toBe(0);
        expect(result.transparentMismatches, JSON.stringify(result.firstMismatch)).toBe(0);
    });

    test('drag and marquee updates each queue one render per animation frame', async ({ page }) => {
        const result = await page.evaluate(() => {
            const renderer = (window as any).canvasRenderer;
            const handler = (window as any).interactionHandler;
            const originalRender = renderer.renderCanvas.bind(renderer);
            const originalRequestAnimationFrame = window.requestAnimationFrame;
            const originalCancelAnimationFrame = window.cancelAnimationFrame;
            const frames: FrameRequestCallback[] = [];
            let count = 0;
            let nextFrameId = 1;
            renderer.renderCanvas = (...args: unknown[]) => {
                count += 1;
                return originalRender(...args);
            };
            window.requestAnimationFrame = callback => {
                frames.push(callback);
                return nextFrameId++;
            };
            window.cancelAnimationFrame = () => {};

            try {
                const element = { id: 'drag-test', type: 'BOX', x: 10, y: 10 };
                for (let i = 0; i < 8; i += 1) {
                    handler.callbacks.onElementDragging(element);
                }
                const dragFrames = frames.length;
                frames.shift()!(performance.now());
                const dragRenders = count;

                for (let i = 0; i < 8; i += 1) {
                    handler.callbacks.onMarqueeSelect([], { left: 0, top: 0, width: 10, height: 10 });
                }
                const marqueeFrames = frames.length;
                frames.shift()!(performance.now());

                return {
                    dragFrames,
                    dragRenders,
                    marqueeFrames,
                    marqueeRenders: count - dragRenders
                };
            } finally {
                window.requestAnimationFrame = originalRequestAnimationFrame;
                window.cancelAnimationFrame = originalCancelAnimationFrame;
                renderer.renderCanvas = originalRender;
            }
        });

        expect(result).toEqual({
            dragFrames: 1,
            dragRenders: 1,
            marqueeFrames: 1,
            marqueeRenders: 1
        });
    });

    test('non-reverse graphics reuse the native black bitmap source', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const { GraphicFieldRenderer } = await import('/src/rendering/GraphicFieldRenderer.js');
            const renderer = new GraphicFieldRenderer();
            const canvas = document.createElement('canvas');
            canvas.width = 20;
            canvas.height = 20;
            const ctx = canvas.getContext('2d')!;
            const imageData = new ImageData(new Uint8ClampedArray([
                0, 0, 0, 255,
                0, 0, 0, 0
            ]), 2, 1);
            const element = {
                x: 0,
                y: 0,
                widthDots: 2,
                heightDots: 1,
                orientation: 'N',
                reverse: false,
                ensureImageData: () => imageData,
                isOpaque: () => false
            };
            const transform = {
                scale: 1,
                homeX: 0,
                homeY: 0,
                labelTop: 0,
                transparentBackground: false
            };
            let tintCalls = 0;
            const originalBuildTintedCanvas = (renderer as any)._buildTintedCanvas.bind(renderer);
            (renderer as any)._buildTintedCanvas = (...args: unknown[]) => {
                tintCalls += 1;
                return originalBuildTintedCanvas(...args);
            };

            renderer.render(ctx, canvas, element, {}, transform);
            const firstSource = (renderer as any).sourceCache.get(imageData).get('#000000');
            renderer.render(ctx, canvas, element, {}, transform);
            const secondSource = (renderer as any).sourceCache.get(imageData).get('#000000');

            return { tintCalls, reusedSource: firstSource === secondSource };
        });

        expect(result).toEqual({ tintCalls: 0, reusedSource: true });
    });

    test('a stable render does not rewrite canvas dimensions', async ({ page }) => {
        const dimensionMutations = await page.evaluate(async () => {
            const renderer = (window as any).canvasRenderer;
            const state = (window as any).appState;
            renderer.renderCanvas(state.elements, state.labelSettings, [null]);

            const observer = new MutationObserver(() => {});
            observer.observe(renderer.canvas, {
                attributes: true,
                attributeFilter: ['width', 'height']
            });

            renderer.renderCanvas(state.elements, state.labelSettings, []);
            await Promise.resolve();
            const count = observer.takeRecords().length;
            observer.disconnect();
            return count;
        });

        expect(dimensionMutations).toBe(0);
    });
});
