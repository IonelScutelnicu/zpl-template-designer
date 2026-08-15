// ZPL ^BC invocation codes `>1`…`>;` map to values 95…105. Their meaning
// depends on the active subset, so encoding requires a state machine:
//
//   value   Subset A    Subset B    Subset C
//   95      US          DEL         pair "95"
//   96      FNC3        FNC3        pair "96"
//   97      FNC2        FNC2        pair "97"
//   98      Shift       Shift       pair "98"
//   99      Code C      Code C      pair "99"
//   100     Code B      FNC4        Code B
//   101     FNC4        Code A      Code A
//   102     FNC1        FNC1        FNC1
//   103/104/105         Start A / Start B / Start C
//
// bwip-js receives raw codewords to bypass its auto-switching; Zebra switches
// only on invocation codes. Labelary lacks Subset A, so the canvas deliberately
// differs from it for `>9`/`>7` Subset A fields.

const START_VALUE = { A: 103, B: 104, C: 105 };
const LATCH_VALUE = { A: 101, B: 100, C: 99 };
const SHIFT_VALUE = 98;
const FIRST_INVOCATION_VALUE = 95;
// '1'…'9', ':', ';' — consecutive in ASCII, which is what makes the rule work.
const INVOCATION_CHARS = '123456789:;';

/** Target subset, or null when the value is data or already selects `subset`. */
function latchTarget(value, subset) {
  if (value === START_VALUE.A) return subset === 'A' ? null : 'A';
  if (value === START_VALUE.B) return subset === 'B' ? null : 'B';
  if (value === START_VALUE.C) return subset === 'C' ? null : 'C';
  if (value === LATCH_VALUE.C) return subset === 'C' ? null : 'C';
  if (value === LATCH_VALUE.B) return subset === 'B' ? null : 'B';
  if (value === LATCH_VALUE.A) return subset === 'A' ? null : 'A';
  return null;
}

/** Drop redundant starts and Code C self-latches; A/B self-codes are FNC4 data. */
function isSelfLatch(value, subset) {
  return (value === LATCH_VALUE.C && subset === 'C') || value === START_VALUE[subset];
}

/** Subset A/B codeword, or -1 when Zebra would drop the character. */
function charValue(char, subset) {
  const code = char.charCodeAt(0);
  if (subset === 'A') {
    if (code >= 32 && code <= 95) return code - 32;
    if (code < 32) return code + 64;
    return -1;
  }
  if (code >= 32 && code <= 127) return code - 32;
  return -1;
}

/**
 * Encode ^BC field data into Code 128 codewords.
 *
 * @param {string} data - ^FD content, invocation codes included, start code already removed
 * @param {string} startSubset - 'A' | 'B' | 'C' (the ^FD start code, default B)
 * @returns {{ codewords: number[], text: string }} raw codewords without check/stop,
 *   plus human-readable text
 */
export function encodeCode128(data, startSubset = 'B') {
  let subset = START_VALUE[startSubset] ? startSubset : 'B';
  const codewords = [START_VALUE[subset]];
  let text = '';
  const source = data || '';

  for (let i = 0; i < source.length;) {
    const char = source[i];

    if (char === '>' && i + 1 < source.length) {
      const next = source[i + 1];
      // `>>` is the escape for a literal '>', not an invocation.
      if (next !== '>') {
        const index = INVOCATION_CHARS.indexOf(next);
        if (index !== -1) {
          const value = FIRST_INVOCATION_VALUE + index;
          const target = latchTarget(value, subset);
          if (target) {
            codewords.push(value);
            subset = target;
          } else if (value === SHIFT_VALUE && subset !== 'C') {
            // Shift borrows the opposite subset for exactly one character.
            const shifted = source[i + 2];
            const shiftedValue = shifted === undefined
              ? -1
              : charValue(shifted, subset === 'A' ? 'B' : 'A');
            if (shiftedValue >= 0) {
              codewords.push(SHIFT_VALUE, shiftedValue);
              text += shifted;
              i += 3;
              continue;
            }
          } else if (!isSelfLatch(value, subset)) {
            codewords.push(value);
            // In C, values 95–98 print as digit pairs; 102 is a silent FNC1.
            if (subset === 'C' && value >= FIRST_INVOCATION_VALUE && value <= 98) {
              text += String(value);
            }
          }
          i += 2;
          continue;
        }
      }
    }

    if (subset === 'C') {
      // Subset C carries digits two at a time; anything else, including a lone
      // trailing digit, is not encodable and is dropped.
      const pair = source.slice(i, i + 2);
      if (/^\d\d$/u.test(pair)) {
        codewords.push(Number(pair));
        text += pair;
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }

    // `>>` collapses to the single '>' it escapes, so it consumes two characters
    // but contributes one.
    const escaped = char === '>' && source[i + 1] === '>';
    const value = charValue(char, subset);
    if (value >= 0) {
      codewords.push(value);
      text += char;
    }
    i += escaped ? 2 : 1;
  }

  return { codewords, text };
}

const FNC1_VALUE = 102;

/** Split automatic-mode data, where only `>8` invokes FNC1 and `>>` stays literal. */
function readAutoItems(source) {
  const items = [];
  for (let i = 0; i < source.length;) {
    if (source[i] === '>' && source[i + 1] === '8') {
      items.push({ fnc1: true });
      i += 2;
      continue;
    }
    items.push({ char: source[i] });
    i += 1;
  }
  return items;
}

/** Every character an automatic mode would print, FNC1 invocations removed. */
export function code128AutoText(data) {
  return readAutoItems(data || '').filter(item => item.char !== undefined).map(item => item.char).join('');
}

/** Normalize UCC Case data to 19 digits and append its mod-10 check digit. */
export function uccCaseDigits(data) {
  const digits = String(data ?? '').replace(/\D/gu, '');
  const body = digits.length >= 19 ? digits.slice(0, 19) : digits.padStart(19, '0');
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    // Weight 3 on the rightmost digit, then alternating.
    sum += Number(body[i]) * ((body.length - i) % 2 === 1 ? 3 : 1);
  }
  const check = String((10 - (sum % 10)) % 10);
  return { bars: `${body}${check}`, text: `${digits}${check}` };
}

function isDigitItem(item) {
  return Boolean(item) && item.char !== undefined && item.char >= '0' && item.char <= '9';
}

/** Length of the digit run starting at `from`. */
function digitRunLength(items, from) {
  let n = 0;
  while (isDigitItem(items[from + n])) n += 1;
  return n;
}

/** A or B, chosen by the first character that needs one: control characters need A. */
function abFor(items, from) {
  for (let i = from; i < items.length; i++) {
    const { char } = items[i];
    if (char === undefined) continue;
    if (char.charCodeAt(0) < 32) return 'A';
    if (charValue(char, 'B') >= 0) return 'B';
  }
  return 'B';
}

/**
 * Encode ^BC automatic modes. Subset C takes runs of 4+ digits at an edge or
 * 6+ internally; odd runs spend their first digit in A/B (ISO/IEC 15417 Annex B).
 *
 * @param {string} data - ^FD content (only `>8`, the FNC1 invocation, is read)
 * @param {boolean} leadingFnc1 - prepend FNC1, which is what makes m=D/U a GS1-128
 * @returns {{ codewords: number[], text: string }} same shape as encodeCode128
 */
export function encodeCode128Auto(data, leadingFnc1 = false) {
  const items = readAutoItems(data || '');
  const leadingDigits = digitRunLength(items, 0);
  // Start C for exactly two digits or a leading run of 4+; three starts in A/B.
  let subset = (leadingDigits >= 4 || (leadingDigits === 2 && items.length === 2))
    ? 'C'
    : abFor(items, 0);

  const codewords = [START_VALUE[subset]];
  if (leadingFnc1) codewords.push(FNC1_VALUE);
  let text = '';

  for (let i = 0; i < items.length;) {
    const item = items[i];
    if (item.fnc1) {
      codewords.push(FNC1_VALUE);
      i += 1;
      continue;
    }

    if (subset === 'C') {
      if (isDigitItem(items[i]) && isDigitItem(items[i + 1])) {
        const pair = `${items[i].char}${items[i + 1].char}`;
        codewords.push(Number(pair));
        text += pair;
        i += 2;
        continue;
      }
      const target = abFor(items, i);
      codewords.push(LATCH_VALUE[target]);
      subset = target;
      continue;
    }

    const run = digitRunLength(items, i);
    const worthC = run >= 6 || (run >= 4 && i + run === items.length);
    if (worthC) {
      if (run % 2 === 1) {
        codewords.push(charValue(item.char, subset));
        text += item.char;
        i += 1;
      }
      codewords.push(LATCH_VALUE.C);
      subset = 'C';
      continue;
    }

    const value = charValue(item.char, subset);
    if (value >= 0) {
      codewords.push(value);
      text += item.char;
      i += 1;
      continue;
    }
    // The other of A/B carries what this one cannot (lowercase in A, controls in B).
    const other = subset === 'A' ? 'B' : 'A';
    if (charValue(item.char, other) >= 0) {
      codewords.push(LATCH_VALUE[other]);
      subset = other;
      continue;
    }
    i += 1; // Encodable in neither subset — dropped, as the printer drops it.
  }

  return { codewords, text };
}

/** The codeword list as bwip-js `raw` text: one `^NNN` token per codeword. */
export function code128RawText(codewords) {
  return codewords.map(value => `^${String(value).padStart(3, '0')}`).join('');
}
