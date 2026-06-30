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
