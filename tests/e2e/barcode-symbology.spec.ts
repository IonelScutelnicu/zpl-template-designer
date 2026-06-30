import { test, expect } from '../fixtures';
import { ElementsPanel, PropertiesPanel, ZPLOutput } from '../page-objects';

// Symbology -> expected ZPL command emitted by the element's render().
const ONE_D = [
    { symbology: 'CODE128', command: '^BCN' },
    { symbology: 'CODE39', command: '^B3N' },
    { symbology: 'CODE93', command: '^BAN' },
    { symbology: 'CODE11', command: '^B1N' },
    { symbology: 'CODABAR', command: '^BKN' },
    { symbology: 'INTERLEAVED2OF5', command: '^B2N' },
    { symbology: 'INDUSTRIAL2OF5', command: '^BIN' },
    { symbology: 'STANDARD2OF5', command: '^BJN' },
    { symbology: 'LOGMARS', command: '^BLN' },
    { symbology: 'MSI', command: '^BMN' },
    { symbology: 'PLESSEY', command: '^BPN' },
    { symbology: 'PLANET', command: '^B5N' },
    { symbology: 'POSTNET', command: '^BZN' },
    { symbology: 'EAN13', command: '^BEN' },
    { symbology: 'EAN8', command: '^B8N' },
    { symbology: 'UPCA', command: '^BUN' },
    { symbology: 'UPCE', command: '^B9N' },
    { symbology: 'UPCEANEXT', command: '^BSN' },
];
const TWO_D = [
    { symbology: 'QR', command: '^BQN' },
    { symbology: 'DATAMATRIX', command: '^BXN' },
    { symbology: 'PDF417', command: '^B7N' },
    { symbology: 'MICROPDF417', command: '^BFN' },
    { symbology: 'AZTEC', command: '^B0N' },
    { symbology: 'CODE49', command: '^B4N' },
    { symbology: 'CODABLOCK', command: '^BBN' },
    { symbology: 'MAXICODE', command: '^BD4' },
    { symbology: 'GS1DATABAR', command: '^BRN,1' },
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

    // ============== CODE 93 (^BA) ==============
    test('Code 93 emits ^BA with the check-digit flag last (o,h,f,g,e)', async () => {
        await elementsPanel.addBarcodeElement();
        await elementsPanel.selectElementByIndex(0);
        await propertiesPanel.setSelectValue('prop-symbology', 'CODE93');
        // No ratio param for Code 93 (fixed ratio); default emits N with no g/e.
        await zplOutput.verifyZPLContains('^BAN,50,Y^FD');
        // Enabling "print check digits" fills the g slot so e lands in position.
        await propertiesPanel.panel.locator('#prop-check-digit').check({ force: true });
        await zplOutput.verifyZPLContains('^BAN,50,Y,N,Y');
    });

    test('Code 93 check chars are always in the bars; e only adds them to the HRI', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const { getBarcodeGeometry, code93CheckChars } = await import('/src/utils/barcodeGeometry.js');
            const geom = (checkDigit: boolean) =>
                getBarcodeGeometry({ type: 'BARCODE', symbology: 'CODE93', previewData: '12345ABC', showText: true, width: 2, checkDigit } as any) as any;
            return {
                checkChars: code93CheckChars('12345ABC'),
                shiftCheck: code93CheckChars('M0'),  // exercises the 'a'–'d' check values
                fullAscii: code93CheckChars('abc'),  // ^BA is full-ASCII: lowercase encodes
                invalid: code93CheckChars('café'),   // non-ASCII (é > 127) can't encode -> ''
                // Mandatory C+K are encoded regardless of the flag, so module count is equal.
                modulesNoFlag: geom(false).modules,
                modulesWithFlag: geom(true).modules,
            };
        });
        expect(r.checkChars).toBe('37');     // Labelary: ^FD12345ABC -> HRI "12345ABC37"
        expect(r.shiftCheck).toBe('bG');     // Labelary: ^FDM0 -> HRI "M0bG"
        expect(r.fullAscii).toBe('-8');      // ^FDabc -> check chars over the extended encoding
        expect(r.invalid).toBe('');
        expect(r.modulesWithFlag).toBe(r.modulesNoFlag);
    });

    test('Code 93 round-trips orientation, printTextAbove and check digit', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const [{ BarcodeElement }, { ZPLParser }] = await Promise.all([
                import('/src/elements/BarcodeElement.js'),
                import('/src/services/ZPLParser.js'),
            ]);
            const parser = new ZPLParser();
            const el: any = new BarcodeElement(10, 10, 'CODE93', 50, 2, 3, '', true, false, 'CODE93', true, 'I', true);
            const parsed: any = parser.parse('^XA' + el.render() + '^XZ').elements[0];
            return {
                sym: parsed?.symbology,
                orientation: parsed?.orientation,
                above: parsed?.printTextAbove,
                checkDigit: parsed?.checkDigit,
            };
        });
        expect(r.sym).toBe('CODE93');
        expect(r.orientation).toBe('I');
        expect(r.above).toBe(true);
        expect(r.checkDigit).toBe(true);
    });

    // ============== CODE 11 (^B1) ==============
    test('Code 11 appends 1 or 2 check digits (^B1 e flag) to the bars and HRI', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const { code11CheckDigits, getBarcodeGeometry } = await import('/src/utils/barcodeGeometry.js');
            const modules = (single: boolean) =>
                (getBarcodeGeometry({ type: 'BARCODE', symbology: 'CODE11', previewData: '123456', checkDigit: single, ratio: 3, width: 2, showText: true } as any) as any).modules;
            return {
                two: code11CheckDigits('123456', false), // e=N -> C+K
                one: code11CheckDigits('123456', true),  // e=Y -> C
                invalid: code11CheckDigits('12.34', false), // '.' not in the Code 11 set -> ''
                modTwo: modules(false),
                modOne: modules(true),
            };
        });
        expect(r.two).toBe('11');  // Labelary: ^FD123456 (e=N) -> "12345611"
        expect(r.one).toBe('1');   // Labelary: ^FD123456 (e=Y) -> "1234561"
        expect(r.invalid).toBe('');
        expect(r.modTwo).toBeGreaterThan(r.modOne); // 2 check digits widen the symbol vs 1
    });

    test('Code 11 emits ^B1 e=Y for a single check digit and round-trips', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const [{ BarcodeElement }, { ZPLParser }] = await Promise.all([
                import('/src/elements/BarcodeElement.js'),
                import('/src/services/ZPLParser.js'),
            ]);
            const parser = new ZPLParser();
            // checkDigit=true (single), orientation I, printTextAbove true.
            const el: any = new BarcodeElement(10, 10, '123456', 50, 2, 3, '', true, false, 'CODE11', true, 'I', true);
            const zpl = el.render();
            const parsed: any = parser.parse('^XA' + zpl + '^XZ').elements[0];
            return {
                emitsSingle: zpl.includes('^B1I,Y,50,Y,Y'),
                sym: parsed?.symbology,
                orientation: parsed?.orientation,
                above: parsed?.printTextAbove,
                checkDigit: parsed?.checkDigit,
            };
        });
        expect(r.emitsSingle).toBe(true);
        expect(r.sym).toBe('CODE11');
        expect(r.orientation).toBe('I');
        expect(r.above).toBe(true);
        expect(r.checkDigit).toBe(true);
    });

    // ============== INDUSTRIAL 2 OF 5 (^BI) ==============
    test('Industrial 2 of 5 emits ^BIo,h,f,g (no check digit) and round-trips', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const [{ BarcodeElement }, { ZPLParser }, { getBarcodeGeometry }] = await Promise.all([
                import('/src/elements/BarcodeElement.js'),
                import('/src/services/ZPLParser.js'),
                import('/src/utils/barcodeGeometry.js'),
            ]);
            const parser = new ZPLParser();
            // orientation I, printTextAbove true. ^BI has no e/check-digit param.
            const el: any = new BarcodeElement(10, 10, '1234567890', 50, 2, 3, '', true, false, 'INDUSTRIAL2OF5', false, 'I', true);
            const zpl = el.render();
            const parsed: any = parser.parse('^XA' + zpl + '^XZ').elements[0];
            const geom: any = getBarcodeGeometry({ type: 'BARCODE', symbology: 'INDUSTRIAL2OF5', previewData: '1234567890', ratio: 3, width: 2, showText: true } as any);
            return {
                emits: zpl.includes('^BII,50,Y,Y'),
                sym: parsed?.symbology,
                orientation: parsed?.orientation,
                above: parsed?.printTextAbove,
                checkDigit: parsed?.checkDigit,
                kind: geom?.kind,
                modules: geom?.modules,
            };
        });
        expect(r.emits).toBe(true);
        expect(r.sym).toBe('INDUSTRIAL2OF5');
        expect(r.orientation).toBe('I');
        expect(r.above).toBe(true);
        expect(r.checkDigit).toBe(false);
        expect(r.kind).toBe('linear');
        expect(r.modules).toBeGreaterThan(0);
    });

    // ============== STANDARD 2 OF 5 (^BJ) ==============
    test('Standard 2 of 5 emits ^BJo,h,f,g (no check digit) and round-trips', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const [{ BarcodeElement }, { ZPLParser }, { getBarcodeGeometry }] = await Promise.all([
                import('/src/elements/BarcodeElement.js'),
                import('/src/services/ZPLParser.js'),
                import('/src/utils/barcodeGeometry.js'),
            ]);
            const parser = new ZPLParser();
            // orientation I, printTextAbove true. ^BJ has no e/check-digit param.
            const el: any = new BarcodeElement(10, 10, '1234567890', 50, 2, 3, '', true, false, 'STANDARD2OF5', false, 'I', true);
            const zpl = el.render();
            const parsed: any = parser.parse('^XA' + zpl + '^XZ').elements[0];
            const geom: any = getBarcodeGeometry({ type: 'BARCODE', symbology: 'STANDARD2OF5', previewData: '1234567890', ratio: 3, width: 2, showText: true } as any);
            // Standard 2 of 5 has shorter start/stop bars than Industrial, so the same
            // data encodes to fewer modules (Labelary: 149 vs 159 for "1234567890").
            const industrial: any = getBarcodeGeometry({ type: 'BARCODE', symbology: 'INDUSTRIAL2OF5', previewData: '1234567890', ratio: 3, width: 2, showText: true } as any);
            return {
                emits: zpl.includes('^BJI,50,Y,Y'),
                sym: parsed?.symbology,
                orientation: parsed?.orientation,
                above: parsed?.printTextAbove,
                checkDigit: parsed?.checkDigit,
                kind: geom?.kind,
                modules: geom?.modules,
                industrialModules: industrial?.modules,
            };
        });
        expect(r.emits).toBe(true);
        expect(r.sym).toBe('STANDARD2OF5');
        expect(r.orientation).toBe('I');
        expect(r.above).toBe(true);
        expect(r.checkDigit).toBe(false);
        expect(r.kind).toBe('linear');
        expect(r.modules).toBe(149); // matches Labelary ^BJ for "1234567890"
        expect(r.modules).toBeLessThan(r.industrialModules); // shorter start/stop than ^BI
    });

    // ============== LOGMARS (^BL) ==============
    test('LOGMARS emits ^BLo,h,g (no f), forces the HRI on and the mandatory mod-43 check', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const [{ BarcodeElement }, { ZPLParser }, { getBarcodeGeometry, code39CheckChar }] = await Promise.all([
                import('/src/elements/BarcodeElement.js'),
                import('/src/services/ZPLParser.js'),
                import('/src/utils/barcodeGeometry.js'),
            ]);
            const parser = new ZPLParser();
            // orientation I, printTextAbove true. ^BL has no f param; check digit mandatory.
            const el: any = new BarcodeElement(10, 10, '12345', 80, 2, 3, '', true, false, 'LOGMARS', false, 'I', true);
            const zpl = el.render();
            const parsed: any = parser.parse('^XA' + zpl + '^XZ').elements[0];
            // Lowercase ^FD round-trips (printer uppercases); HRI is always on (no f to omit).
            const lower: any = parser.parse('^XA^FO0,0^BLN,80^FDlogmars^FS^XZ').elements[0];
            const geom: any = getBarcodeGeometry({ type: 'BARCODE', symbology: 'LOGMARS', previewData: '12345', ratio: 3, width: 2 } as any);
            // LOGMARS bars are identical to Code 39 with the mod-43 check digit on.
            const c39: any = getBarcodeGeometry({ type: 'BARCODE', symbology: 'CODE39', previewData: '12345', checkDigit: true, ratio: 3, width: 2 } as any);
            const c39NoCheck: any = getBarcodeGeometry({ type: 'BARCODE', symbology: 'CODE39', previewData: '12345', checkDigit: false, ratio: 3, width: 2 } as any);
            return {
                emits: zpl.includes('^BLI,80,Y'),
                hasNoFParam: !/\^BLI,80,Y,/.test(zpl), // only o,h,g — no trailing param after g
                sym: parsed?.symbology,
                orientation: parsed?.orientation,
                above: parsed?.printTextAbove,
                showText: parsed?.showText,
                checkDigit: parsed?.checkDigit,
                lowerShowText: lower?.showText,
                lowerAbove: lower?.printTextAbove,
                checkChar: code39CheckChar('12345'),
                modules: geom?.modules,
                code39CheckModules: c39?.modules,
                code39NoCheckModules: c39NoCheck?.modules,
            };
        });
        expect(r.emits).toBe(true);
        expect(r.hasNoFParam).toBe(true);
        expect(r.sym).toBe('LOGMARS');
        expect(r.orientation).toBe('I');
        expect(r.above).toBe(true);
        expect(r.showText).toBe(true);   // HRI always on
        expect(r.checkDigit).toBe(true); // mod-43 check mandatory
        expect(r.lowerShowText).toBe(true);
        expect(r.lowerAbove).toBe(false);
        expect(r.checkChar).toBe('F');   // mod-43 check digit for "12345"
        expect(r.modules).toBe(r.code39CheckModules);       // identical to Code 39 + check
        expect(r.modules).toBeGreaterThan(r.code39NoCheckModules); // wider than Code 39 without it
    });

    // ============== MSI (^BM) ==============
    test('MSI emits ^BMo,e,h,f with the check-digit mode and round-trips e + e2', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const [{ BarcodeElement }, { ZPLParser }, { msiCheckDigits }] = await Promise.all([
                import('/src/elements/BarcodeElement.js'),
                import('/src/services/ZPLParser.js'),
                import('/src/utils/barcodeGeometry.js'),
            ]);
            const parser = new ZPLParser();
            // mode C (2× mod-10), e2 (show check in HRI) on, orientation I, above true.
            const el: any = new BarcodeElement(10, 10, '1234567', 80, 2, 3, '', true, false, 'MSI', false, 'I', true, false, 'A', 'A', 'C', true);
            const zpl = el.render();
            const parsed: any = parser.parse('^XA' + zpl + '^XZ').elements[0];
            // default element (mode B, e2 off) emits a clean o,e,h,f with no trailing params.
            const def: any = new BarcodeElement(10, 10, '1234567', 50, 2, 3, '', true, false, 'MSI');
            return {
                emitsC: zpl.includes('^BMI,C,80,Y,Y,Y'), // o=I,e=C,h=80,f=Y,g=Y,e2=Y
                defEmit: def.render().includes('^BMN,B,50,Y^FD'),
                sym: parsed?.symbology,
                mode: parsed?.msiCheckMode,
                e2: parsed?.msiCheckInText,
                above: parsed?.printTextAbove,
                // check digits per mode (verified against bwip + Labelary)
                ckB: msiCheckDigits('1234567', 'B'),
                ckC: msiCheckDigits('1234567', 'C'),
                ckD: msiCheckDigits('80523', 'D'),
                ckA: msiCheckDigits('1234567', 'A'),
            };
        });
        expect(r.emitsC).toBe(true);
        expect(r.defEmit).toBe(true);
        expect(r.sym).toBe('MSI');
        expect(r.mode).toBe('C');
        expect(r.e2).toBe(true);
        expect(r.above).toBe(true);
        expect(r.ckB).toBe('4');    // 1 mod-10
        expect(r.ckC).toBe('41');   // 2 mod-10
        expect(r.ckD).toBe('83');   // mod-11 + mod-10 for "80523"
        expect(r.ckA).toBe('');     // no check digit
    });

    test('MSI check-digit mode widens the bars; e2 only changes the HRI', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const { getBarcodeGeometry } = await import('/src/utils/barcodeGeometry.js');
            const mod = (mode: string, checkInText = false) =>
                (getBarcodeGeometry({ type: 'BARCODE', symbology: 'MSI', previewData: '1234567', msiCheckMode: mode, msiCheckInText: checkInText, ratio: 3, width: 2 } as any) as any).modules;
            return { a: mod('A'), b: mod('B'), c: mod('C'), d: mod('D'), bE2: mod('B', true) };
        });
        // Verified against Labelary for "1234567": A=121, B=137, C=D=153.
        expect(r.a).toBe(121);
        expect(r.b).toBe(137);
        expect(r.c).toBe(153);
        expect(r.d).toBe(153);
        expect(r.a).toBeLessThan(r.b);
        expect(r.b).toBeLessThan(r.c);
        expect(r.bE2).toBe(r.b); // e2 (HRI insertion) does not change the bars
    });

    // ============== PLESSEY (^BP) ==============
    test('Plessey emits ^BPo,e,h,f,g and round-trips the print-check-digit (e) flag', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const [{ BarcodeElement }, { ZPLParser }, { plesseyCheckDigits }] = await Promise.all([
                import('/src/elements/BarcodeElement.js'),
                import('/src/services/ZPLParser.js'),
                import('/src/utils/barcodeGeometry.js'),
            ]);
            const parser = new ZPLParser();
            // e (print check digit) on, orientation R, interpretation line above on.
            const el: any = new BarcodeElement(10, 10, '12345', 80, 2, 3, '', true, false, 'PLESSEY', true, 'R', true);
            const zpl = el.render();
            const parsed: any = parser.parse('^XA' + zpl + '^XZ').elements[0];
            // default element (e off) emits a clean o,e,h,f with no trailing g.
            const def: any = new BarcodeElement(10, 10, '12345', 50, 2, 3, '', true, false, 'PLESSEY');
            return {
                emitsE: zpl.includes('^BPR,Y,80,Y,Y'), // o=R,e=Y,h=80,f=Y,g=Y
                defEmit: def.render().includes('^BPN,N,50,Y^FD'),
                sym: parsed?.symbology,
                check: parsed?.checkDigit,
                above: parsed?.printTextAbove,
                defCheck: parser.parse('^XA' + def.render() + '^XZ').elements[0]?.checkDigit,
                // hex CRC check chars (verified against bwip + Labelary)
                ck5: plesseyCheckDigits('12345'),
                ck7: plesseyCheckDigits('1234567'),
            };
        });
        expect(r.emitsE).toBe(true);
        expect(r.defEmit).toBe(true);
        expect(r.sym).toBe('PLESSEY');
        expect(r.check).toBe(true);
        expect(r.above).toBe(true);
        expect(r.defCheck).toBe(false);
        expect(r.ck5).toBe('6E'); // "12345" -> 6E
        expect(r.ck7).toBe('0A'); // "1234567" -> 0A
    });

    test('Plessey honours the ^BY ratio; the check-digit (e) flag only changes the HRI', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const { getBarcodeGeometry } = await import('/src/utils/barcodeGeometry.js');
            const mod = (data: string, ratio: number, checkDigit = false) =>
                (getBarcodeGeometry({ type: 'BARCODE', symbology: 'PLESSEY', previewData: data, ratio, width: 2, checkDigit } as any) as any).modules;
            return {
                r3: mod('12345', 3), r2: mod('12345', 2),
                seven: mod('1234567', 3), abc: mod('ABCDEF', 3),
                withCheck: mod('12345', 3, true),
            };
        });
        // Verified against Labelary: bar count scales with the ^BY ratio (the CRC check
        // chars are always in the bars, so e doesn't change the geometry).
        expect(r.r3).toBe(148);
        expect(r.r2).toBe(111);
        expect(r.seven).toBe(180);
        expect(r.abc).toBe(164);
        expect(r.withCheck).toBe(r.r3); // e (HRI insertion) does not change the bars
    });

    // ============== PLANET CODE (^B5) ==============
    test('Planet Code emits ^B5o,h,f,g and round-trips orientation + interpretation-above', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const [{ BarcodeElement }, { ZPLParser }] = await Promise.all([
                import('/src/elements/BarcodeElement.js'),
                import('/src/services/ZPLParser.js'),
            ]);
            const parser = new ZPLParser();
            // orientation R, interpretation line above on; plain o,h,f,g layout (no ratio/check).
            const el: any = new BarcodeElement(10, 10, '12345678901', 80, 2, 3, '', true, false, 'PLANET', false, 'R', true);
            const zpl = el.render();
            const parsed: any = parser.parse('^XA' + zpl + '^XZ').elements[0];
            const def: any = new BarcodeElement(10, 10, '12345678901', 50, 2, 3, '', true, false, 'PLANET');
            return {
                emits: zpl.includes('^B5R,80,Y,Y'), // o=R,h=80,f=Y,g=Y
                defEmit: def.render().includes('^B5N,50,Y^FD'),
                sym: parsed?.symbology,
                orient: parsed?.orientation,
                above: parsed?.printTextAbove,
            };
        });
        expect(r.emits).toBe(true);
        expect(r.defEmit).toBe(true);
        expect(r.sym).toBe('PLANET');
        expect(r.orient).toBe('R');
        expect(r.above).toBe(true);
    });

    test('Planet Code is height-modulated: uniform-width bars at two heights (tall + 0.4·h short)', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const { getBarcodeGeometry } = await import('/src/utils/barcodeGeometry.js');
            const g: any = getBarcodeGeometry({ type: 'BARCODE', symbology: 'PLANET', previewData: '12345678901', width: 2, ratio: 3 } as any);
            const round = (a: number[]) => [...new Set(a.map((v) => +v.toFixed(4)))].sort((x, y) => x - y);
            const g13: any = getBarcodeGeometry({ type: 'BARCODE', symbology: 'PLANET', previewData: '1234567890123', width: 2, ratio: 3 } as any);
            const gBad: any = getBarcodeGeometry({ type: 'BARCODE', symbology: 'PLANET', previewData: '12345', width: 2, ratio: 3 } as any);
            return {
                kind: g.kind,
                bars: g.bhs?.length,
                barHeights: round(g.bhs),  // tall vs short ratios
                barWidths: round(g.sbs),   // bar vs space module widths
                bars13: g13.bhs?.length,
                badKind: gBad.kind,        // 5 digits is invalid for Planet
            };
        });
        // Verified against Labelary for "12345678901": 62 bars, short bars = 0.4·tall,
        // bar width = ^BY width with the inter-bar space 1.5× wider (pitch = 2.5·^BY).
        expect(r.kind).toBe('linear');
        expect(r.bars).toBe(62);
        expect(r.barHeights).toEqual([0.4, 1]);
        expect(r.barWidths).toEqual([1, 1.5]);
        expect(r.bars13).toBe(72); // 13-digit variant
        expect(r.badKind).toBe('error'); // must be 11 or 13 digits
    });

    // ============== POSTNET (^BZ) ==============
    test('POSTNET emits ^BZo,h,f,g and round-trips orientation + interpretation-above', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const [{ BarcodeElement }, { ZPLParser }] = await Promise.all([
                import('/src/elements/BarcodeElement.js'),
                import('/src/services/ZPLParser.js'),
            ]);
            const parser = new ZPLParser();
            // orientation R, interpretation line above on; plain o,h,f,g layout (t=0 POSTNET omitted).
            const el: any = new BarcodeElement(10, 10, '12345', 80, 2, 3, '', true, false, 'POSTNET', false, 'R', true);
            const zpl = el.render();
            const parsed: any = parser.parse('^XA' + zpl + '^XZ').elements[0];
            const def: any = new BarcodeElement(10, 10, '12345', 50, 2, 3, '', true, false, 'POSTNET');
            return {
                emits: zpl.includes('^BZR,80,Y,Y'), // o=R,h=80,f=Y,g=Y
                defEmit: def.render().includes('^BZN,50,Y^FD'),
                sym: parsed?.symbology,
                orient: parsed?.orientation,
                above: parsed?.printTextAbove,
            };
        });
        expect(r.emits).toBe(true);
        expect(r.defEmit).toBe(true);
        expect(r.sym).toBe('POSTNET');
        expect(r.orient).toBe('R');
        expect(r.above).toBe(true);
    });

    test('POSTNET is height-modulated: uniform-width bars at two heights (tall + 0.4·h short)', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const { getBarcodeGeometry } = await import('/src/utils/barcodeGeometry.js');
            const round = (a: number[]) => [...new Set(a.map((v) => +v.toFixed(4)))].sort((x, y) => x - y);
            const g5: any = getBarcodeGeometry({ type: 'BARCODE', symbology: 'POSTNET', previewData: '12345', width: 2, ratio: 3 } as any);
            const g9: any = getBarcodeGeometry({ type: 'BARCODE', symbology: 'POSTNET', previewData: '123456789', width: 2, ratio: 3 } as any);
            const g11: any = getBarcodeGeometry({ type: 'BARCODE', symbology: 'POSTNET', previewData: '12345678901', width: 2, ratio: 3 } as any);
            const gBad: any = getBarcodeGeometry({ type: 'BARCODE', symbology: 'POSTNET', previewData: '1234', width: 2, ratio: 3 } as any);
            return {
                kind: g5.kind,
                bars5: g5.bhs?.length,
                barHeights: round(g5.bhs),  // tall vs short ratios
                barWidths: round(g5.sbs),   // bar vs space module widths
                bars9: g9.bhs?.length,
                bars11: g11.bhs?.length,
                badKind: gBad.kind,         // 4 digits is invalid for POSTNET
            };
        });
        // Verified against the POSTNET spec (frame + 5·n + 5-bar check + frame) and Labelary:
        // 5-digit ZIP = 32 bars, 9-digit ZIP+4 = 52, 11-digit DPBC = 62; short bars = 0.4·tall,
        // bar width = ^BY width with the inter-bar space 1.5× wider (pitch = 2.5·^BY; same family as ^B5 Planet).
        expect(r.kind).toBe('linear');
        expect(r.bars5).toBe(32);
        expect(r.barHeights).toEqual([0.4, 1]);
        expect(r.barWidths).toEqual([1, 1.5]);
        expect(r.bars9).toBe(52);
        expect(r.bars11).toBe(62);
        expect(r.badKind).toBe('error'); // must be 5, 9 or 11 digits
    });

    // ============== CODABAR (^BK) ==============
    test('Codabar emits ^BK with a fixed-N check digit and start/stop chars (o,e,h,f,g,k,l)', async () => {
        await elementsPanel.addBarcodeElement();
        await elementsPanel.selectElementByIndex(0);
        await propertiesPanel.setSelectValue('prop-symbology', 'CODABAR');
        // e is fixed N before height; default start/stop (A/A) omit the k/l params.
        await zplOutput.verifyZPLContains('^BKN,N,50,Y^FD');
        // Non-default start/stop emit k/l, which requires the g slot to be filled.
        await propertiesPanel.setSelectValue('prop-codabar-start', 'B');
        await propertiesPanel.setSelectValue('prop-codabar-stop', 'C');
        await zplOutput.verifyZPLContains('^BKN,N,50,Y,N,B,C');
    });

    test('Codabar encodes a linear symbol wrapped by its start/stop chars', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const { getBarcodeGeometry } = await import('/src/utils/barcodeGeometry.js');
            const geom = (startChar: string, stopChar: string) =>
                getBarcodeGeometry({ type: 'BARCODE', symbology: 'CODABAR', previewData: '12345', startChar, stopChar, showText: true, ratio: 3, width: 2 } as any) as any;
            const ok = geom('A', 'A');
            // The body must be digits / - $ : / . + only; letters can't encode -> fallback.
            const bad = getBarcodeGeometry({ type: 'BARCODE', symbology: 'CODABAR', previewData: 'AB', startChar: 'A', stopChar: 'A', showText: true } as any) as any;
            return { kind: ok.kind, modules: ok.modules, badKind: bad.kind };
        });
        expect(r.kind).toBe('linear');
        expect(r.modules).toBeGreaterThan(0);
        expect(r.badKind).not.toBe('linear'); // invalid body falls back, doesn't throw
    });

    test('Codabar round-trips orientation, printTextAbove and start/stop chars', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const [{ BarcodeElement }, { ZPLParser }] = await Promise.all([
                import('/src/elements/BarcodeElement.js'),
                import('/src/services/ZPLParser.js'),
            ]);
            const parser = new ZPLParser();
            // ctor: ...symbology, checkDigit, orientation, printTextAbove, fieldHex, startChar, stopChar
            const el: any = new BarcodeElement(10, 10, '1234567890', 50, 2, 3, '', true, false, 'CODABAR', false, 'I', true, false, 'B', 'C');
            const parsed: any = parser.parse('^XA' + el.render() + '^XZ').elements[0];
            return {
                sym: parsed?.symbology,
                orientation: parsed?.orientation,
                above: parsed?.printTextAbove,
                startChar: parsed?.startChar,
                stopChar: parsed?.stopChar,
            };
        });
        expect(r.sym).toBe('CODABAR');
        expect(r.orientation).toBe('I');
        expect(r.above).toBe(true);
        expect(r.startChar).toBe('B');
        expect(r.stopChar).toBe('C');
    });

    // ============== UPC/EAN EXTENSION (^BS) ==============
    test('UPC/EAN extension picks the 2- vs 5-digit add-on by data length and left-pads/truncates', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const { normalizeUpcEanExt, getBarcodeGeometry } = await import('/src/utils/barcodeGeometry.js');
            const modules = (d: string) =>
                (getBarcodeGeometry({ type: 'BARCODE', symbology: 'UPCEANEXT', previewData: d, showText: true, width: 2 } as any) as any).modules;
            return {
                pad1: normalizeUpcEanExt('7'),        // ≤2 -> 2-digit, left-padded
                keep2: normalizeUpcEanExt('12'),
                pad3: normalizeUpcEanExt('123'),      // ≥3 -> 5-digit, left-padded
                keep5: normalizeUpcEanExt('12345'),
                trunc6: normalizeUpcEanExt('123456'), // overflow keeps the leftmost 5
                letters: normalizeUpcEanExt('1a'),    // non-digits -> '0'
                mod2: modules('12'),
                mod5: modules('12345'),
            };
        });
        expect(r.pad1).toBe('07');
        expect(r.keep2).toBe('12');
        expect(r.pad3).toBe('00123');
        expect(r.keep5).toBe('12345');
        expect(r.trunc6).toBe('12345');
        expect(r.letters).toBe('10');
        expect(r.mod5).toBeGreaterThan(r.mod2); // the 5-digit add-on is wider than the 2-digit
    });

    test('^BS interpretation line defaults above (g=Y) when omitted; round-trips otherwise', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const [{ BarcodeElement }, { ZPLParser }] = await Promise.all([
                import('/src/elements/BarcodeElement.js'),
                import('/src/services/ZPLParser.js'),
            ]);
            const parser = new ZPLParser();
            const aboveOmitted: any = parser.parse('^XA^FO10,10^BY2^BSN,80,Y^FD12345^FS^XZ').elements[0];
            const belowExplicit: any = parser.parse('^XA^FO10,10^BY2^BSN,80,Y,N^FD12345^FS^XZ').elements[0];
            // Element render() always emits g explicitly, so canvas and Labelary agree.
            const el: any = new BarcodeElement(10, 10, '12', 50, 2, 2, '', true, false, 'UPCEANEXT', false, 'N', false);
            return {
                sym: aboveOmitted?.symbology,
                omittedAbove: aboveOmitted?.printTextAbove,
                belowExplicit: belowExplicit?.printTextAbove,
                emittedG: el.render().includes('^BSN,50,Y,N'),
            };
        });
        expect(r.sym).toBe('UPCEANEXT');
        expect(r.omittedAbove).toBe(true);   // ^BS g default is Y (above)
        expect(r.belowExplicit).toBe(false); // explicit ,N keeps it below
        expect(r.emittedG).toBe(true);       // g is always emitted for ^BS
    });

    // ============== ORIENTATION + INTERPRETATION LINE ABOVE ==============
    test.describe('orientation and interpretation line above', () => {
        // Per symbology, the expected command once orientation=R and
        // "interpretation line above" (g) are both enabled.
        const cases = [
            { symbology: 'CODE128', expected: '^BCR,50,Y,Y' },
            { symbology: 'CODE39', expected: '^B3R,N,50,Y,Y' },
            { symbology: 'CODE93', expected: '^BAR,50,Y,Y' },
            { symbology: 'CODE11', expected: '^B1R,N,50,Y,Y' },
            { symbology: 'CODABAR', expected: '^BKR,N,50,Y,Y' },
            { symbology: 'INDUSTRIAL2OF5', expected: '^BIR,50,Y,Y' },
            { symbology: 'STANDARD2OF5', expected: '^BJR,50,Y,Y' },
            { symbology: 'LOGMARS', expected: '^BLR,50,Y' }, // ^BL has no f param: o,h,g
            { symbology: 'MSI', expected: '^BMR,B,50,Y,Y' }, // o,e,h,f,g — e defaults B
            { symbology: 'PLESSEY', expected: '^BPR,N,50,Y,Y' }, // o,e,h,f,g — e defaults N
            { symbology: 'PLANET', expected: '^B5R,50,Y,Y' }, // o,h,f,g — no ratio/check param
            { symbology: 'POSTNET', expected: '^BZR,50,Y,Y' }, // o,h,f,g — t=0 POSTNET omitted
            { symbology: 'EAN13', expected: '^BER,50,Y,Y' },
            { symbology: 'EAN8', expected: '^B8R,50,Y,Y' },
            { symbology: 'UPCA', expected: '^BUR,50,Y,Y' },
            { symbology: 'UPCE', expected: '^B9R,50,Y,Y' },
            { symbology: 'UPCEANEXT', expected: '^BSR,50,Y,Y' },
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

    test('MSI exposes the check-digit mode select + HRI-insertion toggle (not the generic check toggle)', async () => {
        await elementsPanel.addBarcodeElement();
        await elementsPanel.selectElementByIndex(0);
        await propertiesPanel.setSelectValue('prop-symbology', 'MSI');
        // MSI uses a 4-way mode select + an e2 toggle, not the boolean check-digit toggle.
        await expect(propertiesPanel.panel.locator('#prop-msi-check-mode')).toBeVisible();
        await expect(propertiesPanel.panel.locator('#prop-msi-check-intext')).toHaveCount(1);
        await expect(propertiesPanel.panel.locator('#prop-check-digit')).toHaveCount(0);
        // Selecting mode C (2× mod-10) flows into the emitted ^BM e param.
        await propertiesPanel.setSelectValue('prop-msi-check-mode', 'C');
        await zplOutput.verifyZPLContains('^BMN,C,');
    });

    test('Plessey exposes the ratio input + a print-check-digit toggle that drives the ^BP e param', async () => {
        await elementsPanel.addBarcodeElement();
        await elementsPanel.selectElementByIndex(0);
        await propertiesPanel.setSelectValue('prop-symbology', 'PLESSEY');
        // Plessey is ratio-bearing and uses the generic boolean check-digit toggle (not MSI's mode select).
        await expect(propertiesPanel.panel.locator('#prop-ratio')).toBeVisible();
        await expect(propertiesPanel.panel.locator('#prop-check-digit')).toHaveCount(1);
        await expect(propertiesPanel.panel.locator('#prop-msi-check-mode')).toHaveCount(0);
        // Off by default -> e=N; toggling it on flips the e param to Y.
        await zplOutput.verifyZPLContains('^BPN,N,');
        await propertiesPanel.panel.locator('#prop-check-digit').check({ force: true });
        await zplOutput.verifyZPLContains('^BPN,Y,');
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
                upcePad: normalizeBarcodeData('UPCE', '12'),
                upceTruncate: normalizeBarcodeData('UPCE', '1234567'),
                passthrough: normalizeBarcodeData('CODE128', 'abc'),
            };
        });
        expect(cases.ean13Pad).toBe('000000000123');
        expect(cases.ean13Truncate).toBe('567890123456');
        expect(cases.ean13NonDigit).toBe('120450780010');
        expect(cases.ean8Pad).toBe('0000012');     // 7-digit field, left-padded
        expect(cases.ean8Truncate).toBe('3456789'); // keeps the trailing 7
        expect(cases.upcaPad).toBe('00000000012');
        expect(cases.upcePad).toBe('000012');      // 6-digit field, left-padded
        expect(cases.upceTruncate).toBe('234567'); // keeps the trailing 6
        expect(cases.passthrough).toBe('abc');
    });

    test('UPC-E prepends the fixed 0 number-system digit and encodes guard bars + HRI', async ({ page }) => {
        // ^B9 takes 6 digits; the number system is fixed at 0 and the printer computes
        // the trailing check digit. Labelary renders ^FD123456 as "0 123456 5"; bwip's
        // `upce` needs the 7-digit form, so buildBwipOptions prepends the 0. Assert the
        // geometry is a guard-bar linear symbol whose HRI fragments are exactly that.
        const r = await page.evaluate(async () => {
            const { getBarcodeGeometry } = await import('/src/utils/barcodeGeometry.js');
            const g: any = getBarcodeGeometry({ type: 'BARCODE', symbology: 'UPCE', previewData: '123456', showText: true, width: 2 });
            return {
                kind: g.kind,
                hasGuardBars: Array.isArray(g.bhs) && g.bhs.some((v: number) => v > 1),
                fragments: Array.isArray(g.txt) ? g.txt.map((t: any[]) => t[0]).join('') : null,
            };
        });
        expect(r.kind).toBe('linear');
        expect(r.hasGuardBars).toBe(true);
        expect(r.fragments).toBe('01234565'); // number-system 0 + 123456 + check 5
    });

    // ============== MICRO-PDF417 (^BF) ==============
    test('Micro-PDF417 maps the ^BF mode to a fixed rows×columns variant and round-trips', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const [{ QRCodeElement }, { ZPLParser }, geo] = await Promise.all([
                import('/src/elements/QRCodeElement.js'),
                import('/src/services/ZPLParser.js'),
                import('/src/utils/barcodeGeometry.js'),
            ]);
            // ctor: ...symbology, moduleSize, quality, moduleWidth, rowHeight, securityLevel,
            //       columns, aztecSizeMode, aztecErrorControl, aztecLayers, fieldHex, microPdfMode
            const make = (mode: number) =>
                new QRCodeElement(10, 10, '12345', 2, 5, 'Q', '', false, 'MICROPDF417', 4, 200, 2, 4, 5, 0, 'auto', 0, 0, false, mode);
            const cols = (mode: number) => {
                const g: any = geo.getBarcodeGeometry(make(mode));
                return g.kind === 'matrix' ? g.cols : -1;
            };
            const parser = new ZPLParser();
            const zpl = make(7).render();
            const parsed: any = parser.parse('^XA' + zpl + '^XZ').elements[0];
            return {
                versionMode0: geo.microPdf417Version(0),   // 1 col × 11 rows
                versionMode33: geo.microPdf417Version(33), // 4 cols × 44 rows
                zplHasMode: zpl.includes('^BY2^BFN,4,7'),
                cols1: cols(0),   // 1 data column (narrowest)
                cols4: cols(33),  // 4 data columns (widest)
                sym: parsed?.symbology,
                mode: parsed?.microPdfMode,
                data: parsed?.previewData,
            };
        });
        expect(r.versionMode0).toBe('11x1');
        expect(r.versionMode33).toBe('44x4');
        expect(r.zplHasMode).toBe(true);
        expect(r.cols1).toBeGreaterThan(0);
        expect(r.cols4).toBeGreaterThan(r.cols1); // more data columns -> wider symbol
        expect(r.sym).toBe('MICROPDF417');
        expect(r.mode).toBe(7);
        expect(r.data).toBe('12345');
    });

    // ============== CODE 49 (^B4) ==============
    test('Code 49 emits ^B4o,h,f,m (f fixed N), encodes a stacked matrix, and round-trips mode', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const [{ QRCodeElement }, { ZPLParser }, geo] = await Promise.all([
                import('/src/elements/QRCodeElement.js'),
                import('/src/services/ZPLParser.js'),
                import('/src/utils/barcodeGeometry.js'),
            ]);
            // ctor: ...symbology, moduleSize, quality, moduleWidth, rowHeight, securityLevel,
            //       columns, aztecSizeMode, aztecErrorControl, aztecLayers, fieldHex, microPdfMode, code49Mode
            const make = (mode: string, data = 'CODE 49') =>
                new QRCodeElement(10, 10, data, 2, 5, 'Q', '', false, 'CODE49', 4, 200, 3, 6, 5, 0, 'auto', 0, 0, false, 0, mode);
            const parser = new ZPLParser();
            const zpl = make('2').render();
            const parsed: any = parser.parse('^XA' + zpl + '^XZ').elements[0];
            const def: any = make('A');
            const g: any = geo.getBarcodeGeometry(make('A'));
            const gBad: any = geo.getBarcodeGeometry(make('A', ''));
            return {
                // ^BY module width then ^B4 with o=N, h=rowHeight, f=N, m=2
                emits: zpl.includes('^BY3^B4N,6,N,2'),
                defEmits: def.render().includes('^BY3^B4N,6,N,A'), // default starting mode A
                kind: g.kind,
                cols: g.cols,
                rows: g.rows,
                badKind: gBad.kind, // empty data fails to encode
                type: parsed?.type,
                sym: parsed?.symbology,
                mode: parsed?.code49Mode,
                mw: parsed?.moduleWidth,
                rh: parsed?.rowHeight,
                data: parsed?.previewData,
            };
        });
        expect(r.emits).toBe(true);
        expect(r.defEmits).toBe(true);
        expect(r.kind).toBe('matrix'); // Code 49 is stacked: bwip emits a module matrix
        expect(r.cols).toBeGreaterThan(0);
        expect(r.rows).toBeGreaterThan(1); // multiple stacked rows
        expect(r.badKind).toBe('error');
        expect(r.type).toBe('QRCODE');
        expect(r.sym).toBe('CODE49');
        expect(r.mode).toBe('2');
        expect(r.mw).toBe(3);
        expect(r.rh).toBe(6);
        expect(r.data).toBe('CODE 49');
    });

    // ============== GS1 DATABAR (^BR) ==============
    test('GS1 DataBar emits ^BRN,t,m,2,h, encodes linear/stacked per variant, and round-trips', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const [{ QRCodeElement }, { ZPLParser }, geo] = await Promise.all([
                import('/src/elements/QRCodeElement.js'),
                import('/src/services/ZPLParser.js'),
                import('/src/utils/barcodeGeometry.js'),
            ]);
            // ctor: ...symbology, ..., microPdfMode, code49Mode, codablockMode, maxicodeMode, databarType
            const make = (type: string, data: string) =>
                new QRCodeElement(10, 10, data, 2, 5, 'Q', '', false, 'GS1DATABAR', 4, 200, 2, 40, 5, 0, 'auto', 0, 0, false, 0, 'A', 'F', '4', type);
            const parser = new ZPLParser();
            const omni = make('omni', '0001234567890');
            const omniZpl = omni.render();
            const omniParsed: any = parser.parse('^XA' + omniZpl + '^XZ').elements[0];
            const omniGeom: any = geo.getBarcodeGeometry(omni);
            const stackedGeom: any = geo.getBarcodeGeometry(make('stackedomni', '0001234567890'));
            const expandedGeom: any = geo.getBarcodeGeometry(make('expanded', '(01)00012345678905(3103)001234'));
            return {
                omniEmits: omniZpl.includes('^BRN,1,5,2,40'),
                stackedEmits: make('stacked', '0001234567890').render().includes('^BRN,3,'),
                omniKind: omniGeom.kind,
                omniNoBhs: omniGeom.bhs == null, // full-height bars (Labelary ^BR h)
                stackedKind: stackedGeom.kind,
                expandedKind: expandedGeom.kind,
                type: omniParsed?.type,
                sym: omniParsed?.symbology,
                dbType: omniParsed?.databarType,
                mag: omniParsed?.magnification,
                h: omniParsed?.rowHeight,
            };
        });
        expect(r.omniEmits).toBe(true);
        expect(r.stackedEmits).toBe(true);
        expect(r.omniKind).toBe('linear');
        expect(r.omniNoBhs).toBe(true);
        expect(r.stackedKind).toBe('matrix'); // stacked variants encode as a module matrix
        expect(r.expandedKind).toBe('linear');
        expect(r.type).toBe('QRCODE');
        expect(r.sym).toBe('GS1DATABAR');
        expect(r.dbType).toBe('omni');
        expect(r.mag).toBe(5);
        expect(r.h).toBe(40);
    });

    // ============== MAXICODE (^BD) ==============
    test('MaxiCode emits ^BDm,1,1, encodes the hex grid, and round-trips mode', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const [{ QRCodeElement }, { ZPLParser }, geo] = await Promise.all([
                import('/src/elements/QRCodeElement.js'),
                import('/src/services/ZPLParser.js'),
                import('/src/utils/barcodeGeometry.js'),
            ]);
            // ctor: ...symbology, ..., fieldHex, microPdfMode, code49Mode, codablockMode, maxicodeMode
            const make = (mode: string, data = 'This is a test') =>
                new QRCodeElement(10, 10, data, 2, 6, 'Q', '', false, 'MAXICODE', 4, 200, 2, 4, 5, 0, 'auto', 0, 0, false, 0, 'A', 'F', mode);
            const parser = new ZPLParser();
            const zpl = make('5').render();
            const parsed: any = parser.parse('^XA' + zpl + '^XZ').elements[0];
            const def: any = make('4');
            const g: any = geo.getBarcodeGeometry(make('4'));
            return {
                emits: zpl.includes('^BD5,1,1'),
                defEmits: def.render().includes('^BD4,1,1'), // default mode 4 (standard)
                kind: g.kind,
                cols: g.cols,
                rows: g.rows,
                moduleCount: g.modules?.length,
                type: parsed?.type,
                sym: parsed?.symbology,
                mode: parsed?.maxicodeMode,
                data: parsed?.previewData,
            };
        });
        expect(r.emits).toBe(true);
        expect(r.defEmits).toBe(true);
        expect(r.kind).toBe('maxicode');
        expect(r.cols).toBe(30);
        expect(r.rows).toBe(33);
        expect(r.moduleCount).toBeGreaterThan(0);
        expect(r.type).toBe('QRCODE');
        expect(r.sym).toBe('MAXICODE');
        expect(r.mode).toBe('5');
        expect(r.data).toBe('This is a test');
    });

    // ============== CODABLOCK (^BB) ==============
    test('Codablock emits ^BBN,h,N,,,m, encodes a stacked matrix, and round-trips mode', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const [{ QRCodeElement }, { ZPLParser }, geo] = await Promise.all([
                import('/src/elements/QRCodeElement.js'),
                import('/src/services/ZPLParser.js'),
                import('/src/utils/barcodeGeometry.js'),
            ]);
            // ctor: ...symbology, moduleSize, quality, moduleWidth, rowHeight, securityLevel,
            //       columns, aztecSizeMode, aztecErrorControl, aztecLayers, fieldHex, microPdfMode, code49Mode, codablockMode
            const make = (mode: string, data = 'Codablock') =>
                new QRCodeElement(10, 10, data, 2, 5, 'Q', '', false, 'CODABLOCK', 4, 200, 3, 8, 5, 0, 'auto', 0, 0, false, 0, 'A', mode);
            const parser = new ZPLParser();
            const zpl = make('E').render();
            const parsed: any = parser.parse('^XA' + zpl + '^XZ').elements[0];
            const def: any = make('F');
            const g: any = geo.getBarcodeGeometry(make('F'));
            return {
                // ^BY module width then ^BB with o=N, h=rowHeight, s=N, c/r blank, m=E
                emits: zpl.includes('^BY3^BBN,8,N,,,E'),
                defEmits: def.render().includes('^BY3^BBN,8,N,,,F'), // default mode F
                kind: g.kind,
                cols: g.cols,
                rows: g.rows,
                type: parsed?.type,
                sym: parsed?.symbology,
                mode: parsed?.codablockMode,
                mw: parsed?.moduleWidth,
                rh: parsed?.rowHeight,
                data: parsed?.previewData,
            };
        });
        expect(r.emits).toBe(true);
        expect(r.defEmits).toBe(true);
        expect(r.kind).toBe('matrix'); // Codablock is stacked: bwip emits a module matrix
        expect(r.cols).toBeGreaterThan(0);
        expect(r.rows).toBeGreaterThan(1); // multiple stacked rows
        expect(r.type).toBe('QRCODE');
        expect(r.sym).toBe('CODABLOCK');
        expect(r.mode).toBe('E');
        expect(r.mw).toBe(3);
        expect(r.rh).toBe(8);
        expect(r.data).toBe('Codablock');
    });

    // Guards the local bwip-js patch (see src/vendor/PATCHES.md): bwipp_micropdf417's
    // numeric-compaction threshold is lowered so an all-digit ^FD uses numeric
    // compaction like Zebra/Labelary. Stock bwip uses text compaction for short
    // all-digit data, which both mis-encodes the bars AND overflows the 1-column
    // variant for 7 digits (encode error -> kind !== 'matrix'). If a future re-vendor
    // drops the patch, this test fails.
    test('Micro-PDF417 uses numeric compaction for all-digit data (vendor patch guard)', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const geo = await import('/src/utils/barcodeGeometry.js');
            const { QRCodeElement } = await import('/src/elements/QRCodeElement.js');
            // mode 0 = 1 data column × 11 rows (the narrowest, lowest-capacity variant).
            const make = (data: string) =>
                new QRCodeElement(10, 10, data, 2, 5, 'Q', '', false, 'MICROPDF417', 4, 200, 2, 4, 5, 0, 'auto', 0, 0, false, 0);
            const kind = (data: string) => (geo.getBarcodeGeometry(make(data)) as any).kind;
            return { sevenDigits: kind('1234567'), alpha: kind('ABCDE') };
        });
        // Numeric compaction packs 7 digits into the 1-column variant; text would overflow.
        expect(r.sevenDigits).toBe('matrix');
        expect(r.alpha).toBe('matrix');
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
                make1D('CODE93', 'CODE93'),
                make1D('123456', 'CODE11'),
                make1D('1234567890', 'CODABAR'),
                make1D('1234567890', 'INDUSTRIAL2OF5'),
                make1D('1234567890', 'STANDARD2OF5'),
                make1D('LOGMARS', 'LOGMARS'),
                make1D('1234567', 'MSI'),
                make1D('12345', 'PLESSEY'),
                make1D('12345678901', 'PLANET'),
                make1D('12345', 'POSTNET'),
                make1D('123456789012', 'EAN13'),
                make1D('1234567', 'EAN8'),
                make1D('12345678901', 'UPCA'),
                make1D('123456', 'UPCE'),
                make1D('12345', 'UPCEANEXT'),
                make2D('https://example.com', 'QR'),
                make2D('Data Matrix', 'DATAMATRIX'),
                make2D('PDF417', 'PDF417'),
                make2D('12345', 'MICROPDF417'),
                make2D('Aztec', 'AZTEC'),
                make2D('CODE 49', 'CODE49'),
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
