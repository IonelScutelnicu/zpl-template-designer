import { test, expect } from '../fixtures';
import { ElementsPanel, PreviewPanel } from '../page-objects';

const LABELARY_URL = '**/api.labelary.com/**';

test.describe('ZPL Warnings - Element Lifecycle', () => {
    let elementsPanel: ElementsPanel;
    let previewPanel: PreviewPanel;

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        elementsPanel = new ElementsPanel(page);
        previewPanel = new PreviewPanel(page);
    });

    test('should hide warnings panel when the associated element is deleted', async ({ page }) => {
        // Route Labelary to return a warning tied to the first element.
        // We read the POST body to locate the first ^FO byte offset dynamically
        // so the warning resolves to the first element regardless of ZPL header size.
        await page.route(LABELARY_URL, async (route) => {
            const postData = route.request().postData() ?? '';
            const foIndex = postData.indexOf('^FO');
            const byteIndex = foIndex >= 0 ? foIndex : 50;
            await route.fulfill({
                status: 200,
                contentType: 'image/png',
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Expose-Headers': 'X-Warnings',
                    'X-Warnings': `${byteIndex}|3|^FO|1|Field out of label bounds`,
                },
                body: createMinimalPNG(),
            });
        });

        // Add two elements so the panel stays non-empty after deleting the first one.
        // (Deleting the only element triggers clearWarnings via updatePreview's empty-state guard,
        // which would hide the panel regardless — we need the second element to isolate the fix.)
        await elementsPanel.addTextElement();
        await elementsPanel.addBoxElement();

        await previewPanel.switchToAPIMode();
        await previewPanel.refreshBtn.click();

        const warningsPanel = page.locator('#warnings-panel');
        await warningsPanel.waitFor({ state: 'visible', timeout: 10000 });
        await expect(warningsPanel).toBeVisible();

        // Delete the first element (the text element the warning is associated with).
        // No API call is triggered by deletion, so the panel must hide via
        // removeWarningsForElement — the behaviour introduced in ElementService.
        await elementsPanel.deleteElementByIndex(0);

        await expect(warningsPanel).toBeHidden();
    });
});

function createMinimalPNG(): Buffer {
    return Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAB' +
        'Nl7BcQAAAABJRU5ErkJggg==',
        'base64'
    );
}
