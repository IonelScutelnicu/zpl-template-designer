import path from 'node:path';
import { test, expect } from '../fixtures';
import { ElementsPanel, PreviewPanel, buildSquarePngBuffer } from '../page-objects';

test.describe('Custom fonts', () => {
  test('recognizes TrueType data independently of browser preview support', async ({ page }) => {
    await page.goto('/?e2e=1');
    const result = await page.evaluate(async () => {
      const { isTrueTypeFont } = await import('/src/utils/customFonts.js');
      const valid = new Uint8Array(60);
      const view = new DataView(valid.buffer);
      view.setUint32(0, 0x00010000);
      view.setUint16(4, 2);
      view.setUint32(12, 0x68656164); // head
      view.setUint32(20, 44);
      view.setUint32(28, 0x676c7966); // glyf
      view.setUint32(36, 44);
      view.setUint32(40, 16);
      return {
        valid: isTrueTypeFont(valid),
        truncated: isTrueTypeFont(valid.subarray(0, 50)),
        renamedData: isTrueTypeFont(new Uint8Array([0, 1, 2, 3])),
      };
    });
    expect(result).toEqual({ valid: true, truncated: false, renamedData: false });
  });

  test('formats embedded TTF bytes as a printer download', async ({ page }) => {
    await page.goto('/?e2e=1');
    const result = await page.evaluate(async () => {
      const fonts = await import('/src/utils/customFonts.js');
      return fonts.formatFontDownload({
        id: 'M',
        fontFile: 'E:TEST.TTF',
        source: { data: fonts.bytesToBase64(new Uint8Array([0, 1, 255, 171])), sha256: 'test' },
      });
    });
    expect(result).toBe('~DYE:TEST,A,T,4,,0001FFAB');

    const imported = await page.evaluate(async () => {
      const { ZPLParser } = await import('/src/services/ZPLParser.js');
      return new ZPLParser().parse('~DYE:TEST,A,T,4,,0001FFAB\n^XA\n^CWM,E:TEST.TTF\n^XZ').labelSettings.customFonts[0];
    });
    expect(imported).toMatchObject({
      id: 'M',
      fontFile: 'E:TEST.TTF',
      source: { size: 4, data: 'AAH/qw==' },
    });
  });

  test('imports real-world ~DY variants and ignores non-font preamble content', async ({ page }) => {
    await page.goto('/?e2e=1');
    const result = await page.evaluate(async () => {
      const { ZPLParser } = await import('/src/services/ZPLParser.js');
      const { normalizeCustomFontSources } = await import('/src/utils/customFonts.js');
      const parser = new ZPLParser();
      // ~DY name already carrying the extension must match the ^CW mapping.
      const withExtension = parser.parse(
        '~DYE:TEST.TTF,A,T,4,,0001FFAB\n^XA\n^CWM,E:TEST.TTF\n^XZ'
      ).labelSettings.customFonts[0];
      // Driveless paths default to R: on both sides and still associate.
      const driveless = parser.parse(
        '~DYTEST,A,T,4,,0001FFAB\n^XA\n^CWM,TEST.TTF\n^XZ'
      ).labelSettings.customFonts[0];
      // Line-wrapped hex payloads are accepted.
      const wrapped = parser.parse(
        '~DYE:TEST,A,T,4,,0001\r\nFFAB\n^XA\n^CWM,E:TEST.TTF\n^XZ'
      ).labelSettings.customFonts[0];
      // Non-font content before ^XA imports silently, as it did before ~DY support.
      const noise = parser.parse(
        '~DYE:LOGO,B,P,100,,ABCD\n~DGR:IMG.GRF,8,1,FFFF\n^XA\n^FO10,10^GB50,50,2^FS\n^XZ'
      );
      await normalizeCustomFontSources([withExtension]);
      return {
        withExtensionSha256: withExtension.source?.sha256,
        drivelessFontFile: driveless.fontFile,
        drivelessHasSource: Boolean(driveless.source),
        wrappedData: wrapped.source?.data,
        noiseWarnings: noise.warnings,
        noiseElements: noise.elements.length,
      };
    });
    expect(result).toEqual({
      withExtensionSha256: '55fa6a154deb3f30a35f77af58bf5df790d6a8ebe5eb924e6dddfdcacf14bfa4',
      drivelessFontFile: 'R:TEST.TTF',
      drivelessHasSource: true,
      wrappedData: 'AAH/qw==',
      noiseWarnings: [],
      noiseElements: 1,
    });
  });

  test('steps text-block lines by the font\'s own line height, field blocks by the font height', async ({ page }) => {
    await page.goto('/?e2e=1');
    const result = await page.evaluate(async () => {
      const { bytesToBase64, sha256Hex, customFontLineHeightRatio } = await import('/src/utils/customFonts.js');
      const { resolveFontLineHeight, resolveFontMetrics } = await import('/src/utils/fontMetrics.js');
      const load = async (file: string) => {
        const bytes = new Uint8Array(await (await fetch(file)).arrayBuffer());
        return { data: bytesToBase64(bytes), sha256: await sha256Hex(bytes), size: bytes.length };
      };
      const labelSettings = {
        fontId: '0',
        defaultFontHeight: 20,
        defaultFontWidth: 0,
        customFonts: [
          { id: 'I', fontFile: 'E:OCRA.TTF', source: await load('/src/fonts/OCRA.ttf') },
          { id: 'K', fontFile: 'E:VERA.TTF', source: await load('/src/fonts/VeraMono.ttf') },
          // Reference-only font: imported ^CW with no ~DY payload to measure.
          { id: 'M', fontFile: 'E:MISSING.TTF' },
        ],
      };
      const metrics = (fontId: string) => resolveFontMetrics({ fontId, fontSize: 40 }, labelSettings, 1);
      const pitches = (fontId: string) => ({
        textBlock: resolveFontLineHeight(metrics(fontId), 1, 1, 'textBlockLineHeightRatio', 'fontSize'),
        fieldBlock: resolveFontLineHeight(metrics(fontId), 1),
      });
      return {
        ocra: pitches('I'),
        vera: pitches('K'),
        // No payload — the font falls back to the built-in default config.
        missing: pitches('M'),
        ratioIsCached: customFontLineHeightRatio(labelSettings.customFonts[0].source)
          === customFontLineHeightRatio(labelSettings.customFonts[0].source),
      };
    });
    // hhea (ascender - descender + lineGap) / unitsPerEm x the ^A height, matching
    // Labelary's ^TB pitch: OCR-A 1.408, VeraMono 1.1640625. ^FB ignores the metrics.
    expect(result.ocra.textBlock).toBeCloseTo(56.32, 2);
    expect(result.vera.textBlock).toBeCloseTo(46.5625, 2);
    expect(result.ocra.fieldBlock).toBe(40);
    expect(result.vera.fieldBlock).toBe(40);
    expect(result.missing).toEqual({ textBlock: 40, fieldBlock: 40 });
    expect(result.ratioIsCached).toBe(true);
  });

  test('offers a newly uploaded font to the selected element without reselecting it', async ({ page }) => {
    await page.goto('/?e2e=1');
    const elements = new ElementsPanel(page);
    await elements.addTextElement();
    // The element stays selected across the upload, so its Font ID (override)
    // dropdown has to pick up the new font in place.
    await expect(page.locator('#prop-font-id')).toBeVisible();
    await expect(page.locator('#prop-font-id option[value="I"]')).toHaveCount(0);

    await page.locator('#custom-font-upload').setInputFiles(path.resolve('src/fonts/OCRA.ttf'));
    await expect(page.locator('#custom-fonts-list')).toContainText('Ready');

    await expect(page.locator('#prop-font-id option[value="I"]')).toHaveCount(1);
    await page.locator('#prop-font-id').selectOption('I');
    await expect(page.locator('#zpl-output-raw')).toHaveValue(/\^AIN,/);
  });

  test('uploads a font, keeps production ZPL compact, and embeds it in API preview', async ({ page }) => {
    await page.goto('/?e2e=1');
    await page.locator('#custom-font-upload').setInputFiles(
      path.resolve('src/fonts/OCRA.ttf'),
    );
    await expect(page.locator('#custom-fonts-list')).toContainText('Ready');
    await expect(page.locator('#font-id option[value="I"]')).toContainText('OCRA.ttf');

    await page.locator('#font-id').selectOption('I', { force: true });
    await page.locator('#font-id').dispatchEvent('change');
    const elements = new ElementsPanel(page);
    await elements.addTextElement();

    const output = await page.locator('#zpl-output-raw').inputValue();
    expect(output).toContain('^CWI,E:OCRA.TTF');
    expect(output).not.toContain('~DY');

    let requestBody = '';
    await page.route('**/api.labelary.com/**', async route => {
      requestBody = route.request().postData() || '';
      await route.fulfill({ status: 200, contentType: 'image/png', body: buildSquarePngBuffer() });
    });
    const preview = new PreviewPanel(page);
    await preview.switchToAPIMode();
    await expect.poll(() => requestBody, { timeout: 10000 }).toContain('~DYE:OCRA,A,T,15896,,');
    expect(requestBody.indexOf('~DY')).toBeLessThan(requestBody.indexOf('^XA'));
  });
});
