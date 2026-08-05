// ZPL Parser Service
// Parses ZPL template strings into app element objects and label settings

import { b64WithCrcToBytes, hexToBytes, z64ToBytes } from '../utils/graphicField.js';
import { snapRequestedToAllowed, enforceFontMinSize } from '../utils/zplFontSnap.js';
import { decodeFieldData, getFieldHexIndicator, decodeFieldBlockBreaks, collapseLineBreaks, FB_LINE_BREAK } from '../utils/zplFieldData.js';
import { placeholderName } from '../utils/placeholders.js';
import { DATABAR_TYPE_BY_NUM, getParserSymbology } from '../barcodes/QRCodeSymbologies.js';
import { MAX_CUSTOM_FONT_BYTES, bytesToBase64, ensurePrinterDrive, normalizePrinterFontPath, nextCustomFontId } from '../utils/customFonts.js';

/**
 * Known ZPL commands that the parser handles (won't generate warnings)
 */
const KNOWN_COMMANDS = new Set([
  'XA', 'XZ', 'PW', 'PR', 'PO', 'PM', 'MN', 'LL', 'SD', 'LH', 'LT', 'CI', 'MT',
  'CF', 'CW', 'DY', 'PQ', 'FO', 'FT', 'A', 'FB', 'TB', 'FD', 'FH', 'FS', 'FR', 'BC', 'BY',
  'BQ', 'GB', 'GE', 'GC', 'GD', 'GF', 'GS', 'FX',
  // Native variable and clock commands are supported no-ops during import.
  'FE', 'FC', 'FN', 'SO',
  // Additional barcode symbologies: ^B3 (Code 39) and ^B7 (PDF417) tokenize as
  // 'B' since the tokenizer only captures letters; ^BA/^BE/^BI/^BJ/^BK/^BL/^BM/^BP/^BS/^BU/^BX/^BZ are two-letter.
  'B', 'BA', 'BB', 'BD', 'BE', 'BF', 'BI', 'BJ', 'BK', 'BL', 'BM', 'BP', 'BR', 'BS', 'BT', 'BU', 'BX', 'BZ'
]);

/**
 * Allowed label-metadata bounds, mirroring the editor's own UI constraints
 * (index.html: width/height min=10 max=381 mm; dpmm select 6/8/12/24). The
 * ^FX metadata comment is validated against these so an imported comment can
 * only ever narrow into known-good settings, never inject arbitrary values.
 */
const META_MM_MIN = 10;
const META_MM_MAX = 381;
const META_ALLOWED_DPMM = new Set([6, 8, 12, 24]);

function isValidMetaMm(value) {
  return Number.isFinite(value) && value >= META_MM_MIN && value <= META_MM_MAX;
}

function isValidMetaDpmm(value) {
  return META_ALLOWED_DPMM.has(value);
}

/**
 * Clamp an ellipse/circle dimension (^GE width/height, ^GC diameter) to ZPL's
 * documented 3–4095 dot range. Larger values are replaced with 4095 per the
 * ^GE/^GC spec; smaller values are floored to 3.
 */
function clampShapeDim(value, fallback) {
  const n = parseInt(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(4095, Math.max(3, n));
}

/**
 * Clamp a ^GE/^GC border thickness to ZPL's documented 2–4095 dot range.
 */
function clampShapeThickness(value, fallback) {
  const n = parseInt(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(4095, Math.max(2, n));
}

/**
 * Normalise a ^GE/^GC line color to the documented B/W values, defaulting any
 * other value to B (black).
 */
function normalizeShapeColor(value) {
  const c = (value || '').trim().toUpperCase();
  return c === 'W' ? 'W' : 'B';
}

function normalizeBarcodeOrientation(value) {
  const orientation = (value || 'N').trim().toUpperCase();
  return ['N', 'R', 'I', 'B'].includes(orientation) ? orientation : 'N';
}

/**
 * Header commands that configure label settings (not element-specific)
 */
const HEADER_COMMANDS = new Set([
  'XA', 'XZ', 'PW', 'PR', 'PO', 'PM', 'MN', 'LL', 'SD', 'LH', 'LT', 'CI', 'MT',
  'CF', 'CW', 'DY', 'PQ'
]);

/**
 * Service for parsing ZPL (Zebra Programming Language) strings into template objects
 */
export class ZPLParser {
  /**
   * Parse a complete ZPL string into a template object
   * @param {string} zpl - Raw ZPL string
   * @param {Object} options - Parsing options
   * @param {number} options.dpmm - Dots per mm (needed to convert ^PW dots to mm). Default: 8
   * @param {number} options.labelHeight - Default label height in mm. Default: 50
   * @returns {{ elements: Array, labelSettings: Object, warnings: Array<{command: string, message: string}> }}
   */
  parse(zpl, options = {}) {
    const dpmm = options.dpmm || 8;
    const labelHeight = options.labelHeight || 50;

    // Validate basic structure
    if (!zpl || typeof zpl !== 'string') {
      return { elements: [], labelSettings: this._defaultLabelSettings(dpmm, labelHeight), warnings: [{ command: '', message: 'Empty or invalid ZPL input' }] };
    }

    if (!zpl.includes('^XA') || !zpl.includes('^XZ')) {
      return { elements: [], labelSettings: this._defaultLabelSettings(dpmm, labelHeight), warnings: [{ command: '', message: 'Missing ^XA/^XZ delimiters' }] };
    }

    const { source, tokens } = this._tokenize(zpl);
    return this._processTokens(tokens, { dpmm, labelHeight, source });
  }

  /**
   * Read our label-metadata object from an ^FX comment payload. Returns the
   * `labelMeta` object, or null if the payload isn't our sentinel-keyed JSON
   * (a human-authored note, malformed JSON, etc.). Only honored from a leading
   * comment slot (see _processTokens), so a stray body comment can't rewrite
   * settings.
   */
  _readLabelMeta(params) {
    try {
      const obj = JSON.parse(params);
      if (obj && typeof obj.labelMeta === 'object' && obj.labelMeta !== null) {
        return obj.labelMeta;
      }
    } catch {
      // Not our comment.
    }
    return null;
  }

  /**
   * Tokenize ZPL into an array of command objects
   * @param {string} zpl - Raw ZPL string
   * Tokens carry `start`/`end` offsets into the returned `source` string so a
   * command can be recovered byte for byte (original casing, whitespace, and
   * parameters the parser itself doesn't read). Passthrough capture depends on
   * this — re-synthesising from `params` loses all three.
   * @returns {{ source: string, tokens: Array<{prefix: string, command: string, params: string, start: number, end: number}> }}
   */
  _tokenize(zpl) {
    // Extract content between first ^XA and last ^XZ
    const xaIndex = zpl.indexOf('^XA');
    const xzIndex = zpl.lastIndexOf('^XZ');
    if (xaIndex === -1 || xzIndex === -1 || xaIndex >= xzIndex) {
      return { source: '', tokens: [] };
    }

    const content = zpl.substring(xaIndex, xzIndex + 3);
    const tokens = [];

    // Font downloads are immediate commands and conventionally live before
    // ^XA. Extract hex TrueType ~DY commands from the preamble so
    // self-contained font ZPL can be imported and associated with the later
    // ^CW mapping, but leave everything else before ^XA untokenized — other
    // immediate commands and binary payloads there have always been ignored.
    for (const match of zpl.slice(0, xaIndex).matchAll(/~DY([^~^]*)/gi)) {
      const params = match[1].trim();
      const parts = params.split(',');
      const isHexTrueType = (parts[1] || '').trim().toUpperCase() === 'A'
        && (parts[2] || '').trim().toUpperCase() === 'T';
      // Sliced from the preamble, not from `content`, so these carry no span.
      // ~DY is a known command and can never enter a passthrough run.
      if (isHexTrueType) tokens.push({ prefix: '~', command: 'DY', params, start: -1, end: -1 });
    }

    // Match command starts: ^ or ~ followed by 1-2 letter command code
    const commandRegex = /([~^])([A-Za-z]{1,2})/g;
    const matches = [];
    let match;

    while ((match = commandRegex.exec(content)) !== null) {
      let command = match[2].toUpperCase();
      let codeEnd = match.index + match[0].length;

      // ^A is a single-char command where the next char is the font ID parameter,
      // not part of the command code. The regex greedily captures 2 chars (e.g. "AD"),
      // so we split: command = "A", and the second char goes back into params.
      if (command.length === 2 && command[0] === 'A') {
        codeEnd = match.index + match[0].length - 1; // exclude the font ID char from command
        command = 'A';
      }

      matches.push({
        prefix: match[1],
        command,
        index: match.index,
        codeEnd
      });
    }

    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      const nextIndex = (i + 1 < matches.length) ? matches[i + 1].index : content.length;

      // Special handling for ^FD: consume everything until ^FS
      if (m.command === 'FD') {
        // Find the next ^FS token
        let fsIndex = -1;
        for (let j = i + 1; j < matches.length; j++) {
          if (matches[j].command === 'FS') {
            fsIndex = matches[j].index;
            break;
          }
        }
        const paramEnd = fsIndex !== -1 ? fsIndex : nextIndex;
        const params = content.substring(m.codeEnd, paramEnd).replace(/^\s+/, '');
        tokens.push({ prefix: m.prefix, command: m.command, params, start: m.index, end: paramEnd });
      } else if (m.command === 'FX') {
        // ^FX is a comment: consume everything through the matching ^FS as an
        // opaque payload, and skip the contained matches so any ^/~ sequences
        // inside the comment are NOT re-tokenized as live commands. The ^FS is
        // optional (the label-metadata comment is emitted without one), so the
        // search is bounded to the comment's own line — otherwise an
        // unterminated comment would swallow a later element's ^FS and every
        // command in between.
        const nlIndex = content.indexOf('\n', m.codeEnd);
        const lineEnd = nlIndex === -1 ? content.length : nlIndex;
        let fsMatchIdx = -1;
        let lastInside = i;
        for (let j = i + 1; j < matches.length && matches[j].index < lineEnd; j++) {
          if (matches[j].command === 'FS') {
            fsMatchIdx = j;
            break;
          }
          lastInside = j;
        }
        const paramEnd = fsMatchIdx !== -1 ? matches[fsMatchIdx].index : lineEnd;
        const params = content.substring(m.codeEnd, paramEnd).replace(/^\s+/, '').replace(/\s+$/, '');
        tokens.push({ prefix: m.prefix, command: 'FX', params, start: m.index, end: paramEnd });
        // Resume just before the ^FS so it is still emitted normally (it closes
        // the comment / any open group); with no ^FS, resume after the inert
        // matches the comment consumed.
        i = fsMatchIdx !== -1 ? fsMatchIdx - 1 : lastInside;
      } else {
        const params = content.substring(m.codeEnd, nextIndex).replace(/^\s+/, '').replace(/\s+$/, '');
        tokens.push({ prefix: m.prefix, command: m.command, params, start: m.index, end: nextIndex });
      }
    }

    return { source: content, tokens };
  }

  /**
   * Process token array into elements and label settings
   * @param {Array} tokens - Token array from _tokenize()
   * @param {Object} options - Parse options
   * @returns {{ elements: Array, labelSettings: Object, warnings: Array }}
   */
  _processTokens(tokens, options) {
    const { dpmm, labelHeight, source = '' } = options;

    const state = {
      labelSettings: this._defaultLabelSettings(dpmm, labelHeight),
      elements: [],
      warnings: [],
      currentGroup: null,
      barcodeDefaults: { width: 2, ratio: 2.0, height: 50 },
      defaultFont: { id: '0', height: 20, width: 0 },
      customFonts: [],
      fontDownloads: new Map(),
      // ^CW may appear after the fields it applies to, so its font IDs are
      // reserved up front — an ^A@ font must not be assigned a letter that a
      // later ^CW claims, or the label would emit two ^CW for the same ID.
      reservedFontIds: tokens.filter(t => t.command === 'CW').map(t => ({ id: t.params.split(',')[0].trim() })),
      lastScalableFontFile: null,
      labelMeta: null,
      sawCommand: false,
      source,
      rawRun: null,
      lastBYSource: null
    };

    for (const token of tokens) {
      // Check for unknown commands. ^B is only "known" for ^B0 (Aztec), ^B1 (Code 11),
      // ^B2 (Interleaved 2 of 5), ^B3 (Code 39), ^B4 (Code 49), ^B5 (Planet Code), ^B7
      // (PDF417), ^B8 (EAN-8) and ^B9 (UPC-E); other numeric variants (^B6, …) have no
      // dispatch branch and would otherwise be dropped silently, so they must still warn.
      const isKnown = KNOWN_COMMANDS.has(token.command)
        && (token.command !== 'B'
          || token.params.charAt(0) === '0'
          || token.params.charAt(0) === '1'
          || token.params.charAt(0) === '2'
          || token.params.charAt(0) === '3'
          || token.params.charAt(0) === '4'
          || token.params.charAt(0) === '5'
          || token.params.charAt(0) === '7'
          || token.params.charAt(0) === '8'
          || token.params.charAt(0) === '9');
      if (!isKnown) {
        state.warnings.push({
          command: `${token.prefix}${token.command}`,
          message: `Unsupported command "${token.prefix}${token.command}" was preserved as a Raw ZPL element`
        });
        if (state.currentGroup) {
          // Mark the group; its whole source span becomes one RAW at the ^FS.
          state.currentGroup.hasUnknown = true;
        } else if (state.rawRun) {
          state.rawRun.end = token.end;
        } else {
          state.rawRun = { start: token.start, end: token.end };
        }
        continue;
      }

      // A raw run absorbs the field data belonging to its unknown command
      // (^RFW,H,1,2^FD1234^FS is one passthrough unit) and closes at the ^FS.
      // Any other command ends the run and is then processed normally.
      if (state.rawRun) {
        if (token.command === 'FD' || token.command === 'FH' || token.command === 'FR') {
          state.rawRun.end = token.end;
          continue;
        }
        if (token.command === 'FS') {
          state.rawRun.end = token.end;
          this._flushRawRun(state);
          continue;
        }
        this._flushRawRun(state);
      }

      // ^FX (comment): inert by design. Honor label metadata only from a leading
      // comment — before any other command (the canonical slot the generator
      // emits, right after ^XA) — so a stray body comment can't rewrite settings.
      if (token.command === 'FX') {
        if (!state.sawCommand && !state.labelMeta) {
          const meta = this._readLabelMeta(token.params);
          if (meta) state.labelMeta = meta;
        }
        continue;
      }
      if (token.command !== 'XA' && token.command !== 'XZ') {
        state.sawCommand = true;
      }

      // ^FO starts a new element group
      if (token.command === 'FO') {
        const parts = token.params.split(',');
        state.currentGroup = {
          x: parseInt(parts[0]) || 0,
          y: parseInt(parts[1]) || 0,
          commands: [],
          sourceStart: token.start
        };
        continue;
      }

      // ^FT (Field Typeset) is treated as ^FO (Field Origin)
      // ^FT uses bottom-left origin while ^FO uses top-left, so positions may need adjustment
      if (token.command === 'FT') {
        const parts = token.params.split(',');
        state.currentGroup = {
          x: parseInt(parts[0]) || 0,
          y: parseInt(parts[1]) || 0,
          commands: [],
          sourceStart: token.start,
          isFT: true
        };
        // The conversion warning waits until the group closes: a group that
        // turns out to hold an unknown command is preserved verbatim as ^FT,
        // so nothing was converted and the warning would be false.
        continue;
      }

      // ^FS ends the current element group
      if (token.command === 'FS') {
        if (state.currentGroup) {
          const group = state.currentGroup;
          if (group.hasUnknown) {
            // Any unknown command makes the whole group opaque. Splitting a
            // known element out of it would silently drop the unknown one,
            // which is the data loss this element type exists to prevent.
            state.elements.push(this._buildRawData(state, group.sourceStart, token.end));
          } else {
            const element = this._buildElement(group, state);
            if (element) {
              state.elements.push(element);
              if (group.isFT && !state.ftWarningAdded) {
                state.warnings.push({
                  command: '^FT',
                  message: '^FT (Field Typeset) was converted to ^FO (Field Origin). Position may need adjustment — ^FT uses bottom-left origin while ^FO uses top-left.'
                });
                state.ftWarningAdded = true;
              }
            }
          }
          state.currentGroup = null;
        }
        continue;
      }

      // If inside an element group, accumulate commands
      if (state.currentGroup) {
        // ^BY inside a group also updates barcode defaults
        if (token.command === 'BY') {
          this._parseBY(token, state);
        }
        state.currentGroup.commands.push(token);
        continue;
      }

      // Outside a group: handle header/global commands
      if (token.command === 'BY') {
        this._parseBY(token, state);
        continue;
      }

      if (HEADER_COMMANDS.has(token.command)) {
        this._parseHeaderCommand(token, state, options);
      }
    }

    // A run that never saw its ^FS (or ran to ^XZ) is still preserved.
    this._flushRawRun(state);

    // Apply custom fonts to label settings, attaching ~DY payloads to their
    // ^CW mappings here so command order doesn't matter.
    if (state.customFonts.length > 0) {
      state.labelSettings.customFonts = state.customFonts.map(font => {
        const source = state.fontDownloads.get(font.fontFile);
        return source ? { ...font, source } : font;
      });
    }

    // Apply validated label metadata last so it overrides ^PW-derived width and
    // the dpmm/height defaults. Each field is validated independently against the
    // editor's bounds; an invalid value is ignored (falls back) and warns, while
    // unknown keys are silently skipped (forward-compat).
    this._applyLabelMeta(state);

    return {
      elements: state.elements,
      labelSettings: state.labelSettings,
      warnings: state.warnings
    };
  }

  /**
   * Build a RAW element data object from a source span. The span is sliced out
   * of the original ZPL rather than re-synthesised from tokens, so casing,
   * inner whitespace, ^FT vs ^FO and parameters the parser doesn't read (a
   * third ^FO justification value, say) all survive untouched.
   */
  _buildRawData(state, start, end) {
    let text = (start >= 0 && end > start)
      ? state.source.substring(start, end).replace(/\s+$/, '')
      : '';

    // ^BY is modal: it sets barcode module width/ratio/height for every ^B that
    // follows, and the generator re-emits it per known barcode rather than in
    // the header. A preserved barcode therefore has to carry its own copy, or
    // it round-trips at whatever defaults the previous element happened to
    // leave behind. Only barcodes need it, and only if the span lacks its own.
    if (state.lastBYSource && /\^B(?!Y)/i.test(text) && !/\^BY/i.test(text)) {
      text = state.lastBYSource + text;
    }

    return { type: 'RAW', text };
  }

  /**
   * Emit the open passthrough run, if any, as a RAW element.
   */
  _flushRawRun(state) {
    if (!state.rawRun) return;
    state.elements.push(this._buildRawData(state, state.rawRun.start, state.rawRun.end));
    state.rawRun = null;
  }

  /**
   * Parse ^BY command (barcode field defaults)
   */
  _parseBY(token, state) {
    const parts = token.params.split(',');
    if (parts[0]) state.barcodeDefaults.width = parseInt(parts[0]) || 2;
    if (parts[1]) state.barcodeDefaults.ratio = parseFloat(parts[1]) || 2.0;
    if (parts[2]) state.barcodeDefaults.height = parseInt(parts[2]) || state.barcodeDefaults.height;
    // Kept verbatim so a preserved barcode can re-assert these defaults; see
    // _buildRawData.
    if (token.start >= 0 && token.end > token.start) {
      state.lastBYSource = state.source.substring(token.start, token.end).replace(/\s+$/, '');
    }
  }

  /**
   * Validate and apply the stashed ^FX label metadata (width/height in mm,
   * dpmm) over the resolved label settings. Out-of-range values are ignored
   * (the existing ^PW/option-derived value stands) and produce a warning;
   * unknown keys are silently dropped.
   */
  _applyLabelMeta(state) {
    const meta = state.labelMeta;
    if (!meta) return;

    if (meta.w !== undefined) {
      if (isValidMetaMm(meta.w)) {
        state.labelSettings.width = meta.w;
      } else {
        state.warnings.push({ command: '^FX', message: `Ignored invalid label width "${meta.w}" in metadata (allowed ${META_MM_MIN}–${META_MM_MAX} mm)` });
      }
    }

    if (meta.h !== undefined) {
      if (isValidMetaMm(meta.h)) {
        state.labelSettings.height = meta.h;
      } else {
        state.warnings.push({ command: '^FX', message: `Ignored invalid label height "${meta.h}" in metadata (allowed ${META_MM_MIN}–${META_MM_MAX} mm)` });
      }
    }

    if (meta.dpmm !== undefined) {
      if (isValidMetaDpmm(meta.dpmm)) {
        state.labelSettings.dpmm = meta.dpmm;
      } else {
        state.warnings.push({ command: '^FX', message: `Ignored invalid dpmm "${meta.dpmm}" in metadata (allowed 6, 8, 12, 24)` });
      }
    }
  }

  /**
   * Parse a header command and update label settings
   */
  _parseHeaderCommand(token, state, options) {
    const { dpmm } = options;

    switch (token.command) {
      case 'PW': {
        const dots = parseInt(token.params);
        if (dots > 0) {
          state.labelSettings.width = Math.round(dots / dpmm);
        }
        break;
      }
      case 'PR': {
        const parts = token.params.split(',');
        if (parts[0]) state.labelSettings.printSpeed = parseInt(parts[0]) || 4;
        if (parts[1]) state.labelSettings.slewSpeed = parseInt(parts[1]) || 4;
        if (parts[2]) state.labelSettings.backfeedSpeed = parseInt(parts[2]) || 4;
        break;
      }
      case 'PO': {
        const val = token.params.trim().charAt(0);
        if ('NIRB'.includes(val)) {
          state.labelSettings.printOrientation = val;
        }
        break;
      }
      case 'PM': {
        const val = token.params.trim().charAt(0);
        if ('NY'.includes(val)) {
          state.labelSettings.printMirror = val;
        }
        break;
      }
      case 'MN': {
        // ^MN media tracking; first char selects the mode. W (web sensing) maps
        // to the editor's Y (web/gap); other values fall through unchanged.
        let val = token.params.trim().charAt(0).toUpperCase();
        if (val === 'W') val = 'Y';
        if ('NYMA'.includes(val)) {
          state.labelSettings.mediaTracking = val;
        }
        break;
      }
      case 'MT': {
        // ^MT media type; first char selects T (thermal transfer) or D (direct thermal).
        const val = token.params.trim().charAt(0).toUpperCase();
        if ('TD'.includes(val)) {
          state.labelSettings.mediaType = val;
        }
        break;
      }
      case 'LL': {
        // ^LL label length in dots → height in mm, parallel to the ^PW case.
        // Overridden later by ^FX metadata height when present.
        const dots = parseInt(token.params);
        if (dots > 0) {
          state.labelSettings.height = Math.round(dots / dpmm);
        }
        break;
      }
      case 'SD': {
        const val = parseInt(token.params);
        if (val >= 0 && val <= 30) {
          state.labelSettings.mediaDarkness = val;
        }
        break;
      }
      case 'LH': {
        const parts = token.params.split(',');
        state.labelSettings.homeX = Math.abs(parseInt(parts[0]) || 0);
        state.labelSettings.homeY = Math.abs(parseInt(parts[1]) || 0);
        break;
      }
      case 'LT': {
        state.labelSettings.labelTop = parseInt(token.params) || 0;
        break;
      }
      case 'CF': {
        const parts = token.params.split(',');
        if (parts[0]) {
          state.labelSettings.fontId = parts[0].trim();
          state.defaultFont.id = parts[0].trim();
        }
        if (parts[1]) {
          const h = parseInt(parts[1]);
          if (h > 0) {
            const { height } = enforceFontMinSize(state.defaultFont.id, h, 0);
            state.labelSettings.defaultFontHeight = height;
            state.defaultFont.height = height;
          }
        }
        if (parts[2]) {
          const w = parseInt(parts[2]);
          if (w > 0) {
            const { width } = enforceFontMinSize(state.defaultFont.id, 0, w);
            state.labelSettings.defaultFontWidth = width;
            state.defaultFont.width = width;
          }
        }
        break;
      }
      case 'CW': {
        const parts = token.params.split(',');
        const rawFile = parts.slice(1).join(',').trim().toUpperCase();
        if (rawFile) {
          state.customFonts.push({ id: parts[0].trim(), fontFile: ensurePrinterDrive(rawFile) });
        }
        break;
      }
      case 'DY': {
        const parts = token.params.split(',');
        const rawPath = (parts[0] || '').trim().toUpperCase();
        const format = (parts[1] || '').trim().toUpperCase();
        const extension = (parts[2] || '').trim().toUpperCase();
        const byteCount = Number.parseInt(parts[3], 10);
        // hexToBytes tolerates line-wrapped payloads and returns null on
        // non-hex characters.
        const bytes = hexToBytes(parts[5] || '');
        if (format !== 'A' || extension !== 'T' || !rawPath || !Number.isFinite(byteCount)
          || byteCount <= 0 || byteCount > MAX_CUSTOM_FONT_BYTES
          || !bytes || bytes.length !== byteCount) {
          state.warnings.push({ command: '~DY', message: 'Invalid or unsupported embedded font was ignored' });
          break;
        }
        // ~DY names appear both with and without the extension in the wild;
        // key on the same canonical form ^CW paths are normalized to. The
        // sha256 identity is filled in by normalizeCustomFontSources() on the
        // async import path, since parsing is synchronous.
        const path = ensurePrinterDrive(rawPath);
        const fontFile = path.endsWith('.TTF') ? path : `${path}.TTF`;
        state.fontDownloads.set(fontFile, {
          fileName: fontFile.slice(fontFile.indexOf(':') + 1),
          mimeType: 'font/ttf',
          size: byteCount,
          data: bytesToBase64(bytes),
        });
        break;
      }
      case 'PQ': {
        const parts = token.params.split(',');
        const qtyStr = parts[0] || '';
        // ^PQ's quantity is a bare placeholder name, not a Content template
        const qtyPlaceholder = placeholderName(qtyStr);
        if (qtyPlaceholder) {
          state.labelSettings.printQuantityPlaceholder = qtyPlaceholder;
          state.labelSettings.printQuantity = 1;
        } else {
          state.labelSettings.printQuantity = parseInt(qtyStr) || 1;
        }
        if (parts[1]) state.labelSettings.pauseCount = parseInt(parts[1]) || 0;
        if (parts[2]) state.labelSettings.replicates = parseInt(parts[2]) || 0;
        break;
      }
      // Silently accepted commands (no-op)
      case 'CI':
      case 'XA':
      case 'XZ':
        break;
    }
  }

  /**
   * Build an element data object from an accumulated command group
   * @param {Object} group - { x, y, commands: Array }
   * @param {Object} state - Parser state
   * @returns {Object|null} Element data object
   */
  _buildElement(group, state) {
    const commands = group.commands;
    const hasCommand = (cmd) => commands.some(c => c.command === cmd);
    const getCommand = (cmd) => commands.find(c => c.command === cmd);
    const fhToken = getCommand('FH');

    // Determine element type based on commands present
    if (hasCommand('GF')) {
      return this._parseGraphicField(group, getCommand('GF'), getCommand('FD'), hasCommand('FR'), state);
    }

    if (hasCommand('GC')) {
      return this._parseCircleFromGC(group, getCommand('GC'), hasCommand('FR'));
    }

    if (hasCommand('GE')) {
      return this._parseCircle(group, getCommand('GE'), hasCommand('FR'));
    }

    if (hasCommand('GD')) {
      return this._parseDiagonalLine(group, getCommand('GD'), hasCommand('FR'));
    }

    if (hasCommand('GS')) {
      return this._parseGraphicSymbol(group, getCommand('GS'), getCommand('FD'), fhToken, hasCommand('FR'), state);
    }

    if (hasCommand('GB')) {
      return this._parseGraphicBox(group, getCommand('GB'), hasCommand('FR'));
    }

    if (hasCommand('BQ')) {
      return this._parseQRCode(group, getCommand('BQ'), getCommand('FD'), hasCommand('FR'), state, fhToken);
    }

    if (hasCommand('BX')) {
      return this._parseDataMatrix(group, getCommand('BX'), getCommand('FD'), hasCommand('FR'), fhToken);
    }

    if (hasCommand('BF')) {
      return this._parseMicroPDF417(group, getCommand('BF'), getCommand('BY'), getCommand('FD'), hasCommand('FR'), fhToken);
    }

    for (const command of ['BB', 'BD', 'BR', 'BT']) {
      if (hasCommand(command)) {
        return getParserSymbology(command).parse(this, group, getCommand(command), getCommand('FD'), hasCommand('FR'), fhToken);
      }
    }

    if (hasCommand('BE')) {
      return this._parseBarcode(group, getCommand('BE'), getCommand('BY'), getCommand('FD'), hasCommand('FR'), state, 'EAN13', fhToken);
    }

    if (hasCommand('BU')) {
      return this._parseBarcode(group, getCommand('BU'), getCommand('BY'), getCommand('FD'), hasCommand('FR'), state, 'UPCA', fhToken);
    }

    if (hasCommand('BC')) {
      return this._parseBarcode(group, getCommand('BC'), getCommand('BY'), getCommand('FD'), hasCommand('FR'), state, 'CODE128', fhToken);
    }

    if (hasCommand('BA')) {
      return this._parseBarcode(group, getCommand('BA'), getCommand('BY'), getCommand('FD'), hasCommand('FR'), state, 'CODE93', fhToken);
    }

    if (hasCommand('BK')) {
      return this._parseBarcode(group, getCommand('BK'), getCommand('BY'), getCommand('FD'), hasCommand('FR'), state, 'CODABAR', fhToken);
    }

    if (hasCommand('BI')) {
      return this._parseBarcode(group, getCommand('BI'), getCommand('BY'), getCommand('FD'), hasCommand('FR'), state, 'INDUSTRIAL2OF5', fhToken);
    }

    if (hasCommand('BJ')) {
      return this._parseBarcode(group, getCommand('BJ'), getCommand('BY'), getCommand('FD'), hasCommand('FR'), state, 'STANDARD2OF5', fhToken);
    }

    if (hasCommand('BL')) {
      return this._parseBarcode(group, getCommand('BL'), getCommand('BY'), getCommand('FD'), hasCommand('FR'), state, 'LOGMARS', fhToken);
    }

    if (hasCommand('BM')) {
      return this._parseBarcode(group, getCommand('BM'), getCommand('BY'), getCommand('FD'), hasCommand('FR'), state, 'MSI', fhToken);
    }

    if (hasCommand('BP')) {
      return this._parseBarcode(group, getCommand('BP'), getCommand('BY'), getCommand('FD'), hasCommand('FR'), state, 'PLESSEY', fhToken);
    }

    if (hasCommand('BS')) {
      return this._parseBarcode(group, getCommand('BS'), getCommand('BY'), getCommand('FD'), hasCommand('FR'), state, 'UPCEANEXT', fhToken);
    }

    if (hasCommand('BZ')) {
      return this._parseBarcode(group, getCommand('BZ'), getCommand('BY'), getCommand('FD'), hasCommand('FR'), state, 'POSTNET', fhToken);
    }

    // ^B3 (Code 39), ^B4 (Code 49), ^B5 (Planet Code) and ^B7 (PDF417) tokenize as command
    // 'B' with the digit pushed into params, since the tokenizer only captures letters.
    if (hasCommand('B')) {
      const bToken = getCommand('B');
      const sub = bToken.params.charAt(0);
      const shifted = { ...bToken, params: bToken.params.slice(1) };
      if (sub === '1') {
        return this._parseBarcode(group, shifted, getCommand('BY'), getCommand('FD'), hasCommand('FR'), state, 'CODE11', fhToken);
      }
      if (sub === '2') {
        return this._parseBarcode(group, shifted, getCommand('BY'), getCommand('FD'), hasCommand('FR'), state, 'INTERLEAVED2OF5', fhToken);
      }
      if (sub === '3') {
        return this._parseBarcode(group, shifted, getCommand('BY'), getCommand('FD'), hasCommand('FR'), state, 'CODE39', fhToken);
      }
      if (sub === '4') {
        return this._parseCode49(group, shifted, getCommand('BY'), getCommand('FD'), hasCommand('FR'), fhToken);
      }
      if (sub === '5') {
        return this._parseBarcode(group, shifted, getCommand('BY'), getCommand('FD'), hasCommand('FR'), state, 'PLANET', fhToken);
      }
      if (sub === '7') {
        return this._parsePDF417(group, shifted, getCommand('BY'), getCommand('FD'), hasCommand('FR'), fhToken);
      }
      if (sub === '8') {
        return this._parseBarcode(group, shifted, getCommand('BY'), getCommand('FD'), hasCommand('FR'), state, 'EAN8', fhToken);
      }
      if (sub === '9') {
        return this._parseBarcode(group, shifted, getCommand('BY'), getCommand('FD'), hasCommand('FR'), state, 'UPCE', fhToken);
      }
      if (sub === '0') {
        return this._parseAztec(group, shifted, getCommand('FD'), hasCommand('FR'), fhToken);
      }
    }

    if (hasCommand('A') && hasCommand('TB')) {
      return this._parseTextBlock(group, getCommand('A'), getCommand('TB'), getCommand('FD'), hasCommand('FR'), state, fhToken);
    }

    if (hasCommand('A') && hasCommand('FB')) {
      return this._parseFieldBlock(group, getCommand('A'), getCommand('FB'), getCommand('FD'), hasCommand('FR'), state, fhToken);
    }

    if (hasCommand('A')) {
      return this._parseText(group, getCommand('A'), getCommand('FD'), hasCommand('FR'), state, fhToken);
    }

    // Unknown element group - skip
    return null;
  }

  /**
   * Parse ^A font command params
   * Format: {fontId}{orientation},{height},{width}[,{fontPath}] (e.g., "0N,30,30")
   * The font path is only carried by the scalable font ^A@ (e.g. "@N,20,18,E:FONT.TTF").
   * @returns {{ fontId: string, orientation: string, height: number, width: number, fontPath: string }}
   */
  _parseFontCommand(aToken) {
    const params = aToken.params;
    // First char is fontId, second is orientation, then comma-separated height,width
    const fontId = params.charAt(0) || '0';
    const validOrientations = ['N', 'R', 'I', 'B'];
    let orientation = params.charAt(1);
    let rest;
    if (validOrientations.includes(orientation)) {
      rest = params.substring(2);
    } else {
      // Orientation omitted (e.g. ^A0,30,20) — default to N
      orientation = 'N';
      rest = params.substring(1);
    }
    const parts = rest.split(',').filter(p => p !== '');
    const height = parseInt(parts[0]) || 0;
    const width = parseInt(parts[1]) || 0;
    // Read the path off the unfiltered params (minus the separator that follows
    // the font ID) so an omitted height or width can't shift it out of place.
    const fontPath = (rest.replace(/^,/, '').split(',')[2] || '').trim();

    return { fontId, orientation, height, width, fontPath };
  }

  /**
   * Map the scalable font ^A@ onto a custom font ID the editor can render and edit.
   * ^A@ addresses a printer-resident TrueType by path, and a path-less ^A@ reuses the
   * last one declared; each distinct path is registered once as a ^CW custom font and
   * every field referencing it gets that font's letter.
   */
  _resolveScalableFontId(font, state) {
    if (font.fontId !== '@') return font.fontId;

    const fontFile = font.fontPath
      ? ensurePrinterDrive(normalizePrinterFontPath(font.fontPath))
      : state.lastScalableFontFile;
    if (!fontFile) {
      state.warnings.push({
        command: '^A@',
        message: '^A@ was used before any font file was declared; the label default font was used instead'
      });
      return '';
    }
    state.lastScalableFontFile = fontFile;

    const existing = state.customFonts.find(f => normalizePrinterFontPath(f.fontFile) === fontFile);
    if (existing) return existing.id;

    const id = nextCustomFontId([...state.customFonts, ...state.reservedFontIds]);
    if (!id) {
      state.warnings.push({
        command: '^A@',
        message: `No custom font ID is left for "${fontFile}"; the label default font was used instead`
      });
      return '';
    }
    state.customFonts.push({ id, fontFile });
    return id;
  }

  /**
   * Resolve the stored fontId/fontSize/fontWidth from a parsed ^A font command:
   * collapse values matching the label default to the 0/'' inherit sentinels, then
   * snap explicit sizes to the font's allowed grid (no-op for scalable fonts).
   */
  _resolveFontSize(font, state) {
    const fontId = this._resolveScalableFontId(font, state);
    const rawSize = font.height === state.defaultFont.height ? 0 : font.height;
    const rawWidth = font.width === state.defaultFont.width ? 0 : font.width;
    const snapped = snapRequestedToAllowed(fontId, rawSize, rawWidth);
    const clamped = enforceFontMinSize(fontId, snapped.height, snapped.width);
    return {
      fontId: fontId === state.defaultFont.id ? '' : fontId,
      fontSize: clamped.height,
      fontWidth: clamped.width
    };
  }

  /**
   * Decode ^FD into an element's Content (placeholders included)
   * @returns {string}
   */
  _decodeFieldDataToken(fdToken, fhToken = null) {
    if (!fdToken) return '';
    const content = fdToken.params;
    if (!fhToken) return content;
    return decodeFieldData(content, getFieldHexIndicator(fhToken.params));
  }

  _parseFieldData(fdToken, fhToken = null) {
    if (!fdToken) return '';
    return this._decodeFieldDataToken(fdToken, fhToken);
  }

  /**
   * Parse TEXT element from ^A + ^FD
   */
  _parseText(group, aToken, fdToken, hasReverse, state, fhToken = null) {
    const font = this._parseFontCommand(aToken);
    // ^A cannot hold a line break, and its Content control is single-line.
    const content = collapseLineBreaks(this._parseFieldData(fdToken, fhToken));

    return {
      type: 'TEXT',
      x: group.x,
      y: group.y,
      content,
      fieldHex: Boolean(fhToken),
      ...this._resolveFontSize(font, state),
      orientation: font.orientation,
      reverse: hasReverse
    };
  }

  /**
   * Parse FIELDBLOCK element from ^A + ^FB + ^FD
   */
  _parseFieldBlock(group, aToken, fbToken, fdToken, hasReverse, state, fhToken = null) {
    const font = this._parseFontCommand(aToken);

    // Parse ^FB params: blockWidth,maxLines,lineSpacing,justification,hangingIndent
    const fbParts = fbToken.params.split(',');
    const blockWidth = parseInt(fbParts[0]) || 200;
    const maxLines = parseInt(fbParts[1]) || 1;
    const lineSpacing = parseInt(fbParts[2]) || 0;
    const justification = fbParts[3] || 'L';
    const hangingIndent = parseInt(fbParts[4]) || 0;

    // Parse ^FD content - strip trailing \& for center-justified text blocks
    let fdContent = this._decodeFieldDataToken(fdToken, fhToken);
    if (fdContent.endsWith(FB_LINE_BREAK)) {
      fdContent = fdContent.slice(0, -FB_LINE_BREAK.length);
    }
    // Any remaining \& is a real line break the user typed.
    fdContent = decodeFieldBlockBreaks(fdContent);

    return {
      type: 'FIELDBLOCK',
      x: group.x,
      y: group.y,
      content: fdContent,
      fieldHex: Boolean(fhToken),
      ...this._resolveFontSize(font, state),
      blockWidth,
      maxLines,
      lineSpacing,
      justification,
      hangingIndent,
      reverse: hasReverse,
      orientation: font.orientation
    };
  }

  /**
   * Parse TEXTBLOCK element from ^A + ^TB + ^FD
   */
  _parseTextBlock(group, aToken, tbToken, fdToken, hasReverse, state, fhToken = null) {
    const font = this._parseFontCommand(aToken);

    // Parse ^TB params: orientation,blockWidth,blockHeight
    const tbParts = tbToken.params.split(',');
    // First param may be orientation (N/R/I/B) or start of width
    let tbOrientation = 'N';
    let widthIndex = 0;
    const firstParam = (tbParts[0] || '').trim();
    if (['N', 'R', 'I', 'B'].includes(firstParam)) {
      tbOrientation = firstParam;
      widthIndex = 1;
    }
    const blockWidth = parseInt(tbParts[widthIndex]) || 200;
    const blockHeight = parseInt(tbParts[widthIndex + 1]) || 50;

    // Use ^A orientation if available, fall back to ^TB orientation
    const orientation = font.orientation !== 'N' ? font.orientation : tbOrientation;

    const content = this._parseFieldData(fdToken, fhToken);

    return {
      type: 'TEXTBLOCK',
      x: group.x,
      y: group.y,
      content,
      fieldHex: Boolean(fhToken),
      ...this._resolveFontSize(font, state),
      blockWidth,
      blockHeight,
      reverse: hasReverse,
      orientation
    };
  }

  /**
   * Parse a 1D BARCODE element from its command + ^FD (with optional ^BY).
   * Handles ^BC (Code 128), ^B3 (Code 39), ^BE (EAN-13), ^BU (UPC-A); the
   * height/interpretation parameter positions differ for Code 39.
   */
  _parseBarcode(group, token, byToken, fdToken, hasReverse, state, symbology = 'CODE128', fhToken = null) {
    const parts = token.params.split(',');

    // Orientation is always the first param; default N for an empty/invalid value.
    const orientation = normalizeBarcodeOrientation(parts[0]);

    // Code 39 (^B3o,e,h,f), Code 11 (^B1o,e,h,f,g), Codabar (^BKo,e,h,f,g,k,l), MSI
    // (^BMo,e,h,f,g,e2) and Plessey (^BPo,e,h,f,g) carry an e param before height: a
    // check-digit flag for Code 39 (on/off), Code 11 (Y=1 / N=2 digits, modelled as
    // "single") and Plessey (show the CRC check chars in the HRI, on/off), fixed N
    // (ignored) for Codabar, and a check-digit MODE (A/B/C/D) for MSI (handled below).
    let heightIdx = 1;
    let showIdx = 2;
    let checkDigit = false;
    if (symbology === 'CODE39' || symbology === 'CODE11' || symbology === 'CODABAR' || symbology === 'MSI' || symbology === 'PLESSEY') {
      if (symbology === 'CODE39' || symbology === 'CODE11' || symbology === 'PLESSEY') checkDigit = (parts[1] || 'N').trim() === 'Y';
      heightIdx = 2;
      showIdx = 3;
    }
    // ^BL (LOGMARS) is special: its format is o,h,g — there is NO f param, the HRI is
    // always printed, and the mod-43 check digit is mandatory. g sits right after height.
    const isLogmars = symbology === 'LOGMARS';
    if (isLogmars) checkDigit = true;
    const showText = isLogmars ? true : (parts[showIdx] || 'Y').trim() !== 'N';
    // "Print interpretation line above code" (g) sits right after f (or after h for
    // LOGMARS). It defaults N for every barcode except ^BS (UPC/EAN extension), whose g
    // default is Y (HRI above).
    const gIdx = isLogmars ? heightIdx + 1 : showIdx + 1;
    const gDefault = symbology === 'UPCEANEXT' ? 'Y' : 'N';
    const printTextAbove = (parts[gIdx] || gDefault).trim() === 'Y';
    // ^B2 (Interleaved 2 of 5) and ^BA (Code 93) carry a check-digit flag (e) after g.
    if (symbology === 'INTERLEAVED2OF5' || symbology === 'CODE93') {
      checkDigit = (parts[showIdx + 2] || 'N').trim() === 'Y';
    }
    // ^BK (Codabar) carries the start (k) and stop (l) chars after g; valid values A–D.
    let startChar = 'A';
    let stopChar = 'A';
    if (symbology === 'CODABAR') {
      const k = (parts[showIdx + 2] || 'A').trim().toUpperCase();
      const l = (parts[showIdx + 3] || 'A').trim().toUpperCase();
      startChar = ['A', 'B', 'C', 'D'].includes(k) ? k : 'A';
      stopChar = ['A', 'B', 'C', 'D'].includes(l) ? l : 'A';
    }
    // ^BM (MSI) carries the check-digit mode (e, A–D) before height and the e2 flag (insert
    // the check digit into the HRI) after g.
    let msiCheckMode = 'B';
    let msiCheckInText = false;
    if (symbology === 'MSI') {
      const e = (parts[1] || 'B').trim().toUpperCase();
      msiCheckMode = ['A', 'B', 'C', 'D'].includes(e) ? e : 'B';
      msiCheckInText = (parts[showIdx + 2] || 'N').trim() === 'Y';
    }

    // Use ^BY from this group if present, otherwise from state
    let width = state.barcodeDefaults.width;
    let ratio = state.barcodeDefaults.ratio;
    let height = state.barcodeDefaults.height;
    if (byToken) {
      const byParts = byToken.params.split(',');
      if (byParts[0]) width = parseInt(byParts[0]) || width;
      if (byParts[1]) ratio = parseFloat(byParts[1]) || ratio;
      if (byParts[2]) height = parseInt(byParts[2]) || height;
    }
    // The command's own height parameter, when present, overrides the ^BY default.
    if (parts[heightIdx]) height = parseInt(parts[heightIdx]) || height;

    // Strip the Code 128 Subset B start character (>:); it is an encoding
    // prefix the editor re-adds on render, not part of the element's Content.
    let rawData = this._decodeFieldDataToken(fdToken, fhToken);
    if (symbology === 'CODE128' && rawData.startsWith('>:')) {
      rawData = rawData.slice(2);
    }
    return {
      type: 'BARCODE',
      symbology,
      x: group.x,
      y: group.y,
      content: rawData,
      fieldHex: Boolean(fhToken),
      height,
      width,
      ratio,
      showText,
      checkDigit,
      orientation,
      printTextAbove,
      startChar,
      stopChar,
      msiCheckMode,
      msiCheckInText,
      reverse: hasReverse
    };
  }

  /**
   * Parse a Data Matrix element from ^BX + ^FD
   */
  _parseDataMatrix(group, bxToken, fdToken, hasReverse, fhToken = null) {
    // ^BX params: orientation,height(module size),quality,columns,rows,...
    const parts = bxToken.params.split(',');
    const orientation = normalizeBarcodeOrientation(parts[0]);
    const moduleSize = parseInt(parts[1]) || 4;
    const quality = parseInt(parts[2]) || 200;

    const rawData = this._decodeFieldDataToken(fdToken, fhToken);
    return {
      type: 'QRCODE',
      symbology: 'DATAMATRIX',
      x: group.x,
      y: group.y,
      content: rawData,
      fieldHex: Boolean(fhToken),
      orientation,
      moduleSize,
      quality,
      reverse: hasReverse
    };
  }

  /**
   * Parse a PDF417 element from ^B7 + ^FD (with optional ^BY for module width)
   */
  _parsePDF417(group, b7Token, byToken, fdToken, hasReverse, fhToken = null) {
    // ^B7 params: orientation,rowHeight,securityLevel,columns,rows,truncate
    const parts = b7Token.params.split(',');
    const orientation = normalizeBarcodeOrientation(parts[0]);
    const rowHeight = parseInt(parts[1]) || 4;
    const securityLevel = parseInt(parts[2]);
    const columns = parseInt(parts[3]) || 0;

    let moduleWidth = 2;
    if (byToken) {
      const byParts = byToken.params.split(',');
      if (byParts[0]) moduleWidth = parseInt(byParts[0]) || 2;
    }

    const rawData = this._decodeFieldDataToken(fdToken, fhToken);
    return {
      type: 'QRCODE',
      symbology: 'PDF417',
      x: group.x,
      y: group.y,
      content: rawData,
      fieldHex: Boolean(fhToken),
      orientation,
      moduleWidth,
      rowHeight,
      securityLevel: Number.isNaN(securityLevel) ? 5 : securityLevel,
      columns,
      reverse: hasReverse
    };
  }

  /**
   * Parse Micro-PDF417 element from ^BF + ^FD
   */
  _parseMicroPDF417(group, bfToken, byToken, fdToken, hasReverse, fhToken = null) {
    // ^BF params: orientation,height(rowHeight),mode(0-33)
    const parts = bfToken.params.split(',');
    const orientation = normalizeBarcodeOrientation(parts[0]);
    const rowHeight = parseInt(parts[1]) || 4;
    const mode = Math.max(0, Math.min(33, parseInt(parts[2]) || 0));

    let moduleWidth = 2;
    if (byToken) {
      const byParts = byToken.params.split(',');
      if (byParts[0]) moduleWidth = parseInt(byParts[0]) || 2;
    }

    const rawData = this._decodeFieldDataToken(fdToken, fhToken);
    return {
      type: 'QRCODE',
      symbology: 'MICROPDF417',
      x: group.x,
      y: group.y,
      content: rawData,
      fieldHex: Boolean(fhToken),
      orientation,
      moduleWidth,
      rowHeight,
      microPdfMode: mode,
      reverse: hasReverse
    };
  }

  /**
   * Parse Code 49 element from ^B4 + ^FD. ^B4o,h,f,m — h is the row-height multiplier,
   * f the interpretation line (ignored: the 2D canvas can't render Code 49's HRI), and m
   * the starting mode (0–5 / A). Module width comes from ^BY, mirroring Micro-PDF417.
   */
  _parseCode49(group, b4Token, byToken, fdToken, hasReverse, fhToken = null) {
    const parts = b4Token.params.split(',');
    const orientation = normalizeBarcodeOrientation(parts[0]);
    const rowHeight = parseInt(parts[1]) || 4;
    const rawMode = (parts[3] || 'A').trim().toUpperCase();
    const code49Mode = ['0', '1', '2', '3', '4', '5', 'A'].includes(rawMode) ? rawMode : 'A';

    let moduleWidth = 2;
    if (byToken) {
      const byParts = byToken.params.split(',');
      if (byParts[0]) moduleWidth = parseInt(byParts[0]) || 2;
    }

    const rawData = this._decodeFieldDataToken(fdToken, fhToken);
    return {
      type: 'QRCODE',
      symbology: 'CODE49',
      x: group.x,
      y: group.y,
      content: rawData,
      fieldHex: Boolean(fhToken),
      orientation,
      moduleWidth,
      rowHeight,
      code49Mode,
      reverse: hasReverse
    };
  }

  /**
   * Parse QRCODE element from ^BQ + ^FD
   */
  _parseQRCode(group, bqToken, fdToken, hasReverse, state, fhToken = null) {
    // ^BQ params: orientation,model,magnification
    const bqParts = bqToken.params.split(',');
    // Zebra documents ^BQ's orientation slot as normal-only; ^FW does not rotate it.
    const orientation = 'N';
    const model = parseInt(bqParts[1]) || 2;
    const magnification = parseInt(bqParts[2]) || 5;

    // ^FD format: {errorCorrection}A,{data} (e.g., "QA,https://example.com")
    let errorCorrection = 'Q';
    let rawData = '';

    if (fdToken) {
      const fdContent = this._decodeFieldDataToken(fdToken, fhToken);
      const ecMatch = fdContent.match(/^([HQML])A,(.*)$/s);
      if (ecMatch) {
        errorCorrection = ecMatch[1];
        rawData = ecMatch[2];
      } else {
        rawData = fdContent;
      }
    }

    return {
      type: 'QRCODE',
      symbology: 'QR',
      x: group.x,
      y: group.y,
      content: rawData,
      fieldHex: Boolean(fhToken),
      orientation,
      model,
      magnification,
      errorCorrection,
      reverse: hasReverse
    };
  }

  /**
   * Parse AZTEC element from ^B0 + ^FD.
   * ^B0 params: orientation,magnification,eci,d  — where d (error control /
   * symbol size/type) inverts QRCodeElement._aztecD:
   *   300        -> rune
   *   201-232    -> full,    layers = d-200
   *   101-104    -> compact, layers = d-100
   *   0-99       -> auto,    errorControl = d (0 = printer default)
   */
  _parseAztec(group, b0Token, fdToken, hasReverse, fhToken = null) {
    const parts = b0Token.params.split(',');
    const orientation = normalizeBarcodeOrientation(parts[0]);
    const magnification = parseInt(parts[1]) || 5;
    const d = parseInt(parts[3]) || 0;

    let aztecSizeMode = 'auto';
    let aztecErrorControl = 0;
    let aztecLayers = 0;
    if (d === 300) {
      aztecSizeMode = 'rune';
    } else if (d >= 201 && d <= 232) {
      aztecSizeMode = 'full';
      aztecLayers = d - 200;
    } else if (d >= 101 && d <= 104) {
      aztecSizeMode = 'compact';
      aztecLayers = d - 100;
    } else {
      aztecSizeMode = 'auto';
      aztecErrorControl = d >= 0 && d <= 99 ? d : 0;
    }

    // ^FD carries the raw data (no error-correction prefix, unlike ^BQ).
    const rawData = this._decodeFieldDataToken(fdToken, fhToken);
    return {
      type: 'QRCODE',
      symbology: 'AZTEC',
      x: group.x,
      y: group.y,
      content: rawData,
      fieldHex: Boolean(fhToken),
      orientation,
      magnification,
      aztecSizeMode,
      aztecErrorControl,
      aztecLayers,
      reverse: hasReverse
    };
  }

  /**
   * Parse BOX or LINE from ^GB command
   */
  _parseGraphicBox(group, gbToken, hasReverse) {
    const parts = gbToken.params.split(',');
    const gbWidth = parseInt(parts[0]) || 0;
    const gbHeight = parseInt(parts[1]) || 0;
    const gbThickness = parseInt(parts[2]) || 0;
    const color = (parts[3] || 'B').trim();
    const rounding = Math.max(0, Math.min(8, parseInt(parts[4]) || 0));

    // LINE detection: the app generates ^GB{w},{h},{min(w,h)},{color} for lines
    // BOX generates ^GB{w},{h},{thickness},{color} where thickness < min(w,h)
    if (gbThickness === Math.min(gbWidth, gbHeight)) {
      // This is a LINE
      let lineWidth, lineThickness, orientation;
      if (gbWidth >= gbHeight) {
        // Horizontal line
        lineWidth = gbWidth;
        lineThickness = gbHeight;
        orientation = 'H';
      } else {
        // Vertical line
        lineWidth = gbHeight;
        lineThickness = gbWidth;
        orientation = 'V';
      }

      return {
        type: 'LINE',
        x: group.x,
        y: group.y,
        width: lineWidth,
        thickness: lineThickness,
        orientation,
        color,
        rounding,
        reverse: hasReverse
      };
    }

    // This is a BOX
    return {
      type: 'BOX',
      x: group.x,
      y: group.y,
      width: gbWidth,
      height: gbHeight,
      thickness: gbThickness,
      color,
      rounding,
      reverse: hasReverse
    };
  }

  /**
   * Parse DIAGONALLINE from ^GD command (^GDw,h,t,c,o).
   * o = R (or /) right-leaning, L (or \) left-leaning; default R.
   */
  _parseDiagonalLine(group, gdToken, hasReverse) {
    const parts = gdToken.params.split(',');
    const rawOrientation = (parts[4] || 'R').trim();
    const orientation = (rawOrientation === 'L' || rawOrientation === '\\') ? 'L' : 'R';

    return {
      type: 'DIAGONALLINE',
      x: group.x,
      y: group.y,
      width: parseInt(parts[0]) || 3,
      height: parseInt(parts[1]) || 3,
      thickness: parseInt(parts[2]) || 1,
      color: (parts[3] || 'B').trim(),
      orientation,
      reverse: hasReverse
    };
  }

  /**
   * Parse GRAPHICSYMBOL from ^GS command (^GSo,h,w^FDsymbol^FS).
   * o = N/R/I/B (default N); h/w = 0–32000 dots, defaulting to the last ^CF
   * font size (resolved to concrete dots at import time). The ^FD payload
   * selects the symbol: A ® | B © | C ™ | D UL mark | E CSA mark. The printer
   * renders every ^FD character side by side, but the editor models a single
   * symbol per element, so extra characters are dropped with a warning.
   */
  _parseGraphicSymbol(group, gsToken, fdToken, fhToken, hasReverse, state) {
    const parts = (gsToken.params || '').split(',');
    const orientation = normalizeBarcodeOrientation(parts[0]);

    const clampSymbolDim = (value, fallback) => {
      const n = parseInt(value);
      if (!Number.isFinite(n) || n <= 0) return fallback;
      return Math.min(32000, Math.max(1, n));
    };
    const height = clampSymbolDim(parts[1], state.defaultFont.height);
    const width = clampSymbolDim(parts[2], state.defaultFont.width || state.defaultFont.height);

    // ^FH hex escapes apply to ^GS field data like any other field
    // (verified against Labelary: ^FH…^FD_42 renders ©).
    const raw = (fdToken ? this._decodeFieldDataToken(fdToken, fhToken) : '').trim();
    const first = raw.charAt(0).toUpperCase();
    let symbol = 'A';
    if ('ABCDE'.includes(first) && first) {
      symbol = first;
    } else if (raw) {
      state.warnings.push({
        command: '^GS',
        message: `Unsupported ^GS symbol "${raw.charAt(0)}" was replaced with A (®) — valid values are A–E`
      });
    } else {
      state.warnings.push({
        command: '^GS',
        message: '^GS field had no ^FD symbol data — defaulted to A (®)'
      });
    }
    if (raw.length > 1) {
      state.warnings.push({
        command: '^GS',
        message: `^GS supports a single symbol per element; extra characters "${raw.slice(1)}" were dropped`
      });
    }

    return {
      type: 'GRAPHICSYMBOL',
      x: group.x,
      y: group.y,
      symbol,
      height,
      width,
      orientation,
      reverse: hasReverse
    };
  }

  /**
   * Parse ELLIPSE from ^GE command. Always unlocked, even when width === height
   * (the author wrote an ellipse command). See ADR 0004.
   */
  _parseCircle(group, geToken, hasReverse) {
    const parts = geToken.params.split(',');
    // ^GE w,h,t,c — dims 3–4095, thickness 2–4095, default thickness 1. See ADR 0004.
    return {
      type: 'CIRCLE',
      x: group.x,
      y: group.y,
      width: clampShapeDim(parts[0], 80),
      height: clampShapeDim(parts[1], 80),
      thickness: clampShapeThickness(parts[2], 1),
      color: normalizeShapeColor(parts[3]),
      reverse: hasReverse,
      aspectLocked: false
    };
  }

  /**
   * Parse CIRCLE from ^GC command (^GCdiameter,thickness,color). Always locked.
   * ^GC d,t,c — diameter 3–4095 (default 3), thickness 2–4095 (default 1). See ADR 0004.
   */
  _parseCircleFromGC(group, gcToken, hasReverse) {
    const parts = gcToken.params.split(',');
    const diameter = clampShapeDim(parts[0], 3);
    return {
      type: 'CIRCLE',
      x: group.x,
      y: group.y,
      width: diameter,
      height: diameter,
      thickness: clampShapeThickness(parts[1], 1),
      color: normalizeShapeColor(parts[2]),
      reverse: hasReverse,
      aspectLocked: true
    };
  }

  /**
   * Parse GRAPHIC from ^GF command (^GFa,b,c,d,DATA).
   *
   * Supported encodings:
   *   - 'A' compression with plain ASCII hex payload
   *   - ':B64:' inline base64 payload (with optional CRC suffix)
   *   - ':Z64:' zlib-deflated base64 payload (re-emitted as :B64: on export,
   *     since there is no synchronous deflate available in the browser)
   * Anything else (raw binary 'B', compressed 'C', or ASCII-hex
   * payloads containing ACS run-length characters) is preserved as opaque
   * — the original ^FO/^GF/^FD/^FS bytes are stashed and re-emitted
   * verbatim so the user doesn't lose them on round-trip.
   */
  _parseGraphicField(group, gfToken, fdToken, hasReverse, state) {
    const params = (gfToken.params || '').split(',');
    const compression = (params[0] || 'A').trim().toUpperCase();
    const totalBytes = parseInt(params[1]) || 0;
    const bytesPerRow = parseInt(params[3]) || 0;
    // ^GF data lives either in the params past the 4th comma (^GFA,n,n,w,DATA)
    // or in a separate ^FD field (^GFA,n,n,w^FDDATA^FS).
    const inlineData = params.length > 4 ? params.slice(4).join(',') : '';
    const payload = inlineData || ((fdToken && fdToken.params) ? fdToken.params : '');
    const heightDots = bytesPerRow > 0 ? Math.floor(totalBytes / bytesPerRow) : 0;
    const widthDots = bytesPerRow * 8;

    // Note: ^FW is ignored for ^GF (real Zebra firmware doesn't honor it),
    // so an imported graphic always lands as orientation N. The user can
    // re-rotate via the panel; rotation is baked into the bitmap on export.
    const opaqueData = (encodingFormat) => ({
      type: 'GRAPHIC',
      x: group.x,
      y: group.y,
      widthDots,
      heightDots,
      bytesPerRow,
      encodingFormat,
      opaqueRaw: this._reconstructGraphicSource(group, gfToken, fdToken, hasReverse),
      reverse: hasReverse,
    });

    if (compression === 'A') {
      const trimmed = payload.replace(/\s+/g, '');
      // Plain hex only — anything outside [0-9A-F] (notably ACS run-length
      // letters G–Z) is unsupported. Preserve verbatim.
      const bytes = hexToBytes(trimmed);
      if (bytes) {
        const decodedHeight = bytesPerRow > 0 ? Math.floor(bytes.length / bytesPerRow) : 0;
        return {
          type: 'GRAPHIC',
          x: group.x,
          y: group.y,
          widthDots,
          heightDots: decodedHeight || heightDots,
          bytesPerRow,
          encodingFormat: 'A',
          bytes,
          threshold: 128,
          reverse: hasReverse,
        };
      }
      if (payload.startsWith(':B64:')) {
        const decoded = b64WithCrcToBytes(payload);
        if (decoded) {
          if (!decoded.crcOk) {
            state.warnings.push({
              command: '^GF',
              message: '^GF :B64: CRC mismatch — graphic decoded anyway, data may be corrupt',
            });
          }
          const decodedHeight = bytesPerRow > 0 ? Math.floor(decoded.bytes.length / bytesPerRow) : 0;
          return {
            type: 'GRAPHIC',
            x: group.x,
            y: group.y,
            widthDots,
            heightDots: decodedHeight || heightDots,
            bytesPerRow,
            encodingFormat: 'B64',
            bytes: decoded.bytes,
            threshold: 128,
            crcWarning: !decoded.crcOk,
            reverse: hasReverse,
          };
        }
      }
      if (payload.startsWith(':Z64:')) {
        const decoded = z64ToBytes(payload);
        if (decoded) {
          if (!decoded.crcOk) {
            state.warnings.push({
              command: '^GF',
              message: '^GF :Z64: CRC mismatch — graphic decoded anyway, data may be corrupt',
            });
          }
          const decodedHeight = bytesPerRow > 0 ? Math.floor(decoded.bytes.length / bytesPerRow) : 0;
          return {
            type: 'GRAPHIC',
            x: group.x,
            y: group.y,
            widthDots,
            heightDots: decodedHeight || heightDots,
            bytesPerRow,
            // No synchronous deflate in the browser — re-emit as :B64:.
            encodingFormat: 'B64',
            bytes: decoded.bytes,
            threshold: 128,
            crcWarning: !decoded.crcOk,
            reverse: hasReverse,
          };
        }
      }
      const reason = payload.startsWith(':Z64:')
        ? ':Z64: data could not be decoded'
        : 'ACS run-length or non-hex characters not supported';
      state.warnings.push({
        command: '^GF',
        message: `^GF graphic preserved as opaque — ${reason}`,
      });
      return opaqueData('OPAQUE');
    }

    state.warnings.push({
      command: '^GF',
      message: `^GF graphic preserved as opaque — compression "${compression}" not supported by this editor`,
    });
    return opaqueData('OPAQUE');
  }

  _reconstructGraphicSource(group, gfToken, fdToken, hasReverse = false) {
    const fo = `^FO${group.x},${group.y}`;
    const fr = hasReverse ? '^FR' : '';
    const gf = `^GF${gfToken.params || ''}`;
    const fd = fdToken ? `^FD${fdToken.params || ''}` : '';
    return `${fo}${fr}${gf}${fd}^FS`;
  }

  /**
   * Return default label settings
   */
  _defaultLabelSettings(dpmm = 8, height = 50) {
    return {
      width: 100,
      height,
      dpmm,
      printOrientation: 'N',
      printMirror: 'N',
      mediaTracking: '',
      mediaType: 'D',
      mediaDarkness: 25,
      printSpeed: 4,
      slewSpeed: 4,
      backfeedSpeed: 4,
      fontId: '0',
      customFonts: [],
      defaultFontHeight: 20,
      defaultFontWidth: 0,
      homeX: 0,
      homeY: 0,
      labelTop: 0,
      printQuantity: 1,
      pauseCount: 0,
      replicates: 0,
      printQuantityPlaceholder: ''
    };
  }
}
