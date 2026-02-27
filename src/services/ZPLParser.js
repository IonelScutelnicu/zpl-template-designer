// ZPL Parser Service
// Parses ZPL template strings into app element objects and label settings

/**
 * Known ZPL commands that the parser handles (won't generate warnings)
 */
const KNOWN_COMMANDS = new Set([
  'XA', 'XZ', 'PW', 'PR', 'PO', 'PM', 'SD', 'LH', 'LT', 'CI', 'MT',
  'CF', 'CW', 'PQ', 'FO', 'A', 'FB', 'FD', 'FS', 'FR', 'BC', 'BY',
  'BQ', 'GB', 'GE'
]);

/**
 * Header commands that configure label settings (not element-specific)
 */
const HEADER_COMMANDS = new Set([
  'XA', 'XZ', 'PW', 'PR', 'PO', 'PM', 'SD', 'LH', 'LT', 'CI', 'MT',
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
      barcodeDefaults: { width: 2, ratio: 2.0 },
      defaultFont: { id: '0', height: 20, width: 20 },
      customFonts: []
    };

    for (const token of tokens) {
      // Check for unknown commands
      if (!KNOWN_COMMANDS.has(token.command)) {
        state.warnings.push({
          command: `${token.prefix}${token.command}`,
          message: `Unsupported command "${token.prefix}${token.command}" was ignored`
        });
        continue;
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
            state.labelSettings.defaultFontHeight = h;
            state.defaultFont.height = h;
          }
        }
        if (parts[2]) {
          const w = parseInt(parts[2]);
          if (w > 0) {
            state.labelSettings.defaultFontWidth = w;
            state.defaultFont.width = w;
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
    if (hasCommand('GE')) {
      return this._parseCircle(group, getCommand('GE'));
    }

    if (hasCommand('GB')) {
      return this._parseGraphicBox(group, getCommand('GB'));
    }

    if (hasCommand('BQ')) {
      return this._parseQRCode(group, getCommand('BQ'), getCommand('FD'), state);
    }

    if (hasCommand('BC')) {
      return this._parseBarcode(group, getCommand('BC'), getCommand('BY'), getCommand('FD'), state);
    }

    if (hasCommand('A') && hasCommand('FB')) {
      return this._parseTextBlock(group, getCommand('A'), getCommand('FB'), getCommand('FD'), hasCommand('FR'), state);
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
    const orientation = params.charAt(1) || 'N';
    const rest = params.substring(2);
    const parts = rest.split(',').filter(p => p !== '');
    const height = parseInt(parts[0]) || 0;
    const width = parseInt(parts[1]) || 0;

    return { fontId, orientation, height, width };
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
      fontId: font.fontId === state.defaultFont.id ? '' : font.fontId,
      fontSize: font.height === state.defaultFont.height ? 0 : font.height,
      fontWidth: font.width === state.defaultFont.width ? 0 : font.width,
      orientation: font.orientation,
      reverse: hasReverse
    };
  }

  /**
   * Parse TEXTBLOCK element from ^A + ^FB + ^FD
   */
  _parseTextBlock(group, aToken, fbToken, fdToken, hasReverse, state) {
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
      type: 'TEXTBLOCK',
      x: group.x,
      y: group.y,
      previewText: text,
      placeholder,
      fontId: font.fontId === state.defaultFont.id ? '' : font.fontId,
      fontSize: font.height === state.defaultFont.height ? 0 : font.height,
      fontWidth: font.width === state.defaultFont.width ? 0 : font.width,
      blockWidth,
      maxLines,
      lineSpacing,
      justification,
      hangingIndent,
      reverse: hasReverse
    };
  }

  /**
   * Parse BARCODE element from ^BC + ^FD (with optional ^BY)
   */
  _parseBarcode(group, bcToken, byToken, fdToken, state) {
    // ^BC params: orientation,height,interpretation
    const bcParts = bcToken.params.split(',');
    const height = parseInt(bcParts[1]) || 50;
    const showText = (bcParts[2] || 'Y').trim() !== 'N';

    // Use ^BY from this group if present, otherwise from state
    let width = state.barcodeDefaults.width;
    let ratio = state.barcodeDefaults.ratio;
    if (byToken) {
      const byParts = byToken.params.split(',');
      if (byParts[0]) width = parseInt(byParts[0]) || width;
      if (byParts[1]) ratio = parseFloat(byParts[1]) || ratio;
    }

    const { text, placeholder } = this._parseFieldData(fdToken);

    return {
      type: 'BARCODE',
      x: group.x,
      y: group.y,
      previewData: text,
      placeholder,
      height,
      width,
      ratio,
      showText
    };
  }

  /**
   * Parse QRCODE element from ^BQ + ^FD
   */
  _parseQRCode(group, bqToken, fdToken, state) {
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
      x: group.x,
      y: group.y,
      previewData,
      placeholder,
      model,
      magnification,
      errorCorrection
    };
  }

  /**
   * Parse BOX or LINE from ^GB command
   */
  _parseGraphicBox(group, gbToken) {
    const parts = gbToken.params.split(',');
    const gbWidth = parseInt(parts[0]) || 0;
    const gbHeight = parseInt(parts[1]) || 0;
    const gbThickness = parseInt(parts[2]) || 0;
    const color = (parts[3] || 'B').trim();
    const rounding = parseInt(parts[4]) || 0;

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
        rounding
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
      rounding
    };
  }

  /**
   * Parse CIRCLE from ^GE command
   */
  _parseCircle(group, geToken) {
    const parts = geToken.params.split(',');
    return {
      type: 'CIRCLE',
      x: group.x,
      y: group.y,
      width: parseInt(parts[0]) || 80,
      height: parseInt(parts[1]) || 80,
      thickness: parseInt(parts[2]) || 3,
      color: (parts[3] || 'B').trim()
    };
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
      mediaDarkness: 25,
      printSpeed: 4,
      slewSpeed: 4,
      backfeedSpeed: 4,
      fontId: '0',
      customFonts: [],
      defaultFontHeight: 20,
      defaultFontWidth: 20,
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
