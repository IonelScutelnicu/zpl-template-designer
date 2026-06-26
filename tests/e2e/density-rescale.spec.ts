import { test, expect } from '../fixtures';
import { ElementsPanel, buildSquarePngBuffer } from '../page-objects';

// Density rescale (Print Density change) — see ADR 0002 and
// src/services/DensityRescaleService.js. The dialog appears when the user
// changes dpmm with content on the label; "Scale elements" multiplies every
// dot-valued field by newDpmm/oldDpmm as a single history entry.
//
// `window.appState` is exposed in the e2e build (see fixtures), so these tests
// seed exact dot values and read the rescaled results back directly.
test.describe('Density rescale', () => {
  let elementsPanel: ElementsPanel;

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    elementsPanel = new ElementsPanel(page);
  });

  test.describe('Scale elements — field coverage', () => {
    test('rescales every element type and label dot setting as one history entry', async ({ page }) => {
      await elementsPanel.addBoxElement();
      await elementsPanel.addLineElement();
      await elementsPanel.addCircleElement();
      await elementsPanel.addDiagonalLineElement();
      await elementsPanel.addTextElement();
      await elementsPanel.addTextBlockElement();
      await elementsPanel.addFieldBlockElement();
      await elementsPanel.addBarcodeElement();
      await elementsPanel.addQRCodeElement();
      await page.waitForTimeout(350); // let the element adds settle in history

      // Seed deterministic dot values. x3 (8 -> 24 dpmm) keeps barcode width and
      // QR magnification in range (<=3 so x3 stays <=10), so nothing clamps here.
      await page.evaluate(() => {
        const s = (window as unknown as { appState: any }).appState;
        const t = (type: string) => s.elements.find((e: any) => e.type === type);
        Object.assign(t('BOX'), { x: 10, y: 12, width: 40, height: 20, thickness: 4 });
        Object.assign(t('LINE'), { x: 6, y: 8, width: 50, thickness: 3 });
        Object.assign(t('CIRCLE'), { x: 4, y: 4, width: 30, height: 30, thickness: 2 });
        Object.assign(t('DIAGONALLINE'), { x: 2, y: 2, width: 24, height: 16, thickness: 3 });
        Object.assign(t('TEXT'), { x: 5, y: 5, fontSize: 30, fontWidth: 20 });
        Object.assign(t('TEXTBLOCK'), { x: 7, y: 9, fontSize: 28, fontWidth: 18, blockWidth: 100, blockHeight: 60 });
        Object.assign(t('FIELDBLOCK'), { x: 3, y: 3, fontSize: 26, fontWidth: 16, blockWidth: 90, lineSpacing: 4, hangingIndent: 8 });
        Object.assign(t('BARCODE'), { x: 1, y: 1, width: 3, height: 50 });
        Object.assign(t('QRCODE'), { x: 0, y: 0, symbology: 'QR', magnification: 3 });
        Object.assign(s.labelSettings, { defaultFontHeight: 20, defaultFontWidth: 10, homeX: 10, homeY: 6, labelTop: 4 });
      });

      const before = await page.evaluate(() => (window as unknown as { appState: any }).appState.getHistoryEntries().length);

      await page.locator('#label-dpmm').selectOption('24'); // 8 -> 24 dpmm (x3)
      await page.locator('#density-rescale-scale-btn').click();
      await page.waitForTimeout(150);

      const r = await page.evaluate(() => {
        const s = (window as unknown as { appState: any }).appState;
        const t = (type: string) => s.elements.find((e: any) => e.type === type);
        const entries = s.getHistoryEntries();
        const ls = s.labelSettings;
        return {
          dpmm: ls.dpmm,
          historyLen: entries.length,
          latestLabel: entries[entries.length - 1].label,
          box: t('BOX'), line: t('LINE'), circle: t('CIRCLE'), diagonal: t('DIAGONALLINE'),
          text: t('TEXT'), textblock: t('TEXTBLOCK'), fieldblock: t('FIELDBLOCK'),
          barcode: t('BARCODE'), qrcode: t('QRCODE'),
          label: { defaultFontHeight: ls.defaultFontHeight, defaultFontWidth: ls.defaultFontWidth, homeX: ls.homeX, homeY: ls.homeY, labelTop: ls.labelTop },
        };
      });

      expect(r.dpmm).toBe(24);
      expect(r.historyLen).toBe(before + 1); // the whole rescale is ONE entry
      expect(r.latestLabel).toContain('scaled');

      expect(r.box).toMatchObject({ x: 30, y: 36, width: 120, height: 60, thickness: 12 });
      expect(r.line).toMatchObject({ x: 18, y: 24, width: 150, thickness: 9 });
      expect(r.circle).toMatchObject({ x: 12, y: 12, width: 90, height: 90, thickness: 6 });
      expect(r.diagonal).toMatchObject({ x: 6, y: 6, width: 72, height: 48, thickness: 9 });
      expect(r.text).toMatchObject({ x: 15, y: 15, fontSize: 90, fontWidth: 60 });
      expect(r.textblock).toMatchObject({ fontSize: 84, fontWidth: 54, blockWidth: 300, blockHeight: 180 });
      expect(r.fieldblock).toMatchObject({ fontSize: 78, fontWidth: 48, blockWidth: 270, lineSpacing: 12, hangingIndent: 24 });
      expect(r.barcode).toMatchObject({ width: 9, height: 150 });
      expect(r.qrcode).toMatchObject({ magnification: 9 });
      expect(r.label).toEqual({ defaultFontHeight: 60, defaultFontWidth: 30, homeX: 30, homeY: 18, labelTop: 12 });
    });

    test('updates the ZPL output to the new density and dimensions', async ({ page }) => {
      await elementsPanel.addBoxElement();
      await page.evaluate(() => {
        Object.assign((window as unknown as { appState: any }).appState.elements.find((e: any) => e.type === 'BOX'),
          { x: 50, y: 50, width: 100, height: 50, thickness: 3 });
      });
      await page.locator('#label-dpmm').selectOption('24'); // 8 -> 24 dpmm (x3)
      await page.locator('#density-rescale-scale-btn').click();
      await page.waitForTimeout(150);

      const zpl = await page.locator('#zpl-output-raw').inputValue();
      expect(zpl).toContain('"dpmm":24');
      expect(zpl).toContain('^FO150,150'); // position x3
      expect(zpl).toContain('^GB300,150,9'); // box w,h,thickness x3
    });
  });

  test.describe('Scale elements — barcode clamping', () => {
    test('clamps 1D barcode module width to its 1..10 bound', async ({ page }) => {
      await elementsPanel.addBarcodeElement();
      // 5 * (24/8) = 15, which exceeds ^BY's hard limit of 10.
      await page.evaluate(() => {
        (window as unknown as { appState: any }).appState.elements.find((e: any) => e.type === 'BARCODE').width = 5;
      });
      await page.locator('#label-dpmm').selectOption('24'); // 8 -> 24 dpmm (x3)
      await page.locator('#density-rescale-scale-btn').click();
      await page.waitForTimeout(150);

      const width = await page.evaluate(
        () => (window as unknown as { appState: any }).appState.elements.find((e: any) => e.type === 'BARCODE').width
      );
      expect(width).toBe(10);
    });

    test('clamps QR, Data Matrix, and PDF417 module fields to their bounds', async ({ page }) => {
      await elementsPanel.addQRCodeElement();
      await elementsPanel.addQRCodeElement();
      await elementsPanel.addQRCodeElement();
      await page.evaluate(() => {
        const qrs = (window as unknown as { appState: any }).appState.elements.filter((e: any) => e.type === 'QRCODE');
        Object.assign(qrs[0], { symbology: 'QR', magnification: 5 });        // 15 -> clamp 10
        Object.assign(qrs[1], { symbology: 'DATAMATRIX', moduleSize: 12 });  // 36 -> clamp 30
        Object.assign(qrs[2], { symbology: 'PDF417', moduleWidth: 8, rowHeight: 40 }); // 24 -> 20, 120 -> 100
      });

      await page.locator('#label-dpmm').selectOption('24'); // x3
      // The dialog warns that barcodes will hit a module-size limit.
      const note = page.locator('#density-rescale-notes');
      await expect(note).toBeVisible();
      await expect(note).toContainText('barcode');

      await page.locator('#density-rescale-scale-btn').click();
      await page.waitForTimeout(150);

      const r = await page.evaluate(() => {
        const qrs = (window as unknown as { appState: any }).appState.elements.filter((e: any) => e.type === 'QRCODE');
        return {
          qr: qrs.find((e: any) => e.symbology === 'QR').magnification,
          dm: qrs.find((e: any) => e.symbology === 'DATAMATRIX').moduleSize,
          pdfW: qrs.find((e: any) => e.symbology === 'PDF417').moduleWidth,
          pdfH: qrs.find((e: any) => e.symbology === 'PDF417').rowHeight,
        };
      });
      expect(r).toEqual({ qr: 10, dm: 30, pdfW: 20, pdfH: 100 });
    });
  });

  test.describe('Editable graphic re-rasterization', () => {
    test('re-encodes an editable graphic at the scaled dot dimensions', async ({ page }) => {
      await elementsPanel.addGraphicElement(buildSquarePngBuffer());
      // Pin to multiples of 8 so the byte-aligned re-raster width is exact.
      await page.evaluate(() => {
        const g = (window as unknown as { appState: any }).appState.elements.find((e: any) => e.type === 'GRAPHIC');
        g.widthDots = 80; g.heightDots = 80;
      });

      await page.locator('#label-dpmm').selectOption('24'); // 8 -> 24 dpmm (x3)
      await page.locator('#density-rescale-scale-btn').click();
      await page.waitForTimeout(400); // imageToBitmap is async; handler awaits it before committing

      const after = await page.evaluate(() => {
        const g = (window as unknown as { appState: any }).appState.elements.find((e: any) => e.type === 'GRAPHIC');
        return { w: g.widthDots, h: g.heightDots, hasBytes: !!g.bytes };
      });
      expect(after.w).toBe(240); // 80 * 3, byte-aligned
      expect(after.h).toBe(240);
      expect(after.hasBytes).toBe(true); // bitmap was re-encoded, not left stale
    });
  });

  test.describe('Dialog choices', () => {
    test('"Keep as-is" changes only the density, leaving elements unscaled', async ({ page }) => {
      await elementsPanel.addBoxElement();
      await page.evaluate(() => {
        Object.assign((window as unknown as { appState: any }).appState.elements.find((e: any) => e.type === 'BOX'),
          { width: 40, height: 20 });
      });
      const before = await page.evaluate(() => (window as unknown as { appState: any }).appState.getHistoryEntries().length);

      await page.locator('#label-dpmm').selectOption('12');
      await page.locator('#density-rescale-keep-btn').click();
      await page.waitForTimeout(50);

      const r = await page.evaluate(() => {
        const s = (window as unknown as { appState: any }).appState;
        const box = s.elements.find((e: any) => e.type === 'BOX');
        const entries = s.getHistoryEntries();
        return { dpmm: s.labelSettings.dpmm, w: box.width, h: box.height, historyLen: entries.length, latest: entries[entries.length - 1].label };
      });
      expect(r.dpmm).toBe(12);
      expect(r.w).toBe(40); // unchanged
      expect(r.h).toBe(20);
      expect(r.historyLen).toBe(before + 1);
      expect(r.latest).toContain('Changed density');
    });

    test('an empty default label applies the density with no dialog', async ({ page }) => {
      await page.locator('#label-dpmm').selectOption('12');
      await page.waitForTimeout(80);
      await expect(page.locator('#density-rescale-modal')).toBeHidden();
      const dpmm = await page.evaluate(() => (window as unknown as { appState: any }).appState.labelSettings.dpmm);
      expect(dpmm).toBe(12);
    });

    test('Escape closes the dialog as a cancel and reverts the density', async ({ page }) => {
      await elementsPanel.addBoxElement();
      await page.locator('#label-dpmm').selectOption('12');
      await expect(page.locator('#density-rescale-modal')).toBeVisible();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(50);

      const r = await page.evaluate(() => ({
        dpmm: (window as unknown as { appState: any }).appState.labelSettings.dpmm,
        dropdown: (document.getElementById('label-dpmm') as HTMLSelectElement).value,
      }));
      expect(r.dpmm).toBe(8);
      expect(r.dropdown).toBe('8');
    });

    test('clicking the backdrop cancels the dialog', async ({ page }) => {
      await elementsPanel.addBoxElement();
      await page.locator('#label-dpmm').selectOption('12');
      await expect(page.locator('#density-rescale-modal')).toBeVisible();
      await page.mouse.click(8, 8); // backdrop, far from the centered modal
      await page.waitForTimeout(50);

      const dpmm = await page.evaluate(() => (window as unknown as { appState: any }).appState.labelSettings.dpmm);
      expect(dpmm).toBe(8);
    });
  });

  test.describe('Dialog notes', () => {
    test('warns about graphics that cannot be resized', async ({ page }) => {
      await elementsPanel.addGraphicElement(buildSquarePngBuffer());
      // Make it opaque so it is treated as unscalable (keeps its dot dimensions).
      await page.evaluate(() => {
        (window as unknown as { appState: any }).appState.elements.find((e: any) => e.type === 'GRAPHIC').opaqueRaw = true;
      });
      await page.locator('#label-dpmm').selectOption('12');

      const note = page.locator('#density-rescale-notes');
      await expect(note).toBeVisible();
      await expect(note).toContainText("can't be resized");
    });
  });

  test.describe('Pending edit safety', () => {
    test('cancelling the dialog keeps a pending label-settings edit in history', async ({ page }) => {
      await elementsPanel.addBoxElement();
      await page.waitForTimeout(350); // let the box's own history commit settle

      const before = await page.evaluate(() => (window as unknown as { appState: any }).appState.getHistoryEntries().length);
      const startDpmm = await page.evaluate(() => (window as unknown as { appState: any }).appState.labelSettings.dpmm);
      const target = startDpmm === 8 ? '12' : '8';

      // Edit label width -> schedules a debounced "label-settings" history commit.
      const widthInput = page.locator('#label-width');
      const startWidth = Number(await widthInput.inputValue());
      await widthInput.fill(String(startWidth + 6));
      await widthInput.dispatchEvent('input');

      // Within the debounce window, change density. The handler must flush the
      // pending width edit as its own entry before opening the dialog.
      await page.locator('#label-dpmm').selectOption(target);
      await page.locator('#density-rescale-cancel-btn').click();
      await page.waitForTimeout(400); // past the 300ms debounce

      const r = await page.evaluate(() => {
        const s = (window as unknown as { appState: any }).appState;
        return { len: s.getHistoryEntries().length, dpmm: s.labelSettings.dpmm, width: s.labelSettings.width };
      });
      expect(r.len).toBe(before + 1); // flushed edit is the only new entry
      expect(r.dpmm).toBe(startDpmm); // cancel did not apply the density change
      expect(r.width).toBe(startWidth + 6); // the width edit survived
    });
  });
});
