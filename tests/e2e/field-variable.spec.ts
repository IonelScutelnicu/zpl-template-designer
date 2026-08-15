import { test, expect } from '../fixtures';

/**
 * Coverage for ^FV (Field Variable).
 *
 * ^FV delimits its data exactly like ^FD and prints identically, so a
 * single-label preview cannot tell them apart. The difference is what the
 * printer does afterwards: it clears a ^FV field and retains a ^FD one, which
 * is what lets ^MC map retention replace only the variable parts of a kept
 * label bitmap between prints. Rewriting ^FV to ^FD on import would therefore
 * break a workflow without changing a single pixel — hence these tests.
 */

/** Parse ZPL in-page and re-render each element back to ZPL. */
async function roundTrip(page: any, zpl: string) {
    return await page.evaluate(async (src: string) => {
        const [{ ZPLParser }, { SerializationService }] = await Promise.all([
            import('/src/services/ZPLParser.js'),
            import('/src/services/SerializationService.js'),
        ]);
        const parsed = new ZPLParser().parse(src, { dpmm: 8, labelHeight: 50 });
        const serializer = new SerializationService();
        return {
            warnings: parsed.warnings.map((w: any) => w.command),
            elements: parsed.elements.map((e: any) => ({
                type: e.type,
                fieldDataCommand: e.fieldDataCommand,
                zpl: serializer.createElementFromData(e)?.render(),
            })),
        };
    }, zpl);
}

test.describe('^FV field variable', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('a ^FV field is modelled, not preserved as RAW, and warns about nothing', async ({ page }) => {
        const { warnings, elements } = await roundTrip(page, '^XA^FO55,60^A0N,25^FVVARIABLE^FS^XZ');
        expect(warnings).toEqual([]);
        expect(elements).toHaveLength(1);
        expect(elements[0].type).toBe('TEXT');
    });

    test('^FV survives the round trip and ^FD is left alone', async ({ page }) => {
        const { elements } = await roundTrip(
            page,
            '^XA^FO55,60^A0N,25^FVVARIABLE^FS^FO80,150^A0N,25^FDFIXED^FS^XZ'
        );
        expect(elements[0].fieldDataCommand).toBe('FV');
        expect(elements[0].zpl).toContain('^FVVARIABLE');
        // Absent, not 'FD': a field that never said ^FV carries no flag at all,
        // so existing templates keep rendering exactly as they did.
        expect(elements[1].fieldDataCommand).toBeUndefined();
        expect(elements[1].zpl).toContain('^FDFIXED');
    });

    test('barcodes and blocks carry the flag too', async ({ page }) => {
        const { elements } = await roundTrip(
            page,
            '^XA^FO10,10^BY2^BCN,50,Y^FV12345678^FS'
            + '^FO10,80^A0N,25^FB200,2,0,L^FVblock^FS'
            + '^FO10,150^GS N,25,25^FVA^FS^XZ'
        );
        expect(elements.map((e: any) => e.fieldDataCommand)).toEqual(['FV', 'FV', 'FV']);
        expect(elements[0].zpl).toContain('^FV');
        expect(elements[1].zpl).toContain('^FVblock');
        expect(elements[2].zpl).toContain('^FVA');
    });

    test('the flag survives serialization, so copy/paste and saved templates keep it', async ({ page }) => {
        const zpl = await page.evaluate(async () => {
            const [{ ZPLParser }, { SerializationService }] = await Promise.all([
                import('/src/services/ZPLParser.js'),
                import('/src/services/SerializationService.js'),
            ]);
            const serializer = new SerializationService();
            const parsed = new ZPLParser().parse('^XA^FO55,60^A0N,25^FVVARIABLE^FS^XZ', { dpmm: 8, labelHeight: 50 });
            const element: any = serializer.createElementFromData(parsed.elements[0]);
            // The path copy/paste, Drive saves and share URLs all take.
            const copy: any = serializer.createElementFromData(serializer.serializeElement(element));
            return copy.render();
        });
        expect(zpl).toContain('^FVVARIABLE');
    });

    test('^FV inside an unsupported field stays verbatim in the RAW text', async ({ page }) => {
        const { elements } = await roundTrip(page, '^XA^FO10,10^CVY^BCN,50,Y^FV123456^FS^XZ');
        expect(elements).toHaveLength(1);
        expect(elements[0].type).toBe('RAW');
        expect(elements[0].zpl).toContain('^FV123456');
    });

    test('a second data command wins, and decides the command re-emitted', async ({ page }) => {
        // The printer overwrites the field with the last ^FD/^FV it reads, so the
        // content and the retention behaviour both come from that same token —
        // reading the content from one and the command from another would turn a
        // retained field into a variable one (or the reverse).
        const result = await page.evaluate(async () => {
            const [{ ZPLParser }, { SerializationService }] = await Promise.all([
                import('/src/services/ZPLParser.js'),
                import('/src/services/SerializationService.js'),
            ]);
            const serializer = new SerializationService();
            const render = (zpl: string) => {
                const parsed = new ZPLParser().parse(zpl, { dpmm: 8, labelHeight: 50 });
                const element: any = serializer.createElementFromData(parsed.elements[0]);
                return { content: element.content, zpl: element.render() };
            };
            return {
                fvThenFd: render('^XA^FO10,10^A0N,25^FVold^FDnew^FS^XZ'),
                fdThenFv: render('^XA^FO10,10^A0N,25^FDold^FVnew^FS^XZ'),
            };
        });

        expect(result.fvThenFd.content).toBe('new');
        expect(result.fvThenFd.zpl).toContain('^FDnew');
        expect(result.fvThenFd.zpl).not.toContain('^FV');

        expect(result.fdThenFv.content).toBe('new');
        expect(result.fdThenFv.zpl).toContain('^FVnew');
    });
});
