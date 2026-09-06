import { PLACEHOLDER_SPLIT_RE, WHOLE_PLACEHOLDER_RE } from './placeholders.js';
import { decodeBytes } from './zplCodePages.js';

const DEFAULT_HEX_INDICATOR = '_';
const HEX_RE = /^[0-9A-Fa-f]{2}$/;
const NEEDS_HEX_RE = /[\^~]|[^\x20-\x7E]/u;

// Each ZPL text command breaks lines its own way: ^FB uses the
// \& escape and discards raw line feeds, ^TB uses a real line feed (so _0A via
// ^FH) and prints \& literally, and ^A supports neither.
export const FB_LINE_BREAK = '\\&';
const LINE_BREAK_RE = /\r\n?|\n/g;

export function normalizeLineBreaks(value) {
  return String(value ?? '').replace(LINE_BREAK_RE, '\n');
}

/** ^FB: line breaks are the \& escape. Both chars are printable, so they survive encodeFieldData. */
export function encodeFieldBlockBreaks(value) {
  return String(value ?? '').replace(LINE_BREAK_RE, FB_LINE_BREAK);
}

export function decodeFieldBlockBreaks(value) {
  return String(value ?? '').split(FB_LINE_BREAK).join('\n');
}

/** ^A: a line feed truncates the field at print time, so collapse each break to a space. */
export function collapseLineBreaks(value) {
  return String(value ?? '').replace(LINE_BREAK_RE, ' ');
}

function byteToHex(byte) {
  return byte.toString(16).toUpperCase().padStart(2, '0');
}

function flushBytes(bytes, parts, encoding) {
  if (bytes.length === 0) return;
  parts.push(decodeBytes(bytes, encoding));
  bytes.length = 0;
}

export function getFieldHexIndicator(fhParams = '') {
  return fhParams ? fhParams.charAt(0) : DEFAULT_HEX_INDICATOR;
}

export function encodeFieldData(value, indicator = DEFAULT_HEX_INDICATOR, forceHex = false) {
  const text = String(value ?? '');
  const marker = indicator || DEFAULT_HEX_INDICATOR;
  const segments = text.split(PLACEHOLDER_SPLIT_RE);
  // The indicator is literal until ^FH is enabled for the field. Once enabled,
  // escape every literal indicator so sequences such as _41 stay literal data.
  const hexEnabled = forceHex || NEEDS_HEX_RE.test(text);
  const encoder = new TextEncoder();
  let encoded = '';
  let escaped = false;

  // Placeholders pass through untouched so the host's templating system
  // still sees %name%; only the literal text around them is hex-escaped.
  for (const segment of segments) {
    if (!segment) continue;
    if (WHOLE_PLACEHOLDER_RE.test(segment)) {
      encoded += segment;
      continue;
    }
    for (const char of segment === '%%' ? '%' : segment) {
      const mustEscape = NEEDS_HEX_RE.test(char) || (hexEnabled && char === marker);

      if (!mustEscape) {
        encoded += char;
        continue;
      }

      escaped = true;
      for (const byte of encoder.encode(char)) {
        encoded += `${marker}${byteToHex(byte)}`;
      }
    }
  }

  return { data: encoded, escaped, indicator: marker };
}

/**
 * `encoding` is the character set the ^FH bytes are in — the one ^CI selected on
 * import. It defaults to UTF-8 because that is what encodeFieldData emits for
 * escaped bytes. Only decode fields whose ^FH indicator is enabled.
 */
export function decodeFieldData(value, indicator = DEFAULT_HEX_INDICATOR, encoding = 'utf-8') {
  const text = String(value ?? '');
  const marker = indicator || DEFAULT_HEX_INDICATOR;
  const parts = [];
  const bytes = [];

  for (let i = 0; i < text.length; i++) {
    if (text[i] === marker) {
      const hex = text.slice(i + 1, i + 3);
      if (HEX_RE.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 2;
        continue;
      }
    }

    flushBytes(bytes, parts, encoding);
    parts.push(text[i]);
  }

  flushBytes(bytes, parts, encoding);
  return parts.join('');
}

/**
 * The field-data command plus its payload. `command` is the element's
 * fieldDataCommand: ^FV for a field the printer clears after printing, ^FD —
 * the default — for one it retains. The two are interchangeable on a single
 * label and differ only across prints with ^MC map retention, so an imported
 * ^FV has to be carried back out rather than inferred.
 */
export function renderFieldDataCommand(value, indicator = DEFAULT_HEX_INDICATOR, forceHex = false, command = 'FD', options = {}) {
  const encoded = encodeFieldData(value, indicator, forceHex);
  const fh = encoded.escaped || forceHex
    ? `^FH${encoded.indicator === DEFAULT_HEX_INDICATOR ? '' : encoded.indicator}`
    : '';
  if (command === 'SN') {
    const parsedIncrement = parseInt(options.increment);
    const increment = Number.isFinite(parsedIncrement) ? parsedIncrement : 1;
    const preserveLeadingZeros = options.preserveLeadingZeros ? 'Y' : 'N';
    return `${fh}^SN${encoded.data},${increment},${preserveLeadingZeros}`;
  }
  return `${fh}^${command === 'FV' ? 'FV' : 'FD'}${encoded.data}`;
}
