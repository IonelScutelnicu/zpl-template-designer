export class ContextMenu {
  constructor(container, callbacks) {
    this.container = container;
    this.callbacks = callbacks;

    this._createMenuElement();
  }

  _createMenuElement() {
    this.menuEl = document.createElement('div');
    this.menuEl.id = 'canvas-context-menu';
    this.menuEl.setAttribute('role', 'menu');
    this.menuEl.setAttribute('popover', 'auto');
    this.menuEl.className = 'fixed bg-white border border-slate-200 rounded-lg shadow-lg py-1';
    this.menuEl.style.width = '12rem';
    this.container.appendChild(this.menuEl);
  }

  get isVisible() {
    return this.menuEl.matches(':popover-open');
  }

  show(clientX, clientY, targetElement) {
    if (this.callbacks.closeOtherMenus) {
      this.callbacks.closeOtherMenus();
    }

    this._buildItems(targetElement);

    if (!this.isVisible) this.menuEl.showPopover();

    // The top layer positions against the viewport, so the click point and the
    // container's own rect are already in the menu's coordinate space.
    const padding = 8;
    const bounds = this.container.getBoundingClientRect();
    const { width, height } = this.menuEl.getBoundingClientRect();
    const clamp = (v, min, max) => Math.min(Math.max(v, min), Math.max(min, max));
    this.menuEl.style.left = `${clamp(clientX, bounds.left + padding, bounds.right - width - padding)}px`;
    this.menuEl.style.top = `${clamp(clientY, bounds.top + padding, bounds.bottom - height - padding)}px`;
  }

  hide() {
    if (this.isVisible) this.menuEl.hidePopover();
  }

  _buildItems(targetElement) {
    this.menuEl.innerHTML = '';

    // When 2+ elements are selected and the right-click landed on a member,
    // show group actions instead of the single-element menu.
    const selection = this.callbacks.getSelectedElements ? this.callbacks.getSelectedElements() : [];
    if (targetElement && selection.length > 1 && selection.some(el => String(el.id) === String(targetElement.id))) {
      this._buildGroupItems(selection);
      return;
    }

    if (targetElement) {
      const elements = this.callbacks.getElements();
      const index = elements.findIndex(el => String(el.id) === String(targetElement.id));
      const isLocked = targetElement.locked;
      const disableMatchSize = !targetElement.canMatchLabelSize();
      const hasClipboard = Boolean(this.callbacks.getClipboardData());

      this._addItem('content_copy', 'Copy', 'Ctrl+C', () => this.callbacks.onCopy(targetElement));
      this._addItem('content_paste', 'Paste', 'Ctrl+V', () => this.callbacks.onPaste(), !hasClipboard);
      this._addItem('file_copy', 'Duplicate', null, () => this.callbacks.onDuplicate(targetElement), isLocked);
      this._addSeparator();
      this._addItem('arrow_upward', 'Move Up', null, () => this.callbacks.onMoveUp(targetElement), isLocked || index === 0);
      this._addItem('arrow_downward', 'Move Down', null, () => this.callbacks.onMoveDown(targetElement), isLocked || index === elements.length - 1);
      this._addItem('vertical_align_top', 'Send to Back', null, () => this.callbacks.onSendToBack(targetElement), isLocked || index === 0);
      this._addItem('vertical_align_bottom', 'Send to Front', null, () => this.callbacks.onSendToFront(targetElement), isLocked || index === elements.length - 1);
      this._addSeparator();
      this._addItem('align_horizontal_center', 'Center Horizontally', null, () => this.callbacks.onCenterHorizontally(targetElement), isLocked);
      this._addItem('align_vertical_center', 'Center Vertically', null, () => this.callbacks.onCenterVertically(targetElement), isLocked);
      this._addItem('fit_screen', 'Match Label Width', null, () => this.callbacks.onMatchLabelWidth(targetElement), isLocked || disableMatchSize);
      this._addItem('fit_screen', 'Match Label Height', null, () => this.callbacks.onMatchLabelHeight(targetElement), isLocked || disableMatchSize, 'rotate-90');
      this._addSeparator();
      this._addItem(
        isLocked ? 'lock_open' : 'lock',
        isLocked ? 'Unlock' : 'Lock',
        null,
        () => this.callbacks.onToggleLock(targetElement)
      );
      this._addItem('delete', 'Delete', 'Del', () => this.callbacks.onDelete(targetElement), isLocked);
    } else {
      const hasClipboard = Boolean(this.callbacks.getClipboardData());
      this._addItem('content_paste', 'Paste', 'Ctrl+V', () => this.callbacks.onPaste(), !hasClipboard);
    }
  }

  _buildGroupItems(selection) {
    const count = selection.length;
    const distributeDisabled = count < 3;
    const matchDisabled = selection.filter(el => !el.locked && el.canMatchLabelSize?.()).length < 2;

    this._addItem('align_horizontal_left', 'Align Left', null, () => this.callbacks.onGroupAlign('left'));
    this._addItem('align_horizontal_center', 'Align Center', null, () => this.callbacks.onGroupAlign('center-h'));
    this._addItem('align_horizontal_right', 'Align Right', null, () => this.callbacks.onGroupAlign('right'));
    this._addItem('align_vertical_top', 'Align Top', null, () => this.callbacks.onGroupAlign('top'));
    this._addItem('align_vertical_center', 'Align Middle', null, () => this.callbacks.onGroupAlign('middle'));
    this._addItem('align_vertical_bottom', 'Align Bottom', null, () => this.callbacks.onGroupAlign('bottom'));
    this._addSeparator();
    this._addItem('horizontal_distribute', 'Distribute Horizontally', null, () => this.callbacks.onGroupDistribute('horizontal'), distributeDisabled);
    this._addItem('vertical_distribute', 'Distribute Vertically', null, () => this.callbacks.onGroupDistribute('vertical'), distributeDisabled);
    this._addSeparator();
    this._addItem('align_horizontal_left', 'Label Left', null, () => this.callbacks.onGroupAlignLabel('left'));
    this._addItem('align_horizontal_center', 'Label Center (H)', null, () => this.callbacks.onGroupAlignLabel('center-x'));
    this._addItem('align_horizontal_right', 'Label Right', null, () => this.callbacks.onGroupAlignLabel('right'));
    this._addItem('align_vertical_top', 'Label Top', null, () => this.callbacks.onGroupAlignLabel('top'));
    this._addItem('align_vertical_center', 'Label Center (V)', null, () => this.callbacks.onGroupAlignLabel('center-y'));
    this._addItem('align_vertical_bottom', 'Label Bottom', null, () => this.callbacks.onGroupAlignLabel('bottom'));
    this._addSeparator();
    this._addItem('swap_horiz', 'Match Width to Largest', null, () => this.callbacks.onGroupMatchSize('width'), matchDisabled);
    this._addItem('swap_vert', 'Match Height to Largest', null, () => this.callbacks.onGroupMatchSize('height'), matchDisabled);
    this._addSeparator();
    this._addItem('delete', 'Delete', 'Del', () => this.callbacks.onGroupDelete(selection));
  }

  _addItem(icon, label, shortcut, onClick, disabled = false, iconClass = '') {
    const btn = document.createElement('button');
    btn.setAttribute('role', 'menuitem');
    btn.dataset.action = label.toLowerCase().replace(/\s+/g, '-');
    btn.disabled = disabled;
    btn.className = disabled
      ? 'w-full text-left px-3 py-1.5 text-xs font-medium text-slate-400 cursor-not-allowed inline-flex items-center gap-2'
      : 'w-full text-left px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors inline-flex items-center gap-2';

    const iconClasses = ['material-icons-round', 'text-[14px]', 'leading-none', iconClass].filter(Boolean).join(' ');
    const iconSpan = `<span class="${iconClasses}" aria-hidden="true">${icon}</span>`;
    const labelSpan = `<span class="flex-1 min-w-0">${label}</span>`;
    const shortcutSpan = shortcut ? `<span class="text-[10px] text-slate-400 ml-auto">${shortcut}</span>` : '';

    btn.innerHTML = `${iconSpan}${labelSpan}${shortcutSpan}`;

    if (!disabled) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hide();
        onClick();
      });
    }

    this.menuEl.appendChild(btn);
  }

  _addSeparator() {
    const hr = document.createElement('div');
    hr.className = 'border-t border-slate-100 my-1';
    this.menuEl.appendChild(hr);
  }
}
