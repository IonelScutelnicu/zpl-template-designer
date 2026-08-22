// ZPL Parser Service
// Parses ZPL template strings into app element objects and label settings

import { acsToBytes, b64WithCrcToBytes, hexToBytes, z64ToBytes } from '../utils/graphicField.js';
import { snapRequestedToAllowed, enforceFontMinSize, proportionalRequestedHeight } from '../utils/zplFontSnap.js';
import { decodeFieldData, getFieldHexIndicator, decodeFieldBlockBreaks, collapseLineBreaks, FB_LINE_BREAK } from '../utils/zplFieldData.js';
import { DEFAULT_FIELD_ENCODING, encodingForCharacterSet } from '../utils/zplCodePages.js';
import { placeholderName } from '../utils/placeholders.js';
import { emittedOriginOffset, normalizeFoJustifyImport, normalizeFtImport, typesetCursorAdvance } from '../utils/fieldAnchor.js';
import { getParserSymbology } from '../barcodes/QRCodeSymbologies.js';
import { MAX_CUSTOM_FONT_BYTES, bytesToBase64, ensurePrinterDrive, isUnknownFontId, normalizePrinterFontPath, nextCustomFontId, resolveRenderFontId } from '../utils/customFonts.js';
import { DEFAULT_FONT_ID } from '../config/constants.js';

// ZPL with no ^CF is read the way a printer would read it: font A at magnification 1
// (power-up ^CFA,9,5). This is deliberately *not*
// DEFAULT_FONT_HEIGHT — that one is the friendlier height a new blank label starts at,
// while this one has to match the firmware or imported labels render at the wrong size.
// Width stays 0 (proportional), which is exactly 5 dots at magnification 1 and keeps the
// parameter out of the re-emitted ^CF.
const POWER_UP_FONT_HEIGHT = 9;

/**
 * Known ZPL commands that the parser handles (won't generate warnings)
 */
const KNOWN_COMMANDS = new Set([
  'XA', 'XZ', 'PW', 'PR', 'PO', 'PM', 'MN', 'LL', 'SD', 'LH', 'LT', 'CI', 'MT',
  'CF', 'CW', 'DY', 'PQ', 'FO', 'FT', 'A', 'FB', 'TB', 'FD', 'FH', 'FS', 'FR', 'BC', 'BY',
  'BQ', 'GB', 'GE', 'GC', 'GD', 'GF', 'GS', 'FX',
  // Native variable and clock commands are supported no-ops during import.
  'FE', 'FC', 'FN', 'SO',
  // ^FV carries field data exactly like ^FD; the difference is what the printer
  // does after printing, which the element records rather than the parser.
  'FV',
  // ^FW sets the default field orientation/justification for the fields after it.
  'FW',
  // ^LR reverse-prints every field after it, exactly as if each carried its own ^FR.
  'LR',
  // Additional barcode symbologies: ^B3 (Code 39) and ^B7 (PDF417) tokenize as
  // 'B' since the tokenizer only captures letters; ^BA/^BE/^BI/^BJ/^BK/^BL/^BM/^BP/^BS/^BU/^BX/^BZ are two-letter.
  'B', 'BA', 'BB', 'BD', 'BE', 'BF', 'BI', 'BJ', 'BK', 'BL', 'BM', 'BO', 'BP', 'BR', 'BS', 'BT', 'BU', 'BX', 'BZ'
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

/**
 * The balanced JSON object at the start of `text`, or null when it doesn't open
 * with one. A ^FX comment runs to the next ^/~ command, so the metadata object
 * can be followed by prose (or, in the wild, literal "\r\n" escape text) that
 * JSON.parse would choke on.
 */
function leadingJsonObject(text) {
  if (text[0] !== '{') return null;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(0, index + 1);
    }
  }
  return null;
}

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

function normalizeBarcodeOrientation(value, fallback = 'N') {
  const orientation = (value || '').trim().toUpperCase();
  return ['N', 'R', 'I', 'B'].includes(orientation) ? orientation : fallback;
}

/** ^FW orientation stamped on this token when it was parsed. */
function tokenFwOrientation(token) {
  return (token && token.fwOrientation) || 'N';
}

/**
 * Header commands that configure label settings (not element-specific). ^LR rides
 * along: it is global rather than field-scoped, so it takes the same route.
 */
const HEADER_COMMANDS = new Set([
  'XA', 'XZ', 'PW', 'PR', 'PO', 'PM', 'MN', 'LL', 'SD', 'LH', 'LT', 'CI', 'MT',
  'CF', 'CW', 'DY', 'PQ', 'LR'
]);

/**
 * Commands that belong to a field but do not open or close one: ^FO/^FT position
 * the field, ^FS ends it, and ^FW/^BY/^FX are modal or inert.
 */
const FIELD_STRUCTURE_COMMANDS = new Set(['FO', 'FT', 'FS', 'FW', 'BY', 'FX']);

/**
 * ^BY's module width in whole dots. Labels do write a fraction there and the printer
 * prints whole dots, rounding to the nearest (verified on Labelary: 1.1 → 1, 1.5 → 2,
 * 2.1 → 2, 2.5 → 3) — truncating would halve a `^BY1.5` symbol.
 */
function byModuleWidth(raw, fallback) {
  const value = Math.round(parseFloat(raw));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * The largest coordinate a ^FO/^FT/^LH parameter can carry. Flattening several
 * ^LH values into one has to keep every emitted command inside it.
 */
const ZPL_MAX_COORD = 32000;

/** Whether a RAW span's ^FO/^FT depends on the label home rather than its own ^LH. */
function rawDependsOnLabelHome(text) {
  const origin = text.search(/\^F[OT]/i);
  if (origin === -1) return false;
  const home = text.search(/\^LH/i);
  return home === -1 || home > origin;
}

/**
 * The ^FD/^FV token whose payload the field actually prints: the last one, since a
 * second data command in one field overwrites the first on the printer.
 *
 * Which of the two it is decides both the content and the command the element
 * re-emits, so the two must be read from the same token — `^FVold^FDnew` prints
 * `new` as a retained ^FD field, not as a variable one.
 */
function lastFieldDataToken(commands) {
  for (let i = commands.length - 1; i >= 0; i--) {
    const { command } = commands[i];
    if (command === 'FD' || command === 'FV') return commands[i];
  }
  return null;
}

/**
 * True for a command that describes the field currently being defined. A field runs
 * from the previous ^FS to its own ^FS, so these are just as valid *before* the
 * ^FO/^FT that positions it — a layout real labels use often (`^A0N,26,26^FO450,170^FD…`).
 * They are buffered and handed to the group when it opens.
 */
function isFieldScopedCommand(command) {
  return KNOWN_COMMANDS.has(command)
    && !HEADER_COMMANDS.has(command)
    && !FIELD_STRUCTURE_COMMANDS.has(command);
}

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
    const json = leadingJsonObject(params.trimStart());
    if (!json) return null;
    try {
      const obj = JSON.parse(json);
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

      // Special handling for ^FD: consume everything until ^FS. ^FV (field
      // variable) delimits its data the same way and prints identically, so it
      // shares this branch — but it keeps its own name: the printer clears a ^FV
      // field after printing and retains a ^FD one, and rewriting the command
      // would silently turn a variable field into a fixed one on export.
      if (m.command === 'FD' || m.command === 'FV') {
        // Field data ends at the next command, not at the ^FS: a caret is what the
        // printer reads as a command prefix wherever it appears, which is why ^FH
        // exists to smuggle one into the data. Labels do put a command between ^FD
        // and ^FS (`^FD ^FH_^FDserwis: ^FS`), and Labelary reads it as one; swallowing
        // through to the ^FS printed the command text itself. Leading and trailing
        // whitespace are data here, unlike the parameter lists below.
        const params = content.substring(m.codeEnd, nextIndex);
        tokens.push({ prefix: m.prefix, command: m.command, params, start: m.index, end: nextIndex });
      } else {
        // Everything else — including ^FX — runs to the next ^/~ command. A ^FX
        // comment ends at the next caret or tilde on a real printer (and in
        // Labelary), so commands written on the same line as a comment still
        // execute; the comment must not swallow them.
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
      // ^BY power-up defaults: w=2 dots, r=3.0 wide:narrow (^BY doc). The ratio is the
      // printer's, not the editor's — a ^BY that omits r prints Code 39 & friends at 3:1.
      barcodeDefaults: { width: 2, ratio: 3.0, height: 50 },
      defaultFont: { id: DEFAULT_FONT_ID, height: POWER_UP_FONT_HEIGHT, width: 0 },
      // Whether a ^CF has supplied a height yet. Until one does the printer has no
      // permanent height for an ^A to fall back on — see _resolveFontSize.
      sawCfHeight: false,
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
      // Field-scoped commands read before the field's ^FO/^FT; see isFieldScopedCommand.
      pendingFieldCommands: [],
      lastBYSource: null,
      lastFWSource: null,
      printWidthDots: 0,
      // ^CI is sequential printer state: it picks the character set the ^FH hex
      // escapes of every following field are read in. Stamped onto each field
      // token, since the label may switch sets between fields.
      charEncoding: DEFAULT_FIELD_ENCODING,
      // ^FW defaults: fields that omit their orientation print normal, and
      // ^FO/^FT without a z justify left.
      fwOrientation: 'N',
      fwJustify: 'L',
      // ^LR is sequential printer state: it reverse-prints every field that follows
      // it and is not retroactive. Zebra: "identical to placing an ^FR command in all
      // current and subsequent fields". It outlives ^XA on the printer (only ^LRN or
      // power-off clears it), which this state matches by never resetting.
      labelReverse: false,
      // Set once the ^LR note has been reported, so a label full of reversed fields
      // warns once rather than per field.
      warnedLabelReverse: false,
      // ^LH is sequential printer state: it replaces the origin for every field
      // that follows and is not retroactive. Fields are parsed in absolute dots
      // (raw ^FO/^FT + this cursor); _flattenLabelHome folds one adopted home
      // back out at the end.
      currentHome: { x: 0, y: 0 },
      // The printer's typeset cursor: where the last field left off, which a ^FT that
      // omits a coordinate continues from. Absolute dots in raw ^FT-ANCHOR space
      // (the same space group.x/group.y hold before normalizeFtImport), so its y is a
      // baseline, not a top edge. ^LH never applies to it.
      ftCursor: { x: 0, y: 0, reliable: true, source: null }
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
          // Anything already buffered for this field belongs to the same passthrough
          // unit, so the run starts where the field did, not at the unknown command.
          const pending = state.pendingFieldCommands;
          state.rawRun = {
            start: pending.length ? pending[0].start : token.start,
            end: token.end,
            homeAtOpen: { ...state.currentHome }
          };
          state.pendingFieldCommands = [];
        }
        continue;
      }

      // A raw run absorbs the field data belonging to its unknown command
      // (^RFW,H,1,2^FD1234^FS is one passthrough unit) and closes at the ^FS.
      // Any other command ends the run and is then processed normally.
      if (state.rawRun) {
        if (token.command === 'FD' || token.command === 'FV' || token.command === 'FH' || token.command === 'FR') {
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

      // ^FW (Field Orientation) is modal, not part of any one field: it sets the
      // rotation and justification that later fields fall back to when they omit
      // their own. It is consumed here — inside a group as well as outside, since
      // that is where labels usually place it. Modelled elements need no ^FW back
      // in the output because each re-emits its own orientation; a RAW element
      // does, and gets one from _buildRawData.
      if (token.command === 'FW') {
        const parts = token.params.split(',');
        state.fwOrientation = normalizeBarcodeOrientation(parts[0], state.fwOrientation);
        // Kept verbatim so a preserved field can re-assert it; see _buildRawData.
        if (token.start >= 0 && token.end > token.start) {
          state.lastFWSource = state.source.substring(token.start, token.end).replace(/\s+$/, '');
        }
        const z = (parts[1] || '').trim();
        if (z === '0' || z === '1' || z === '2') {
          // 2 (auto) collapses to left, same as a per-field z=2.
          state.fwJustify = z === '1' ? 'R' : 'L';
        }
        continue;
      }

      // ^FO starts a new element group, and with it ends whichever one is open.
      if (token.command === 'FO') {
        this._endOpenField(state, token);
        const parts = token.params.split(',');
        state.currentGroup = {
          // Absolute dots: the ^LH in force here is added now and one adopted
          // home is subtracted at the end (_flattenLabelHome).
          x: (parseInt(parts[0]) || 0) + state.currentHome.x,
          y: (parseInt(parts[1]) || 0) + state.currentHome.y,
          homeAtOpen: { ...state.currentHome },
          commands: state.pendingFieldCommands,
          sourceStart: this._groupSourceStart(state, token),
          // Stands in for a field that never names a font: see the synthesised
          // ^A token in _buildElement.
          fwOrientation: state.fwOrientation,
          // ^FO carries the same z justification ^FT does; z=1 anchors the field's
          // right edge instead of its left. The vertical anchor stays the top.
          justify: this._readJustify(parts[2], state.fwJustify)
        };
        state.pendingFieldCommands = [];
        continue;
      }

      // ^FT (Field Typeset). Element types whose anchor we can invert are
      // normalized to the model's top-left when the group closes (see ^FS);
      // the rest still fall back to ^FO with the conversion warning.
      if (token.command === 'FT') {
        this._endOpenField(state, token);
        const parts = token.params.split(',');
        const explicitJustify = (parts[2] || '').trim();
        if (explicitJustify === '2' && !state.ftAutoWarningAdded) {
          state.warnings.push({
            command: '^FT',
            message: '^FT auto justification (z=2) was treated as left. It resolves per script direction, which this editor does not model.'
          });
          state.ftAutoWarningAdded = true;
        }
        // Each parameter defaults to "position after the last formatted text field",
        // independently: measured on Labelary, `^FT,600` keeps y and takes x from the
        // cursor, and `^FT600` does the reverse. (All three reference ports get this
        // wrong in one direction or another.)
        const rawX = parseInt(parts[0]);
        const rawY = parseInt(parts[1]);
        const cursorX = !Number.isFinite(rawX);
        const cursorY = !Number.isFinite(rawY);
        state.currentGroup = {
          // Absolute dots, as ^FO above: the anchor is normalized in the same
          // space the printer's own edge clamp works in. The cursor is already
          // absolute and carries the home of whichever field set it, so ^LH is
          // added to an explicit coordinate only.
          x: cursorX ? state.ftCursor.x : rawX + state.currentHome.x,
          y: cursorY ? state.ftCursor.y : rawY + state.currentHome.y,
          usedCursor: cursorX || cursorY,
          homeAtOpen: { ...state.currentHome },
          commands: state.pendingFieldCommands,
          sourceStart: this._groupSourceStart(state, token),
          fwOrientation: state.fwOrientation,
          isFT: true,
          // Only a value the printer actually reads counts as "the field pinned
          // its own justification"; anything else inherits the ^FW default.
          justifyExplicit: /^[012]$/.test(explicitJustify),
          // z: 1 = right. 0/absent = left; 2 (auto, script-dependent) collapses
          // to left — this editor has no bidirectional text, and the spec warns
          // auto is unreliable with variable fields, which every template here
          // has. The default itself comes from the last ^FW.
          justify: this._readJustify(parts[2], state.fwJustify)
        };
        state.pendingFieldCommands = [];
        // The conversion warning waits until the group closes: a group that
        // turns out to hold an unknown command is preserved verbatim as ^FT,
        // so nothing was converted and the warning would be false.
        continue;
      }

      // ^FS ends the current element group
      if (token.command === 'FS') {
        this._promotePendingField(state);
        this._closeGroup(state, token.end);
        continue;
      }

      // ^XZ ends the label, and with it any field still open: the printer closes
      // the last field at the end of the label, so a template whose final ^FS is
      // missing still prints (Labelary renders one byte-identically with and
      // without it). Same contract the dangling passthrough run has always had.
      if (token.command === 'XZ') {
        this._endOpenField(state, token);
        continue;
      }

      // If inside an element group, accumulate commands
      if (state.currentGroup) {
        // Modal commands take effect where the printer reads them, and labels do
        // write them inside a field: ^BY sets the barcode defaults, ^CF the
        // default font, ^CI the character set. They are still kept in the group, so a
        // field preserved as RAW re-emits them and ^BY stays visible to the barcode
        // parsers.
        if (token.command === 'BY') {
          this._parseBY(token, state);
        } else if (HEADER_COMMANDS.has(token.command)) {
          this._parseHeaderCommand(token, state, options);
        }
        token.fwOrientation = state.fwOrientation;
        token.charEncoding = state.charEncoding;
        state.currentGroup.commands.push(token);
        continue;
      }

      // Outside a group: handle header/global commands
      if (token.command === 'BY') {
        this._parseBY(token, state);
        continue;
      }

      // A field command read before the field's ^FO/^FT waits for the group to open.
      if (isFieldScopedCommand(token.command)) {
        token.fwOrientation = state.fwOrientation;
        token.charEncoding = state.charEncoding;
        state.pendingFieldCommands.push(token);
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

    // Resolve the one ^LH the label carries and fold it out of the absolute
    // coordinates the fields were parsed in. Runs before _applyLabelMeta because
    // _centerPrintWidthOnMedia adds the ^PW gap on top of the adopted home.
    this._flattenLabelHome(state);

    // Apply validated label metadata last so it overrides ^PW-derived width and
    // the dpmm/height defaults. Each field is validated independently against the
    // editor's bounds; an invalid value is ignored (falls back) and warns, while
    // unknown keys are silently skipped (forward-compat).
    this._applyLabelMeta(state);
    this._pinInheritedFonts(state);

    return {
      elements: state.elements,
      labelSettings: state.labelSettings,
      warnings: state.warnings
    };
  }

  /**
   * End the field that is open, because a new one is starting (^FO/^FT) or the
   * label is ending (^XZ). A field whose ^FS is missing still prints: the printer
   * closes it when the next origin arrives, and Labelary renders such a template
   * byte-identically with and without the ^FS. Without this, a group opened by
   * ^FO/^FT was overwritten by the next one and its element vanished — not even
   * kept as a RAW passthrough.
   *
   * @param {Object} state
   * @param {Object} token The command that ends the field. A field that
   *   positioned itself is closed whatever it holds; one that did not needs data
   *   to prove it is a field at all — otherwise a modal ^A or ^BY, which
   *   describes the *next* field, would mint an empty one instead of flowing
   *   into it. A preserved group's verbatim span stops at the token's start, so
   *   it never swallows the command that ended it.
   */
  _endOpenField(state, token) {
    this._promotePendingField(state, { requireData: true });
    this._closeGroup(state, token.start);
  }

  /**
   * Open a group for a field that described itself but never positioned itself —
   * `^A0N,30^FDhi^FS` with no ^FO/^FT. The printer prints it at the label home,
   * so the buffered commands become a group there.
   *
   * @param {Object} state
   * @param {Object} [options]
   * @param {boolean} [options.requireData] Only promote when the buffer holds a
   *   ^FD/^FV. Set by _endOpenField, where the buffer may instead be a modal
   *   command that belongs to the next field rather than to this one.
   */
  _promotePendingField(state, { requireData = false } = {}) {
    const pending = state.pendingFieldCommands;
    if (state.currentGroup || !pending.length) return;
    if (requireData && !lastFieldDataToken(pending)) return;
    state.currentGroup = {
      x: state.currentHome.x,
      y: state.currentHome.y,
      homeAtOpen: { ...state.currentHome },
      commands: pending,
      sourceStart: pending[0].start,
      fwOrientation: state.fwOrientation
    };
    state.pendingFieldCommands = [];
  }

  /**
   * Close the open element group and emit what it describes: a RAW passthrough
   * when the group held an unknown command, otherwise the modelled element.
   *
   * @param {Object} state
   * @param {number} rawEnd Where a preserved group's verbatim span stops: the
   *   ^FS token's end when the field terminated itself, the ^XZ token's start
   *   when it didn't (so the span never swallows the ^XZ).
   */
  _closeGroup(state, rawEnd) {
    if (!state.currentGroup) return;
    const group = state.currentGroup;
    if (group.hasUnknown) {
      // Any unknown command makes the whole group opaque. Splitting a
      // known element out of it would silently drop the unknown one,
      // which is the data loss this element type exists to prevent.
      state.elements.push(this._buildRawData(state, group.sourceStart, rawEnd, group.homeAtOpen));
      // A preserved span can still hold a printable ^FT text field, which advances the
      // printer's cursor while nothing here does. Keep the coordinates — they are the
      // best guess left — but stop claiming they are the printer's.
      state.ftCursor.reliable = false;
      state.ftCursor.source = 'preserved ZPL';
    } else {
      const element = this._buildElement(group, state);
      if (element) {
        // Which data command the field arrived as. Recorded here rather
        // than in each of the per-type parsers, since they all reach their
        // data through the same ^FD/^FV lookup. Absent means ^FD. Read from
        // the token whose payload won, not from whether a ^FV appears anywhere:
        // `^FVold^FDnew` is a retained field, however it started.
        if (lastFieldDataToken(group.commands)?.command === 'FV') element.fieldDataCommand = 'FV';
        // Both read the cursor as the field consumed it, so they run before the
        // advance below overwrites it.
        this._warnTypesetCursor(state, group);
        // The cursor advances in raw ^FT-anchor space, so it is read before
        // normalizeFtImport rewrites x/y to the top-left. Every anchorable field moves
        // it, ^FO and ^FT alike — measured, not assumed.
        this._advanceTypesetCursor(state, group, element);
        // ^FT normalization happens here, not in the per-type parsers:
        // this is the first point where the element's own declared
        // dimensions are known, and the anchor is derived from those.
        // Text anchors need the ^CF defaults an element inherits when its
        // own font size is 0 — the same values the emitter will resolve
        // against, so the two directions stay exact inverses.
        const anchored = group.isFT
          ? normalizeFtImport(element, group.justify, {
              fontId: state.defaultFont.id,
              defaultFontHeight: state.defaultFont.height,
              defaultFontWidth: state.defaultFont.width,
              // Omit customFonts until async import hashes and loads ~DY faces;
              // width-dependent anchors then safely fall back to ^FO.
          }, group.justifyExplicit)
          : null;
        // A right-justified ^FO needs the same x inversion but no vertical one.
        if (!group.isFT && group.justify === 'R'
          && !normalizeFoJustifyImport(element, {
            fontId: state.defaultFont.id,
            defaultFontHeight: state.defaultFont.height,
            defaultFontWidth: state.defaultFont.width,
          })
          && !state.foJustifyWarningAdded) {
          state.warnings.push({
            command: '^FO',
            message: `^FO right justification (z=1) was treated as left for this ${element.type} field, whose width is not measured here. Its position may need adjustment.`
          });
          state.foJustifyWarningAdded = true;
        }
        // The home this field was written under, plus the offset the emitter
        // will add back on top of the top-left. _flattenLabelHome folds one
        // adopted home out of every element and needs both.
        const { dx, dy } = emittedOriginOffset(element, {
          fontId: state.defaultFont.id,
          defaultFontHeight: state.defaultFont.height,
          defaultFontWidth: state.defaultFont.width,
        });
        element._fieldHome = { ...group.homeAtOpen, offX: dx, offY: dy };
        state.elements.push(element);
        if (group.isFT && !anchored && !state.ftWarningAdded) {
          // Only what the anchor module can't invert is still converted:
          // unsupported 2D symbologies, rotated ^FB/^TB blocks, and
          // right-justified text. Everything else round-trips as ^FT.
          state.warnings.push({
            command: '^FT',
            message: `^FT (Field Typeset) was converted to ^FO for this ${element.type} field, whose typeset anchor is not modelled yet. Its position may need adjustment.`
          });
          state.ftWarningAdded = true;
        }
      }
    }
    state.currentGroup = null;
  }

  /**
   * Move the typeset cursor to where this field left the printer's. Runs on the raw
   * group coordinates, in anchor space; see typesetCursorAdvance for the per-type extent
   * and the rotation table, both calibrated on Labelary.
   */
  _advanceTypesetCursor(state, group, element) {
    const advance = typesetCursorAdvance(element, {
      fontId: state.defaultFont.id,
      defaultFontHeight: state.defaultFont.height,
      defaultFontWidth: state.defaultFont.width,
      // No customFonts: during the synchronous parse a
      // ~DY face measures through the browser fallback, which reads as success.
    }, group.isFT);
    // Nothing the printer anchors (for example a ^FX comment's leftovers): it would not have
    // moved its cursor either, so leaving it alone is the accurate answer, not a gap.
    if (!advance) return;
    if (!advance.measured) {
      state.ftCursor.reliable = false;
      state.ftCursor.source = element.type;
      return;
    }
    // A field placed FROM an unreliable cursor cannot produce a reliable one, however
    // well its own advance measured — the error it inherited rides along.
    const inherited = group.usedCursor && !state.ftCursor.reliable;
    const reliable = advance.reliable && !inherited;
    state.ftCursor = {
      x: group.x + advance.dx,
      y: group.y + advance.dy,
      reliable,
      source: reliable ? null : (advance.reliable ? state.ftCursor.source : element.type)
    };
  }

  /**
   * One-shot warnings for a field that took its position from the cursor. The editor has
   * no cursor of its own, so a chained field is resolved to an absolute coordinate and
   * re-exports as an explicit ^FT — the same trade _flattenLabelHome makes for ^LH.
   */
  _warnTypesetCursor(state, group) {
    if (!group.usedCursor) return;
    if (!state.ftCursorWarningAdded) {
      state.warnings.push({
        command: '^FT',
        message: '^FT continued from the previous field\'s end position. The chained fields were given absolute coordinates, which prints the same label but does not preserve the bare ^FT commands.'
      });
      state.ftCursorWarningAdded = true;
    }
    if (!state.ftCursor.reliable && !state.ftCursorUnreliableWarningAdded) {
      state.warnings.push({
        command: '^FT',
        message: `^FT continued from a field whose end position could not be measured (${state.ftCursor.source}). Its position may need adjustment.`
      });
      state.ftCursorUnreliableWarningAdded = true;
    }
  }

  /**
   * ^FO/^FT z parameter: 1 = right, 0 = left, 2 = auto (script-dependent,
   * collapsed to left — no bidirectional text here). Absent falls back to the
   * last ^FW default, never to the previous field's value (spec).
   */
  _readJustify(raw, fwDefault) {
    const z = (raw || '').trim();
    if (z === '1') return 'R';
    if (z === '0' || z === '2') return 'L';
    return fwDefault || 'L';
  }

  /**
   * Build a RAW element data object from a source span. The span is sliced out
   * of the original ZPL rather than re-synthesised from tokens, so casing,
   * inner whitespace, ^FT vs ^FO and parameters the parser doesn't read (a
   * third ^FO justification value, say) all survive untouched.
   */
  _buildRawData(state, start, end, homeAtOpen) {
    let text = (start >= 0 && end > start)
      ? state.source.substring(start, end).replace(/\s+$/, '')
      : '';

    // ^LR is modal and, like ^FW below, is consumed rather than passed through:
    // every modelled element re-emits it as its own ^FR. A preserved field under
    // ^LRY would otherwise round-trip as normal print and silently change what the
    // label prints. ^FR is the per-field spelling of the same flag, so it restores
    // the reversal without leaking into the fields that follow. Skipped when the
    // span already says so itself, either way round.
    if (state.labelReverse && !/\^FR/i.test(text) && !/\^LR/i.test(text)) {
      text = '^FR' + text;
    }

    // ^BY is modal: it sets barcode module width/ratio/height for every ^B that
    // follows, and the generator re-emits it per known barcode rather than in
    // the header. A preserved barcode therefore has to carry its own copy, or
    // it round-trips at whatever defaults the previous element happened to
    // leave behind. Only barcodes need it, and only if the span lacks its own.
    if (state.lastBYSource && /\^B(?!Y)/i.test(text) && !/\^BY/i.test(text)) {
      text = state.lastBYSource + text;
    }

    // ^FW is modal the same way: it supplies the orientation for any ^A, ^B or
    // ^GS that omits its own, and it is consumed rather than passed through
    // (every modelled element re-emits its orientation explicitly). A preserved
    // field would otherwise fall back to the printer's normal orientation.
    if (state.lastFWSource && /\^(A|B(?!Y)|GS)/i.test(text) && !/\^FW/i.test(text)) {
      text = state.lastFWSource + text;
    }

    // The home in force where the span opened, not where it closed — an ^LH can
    // sit between the ^FO and the ^FS. _flattenLabelHome compares it against the
    // adopted home once that exists, then drops the key.
    return { type: 'RAW', text, _rawHome: { ...homeAtOpen } };
  }

  /**
   * Emit the open passthrough run, if any, as a RAW element.
   */
  _flushRawRun(state) {
    if (!state.rawRun) return;
    state.elements.push(this._buildRawData(state, state.rawRun.start, state.rawRun.end, state.rawRun.homeAtOpen));
    state.rawRun = null;
  }

  /**
   * Parse ^BY command (barcode field defaults)
   */
  _parseBY(token, state) {
    const parts = token.params.split(',');
    if (parts[0]) state.barcodeDefaults.width = byModuleWidth(parts[0], state.barcodeDefaults.width);
    // An unreadable value leaves the parameter alone — ^BY's parameters persist and
    // the doc has an out-of-range value ignored, not reset to the power-up default.
    // The per-field override in _parseBarcode falls back the same way.
    if (parts[1]) state.barcodeDefaults.ratio = parseFloat(parts[1]) || state.barcodeDefaults.ratio;
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

    this._centerPrintWidthOnMedia(state);
  }

  /**
   * The printable strip that ^PW defines is centred on the media, so every field
   * prints (mediaWidth − printWidth) / 2 dots right of its ^FO x. The editor has a
   * single width — media and print width are the same — so ^PW alone never shows
   * this. Label metadata can declare media wider than ^PW, and then the gap is
   * real; it is folded into the label home (^LH), which shifts every field by
   * exactly that amount and survives a round trip.
   */
  _centerPrintWidthOnMedia(state) {
    const printWidthDots = state.printWidthDots;
    const { width, dpmm } = state.labelSettings;
    if (!printWidthDots) return;
    const mediaWidthDots = Math.floor((width / 25.4) * Math.floor(dpmm * 25.4));
    if (printWidthDots >= mediaWidthDots) return;
    state.labelSettings.homeX += Math.floor((mediaWidthDots - printWidthDots) / 2);
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
          // Also kept in dots, for _centerPrintWidthOnMedia: mm would round away
          // the very gap it needs to measure.
          state.printWidthDots = dots;
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
      case 'LR': {
        // Label Reverse Print. Only Y turns it on; ^LRN and a bare ^LR both fall back
        // to the N default. Parse-time state only — it never reaches labelSettings,
        // because each affected element carries the flag out as its own ^FR.
        state.labelReverse = token.params.trim().charAt(0).toUpperCase() === 'Y';
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
        // Replaces the origin for subsequent fields only. The label's single
        // homeX/homeY is resolved from every field's home in _flattenLabelHome.
        state.currentHome = this._readLabelHome(token.params, state.currentHome);
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
            state.sawCfHeight = true;
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
      case 'CI':
        state.charEncoding = encodingForCharacterSet(token.params);
        break;
      // Silently accepted commands (no-op)
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
    // ^FV is field data too, so every `getCommand('FD')` below finds it.
    const matches = (command, cmd) => command === cmd || (cmd === 'FD' && command === 'FV');
    const hasCommand = (cmd) => commands.some(c => matches(c.command, cmd));
    const getCommand = (cmd) => {
      // A second ^FD in one field overwrites the first on the printer, so the data
      // command is read from the end; every other command keeps its first occurrence.
      if (cmd === 'FD') {
        const last = lastFieldDataToken(commands);
        if (last) return last;
      }
      return commands.find(c => matches(c.command, cmd));
    };
    const fhToken = getCommand('FH');
    // ^LRY reverse-prints every field that follows it — Zebra: "identical to placing
    // an ^FR command in all current and subsequent fields". An explicit ^FR under ^LRY
    // is a duplicate of that, not a toggle, so the two OR rather than cancel.
    const hasReverse = state.labelReverse || hasCommand('FR');
    if (state.labelReverse && !state.warnedLabelReverse) {
      state.warnedLabelReverse = true;
      state.warnings.push({
        command: '^LR',
        message: 'Label Reverse Print was applied as Reverse Print (^FR) on each field that follows it; the exported ZPL emits ^FR per field instead of ^LR'
      });
    }

    // Determine element type based on commands present
    if (hasCommand('GF')) {
      return this._parseGraphicField(group, getCommand('GF'), getCommand('FD'), hasReverse, state);
    }

    if (hasCommand('GC')) {
      return this._parseCircleFromGC(group, getCommand('GC'), hasReverse);
    }

    if (hasCommand('GE')) {
      return this._parseCircle(group, getCommand('GE'), hasReverse);
    }

    if (hasCommand('GD')) {
      return this._parseDiagonalLine(group, getCommand('GD'), hasReverse);
    }

    if (hasCommand('GS')) {
      return this._parseGraphicSymbol(group, getCommand('GS'), getCommand('FD'), fhToken, hasReverse, state);
    }

    if (hasCommand('GB')) {
      return this._parseGraphicBox(group, getCommand('GB'), hasReverse);
    }

    if (hasCommand('BQ')) {
      return this._parseQRCode(group, getCommand('BQ'), getCommand('FD'), hasReverse, state, fhToken);
    }

    if (hasCommand('BX')) {
      return this._parseDataMatrix(group, getCommand('BX'), getCommand('FD'), hasReverse, fhToken);
    }

    if (hasCommand('BF')) {
      return this._parseMicroPDF417(group, getCommand('BF'), getCommand('BY'), getCommand('FD'), hasReverse, fhToken);
    }

    for (const command of ['BB', 'BD', 'BR', 'BT']) {
      if (hasCommand(command)) {
        return getParserSymbology(command).parse(this, group, getCommand(command), getCommand('FD'), hasReverse, fhToken);
      }
    }

    if (hasCommand('BE')) {
      return this._parseBarcode(group, getCommand('BE'), getCommand('BY'), getCommand('FD'), hasReverse, state, 'EAN13', fhToken);
    }

    if (hasCommand('BU')) {
      return this._parseBarcode(group, getCommand('BU'), getCommand('BY'), getCommand('FD'), hasReverse, state, 'UPCA', fhToken);
    }

    if (hasCommand('BC')) {
      return this._parseBarcode(group, getCommand('BC'), getCommand('BY'), getCommand('FD'), hasReverse, state, 'CODE128', fhToken);
    }

    if (hasCommand('BA')) {
      return this._parseBarcode(group, getCommand('BA'), getCommand('BY'), getCommand('FD'), hasReverse, state, 'CODE93', fhToken);
    }

    if (hasCommand('BK')) {
      return this._parseBarcode(group, getCommand('BK'), getCommand('BY'), getCommand('FD'), hasReverse, state, 'CODABAR', fhToken);
    }

    if (hasCommand('BI')) {
      return this._parseBarcode(group, getCommand('BI'), getCommand('BY'), getCommand('FD'), hasReverse, state, 'INDUSTRIAL2OF5', fhToken);
    }

    if (hasCommand('BJ')) {
      return this._parseBarcode(group, getCommand('BJ'), getCommand('BY'), getCommand('FD'), hasReverse, state, 'STANDARD2OF5', fhToken);
    }

    if (hasCommand('BL')) {
      return this._parseBarcode(group, getCommand('BL'), getCommand('BY'), getCommand('FD'), hasReverse, state, 'LOGMARS', fhToken);
    }

    if (hasCommand('BM')) {
      return this._parseBarcode(group, getCommand('BM'), getCommand('BY'), getCommand('FD'), hasReverse, state, 'MSI', fhToken);
    }

    if (hasCommand('BP')) {
      return this._parseBarcode(group, getCommand('BP'), getCommand('BY'), getCommand('FD'), hasReverse, state, 'PLESSEY', fhToken);
    }

    if (hasCommand('BS')) {
      return this._parseBarcode(group, getCommand('BS'), getCommand('BY'), getCommand('FD'), hasReverse, state, 'UPCEANEXT', fhToken);
    }

    if (hasCommand('BZ')) {
      return this._parseBarcode(group, getCommand('BZ'), getCommand('BY'), getCommand('FD'), hasReverse, state, 'POSTNET', fhToken);
    }

    // ^BO is the letter-O spelling of Aztec ^B0 that label generators emit in the
    // wild; Labelary renders it as Aztec, and its parameters are laid out the same.
    if (hasCommand('BO')) {
      return this._parseAztec(group, getCommand('BO'), getCommand('FD'), hasReverse, fhToken);
    }

    // ^B3 (Code 39), ^B4 (Code 49), ^B5 (Planet Code) and ^B7 (PDF417) tokenize as command
    // 'B' with the digit pushed into params, since the tokenizer only captures letters.
    if (hasCommand('B')) {
      const bToken = getCommand('B');
      const sub = bToken.params.charAt(0);
      const shifted = { ...bToken, params: bToken.params.slice(1) };
      if (sub === '1') {
        return this._parseBarcode(group, shifted, getCommand('BY'), getCommand('FD'), hasReverse, state, 'CODE11', fhToken);
      }
      if (sub === '2') {
        return this._parseBarcode(group, shifted, getCommand('BY'), getCommand('FD'), hasReverse, state, 'INTERLEAVED2OF5', fhToken);
      }
      if (sub === '3') {
        return this._parseBarcode(group, shifted, getCommand('BY'), getCommand('FD'), hasReverse, state, 'CODE39', fhToken);
      }
      if (sub === '4') {
        return this._parseCode49(group, shifted, getCommand('BY'), getCommand('FD'), hasReverse, fhToken);
      }
      if (sub === '5') {
        return this._parseBarcode(group, shifted, getCommand('BY'), getCommand('FD'), hasReverse, state, 'PLANET', fhToken);
      }
      if (sub === '7') {
        return this._parsePDF417(group, shifted, getCommand('BY'), getCommand('FD'), hasReverse, fhToken);
      }
      if (sub === '8') {
        return this._parseBarcode(group, shifted, getCommand('BY'), getCommand('FD'), hasReverse, state, 'EAN8', fhToken);
      }
      if (sub === '9') {
        return this._parseBarcode(group, shifted, getCommand('BY'), getCommand('FD'), hasReverse, state, 'UPCE', fhToken);
      }
      if (sub === '0') {
        return this._parseAztec(group, shifted, getCommand('FD'), hasReverse, fhToken);
      }
    }

    if (hasCommand('A') || hasCommand('FD')) {
      // ^A is optional: a field that only has data prints in the font the last
      // ^CF selected. A params-less token stands in for it, which is the same
      // inherit sentinel a bare ^A produces.
      const aToken = getCommand('A') || { params: '', fwOrientation: group.fwOrientation };
      if (hasCommand('TB')) {
        return this._parseTextBlock(group, aToken, getCommand('TB'), getCommand('FD'), hasReverse, state, fhToken);
      }
      if (hasCommand('FB')) {
        return this._parseFieldBlock(group, aToken, getCommand('FB'), getCommand('FD'), hasReverse, state, fhToken);
      }
      return this._parseText(group, aToken, getCommand('FD'), hasReverse, state, fhToken);
    }

    // Unknown element group - skip
    return null;
  }

  /**
   * Where a group's source span begins: at its first buffered field command when the
   * field described itself before positioning itself, otherwise at the ^FO/^FT. A group
   * preserved as RAW re-emits this whole span, so the buffered commands must be inside it.
   */
  _groupSourceStart(state, positionToken) {
    const pending = state.pendingFieldCommands;
    return pending.length ? pending[0].start : positionToken.start;
  }

  /**
   * Parse ^A font command params
   * Format: {fontId}{orientation},{height},{width}[,{fontPath}] (e.g., "0N,30,30")
   * The font path is only carried by the scalable font ^A@ (e.g. "@N,20,18,E:FONT.TTF").
   * @returns {{ fontId: string, orientation: string, height: number, width: number, fontPath: string }}
   */
  _parseFontCommand(aToken) {
    const params = aToken.params;
    // First char is fontId, second is orientation, then comma-separated height,width.
    // A bare ^A names no font, so it keeps the '' inherit sentinel and follows the
    // label default the way the printer's current ^CF would.
    // Font names and orientations are case-insensitive on the printer (^AdN and
    // ^ADN select the same font), and the font tables here are keyed uppercase.
    const fontId = params.charAt(0).toUpperCase();
    const validOrientations = ['N', 'R', 'I', 'B'];
    let orientation = params.charAt(1).toUpperCase();
    let rest;
    if (validOrientations.includes(orientation)) {
      rest = params.substring(2);
    } else {
      // Orientation omitted (e.g. ^A0,30,20) — the field takes the ^FW default.
      orientation = tokenFwOrientation(aToken);
      rest = params.substring(1);
    }
    // Positional: an omitted parameter leaves an empty slot rather than shifting
    // the ones after it, so ^A0N,,20 is "default height, width 20" — never height 20.
    const parts = rest.replace(/^\s*,/, '').split(',');
    const height = parseInt(parts[0]) || 0;
    const width = parseInt(parts[1]) || 0;
    const fontPath = (parts[2] || '').trim();

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
   * The font whose size grid governs a field: its own, unless the id names no font
   * at all (^A1), in which case the printer prints it in the substituted ^CF font.
   */
  _sizingFontId(fontId, state) {
    return isUnknownFontId(fontId, state.customFonts)
      ? resolveRenderFontId(fontId, state.customFonts, state.defaultFont.id)
      : fontId;
  }

  /**
   * Resolve the stored fontId/fontSize/fontWidth from a parsed ^A font command:
   * fill in an omitted height, collapse values matching the label default to the
   * 0/'' inherit sentinels, then snap explicit sizes to the font's allowed grid
   * (no-op for scalable fonts).
   */
  _resolveFontSize(font, state) {
    const fontId = this._resolveScalableFontId(font, state);
    // Before ^CF supplies a height, omitted ^A height follows width magnification;
    // afterwards it inherits ^CF. A height-less ^CF does not change this state.
    const height = font.height || (font.width && !state.sawCfHeight
      ? proportionalRequestedHeight(this._sizingFontId(fontId, state), font.width)
      : 0);
    const rawSize = height === state.defaultFont.height ? 0 : height;
    const rawWidth = font.width === state.defaultFont.width ? 0 : font.width;
    const snapped = snapRequestedToAllowed(fontId, rawSize, rawWidth);
    const clamped = enforceFontMinSize(fontId, snapped.height, snapped.width);
    return {
      fontId: fontId === state.defaultFont.id ? '' : fontId,
      fontSize: clamped.height,
      fontWidth: clamped.width,
      // The ^CF in effect here. An inherit sentinel resolves against the label
      // default, which is the *last* ^CF, so a field that inherited an earlier
      // one needs that value written back in — see _pinInheritedFonts.
      _inheritedFont: { id: state.defaultFont.id, height: state.defaultFont.height, width: state.defaultFont.width }
    };
  }

  /**
   * Read an ^LH parameter pair against the home currently in force.
   *
   * An omitted, empty or unreadable axis keeps its current value rather than
   * resetting to zero, so `^LH,50` moves y and leaves x alone and a bare `^LH`
   * is a no-op. Measured on Labelary: under `^LH20,10`, a following `^LH,50`
   * renders identically to `^LH20,50`, while `^LH0,50` moves the field to x=0.
   *
   * Negatives are folded like the Offsets panel does.
   */
  _readLabelHome(params, current) {
    const parts = String(params).split(',');
    const axis = (raw, fallback) => {
      const value = parseInt(raw);
      return Number.isFinite(value) ? Math.abs(value) : fallback;
    };
    return {
      x: axis(parts[0], current.x),
      y: axis(parts[1], current.y)
    };
  }

  /**
   * Fold per-field ^LH origins into one label home. Choose the smallest used
   * home that keeps every emitted ^FO/^FT coordinate within 0..32000, then
   * subtract it from each absolute element position.
   */
  _flattenLabelHome(state) {
    const homed = state.elements.filter(element => element._fieldHome);

    // No field to speak for: keep the last ^LH the label declared.
    if (homed.length === 0) {
      state.labelSettings.homeX = state.currentHome.x;
      state.labelSettings.homeY = state.currentHome.y;
      this._warnRawLabelHome(state, state.currentHome);
      return;
    }

    const adopted = {};
    let clamped = false;
    for (const axis of ['x', 'y']) {
      const off = axis === 'x' ? 'offX' : 'offY';
      const commands = homed.map(element => element[axis] + element._fieldHome[off]);
      // reduce, not Math.min(...arr): a label with tens of thousands of fields
      // would blow the argument limit on the spread.
      const smallest = (values) => values.reduce((min, value) => (value < min ? value : min), Infinity);
      const largest = (values) => values.reduce((max, value) => (value > max ? value : max), -Infinity);
      // The smallest home in use, pulled inside [lo, hi] so no command overflows
      // (lo) and none goes negative, nor does the ^LH itself (hi).
      const preferred = smallest(homed.map(element => element._fieldHome[axis]));
      const lo = Math.max(0, largest(commands) - ZPL_MAX_COORD);
      const hi = Math.min(smallest(commands), ZPL_MAX_COORD);
      // hi wins when the two disagree: lo > hi means the commands span more than
      // the coordinate range, so no ^LH holds them all. hi keeps every command
      // non-negative and the ones over the top are clamped below.
      adopted[axis] = Math.min(hi, Math.max(lo, preferred));
      if (lo > hi) clamped = true;
    }

    state.labelSettings.homeX = adopted.x;
    state.labelSettings.homeY = adopted.y;

    // Distinct homes, not homes differing from the adopted one: a single home
    // the bounds above had to shift moves every field by the same amount, which
    // is not the mid-format change this warns about.
    const homesSeen = new Set();
    for (const element of state.elements) {
      const home = element._fieldHome;
      delete element._fieldHome;
      if (!home) continue;
      homesSeen.add(`${home.x},${home.y}`);
      element.x -= adopted.x;
      element.y -= adopted.y;
      if (!clamped) continue;
      // Clamp the command, then translate back through the anchor offset so the
      // element still describes the field the printer will draw.
      if (element.x + home.offX > ZPL_MAX_COORD) element.x = ZPL_MAX_COORD - home.offX;
      if (element.y + home.offY > ZPL_MAX_COORD) element.y = ZPL_MAX_COORD - home.offY;
    }

    if (homesSeen.size > 1) {
      state.warnings.push({
        command: '^LH',
        message: '^LH changed between fields. Field positions were folded into their ^FO coordinates under a single ^LH, which prints the same geometry but does not preserve the original command structure.'
      });
    }
    if (clamped) {
      state.warnings.push({
        command: '^LH',
        message: `Field positions span more than ${ZPL_MAX_COORD} dots and cannot be expressed under a single ^LH. The coordinates beyond the limit were clamped.`
      });
    }
    this._warnRawLabelHome(state, adopted);
  }

  /**
   * A RAW element is re-emitted verbatim, so its own ^FO coordinates
   * cannot be folded with everything else. When it was captured under a home the
   * label did not adopt, it prints at the wrong origin and has to say so — but
   * only when its coordinates actually read that home (rawDependsOnLabelHome).
   */
  _warnRawLabelHome(state, adopted) {
    let lost = false;
    for (const element of state.elements) {
      const home = element._rawHome;
      if (!home) continue;
      delete element._rawHome;
      if ((home.x !== adopted.x || home.y !== adopted.y)
        && rawDependsOnLabelHome(element.text)) lost = true;
    }
    if (!lost) return;
    state.warnings.push({
      command: '^LH',
      message: 'Preserved raw ZPL was written under a different ^LH and its coordinates were not adjusted, so it may print in the wrong place.'
    });
  }

  /**
   * Give back an explicit font to every field that inherited a ^CF the label
   * default no longer carries. Labels that set ^CF once are untouched: their
   * fields keep the inherit sentinels and re-emit without an ^A of their own.
   */
  _pinInheritedFonts(state) {
    const { fontId, defaultFontHeight, defaultFontWidth } = state.labelSettings;
    for (const element of state.elements) {
      const inherited = element._inheritedFont;
      if (!inherited) continue;
      delete element._inheritedFont;
      if (!element.fontId && inherited.id !== fontId) element.fontId = inherited.id;
      if (!element.fontSize && inherited.height !== defaultFontHeight) element.fontSize = inherited.height;
      if (!element.fontWidth && inherited.width !== defaultFontWidth) element.fontWidth = inherited.width;
    }
  }

  /**
   * Decode ^FD into an element's Content (placeholders included)
   * @returns {string}
   */
  _decodeFieldDataToken(fdToken, fhToken = null) {
    if (!fdToken) return '';
    const content = fdToken.params;
    if (!fhToken) return content;
    return decodeFieldData(content, getFieldHexIndicator(fhToken.params), fdToken.charEncoding || DEFAULT_FIELD_ENCODING);
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

    // ^FB ignores physical line breaks in ^FD; only \& creates a field-block
    // break. Discard source formatting before decoding the explicit escapes.
    let fdContent = this._decodeFieldDataToken(fdToken, fhToken);
    fdContent = fdContent.replace(/\r\n?|\n/g, '');

    // Strip trailing \& for center-justified text blocks.
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

    // Orientation is always the first param; an empty/invalid value takes the ^FW default.
    const orientation = normalizeBarcodeOrientation(parts[0], tokenFwOrientation(token));

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
      if (byParts[0]) width = byModuleWidth(byParts[0], width);
      if (byParts[1]) ratio = parseFloat(byParts[1]) || ratio;
      if (byParts[2]) height = parseInt(byParts[2]) || height;
    }
    // The command's own height parameter, when present, overrides the ^BY default.
    if (parts[heightIdx]) height = parseInt(parts[heightIdx]) || height;

    // Strip the Code 128 start-subset invocation (>9 = A, >: = B, >; = C); it is
    // an encoding prefix the editor re-adds on render, not part of the element's
    // Content. Which subset the field starts in changes the bars, so it is kept
    // on the element. Without a prefix the printer starts in Subset B.
    let rawData = this._decodeFieldDataToken(fdToken, fhToken);
    let code128Subset = 'B';
    // ^BC m (mode): N = none, U = UCC Case, A = automatic, D = UCC/EAN. The three
    // non-N modes pick their own subsets, so an invocation code in front of the data
    // is not a start code there — it is data (verified on Labelary) and stays put.
    let code128Mode = 'N';
    if (symbology === 'CODE128') {
      const m = (parts[5] || 'N').trim().toUpperCase();
      if (m === 'U' || m === 'A' || m === 'D') code128Mode = m;
      if (code128Mode === 'N') {
        const subset = { '>9': 'A', '>:': 'B', '>;': 'C' }[rawData.slice(0, 2)];
        if (subset) {
          code128Subset = subset;
          rawData = rawData.slice(2);
        }
      }
    }
    return {
      code128Subset,
      code128Mode,
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
    // ^BXo,h,s,c,r,f,g,a. A c/r pair forces the symbol size — without it an imported
    // symbol auto-sizes and comes out smaller than Labelary's. f/g/a don't affect the
    // canvas but are kept so the command round-trips unchanged.
    const parts = bxToken.params.split(',');
    const orientation = normalizeBarcodeOrientation(parts[0], tokenFwOrientation(bxToken));
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
      dmColumns: parseInt(parts[3]) || 0,  // 0 = auto
      dmRows: parseInt(parts[4]) || 0,     // 0 = auto
      dmFormat: parseInt(parts[5]) || 0,   // 0 = unset (1-6; ignored at ECC 200)
      dmEscape: (parts[6] || '').trim(),   // '' = unset (printer default '~')
      dmAspect: parseInt(parts[7]) || 0,   // 0 = unset, 1 = square, 2 = rectangular
      reverse: hasReverse
    };
  }

  /**
   * Parse a PDF417 element from ^B7 + ^FD (with optional ^BY for module width)
   */
  _parsePDF417(group, b7Token, byToken, fdToken, hasReverse, fhToken = null) {
    // ^B7 params: orientation,rowHeight,securityLevel,columns,rows,truncate
    const parts = b7Token.params.split(',');
    const orientation = normalizeBarcodeOrientation(parts[0], tokenFwOrientation(b7Token));
    const rowHeight = parseInt(parts[1]) || 4;
    const securityLevel = parseInt(parts[2]);
    const columns = parseInt(parts[3]) || 0;
    const rows = parseInt(parts[4]) || 0;
    // t=Y drops the right row indicator and shortens the stop pattern.
    const truncate = (parts[5] || 'N').trim().toUpperCase() === 'Y';

    let moduleWidth = 2;
    if (byToken) {
      const byParts = byToken.params.split(',');
      if (byParts[0]) moduleWidth = parseInt(byParts[0]) || 2;
    }

    // A line break inside ^FD is a data-stream line terminator, not data: the printer
    // drops it before the symbol is encoded (verified on Labelary — a ^B7 field whose
    // data starts on the line after ^FD renders identically to the one-line form).
    // Keeping it would encode one extra codeword and change every module after it.
    // Drop it from the raw field, ahead of ^FH decoding: an escaped _0A/_0D is data
    // the printer does encode, and decoding first would delete that too.
    const dataToken = fdToken && { ...fdToken, params: fdToken.params.replace(/\r\n?|\n/g, '') };
    const rawData = this._decodeFieldDataToken(dataToken, fhToken);
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
      // ^B7's s defaults to 0 (error detection only), not to the editor's own
      // default for a freshly drawn PDF417 — verified against Labelary, where an
      // omitted s encodes two error codewords.
      securityLevel: Number.isNaN(securityLevel) ? 0 : securityLevel,
      columns,
      rows,
      truncate,
      reverse: hasReverse
    };
  }

  /**
   * Parse Micro-PDF417 element from ^BF + ^FD
   */
  _parseMicroPDF417(group, bfToken, byToken, fdToken, hasReverse, fhToken = null) {
    // ^BF params: orientation,height(rowHeight),mode(0-33)
    const parts = bfToken.params.split(',');
    const orientation = normalizeBarcodeOrientation(parts[0], tokenFwOrientation(bfToken));
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
    const orientation = normalizeBarcodeOrientation(parts[0], tokenFwOrientation(b4Token));
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
    const orientation = normalizeBarcodeOrientation(parts[0], tokenFwOrientation(b0Token));
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
    const orientation = normalizeBarcodeOrientation(parts[0], tokenFwOrientation(gsToken));

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
   * (the author wrote an ellipse command).
   */
  _parseCircle(group, geToken, hasReverse) {
    const parts = geToken.params.split(',');
    // ^GE w,h,t,c — dims 3–4095, thickness 2–4095, default thickness 1.
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
   * ^GC d,t,c — diameter 3–4095 (default 3), thickness 2–4095 (default 1).
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
   *   - 'A' compression with ACS run-length hex (G-Y/g-z counts, ',' '!' ':')
   *   - ':B64:' inline base64 payload (with optional CRC suffix)
   *   - ':Z64:' zlib-deflated base64 payload (re-emitted as :B64: on export,
   *     since there is no synchronous deflate available in the browser)
   * Anything else (raw binary 'B', compressed 'C', or a payload that fails to
   * decode) is preserved as opaque — the original ^FO/^GF/^FD/^FS bytes are
   * stashed and re-emitted verbatim so the user doesn't lose them on round-trip.
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

    const decodedData = (encodingFormat, bytes, crcWarning = false) => ({
      type: 'GRAPHIC',
      x: group.x,
      y: group.y,
      widthDots,
      heightDots: (bytesPerRow > 0 ? Math.floor(bytes.length / bytesPerRow) : 0) || heightDots,
      bytesPerRow,
      encodingFormat,
      bytes,
      threshold: 128,
      crcWarning,
      reverse: hasReverse,
    });

    if (compression === 'A') {
      const trimmed = payload.replace(/\s+/g, '');
      const bytes = hexToBytes(trimmed);
      if (bytes) {
        return decodedData('A', bytes);
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
          return decodedData('B64', decoded.bytes, !decoded.crcOk);
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
          // No synchronous deflate in the browser — re-emit as :B64:.
          return decodedData('B64', decoded.bytes, !decoded.crcOk);
        }
      }
      // Last resort before giving up: ACS run-length hex. Tried after the
      // :B64:/:Z64: prefixes so their leading ':' is never read as an ACS
      // repeat-previous-row token.
      const acsBytes = acsToBytes(trimmed, bytesPerRow, totalBytes);
      if (acsBytes) {
        return decodedData('A', acsBytes);
      }
      const reason = payload.startsWith(':Z64:')
        ? ':Z64: data could not be decoded'
        : 'payload is neither plain hex nor valid ACS run-length data';
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
      mediaDarkness: 15,
      printSpeed: 4,
      slewSpeed: 4,
      backfeedSpeed: 4,
      fontId: DEFAULT_FONT_ID,
      customFonts: [],
      defaultFontHeight: POWER_UP_FONT_HEIGHT,
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
