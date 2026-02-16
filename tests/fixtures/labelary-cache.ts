import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { Page } from '@playwright/test';

const CACHE_DIR = path.join(__dirname, 'labelary-cache');

function computeCacheKey(zpl: string, dpmm: string, width: string, height: string): string {
    return crypto.createHash('sha1')
        .update(`${dpmm}|${width}|${height}|${zpl}`)
        .digest('hex');
}

function getCachedImage(key: string): Buffer | null {
    const filePath = path.join(CACHE_DIR, `${key}.png`);
    return fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
}

function saveToCache(key: string, data: Buffer): void {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    fs.writeFileSync(path.join(CACHE_DIR, `${key}.png`), data);
}

export async function setupLabelaryCacheInterceptor(page: Page): Promise<void> {
    await page.route('**/api.labelary.com/**', async (route) => {
        const request = route.request();
        const url = request.url();
        const zpl = request.postData() || '';

        const match = url.match(/\/printers\/(\d+)dpmm\/labels\/([\d.]+)x([\d.]+)\//);
        if (!match) {
            await route.continue();
            return;
        }

        const [, dpmm, width, height] = match;
        const key = computeCacheKey(zpl, dpmm, width, height);
        const cached = getCachedImage(key);

        if (cached) {
            await route.fulfill({
                status: 200,
                contentType: 'image/png',
                body: cached,
            });
            return;
        }

        // Cache miss – hit the real API, persist response
        const response = await route.fetch();
        const body = await response.body();
        if (response.status() === 200) {
            saveToCache(key, body);
        }
        await route.fulfill({ response, body });
    });
}
