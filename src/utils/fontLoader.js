import { resolveSymbology, getHriConfig } from './barcodeGeometry.js';
import { customFontFamily, fontBytesFromSource, isValidFontHash } from './customFonts.js';

const FONT_SOURCES = {
  A: { family: 'Bitstream Vera Sans Mono', src: 'src/fonts/VeraMono.ttf' },
  B: { family: 'Bitstream Vera Sans Mono Bold', src: 'src/fonts/VeraMono-Bold.ttf' },
  C: { family: 'Bitstream Vera Sans Mono', src: 'src/fonts/VeraMono.ttf' },
  D: { family: 'Bitstream Vera Sans Mono', src: 'src/fonts/VeraMono.ttf' },
  E: { family: 'OCRB', src: 'src/fonts/OCRB.ttf' },
  F: { family: 'Bitstream Vera Sans Mono', src: 'src/fonts/VeraMono.ttf' },
  G: { family: 'Bitstream Vera Sans Mono', src: 'src/fonts/VeraMono.ttf' },
  H: { family: 'OCRA', src: 'src/fonts/OCRA.ttf' },
};

const loaded = new Set();
const pending = new Map();
const failed = new Set();

export function isFontReady(fontId) {
  return !FONT_SOURCES[fontId] || loaded.has(fontId);
}

export function ensureFontLoaded(fontId) {
  if (isFontReady(fontId)) return Promise.resolve();
  if (pending.has(fontId)) return pending.get(fontId);
  const { family, src } = FONT_SOURCES[fontId];
  const face = new FontFace(family, `url(${src})`);
  const p = face.load()
    .then(f => { document.fonts.add(f); loaded.add(fontId); })
    .catch(() => { failed.add(fontId); pending.delete(fontId); });
  pending.set(fontId, p);
  return p;
}

// Resolves once every font load kicked off so far has finished (or failed).
// Used by tests: capturing the canvas before the bundled FontFaces load would
// bake the OS fallback font (which differs per platform) into the pixels.
export function fontsSettled() {
  return Promise.all(pending.values());
}

function customFontKey(source) {
  return `custom:${source.sha256}`;
}

// Single registration point for embedded custom fonts so upload, prefetch,
// and fontsSettled() all share the same bookkeeping. Resolves to whether the
// font ended up loaded; browser rejection of a printer-valid TTF is recorded
// as failed, never thrown.
export function ensureCustomFontLoaded(source) {
  // An unverified hash has no family of its own to register under (and would
  // make the FontFace constructor throw on the way in).
  if (!isValidFontHash(source?.sha256)) return Promise.resolve(false);
  const key = customFontKey(source);
  if (loaded.has(key)) return Promise.resolve(true);
  if (failed.has(key)) return Promise.resolve(false);
  if (pending.has(key)) return pending.get(key);
  const bytes = fontBytesFromSource(source);
  if (!bytes) {
    failed.add(key);
    return Promise.resolve(false);
  }
  const face = new FontFace(customFontFamily(source), bytes.buffer);
  const p = face.load()
    .then(f => { document.fonts.add(f); loaded.add(key); return true; })
    .catch(() => { failed.add(key); return false; });
  pending.set(key, p);
  return p;
}

// A barcode's HRI line renders in a font that's independent of the element's own
// fontId (e.g. EAN/UPC use OCR-B below, font A above). When that line uses a ZPL
// font (config.font.id), resolve its id so it gets preloaded too. Direct-family
// lines (Code 128/39 → Arial, a system font) need no preload.
function hriFontId(el) {
  if (el.type !== 'BARCODE' || el.showText === false) return null;
  return getHriConfig(resolveSymbology(el), el.printTextAbove === true)?.font?.id || null;
}

// Call after a render pass; fires onLoaded() once when any custom fonts finish loading.
export function prefetchFontsForElements(elements, labelSettings, onLoaded) {
  const defaultFontId = labelSettings?.fontId || '0';
  const ids = new Set(elements.map(el => el.fontId || defaultFontId));
  for (const el of elements) {
    const id = hriFontId(el);
    if (id) ids.add(id);
  }
  const customById = new Map((labelSettings?.customFonts || []).map(font => [font.id, font]));
  const customNeeded = [...ids]
    .map(id => customById.get(id)?.source)
    .filter(source => source?.sha256 && !loaded.has(customFontKey(source))
      && !failed.has(customFontKey(source)) && !pending.has(customFontKey(source)));
  const needed = [...ids]
    .filter(id => FONT_SOURCES[id] && !loaded.has(id) && !failed.has(id));
  if (needed.length === 0 && customNeeded.length === 0) return;
  Promise.all([
    ...needed.map(ensureFontLoaded),
    ...customNeeded.map(ensureCustomFontLoaded),
  ]).then(results => {
    if (results.some(Boolean) || needed.some(id => loaded.has(id))) onLoaded();
  });
}
