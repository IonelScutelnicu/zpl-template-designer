// Tooltip Manager
// Custom tooltip with 500ms hover delay, keyboard shortcut hints, viewport clamping

export class TooltipManager {
  constructor() {
    this._el = null;
    this._timer = null;
    this._currentTarget = null;
    this.delay = 500;
  }

  init() {
    this._el = document.createElement('div');
    this._el.className = 'zpl-tooltip';
    this._el.setAttribute('role', 'tooltip');
    document.body.appendChild(this._el);

    document.addEventListener('mouseover', (e) => {
      const target = e.target.closest('[data-tooltip]');
      if (!target) return;
      // Already scheduled / showing for this exact element — nothing to do
      if (target === this._currentTarget) return;
      this._currentTarget = target;
      this._schedule(target);
    });

    document.addEventListener('mouseout', (e) => {
      if (!this._currentTarget) return;
      // Ignore moves between children of the same tooltip target (internal mouse movement)
      if (e.relatedTarget && this._currentTarget.contains(e.relatedTarget)) return;
      this._hide();
    });
  }

  _schedule(el) {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this._show(el), this.delay);
  }

  _show(el) {
    if (!this._el) return;
    this._el.textContent = el.dataset.tooltip;
    this._el.classList.add('visible');
    // rAF ensures _position() measures the tooltip after layout has settled
    requestAnimationFrame(() => {
      if (this._el.classList.contains('visible')) {
        this._position(el);
      }
    });
  }

  _position(el) {
    const rect = el.getBoundingClientRect();
    const tipRect = this._el.getBoundingClientRect();
    const gap = 6;

    let top = rect.bottom + gap;
    let left = rect.left + rect.width / 2 - tipRect.width / 2;

    if (top + tipRect.height > window.innerHeight - 8) {
      top = rect.top - tipRect.height - gap;
    }

    left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));

    this._el.style.top = `${top}px`;
    this._el.style.left = `${left}px`;
  }

  _hide() {
    clearTimeout(this._timer);
    this._currentTarget = null;
    this._el?.classList.remove('visible');
  }
}
