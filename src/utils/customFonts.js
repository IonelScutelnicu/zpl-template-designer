import { bytesToHex } from './graphicField.js';

export const CUSTOM_FONT_IDS = ['I', 'K', 'M', 'O', 'W', 'X', 'Y', 'Z'];
export const MAX_CUSTOM_FONT_BYTES = 10 * 1024 * 1024;
// Labelary rejects oversized requests, so a font past this size is embedded for
// the canvas (and printer install) only and left out of the ~DY preamble the
// API preview carries. Uploading it is still worth it: the canvas shows the
// real face and the ^CW mapping is what the printer resolves.
export const MAX_API_PREVIEW_FONT_BYTES = 2 * 1024 * 1024;
export const PRINTER_FONT_PATH_RE = /^[REBA]:[A-Z0-9_]{1,16}\.TTF$/;

// Validate the sfnt table directory without relying on FontFace. A printer may
// support a valid TrueType font that the browser's font sanitizer declines to
// render, so FontFace must not be the upload gate.
export function isTrueTypeFont(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 12) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const signature = view.getUint32(0);
  if (signature !== 0x00010000 && signature !== 0x74727565) return false; // 1.0 or "true"

  const tableCount = view.getUint16(4);
  if (tableCount === 0 || 12 + tableCount * 16 > bytes.length) return false;
  let hasHead = false;
  let hasGlyphs = false;
  for (let i = 0; i < tableCount; i++) {
    const entry = 12 + i * 16;
    const tag = view.getUint32(entry);
    const offset = view.getUint32(entry + 8);
    const length = view.getUint32(entry + 12);
    if (offset > bytes.length || length > bytes.length - offset) return false;
    if (tag === 0x68656164) hasHead = true; // head
    if (tag === 0x676c7966) hasGlyphs = true; // glyf
  }
  return hasHead && hasGlyphs;
}

// ~DY commands are ~2x the font size; keep at most one encoding per usable
// font ID so removed or renamed fonts don't pin multi-MB strings for the
// whole session.
const encodedDownloads = new Map();
const ENCODED_DOWNLOADS_MAX = CUSTOM_FONT_IDS.length;

// Parsed hhea line heights, keyed by content hash. Same cap as above: only the
// fonts that can be assigned to a font ID are worth keeping.
const lineHeightRatios = new Map();

function findTable(view, byteLength, tag, minLength) {
  const tableCount = view.getUint16(4);
  if (tableCount === 0 || 12 + tableCount * 16 > byteLength) return null;
  for (let i = 0; i < tableCount; i++) {
    const entry = 12 + i * 16;
    if (view.getUint32(entry) !== tag) continue;
    const offset = view.getUint32(entry + 8);
    return offset + minLength <= byteLength ? offset : null;
  }
  return null;
}

// Line pitch a downloaded font contributes to ^TB, as a fraction of the ^A
// height: (hhea ascender - descender + lineGap) / unitsPerEm. Verified against
// Labelary at 20/40/60/80-dot heights for OCR-A (1.408), OCR-B (1.364) and
// VeraMono (1.164). ^FB ignores these metrics and always steps one font height.
export function readFontLineHeightRatio(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 12) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const head = findTable(view, bytes.length, 0x68656164, 20); // unitsPerEm at +18
  const hhea = findTable(view, bytes.length, 0x68686561, 10); // ascender/descender/lineGap at +4/+6/+8
  if (head === null || hhea === null) return null;
  const unitsPerEm = view.getUint16(head + 18);
  if (!unitsPerEm) return null;
  const ratio = (view.getInt16(hhea + 4) - view.getInt16(hhea + 6) + view.getInt16(hhea + 8)) / unitsPerEm;
  return ratio > 0 ? ratio : null;
}

// Cached readFontLineHeightRatio for a font source; renderers call this per
// element per frame, so the base64 decode must not repeat. Returns null for
// sources whose payload is missing or unparseable (reference-only fonts).
export function customFontLineHeightRatio(source) {
  if (!source) return null;
  const key = source.sha256;
  if (key && lineHeightRatios.has(key)) return lineHeightRatios.get(key);
  const ratio = readFontLineHeightRatio(fontBytesFromSource(source));
  if (key) {
    if (lineHeightRatios.size >= ENCODED_DOWNLOADS_MAX) {
      lineHeightRatios.delete(lineHeightRatios.keys().next().value);
    }
    lineHeightRatios.set(key, ratio);
  }
  return ratio;
}

export function normalizePrinterFontPath(value) {
  return String(value || '').trim().toUpperCase();
}

// ZPL paths without a drive letter refer to the printer's default R: drive.
export function ensurePrinterDrive(path) {
  return path && !path.includes(':') ? `R:${path}` : path;
}

// Byte length of a font source. Uploaded and imported sources both record it;
// the base64 estimate is the fallback for a hand-authored template.
export function fontSourceSize(source) {
  if (Number.isFinite(source?.size)) return source.size;
  return Math.floor((source?.data?.length || 0) * 3 / 4);
}

export function exceedsApiPreview(source) {
  return fontSourceSize(source) > MAX_API_PREVIEW_FONT_BYTES;
}

// A source's sha256 is its identity: it names the FontFace family, keys the
// preview caches, and reaches CSS through the specimen. Templates arrive from
// places the editor doesn't control (share URL, file import, embed host), so a
// hash that isn't a real digest is never taken for one.
const FONT_HASH_RE = /^[0-9a-f]{64}$/;

export function isValidFontHash(hash) {
  return typeof hash === 'string' && FONT_HASH_RE.test(hash);
}

// Invalid hashes collapse onto one inert family that nothing ever registers,
// so the specimen falls back instead of carrying an attacker-chosen string
// into CSS or canvas font declarations.
export function customFontFamily(source) {
  return `zpl-custom-${isValidFontHash(source?.sha256) ? source.sha256 : 'unverified'}`;
}

export function fontBytesFromSource(source) {
  if (!source?.data) return null;
  try {
    const binary = atob(source.data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

export function bytesToBase64(bytes) {
  let out = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(out);
}

export async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// The parser is synchronous and cannot hash, so imported ~DY sources arrive
// without a sha256. Fill it in (the content identity for FontFace families and
// preview caching) before the fonts are committed to app state; a payload that
// no longer decodes is dropped to reference-only rather than kept half-valid.
// A hash the template supplied is recomputed rather than trusted — only the
// bytes decide the identity.
export async function normalizeCustomFontSources(customFonts = []) {
  for (const font of customFonts) {
    if (!font.source) continue;
    const bytes = fontBytesFromSource(font.source);
    if (bytes) {
      font.source.sha256 = await sha256Hex(bytes);
    } else {
      delete font.source;
    }
  }
}

export function sanitizePrinterFontPath(fileName, existingFonts = []) {
  const rawStem = String(fileName || 'FONT').replace(/\.[^.]*$/, '').toUpperCase();
  const stem = rawStem.replace(/[^A-Z0-9]/g, '').slice(0, 16) || 'FONT';
  const used = new Set(existingFonts.map(f => normalizePrinterFontPath(f.fontFile)));
  let candidate = `E:${stem}.TTF`;
  for (let n = 2; used.has(candidate); n++) {
    const suffix = String(n);
    candidate = `E:${stem.slice(0, 16 - suffix.length)}${suffix}.TTF`;
  }
  return candidate;
}

export function nextCustomFontId(existingFonts = []) {
  const used = new Set(existingFonts.map(f => String(f.id || '').toUpperCase()));
  return CUSTOM_FONT_IDS.find(id => !used.has(id)) || '';
}

export function formatFontDownload(font) {
  if (!font?.source || !PRINTER_FONT_PATH_RE.test(normalizePrinterFontPath(font.fontFile))) return '';
  const cacheKey = `${font.source.sha256 || font.source.data}|${font.fontFile}`;
  if (encodedDownloads.has(cacheKey)) return encodedDownloads.get(cacheKey);
  const bytes = fontBytesFromSource(font.source);
  if (!bytes || bytes.length === 0 || bytes.length > MAX_CUSTOM_FONT_BYTES) return '';
  const hex = bytesToHex(bytes);
  const path = normalizePrinterFontPath(font.fontFile);
  const colon = path.indexOf(':');
  const drive = path.slice(0, colon + 1);
  const stem = path.slice(colon + 1, -4);
  const zpl = `~DY${drive}${stem},A,T,${bytes.length},,${hex}`;
  if (encodedDownloads.size >= ENCODED_DOWNLOADS_MAX) {
    encodedDownloads.delete(encodedDownloads.keys().next().value);
  }
  encodedDownloads.set(cacheKey, zpl);
  return zpl;
}

// Identity of the ~DY preamble that buildFontDownloadPreamble would emit,
// small enough to use in cache keys instead of the multi-MB preamble itself.
export function fontPreambleSignature(elements, labelSettings) {
  return apiPreviewFonts(elements, labelSettings)
    .map(font => `${font.source.sha256}:${normalizePrinterFontPath(font.fontFile)}`)
    .join(';');
}

// The referenced fonts small enough to travel to Labelary. An oversized font
// still renders on the canvas; the API preview just falls back to its own face.
function apiPreviewFonts(elements, labelSettings) {
  return referencedCustomFonts(elements, labelSettings)
    .filter(font => font.source && !exceedsApiPreview(font.source));
}

export function referencedCustomFonts(elements, labelSettings) {
  const ids = new Set([labelSettings?.fontId || '0']);
  for (const element of elements || []) if (element.fontId) ids.add(element.fontId);
  return (labelSettings?.customFonts || []).filter(font => ids.has(font.id));
}

export function buildFontDownloadPreamble(elements, labelSettings) {
  return apiPreviewFonts(elements, labelSettings)
    .map(formatFontDownload)
    .filter(Boolean)
    .join('\n');
}
