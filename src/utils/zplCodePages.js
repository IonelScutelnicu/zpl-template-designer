/**
 * Character sets selected by ^CI, for decoding ^FH hex escapes on import.
 *
 * Mappings verified against Labelary: anything it does not implement (^CI0-26,
 * ^CI37+, and the ^CI29/30 UTF-16 sets, which it truncates at the first NUL)
 * falls back to code page 850, exactly as an unset ^CI does.
 */

/** Sentinel encoding label: the Encoding Standard has no cp850, so TextDecoder cannot supply it. */
const CP850 = 'cp850';

/** Bytes 0x80-0xFF of code page 850; below 0x80 it is ASCII. */
const CP850_HIGH = [
  'ÇüéâäàåçêëèïîìÄÅ',
  'ÉæÆôöòûùÿÖÜø£Ø×ƒ',
  'áíóúñÑªº¿®¬½¼¡«»',
  '░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐',
  '└┴┬├─┼ãÃ╚╔╩╦╠═╬¤',
  'ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀',
  'ÓßÔÒõÕµþÞÚÛÙýÝ¯´',
  '­±‗¾¶§÷¸°¨·¹³²■ '
].join('');

const CI_ENCODINGS = new Map([
  [27, 'windows-1252'],
  [28, 'utf-8'],
  [31, 'windows-1250'],
  [32, 'windows-1250'],
  [33, 'windows-1251'],
  [34, 'windows-1253'],
  [35, 'windows-1254'],
  [36, 'windows-1255']
]);

/** A label with no ^CI prints code page 850, so that is where parsing starts. */
export const DEFAULT_FIELD_ENCODING = CP850;

export function encodingForCharacterSet(params) {
  return CI_ENCODINGS.get(parseInt(params, 10)) || CP850;
}

export function decodeBytes(bytes, encoding = DEFAULT_FIELD_ENCODING) {
  if (encoding !== CP850) return new TextDecoder(encoding).decode(new Uint8Array(bytes));
  let text = '';
  for (const byte of bytes) {
    text += byte < 0x80 ? String.fromCharCode(byte) : CP850_HIGH[byte - 0x80];
  }
  return text;
}
