import { test, expect } from '../fixtures';

test.describe('^SN serialization field', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('imports the starting value and preserves serial settings on export', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const [{ ZPLParser }, { SerializationService }] = await Promise.all([
                import('/src/services/ZPLParser.js'),
                import('/src/services/SerializationService.js'),
            ]);
            const parsed = new ZPLParser().parse(
                '^XA^FO20,30^A0N,25^SN0405288,3,Y^FS^XZ',
                { dpmm: 8, labelHeight: 50 }
            );
            const element: any = new SerializationService().createElementFromData(parsed.elements[0]);
            return {
                content: element.content,
                command: element.fieldDataCommand,
                increment: element.serialIncrement,
                preserveLeadingZeros: element.serialPreserveLeadingZeros,
                zpl: element.render(),
                warnings: parsed.warnings,
            };
        });

        expect(result.content).toBe('0405288');
        expect(result.command).toBe('SN');
        expect(result.increment).toBe(3);
        expect(result.preserveLeadingZeros).toBe(true);
        expect(result.zpl).toContain('^SN0405288,3,Y^FS');
        expect(result.warnings).toEqual([]);
    });

    test('the last field-data command still wins', async ({ page }) => {
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
                serialThenFixed: render('^XA^FO10,10^A0N,25^SN0001,1,Y^FDfixed^FS^XZ'),
                fixedThenSerial: render('^XA^FO10,10^A0N,25^FDfixed^SN0001,1,Y^FS^XZ'),
            };
        });

        expect(result.serialThenFixed).toEqual(expect.objectContaining({ content: 'fixed' }));
        expect(result.serialThenFixed.zpl).toContain('^FDfixed');
        expect(result.fixedThenSerial).toEqual(expect.objectContaining({ content: '0001' }));
        expect(result.fixedThenSerial.zpl).toContain('^SN0001,1,Y');
    });
});
