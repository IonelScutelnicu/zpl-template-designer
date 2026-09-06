import { test, expect } from '../fixtures';
import { Canvas, ZPLOutput } from '../page-objects';
import { PNG } from 'pngjs';
import { writeFile } from 'node:fs/promises';

const SAMPLE = '^XA^LS200^FO135,24^GB125,115,3,B^FS^FO158,42^GC80,3,B^FS^XZ';

async function roundTrip(page: any, source: string) {
    return page.evaluate(async (zpl: string) => {
        const { ZPLParser } = await import('/src/services/ZPLParser.js');
        const { ZPLGenerator } = await import('/src/services/ZPLGenerator.js');
        const { SerializationService } = await import('/src/services/SerializationService.js');
        const parser = new ZPLParser();
        const first = parser.parse(zpl);
        const elements = first.elements.map((e: any) => new SerializationService().createElementFromData(e));
        const generator = new ZPLGenerator();
        const exported = generator.generateZPL(elements, first.labelSettings);
        const preview = generator.generatePreviewZPL(elements, first.labelSettings);
        const mapped = generator.generatePreviewZPLWithMap(elements, first.labelSettings);
        const second = parser.parse(exported);
        return { first, second, exported, preview, mapped };
    }, source);
}

test.describe('Label Shift import and editing', () => {
    test.beforeEach(async ({ page }) => { await page.goto('/'); });

    for (const shift of [0, 200, -200, 9999, -9999]) {
        test(`round-trips ${shift} without changing field coordinates`, async ({ page }) => {
            const r = await roundTrip(page, SAMPLE.replace('LS200', `LS${shift > 0 ? '+' : ''}${shift}`));
            expect(r.first.labelSettings.labelShift).toBe(shift);
            expect(r.second.labelSettings.labelShift).toBe(shift);
            expect(r.first.elements.map((e: any) => [e.x, e.y])).toEqual([[135, 24], [158, 42]]);
            expect(r.second.elements.map((e: any) => [e.x, e.y])).toEqual([[135, 24], [158, 42]]);
            expect(r.first.warnings).toEqual([]);
            for (const zpl of [r.exported, r.preview, r.mapped.zpl]) {
                expect(zpl).toContain(`^LS${shift}\n`);
                expect(zpl.indexOf('^LS')).toBeLessThan(zpl.indexOf('^FS'));
                expect(zpl.match(/\^LS/g)).toHaveLength(1);
            }
            expect(r.mapped.byteMap).toHaveLength(2);
            expect(r.first.elements.flatMap((e: any) => Object.keys(e).filter(k => k.startsWith('_field') || k.startsWith('_raw')))).toEqual([]);
        });
    }

    for (const [commands, expected] of [
        ['', 0], ['^LS40^LS', 40], ['^LS40^LSabc', 40], ['^LS40^LS0', 0],
        ['^LS10000', 9999], ['^LS-10000', -9999],
    ] as const) {
        test(`handles default/invalid parameters: ${commands || 'absent'}`, async ({ page }) => {
            const r = await roundTrip(page, `^XA${commands}^FO100,20^GB30,30,2^FS^XZ`);
            expect(r.first.labelSettings.labelShift).toBe(expected);
            expect(r.first.warnings.some((w: any) => w.message.includes('clamped'))).toBe(commands.includes('10000'));
        });
    }

    test('normalizes sequential shifts and ignores a trailing unused shift', async ({ page }) => {
        const r = await roundTrip(page, '^XA^LS20^FO100,10^GB20,20,2^FS^LS60^FO100,60^GB20,20,2^FS^LS90^XZ');
        expect(r.first.labelSettings.labelShift).toBe(60);
        expect(r.first.elements.map((e: any) => e.x)).toEqual([140, 100]);
        expect(r.first.warnings).toEqual([expect.objectContaining({ command: '^LS', message: expect.stringContaining('folded') })]);
        expect(r.second.elements.map((e: any) => e.x)).toEqual([140, 100]);
        expect(r.second.labelSettings.labelShift).toBe(60);
    });

    test('applies commands inside a field and closes implicit fields', async ({ page }) => {
        const r = await roundTrip(page, '^XA^FO100,10^GB20,20,2^LS60^FO100,60^GB20,20,2^XZ');
        expect(r.first.labelSettings.labelShift).toBe(60);
        expect(r.first.elements.map((e: any) => e.x)).toEqual([100, 100]);
        expect(r.first.warnings).toEqual([]);
    });

    test('warns about raw fields under a different shift and restores raw changes', async ({ page }) => {
        const r = await roundTrip(page, '^XA^LS20^FO100,10^ZZ^FS^LS60^FO100,60^GB20,20,2^FS^XZ');
        expect(r.first.warnings).toContainEqual(expect.objectContaining({ command: '^LS', message: expect.stringContaining('raw ZPL') }));
        const changed = await roundTrip(page, '^XA^FO100,10^ZZ^LS20^FS^LS60^FO100,60^GB20,20,2^FS^XZ');
        for (const zpl of [changed.exported, changed.preview, changed.mapped.zpl]) {
            expect(zpl).toContain('^LS20^FS^LS60');
        }
        expect(changed.second.elements.filter((e: any) => e.type !== 'RAW').map((e: any) => e.x)).toEqual([100]);
    });

    test('UI updates output, clamps bounds, and supports undo/redo', async ({ page }, testInfo) => {
        await new ZPLOutput(page).openZplFromContent(SAMPLE);
        await page.locator('details[data-fs-tab="offsets"] summary').click();
        const input = page.locator('#label-shift');
        await expect(input).toHaveValue('200');
        await testInfo.attach('offset-settings', {
            body: await page.locator('details[data-fs-tab="offsets"]').screenshot({ path: testInfo.outputPath('offset-panel.png') }), contentType: 'image/png',
        });
        await expect(input).toHaveAttribute('min', '-9999');
        await expect(input).toHaveAttribute('max', '9999');
        await input.fill('-200');
        await expect.poll(() => page.evaluate(() => (window as any).appState.labelSettings.labelShift)).toBe(-200);
        expect(await new ZPLOutput(page).getZPLCode()).toContain('^LS-200');
        await input.blur();
        await page.waitForTimeout(650);
        await page.keyboard.press('Control+z');
        await expect(input).toHaveValue('200');
        await page.keyboard.press('Control+Shift+z');
        await expect(input).toHaveValue('-200');
        await input.fill('12000');
        await expect(input).toHaveValue('9999');
    });

    test('template serialization preserves shifts; older imports reset to zero', async ({ page }) => {
        await new ZPLOutput(page).openZplFromContent(SAMPLE);
        const saved = await page.evaluate(() => (window as any).appState.serialize());
        expect(saved.labelSettings.labelShift).toBe(200);
        const restored = await page.evaluate(async (data) => {
            const { AppState } = await import('/src/state/AppState.js');
            const { SerializationService } = await import('/src/services/SerializationService.js');
            const state = new AppState();
            state.restore(data, (el: any) => new SerializationService().createElementFromData(el));
            return state.serialize().labelSettings.labelShift;
        }, saved);
        expect(restored).toBe(200);
        delete saved.labelSettings.labelShift;
        await new ZPLOutput(page).importTemplateFromJSON(JSON.stringify(saved));
        await expect.poll(() => page.evaluate(() => (window as any).appState.labelSettings.labelShift)).toBe(0);
    });

    test('selects, drags, nudges and resizes a pinned box where it is drawn', async ({ page }) => {
        const canvas = new Canvas(page);
        await new ZPLOutput(page).openZplFromContent('^XA^LS200^FO135,80^GB125,115,3^FS^XZ');
        await canvas.deselect();
        await canvas.clickAtLabelCoords(50, 110);
        expect(await canvas.getSelectionCount()).toBe(1);
        await page.keyboard.press('ArrowRight');
        expect((await canvas.getElementGeometry(0)).x).toBe(201);
        await page.keyboard.press('ArrowLeft');
        await page.keyboard.press('ArrowLeft');
        expect((await canvas.getElementGeometry(0)).x).toBe(200);
        await canvas.dragLabelCoords(50, 110, 80, 110);
        expect((await canvas.getElementGeometry(0)).x).toBe(230);
        await canvas.dragLabelCoords(30, 140, 50, 140);
        const resized = await canvas.getElementGeometry(0);
        expect(resized.x).toBe(250);
        expect(resized.width).toBe(105);
    });

    test('pin-aware marquee, anchor floors, and guides agree with rendering', async ({ page }) => {
        await new ZPLOutput(page).openZplFromContent('^XA^LS200^FO135,80^GB125,115,3^FS^FO250,240^GB40,40,2^FS^XZ');
        const r = await page.evaluate(async () => {
            const w = window as any;
            const { SmartGuideService } = await import('/src/services/SmartGuideService.js');
            const ih = w.interactionHandler;
            const [pinned, other] = w.appState.elements;
            const marquee = ih.getElementsInRect({ x: 210, y: 90, width: 30, height: 30 });
            const guide = new SmartGuideService().detectGuides(other, 322, 240, [pinned, other], w.appState.labelSettings, w.canvasRenderer);
            return { ids: marquee.map((e: any) => e.id), pinned: pinned.id, snapX: guide.snapX, guides: guide.guides };
        });
        expect(r.ids).toEqual([r.pinned]);
        expect(r.snapX).toBe(325);
        expect(r.guides).toContainEqual({ axis: 'x', position: 325, type: 'element-edge' });
    });

    for (const transform of ['^PMY', '^POI']) {
        test(`selects and nudges pinned fields with ${transform}`, async ({ page }) => {
            await new ZPLOutput(page).openZplFromContent(`^XA${transform}^LS200^FO135,80^GB125,115,3^FS^XZ`);
            const canvas = new Canvas(page);
            await canvas.deselect();
            const pos = await page.evaluate((command) => {
                const r = (window as any).canvasRenderer;
                return { x: r.labelWidthDots - 50, y: command === '^POI' ? r.labelHeightDots - 110 : 110 };
            }, transform);
            await canvas.clickAtLabelCoords(pos.x, pos.y);
            expect(await canvas.getSelectionCount()).toBe(1);
            await page.keyboard.press('ArrowLeft');
            expect((await canvas.getElementGeometry(0)).x).toBe(201);
        });
    }

    test('dragging directly from a pinned position moves immediately and supports undo', async ({ page }) => {
        await new ZPLOutput(page).openZplFromContent('^XA^LS200^FO135,80^GB125,115,3^FS^XZ');
        const canvas = new Canvas(page);
        await canvas.deselect();
        await canvas.dragLabelCoords(50, 110, 80, 110);
        expect((await canvas.getElementGeometry(0)).x).toBe(230);
        await page.keyboard.press('Control+z');
        await expect.poll(async () => (await canvas.getElementGeometry(0)).x).toBe(135);
    });
});

function inkBounds(buffer: Buffer, top = 0, bottom = Infinity) {
    const png = PNG.sync.read(buffer);
    let left = png.width, right = -1, first = png.height, last = -1;
    for (let y = top; y < Math.min(png.height, bottom); y++) {
        for (let x = 0; x < png.width; x++) {
            const i = (y * png.width + x) * 4;
            if (png.data[i + 3] > 127 && png.data[i] < 128 && png.data[i + 1] < 128 && png.data[i + 2] < 128) {
                left = Math.min(left, x); right = Math.max(right, x);
                first = Math.min(first, y); last = Math.max(last, y);
            }
        }
    }
    return right < 0 ? null : { left, right, top: first, bottom: last };
}

test.describe('Label Shift Labelary parity', () => {
    test.describe.configure({ mode: 'default' });
    const cases = [
        { name: 'supplied sample', zpl: SAMPLE },
        { name: 'sample zero', zpl: SAMPLE.replace('LS200', 'LS0') },
        { name: 'sample negative', zpl: SAMPLE.replace('LS200', 'LS-200') },
        { name: 'pinned circle alone', zpl: '^XA^LS200^FO158,42^GC80,3,B^FS^XZ' },
        { name: 'home and mixed pinning', zpl: '^XA^LH50,20^LT10^LS200^FO135,10^GB20,20,2^FS^FO200,60^GB20,20,2^FS^XZ', bands: [[0, 70], [70, 140]] },
        { name: 'sequential shifts', zpl: '^XA^LS20^FO100,10^GB20,20,2^FS^LS60^FO100,60^GB20,20,2^FS^XZ', bands: [[0, 40], [40, 100]] },
        { name: 'sequential homes and shifts', zpl: '^XA^LH40,0^LS20^FO100,10^GB20,20,2^FS^LH10,0^LS200^FO100,60^GB20,20,2^FS^XZ', bands: [[0, 40], [40, 100]] },
        { name: 'print width centering after pinning', zpl: '^XA^FX{"labelMeta":{"w":101.6,"h":50.8,"dpmm":8}}\n^PW600^LS200^FO135,24^GB125,115,3^FS^XZ' },
        { name: 'right justification clipping', zpl: '^XA^LS80^FO100,60,1^AAN,18,10^FDABCDEFGH^FS^XZ' },
        { name: 'right justification pinned', zpl: '^XA^LS120^FO100,60,1^AAN,18,10^FDABCDEFGH^FS^XZ' },
        { name: 'rotated FT clipping', zpl: '^XA^LS80^FT100,160^AAB,18,10^FDABCDEFGH^FS^XZ' },
        { name: 'rotated FT pinned', zpl: '^XA^LS120^FT100,160^AAB,18,10^FDABCDEFGH^FS^XZ' },
        { name: 'mirror', zpl: SAMPLE.replace('^LS200', '^PMY^LS200') },
        { name: 'inverted', zpl: SAMPLE.replace('^LS200', '^POI^LS200') },
    ];
    for (const c of cases) {
        test(c.name, async ({ page }, testInfo) => {
            await page.goto('/');
            const images = await page.evaluate(async (source) => {
                const { ZPLParser } = await import('/src/services/ZPLParser.js');
                const { ZPLGenerator } = await import('/src/services/ZPLGenerator.js');
                const { SerializationService } = await import('/src/services/SerializationService.js');
                const { CanvasRenderer } = await import('/src/canvas-renderer.js');
                const { ensureFontLoaded } = await import('/src/utils/fontLoader.js');
                await ensureFontLoaded('A');
                const parsed = new ZPLParser().parse(source);
                const settings = { ...parsed.labelSettings, width: 101.6, height: 50.8, dpmm: 8 };
                const elements = parsed.elements.map((e: any) => new SerializationService().createElementFromData(e, { labelFontId: settings.fontId }));
                const canvas = document.createElement('canvas');
                const renderer = new CanvasRenderer(canvas);
                renderer.setTransparentBackground(true);
                renderer.renderCanvas(elements, settings);
                const ctx = canvas.getContext('2d')!;
                ctx.save();
                ctx.globalCompositeOperation = 'destination-over';
                ctx.fillStyle = '#fff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.restore();
                const exported = new ZPLGenerator().generateZPL(elements, settings);
                const render = async (zpl: string) => {
                    for (let attempt = 0; attempt < 3; attempt++) {
                        const response = await fetch('https://api.labelary.com/v1/printers/8dpmm/labels/4x2/0/', {
                            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'image/png' }, body: zpl,
                        });
                        if (response.status === 429) { await new Promise(r => setTimeout(r, 1500)); continue; }
                        if (!response.ok) throw new Error(`Labelary ${response.status}: ${await response.text()}`);
                        const blob = await response.blob();
                        return await new Promise<string>(resolve => {
                            const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(blob);
                        });
                    }
                    throw new Error('Labelary rate limit');
                };
                return { canvas: canvas.toDataURL(), original: await render(source), exported: await render(exported), zpl: exported };
            }, c.zpl);
            const decode = (url: string) => Buffer.from(url.split(',')[1], 'base64');
            const original = decode(images.original), exported = decode(images.exported), canvas = decode(images.canvas);
            for (const [name, buffer] of [['original-labelary', original], ['exported-labelary', exported], ['canvas', canvas]] as const) {
                const path = testInfo.outputPath(`${name}.png`);
                await writeFile(path, buffer);
                await testInfo.attach(name, { path, contentType: 'image/png' });
            }
            expect(PNG.sync.read(exported).data.equals(PNG.sync.read(original).data), 'export preserves Labelary pixels').toBe(true);
            for (const [top, bottom] of c.bands || [[0, 406]]) {
                const expected = inkBounds(original, top, bottom), actual = inkBounds(canvas, top, bottom);
                if (!expected) { expect(actual).toBeNull(); continue; }
                expect(actual).not.toBeNull();
                for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
                    expect(Math.abs(actual![edge] - expected[edge]), edge).toBeLessThanOrEqual(c.name.includes('justification') || c.name.includes('FT') ? 4 : 1);
                }
            }
        });
    }
});
