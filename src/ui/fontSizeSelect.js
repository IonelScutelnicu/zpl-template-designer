const SELECT_CLASS = "w-full rounded-md border border-slate-200 py-1.5 px-2 text-xs text-slate-700 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white";

/**
 * Renders the <select> for a bitmap font's allowed size values. Callers supply their
 * own label/wrapper markup.
 * @param {string} id - element id
 * @param {number} value - current value in dots (0 = the defaultLabel option)
 * @param {number[]} values - allowed values from getBitmapFontAllowedSizes()
 * @param {string|null} defaultLabel - label for the 0 option; null omits it
 */
export function fontSizeSelectHtml(id, value, values, defaultLabel) {
  const inList = values.includes(value);
  return `
    <select id="${id}" class="${SELECT_CLASS}">
      ${defaultLabel !== null ? `<option value="0" ${value === 0 ? 'selected' : ''}>${defaultLabel}</option>` : ''}
      ${values.map(v => `<option value="${v}" ${value === v ? 'selected' : ''}>${v}</option>`).join('')}
      ${(!inList && value !== 0) ? `<option value="${value}" selected>${value}</option>` : ''}
    </select>
  `;
}
