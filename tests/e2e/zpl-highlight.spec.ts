import { test, expect } from '../fixtures';
import { ElementsPanel, ZPLOutput } from '../page-objects';

test.describe('ZPL Output - Syntax Highlighting', () => {
    let elementsPanel: ElementsPanel;
    let zplOutput: ZPLOutput;

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        elementsPanel = new ElementsPanel(page);
        zplOutput = new ZPLOutput(page);
    });

    test('should render syntax tokens for commands and data', async () => {
        await elementsPanel.addTextElement();

        const commandTokens = zplOutput.highlightedOutput.locator('.zpl-token-command');
        const dataTokens = zplOutput.highlightedOutput.locator('.zpl-token-data');

        expect(await commandTokens.count()).toBeGreaterThan(0);
        expect(await dataTokens.count()).toBeGreaterThan(0);
    });
});
