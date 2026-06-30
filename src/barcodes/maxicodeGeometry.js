export const MAXICODE_COLS = 30;
export const MAXICODE_ROWS = 33;

export function maxicodeSize(W) {
  const H = (W * 2) / Math.sqrt(3);
  const rowPitch = (W * Math.sqrt(3)) / 2;
  return { width: MAXICODE_COLS * W + W / 2, height: (MAXICODE_ROWS - 1) * rowPitch + H };
}

export function maxicodeGeometry(raw) {
  return {
    kind: 'maxicode',
    cols: MAXICODE_COLS,
    rows: MAXICODE_ROWS,
    modules: Array.from(raw.pixs, (c) => ({ col: c % MAXICODE_COLS, row: (c / MAXICODE_COLS) | 0 })),
  };
}
