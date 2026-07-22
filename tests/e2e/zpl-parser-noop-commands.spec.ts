import { test, expect } from '../fixtures';

test.describe('ZPL parser supported no-op commands', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('native variable and clock commands do not produce warnings', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const { ZPLParser } = await import('/src/services/ZPLParser.js');
            const zpl = '^XA^FC%,&^SO1^FO10,10^FN1^FE^A0N,30,30^FDExample^FS^XZ';
            return new ZPLParser().parse(zpl, { dpmm: 8, labelHeight: 50 });
        });

        expect(result.warnings).toEqual([]);
        expect(result.elements).toHaveLength(1);
    });
});
