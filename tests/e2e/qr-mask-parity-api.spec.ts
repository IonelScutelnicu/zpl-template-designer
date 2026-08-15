import { test, expect } from '../fixtures';
import { waitForRateLimit } from '../fixtures/rate-limiter';
import { PNG } from 'pngjs';

const DPMM = 8;
const LABEL_WIDTH_IN = 6;
const LABEL_HEIGHT_IN = 1;
const MAGNIFICATION = 5;
const FIELD_X = 20;
const FIELD_Y = 20;
const FIELD_STEP = 130;

async function renderLabelary(page: any, zpl: string): Promise<Buffer> {
    for (let attempt = 0; attempt < 7; attempt++) {
        await waitForRateLimit();
        const result = await page.evaluate(async ({ zpl, dpmm, width, height }: any) => {
            const response = await fetch(
                `https://api.labelary.com/v1/printers/${dpmm}dpmm/labels/${width}x${height}/0/`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: zpl,
                },
            );
            if (response.status === 429) return { retry: true };
            if (!response.ok) throw new Error(`Labelary ${response.status}: ${await response.text()}`);
            const bytes = new Uint8Array(await response.arrayBuffer());
            let binary = '';
            for (const byte of bytes) binary += String.fromCharCode(byte);
            return { base64: btoa(binary) };
        }, { zpl, dpmm: DPMM, width: LABEL_WIDTH_IN, height: LABEL_HEIGHT_IN });

        if (result.base64) return Buffer.from(result.base64, 'base64');
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
    throw new Error('Labelary rate limit exceeded after 7 attempts');
}

function modulesAt(png: PNG, fieldIndex: number): string {
    const left = FIELD_X + fieldIndex * FIELD_STEP;
    // Labelary places ^BQ's matrix 10 dots below ^FO.
    const top = FIELD_Y + 10;
    let modules = '';
    for (let row = 0; row < 21; row++) {
        for (let col = 0; col < 21; col++) {
            const x = left + col * MAGNIFICATION + Math.floor(MAGNIFICATION / 2);
            const y = top + row * MAGNIFICATION + Math.floor(MAGNIFICATION / 2);
            const offset = (y * png.width + x) * 4;
            modules += png.data[offset] < 128 ? '1' : '0';
        }
    }
    return modules;
}

test('QR canvas modules match Labelary for payload lengths 1 through 9', async ({ page }) => {
    await page.goto('/');

    let zpl = '^XA^PW1218';
    for (let index = 0; index < 9; index++) {
        const x = FIELD_X + index * FIELD_STEP;
        zpl += `^FO${x},${FIELD_Y}^BQN,2,${MAGNIFICATION}^FDQA,${'1'.repeat(index + 1)}^FS`;
    }
    zpl += '^XZ';

    const apiPng = PNG.sync.read(await renderLabelary(page, zpl));
    const apiModules = Array.from({ length: 9 }, (_, index) => modulesAt(apiPng, index));
    const canvasModules = await page.evaluate(async () => {
        const { getBarcodeGeometry } = await import('/src/utils/barcodeGeometry.js');
        return Array.from({ length: 9 }, (_, index) => {
            const geom: any = getBarcodeGeometry({
                type: 'QRCODE',
                symbology: 'QR',
                content: '1'.repeat(index + 1),
                errorCorrection: 'Q',
                magnification: 5,
            } as any);
            return Array.from(geom.pixs, (value: any) => value ? '1' : '0').join('');
        });
    });

    expect(canvasModules).toEqual(apiModules);
});
