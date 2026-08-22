import { test, expect } from '../fixtures';

test.describe('ZPL field-data whitespace', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('preserves the leading space in the supplied ^FD template', async ({ page }) => {
        const contents = await page.evaluate(async () => {
            const { ZPLParser } = await import('/src/services/ZPLParser.js');
            const parsed = new ZPLParser().parse([
                '^XA',
                '^LL280',
                '^FT20,120^A0N,30,20,^FDACME^FS',
                '^FT^A0N,30,20,^FD Summer^FS',
                '^XZ',
            ].join('\n'));

            return parsed.elements.map((element: any) => element.content);
        });

        expect(contents).toEqual(['ACME', ' Summer']);
    });

    test('round-trips leading and trailing spaces for ^FD and ^FV', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const [{ ZPLParser }, { SerializationService }] = await Promise.all([
                import('/src/services/ZPLParser.js'),
                import('/src/services/SerializationService.js'),
            ]);
            const parser = new ZPLParser();
            const serializer = new SerializationService();
            const parsed = parser.parse(
                '^XA^FO10,10^A0N,25^FD  fixed  ^FS'
                + '^FO10,50^A0N,25^FV  variable  ^FS^XZ'
            );
            const rendered = parsed.elements.map((data: any) =>
                serializer.createElementFromData(data)?.render()
            );
            const reparsed = rendered.map((zpl: string) =>
                parser.parse(`^XA${zpl}^XZ`).elements[0]
            );

            return {
                parsed: parsed.elements.map((element: any) => element.content),
                rendered,
                reparsed: reparsed.map((element: any) => ({
                    content: element.content,
                    fieldDataCommand: element.fieldDataCommand,
                })),
            };
        });

        expect(result.parsed).toEqual(['  fixed  ', '  variable  ']);
        expect(result.rendered[0]).toContain('^FD  fixed  ^FS');
        expect(result.rendered[1]).toContain('^FV  variable  ^FS');
        expect(result.reparsed).toEqual([
            { content: '  fixed  ', fieldDataCommand: undefined },
            { content: '  variable  ', fieldDataCommand: 'FV' },
        ]);
    });
});
