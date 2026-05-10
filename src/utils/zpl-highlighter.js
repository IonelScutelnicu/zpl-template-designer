import { escapeHtml } from './dom-helpers.js';

export function highlightZPL(zpl) {
  if (!zpl) {
    return '';
  }

  const parts = [];
  let index = 0;
  const fdRegex = /\^FD/g;
  let match;

  while ((match = fdRegex.exec(zpl)) !== null) {
    const start = match.index;
    const cmdEnd = start + 3;
    const nextCaret = zpl.indexOf("^", cmdEnd);
    const dataEnd = nextCaret === -1 ? zpl.length : nextCaret;

    parts.push({ type: "text", value: zpl.slice(index, start) });
    parts.push({ type: "command", value: "^FD" });
    parts.push({ type: "data", value: zpl.slice(cmdEnd, dataEnd) });

    index = dataEnd;
    fdRegex.lastIndex = dataEnd;
  }

  parts.push({ type: "text", value: zpl.slice(index) });

  const highlightSegment = (segment) => {
    let escaped = escapeHtml(segment);
    escaped = escaped.replace(/(\^[A-Z]{1,4}|~[A-Z]{1,4})(?=[^A-Z]|$)/g, '<span class="zpl-token-command">$1</span>');
    escaped = escaped.replace(/\b\d+(\.\d+)?\b/g, '<span class="zpl-token-number">$&</span>');
    escaped = escaped.replace(/,/g, '<span class="zpl-token-punct">,</span>');
    return escaped;
  };

  return parts.map((part) => {
    if (!part.value) return "";
    if (part.type === "data") {
      return `<span class="zpl-token-data">${escapeHtml(part.value)}</span>`;
    }
    if (part.type === "command") {
      return `<span class="zpl-token-command">${escapeHtml(part.value)}</span>`;
    }
    return highlightSegment(part.value);
  }).join("");
}
