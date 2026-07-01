export const DATABAR_BCID = {
  omni: 'databaromni',
  truncated: 'databartruncated',
  stacked: 'databarstacked',
  stackedomni: 'databarstackedomni',
  limited: 'databarlimited',
  expanded: 'databarexpanded',
};

export const DATABAR_TYPES = ['omni', 'truncated', 'stacked', 'stackedomni', 'limited', 'expanded'];
export const DATABAR_TYPE_NUM = { omni: 1, truncated: 2, stacked: 3, stackedomni: 4, limited: 5, expanded: 6 };
export const DATABAR_TYPE_BY_NUM = { 1: 'omni', 2: 'truncated', 3: 'stacked', 4: 'stackedomni', 5: 'limited', 6: 'expanded' };

// GS1 DataBar linear variants have a fixed nominal bar height defined by the GS1
// spec as a multiple of X (the module width = magnification). Labelary ignores the
// ^BR height (e) parameter entirely and always renders at this nominal height
// (verified live: omni=33X, truncated=13X, limited=10X, expanded=34X), so we drive
// the canvas height from magnification too. Stacked / stacked-omni are multi-row
// and get their height from the module matrix, so they're not listed here.
const DATABAR_LINEAR_X_HEIGHT = { omni: 33, truncated: 13, limited: 10, expanded: 34 };

/** Nominal bar height (in dots) for a linear GS1 DataBar variant, matching Labelary. */
export function databarLinearBarDots(element) {
  const x = DATABAR_LINEAR_X_HEIGHT[element.databarType] ?? 33;
  return x * (element.magnification || 5);
}

// Separator row height (in X) emitted as ^BR's separator parameter. The render and
// the stacked-geometry expansion below must agree, so both read this constant.
export const DATABAR_SEPARATOR_HEIGHT = 2;

// Stacked GS1 DataBar data-row heights (in X), fixed by the GS1 spec: [top, bottom].
// bwip collapses each variable-height row of a stacked symbol to a single module row
// in `pixs`, so the uniform matrix renderer would draw a squat 3-row (or 5-row) block
// instead of Labelary's tall two-row symbol. The first and last `pixs` rows are the
// data rows (these heights); every row between them is a separator row of
// DATABAR_SEPARATOR_HEIGHT X. (Verified against Labelary: stacked = 5+2+7 = 14X,
// stackedomni = 33+2+2+2+33 = 72X, both at ^BR separator = 2.)
const DATABAR_STACKED_DATA_X = { stacked: [5, 7], stackedomni: [33, 33] };

/**
 * Expand a stacked GS1 DataBar's collapsed module matrix to true module resolution,
 * repeating each `pixs` row by its real X-height so the standard uniform matrix
 * renderer reproduces Labelary's proportions. Returns null for non-stacked variants
 * (the caller keeps bwip's matrix as-is).
 */
export function expandStackedDatabar(element, cols, rows, pixs) {
  const dataX = DATABAR_STACKED_DATA_X[element.databarType];
  if (!dataX || rows < 2) return null;
  const rowX = (r) => (r === 0 ? dataX[0] : r === rows - 1 ? dataX[1] : DATABAR_SEPARATOR_HEIGHT);
  let totalRows = 0;
  for (let r = 0; r < rows; r++) totalRows += rowX(r);
  const out = new Uint8Array(totalRows * cols);
  let y = 0;
  for (let r = 0; r < rows; r++) {
    for (let h = rowX(r); h > 0; h--, y++) {
      out.set(pixs.slice(r * cols, r * cols + cols), y * cols);
    }
  }
  return { kind: 'matrix', cols, rows: totalRows, pixs: out };
}

function databarGtin13(data) {
  const d = String(data ?? '').replace(/\D/g, '');
  return d.length >= 13 ? d.slice(0, 13) : d.padStart(13, '0');
}

export function databarBwipText(element) {
  const data = element.previewData || '';
  if (element.databarType === 'expanded') {
    return data.includes('(') ? data : `(01)${databarGtin13(data)}`;
  }
  return `(01)${databarGtin13(data)}`;
}
