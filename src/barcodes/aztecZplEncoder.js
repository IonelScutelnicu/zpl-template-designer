const TABLES = {
  upper: ['', ' ', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'],
  lower: ['', ' ', ...'abcdefghijklmnopqrstuvwxyz'],
  mixed: [
    '', ' ', '\x01', '\x02', '\x03', '\x04', '\x05', '\x06', '\x07', '\b', '\t', '\n',
    '\x0b', '\f', '\r', '\x1b', '\x1c', '\x1d', '\x1e', '\x1f', '@', '\\', '^', '_',
    '`', '|', '~', '\x7f'
  ],
  punct: [
    '', '\r', '\r\n', '. ', ', ', ': ', '!', '"', '#', '$', '%', '&', "'", '(', ')',
    '*', '+', ',', '-', '.', '/', ':', ';', '<', '=', '>', '?', '[', ']', '{', '}'
  ],
  digit: ['', ' ', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '.']
};

const PAIR_CODES = new Map([
  ['\r\n', 2],
  ['. ', 3],
  [', ', 4],
  [': ', 5]
]);

const LATCH_PATHS = {
  upper: {
    lower: [['upper', 28]],
    mixed: [['upper', 29]],
    digit: [['upper', 30]],
    punct: [['upper', 29], ['mixed', 30]]
  },
  lower: {
    upper: [['lower', 29], ['mixed', 29]],
    mixed: [['lower', 29]],
    digit: [['lower', 30]],
    punct: [['lower', 29], ['mixed', 30]]
  },
  mixed: {
    upper: [['mixed', 29]],
    lower: [['mixed', 28]],
    digit: [['mixed', 29], ['upper', 30]],
    punct: [['mixed', 30]]
  },
  digit: {
    upper: [['digit', 14]],
    lower: [['digit', 14], ['upper', 28]],
    mixed: [['digit', 14], ['upper', 29]],
    punct: [['digit', 14], ['upper', 29], ['mixed', 30]]
  },
  punct: {
    upper: [['punct', 31]],
    lower: [['punct', 31], ['upper', 28]],
    mixed: [['punct', 31], ['upper', 29]],
    digit: [['punct', 31], ['upper', 30]]
  }
};

function codeWidth(mode) {
  return mode === 'digit' ? 4 : 5;
}

function targetMode(char) {
  if (char === ' ') return 'upper';
  if (char >= 'A' && char <= 'Z') return 'upper';
  if (char >= 'a' && char <= 'z') return 'lower';
  if (char >= '0' && char <= '9') return 'digit';
  if (TABLES.punct.includes(char)) return 'punct';
  if (TABLES.mixed.includes(char)) return 'mixed';
  return null;
}

function modeRunLength(text, offset, mode) {
  let length = 0;
  while (offset < text.length) {
    const pairCode = PAIR_CODES.get(text.slice(offset, offset + 2));
    if (pairCode) {
      if (mode !== 'punct') break;
      offset += 2;
    } else {
      if (targetMode(text[offset]) !== mode) break;
      offset += 1;
    }
    length += 1;
  }
  return length;
}

function pathCost(path) {
  return path.reduce((cost, [mode]) => cost + codeWidth(mode), 0);
}

/**
 * Zebra's Aztec encoder takes fixed, greedy latch paths instead of minimizing the
 * whole message like bwip-js. Returning null keeps bwip's binary/Unicode fallback.
 */
export function zplAztecHighLevelBits(text) {
  let mode = 'upper';
  let bits = '';

  const emit = (value, sourceMode = mode) => {
    bits += value.toString(2).padStart(codeWidth(sourceMode), '0');
  };
  const latch = (target) => {
    for (const [sourceMode, value] of LATCH_PATHS[mode][target]) emit(value, sourceMode);
    mode = target;
  };

  for (let offset = 0; offset < text.length;) {
    const pairCode = PAIR_CODES.get(text.slice(offset, offset + 2));
    const char = pairCode ? text.slice(offset, offset + 2) : text[offset];

    if (pairCode && mode === 'punct') {
      emit(pairCode);
      offset += 2;
      continue;
    }

    if (!pairCode) {
      const currentCode = TABLES[mode].indexOf(char);
      if (currentCode > 0) {
        emit(currentCode);
        offset += 1;
        continue;
      }
    }

    const target = pairCode ? 'punct' : targetMode(char);
    if (!target) return null;
    const runLength = modeRunLength(text, offset, target) || 1;

    if (target === 'punct' && mode !== 'punct') {
      const shiftCost = codeWidth(mode) + 5;
      const latchCost = pathCost(LATCH_PATHS[mode].punct) + runLength * 5;
      if (shiftCost * runLength <= latchCost) {
        emit(0);
        emit(pairCode || TABLES.punct.indexOf(char), 'punct');
        offset += pairCode ? 2 : 1;
        continue;
      }
    }

    if (target === 'upper' && (mode === 'lower' || mode === 'digit')) {
      // Unlike the punctuation branch above, Zebra does not price this one: an
      // uppercase run of one or two characters shifts per character, and anything
      // longer latches ("3700.00GR" shifts twice on its way out of digit mode).
      if (runLength <= 2) {
        emit(mode === 'lower' ? 28 : 15);
        emit(TABLES.upper.indexOf(char), 'upper');
        offset += 1;
        continue;
      }
    }

    latch(target);
    emit(pairCode || TABLES[mode].indexOf(char));
    offset += pairCode ? 2 : 1;
  }

  return bits;
}
