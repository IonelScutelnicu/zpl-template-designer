import bwipjs from '../vendor/bwip-js.mjs';

const CACHE_MAX = 256;
const tlc39Cache = new Map();

function tlc39Settings(element) {
  const w1 = element.tlc39Code39Width || element.moduleWidth || 2;
  const r1 = element.tlc39Ratio || 3;
  const h1 = element.tlc39Code39Height || element.rowHeight || 40;
  const w2 = element.tlc39MicroPdfWidth || w1;
  const h2 = element.tlc39MicroPdfRowHeight || w2;
  return { w1, r1, h1, w2, h2 };
}

function applyCode39Ratio(sbs, ratio) {
  if (!ratio || ratio === 3) return Array.from(sbs);
  return Array.from(sbs, (v) => (v === 3 ? ratio : v));
}

export function getTlc39Geometry(element) {
  const data = element.previewData || '';
  const { w1, r1, h1, w2, h2 } = tlc39Settings(element);
  const key = `${data}|${w1}|${r1}|${h1}|${w2}|${h2}`;
  const cached = tlc39Cache.get(key);
  if (cached) return cached;

  const comma = data.indexOf(',');
  const eci = (comma >= 0 ? data.slice(0, comma) : data).replace(/\D/g, '').slice(0, 6);
  const micropdfData = comma >= 0 ? data.slice(comma + 1) : '';

  let code39 = { kind: 'error', message: 'No Code 39 data' };
  try {
    const stack = bwipjs.raw({ bcid: 'code39', text: eci });
    const raw = stack.find((entry) => entry && entry.sbs) || stack[0];
    if (raw && raw.sbs) {
      const sbs = applyCode39Ratio(raw.sbs, r1);
      let modules = 0;
      for (const v of sbs) modules += v;
      code39 = { kind: 'linear', sbs, modules, bhs: null, bbs: null, txt: null };
    }
  } catch (e) {
    code39 = { kind: 'error', message: String((e && e.message) || e) };
  }

  let micropdf = null;
  if (micropdfData) {
    try {
      // TLC39's linked MicroPDF417 is fixed at 4 columns by the ATIS/TCIF spec.
      // Without this bwip auto-fits to a single column (a tall, narrow symbol that
      // matches neither the printer nor the spec); pinning columns=4 also makes bwip
      // pick a valid row count (4/6/8/10…) for the data, so no row snapping is needed.
      const stack = bwipjs.raw({ bcid: 'micropdf417', text: micropdfData, columns: 4 });
      const raw = stack.find((entry) => entry && entry.pixs) || stack[0];
      if (raw && raw.pixs) {
        const cols = +raw.pixx;
        micropdf = { kind: 'matrix', cols, rows: raw.pixs.length / cols, pixs: raw.pixs };
      }
    } catch {
      micropdf = null;
    }
  }

  const result = { kind: 'tlc39', code39, micropdf, w1, r1, h1, w2, h2 };
  if (tlc39Cache.size >= CACHE_MAX) tlc39Cache.clear();
  tlc39Cache.set(key, result);
  return result;
}
