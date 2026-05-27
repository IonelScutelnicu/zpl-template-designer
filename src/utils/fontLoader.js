const FONT_SOURCES = {
  A: { family: 'Bitstream Vera Sans Mono', src: 'src/fonts/VeraMono.ttf' },
  B: { family: 'Bitstream Vera Sans Mono Bold', src: 'src/fonts/VeraMono-Bold.ttf' },
  C: { family: 'Bitstream Vera Sans Mono', src: 'src/fonts/VeraMono.ttf' },
  D: { family: 'Bitstream Vera Sans Mono', src: 'src/fonts/VeraMono.ttf' },
  E: { family: 'OCRB', src: 'src/fonts/ocrb.ttf' },
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

// Call after a render pass; fires onLoaded() once when any custom fonts finish loading.
export function prefetchFontsForElements(elements, labelSettings, onLoaded) {
  const defaultFontId = labelSettings?.fontId || '0';
  const needed = [...new Set(elements.map(el => el.fontId || defaultFontId))]
    .filter(id => FONT_SOURCES[id] && !loaded.has(id) && !failed.has(id));
  if (needed.length === 0) return;
  Promise.all(needed.map(ensureFontLoaded)).then(() => {
    if (needed.some(id => loaded.has(id))) onLoaded();
  });
}
