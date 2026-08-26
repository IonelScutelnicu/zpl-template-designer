// PDF417 (^B7) high-level encoder, written to match Zebra firmware rather than
// bwip-js. Both produce a valid symbol for the same data, but they choose different
// compaction modes, so the printed pattern differs — bwip-js runs an optimal
// shortest-path encoder while Zebra runs a greedy compaction pass.
// The canvas has to show what the printer prints, so we run Zebra's algorithm here
// and hand bwip-js the finished codewords (its `raw` mode), which then only builds
// the error correction and the module patterns.
//
// Every rule below was read off the Labelary API by decoding the rendered symbol
// back into codewords (see tests/e2e/pdf417-encoder.spec.ts for the captured cases).

// Text Compaction submodes. Each character is one 0–29 value; two values per codeword.
const MIXED = '0123456789&\r\t,:#-.$/+%*=^';
const PUNCT = ';<>@[\\]_`~!\r\t,:\n-.$/"|*()?{}\'';
const ALPHA = 0, LOWER = 1, MIX = 2, PUNC = 3;
// Search order for the submode a character (and its successor) can live in.
const SUBMODES = [ALPHA, LOWER, MIX, PUNC];

const LL = 27, AS = 27, ML = 28, AL = 28, PS = 29, PL = 25, PUNC_AL = 29, SPACE = 26;

// [from][to] latch sequences, and the single-character shifts that exist (-1 = none).
const LATCH = [
  [[], [LL], [ML], [ML, PL]],
  [[ML, AL], [], [ML], [ML, PL]],
  [[AL], [LL], [], [PL]],
  [[PUNC_AL], [PUNC_AL, LL], [PUNC_AL, ML], []],
];
const SHIFT = [
  [-1, -1, -1, PS],
  [AS, -1, -1, PS],
  [-1, -1, -1, PS],
  [-1, -1, -1, -1],
];

const TEXT_LATCH = 900, BYTE_LATCH = 901, NUMERIC_LATCH = 902, BYTE_SHIFT = 913, BYTE_LATCH_6 = 924;
// Zebra leaves Text Compaction for a digit run this long — the spec suggests 13, the
// firmware uses 8 (verified on Labelary: 7 digits stay in text, 8 latch to numeric).
const NUMERIC_RUN = 8;
const BYTE_NUMERIC_RUN = 4;
const BYTE_TEXT_RUN = 5;
const BYTE_TEXT_BEFORE_NUMERIC_RUN = 3;
// Numeric Compaction packs at most 44 digits per group, and Zebra re-latches on each.
const NUMERIC_CHUNK = 44;

const isUpper = (c) => c >= 'A' && c <= 'Z';
const isLower = (c) => c >= 'a' && c <= 'z';
const isDigit = (c) => c >= '0' && c <= '9';

/** The 0–29 value of `c` in `submode`, or -1 when that submode can't hold it. */
function valueIn(submode, c) {
  if (c === undefined) return -1;
  if (submode === PUNC) return PUNCT.indexOf(c);
  if (c === ' ') return SPACE;
  if (submode === ALPHA) return isUpper(c) ? c.charCodeAt(0) - 65 : -1;
  if (submode === LOWER) return isLower(c) ? c.charCodeAt(0) - 97 : -1;
  return MIXED.indexOf(c);
}

/** Text Compaction covers all printable ASCII plus CR/LF/TAB; anything else is a byte. */
const isText = (c) => SUBMODES.some((s) => valueIn(s, c) >= 0);

/**
 * Encode `text` the way ^B7 does and return the data codewords — no symbol length
 * descriptor and no padding, which bwip-js adds itself.
 */
export function pdf417Codewords(text) {
  // Byte Compaction carries single bytes, so a character the printer can't hold in
  // one is not encoded at all — it is dropped before the compaction runs (verified
  // on Labelary under ^CI28: "AB<CJK><e-acute>CD" encodes the é as a lone shifted
  // byte, as if the CJK character were never in the field). Characters up to U+00FF
  // are their own byte, including the ones our ^FH export writes as UTF-8 pairs.
  const str = [...text].filter((c) => c.codePointAt(0) <= 0xff).join('');
  const cws = [];
  const vals = [];          // pending Text Compaction values, packed on flush
  let submode = ALPHA;
  let mode = 'text';

  const flush = () => {
    if (vals.length % 2) vals.push(PS);  // odd tail is padded with the shift value
    for (let i = 0; i < vals.length; i += 2) cws.push(vals[i] * 30 + vals[i + 1]);
    vals.length = 0;
  };

  let i = 0;
  while (i < str.length) {
    const run = digitRun(str, i);
    // Four digits are already cheaper than bytes when leaving Byte Compaction;
    // Text Compaction needs eight before its extra numeric latch pays off.
    if (run >= (mode === 'byte' ? BYTE_NUMERIC_RUN : NUMERIC_RUN)) {
      if (mode === 'text') flush();
      encodeNumeric(str.substr(i, run), cws);
      mode = 'numeric';
      i += run;
      continue;
    }
    const c = str[i];
    if (isText(c) && (mode === 'text' || mode === 'shift' || textRun(str, i) >= BYTE_TEXT_RUN
      || textBeforeNumeric(str, i) || textEndsMessage(str, i))) {
      if (mode !== 'text') {
        cws.push(TEXT_LATCH);
        mode = 'text';
        submode = ALPHA;
      }
      // The lookahead only sees the rest of this text segment: a character that
      // starts a numeric run is about to leave Text Compaction, so it can't justify
      // a submode latch ("…/track/9988776655" shifts for the '/', it doesn't latch).
      const next = digitRun(str, i + 1) >= NUMERIC_RUN ? undefined : str[i + 1];
      submode = encodeChar(c, next, vals, submode);
      i++;
      continue;
    }
    if (mode === 'text') flush();
    const previousMode = mode;
    let bytes = byteRun(str, i);
    if (previousMode === 'text' && !isText(c)) {
      const candidate = str.slice(i, i + bytes);
      const binaryCount = [...candidate].filter(char => !isText(char)).length;
      if (binaryCount === 1) bytes = 1;
    }
    const j = i + bytes;
    encodeBytes(str.slice(i, j), cws, previousMode);
    mode = previousMode === 'text' && bytes === 1 ? 'shift' : 'byte';
    i = j;
  }
  if (mode === 'text') flush();
  return cws;
}

/** The same codewords as a bwip-js `raw` text string (`^NNN` per codeword). */
export function pdf417RawText(str) {
  return pdf417Codewords(str).map((cw) => `^${String(cw).padStart(3, '0')}`).join('');
}

function digitRun(s, i) {
  let j = i;
  while (j < s.length && isDigit(s[j])) j++;
  return j - i;
}

function textRun(s, i) {
  let j = i;
  while (j < s.length && isText(s[j]) && digitRun(s, j) < BYTE_NUMERIC_RUN) j++;
  return j - i;
}

function textBeforeNumeric(s, i) {
  const run = textRun(s, i);
  return run > 0 && digitRun(s, i + run) >= BYTE_NUMERIC_RUN;
}

function textEndsMessage(s, i) {
  const run = textRun(s, i);
  return run > 0 && i + run === s.length;
}

function byteRun(s, i) {
  let j = i;
  while (j < s.length) {
    if (digitRun(s, j) >= BYTE_NUMERIC_RUN) break;
    const text = textRun(s, j);
    if (textEndsMessage(s, j)) break;
    if (textBeforeNumeric(s, j) && text >= BYTE_TEXT_BEFORE_NUMERIC_RUN) break;
    if (text >= BYTE_TEXT_RUN) break;
    j += Math.max(text, 1);
  }
  return Math.max(j - i, 1);
}

/**
 * Append one character's Text Compaction values and return the resulting submode.
 * Zebra only reconsiders the submode when the current one can't hold the character,
 * and then looks exactly one character ahead: it latches to a submode holding both,
 * and otherwise shifts for this character alone (verified on Labelary — "AB;;CD"
 * latches to Punctuation while "AB;CD" shifts, and "abcDEF" latches to Alpha while
 * "abcD" shifts).
 */
function encodeChar(c, next, vals, submode) {
  const own = valueIn(submode, c);
  if (own >= 0) { vals.push(own); return submode; }

  const pair = SUBMODES.find((t) => valueIn(t, c) >= 0 && valueIn(t, next) >= 0);
  if (pair !== undefined) { vals.push(...LATCH[submode][pair], valueIn(pair, c)); return pair; }

  const shift = SUBMODES.find((t) => SHIFT[submode][t] >= 0 && valueIn(t, c) >= 0);
  if (shift !== undefined) { vals.push(SHIFT[submode][shift], valueIn(shift, c)); return submode; }

  const latch = SUBMODES.find((t) => valueIn(t, c) >= 0);
  vals.push(...LATCH[submode][latch], valueIn(latch, c));
  return latch;
}

/** Numeric Compaction: each ≤44-digit group is base-900 of "1" + the digits. */
function encodeNumeric(digits, cws) {
  for (let i = 0; i < digits.length; i += NUMERIC_CHUNK) {
    cws.push(NUMERIC_LATCH);
    let n = BigInt('1' + digits.substr(i, NUMERIC_CHUNK));
    const group = [];
    while (n > 0n) { group.unshift(Number(n % 900n)); n /= 900n; }
    cws.push(...group);
  }
}

/** Byte Compaction: 6 bytes to 5 codewords, with any tail bytes sent one per codeword. */
function encodeBytes(str, cws, mode) {
  const bytes = [...str].map((c) => c.codePointAt(0));
  if (bytes.length === 1 && mode === 'text') { cws.push(BYTE_SHIFT, bytes[0]); return; }
  cws.push(bytes.length % 6 === 0 ? BYTE_LATCH_6 : BYTE_LATCH);
  let i = 0;
  for (; i + 6 <= bytes.length; i += 6) {
    let n = 0n;
    for (let k = 0; k < 6; k++) n = n * 256n + BigInt(bytes[i + k]);
    const group = [];
    for (let k = 0; k < 5; k++) { group.unshift(Number(n % 900n)); n /= 900n; }
    cws.push(...group);
  }
  for (; i < bytes.length; i++) cws.push(bytes[i]);
}
