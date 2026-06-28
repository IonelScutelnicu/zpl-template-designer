import { test, expect } from '../fixtures';
import { ElementsPanel, PropertiesPanel, ZPLOutput } from '../page-objects';

// Symbology -> expected ZPL command emitted by the element's render().
const ONE_D = [
    { symbology: 'CODE128', command: '^BCN' },
    { symbology: 'CODE39', command: '^B3N' },
    { symbology: 'INTERLEAVED2OF5', command: '^B2N' },
    { symbology: 'EAN13', command: '^BEN' },
    { symbology: 'EAN8', command: '^B8N' },
    { symbology: 'UPCA', command: '^BUN' },
];
const TWO_D = [
    { symbology: 'QR', command: '^BQN' },
    { symbology: 'DATAMATRIX', command: '^BXN' },
    { symbology: 'PDF417', command: '^B7N' },
    { symbology: 'AZTEC', command: '^B0N' },
];

test.describe('Barcode symbology', () => {
    let elementsPanel: ElementsPanel;
    let propertiesPanel: PropertiesPanel;
    let zplOutput: ZPLOutput;

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        elementsPanel = new ElementsPanel(page);
        propertiesPanel = new PropertiesPanel(page);
        zplOutput = new ZPLOutput(page);
    });

    // ============== ZPL OUTPUT PER SYMBOLOGY ==============
    test.describe('emits the correct ZPL command', () => {
        for (const { symbology, command } of ONE_D) {
            test(`1D ${symbology} -> ${command}`, async () => {
                await elementsPanel.addBarcodeElement();
                await elementsPanel.selectElementByIndex(0);
                await propertiesPanel.setSelectValue('prop-symbology', symbology);
                await zplOutput.verifyZPLContains(command);
            });
        }

        for (const { symbology, command } of TWO_D) {
            test(`2D ${symbology} -> ${command}`, async () => {
                await elementsPanel.addQRCodeElement();
                await elementsPanel.selectElementByIndex(0);
                await propertiesPanel.setSelectValue('prop-symbology', symbology);
                await zplOutput.verifyZPLContains(command);
            });
        }
    });

    test('Code 39 emits ^BY ratio and a check-digit flag', async () => {
        await elementsPanel.addBarcodeElement();
        await elementsPanel.selectElementByIndex(0);
        await propertiesPanel.setSelectValue('prop-symbology', 'CODE39');
        // Check-digit toggle is only present for Code 39. The checkbox is
        // visually hidden (sr-only) behind a styled track, so force the check.
        await propertiesPanel.panel.locator('#prop-check-digit').check({ force: true });
        await zplOutput.verifyZPLContains('^B3N,Y,');
    });

    test('Code 39 ratio is clamped to the ^B3-supported 2.0:1–3.0:1 range', async () => {
        await elementsPanel.addBarcodeElement();
        await elementsPanel.selectElementByIndex(0);
        await propertiesPanel.setSelectValue('prop-symbology', 'CODE39');

        // Input advertises the spec bounds.
        const ratio = propertiesPanel.panel.locator('#prop-ratio');
        await expect(ratio).toHaveAttribute('min', '2');
        await expect(ratio).toHaveAttribute('max', '3');

        // Above range clamps down to 3.0.
        await propertiesPanel.setProperty('prop-ratio', '10');
        await zplOutput.verifyZPLContains('^BY2,3^B3');

        // Below range clamps up to 2.0.
        await propertiesPanel.setProperty('prop-ratio', '1');
        await zplOutput.verifyZPLContains('^BY2,2^B3');

        // In-range value is kept verbatim.
        await propertiesPanel.setProperty('prop-ratio', '2.5');
        await zplOutput.verifyZPLContains('^BY2,2.5^B3');
    });

    test('Code 39 wide bar is quantized to whole dots (floor(w·r)), matching Labelary', async ({ page }) => {
        // The printer prints whole dots, so the wide bar is floor(w·r) dots and the
        // effective ratio is floor(w·r)/w, not the literal r. Verified against Labelary
        // pixel measurements (w=2 r2.3 prints 2:1; w=9 r2.4 prints 21 dots).
        const r = await page.evaluate(async () => {
            const { getBarcodeGeometry } = await import('/src/utils/barcodeGeometry.js');
            const wideDots = (w: number, ratio: number) => {
                const g = getBarcodeGeometry({ type: 'BARCODE', symbology: 'CODE39', previewData: 'AB', ratio, width: w, showText: false } as any) as any;
                return Math.round(Math.max(...g.sbs) * w);
            };
            return {
                w2_r20: wideDots(2, 2.0), w2_r23: wideDots(2, 2.3), w2_r25: wideDots(2, 2.5),
                w3_r23: wideDots(3, 2.3), w3_r24: wideDots(3, 2.4), w9_r24: wideDots(9, 2.4),
            };
        });
        expect(r.w2_r20).toBe(4);
        expect(r.w2_r23).toBe(4); // floor(2*2.3)=4 -> same as r2.0 (2:1)
        expect(r.w2_r25).toBe(5);
        expect(r.w3_r23).toBe(6); // floor(3*2.3)=6
        expect(r.w3_r24).toBe(7); // floor(3*2.4)=7
        expect(r.w9_r24).toBe(21); // floor(9*2.4)=21
    });

    test('Code 39 mod-43 check digit widens the symbol and yields the right check char', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const { getBarcodeGeometry, code39CheckChar } = await import('/src/utils/barcodeGeometry.js');
            const geom = (checkDigit: boolean) =>
                getBarcodeGeometry({ type: 'BARCODE', symbology: 'CODE39', previewData: 'CODE39', showText: true, ratio: 3, checkDigit });
            return {
                checkChar: code39CheckChar('CODE39'),
                noCheck: (geom(false) as any).modules,
                withCheck: (geom(true) as any).modules,
                invalid: code39CheckChar('code39'), // lowercase isn't Code 39 -> ''
            };
        });
        expect(r.checkChar).toBe('W');
        expect(r.withCheck).toBeGreaterThan(r.noCheck);
        expect(r.invalid).toBe('');
    });

    // ============== INTERLEAVED 2 OF 5 (^B2) ==============
    test('Interleaved 2 of 5 emits ^BY ratio and a mod-10 check-digit flag', async () => {
        await elementsPanel.addBarcodeElement();
        await elementsPanel.selectElementByIndex(0);
        await propertiesPanel.setSelectValue('prop-symbology', 'INTERLEAVED2OF5');
        // ^BY ratio is shared with Code 39; default width 2, ratio 2.0.
        await zplOutput.verifyZPLContains('^BY2,2^B2N');
        // The check-digit (e) param trails the g slot once enabled (o,h,f,g,e).
        await propertiesPanel.panel.locator('#prop-check-digit').check({ force: true });
        await zplOutput.verifyZPLContains('^B2N,50,Y,N,Y');
    });

    test('Interleaved 2 of 5 ratio quantizes the wide bar like Code 39 (native 2:1)', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const { getBarcodeGeometry } = await import('/src/utils/barcodeGeometry.js');
            const wideDots = (w: number, ratio: number) => {
                const g = getBarcodeGeometry({ type: 'BARCODE', symbology: 'INTERLEAVED2OF5', previewData: '1234', ratio, width: w, showText: false } as any) as any;
                return Math.round(Math.max(...g.sbs) * w);
            };
            return { w2_r20: wideDots(2, 2.0), w2_r30: wideDots(2, 3.0), w3_r24: wideDots(3, 2.4) };
        });
        expect(r.w2_r20).toBe(4); // floor(2*2.0)=4 -> 2:1
        expect(r.w2_r30).toBe(6); // floor(2*3.0)=6 -> 3:1
        expect(r.w3_r24).toBe(7); // floor(3*2.4)=7
    });

    test('Interleaved 2 of 5 resolves digits: mod-10 check + even-length leading-zero pad', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const { mod10CheckChar, interleaved2of5Digits, getBarcodeGeometry } = await import('/src/utils/barcodeGeometry.js');
            const geom = (previewData: string, checkDigit: boolean) =>
                (getBarcodeGeometry({ type: 'BARCODE', symbology: 'INTERLEAVED2OF5', previewData, showText: true, ratio: 2, width: 2, checkDigit } as any) as any).modules;
            return {
                check1234: mod10CheckChar('1234'),
                evenNoPad: interleaved2of5Digits('1234', false),     // already even
                oddPad: interleaved2of5Digits('12345', false),       // odd -> leading 0
                checkPad: interleaved2of5Digits('1234', true),       // +check -> odd -> pad
                noCheck: geom('1234', false),
                withCheck: geom('1234', true),
            };
        });
        expect(r.check1234).toBe('8');
        expect(r.evenNoPad).toBe('1234');
        expect(r.oddPad).toBe('012345');
        expect(r.checkPad).toBe('012348');
        expect(r.withCheck).toBeGreaterThan(r.noCheck);
    });

    test('Interleaved 2 of 5 round-trips orientation, printTextAbove and check digit', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const [{ BarcodeElement }, { ZPLParser }] = await Promise.all([
                import('/src/elements/BarcodeElement.js'),
                import('/src/services/ZPLParser.js'),
            ]);
            const parser = new ZPLParser();
            const el: any = new BarcodeElement(10, 10, '1234567890', 50, 2, 3, '', true, false, 'INTERLEAVED2OF5', true, 'I', true);
            const parsed: any = parser.parse('^XA' + el.render() + '^XZ').elements[0];
            return {
                sym: parsed?.symbology,
                orientation: parsed?.orientation,
                above: parsed?.printTextAbove,
                checkDigit: parsed?.checkDigit,
            };
        });
        expect(r.sym).toBe('INTERLEAVED2OF5');
        expect(r.orientation).toBe('I');
        expect(r.above).toBe(true);
        expect(r.checkDigit).toBe(true);
    });

    // ============== ORIENTATION + INTERPRETATION LINE ABOVE ==============
    test.describe('orientation and interpretation line above', () => {
        // Per symbology, the expected command once orientation=R and
        // "interpretation line above" (g) are both enabled.
        const cases = [
            { symbology: 'CODE128', expected: '^BCR,50,Y,Y' },
            { symbology: 'CODE39', expected: '^B3R,N,50,Y,Y' },
            { symbology: 'EAN13', expected: '^BER,50,Y,Y' },
            { symbology: 'EAN8', expected: '^B8R,50,Y,Y' },
            { symbology: 'UPCA', expected: '^BUR,50,Y,Y' },
        ];
        for (const { symbology, expected } of cases) {
            test(`1D ${symbology} -> ${expected}`, async () => {
                await elementsPanel.addBarcodeElement();
                await elementsPanel.selectElementByIndex(0);
                await propertiesPanel.setSelectValue('prop-symbology', symbology);
                await propertiesPanel.panel.locator('[data-orientation="R"]').click();
                await propertiesPanel.panel.locator('[data-hri="above"]').click();
                await zplOutput.verifyZPLContains(expected);
            });
        }

        test('defaults stay N with no g param', async () => {
            await elementsPanel.addBarcodeElement();
            await elementsPanel.selectElementByIndex(0);
            await zplOutput.verifyZPLContains('^BCN,50,Y^FD');
        });

        test('orientation and printTextAbove round-trip through ZPLParser', async ({ page }) => {
            const results = await page.evaluate(async () => {
                const [{ BarcodeElement }, { ZPLParser }] = await Promise.all([
                    import('/src/elements/BarcodeElement.js'),
                    import('/src/services/ZPLParser.js'),
                ]);
                const parser = new ZPLParser();
                const samples = [
                    new BarcodeElement(10, 10, '1234567890', 50, 2, 3, '', true, false, 'CODE128', false, 'R', true),
                    new BarcodeElement(10, 10, 'CODE39', 50, 2, 3, '', true, false, 'CODE39', true, 'I', true),
                    new BarcodeElement(10, 10, '123456789012', 50, 2, 3, '', true, false, 'EAN13', false, 'B', false),
                    new BarcodeElement(10, 10, '12345678901', 50, 2, 3, '', true, false, 'UPCA', false, 'R', true),
                ];
                return samples.map((el: any) => {
                    const parsed = parser.parse('^XA' + el.render() + '^XZ').elements[0];
                    return {
                        sym: el.symbology,
                        orientationOk: parsed?.orientation === el.orientation,
                        aboveOk: parsed?.printTextAbove === el.printTextAbove,
                    };
                });
            });
            for (const r of results) {
                expect(r.orientationOk, `orientation ${r.sym}`).toBe(true);
                expect(r.aboveOk, `printTextAbove ${r.sym}`).toBe(true);
            }
        });
    });

    test('PDF417 emits ^BY module width before ^B7', async () => {
        await elementsPanel.addQRCodeElement();
        await elementsPanel.selectElementByIndex(0);
        await propertiesPanel.setSelectValue('prop-symbology', 'PDF417');
        await zplOutput.verifyZPLContains('^BY');
        await zplOutput.verifyZPLContains('^B7N');
    });

    // ============== AZTEC (^B0) ==============
    test('Aztec defaults emit ^B0N,{mag},N (d omitted) with raw ^FD (no EC prefix)', async () => {
        await elementsPanel.addQRCodeElement();
        await elementsPanel.selectElementByIndex(0);
        await propertiesPanel.setSelectValue('prop-symbology', 'AZTEC');
        // d=0 ("printer default") isn't a valid ^B0 size, so it is omitted.
        await zplOutput.verifyZPLContains('^B0N,5,N^FDAztec^FS');
    });

    test('Aztec symbol type maps to the ^B0 d parameter', async ({ page }) => {
        const cases = await page.evaluate(async () => {
            const { QRCodeElement } = await import('/src/elements/QRCodeElement.js');
            const d = (mode: string, ec = 0, layers = 0) => {
                const el: any = new QRCodeElement(0, 0, 'X', 2, 5, 'Q', '', false, 'AZTEC', 4, 200, 2, 4, 5, 0, mode, ec, layers);
                // d=0 (default) is omitted entirely; treat a missing d as '0'.
                return el.render().match(/\^B0N,5,N(?:,(\d+))?\^FD/)?.[1] ?? '0';
            };
            return {
                autoDefault: d('auto', 0),
                autoEc: d('auto', 50),
                compact: d('compact', 0, 2),
                full: d('full', 0, 10),
                rune: d('rune'),
            };
        });
        expect(cases.autoDefault).toBe('0');
        expect(cases.autoEc).toBe('50');
        expect(cases.compact).toBe('102');
        expect(cases.full).toBe('210');
        expect(cases.rune).toBe('300');
    });

    test('Aztec encodes to a matrix geometry (auto, compact, rune)', async ({ page }) => {
        const kinds = await page.evaluate(async () => {
            const { getBarcodeGeometry } = await import('/src/utils/barcodeGeometry.js');
            const kind = (mode: string, data: string) =>
                (getBarcodeGeometry({ type: 'QRCODE', symbology: 'AZTEC', previewData: data, magnification: 5, aztecSizeMode: mode, aztecErrorControl: 0, aztecLayers: 0 } as any) as any).kind;
            return {
                auto: kind('auto', 'Aztec'),
                compact: kind('compact', 'Hi'),
                rune: kind('rune', '42'),
                // Rune requires a 0–255 number; non-numeric / default data must
                // still render (coerced) rather than fall back to a placeholder.
                runeNonNumeric: kind('rune', 'Aztec'),
                runeEmpty: kind('rune', ''),
            };
        });
        expect(kinds.auto).toBe('matrix');
        expect(kinds.compact).toBe('matrix');
        expect(kinds.rune).toBe('matrix');
        expect(kinds.runeNonNumeric).toBe('matrix');
        expect(kinds.runeEmpty).toBe('matrix');
    });

    test('Aztec rune data is coerced to a valid 0–255 byte (canvas + ZPL)', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const [{ normalizeAztecRune }, { QRCodeElement }] = await Promise.all([
                import('/src/utils/barcodeGeometry.js'),
                import('/src/elements/QRCodeElement.js'),
            ]);
            const rune = (data: string, placeholder = '') =>
                new QRCodeElement(0, 0, data, 2, 5, 'Q', placeholder, false, 'AZTEC', 4, 200, 2, 4, 5, 0, 'rune', 0, 0);
            return {
                norm: ['Aztec', '300', '42', '', '7x9'].map((d) => normalizeAztecRune(d)),
                zplNonNumeric: rune('Aztec').render(),
                zplInRange: rune('200').render(),
                // A placeholder token is left intact for the templating system.
                zplPlaceholder: rune('Aztec', 'tok').render(),
            };
        });
        expect(r.norm).toEqual(['0', '255', '42', '0', '79']); // '7x9' -> digits '79'
        expect(r.zplNonNumeric).toContain('^B0N,5,N,300^FD0^FS');
        expect(r.zplInRange).toContain('^B0N,5,N,300^FD200^FS');
        expect(r.zplPlaceholder).toContain('^FD%tok%^FS');
    });

    test('Aztec exposes its symbol-type / error / layers controls', async () => {
        await elementsPanel.addQRCodeElement();
        await elementsPanel.selectElementByIndex(0);
        await propertiesPanel.setSelectValue('prop-symbology', 'AZTEC');
        await expect(propertiesPanel.panel.locator('#prop-aztec-size-mode')).toBeVisible();
        await expect(propertiesPanel.panel.locator('#prop-aztec-error-control')).toBeVisible();
        await expect(propertiesPanel.panel.locator('#prop-aztec-layers')).toBeVisible();
        // No QR-only error-correction select for Aztec.
        await expect(propertiesPanel.panel.locator('#prop-error-correction')).toHaveCount(0);
    });

    // ============== SYMBOLOGY SWITCH BEHAVIOUR (decision C) ==============
    test('switching symbology swaps the default data only when untouched', async () => {
        await elementsPanel.addBarcodeElement();
        await elementsPanel.selectElementByIndex(0);
        // Fresh element holds the CODE128 default; switching replaces it with the
        // EAN-13 default (12 digits).
        await propertiesPanel.setSelectValue('prop-symbology', 'EAN13');
        await propertiesPanel.verifyPropertyValue('prop-preview-data', '123456789012');

        // Edit the data, then switch again — the typed value must survive.
        await propertiesPanel.setProperty('prop-preview-data', '111111111111');
        await propertiesPanel.setSelectValue('prop-symbology', 'UPCA');
        await propertiesPanel.verifyPropertyValue('prop-preview-data', '111111111111');
    });

    test('symbology-specific fields appear and disappear', async () => {
        await elementsPanel.addQRCodeElement();
        await elementsPanel.selectElementByIndex(0);

        // QR exposes error correction; Data Matrix exposes quality, not EC.
        await expect(propertiesPanel.panel.locator('#prop-error-correction')).toBeVisible();
        await propertiesPanel.setSelectValue('prop-symbology', 'DATAMATRIX');
        await expect(propertiesPanel.panel.locator('#prop-error-correction')).toHaveCount(0);
        await expect(propertiesPanel.panel.locator('#prop-quality')).toBeVisible();
        await propertiesPanel.setSelectValue('prop-symbology', 'PDF417');
        await expect(propertiesPanel.panel.locator('#prop-security-level')).toBeVisible();
    });

    // ============== PLACEHOLDER FALLBACK (encode failure) ==============
    test('invalid data does not crash the renderer', async ({ page }) => {
        const pageErrors: string[] = [];
        page.on('pageerror', (err) => pageErrors.push(err.message));

        await elementsPanel.addBarcodeElement();
        await elementsPanel.selectElementByIndex(0);
        await propertiesPanel.setSelectValue('prop-symbology', 'EAN13');
        // EAN-13 requires 12 digits — letters make bwip-js throw; the renderer
        // must fall back to a placeholder box rather than error out.
        await propertiesPanel.setProperty('prop-preview-data', 'not-a-number');

        // The element remains and ZPL is still produced with the (invalid) data.
        expect(await elementsPanel.getElementCount()).toBe(1);
        await zplOutput.verifyZPLContains('^BEN');
        await zplOutput.verifyZPLContains('not-a-number');
        expect(pageErrors).toEqual([]);
    });

    // ============== FIXED-LENGTH FIELD-DATA NORMALIZATION (^BE / ^BU) ==============
    test('EAN-13 / EAN-8 / UPC-A field data is truncated or left-padded with zeros', async ({ page }) => {
        const cases = await page.evaluate(async () => {
            const { normalizeBarcodeData } = await import('/src/utils/barcodeGeometry.js');
            return {
                ean13Pad: normalizeBarcodeData('EAN13', '123'),
                ean13Truncate: normalizeBarcodeData('EAN13', '1234567890123456'),
                ean13NonDigit: normalizeBarcodeData('EAN13', '12-45-78-01a'),
                ean8Pad: normalizeBarcodeData('EAN8', '12'),
                ean8Truncate: normalizeBarcodeData('EAN8', '123456789'),
                upcaPad: normalizeBarcodeData('UPCA', '12'),
                passthrough: normalizeBarcodeData('CODE128', 'abc'),
            };
        });
        expect(cases.ean13Pad).toBe('000000000123');
        expect(cases.ean13Truncate).toBe('567890123456');
        expect(cases.ean13NonDigit).toBe('120450780010');
        expect(cases.ean8Pad).toBe('0000012');     // 7-digit field, left-padded
        expect(cases.ean8Truncate).toBe('3456789'); // keeps the trailing 7
        expect(cases.upcaPad).toBe('00000000012');
        expect(cases.passthrough).toBe('abc');
    });

    // ============== PARSER ROUND-TRIP ==============
    test('all symbologies round-trip through ZPLParser', async ({ page }) => {
        const results = await page.evaluate(async () => {
            const [{ BarcodeElement }, { QRCodeElement }, { ZPLParser }] = await Promise.all([
                import('/src/elements/BarcodeElement.js'),
                import('/src/elements/QRCodeElement.js'),
                import('/src/services/ZPLParser.js'),
            ]);
            const parser = new ZPLParser();
            const make1D = (data: string, sym: string, checkDigit = false) =>
                new BarcodeElement(10, 10, data, 50, 2, 3, '', true, false, sym, checkDigit);
            const make2D = (data: string, sym: string) =>
                new QRCodeElement(10, 10, data, 2, 5, 'Q', '', false, sym);

            const samples = [
                make1D('1234567890', 'CODE128'),
                make1D('CODE39', 'CODE39', true),
                make1D('123456789012', 'EAN13'),
                make1D('1234567', 'EAN8'),
                make1D('12345678901', 'UPCA'),
                make2D('https://example.com', 'QR'),
                make2D('Data Matrix', 'DATAMATRIX'),
                make2D('PDF417', 'PDF417'),
                make2D('Aztec', 'AZTEC'),
            ];

            return samples.map((el: any) => {
                const parsed = parser.parse('^XA' + el.render() + '^XZ').elements[0];
                return {
                    expected: el.symbology,
                    gotSymbology: parsed?.symbology,
                    dataOk: parsed?.previewData === el.previewData,
                };
            });
        });

        for (const r of results) {
            expect(r.gotSymbology, `symbology ${r.expected}`).toBe(r.expected);
            expect(r.dataOk, `data for ${r.expected}`).toBe(true);
        }
    });

    test('Aztec size fields round-trip through ZPLParser', async ({ page }) => {
        const results = await page.evaluate(async () => {
            const [{ QRCodeElement }, { ZPLParser }] = await Promise.all([
                import('/src/elements/QRCodeElement.js'),
                import('/src/services/ZPLParser.js'),
            ]);
            const parser = new ZPLParser();
            const make = (mode: string, ec: number, layers: number) =>
                new QRCodeElement(10, 10, 'Aztec', 2, 5, 'Q', '', false, 'AZTEC', 4, 200, 2, 4, 5, 0, mode, ec, layers);
            const samples = [
                make('auto', 0, 0),
                make('auto', 50, 0),
                make('compact', 0, 2),
                make('full', 0, 10),
                make('rune', 0, 0),
            ];
            return samples.map((el: any) => {
                const parsed: any = parser.parse('^XA' + el.render() + '^XZ').elements[0];
                return {
                    mode: el.aztecSizeMode,
                    modeOk: parsed?.aztecSizeMode === el.aztecSizeMode,
                    ecOk: parsed?.aztecErrorControl === el.aztecErrorControl,
                    layersOk: parsed?.aztecLayers === el.aztecLayers,
                };
            });
        });
        for (const r of results) {
            expect(r.modeOk, `mode ${r.mode}`).toBe(true);
            expect(r.ecOk, `errorControl ${r.mode}`).toBe(true);
            expect(r.layersOk, `layers ${r.mode}`).toBe(true);
        }
    });

    // Template export → import (JSON serialize/deserialize), the path used by the
    // download/upload buttons and by saved app state.
    test('Aztec fields survive template serialize → deserialize', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const [{ QRCodeElement }, { SerializationService }] = await Promise.all([
                import('/src/elements/QRCodeElement.js'),
                import('/src/services/SerializationService.js'),
            ]);
            const svc = new SerializationService();
            const el = new QRCodeElement(10, 10, 'Aztec', 2, 5, 'Q', 'tok', false, 'AZTEC', 4, 200, 2, 4, 5, 0, 'compact', 33, 3);
            // Round-trip through the same JSON the export writes.
            const data = JSON.parse(JSON.stringify(svc.serializeElement(el)));
            const restored: any = svc.createElementFromData(data, { keepId: false });
            return {
                type: restored?.type,
                symbology: restored?.symbology,
                mode: restored?.aztecSizeMode,
                ec: restored?.aztecErrorControl,
                layers: restored?.aztecLayers,
                data: restored?.previewData,
                placeholder: restored?.placeholder,
            };
        });
        expect(r.type).toBe('QRCODE');
        expect(r.symbology).toBe('AZTEC');
        expect(r.mode).toBe('compact');
        expect(r.ec).toBe(33);
        expect(r.layers).toBe(3);
        expect(r.data).toBe('Aztec');
        expect(r.placeholder).toBe('tok');
    });

    // ZPL paste/import path: parser output → createElementFromData (as app.js
    // importTemplate does), confirming Aztec fields survive into a real element.
    test('Aztec survives ZPL import (parse → createElementFromData)', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const [{ QRCodeElement }, { ZPLParser }, { SerializationService }] = await Promise.all([
                import('/src/elements/QRCodeElement.js'),
                import('/src/services/ZPLParser.js'),
                import('/src/services/SerializationService.js'),
            ]);
            const src = new QRCodeElement(20, 30, 'Aztec', 2, 7, 'Q', '', false, 'AZTEC', 4, 200, 2, 4, 5, 0, 'full', 0, 5);
            const parsed = new ZPLParser().parse('^XA' + src.render() + '^XZ').elements[0];
            const el: any = new SerializationService().createElementFromData(parsed, { keepId: false });
            return {
                symbology: el?.symbology,
                x: el?.x, y: el?.y,
                magnification: el?.magnification,
                mode: el?.aztecSizeMode,
                layers: el?.aztecLayers,
                // Re-render must reproduce the same ^B0 command.
                zpl: el?.render?.(),
            };
        });
        expect(r.symbology).toBe('AZTEC');
        expect(r.x).toBe(20);
        expect(r.y).toBe(30);
        expect(r.magnification).toBe(7);
        expect(r.mode).toBe('full');
        expect(r.layers).toBe(5);
        expect(r.zpl).toContain('^B0N,7,N,205');
    });

    // Density (DPI) rescale: Aztec sizes via magnification, scaled by the QRCODE
    // branch of applyRescale (clamped to the shared 2D magnification bound).
    test('Aztec magnification scales on density change', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const { applyRescale } = await import('/src/services/DensityRescaleService.js');
            const el: any = { type: 'QRCODE', symbology: 'AZTEC', x: 10, y: 20, magnification: 4 };
            applyRescale({ elements: [el], labelSettings: {}, oldDpmm: 8, newDpmm: 12 }); // s = 1.5
            const elClamp: any = { type: 'QRCODE', symbology: 'AZTEC', x: 0, y: 0, magnification: 8 };
            applyRescale({ elements: [elClamp], labelSettings: {}, oldDpmm: 8, newDpmm: 16 }); // s = 2 → 16 clamps to 10
            return { x: el.x, y: el.y, mag: el.magnification, clampedMag: elClamp.magnification };
        });
        expect(r.x).toBe(15);            // 10 * 1.5
        expect(r.y).toBe(30);            // 20 * 1.5
        expect(r.mag).toBe(6);           // round(4 * 1.5)
        expect(r.clampedMag).toBe(10);   // round(8 * 2)=16 clamped to max 10
    });
});
