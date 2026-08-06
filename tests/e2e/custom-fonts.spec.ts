import path from 'node:path';
import { test, expect } from '../fixtures';
import { ElementsPanel, PreviewPanel, buildSquarePngBuffer } from '../page-objects';

// A valid sfnt table directory (head + glyf) padded past the Labelary limit.
// Real fonts that big are CJK families; the bytes only have to satisfy
// isTrueTypeFont — browser preview support is best-effort either way.
function buildOversizeTtf(size = 2.5 * 1024 * 1024): Buffer {
  const buf = Buffer.alloc(size);
  buf.writeUInt32BE(0x00010000, 0);
  buf.writeUInt16BE(2, 4);
  buf.write('head', 12, 'ascii');
  buf.writeUInt32BE(64, 20);
  buf.writeUInt32BE(54, 24);
  buf.write('glyf', 28, 'ascii');
  buf.writeUInt32BE(128, 36);
  buf.writeUInt32BE(size - 128, 40);
  return buf;
}

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

  test('registers ^A@ font files as custom fonts and rewrites the fields to their IDs', async ({ page }) => {
    await page.goto('/?e2e=1');
    const result = await page.evaluate(async () => {
      const { ZPLParser } = await import('/src/services/ZPLParser.js');
      const parser = new ZPLParser();
      // A path-less ^A@ inherits the file declared by the preceding ^A@.
      const template = parser.parse([
        '^XA',
        '^LH0,0',
        '^PW400',
        '^CI28',
        '^FO160,18^A@N,20,18,fontX.TTF^FDTest^FS',
        '^FO140,35^A@N,20,18^FDTest^FS',
        '^FO30,114^A@N,19,18^FDTest^FS',
        '^PQ%number_of_copies%',
        '^XZ',
      ].join('\n'));
      // A second file gets the next free ID; re-declaring a file reuses its ID.
      const twoFonts = parser.parse([
        '^XA',
        '^FO160,18^A@N,20,18,E:fontA.TTF^FDTest^FS',
        '^FO140,35^A@N,20,18^FDTest^FS',
        '^FO160,60^A@N,20,18,R:fontB.TTF^FDTest^FS',
        '^FO140,80^A@N,20,18^FDTest^FS',
        '^FO140,100^A@N,20,18,E:FONTA.TTF^FDTest^FS',
        '^XZ',
      ].join('\n'));
      // An existing ^CW mapping for the same file is reused rather than duplicated.
      const declared = parser.parse(
        '^XA\n^CWM,R:X.TTF\n^FO10,10^A@N,20,18,X.TTF^FDTest^FS\n^XZ'
      );
      // ^CW after the fields still owns its ID, so the allocator must skip it.
      const lateDeclared = parser.parse(
        '^XA\n^FO10,10^A@N,20,18,A.TTF^FDTest^FS\n^CWI,R:B.TTF\n^XZ'
      );
      // No file declared anywhere: fall back to the label default and warn.
      const orphan = parser.parse('^XA\n^FO10,10^A@N,20,18^FDTest^FS\n^XZ');

      const fontIds = (r: { elements: { type: string, fontId?: string }[] }) =>
        r.elements.filter(el => el.type === 'TEXT').map(el => el.fontId);
      return {
        templateFonts: template.labelSettings.customFonts,
        templateFontIds: fontIds(template),
        templateWarnings: template.warnings.map((w: { command: string }) => w.command),
        twoFonts: twoFonts.labelSettings.customFonts,
        twoFontIds: fontIds(twoFonts),
        declaredFonts: declared.labelSettings.customFonts,
        declaredFontIds: fontIds(declared),
        lateDeclaredFonts: lateDeclared.labelSettings.customFonts,
        lateDeclaredFontIds: fontIds(lateDeclared),
        orphanFontIds: fontIds(orphan),
        orphanWarnings: orphan.warnings.map((w: { command: string }) => w.command),
      };
    });

    // Paths are normalized the same way ^CW normalizes them: driveless → R:, upper-cased.
    expect(result.templateFonts).toEqual([{ id: 'I', fontFile: 'R:FONTX.TTF' }]);
    expect(result.templateFontIds).toEqual(['I', 'I', 'I']);
    // A recognized font is not a warning, so this template imports cleanly.
    expect(result.templateWarnings).toEqual([]);

    expect(result.twoFonts).toEqual([
      { id: 'I', fontFile: 'E:FONTA.TTF' },
      { id: 'K', fontFile: 'R:FONTB.TTF' },
    ]);
    expect(result.twoFontIds).toEqual(['I', 'I', 'K', 'K', 'I']);

    expect(result.declaredFonts).toEqual([{ id: 'M', fontFile: 'R:X.TTF' }]);
    expect(result.declaredFontIds).toEqual(['M']);

    expect(result.lateDeclaredFonts).toEqual([
      { id: 'K', fontFile: 'R:A.TTF' },
      { id: 'I', fontFile: 'R:B.TTF' },
    ]);
    expect(result.lateDeclaredFontIds).toEqual(['K']);

    expect(result.orphanFontIds).toEqual(['']);
    expect(result.orphanWarnings).toEqual(['^A@']);
  });

  test('regenerates an imported ^A@ font as a ^CW mapping', async ({ page }) => {
    await page.goto('/?e2e=1');
    const zpl = await page.evaluate(async () => {
      const { ZPLParser } = await import('/src/services/ZPLParser.js');
      const { ZPLGenerator } = await import('/src/services/ZPLGenerator.js');
      const { SerializationService } = await import('/src/services/SerializationService.js');
      const parsed = new ZPLParser().parse([
        '^XA',
        '^FO160,18^A@N,20,18,fontX.TTF^FDTest^FS',
        '^FO140,35^A@N,20,18^FDTest^FS',
        '^XZ',
      ].join('\n'));
      const svc = new SerializationService();
      const elements = parsed.elements
        .map((d: unknown) => svc.createElementFromData(d, { keepId: true }))
        .filter((el: unknown) => el !== null);
      return new ZPLGenerator().generateZPL(elements, parsed.labelSettings);
    });

    expect(zpl).toContain('^CWI,R:FONTX.TTF');
    expect(zpl).not.toContain('^A@');
    expect(zpl.match(/\^AIN,/g)).toHaveLength(2);
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

  test('attaches a preview font to a reference-only font without changing its ^CW path', async ({ page }) => {
    await page.goto('/?e2e=1');
    await page.locator('details[data-fs-tab="font"] > summary').click();
    await page.locator('#new-font-id').fill('M');
    await page.locator('#new-font-file').fill('E:PRESET.TTF');
    await page.locator('#add-custom-font-btn').click();
    await expect(page.locator('.attach-custom-font')).toContainText('Add preview file');

    const chooser = page.waitForEvent('filechooser');
    await page.locator('.attach-custom-font').click();
    await (await chooser).setFiles(path.resolve('src/fonts/OCRA.ttf'));
    await expect(page.locator('#custom-fonts-list')).toContainText('Ready');
    // The printer-resident path is what the printer resolves; only the preview
    // bytes were added.
    await expect(page.locator('#custom-fonts-list')).toContainText('E:PRESET.TTF');
    // The specimen renders in the attached face, not the fallback.
    await expect(page.locator('.replace-preview-font')).toHaveCSS('font-family', /zpl-custom-/);

    await page.locator('#font-id').selectOption('M', { force: true });
    await page.locator('#font-id').dispatchEvent('change');
    const elements = new ElementsPanel(page);
    await elements.addTextElement();

    const output = await page.locator('#zpl-output-raw').inputValue();
    expect(output).toContain('^CWM,E:PRESET.TTF');
    expect(output).not.toContain('~DY');

    let requestBody = '';
    await page.route('**/api.labelary.com/**', async route => {
      requestBody = route.request().postData() || '';
      await route.fulfill({ status: 200, contentType: 'image/png', body: buildSquarePngBuffer() });
    });
    const preview = new PreviewPanel(page);
    await preview.switchToAPIMode();
    await expect.poll(() => requestBody, { timeout: 10000 }).toContain('~DYE:PRESET,A,T,15896,,');
  });

  test('replaces an attached preview file from the specimen, keeping the ^CW path', async ({ page }) => {
    await page.goto('/?e2e=1');
    await page.locator('details[data-fs-tab="font"] > summary').click();
    await page.locator('#new-font-id').fill('M');
    await page.locator('#new-font-file').fill('E:PRESET.TTF');
    await page.locator('#add-custom-font-btn').click();

    const firstChooser = page.waitForEvent('filechooser');
    await page.locator('.attach-custom-font').click();
    await (await firstChooser).setFiles(path.resolve('src/fonts/OCRA.ttf'));
    const specimen = page.locator('.replace-preview-font');
    await expect(specimen).toHaveCSS('font-family', /zpl-custom-/);
    const firstFace = await specimen.evaluate(el => getComputedStyle(el).fontFamily);

    // Clicking the specimen re-opens the picker; the family is content-hashed,
    // so a different face proves the preview bytes were swapped.
    const secondChooser = page.waitForEvent('filechooser');
    await specimen.click();
    await (await secondChooser).setFiles(path.resolve('src/fonts/OCRB.ttf'));
    await expect(specimen).not.toHaveCSS('font-family', firstFace);
    await expect(page.locator('#custom-fonts-list')).toContainText('E:PRESET.TTF');

    await page.locator('#font-id').selectOption('M', { force: true });
    await page.locator('#font-id').dispatchEvent('change');
    const elements = new ElementsPanel(page);
    await elements.addTextElement();

    const output = await page.locator('#zpl-output-raw').inputValue();
    expect(output).toContain('^CWM,E:PRESET.TTF');
    expect(output).not.toContain('~DY');
  });

  test('drops element overrides to the label default when their font is removed', async ({ page }) => {
    await page.goto('/?e2e=1');
    await page.locator('details[data-fs-tab="font"] > summary').click();
    await page.locator('#new-font-id').fill('K');
    await page.locator('#new-font-file').fill('E:PRESET.TTF');
    await page.locator('#add-custom-font-btn').click();

    const elements = new ElementsPanel(page);
    await elements.addTextElement();
    await page.locator('#prop-font-id').selectOption('K');
    await expect(page.locator('#zpl-output-raw')).toHaveValue(/\^AKN,/);

    await page.locator('.remove-custom-font').click();

    // The override can't survive its font: the panel already shows "Use label
    // default", and the output has to agree instead of emitting an unmapped ^AK.
    await expect(page.locator('#prop-font-id')).toHaveValue('');
    const output = await page.locator('#zpl-output-raw').inputValue();
    expect(output).toContain('^A0N,');
    expect(output).not.toContain('^AK');
    expect(output).not.toContain('^CWK');
  });

  test('resets the label default when the font it points at is removed', async ({ page }) => {
    await page.goto('/?e2e=1');
    await page.locator('details[data-fs-tab="font"] > summary').click();
    await page.locator('#new-font-id').fill('K');
    await page.locator('#new-font-file').fill('E:PRESET.TTF');
    await page.locator('#add-custom-font-btn').click();

    await page.locator('#font-id').selectOption('K', { force: true });
    await page.locator('#font-id').dispatchEvent('change');
    const elements = new ElementsPanel(page);
    await elements.addTextElement();
    expect(await page.locator('#zpl-output-raw').inputValue()).toContain('^CFK,');

    await page.locator('.remove-custom-font').click();

    await expect(page.locator('#font-id')).toHaveValue('0');
    const output = await page.locator('#zpl-output-raw').inputValue();
    expect(output).toContain('^CF0,');
    expect(output).toContain('^A0N,');
    expect(output).not.toContain('^CWK');
  });

  test('takes a font over the Labelary limit as canvas-only', async ({ page }) => {
    await page.goto('/?e2e=1');
    await page.locator('#custom-font-upload').setInputFiles({
      name: 'BIG.ttf', mimeType: 'font/ttf', buffer: buildOversizeTtf(),
    });
    // Accepted — 2 MB is the API preview threshold now, not the upload gate.
    await expect(page.locator('#custom-fonts-list')).toContainText('Canvas only');
    await expect(page.locator('#custom-fonts-list')).toContainText('too large for the Labelary preview');

    await page.locator('#font-id').selectOption('I', { force: true });
    await page.locator('#font-id').dispatchEvent('change');
    const elements = new ElementsPanel(page);
    await elements.addTextElement();
    expect(await page.locator('#zpl-output-raw').inputValue()).toContain('^CWI,E:BIG.TTF');

    let requestBody = '';
    await page.route('**/api.labelary.com/**', async route => {
      requestBody = route.request().postData() || '';
      await route.fulfill({ status: 200, contentType: 'image/png', body: buildSquarePngBuffer() });
    });
    const preview = new PreviewPanel(page);
    await preview.switchToAPIMode();
    await expect.poll(() => requestBody, { timeout: 10000 }).toContain('^XA');
    // Too big to travel: the API preview falls back to its own face.
    expect(requestBody).not.toContain('~DY');
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
