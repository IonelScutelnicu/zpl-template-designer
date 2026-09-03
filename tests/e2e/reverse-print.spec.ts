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
 *
 * Plus ^LR (Label Reverse Print), which the parser flattens into the same `reverse`
 * flag: ^LRY reverses every field that follows it until ^LRN, and the export emits
 * ^FR per field rather than ^LR.
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
    { type: 'QRCODE',     add: p => p.addQRCodeElement(),    foPrefix: /\^FO\d+,\d+\^BY,,10/, primaryCmd: '^BQ' },
    { type: 'BOX',        add: p => p.addBoxElement(),       foPrefix: /\^FO\d+,\d+/, primaryCmd: '^GB' },
    { type: 'LINE',       add: p => p.addLineElement(),      foPrefix: /\^FO\d+,\d+/, primaryCmd: '^GB' },
    { type: 'DIAGONALLINE', add: p => p.addDiagonalLineElement(), foPrefix: /\^FO\d+,\d+/, primaryCmd: '^GD' },
    { type: 'CIRCLE',     add: p => p.addCircleElement(),    foPrefix: /\^FO\d+,\d+/, primaryCmd: '^GC' },
    { type: 'GRAPHIC',    add: p => p.addGraphicElement(png),foPrefix: /\^FO\d+,\d+/, primaryCmd: '^GFA' },
    { type: 'GRAPHICSYMBOL', add: p => p.addGraphicSymbolElement(), foPrefix: /\^FO\d+,\d+/, primaryCmd: '^GS' },
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
                { type: 'BARCODE', x: 10, y: 10,  content: '12345', placeholder: '', height: 50, width: 2, ratio: 2, showText: true, reverse: true },
                { type: 'QRCODE',  x: 10, y: 80,  content: 'qr',    placeholder: '', model: 2, magnification: 5, errorCorrection: 'Q', reverse: true },
                { type: 'BOX',     x: 10, y: 160, width: 100, height: 50, thickness: 3, color: 'B', rounding: 0, reverse: true },
                { type: 'LINE',    x: 10, y: 220, width: 100, thickness: 3, orientation: 'H', color: 'B', rounding: 0, reverse: true },
                { type: 'CIRCLE',  x: 10, y: 260, width: 60, height: 60, thickness: 2, color: 'B', reverse: true },
                { type: 'DIAGONALLINE', x: 10, y: 330, width: 100, height: 80, thickness: 3, color: 'B', orientation: 'R', reverse: true },
            ]
        };
        const tempPath = path.join(__dirname, '../fixtures/reverse-import.json');
        fs.writeFileSync(tempPath, JSON.stringify(template));

        await zplOutput.importTemplate(tempPath);
        await expect(page.locator('#elements-list .element-item')).toHaveCount(6, { timeout: 5000 });

        // Every element should emit ^FR in its ZPL line.
        const zpl = await zplOutput.getZPLCode();
        const frCount = (zpl.match(/\^FR/g) || []).length;
        expect(frCount).toBe(6);

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

async function pasteZPL(page: any, zplOutput: ZPLOutput, zpl: string): Promise<void> {
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

/** The `reverse` flag on each imported element, in z-order. */
async function elementReverseFlags(page: any): Promise<boolean[]> {
    return page.evaluate(() => {
        const elements = (window as any).appState?.elements ?? [];
        return elements.map((e: any) => !!e.reverse);
    });
}

test.describe('^FR (Reverse Print) — ZPL paste round-trip', () => {
    let zplOutput: ZPLOutput;

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        zplOutput = new ZPLOutput(page);
    });

    const cases: { type: string; zpl: string }[] = [
        { type: 'BOX',     zpl: '^XA^FO50,50^FR^GB100,50,3,B^FS^XZ' },
        { type: 'LINE',    zpl: '^XA^FO50,150^FR^GB100,3,3,B^FS^XZ' },
        { type: 'CIRCLE',  zpl: '^XA^FO50,200^FR^GE60,60,2,B^FS^XZ' },
        { type: 'DIAGONALLINE', zpl: '^XA^FO50,250^FR^GD100,80,3,B,R^FS^XZ' },
        { type: 'BARCODE', zpl: '^XA^FO50,260^FR^BY2,2.0^BCN,50,Y^FD>:12345^FS^XZ' },
        { type: 'QRCODE',  zpl: '^XA^FO50,320^FR^BQN,2,5^FDQA,hello^FS^XZ' },
    ];

    for (const c of cases) {
        test(`${c.type}: ^FR survives ZPL paste → re-export`, async ({ page }) => {
            await pasteZPL(page, zplOutput, c.zpl);

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


test.describe('^LR (Label Reverse Print) — ZPL paste', () => {
    let zplOutput: ZPLOutput;

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        zplOutput = new ZPLOutput(page);
    });

    test('^LRY reverses the field that follows it', async ({ page }) => {
        await pasteZPL(page, zplOutput, '^XA^LRY^FO50,50^GB100,50,3,B^FS^XZ');

        await expect(page.locator('#elements-list .element-item')).toHaveCount(1, { timeout: 5000 });
        expect(await elementReverseFlags(page)).toEqual([true]);
        expect(await zplOutput.getZPLCode()).toContain('^FR');
    });

    test('^LRN turns it back off for later fields', async ({ page }) => {
        await pasteZPL(page, zplOutput,
            '^XA^LRY^FO50,50^GB100,50,3,B^FS^LRN^FO50,150^GB100,50,3,B^FS^XZ');

        await expect(page.locator('#elements-list .element-item')).toHaveCount(2, { timeout: 5000 });
        expect(await elementReverseFlags(page)).toEqual([true, false]);
    });

    test('only fields following ^LRY are affected', async ({ page }) => {
        await pasteZPL(page, zplOutput,
            '^XA^FO50,50^GB100,50,3,B^FS^LRY^FO50,150^GB100,50,3,B^FS^XZ');

        await expect(page.locator('#elements-list .element-item')).toHaveCount(2, { timeout: 5000 });
        expect(await elementReverseFlags(page)).toEqual([false, true]);
    });

    test('an explicit ^FR under ^LRY stays reversed rather than cancelling', async ({ page }) => {
        await pasteZPL(page, zplOutput, '^XA^LRY^FO50,50^FR^GB100,50,3,B^FS^XZ');

        await expect(page.locator('#elements-list .element-item')).toHaveCount(1, { timeout: 5000 });
        expect(await elementReverseFlags(page)).toEqual([true]);
    });

    test('a bare ^LR is the N default', async ({ page }) => {
        await pasteZPL(page, zplOutput, '^XA^LR^FO50,50^GB100,50,3,B^FS^XZ');

        await expect(page.locator('#elements-list .element-item')).toHaveCount(1, { timeout: 5000 });
        expect(await elementReverseFlags(page)).toEqual([false]);
    });

    test('a field after ^LRY is still modelled, not preserved as Raw ZPL', async ({ page }) => {
        await pasteZPL(page, zplOutput, '^XA^LRY^FO50,50^A0N,30,30^FDHi^FS^XZ');

        await expect(page.locator('#elements-list .element-item')).toHaveCount(1, { timeout: 5000 });
        const types = await page.evaluate(() => {
            const elements = (window as any).appState?.elements ?? [];
            return elements.map((e: any) => e.type);
        });
        expect(types).toEqual(['TEXT']);
    });

    test('a field preserved as Raw ZPL still carries the reversal', async ({ page }) => {
        // ^RFW is unmodelled, so the whole field round-trips verbatim as RAW. Without
        // the carried ^FR the exported label would silently print normally.
        await pasteZPL(page, zplOutput, '^XA^LRY^FO10,10^RFW,H^FDx^FS^XZ');

        await expect(page.locator('#elements-list .element-item')).toHaveCount(1, { timeout: 5000 });
        expect(await zplOutput.getZPLCode()).toContain('^FR^FO10,10^RFW,H^FDx^FS');
    });

    test('a Raw ZPL field after ^LRN is left alone', async ({ page }) => {
        await pasteZPL(page, zplOutput,
            '^XA^LRY^FO10,10^RFW,H^FDx^FS^LRN^FO10,60^RFW,H^FDy^FS^XZ');

        await expect(page.locator('#elements-list .element-item')).toHaveCount(2, { timeout: 5000 });
        const zpl = await zplOutput.getZPLCode();
        expect(zpl).toContain('^FR^FO10,10^RFW,H^FDx^FS');
        expect(zpl).toContain('^FO10,60^RFW,H^FDy^FS');
        expect(zpl).not.toContain('^FR^FO10,60');
    });

    test('a Raw ZPL field that already spells out its own reversal is not doubled', async ({ page }) => {
        await pasteZPL(page, zplOutput, '^XA^LRY^FO10,10^FR^RFW,H^FDx^FS^XZ');

        await expect(page.locator('#elements-list .element-item')).toHaveCount(1, { timeout: 5000 });
        const zpl = await zplOutput.getZPLCode();
        expect(zpl).toContain('^FO10,10^FR^RFW,H^FDx^FS');
        expect((zpl.match(/\^FR/g) || []).length).toBe(1);
    });

    test('^LR no longer reports as an unsupported command', async ({ page }) => {
        await zplOutput.openMoreActions();
        await page.locator('#import-zpl-btn').click();
        await expect(page.locator('#zpl-import-modal')).toBeVisible();
        await page.locator('#zpl-import-input').fill('^XA^LRY^FO50,50^GB100,50,3,B^FS^XZ');
        await page.locator('#zpl-import-input').dispatchEvent('input');
        await page.locator('#zpl-import-confirm-btn').click();

        // The ^LR note is informational; nothing may claim the command is unsupported.
        const warningsText = await page.locator('#zpl-import-warnings-list').textContent();
        expect(warningsText ?? '').not.toContain('Unsupported command');
    });
});
