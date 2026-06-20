const DEFAULT_HEX_INDICATOR = '_';
const HEX_RE = /^[0-9A-Fa-f]{2}$/;

function byteToHex(byte) {
  return byte.toString(16).toUpperCase().padStart(2, '0');
}

function flushBytes(bytes, parts, decoder) {
  if (bytes.length === 0) return;
  parts.push(decoder.decode(new Uint8Array(bytes)));
  bytes.length = 0;
}

export function getFieldHexIndicator(fhParams = '') {
  return fhParams ? fhParams.charAt(0) : DEFAULT_HEX_INDICATOR;
}

export function encodeFieldData(value, indicator = DEFAULT_HEX_INDICATOR) {
  const text = String(value ?? '');
  const marker = indicator || DEFAULT_HEX_INDICATOR;
  const encoder = new TextEncoder();
  let encoded = '';
  let escaped = false;

  for (const char of text) {
    const codePoint = char.codePointAt(0);
    const mustEscape = char === marker || char === '^' || char === '~' || codePoint < 0x20 || codePoint > 0x7E;

    if (!mustEscape) {
      encoded += char;
      continue;
    }

    escaped = true;
    for (const byte of encoder.encode(char)) {
      encoded += `${marker}${byteToHex(byte)}`;
    }
  }

  return { data: encoded, escaped, indicator: marker };
}

export function decodeFieldData(value, indicator = DEFAULT_HEX_INDICATOR) {
  const text = String(value ?? '');
  const marker = indicator || DEFAULT_HEX_INDICATOR;
  const decoder = new TextDecoder('utf-8');
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

    flushBytes(bytes, parts, decoder);
    parts.push(text[i]);
  }

  flushBytes(bytes, parts, decoder);
  return parts.join('');
}

export function renderFieldDataCommand(value, indicator = DEFAULT_HEX_INDICATOR, forceHex = false) {
  const encoded = encodeFieldData(value, indicator);
  const fh = encoded.escaped || forceHex
    ? `^FH${encoded.indicator === DEFAULT_HEX_INDICATOR ? '' : encoded.indicator}`
    : '';
  return `${fh}^FD${encoded.data}`;
}
