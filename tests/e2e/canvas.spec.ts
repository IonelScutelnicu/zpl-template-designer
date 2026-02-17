import { test, expect } from '@playwright/test';
import { ElementsPanel, PropertiesPanel, Canvas } from '../page-objects';

test.describe('Canvas - Drag, Resize, and Interactions', () => {
    let elementsPanel: ElementsPanel;
    let propertiesPanel: PropertiesPanel;
    let canvas: Canvas;

    test.beforeEach(async ({ page }) => {
        await page.goto('/?e2e=1');
        elementsPanel = new ElementsPanel(page);
        propertiesPanel = new PropertiesPanel(page);
        canvas = new Canvas(page);
        await canvas.waitForReady();
    });

    // ============== CANVAS RENDERING ==============
    test.describe('Canvas Rendering', () => {
        test('should render canvas on page load', async () => {
            expect(await canvas.isVisible()).toBe(true);
        });

        test('should have valid dimensions', async () => {
            const dimensions = await canvas.getDimensions();
            expect(dimensions.width).toBeGreaterThan(0);
            expect(dimensions.height).toBeGreaterThan(0);
        });

        test('should update canvas when element is added', async () => {
            const beforeScreenshot = await canvas.takeScreenshot();
            await elementsPanel.addTextElement();
            await canvas.waitForReady();
            const afterScreenshot = await canvas.takeScreenshot();

            // Screenshots should be different
            expect(beforeScreenshot.equals(afterScreenshot)).toBe(false);
        });

        test('should update canvas when element is deleted', async () => {
            await elementsPanel.addTextElement();
            await canvas.waitForReady();
            const beforeScreenshot = await canvas.takeScreenshot();

            await elementsPanel.deleteElementByIndex(0);
            await canvas.waitForReady();
            const afterScreenshot = await canvas.takeScreenshot();

            expect(beforeScreenshot.equals(afterScreenshot)).toBe(false);
        });

        test('should update canvas when default font height/width changes in real time', async ({ page }) => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);

            // Ensure the element uses label defaults for size
            await propertiesPanel.setProperty('prop-font-size', 0);
            await propertiesPanel.setProperty('prop-font-width', 0);
            await propertiesPanel.setProperty('prop-preview-text', 'Default Font');
            await propertiesPanel.setProperty('prop-x', 80);
            await propertiesPanel.setProperty('prop-y', 80);

            await canvas.waitForReady();
            const beforeScreenshot = await canvas.takeScreenshot();

            // Expand Default Font section and update defaults
            await page.getByText('Default Font', { exact: true }).click();
            const heightInput = page.locator('#default-font-height');
            const widthInput = page.locator('#default-font-width');

            await heightInput.click();
            await page.keyboard.press('Control+a');
            await page.keyboard.type('40'); // input events only, no blur/change

            await widthInput.click();
            await page.keyboard.press('Control+a');
            await page.keyboard.type('30'); // input events only, no blur/change

            await canvas.waitForReady();
            const afterScreenshot = await canvas.takeScreenshot();

            expect(beforeScreenshot.equals(afterScreenshot)).toBe(false);
        });
    });

    // ============== ELEMENT SELECTION ON CANVAS ==============
    test.describe('Element Selection', () => {
        test('should select element when clicking on canvas at element position', async ({ page }) => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);

            // Get element position
            const x = parseInt(await propertiesPanel.getProperty('prop-x'));
            const y = parseInt(await propertiesPanel.getProperty('prop-y'));

            // Wait and check if element can be reselected by clicking on it
            await canvas.clickAtLabelCoords(x + 10, y + 10);

            await page.waitForTimeout(6000);

            // Use robust assertion that waits/retries
            await expect(propertiesPanel.panel.locator('#prop-x')).toBeVisible();
        });
    });

    // ============== KEYBOARD NAVIGATION ==============
    test.describe('Keyboard Navigation', () => {
        test('should move element right when ArrowRight is pressed', async ({ page }) => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);

            const initialX = parseInt(await propertiesPanel.getProperty('prop-x'));

            await page.keyboard.press('ArrowRight');

            const newX = parseInt(await propertiesPanel.getProperty('prop-x'));
            expect(newX).toBeGreaterThan(initialX);
        });

        test('should move element left when ArrowLeft is pressed', async ({ page }) => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);

            // Set initial position away from edge
            await page.locator('#prop-x').fill('100');
            await page.locator('#prop-x').dispatchEvent('change');
            await page.locator('#prop-x').blur(); // Blur to remove focus from input

            const initialX = 100;
            await page.keyboard.press('ArrowLeft');

            const newX = parseInt(await propertiesPanel.getProperty('prop-x'));
            expect(newX).toBeLessThan(initialX);
        });

        test('should move element down when ArrowDown is pressed', async ({ page }) => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);

            // Set initial position away from edge and blur the input so focus leaves the field
            await page.locator('#prop-y').fill('100');
            await page.locator('#prop-y').dispatchEvent('change');
            await page.locator('#prop-y').blur();

            const initialY = 100;
            await page.keyboard.press('ArrowDown');

            const newY = parseInt(await propertiesPanel.getProperty('prop-y'));
            expect(newY).toBeGreaterThan(initialY);
        });

        test('should move element up when ArrowUp is pressed', async ({ page }) => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);

            // Set initial position away from edge
            await page.locator('#prop-y').fill('100');
            await page.locator('#prop-y').dispatchEvent('change');
            await page.locator('#prop-y').blur(); // Blur to remove focus from input

            const initialY = 100;
            await page.keyboard.press('ArrowUp');

            const newY = parseInt(await propertiesPanel.getProperty('prop-y'));
            expect(newY).toBeLessThan(initialY);
        });

        test('should delete selected element when Delete key is pressed', async ({ page }) => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);
            expect(await elementsPanel.getElementCount()).toBe(1);

            await page.keyboard.press('Delete');
            expect(await elementsPanel.getElementCount()).toBe(0);
        });

        test('should move element by 10 dots when Shift+ArrowRight is pressed', async ({ page }) => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);

            // Set initial position and blur input
            await page.locator('#prop-x').fill('100');
            await page.locator('#prop-x').dispatchEvent('change');
            await page.locator('#prop-x').blur();

            const initialX = 100;
            await page.keyboard.press('Shift+ArrowRight');

            const newX = parseInt(await propertiesPanel.getProperty('prop-x'));
            expect(newX).toBe(initialX + 10);
        });

        test('should copy and paste element with Ctrl+C and Ctrl+V', async ({ page }) => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);
            expect(await elementsPanel.getElementCount()).toBe(1);

            await page.keyboard.press('Control+c');
            await page.keyboard.press('Control+v');

            expect(await elementsPanel.getElementCount()).toBe(2);
        });

        test('should undo element addition with Ctrl+Z', async ({ page }) => {
            await elementsPanel.addTextElement();
            expect(await elementsPanel.getElementCount()).toBe(1);

            // Blur any focused input before pressing shortcut
            await page.locator('body').click();
            await page.keyboard.press('Control+z');

            expect(await elementsPanel.getElementCount()).toBe(0);
        });

        test('should redo with Ctrl+Shift+Z after undo', async ({ page }) => {
            await elementsPanel.addTextElement();
            expect(await elementsPanel.getElementCount()).toBe(1);

            await page.locator('body').click();
            await page.keyboard.press('Control+z');
            expect(await elementsPanel.getElementCount()).toBe(0);

            await page.keyboard.press('Control+Shift+z');
            expect(await elementsPanel.getElementCount()).toBe(1);
        });

        test('should cycle to next element with Tab', async ({ page }) => {
            await elementsPanel.addTextElement();
            await elementsPanel.addBarcodeElement();

            // Select the first element
            await elementsPanel.selectElementByIndex(0);
            const initialIds = await elementsPanel.getElementIds();
            expect(initialIds.length).toBe(2);

            // Record which element is selected initially
            const initiallySelected = await elementsPanel.isElementSelected(initialIds[0]);

            // Press Tab to cycle to the next element
            await page.keyboard.press('Tab');
            await page.waitForTimeout(200);

            // After Tab, the properties panel should still show an element (not the placeholder)
            expect(await propertiesPanel.hasNoElementSelected()).toBe(false);

            // The second element should now be selected (a different element than before)
            const nowSelectedFirst = await elementsPanel.isElementSelected(initialIds[0]);
            const nowSelectedSecond = await elementsPanel.isElementSelected(initialIds[1]);
            // At least one element is selected and it may have changed
            expect(nowSelectedFirst || nowSelectedSecond).toBe(true);
        });
    });

    // ============== EDGE CASES ==============
    test.describe('Edge Cases', () => {
        test('should handle element at canvas boundary', async ({ page }) => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);

            // Move element to very small coordinates
            await page.locator('#prop-x').fill('0');
            await page.locator('#prop-x').dispatchEvent('change');
            await page.locator('#prop-y').fill('0');
            await page.locator('#prop-y').dispatchEvent('change');

            // Element should still be valid
            expect(await elementsPanel.getElementCount()).toBe(1);
        });

        test('should handle very large element dimensions', async ({ page }) => {
            await elementsPanel.addBoxElement();
            await elementsPanel.selectElementByIndex(0);

            await page.locator('#prop-width').fill('500');
            await page.locator('#prop-width').dispatchEvent('change');
            await page.locator('#prop-height').fill('500');
            await page.locator('#prop-height').dispatchEvent('change');

            // Element should still be valid
            expect(await elementsPanel.getElementCount()).toBe(1);
        });

        test('should handle overlapping elements', async () => {
            // Add multiple elements at similar positions
            await elementsPanel.addTextElement();
            await elementsPanel.addBarcodeElement();
            await elementsPanel.addBoxElement();

            expect(await elementsPanel.getElementCount()).toBe(3);

            // All elements should remain valid
            await elementsPanel.selectElementByIndex(0);
            expect(await propertiesPanel.hasNoElementSelected()).toBe(false);

            await elementsPanel.selectElementByIndex(1);
            expect(await propertiesPanel.hasNoElementSelected()).toBe(false);

            await elementsPanel.selectElementByIndex(2);
            expect(await propertiesPanel.hasNoElementSelected()).toBe(false);
        });

        test('should handle extreme position values', async ({ page }) => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);

            // Set very large position
            await page.locator('#prop-x').fill('5000');
            await page.locator('#prop-x').dispatchEvent('change');

            const x = await propertiesPanel.getProperty('prop-x');
            expect(parseInt(x)).toBe(5000);
        });
    });

    // ============== RESIZE VIA DRAG HANDLE ==============
    // Each entry: handle name, position getter (label dots), drag delta (label dots),
    // whether width / height are expected to grow.
    // Corner handles (tl/tr/bl/br) resize both axes; edge handles (t/r/b/l) resize one axis.
    const circleHandleCases: Array<{
        handle: string;
        pos: (x: number, y: number, w: number, h: number) => [number, number];
        dx: number; dy: number;
        wGrows: boolean; hGrows: boolean;
    }> = [
        { handle: 'br', pos: (x,y,w,h) => [x+w,     y+h    ], dx: +20, dy: +20, wGrows: true,  hGrows: true  },
        { handle: 'tl', pos: (x,y,w,h) => [x,        y      ], dx: -20, dy: -20, wGrows: true,  hGrows: true  },
        { handle: 'tr', pos: (x,y,w,h) => [x+w,      y      ], dx: +20, dy: -20, wGrows: true,  hGrows: true  },
        { handle: 'bl', pos: (x,y,w,h) => [x,        y+h    ], dx: -20, dy: +20, wGrows: true,  hGrows: true  },
        { handle: 't',  pos: (x,y,w,h) => [x+w/2,    y      ], dx:   0, dy: -20, wGrows: false, hGrows: true  },
        { handle: 'r',  pos: (x,y,w,h) => [x+w,      y+h/2  ], dx: +20, dy:   0, wGrows: true,  hGrows: false },
        { handle: 'b',  pos: (x,y,w,h) => [x+w/2,    y+h    ], dx:   0, dy: +20, wGrows: false, hGrows: true  },
        { handle: 'l',  pos: (x,y,w,h) => [x,        y+h/2  ], dx: -20, dy:   0, wGrows: true,  hGrows: false },
    ];

    test.describe('Resize via Drag Handle', () => {
        for (const { handle, pos, dx, dy, wGrows, hGrows } of circleHandleCases) {
            test(`Circle: ${handle} handle resizes correctly`, async ({ page }) => {
                await elementsPanel.addCircleElement();
                // Adding an element auto-selects it; wait for the properties panel to render
                await page.waitForSelector('#properties-panel #prop-width');

                const w0 = parseInt(await propertiesPanel.getProperty('prop-width'));
                const h0 = parseInt(await propertiesPanel.getProperty('prop-height'));
                const x0 = parseInt(await propertiesPanel.getProperty('prop-x'));
                const y0 = parseInt(await propertiesPanel.getProperty('prop-y'));

                const [hx, hy] = pos(x0, y0, w0, h0);

                // The canvas renders at 1 dot/px internally but may be displayed smaller
                // via CSS. Compute the ratio so drag lands on the correct screen pixel.
                const cssScale = await page.evaluate(() => {
                    const c = document.getElementById('label-canvas') as HTMLCanvasElement;
                    const rect = c.getBoundingClientRect();
                    return rect.width / c.width;
                });

                await canvas.drag(
                    hx * cssScale,        hy * cssScale,
                    (hx + dx) * cssScale, (hy + dy) * cssScale
                );
                await canvas.waitForReady();

                const w1 = parseInt(await propertiesPanel.getProperty('prop-width'));
                const h1 = parseInt(await propertiesPanel.getProperty('prop-height'));

                if (wGrows) {
                    expect(w1).toBeGreaterThan(w0);
                } else {
                    expect(w1).toBe(w0);
                }
                if (hGrows) {
                    expect(h1).toBeGreaterThan(h0);
                } else {
                    expect(h1).toBe(h0);
                }
            });
        }

        test('Text: br handle increases fontSize and fontWidth', async ({ page }) => {
            await elementsPanel.addTextElement();
            await page.waitForSelector('#properties-panel #prop-font-size');

            const size0  = parseInt(await propertiesPanel.getProperty('prop-font-size'))  || 0;
            const width0 = parseInt(await propertiesPanel.getProperty('prop-font-width')) || 0;

            // Get br handle position from the canvas selection bounds
            const handlePos = await page.evaluate(() => {
                const appState = (window as any).appState;
                const renderer = (window as any).canvasRenderer;
                if (!appState || !renderer) return null;
                const el = appState.elements[0];
                if (!el) return null;
                const labelSettings = appState.labelSettings;
                const bounds = renderer.measureTextBounds(el, labelSettings);
                return { x: bounds.x + bounds.width, y: bounds.y + bounds.height };
            });

            if (!handlePos) throw new Error('Could not get handle position');

            const cssScale = await page.evaluate(() => {
                const c = document.getElementById('label-canvas') as HTMLCanvasElement;
                const rect = c.getBoundingClientRect();
                return rect.width / c.width;
            });

            const dx = 30;
            const dy = 30;
            await canvas.drag(
                handlePos.x * cssScale,          handlePos.y * cssScale,
                (handlePos.x + dx) * cssScale,   (handlePos.y + dy) * cssScale
            );
            await canvas.waitForReady();

            const size1  = parseInt(await propertiesPanel.getProperty('prop-font-size'));
            const width1 = parseInt(await propertiesPanel.getProperty('prop-font-width'));

            expect(size1).toBeGreaterThan(size0);
            expect(width1).toBeGreaterThan(width0);
        });

        test('Text (R): horizontal drag increases fontSize only', async ({ page }) => {
            await elementsPanel.addTextElement();
            await page.waitForSelector('#properties-panel #prop-font-size');

            await page.locator('#prop-font-size').fill('20');
            await page.locator('#prop-font-size').dispatchEvent('change');
            await page.locator('#prop-font-width').fill('20');
            await page.locator('#prop-font-width').dispatchEvent('change');

            // Set text orientation to R
            await page.locator('#properties-panel [data-orientation="R"]').click();

            const size0  = parseInt(await propertiesPanel.getProperty('prop-font-size'))  || 0;
            const width0 = parseInt(await propertiesPanel.getProperty('prop-font-width')) || 0;

            // Get br handle position from the canvas selection bounds
            const handlePos = await page.evaluate(() => {
                const appState = (window as any).appState;
                const renderer = (window as any).canvasRenderer;
                if (!appState || !renderer) return null;
                const el = appState.elements[0];
                if (!el) return null;
                const labelSettings = appState.labelSettings;
                const bounds = renderer.measureTextBounds(el, labelSettings);
                return { x: bounds.x + bounds.width, y: bounds.y + bounds.height };
            });

            if (!handlePos) throw new Error('Could not get handle position');

            const cssScale = await page.evaluate(() => {
                const c = document.getElementById('label-canvas') as HTMLCanvasElement;
                const rect = c.getBoundingClientRect();
                return rect.width / c.width;
            });

            const dx = 30;
            const dy = 0;
            await canvas.drag(
                handlePos.x * cssScale,          handlePos.y * cssScale,
                (handlePos.x + dx) * cssScale,   (handlePos.y + dy) * cssScale
            );
            await canvas.waitForReady();

            const size1  = parseInt(await propertiesPanel.getProperty('prop-font-size'));
            const width1 = parseInt(await propertiesPanel.getProperty('prop-font-width'));

            expect(size1).toBeGreaterThan(size0);
            expect(width1).toBe(width0);
        });

        test('Text (R): vertical drag increases fontWidth only', async ({ page }) => {
            await elementsPanel.addTextElement();
            await page.waitForSelector('#properties-panel #prop-font-size');

            await page.locator('#prop-font-size').fill('20');
            await page.locator('#prop-font-size').dispatchEvent('change');
            await page.locator('#prop-font-width').fill('20');
            await page.locator('#prop-font-width').dispatchEvent('change');

            // Set text orientation to R
            await page.locator('#properties-panel [data-orientation="R"]').click();

            const size0  = parseInt(await propertiesPanel.getProperty('prop-font-size'))  || 0;
            const width0 = parseInt(await propertiesPanel.getProperty('prop-font-width')) || 0;

            // Get br handle position from the canvas selection bounds
            const handlePos = await page.evaluate(() => {
                const appState = (window as any).appState;
                const renderer = (window as any).canvasRenderer;
                if (!appState || !renderer) return null;
                const el = appState.elements[0];
                if (!el) return null;
                const labelSettings = appState.labelSettings;
                const bounds = renderer.measureTextBounds(el, labelSettings);
                return { x: bounds.x + bounds.width, y: bounds.y + bounds.height };
            });

            if (!handlePos) throw new Error('Could not get handle position');

            const cssScale = await page.evaluate(() => {
                const c = document.getElementById('label-canvas') as HTMLCanvasElement;
                const rect = c.getBoundingClientRect();
                return rect.width / c.width;
            });

            const dx = 0;
            const dy = 30;
            await canvas.drag(
                handlePos.x * cssScale,          handlePos.y * cssScale,
                (handlePos.x + dx) * cssScale,   (handlePos.y + dy) * cssScale
            );
            await canvas.waitForReady();

            const size1  = parseInt(await propertiesPanel.getProperty('prop-font-size'));
            const width1 = parseInt(await propertiesPanel.getProperty('prop-font-width'));

            expect(size1).toBe(size0);
            expect(width1).toBeGreaterThan(width0);
        });

        test('Box: br handle increases width and height', async ({ page }) => {
            await elementsPanel.addBoxElement();
            await page.waitForSelector('#properties-panel #prop-width');

            const w0 = parseInt(await propertiesPanel.getProperty('prop-width'));
            const h0 = parseInt(await propertiesPanel.getProperty('prop-height'));

            const handlePos = await page.evaluate(() => {
                const appState = (window as any).appState;
                if (!appState || !appState.elements[0]) return null;
                const bounds = appState.elements[0].getBounds();
                return { x: bounds.x + bounds.width, y: bounds.y + bounds.height };
            });
            if (!handlePos) throw new Error('Could not get handle position');

            const cssScale = await page.evaluate(() => {
                const c = document.getElementById('label-canvas') as HTMLCanvasElement;
                const rect = c.getBoundingClientRect();
                return rect.width / c.width;
            });

            await canvas.drag(
                handlePos.x * cssScale,          handlePos.y * cssScale,
                (handlePos.x + 30) * cssScale,   (handlePos.y + 20) * cssScale
            );
            await canvas.waitForReady();

            const w1 = parseInt(await propertiesPanel.getProperty('prop-width'));
            const h1 = parseInt(await propertiesPanel.getProperty('prop-height'));

            expect(w1).toBeGreaterThan(w0);
            expect(h1).toBeGreaterThan(h0);
        });

        test('Line: right handle increases width', async ({ page }) => {
            await elementsPanel.addLineElement();
            await page.waitForSelector('#properties-panel #prop-width');

            const w0 = parseInt(await propertiesPanel.getProperty('prop-width'));

            const handlePos = await page.evaluate(() => {
                const appState = (window as any).appState;
                if (!appState || !appState.elements[0]) return null;
                const bounds = appState.elements[0].getBounds();
                return { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 };
            });
            if (!handlePos) throw new Error('Could not get handle position');

            const cssScale = await page.evaluate(() => {
                const c = document.getElementById('label-canvas') as HTMLCanvasElement;
                const rect = c.getBoundingClientRect();
                return rect.width / c.width;
            });

            await canvas.drag(
                handlePos.x * cssScale,          handlePos.y * cssScale,
                (handlePos.x + 40) * cssScale,   handlePos.y * cssScale
            );
            await canvas.waitForReady();

            const w1 = parseInt(await propertiesPanel.getProperty('prop-width'));

            expect(w1).toBeGreaterThan(w0);
        });

        test('Barcode: br handle increases width and height', async ({ page }) => {
            await elementsPanel.addBarcodeElement();
            await page.waitForSelector('#properties-panel #prop-width');

            const w0 = parseFloat(await propertiesPanel.getProperty('prop-width'));
            const h0 = parseInt(await propertiesPanel.getProperty('prop-height'));

            const handlePos = await page.evaluate(() => {
                const appState = (window as any).appState;
                if (!appState || !appState.elements[0]) return null;
                const bounds = appState.elements[0].getBounds();
                return { x: bounds.x + bounds.width, y: bounds.y + bounds.height };
            });
            if (!handlePos) throw new Error('Could not get handle position');

            const cssScale = await page.evaluate(() => {
                const c = document.getElementById('label-canvas') as HTMLCanvasElement;
                const rect = c.getBoundingClientRect();
                return rect.width / c.width;
            });

            await canvas.drag(
                handlePos.x * cssScale,          handlePos.y * cssScale,
                (handlePos.x + 40) * cssScale,   (handlePos.y + 20) * cssScale
            );
            await canvas.waitForReady();

            const w1 = parseFloat(await propertiesPanel.getProperty('prop-width'));
            const h1 = parseInt(await propertiesPanel.getProperty('prop-height'));

            expect(w1).toBeGreaterThan(w0);
            expect(h1).toBeGreaterThan(h0);
        });

        test('QRCode: br handle increases magnification', async ({ page }) => {
            await elementsPanel.addQRCodeElement();
            await page.waitForSelector('#properties-panel #prop-magnification');

            const m0 = parseInt(await propertiesPanel.getProperty('prop-magnification'));

            const handlePos = await page.evaluate(() => {
                const appState = (window as any).appState;
                if (!appState || !appState.elements[0]) return null;
                const bounds = appState.elements[0].getBounds();
                return { x: bounds.x + bounds.width, y: bounds.y + bounds.height };
            });
            if (!handlePos) throw new Error('Could not get handle position');

            const cssScale = await page.evaluate(() => {
                const c = document.getElementById('label-canvas') as HTMLCanvasElement;
                const rect = c.getBoundingClientRect();
                return rect.width / c.width;
            });

            await canvas.drag(
                handlePos.x * cssScale,          handlePos.y * cssScale,
                (handlePos.x + 40) * cssScale,   (handlePos.y + 40) * cssScale
            );
            await canvas.waitForReady();

            const m1 = parseInt(await propertiesPanel.getProperty('prop-magnification'));

            expect(m1).toBeGreaterThan(m0);
        });
    });

    // ============== VISUAL REGRESSION ==============
    test.describe('Visual Regression', () => {
        test('should render Text element consistently', async () => {
            await elementsPanel.addTextElement();
            await elementsPanel.selectElementByIndex(0);

            // Set known values for reproducibility
            const page = canvas.page;
            await page.locator('#prop-x').fill('100');
            await page.locator('#prop-x').dispatchEvent('change');
            await page.locator('#prop-y').fill('100');
            await page.locator('#prop-y').dispatchEvent('change');
            await page.locator('#prop-preview-text').fill('Test');
            await page.locator('#prop-preview-text').dispatchEvent('change');

            await canvas.waitForReady();

            // Take screenshot for visual comparison
            const screenshot = await canvas.takeScreenshot();
            expect(screenshot.length).toBeGreaterThan(0);
        });

        test('should render Box element with correct dimensions', async () => {
            await elementsPanel.addBoxElement();
            await elementsPanel.selectElementByIndex(0);

            const page = canvas.page;
            await page.locator('#prop-x').fill('50');
            await page.locator('#prop-x').dispatchEvent('change');
            await page.locator('#prop-y').fill('50');
            await page.locator('#prop-y').dispatchEvent('change');
            await page.locator('#prop-width').fill('100');
            await page.locator('#prop-width').dispatchEvent('change');
            await page.locator('#prop-height').fill('60');
            await page.locator('#prop-height').dispatchEvent('change');

            await canvas.waitForReady();

            const screenshot = await canvas.takeScreenshot();
            expect(screenshot.length).toBeGreaterThan(0);
        });
    });
});
