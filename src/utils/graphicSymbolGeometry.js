// ^GS uses a quantized 24-dot font cell. Labelary sweeps pin the magnification
// to round(dots / 24), capped at 10, independently for height and width.
export function graphicSymbolSteps(dots) {
  return Math.min(Math.max(Math.round(Number(dots) / 24), 1), 10);
}

export function graphicSymbolEffectiveSize(dots) {
  return 25 * graphicSymbolSteps(dots);
}

// R/I/B rotate around this visible character-cell span.
export function graphicSymbolCellWidth(dots) {
  return 26 * graphicSymbolSteps(dots) - 2;
}

export function graphicSymbolCellHeight(dots) {
  return 24 * graphicSymbolSteps(dots) - 1;
}

// ^FT anchors use the complete cell rather than the visible ink bounds. The
// reading advance is exclusive for left justification and inclusive for right.
export function graphicSymbolTypesetDrop(dots) {
  return 24 * graphicSymbolSteps(dots);
}

export function graphicSymbolTypesetAdvance(dots) {
  return 26 * graphicSymbolSteps(dots) - 1;
}

export function graphicSymbolRightExtent(dots) {
  return 26 * graphicSymbolSteps(dots);
}

export function graphicSymbolFtOffset(element) {
  const drop = graphicSymbolTypesetDrop(element?.height);
  const advance = graphicSymbolTypesetAdvance(element?.width);
  const rightExtent = graphicSymbolRightExtent(element?.width);
  const right = element?.fieldJustify === 'R';

  switch (element?.orientation || 'N') {
    case 'R': return right ? { dx: 0, dy: rightExtent } : { dx: 0, dy: 0 };
    case 'I': return right ? { dx: 0, dy: 0 } : { dx: advance, dy: 0 };
    case 'B': return right ? { dx: drop, dy: 0 } : { dx: drop, dy: advance };
    default: return right ? { dx: rightExtent, dy: drop } : { dx: 0, dy: drop };
  }
}
