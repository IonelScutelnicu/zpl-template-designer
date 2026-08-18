import { test, expect } from '../fixtures';
import { Canvas, ElementsPanel, PropertiesPanel, ZPLOutput } from '../page-objects';

/**
 * Canvas rotation — the view-only quarter-turn of the preview stage.
 *
 * The whole point of the feature is that it changes nothing but the view, so
 * these tests split into two halves: the mapping half (does input follow what
 * you see?) and the invariant half (is the document provably untouched?).
 */
test.describe('Canvas rotation', () => {
    let canvas: Canvas;
    let elementsPanel: ElementsPanel;
    let propertiesPanel: PropertiesPanel;
    let zplOutput: ZPLOutput;

    /** One click advances a quarter-turn. */
    const rotateOnce = async (page) => {
        await page.locator('#rotate-view-btn').click();
        await page.waitForTimeout(100);
    };

    /** Drive the view to an absolute angle. Rotation is module-global state. */
    const setRotation = async (page, target: number) => {
        for (let i = 0; i < 4 && (await canvas.getViewRotation()) !== target; i++) {
            await rotateOnce(page);
        }
        expect(await canvas.getViewRotation()).toBe(target);
    };

    const stageMatrix = (page) =>
        page.locator('#preview-stage').evaluate((el) => getComputedStyle(el).transform);

    const viewportBox = (page) =>
        page.locator('#preview-viewport').evaluate((el) => [
            Math.round(parseFloat(getComputedStyle(el).width)),
            Math.round(parseFloat(getComputedStyle(el).height)),
        ]);

    /**
     * Pick an explicit zoom from the presets menu. Ctrl+1 is deliberately not
     * used: when Fit already resolved to 100%, setZoomAt returns early without
     * clearing the sticky Fit, so the view would still re-fit on rotation.
     */
    const setExplicitZoom = async (page, preset: string) => {
        await page.locator('#zoom-level-btn').click();
        await page.locator(`.zoom-preset[data-zoom="${preset}"]`).click();
        await page.waitForTimeout(200);
    };

    /** Set the label to a tall portrait shape — the case this feature is for. */
    const useTallLabel = async (page) => {
        await page.locator('#label-width').fill('40');
        await page.locator('#label-width').dispatchEvent('input');
        await page.locator('#label-height').fill('100');
        await page.locator('#label-height').dispatchEvent('input');
        await page.waitForTimeout(200);
    };

    test.beforeEach(async ({ page }) => {
        await page.goto('/?e2e=1');
        canvas = new Canvas(page);
        elementsPanel = new ElementsPanel(page);
        propertiesPanel = new PropertiesPanel(page);
        zplOutput = new ZPLOutput(page);
        await canvas.waitForReady();
        // Defensive: rotation is module-global on app.js, like fullscreen.
        await setRotation(page, 0);
    });

    test.describe('Controls', () => {
        test('clicking the button steps through all four angles and wraps', async ({ page }) => {
            for (const expected of [90, 180, 270, 0]) {
                await rotateOnce(page);
                expect(await canvas.getViewRotation()).toBe(expected);
            }
        });

        test('the zoom menu offers Fit / 50 / 100 / 200', async ({ page }) => {
            await page.locator('#zoom-level-btn').click();
            await expect(page.locator('.zoom-preset')).toHaveCount(4);
            const presets = await page.locator('.zoom-preset')
                .evaluateAll((els) => els.map((el) => el.getAttribute('data-zoom')));
            expect(presets).toEqual(['fit', '0.5', '1', '2']);
        });

        test('the stage carries exactly the four rotation matrices', async ({ page }) => {
            // A CSS matrix is unambiguous, unlike a serialized rotate() string.
            const expected: Record<number, RegExp> = {
                0: /^matrix\(1, 0, 0, 1, /,
                90: /^matrix\(0, 1, -1, 0, /,
                180: /^matrix\(-1, 0, 0, -1, /,
                270: /^matrix\(0, -1, 1, 0, /,
            };
            for (const angle of [0, 90, 180, 270]) {
                await setRotation(page, angle);
                expect(await stageMatrix(page)).toMatch(expected[angle]);
            }
        });

        test('the button shows the angle only while rotated', async ({ page }) => {
            const label = page.locator('#view-rotation-label');
            const button = page.locator('#rotate-view-btn');

            // Upright: icon only, so the bar stays at its shortest.
            await expect(label).toBeHidden();
            await expect(button).not.toHaveClass(/text-blue-600/);
            await expect(button).toHaveAttribute('aria-label', 'Canvas rotation: 0 degrees');

            await setRotation(page, 90);
            await expect(label).toBeVisible();
            await expect(label).toHaveText('90°');
            await expect(button).toHaveClass(/text-blue-600/);
            await expect(button).toHaveAttribute('aria-label', 'Canvas rotation: 90 degrees');

            await setRotation(page, 0);
            await expect(label).toBeHidden();
        });

        test('the collapsed bar is shorter than the old three-control segment', async ({ page }) => {
            // Guards the reason for collapsing: the pill overlaps the canvas
            // bottom-right, so every pixel of width costs clickable label.
            const width = await page.locator('#zoom-controls')
                .evaluate((el) => el.getBoundingClientRect().width);
            expect(width).toBeLessThan(200);
        });
    });

    test.describe('Viewport geometry', () => {
        test('the viewport box transposes at 90 and 270 only', async ({ page }) => {
            await useTallLabel(page);
            const upright = await viewportBox(page);
            expect(upright[1]).toBeGreaterThan(upright[0]); // portrait to start

            await setRotation(page, 90);
            const quarter = await viewportBox(page);
            expect(quarter[0]).toBeGreaterThan(quarter[1]); // now landscape

            await setRotation(page, 180);
            const half = await viewportBox(page);
            expect(half[1]).toBeGreaterThan(half[0]); // portrait again
        });

        test('Fit keeps the rotated label inside the container at every angle', async ({ page }) => {
            await useTallLabel(page);
            for (const angle of [0, 90, 180, 270]) {
                await setRotation(page, angle);
                await page.keyboard.press('Control+0');
                await page.waitForTimeout(150);
                const fits = await page.evaluate(() => {
                    const vp = document.getElementById('preview-viewport').getBoundingClientRect();
                    const pc = document.getElementById('preview-container').getBoundingClientRect();
                    return {
                        insideX: vp.left >= pc.left - 1 && vp.right <= pc.right + 1,
                        insideY: vp.top >= pc.top - 1 && vp.bottom <= pc.bottom + 1,
                        centeredX: Math.abs(vp.left + vp.width / 2 - (pc.left + pc.width / 2)) < 2,
                        centeredY: Math.abs(vp.top + vp.height / 2 - (pc.top + pc.height / 2)) < 2,
                    };
                });
                expect(fits, `angle ${angle}`).toEqual({
                    insideX: true, insideY: true, centeredX: true, centeredY: true,
                });
            }
        });

        test('an explicit zoom survives a rotation', async ({ page }) => {
            await setExplicitZoom(page, '2');
            const before = await canvas.getScale();
            expect(before).toBeCloseTo(2, 2);

            await rotateOnce(page);
            expect(await canvas.getScale()).toBeCloseTo(before, 2);
            await expect(page.locator('#zoom-level-label')).toHaveText('200%');
        });
    });

    test.describe('Preview modes', () => {
        test('rotation is shared by Edit, Overlay and Preview and survives switching', async ({ page }) => {
            await setRotation(page, 90);
            const editMatrix = await stageMatrix(page);

            await page.locator('#mode-overlay-btn').click();
            await page.waitForTimeout(250);
            expect(await canvas.getViewRotation()).toBe(90);
            expect(await stageMatrix(page)).toBe(editMatrix);

            await page.locator('#mode-api-btn').click();
            await page.waitForTimeout(250);
            expect(await canvas.getViewRotation()).toBe(90);
            expect(await stageMatrix(page)).toBe(editMatrix);

            await page.locator('#mode-canvas-btn').click();
            await page.waitForTimeout(250);
            expect(await canvas.getViewRotation()).toBe(90);
            expect(await stageMatrix(page)).toBe(editMatrix);
        });

        test('the Labelary image and canvas share one stage, so they cannot drift', async ({ page }) => {
            await setRotation(page, 90);
            const sameStage = await page.evaluate(() => {
                const stage = document.getElementById('preview-stage');
                return ['label-canvas', 'preview-image', 'preview-backing']
                    .every((id) => stage.contains(document.getElementById(id)));
            });
            expect(sameStage).toBe(true);
            // The dot-grid/placeholder layer must stay upright, outside the stage.
            const apiOutside = await page.evaluate(() =>
                !document.getElementById('preview-stage')
                    .contains(document.getElementById('api-preview-container')));
            expect(apiOutside).toBe(true);
        });
    });

    test.describe('Pointer input', () => {
        test('clicking an element selects it at every angle', async ({ page }) => {
            await elementsPanel.addBoxElement();
            await page.waitForTimeout(200);
            const box = await page.evaluate(() => {
                const el = window.appState.elements[0];
                el.x = 40; el.y = 60; el.width = 120; el.height = 80;
                return { x: el.x, y: el.y, w: el.width, h: el.height };
            });

            for (const angle of [0, 90, 180, 270]) {
                await setRotation(page, angle);
                await canvas.clickAtLabelCoords(box.x + box.w / 2, box.y + box.h / 2);
                await page.waitForTimeout(120);
                expect(await canvas.getSelectionCount(), `angle ${angle}`).toBe(1);
                // Clicking clear space deselects, proving the mapping both ways.
                await canvas.clickAtLabelCoords(box.x + box.w + 40, box.y + box.h + 40);
                await page.waitForTimeout(120);
                expect(await canvas.getSelectionCount(), `angle ${angle} (empty)`).toBe(0);
            }
        });

        test('dragging moves an element by the dragged label delta at every angle', async ({ page }) => {
            await elementsPanel.addBoxElement();
            await page.waitForTimeout(200);

            for (const angle of [0, 90, 180, 270]) {
                await setRotation(page, angle);
                await page.evaluate(() => {
                    const el = window.appState.elements[0];
                    el.x = 60; el.y = 80; el.width = 100; el.height = 60;
                });
                await canvas.clickAtLabelCoords(110, 110);
                await page.waitForTimeout(120);
                // Drag the centre 40 dots right and 30 down in *label* space.
                await canvas.dragLabelCoords(110, 110, 150, 140);
                await page.waitForTimeout(150);
                const moved = await page.evaluate(() => {
                    const el = window.appState.elements[0];
                    return { x: el.x, y: el.y };
                });
                expect(Math.abs(moved.x - 100), `angle ${angle} dx`).toBeLessThanOrEqual(3);
                expect(Math.abs(moved.y - 110), `angle ${angle} dy`).toBeLessThanOrEqual(3);
            }
        });

        test('marquee selection still catches elements at every angle', async ({ page }) => {
            await elementsPanel.addBoxElement();
            await page.waitForTimeout(200);
            await page.evaluate(() => {
                const el = window.appState.elements[0];
                el.x = 320; el.y = 160; el.width = 100; el.height = 60;
            });

            for (const angle of [0, 90, 180, 270]) {
                await setRotation(page, angle);
                await page.evaluate(() => window.appState.clearSelection());
                await page.waitForTimeout(100);
                // Central band: stays clear of the floating zoom pill, whichever
                // label corner the rotation brings to the bottom-right.
                await canvas.marqueeDrag(280, 120, 460, 260);
                await page.waitForTimeout(150);
                expect(await canvas.getSelectionCount(), `angle ${angle}`).toBe(1);
            }
        });
    });

    test.describe('Keyboard and cursors', () => {
        test('arrow keys move the element in the direction pressed on screen', async ({ page }) => {
            await elementsPanel.addBoxElement();
            await page.waitForTimeout(200);

            // Screen-right / screen-down expressed as label deltas per angle.
            const expected: Record<number, { right: number[]; down: number[] }> = {
                0: { right: [1, 0], down: [0, 1] },
                90: { right: [0, -1], down: [1, 0] },
                180: { right: [-1, 0], down: [0, -1] },
                270: { right: [0, 1], down: [-1, 0] },
            };

            for (const angle of [0, 90, 180, 270]) {
                await setRotation(page, angle);
                await canvas.clickAtLabelCoords(700, 350); // empty spot, deselects
                await page.evaluate(() => {
                    const el = window.appState.elements[0];
                    el.x = 150; el.y = 200; el.width = 100; el.height = 60;
                    window.appState.setSelectedElement(el.id);
                });
                await page.waitForTimeout(150);

                for (const [key, want] of [
                    ['ArrowRight', expected[angle].right],
                    ['ArrowDown', expected[angle].down],
                ] as Array<[string, number[]]>) {
                    const before = await page.evaluate(() => {
                        const el = window.appState.elements[0];
                        return { x: el.x, y: el.y };
                    });
                    await page.locator('body').press(key);
                    await page.waitForTimeout(120);
                    const after = await page.evaluate(() => {
                        const el = window.appState.elements[0];
                        return { x: el.x, y: el.y };
                    });
                    expect([after.x - before.x, after.y - before.y], `${key} at ${angle}`).toEqual(want);
                }
            }
        });

        test('resize cursors follow the handle position on screen', async ({ page }) => {
            await elementsPanel.addBoxElement();
            await page.waitForTimeout(200);
            // 'br' appears bottom-right at 0/180 (nwse) and flips to the other
            // diagonal at 90/270, where it sits bottom-left / top-right.
            const expected: Record<number, string> = {
                0: 'nwse-resize', 90: 'nesw-resize', 180: 'nwse-resize', 270: 'nesw-resize',
            };
            for (const angle of [0, 90, 180, 270]) {
                await setRotation(page, angle);
                const cursor = await page.evaluate(() =>
                    window.interactionHandler.getCursorForHandle('br'));
                expect(cursor, `angle ${angle}`).toBe(expected[angle]);
            }
        });
    });

    test.describe('Screen-relative alignment', () => {
        test('centring horizontally centres on the axis that looks horizontal', async ({ page }) => {
            await useTallLabel(page);
            await elementsPanel.addBoxElement();
            await page.waitForTimeout(300);
            await canvas.clickAtLabelCoords(30, 30);
            await page.waitForTimeout(200);

            for (const angle of [0, 90, 180, 270]) {
                await setRotation(page, angle);
                await page.evaluate(() => {
                    const el = window.appState.elements[0];
                    el.x = 10; el.y = 10; el.width = 60; el.height = 30;
                    window.appState.setSelectedElement(el.id);
                });
                await page.waitForTimeout(200);
                await page.locator('#prop-center-x').click();
                await page.waitForTimeout(200);

                const result = await page.evaluate(() => {
                    const el = window.appState.elements[0];
                    const r = window.canvasRenderer;
                    return {
                        onLabelX: Math.abs(el.x - (r.labelWidthDots - el.width) / 2) < 2,
                        onLabelY: Math.abs(el.y - (r.labelHeightDots - el.height) / 2) < 2,
                    };
                });
                // Quarter-turns put the label's y axis across the screen.
                const swapped = angle === 90 || angle === 270;
                expect(result, `angle ${angle}`).toEqual({
                    onLabelX: !swapped, onLabelY: swapped,
                });
            }
        });
    });

    test.describe('Document invariants', () => {
        test('rotating changes neither the ZPL nor the history nor the state', async ({ page }) => {
            await elementsPanel.addBoxElement();
            await elementsPanel.addTextElement();
            await page.waitForTimeout(400);

            const zplBefore = await zplOutput.getZPLCode();
            const historyBefore = await canvas.getHistoryCount();
            const stateBefore = await page.evaluate(() => JSON.stringify(window.appState.serialize()));

            for (const angle of [90, 180, 270, 0]) await setRotation(page, angle);
            await setRotation(page, 90);

            expect(await zplOutput.getZPLCode()).toBe(zplBefore);
            expect(await canvas.getHistoryCount()).toBe(historyBefore);
            expect(await page.evaluate(() => JSON.stringify(window.appState.serialize()))).toBe(stateBefore);
        });

        test('rotation never reaches labelSettings, so it cannot be serialized', async ({ page }) => {
            await setRotation(page, 90);
            const leaked = await page.evaluate(() => {
                const ls = window.appState.labelSettings;
                const serialized = JSON.stringify(window.appState.serialize());
                return {
                    rotationKeys: Object.keys(ls).filter((k) => /rotat/i.test(k)),
                    inSerialized: /viewRotation/.test(serialized),
                };
            });
            expect(leaked).toEqual({ rotationKeys: [], inSerialized: false });
        });

        test('the canvas bitmap is byte-identical at every angle', async ({ page }) => {
            await elementsPanel.addBoxElement();
            await page.waitForTimeout(300);
            // Pin an explicit zoom so Fit cannot resize the bitmap between angles.
            await setExplicitZoom(page, '2');

            const shots: string[] = [];
            for (const angle of [0, 90, 180, 270]) {
                await setRotation(page, angle);
                shots.push(await page.locator('#label-canvas')
                    .evaluate((el) => (el as HTMLCanvasElement).toDataURL()));
            }
            // Proof the rotation is presentational only: no bitmap change means
            // reverse-print getImageData and the visual baselines are safe.
            expect(shots[1]).toBe(shots[0]);
            expect(shots[2]).toBe(shots[0]);
            expect(shots[3]).toBe(shots[0]);
        });
    });

    test.describe('Reset', () => {
        test('starting a new template resets the view upright', async ({ page }) => {
            await setRotation(page, 180);
            expect(await canvas.getViewRotation()).toBe(180);

            // importTemplate() is the single funnel for every load path
            // (gallery, share URL, file/ZPL import, Drive, embed, New), so the
            // reset it performs covers them all. With an empty canvas New skips
            // its confirmation dialog and goes straight through.
            await page.locator('#zpl-more-btn').click();
            await page.locator('#new-template-btn').click();
            await page.waitForTimeout(400);
            const dlg = page.locator('#confirm-modal');
            if (await dlg.evaluate((d: HTMLDialogElement) => d.open).catch(() => false)) {
                await dlg.evaluate((d: HTMLDialogElement) => d.close('ok'));
                await page.waitForTimeout(400);
            }

            expect(await canvas.getViewRotation()).toBe(0);
            await expect(page.locator('#view-rotation-label')).toBeHidden();
        });

        test('a reload starts upright', async ({ page }) => {
            await setRotation(page, 270);
            await page.reload();
            await canvas.waitForReady();
            expect(await canvas.getViewRotation()).toBe(0);
            await expect(page.locator('#view-rotation-label')).toBeHidden();
        });
    });
});
