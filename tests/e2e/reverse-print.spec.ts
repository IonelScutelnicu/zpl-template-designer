import { test, expect } from '../fixtures';
import { ElementsPanel, PropertiesPanel, ZPLOutput, buildSquarePngBuffer } from '../page-objects';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Coverage for ^FR (Reverse Print). Every element type should:
 *  - render an identical Reverse Print toggle in the properties panel
 *  - emit ^FR between ^FO and the element's primary command when toggled on
 *  - drop ^FR when toggled back off
 *  - round-trip the `reverse` flag through JSON export → import
 *  - round-trip ^FR through ZPL paste-import → ZPL output
 */

type ElementSpec = {
    type: string;
    /** Adds the element via the elements panel */
    add: (panel: ElementsPanel) => Promise<void>;
    /** ZPL substring that must precede ^FR in the output */
    foPrefix: RegExp;
    /** ZPL command that must follow ^FR in the output (e.g. ^GB, ^GE, ^BC, ^BQ, ^A, ^GFA) */
    primaryCmd: string;
};

const png = buildSquarePngBuffer();

const elementSpecs: ElementSpec[] = [
    { type: 'TEXT',       add: p => p.addTextElement(),      foPrefix: /\^FO\d+,\d+/, primaryCmd: '^A' },
    { type: 'TEXTBLOCK',  add: p => p.addTextBlockElement(), foPrefix: /\^FO\d+,\d+/, primaryCmd: '^A' },
    { type: 'FIELDBLOCK', add: p => p.addFieldBlockElement(),foPrefix: /\^FO\d+,\d+/, primaryCmd: '^A' },
    { type: 'BARCODE',    add: p => p.addBarcodeElement(),   foPrefix: /\^FO\d+,\d+/, primaryCmd: '^BY' },
    { type: 'QRCODE',     add: p => p.addQRCodeElement(),    foPrefix: /\^FO\d+,\d+/, primaryCmd: '^BQ' },
    { type: 'BOX',        add: p => p.addBoxElement(),       foPrefix: /\^FO\d+,\d+/, primaryCmd: '^GB' },
    { type: 'LINE',       add: p => p.addLineElement(),      foPrefix: /\^FO\d+,\d+/, primaryCmd: '^GB' },
    { type: 'CIRCLE',     add: p => p.addCircleElement(),    foPrefix: /\^FO\d+,\d+/, primaryCmd: '^GE' },
    { type: 'GRAPHIC',    add: p => p.addGraphicElement(png),foPrefix: /\^FO\d+,\d+/, primaryCmd: '^GFA' },
];

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test.describe('^FR (Reverse Print) — Properties panel toggle', () => {
    let elementsPanel: ElementsPanel;
    let propertiesPanel: PropertiesPanel;
    let zplOutput: ZPLOutput;

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        elementsPanel = new ElementsPanel(page);
        propertiesPanel = new PropertiesPanel(page);
        zplOutput = new ZPLOutput(page);
    });

    for (const spec of elementSpecs) {
        test(`${spec.type}: toggling Reverse Print emits/removes ^FR in ZPL output`, async () => {
            await spec.add(elementsPanel);
            await elementsPanel.selectElementByIndex(0);

            // Reverse Print row must exist in the panel.
            await expect(propertiesPanel.panel.locator('[data-reverse="Y"]')).toBeVisible();
            await expect(propertiesPanel.panel.locator('[data-reverse="N"]')).toBeVisible();

            // Toggle ON — ZPL contains ^FO…,…^FR<primaryCmd>
            await propertiesPanel.setReverse('Y');
            const onPattern = new RegExp(`${spec.foPrefix.source}\\^FR${escapeRegex(spec.primaryCmd)}`);
            await expect.poll(() => zplOutput.getZPLCode()).toMatch(onPattern);

            // Toggle OFF — ^FR must be gone (no occurrence in the entire output)
            await propertiesPanel.setReverse('N');
            const off = await zplOutput.getZPLCode();
            expect(off).not.toContain('^FR');
        });
    }
});

test.describe('^FR (Reverse Print) — JSON round-trip', () => {
    let elementsPanel: ElementsPanel;
    let zplOutput: ZPLOutput;

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        elementsPanel = new ElementsPanel(page);
        zplOutput = new ZPLOutput(page);
    });

    test('reverse flag survives import for the new 6 element types', async ({ page }) => {
        const template = {
            labelSettings: { width: 100, height: 50, dpmm: 8 },
            elements: [
                { type: 'BARCODE', x: 10, y: 10,  previewData: '12345', placeholder: '', height: 50, width: 2, ratio: 2, showText: true, reverse: true },
                { type: 'QRCODE',  x: 10, y: 80,  previewData: 'qr',    placeholder: '', model: 2, magnification: 5, errorCorrection: 'Q', reverse: true },
                { type: 'BOX',     x: 10, y: 160, width: 100, height: 50, thickness: 3, color: 'B', rounding: 0, reverse: true },
                { type: 'LINE',    x: 10, y: 220, width: 100, thickness: 3, orientation: 'H', color: 'B', rounding: 0, reverse: true },
                { type: 'CIRCLE',  x: 10, y: 260, width: 60, height: 60, thickness: 2, color: 'B', reverse: true },
            ]
        };
        const tempPath = path.join(__dirname, '../fixtures/reverse-import.json');
        fs.writeFileSync(tempPath, JSON.stringify(template));

        await zplOutput.importTemplate(tempPath);
        await expect(page.locator('#elements-list .element-item')).toHaveCount(5, { timeout: 5000 });

        // Every element should emit ^FR in its ZPL line.
        const zpl = await zplOutput.getZPLCode();
        const frCount = (zpl.match(/\^FR/g) || []).length;
        expect(frCount).toBe(5);

        // After re-export the reverse flag is preserved on each element.
        const reverseFlags = await page.evaluate(() => {
            const elements = (window as any).appState?.elements ?? [];
            return elements.map((e: any) => ({ type: e.type, reverse: !!e.reverse }));
        });
        for (const r of reverseFlags) {
            expect(r.reverse).toBe(true);
        }

        fs.unlinkSync(tempPath);
    });
});

test.describe('^FR (Reverse Print) — ZPL paste round-trip', () => {
    let zplOutput: ZPLOutput;

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        zplOutput = new ZPLOutput(page);
    });

    async function pasteZPL(page: any, zpl: string): Promise<void> {
        await zplOutput.openMoreActions();
        await page.locator('#import-zpl-btn').click();
        await expect(page.locator('#zpl-import-modal')).toBeVisible();
        await page.locator('#zpl-import-input').fill(zpl);
        await page.locator('#zpl-import-input').dispatchEvent('input');
        await page.locator('#zpl-import-confirm-btn').click();
        // If warnings show, click again to import anyway.
        const warnings = page.locator('#zpl-import-warnings');
        if (await warnings.isVisible().catch(() => false)) {
            await page.locator('#zpl-import-confirm-btn').click();
        }
    }

    const cases: { type: string; zpl: string }[] = [
        { type: 'BOX',     zpl: '^XA^FO50,50^FR^GB100,50,3,B^FS^XZ' },
        { type: 'LINE',    zpl: '^XA^FO50,150^FR^GB100,3,3,B^FS^XZ' },
        { type: 'CIRCLE',  zpl: '^XA^FO50,200^FR^GE60,60,2,B^FS^XZ' },
        { type: 'BARCODE', zpl: '^XA^FO50,260^FR^BY2,2.0^BCN,50,Y^FD>:12345^FS^XZ' },
        { type: 'QRCODE',  zpl: '^XA^FO50,320^FR^BQN,2,5^FDQA,hello^FS^XZ' },
    ];

    for (const c of cases) {
        test(`${c.type}: ^FR survives ZPL paste → re-export`, async ({ page }) => {
            await pasteZPL(page, c.zpl);

            // Wait for the import to land.
            await expect(page.locator('#elements-list .element-item')).toHaveCount(1, { timeout: 5000 });

            // Re-exported ZPL must contain ^FR.
            const zpl = await zplOutput.getZPLCode();
            expect(zpl).toContain('^FR');

            // The element instance keeps reverse=true.
            const reverse = await page.evaluate(() => {
                const elements = (window as any).appState?.elements ?? [];
                return !!elements[0]?.reverse;
            });
            expect(reverse).toBe(true);
        });
    }
});
