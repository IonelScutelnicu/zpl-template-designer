// QR mask penalty scoring (ISO/IEC 18004 section 6.8.2.1).
// Labelary uses the ZXing interpretation of these rules; bwip-js's automatic
// mask selection differs for some payloads.

const N1 = 3;
const N2 = 3;
const N3 = 40;
const N4 = 10;

function rule1(at, size) {
  let penalty = 0;
  for (const horizontal of [true, false]) {
    for (let i = 0; i < size; i++) {
      let runLength = 0;
      let previous = -1;
      for (let j = 0; j < size; j++) {
        const bit = horizontal ? at(i, j) : at(j, i);
        if (bit === previous) {
          runLength++;
        } else {
          if (runLength >= 5) penalty += N1 + runLength - 5;
          runLength = 1;
          previous = bit;
        }
      }
      if (runLength >= 5) penalty += N1 + runLength - 5;
    }
  }
  return penalty;
}

function rule2(at, size) {
  let blocks = 0;
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const value = at(y, x);
      if (value === at(y, x + 1) && value === at(y + 1, x) && value === at(y + 1, x + 1)) {
        blocks++;
      }
    }
  }
  return N2 * blocks;
}

function isLightRun(get, size, from, to) {
  for (let i = Math.max(from, 0); i < Math.min(to, size); i++) {
    if (get(i) === 1) return false;
  }
  return true;
}

function rule3(at, size) {
  let patterns = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (
        x + 6 < size
        && at(y, x) === 1 && at(y, x + 1) === 0 && at(y, x + 2) === 1 && at(y, x + 3) === 1
        && at(y, x + 4) === 1 && at(y, x + 5) === 0 && at(y, x + 6) === 1
        && (isLightRun((i) => at(y, i), size, x - 4, x) || isLightRun((i) => at(y, i), size, x + 7, x + 11))
      ) {
        patterns++;
      }
      if (
        y + 6 < size
        && at(y, x) === 1 && at(y + 1, x) === 0 && at(y + 2, x) === 1 && at(y + 3, x) === 1
        && at(y + 4, x) === 1 && at(y + 5, x) === 0 && at(y + 6, x) === 1
        && (isLightRun((i) => at(i, x), size, y - 4, y) || isLightRun((i) => at(i, x), size, y + 7, y + 11))
      ) {
        patterns++;
      }
    }
  }
  return N3 * patterns;
}

function rule4(at, size) {
  let dark = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      dark += at(y, x);
    }
  }
  const total = size * size;
  return Math.floor((Math.abs(dark * 2 - total) * 10) / total) * N4;
}

export function qrMaskPenalty(size, pixs) {
  const at = (row, col) => (pixs[row * size + col] ? 1 : 0);
  return rule1(at, size) + rule2(at, size) + rule3(at, size) + rule4(at, size);
}
