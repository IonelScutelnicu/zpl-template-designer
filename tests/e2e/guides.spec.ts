import { test, expect } from '../fixtures';
import { Canvas, ElementsPanel, PropertiesPanel } from '../page-objects';

test.describe('Smart Guides', () => {
    let elementsPanel: ElementsPanel;
    let propertiesPanel: PropertiesPanel;
    let canvas: Canvas;

    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => localStorage.clear());
        await page.goto('/?e2e=1');
        elementsPanel = new ElementsPanel(page);
        propertiesPanel = new PropertiesPanel(page);
        canvas = new Canvas(page);
        await canvas.waitForReady();
    });

    async function setPosition(page: import('@playwright/test').Page, x: number, y: number): Promise<void> {
        await page.locator('#prop-x').fill(String(x));
        await page.locator('#prop-x').dispatchEvent('change');
        await page.locator('#prop-y').fill(String(y));
        await page.locator('#prop-y').dispatchEvent('change');
        await canvas.waitForReady();
    }

    async function getCSSScale(page: import('@playwright/test').Page): Promise<number> {
        return await page.evaluate(() => {
            const canvasElement = document.getElementById('label-canvas') as HTMLCanvasElement | null;
            if (!canvasElement || !canvasElement.width) return 1;
            return canvasElement.getBoundingClientRect().width / canvasElement.width;
        });
    }

    async function movePointerToLabel(page: import('@playwright/test').Page, labelX: number, labelY: number): Promise<void> {
        const box = await canvas.getBoundingBox();
        if (!box) throw new Error('Canvas not found');

        const cssScale = await getCSSScale(page);
        await page.mouse.move(box.x + labelX * cssScale, box.y + labelY * cssScale, { steps: 10 });
    }

    async function beginPointerDrag(page: import('@playwright/test').Page, labelX: number, labelY: number): Promise<void> {
        await movePointerToLabel(page, labelX, labelY);
        await page.mouse.down();
    }

    async function endPointerDrag(page: import('@playwright/test').Page): Promise<void> {
        await page.mouse.up();
        await canvas.waitForReady();
    }

    async function getGuideCount(page: import('@playwright/test').Page): Promise<number> {
        return await page.evaluate(() => (window as any).canvasRenderer?.smartGuides?.length ?? 0);
    }

    async function setupTwoBoxes(page: import('@playwright/test').Page): Promise<void> {
        await elementsPanel.addBoxElement();
        await elementsPanel.selectElementByIndex(0);
        await setPosition(page, 60, 60);

        await elementsPanel.addBoxElement();
        await elementsPanel.selectElementByIndex(1);
        await setPosition(page, 220, 60);

        await elementsPanel.selectElementByIndex(0);
        await canvas.waitForReady();
    }

    test('does not show drag guides unless Control is held', async ({ page }) => {
        await setupTwoBoxes(page);

        await beginPointerDrag(page, 80, 80);
        await movePointerToLabel(page, 240, 80);

        await expect.poll(() => getGuideCount(page)).toBe(0);
        await endPointerDrag(page);
    });

    test('shows drag guides while Control is held and clears them on release', async ({ page }) => {
        await setupTwoBoxes(page);

        await beginPointerDrag(page, 80, 80);
        await page.keyboard.down('Control');
        await movePointerToLabel(page, 240, 80);

        await expect.poll(() => getGuideCount(page)).toBeGreaterThan(0);

        await page.keyboard.up('Control');
        await expect.poll(() => getGuideCount(page)).toBe(0);
        await endPointerDrag(page);
    });

    test('shows resize guides while Control is held', async ({ page }) => {
        await setupTwoBoxes(page);

        const x = parseInt(await propertiesPanel.getProperty('prop-x'));
        const y = parseInt(await propertiesPanel.getProperty('prop-y'));
        const width = parseInt(await propertiesPanel.getProperty('prop-width'));
        const height = parseInt(await propertiesPanel.getProperty('prop-height'));

        await beginPointerDrag(page, x + width, y + height);
        await page.keyboard.down('Control');
        await movePointerToLabel(page, 220, y + height);

        await expect.poll(() => getGuideCount(page)).toBeGreaterThan(0);

        await page.keyboard.up('Control');
        await expect.poll(() => getGuideCount(page)).toBe(0);
        await endPointerDrag(page);
    });
});
