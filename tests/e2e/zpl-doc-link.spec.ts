import { test, expect } from '../fixtures';
import { ElementsPanel } from '../page-objects';

const ZPL_DOC_EXPECTED: Record<string, { command: string; url: string }> = {
  TEXT: { command: '^A', url: 'https://docs.zebra.com/us/en/printers/software/zpl-pg/c-zpl-zpl-commands/r-zpl-a.html' },
  FIELDBLOCK: { command: '^FB', url: 'https://docs.zebra.com/us/en/printers/software/zpl-pg/c-zpl-zpl-commands/r-zpl-fb.html' },
  BARCODE: { command: '^BC', url: 'https://docs.zebra.com/us/en/printers/software/zpl-pg/c-zpl-zpl-commands/r-zpl-bc.html' },
  QRCODE: { command: '^BQ', url: 'https://docs.zebra.com/us/en/printers/software/zpl-pg/c-zpl-zpl-commands/r-zpl-bq.html' },
  BOX: { command: '^GB', url: 'https://docs.zebra.com/us/en/printers/software/zpl-pg/c-zpl-zpl-commands/r-zpl-gb.html' },
  LINE: { command: '^GB', url: 'https://docs.zebra.com/us/en/printers/software/zpl-pg/c-zpl-zpl-commands/r-zpl-gb.html' },
  CIRCLE: { command: '^GE', url: 'https://docs.zebra.com/us/en/printers/software/zpl-pg/c-zpl-zpl-commands/r-zpl-ge.html' },
};

type AddMethod = keyof ElementsPanel & `add${string}Element`;

const ELEMENT_ADDERS: Record<string, AddMethod> = {
  TEXT: 'addTextElement',
  FIELDBLOCK: 'addFieldBlockElement',
  BARCODE: 'addBarcodeElement',
  QRCODE: 'addQRCodeElement',
  BOX: 'addBoxElement',
  LINE: 'addLineElement',
  CIRCLE: 'addCircleElement',
};

test.describe('ZPL Documentation Link', () => {
  let elementsPanel: ElementsPanel;

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    elementsPanel = new ElementsPanel(page);
  });

  for (const [type, expected] of Object.entries(ZPL_DOC_EXPECTED)) {
    test(`should show correct doc link for ${type} element`, async ({ page }) => {
      const adder = ELEMENT_ADDERS[type];
      await elementsPanel[adder]();
      await elementsPanel.selectElementByIndex(0);

      const link = page.locator('#zpl-doc-link');
      await expect(link).toBeVisible();
      await expect(link).toHaveText(`${expected.command} docs`);
      await expect(link).toHaveAttribute('href', expected.url);
      await expect(link).toHaveAttribute('target', '_blank');
    });
  }

  test('should hide doc link when no element is selected', async ({ page }) => {
    const link = page.locator('#zpl-doc-link');
    await expect(link).toBeHidden();
  });

  test('should hide doc link after deselecting an element', async ({ page }) => {
    await elementsPanel.addTextElement();
    await elementsPanel.selectElementByIndex(0);

    const link = page.locator('#zpl-doc-link');
    await expect(link).toBeVisible();

    // Click on empty canvas area to deselect
    await page.locator('#label-canvas').click({ position: { x: 5, y: 5 } });
    await expect(link).toBeHidden();
  });

  test('should update doc link when switching between element types', async ({ page }) => {
    const link = page.locator('#zpl-doc-link');

    await elementsPanel.addTextElement();
    await expect(link).toHaveText('^A docs');

    await elementsPanel.addBarcodeElement();
    await expect(link).toHaveText('^BC docs');
  });

  test('should have a doc link entry for every element type', async ({ page }) => {
    // Ensure ZPL_DOC_MAP in app.js covers every element that can be added.
    // Add one of each element and verify none are missing a link.
    for (const [type, adder] of Object.entries(ELEMENT_ADDERS)) {
      await elementsPanel[adder]();
    }

    const count = Object.keys(ELEMENT_ADDERS).length;
    for (let i = 0; i < count; i++) {
      await elementsPanel.selectElementByIndex(i);
      const link = page.locator('#zpl-doc-link');
      await expect(link, `Element at index ${i} should have a doc link`).toBeVisible();
      const href = await link.getAttribute('href');
      expect(href, `Element at index ${i} should have an href`).toBeTruthy();
    }
  });
});
