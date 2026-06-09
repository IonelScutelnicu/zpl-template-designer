// ZPL Parser Service
// Parses ZPL template strings into app element objects and label settings

import { b64WithCrcToBytes, hexToBytes } from '../utils/graphicField.js';
import { snapRequestedToAllowed, enforceFontMinSize } from '../utils/zplFontSnap.js';

/**
 * Known ZPL commands that the parser handles (won't generate warnings)
 */
const KNOWN_COMMANDS = new Set([
  'XA', 'XZ', 'PW', 'PR', 'PO', 'PM', 'MN', 'LL', 'SD', 'LH', 'LT', 'CI', 'MT',
  'CF', 'CW', 'PQ', 'FO', 'FT', 'A', 'FB', 'TB', 'FD', 'FS', 'FR', 'BC', 'BY',
  'BQ', 'GB', 'GE', 'GC', 'GF', 'FX',
  // Additional barcode symbologies: ^B3 (Code 39) and ^B7 (PDF417) tokenize as
  // 'B' since the tokenizer only captures letters; ^BE/^BU/^BX are two-letter.
  'B', 'BE', 'BU', 'BX'
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

/**
 * Header commands that configure label settings (not element-specific)
 */
const HEADER_COMMANDS = new Set([
  'XA', 'XZ', 'PW', 'PR', 'PO', 'PM', 'MN', 'LL', 'SD', 'LH', 'LT', 'CI', 'MT',
  'CF', 'CW', 'PQ'
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

    const tokens = this._tokenize(zpl);
    return this._processTokens(tokens, { dpmm, labelHeight });
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
   * @returns {Array<{prefix: string, command: string, params: string}>}
   */
  _tokenize(zpl) {
    // Extract content between first ^XA and last ^XZ
    const xaIndex = zpl.indexOf('^XA');
    const xzIndex = zpl.lastIndexOf('^XZ');
    if (xaIndex === -1 || xzIndex === -1 || xaIndex >= xzIndex) {
      return [];
    }

    const content = zpl.substring(xaIndex, xzIndex + 3);
    const tokens = [];

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
        tokens.push({ prefix: m.prefix, command: m.command, params });
      } else if (m.command === 'FX') {
        // ^FX is a comment: consume everything through the matching ^FS as an
        // opaque payload, and skip the contained matches so any ^/~ sequences
        // inside the comment are NOT re-tokenized as live commands.
        let fsMatchIdx = -1;
        for (let j = i + 1; j < matches.length; j++) {
          if (matches[j].command === 'FS') {
            fsMatchIdx = j;
            break;
          }
        }
        const paramEnd = fsMatchIdx !== -1 ? matches[fsMatchIdx].index : nextIndex;
        const params = content.substring(m.codeEnd, paramEnd).replace(/^\s+/, '').replace(/\s+$/, '');
        tokens.push({ prefix: m.prefix, command: 'FX', params });
        // Jump to just before the ^FS so the loop resumes there (the ^FS is
        // still emitted normally to close the comment / any open group).
        if (fsMatchIdx !== -1) i = fsMatchIdx - 1;
      } else {
        const params = content.substring(m.codeEnd, nextIndex).replace(/^\s+/, '').replace(/\s+$/, '');
        tokens.push({ prefix: m.prefix, command: m.command, params });
      }
    }

    return tokens;
  }

  /**
   * Process token array into elements and label settings
   * @param {Array} tokens - Token array from _tokenize()
   * @param {Object} options - Parse options
   * @returns {{ elements: Array, labelSettings: Object, warnings: Array }}
   */
  _processTokens(tokens, options) {
    const { dpmm, labelHeight } = options;

    const state = {
      labelSettings: this._defaultLabelSettings(dpmm, labelHeight),
      elements: [],
      warnings: [],
      currentGroup: null,
      barcodeDefaults: { width: 2, ratio: 2.0, height: 50 },
      defaultFont: { id: '0', height: 20, width: 0 },
      customFonts: [],
      labelMeta: null,
      sawCommand: false
    };

    for (const token of tokens) {
      // Check for unknown commands. ^B is only "known" for ^B3 (Code 39) and
      // ^B7 (PDF417); other numeric variants (^B1/^B2/^B8/^B9, …) have no
      // dispatch branch and would otherwise be dropped silently, so they must
      // still warn.
      const isKnown = KNOWN_COMMANDS.has(token.command)
        && (token.command !== 'B'
          || token.params.charAt(0) === '3'
          || token.params.charAt(0) === '7');
      if (!isKnown) {
        state.warnings.push({
          command: `${token.prefix}${token.command}`,
          message: `Unsupported command "${token.prefix}${token.command}" was ignored`
        });
        continue;
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
          commands: []
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
          commands: []
        };
        if (!state.ftWarningAdded) {
          state.warnings.push({
            command: '^FT',
            message: '^FT (Field Typeset) was converted to ^FO (Field Origin). Position may need adjustment — ^FT uses bottom-left origin while ^FO uses top-left.'
          });
          state.ftWarningAdded = true;
        }
        continue;
      }

      // ^FS ends the current element group
      if (token.command === 'FS') {
        if (state.currentGroup) {
          const element = this._buildElement(state.currentGroup, state);
          if (element) {
            state.elements.push(element);
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

    // Apply custom fonts to label settings
    if (state.customFonts.length > 0) {
      state.labelSettings.customFonts = state.customFonts;
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
   * Parse ^BY command (barcode field defaults)
   */
  _parseBY(token, state) {
    const parts = token.params.split(',');
    if (parts[0]) state.barcodeDefaults.width = parseInt(parts[0]) || 2;
    if (parts[1]) state.barcodeDefaults.ratio = parseFloat(parts[1]) || 2.0;
    if (parts[2]) state.barcodeDefaults.height = parseInt(parts[2]) || state.barcodeDefaults.height;
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
        state.labelSettings.homeX = parseInt(parts[0]) || 0;
        state.labelSettings.homeY = parseInt(parts[1]) || 0;
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
        if (parts.length >= 2) {
          state.customFonts.push({ id: parts[0].trim(), fontFile: parts.slice(1).join(',').trim() });
        }
        break;
      }
      case 'PQ': {
        const parts = token.params.split(',');
        const qtyStr = parts[0] || '';
        // Detect placeholder pattern %name%
        const placeholderMatch = qtyStr.match(/^%([^%]+)%$/);
        if (placeholderMatch) {
          state.labelSettings.printQuantityPlaceholder = placeholderMatch[1];
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
      case 'MT':
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

    if (hasCommand('GB')) {
      return this._parseGraphicBox(group, getCommand('GB'), hasCommand('FR'));
    }

    if (hasCommand('BQ')) {
      return this._parseQRCode(group, getCommand('BQ'), getCommand('FD'), hasCommand('FR'), state);
    }

    if (hasCommand('BX')) {
      return this._parseDataMatrix(group, getCommand('BX'), getCommand('FD'), hasCommand('FR'));
    }

    if (hasCommand('BE')) {
      return this._parseBarcode(group, getCommand('BE'), getCommand('BY'), getCommand('FD'), hasCommand('FR'), state, 'EAN13');
    }

    if (hasCommand('BU')) {
      return this._parseBarcode(group, getCommand('BU'), getCommand('BY'), getCommand('FD'), hasCommand('FR'), state, 'UPCA');
    }

    if (hasCommand('BC')) {
      return this._parseBarcode(group, getCommand('BC'), getCommand('BY'), getCommand('FD'), hasCommand('FR'), state, 'CODE128');
    }

    // ^B3 (Code 39) and ^B7 (PDF417) tokenize as command 'B' with the digit
    // pushed into params, since the tokenizer only captures letters.
    if (hasCommand('B')) {
      const bToken = getCommand('B');
      const sub = bToken.params.charAt(0);
      const shifted = { ...bToken, params: bToken.params.slice(1) };
      if (sub === '3') {
        return this._parseBarcode(group, shifted, getCommand('BY'), getCommand('FD'), hasCommand('FR'), state, 'CODE39');
      }
      if (sub === '7') {
        return this._parsePDF417(group, shifted, getCommand('BY'), getCommand('FD'), hasCommand('FR'));
      }
    }

    if (hasCommand('A') && hasCommand('TB')) {
      return this._parseTextBlock(group, getCommand('A'), getCommand('TB'), getCommand('FD'), hasCommand('FR'), state);
    }

    if (hasCommand('A') && hasCommand('FB')) {
      return this._parseFieldBlock(group, getCommand('A'), getCommand('FB'), getCommand('FD'), hasCommand('FR'), state);
    }

    if (hasCommand('A')) {
      return this._parseText(group, getCommand('A'), getCommand('FD'), hasCommand('FR'), state);
    }

    // Unknown element group - skip
    return null;
  }

  /**
   * Parse ^A font command params
   * Format: {fontId}{orientation},{height},{width} (e.g., "0N,30,30")
   * @returns {{ fontId: string, orientation: string, height: number, width: number }}
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

    return { fontId, orientation, height, width };
  }

  /**
   * Resolve the stored fontId/fontSize/fontWidth from a parsed ^A font command:
   * collapse values matching the label default to the 0/'' inherit sentinels, then
   * snap explicit sizes to the font's allowed grid (no-op for scalable fonts).
   */
  _resolveFontSize(font, state) {
    const rawSize = font.height === state.defaultFont.height ? 0 : font.height;
    const rawWidth = font.width === state.defaultFont.width ? 0 : font.width;
    const snapped = snapRequestedToAllowed(font.fontId, rawSize, rawWidth);
    const clamped = enforceFontMinSize(font.fontId, snapped.height, snapped.width);
    return {
      fontId: font.fontId === state.defaultFont.id ? '' : font.fontId,
      fontSize: clamped.height,
      fontWidth: clamped.width
    };
  }

  /**
   * Parse ^FD content, detecting placeholder patterns
   * @returns {{ text: string, placeholder: string }}
   */
  _parseFieldData(fdToken) {
    if (!fdToken) return { text: '', placeholder: '' };

    const content = fdToken.params;
    const match = content.match(/^%([^%]+)%$/);
    if (match) {
      return { text: match[1], placeholder: match[1] };
    }
    return { text: content, placeholder: '' };
  }

  /**
   * Parse TEXT element from ^A + ^FD
   */
  _parseText(group, aToken, fdToken, hasReverse, state) {
    const font = this._parseFontCommand(aToken);
    const { text, placeholder } = this._parseFieldData(fdToken);

    return {
      type: 'TEXT',
      x: group.x,
      y: group.y,
      previewText: text,
      placeholder,
      ...this._resolveFontSize(font, state),
      orientation: font.orientation,
      reverse: hasReverse
    };
  }

  /**
   * Parse FIELDBLOCK element from ^A + ^FB + ^FD
   */
  _parseFieldBlock(group, aToken, fbToken, fdToken, hasReverse, state) {
    const font = this._parseFontCommand(aToken);

    // Parse ^FB params: blockWidth,maxLines,lineSpacing,justification,hangingIndent
    const fbParts = fbToken.params.split(',');
    const blockWidth = parseInt(fbParts[0]) || 200;
    const maxLines = parseInt(fbParts[1]) || 1;
    const lineSpacing = parseInt(fbParts[2]) || 0;
    const justification = fbParts[3] || 'L';
    const hangingIndent = parseInt(fbParts[4]) || 0;

    // Parse ^FD content - strip trailing \& for center-justified text blocks
    let fdContent = fdToken ? fdToken.params : '';
    if (fdContent.endsWith('\\&')) {
      fdContent = fdContent.slice(0, -2);
    }

    // Detect placeholder in the cleaned content
    const match = fdContent.match(/^%([^%]+)%$/);
    const text = match ? match[1] : fdContent;
    const placeholder = match ? match[1] : '';

    return {
      type: 'FIELDBLOCK',
      x: group.x,
      y: group.y,
      previewText: text,
      placeholder,
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
  _parseTextBlock(group, aToken, tbToken, fdToken, hasReverse, state) {
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

    const { text, placeholder } = this._parseFieldData(fdToken);

    return {
      type: 'TEXTBLOCK',
      x: group.x,
      y: group.y,
      previewText: text,
      placeholder,
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
  _parseBarcode(group, token, byToken, fdToken, hasReverse, state, symbology = 'CODE128') {
    const parts = token.params.split(',');

    // Orientation is always the first param; default N for an empty/invalid value.
    const rawOrientation = (parts[0] || 'N').trim().toUpperCase();
    const orientation = ['N', 'R', 'I', 'B'].includes(rawOrientation) ? rawOrientation : 'N';

    // Code 39 (^B3o,e,h,f) carries a check-digit param before height.
    let heightIdx = 1;
    let showIdx = 2;
    let checkDigit = false;
    if (symbology === 'CODE39') {
      checkDigit = (parts[1] || 'N').trim() === 'Y';
      heightIdx = 2;
      showIdx = 3;
    }
    const showText = (parts[showIdx] || 'Y').trim() !== 'N';
    // "Print interpretation line above code" (g) sits right after f in all four commands.
    const printTextAbove = (parts[showIdx + 1] || 'N').trim() === 'Y';

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

    // Strip Code 128 Subset B start character (>:) before detecting the
    // placeholder — the placeholder pattern is anchored, so the prefix would
    // otherwise prevent a match.
    let rawData = fdToken ? fdToken.params : '';
    if (symbology === 'CODE128' && rawData.startsWith('>:')) {
      rawData = rawData.slice(2);
    }
    const match = rawData.match(/^%([^%]+)%$/);
    const cleanText = match ? match[1] : rawData;
    const placeholder = match ? match[1] : '';

    return {
      type: 'BARCODE',
      symbology,
      x: group.x,
      y: group.y,
      previewData: cleanText,
      placeholder,
      height,
      width,
      ratio,
      showText,
      checkDigit,
      orientation,
      printTextAbove,
      reverse: hasReverse
    };
  }

  /**
   * Parse a Data Matrix element from ^BX + ^FD
   */
  _parseDataMatrix(group, bxToken, fdToken, hasReverse) {
    // ^BX params: orientation,height(module size),quality,columns,rows,...
    const parts = bxToken.params.split(',');
    const moduleSize = parseInt(parts[1]) || 4;
    const quality = parseInt(parts[2]) || 200;

    const rawData = fdToken ? fdToken.params : '';
    const match = rawData.match(/^%([^%]+)%$/);

    return {
      type: 'QRCODE',
      symbology: 'DATAMATRIX',
      x: group.x,
      y: group.y,
      previewData: match ? match[1] : rawData,
      placeholder: match ? match[1] : '',
      moduleSize,
      quality,
      reverse: hasReverse
    };
  }

  /**
   * Parse a PDF417 element from ^B7 + ^FD (with optional ^BY for module width)
   */
  _parsePDF417(group, b7Token, byToken, fdToken, hasReverse) {
    // ^B7 params: orientation,rowHeight,securityLevel,columns,rows,truncate
    const parts = b7Token.params.split(',');
    const rowHeight = parseInt(parts[1]) || 4;
    const securityLevel = parseInt(parts[2]);
    const columns = parseInt(parts[3]) || 0;

    let moduleWidth = 2;
    if (byToken) {
      const byParts = byToken.params.split(',');
      if (byParts[0]) moduleWidth = parseInt(byParts[0]) || 2;
    }

    const rawData = fdToken ? fdToken.params : '';
    const match = rawData.match(/^%([^%]+)%$/);

    return {
      type: 'QRCODE',
      symbology: 'PDF417',
      x: group.x,
      y: group.y,
      previewData: match ? match[1] : rawData,
      placeholder: match ? match[1] : '',
      moduleWidth,
      rowHeight,
      securityLevel: Number.isNaN(securityLevel) ? 5 : securityLevel,
      columns,
      reverse: hasReverse
    };
  }

  /**
   * Parse QRCODE element from ^BQ + ^FD
   */
  _parseQRCode(group, bqToken, fdToken, hasReverse, state) {
    // ^BQ params: orientation,model,magnification
    const bqParts = bqToken.params.split(',');
    const model = parseInt(bqParts[1]) || 2;
    const magnification = parseInt(bqParts[2]) || 5;

    // ^FD format: {errorCorrection}A,{data} (e.g., "QA,https://example.com")
    let errorCorrection = 'Q';
    let rawData = '';

    if (fdToken) {
      const fdContent = fdToken.params;
      const ecMatch = fdContent.match(/^([HQML])A,(.*)$/s);
      if (ecMatch) {
        errorCorrection = ecMatch[1];
        rawData = ecMatch[2];
      } else {
        rawData = fdContent;
      }
    }

    // Detect placeholder in the data portion
    const placeholderMatch = rawData.match(/^%([^%]+)%$/);
    const previewData = placeholderMatch ? placeholderMatch[1] : rawData;
    const placeholder = placeholderMatch ? placeholderMatch[1] : '';

    return {
      type: 'QRCODE',
      symbology: 'QR',
      x: group.x,
      y: group.y,
      previewData,
      placeholder,
      model,
      magnification,
      errorCorrection,
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
   * Anything else (':Z64:', raw binary 'B', compressed 'C', or ASCII-hex
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
      const reason = payload.startsWith(':Z64:')
        ? ':Z64: (zlib-compressed base64) not supported'
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
      mediaTracking: 'Y',
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
