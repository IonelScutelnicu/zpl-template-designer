// Synchronous zlib (RFC 1950/1951) inflate, used to decode ^GF :Z64: graphic
// payloads. The parser is synchronous, so the browser's DecompressionStream
// (async-only) can't be used here. This is a compact port of the classic
// "tinf" inflate algorithm: stored, fixed-Huffman, and dynamic-Huffman blocks.

/* Extra bits and base values for length codes 257..285. */
const LENGTH_BITS = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2,
  3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];
const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31,
  35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258,
];

/* Extra bits and base values for distance codes 0..29. */
const DIST_BITS = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
  7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];
const DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193,
  257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577,
];

/* Order in which code-length code lengths are stored (RFC 1951 §3.2.7). */
const CLC_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

/**
 * Build a canonical Huffman decoding table from a code-length array.
 * @param {Uint8Array|number[]} lengths
 * @returns {{counts: Uint16Array, symbols: Uint16Array}}
 */
function buildTree(lengths) {
  const counts = new Uint16Array(16);
  for (let i = 0; i < lengths.length; i++) counts[lengths[i]]++;
  counts[0] = 0;

  const offs = new Uint16Array(16);
  for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + counts[i - 1];

  const symbols = new Uint16Array(lengths.length);
  for (let i = 0; i < lengths.length; i++) {
    if (lengths[i]) symbols[offs[lengths[i]]++] = i;
  }
  return { counts, symbols };
}

/* Fixed-Huffman trees (RFC 1951 §3.2.6), built once on first use. */
let fixedLitTree = null;
let fixedDistTree = null;
function buildFixedTrees() {
  const lit = new Uint8Array(288);
  lit.fill(8, 0, 144);
  lit.fill(9, 144, 256);
  lit.fill(7, 256, 280);
  lit.fill(8, 280, 288);
  fixedLitTree = buildTree(lit);
  fixedDistTree = buildTree(new Uint8Array(30).fill(5));
}

class BitReader {
  constructor(data, pos) {
    this.data = data;
    this.pos = pos;
    this.bitBuf = 0;
    this.bitCnt = 0;
  }

  /** Read one bit, LSB-first. Throws past end of input. */
  bit() {
    if (this.bitCnt === 0) {
      if (this.pos >= this.data.length) throw new Error('unexpected end of stream');
      this.bitBuf = this.data[this.pos++];
      this.bitCnt = 8;
    }
    const b = this.bitBuf & 1;
    this.bitBuf >>>= 1;
    this.bitCnt--;
    return b;
  }

  /** Read `n` bits (n <= 15), LSB-first. */
  bits(n) {
    let v = 0;
    for (let i = 0; i < n; i++) v |= this.bit() << i;
    return v;
  }

  /** Decode one Huffman symbol. */
  symbol(tree) {
    let sum = 0;
    let cur = 0;
    let len = 0;
    do {
      cur = 2 * cur + this.bit();
      len++;
      if (len > 15) throw new Error('invalid Huffman code');
      sum += tree.counts[len];
      cur -= tree.counts[len];
    } while (cur >= 0);
    return tree.symbols[sum + cur];
  }
}

/** Growable output buffer. */
class OutBuf {
  constructor() {
    this.buf = new Uint8Array(4096);
    this.len = 0;
  }

  ensure(extra) {
    if (this.len + extra <= this.buf.length) return;
    let cap = this.buf.length * 2;
    while (cap < this.len + extra) cap *= 2;
    const next = new Uint8Array(cap);
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }

  push(byte) {
    this.ensure(1);
    this.buf[this.len++] = byte;
  }

  /** LZ77 back-reference copy; ranges may overlap, so copy byte-by-byte. */
  copy(dist, length) {
    if (dist > this.len) throw new Error('distance too far back');
    this.ensure(length);
    let from = this.len - dist;
    for (let i = 0; i < length; i++) this.buf[this.len++] = this.buf[from++];
  }

  result() {
    return this.buf.slice(0, this.len);
  }
}

/** Read the dynamic-block code-length tables (RFC 1951 §3.2.7). */
function decodeDynamicTrees(r) {
  const hlit = r.bits(5) + 257;
  const hdist = r.bits(5) + 1;
  const hclen = r.bits(4) + 4;

  const clcLengths = new Uint8Array(19);
  for (let i = 0; i < hclen; i++) clcLengths[CLC_ORDER[i]] = r.bits(3);
  const clcTree = buildTree(clcLengths);

  const lengths = new Uint8Array(hlit + hdist);
  let i = 0;
  while (i < hlit + hdist) {
    const sym = r.symbol(clcTree);
    if (sym < 16) {
      lengths[i++] = sym;
    } else if (sym === 16) {
      if (i === 0) throw new Error('repeat with no previous length');
      const prev = lengths[i - 1];
      let n = r.bits(2) + 3;
      while (n-- > 0) lengths[i++] = prev;
    } else if (sym === 17) {
      let n = r.bits(3) + 3;
      while (n-- > 0) lengths[i++] = 0;
    } else {
      let n = r.bits(7) + 11;
      while (n-- > 0) lengths[i++] = 0;
    }
    if (i > hlit + hdist) throw new Error('code lengths overflow');
  }

  return {
    litTree: buildTree(lengths.subarray(0, hlit)),
    distTree: buildTree(lengths.subarray(hlit)),
  };
}

function inflateBlockData(r, out, litTree, distTree) {
  for (;;) {
    const sym = r.symbol(litTree);
    if (sym < 256) {
      out.push(sym);
    } else if (sym === 256) {
      return;
    } else {
      const li = sym - 257;
      if (li >= LENGTH_BASE.length) throw new Error('invalid length code');
      const length = LENGTH_BASE[li] + r.bits(LENGTH_BITS[li]);
      const di = r.symbol(distTree);
      if (di >= DIST_BASE.length) throw new Error('invalid distance code');
      const dist = DIST_BASE[di] + r.bits(DIST_BITS[di]);
      out.copy(dist, length);
    }
  }
}

function inflateStoredBlock(r, out) {
  // Stored blocks start on a byte boundary.
  r.bitBuf = 0;
  r.bitCnt = 0;
  if (r.pos + 4 > r.data.length) throw new Error('truncated stored block');
  const len = r.data[r.pos] | (r.data[r.pos + 1] << 8);
  const nlen = r.data[r.pos + 2] | (r.data[r.pos + 3] << 8);
  if (len !== (~nlen & 0xffff)) throw new Error('stored block length mismatch');
  r.pos += 4;
  if (r.pos + len > r.data.length) throw new Error('truncated stored block');
  out.ensure(len);
  out.buf.set(r.data.subarray(r.pos, r.pos + len), out.len);
  out.len += len;
  r.pos += len;
}

/** Inflate all DEFLATE blocks from the reader's position. */
function inflateBlocks(r) {
  const out = new OutBuf();
  let final;
  do {
    final = r.bit();
    const type = r.bits(2);
    if (type === 0) {
      inflateStoredBlock(r, out);
    } else if (type === 1) {
      if (!fixedLitTree) buildFixedTrees();
      inflateBlockData(r, out, fixedLitTree, fixedDistTree);
    } else if (type === 2) {
      const { litTree, distTree } = decodeDynamicTrees(r);
      inflateBlockData(r, out, litTree, distTree);
    } else {
      throw new Error('invalid block type');
    }
  } while (!final);
  return out.result();
}

/**
 * Inflate a raw DEFLATE stream (RFC 1951).
 * @param {Uint8Array} data
 * @param {number} [start] byte offset to start at
 * @returns {Uint8Array}
 */
export function inflateRaw(data, start = 0) {
  return inflateBlocks(new BitReader(data, start));
}

/**
 * Inflate a zlib stream (RFC 1950: 2-byte header + DEFLATE + Adler-32).
 * Returns null on any structural error (bad header, preset dictionary,
 * corrupt DEFLATE data, or Adler-32 mismatch).
 * @param {Uint8Array} data
 * @returns {Uint8Array|null}
 */
export function inflateZlib(data) {
  if (!(data instanceof Uint8Array) || data.length < 6) return null;
  const cmf = data[0];
  const flg = data[1];
  if ((cmf & 0x0f) !== 8) return null; // only DEFLATE
  if (((cmf << 8) | flg) % 31 !== 0) return null; // header checksum
  if (flg & 0x20) return null; // preset dictionary unsupported

  const r = new BitReader(data, 2);
  let out;
  try {
    out = inflateBlocks(r);
  } catch {
    return null;
  }

  // Verify the trailing Adler-32 when present (lenient if truncated).
  if (r.pos + 4 <= data.length) {
    const expected =
      ((data[r.pos] << 24) | (data[r.pos + 1] << 16) | (data[r.pos + 2] << 8) | data[r.pos + 3]) >>> 0;
    let a = 1;
    let b = 0;
    for (let i = 0; i < out.length; i++) {
      a = (a + out[i]) % 65521;
      b = (b + a) % 65521;
    }
    const actual = (((b << 16) >>> 0) | a) >>> 0;
    if (actual !== expected) return null;
  }

  return out;
}
