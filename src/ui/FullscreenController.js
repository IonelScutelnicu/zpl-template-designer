// Fullscreen Controller
// Workspace layout state — toggles the .is-fullscreen class on #view-editor,
// repositioning the side panels and ZPL output into floating containers
// anchored to the canvas edges. See CONTEXT.md `Fullscreen` glossary.

export class FullscreenController {
  constructor() {
    this.viewEditor = document.getElementById('view-editor');
    this.toggleBtn = document.getElementById('fullscreen-toggle-btn');
    this.toggleIcon = document.getElementById('fullscreen-toggle-icon');
    this.toggleLabel = document.getElementById('fullscreen-toggle-label');
    this.zplCollapseBtn = document.getElementById('zpl-collapse-btn');
    this.zplCollapseIcon = document.getElementById('zpl-collapse-icon');
    this.warningsPanel = document.getElementById('warnings-panel');
    this.iconRail = document.getElementById('fs-icon-rail');
    this._on = false;
    this._zoomParent = null;
    this._zoomSibling = null;
    this._fsBtnParent = null;
    // Default fullscreen tab. Q5: `+` (Add Element).
    this._activeTab = 'add';
  }

  init() {
    if (this.toggleBtn) {
      this.toggleBtn.addEventListener('click', () => this.toggle());
    }
    if (this.zplCollapseBtn) {
      this.zplCollapseBtn.addEventListener('click', () => this.toggleZplCollapsed());
    }
    // Chevron buttons on Elements + Properties + Settings cards
    document.querySelectorAll('[data-fs-chevron]').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.fsChevron;
        const card = document.getElementById(`${target}-card`);
        if (!card) return;
        card.classList.toggle('fs-collapsed');
        const icon = btn.querySelector('.material-icons-round');
        const collapsed = card.classList.contains('fs-collapsed');
        if (icon) icon.textContent = collapsed ? 'expand_more' : 'expand_less';
      });
    });
    // Fullscreen icon rail: each button switches the visible tab.
    // Clicking the already-active icon is a no-op (Q2).
    if (this.iconRail) {
      this.iconRail.querySelectorAll('.fs-icon-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const tab = btn.dataset.fsTab;
          if (!tab || tab === this._activeTab) return;
          this.setActiveTab(tab);
        });
      });
    }
    // Warnings chip: clicking the header toggles the list
    if (this.warningsPanel) {
      const header = this.warningsPanel.querySelector('.border-b');
      if (header) {
        header.addEventListener('click', (e) => {
          if (!this._on) return;
          // Don't toggle when clicking the dismiss button inside the header
          if (e.target.closest('#warnings-dismiss-btn')) return;
          this.warningsPanel.classList.toggle('fs-chip-expanded');
        });
      }
    }
    // Note: fullscreen state persists across editor ↔ templates view switches.
    // The `is-fullscreen` class stays on #view-editor while the user browses
    // templates; returning to the editor lands in the same layout they left.
  }

  isOn() {
    return this._on;
  }

  toggle() {
    if (this._on) this.exit();
    else this.enter();
  }

  enter() {
    if (this._on) return;
    this._on = true;
    // Teleport zoom-controls to body so its z-index is in the root stacking
    // context, not inside #preview-card's (position:fixed) stacking context.
    const zoomControls = document.getElementById('zoom-controls');
    if (zoomControls) {
      this._zoomParent = zoomControls.parentElement;
      this._zoomSibling = zoomControls.nextSibling;
      zoomControls.classList.add('fs-zoom-detached');
      document.body.appendChild(zoomControls);
    }
    // Teleport the fullscreen toggle from its floating spot on the canvas
    // into the header cluster, where it becomes the × at the end of the pill.
    const fsBtn = document.getElementById('fullscreen-toggle-btn');
    const headerControls = document.getElementById('header-controls');
    if (fsBtn && headerControls) {
      this._fsBtnParent = fsBtn.parentElement;
      fsBtn.classList.remove('fullscreen-btn-floating');
      headerControls.appendChild(fsBtn);
    }
    // Measure header height once per entry and expose as a CSS var
    const header = document.querySelector('header');
    if (header) {
      const h = Math.round(header.getBoundingClientRect().height);
      this.viewEditor.style.setProperty('--hdr', `${h}px`);
    }
    // Default: ZPL collapsed; Settings collapsed; Elements + Properties expanded
    this.viewEditor.classList.add('zpl-collapsed');
    const settingsCard = document.getElementById('settings-card');
    if (settingsCard) {
      settingsCard.classList.add('fs-collapsed');
      const settingsBtn = settingsCard.querySelector('[data-fs-chevron="settings"] .material-icons-round');
      if (settingsBtn) settingsBtn.textContent = 'expand_more';
    }
    const elementsCard = document.getElementById('elements-card');
    if (elementsCard) elementsCard.classList.remove('fs-collapsed');
    const propertiesCard = document.getElementById('properties-card');
    if (propertiesCard) propertiesCard.classList.remove('fs-collapsed');
    // Reset warnings chip to collapsed
    if (this.warningsPanel) this.warningsPanel.classList.remove('fs-chip-expanded');
    // Update toggle button icon/label/tooltip — in fullscreen the cluster
    // collapses to icons, so the Exit button shows × (label is hidden via CSS).
    if (this.toggleIcon) this.toggleIcon.textContent = 'zoom_in_map';
    if (this.toggleLabel) this.toggleLabel.textContent = 'Exit';
    if (this.toggleBtn) this.toggleBtn.setAttribute('data-tooltip', 'Exit fullscreen (Esc)');
    // Update ZPL chevron icon (default collapsed = expand_more to invite expansion)
    if (this.zplCollapseIcon) this.zplCollapseIcon.textContent = 'expand_more';
    if (this.zplCollapseBtn) this.zplCollapseBtn.setAttribute('data-tooltip', 'Expand');
    // Force-open every <details> in the settings card. The icon-rail tabs
    // control which one is visible (via CSS on the [data-fs-tab] attr);
    // the browser's native collapse on a closed <details> would hide the
    // content even when our CSS tries to show it, so we open them all here
    // and rely on CSS to pick the visible one.
    document.querySelectorAll('#settings-card details').forEach(d => {
      d.dataset.fsPrevOpen = d.open ? '1' : '0';
      d.open = true;
    });
    // Reset to the default tab (Q5: `+`) on every entry.
    this.setActiveTab('add');
    // Apply the class — transitions kick in
    this.viewEditor.classList.add('is-fullscreen');
  }

  setActiveTab(tab) {
    this._activeTab = tab;
    this.viewEditor.setAttribute('data-fs-active-tab', tab);
    if (this.iconRail) {
      this.iconRail.querySelectorAll('.fs-icon-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.fsTab === tab);
      });
    }
  }

  exit() {
    if (!this._on) return;
    this._on = false;
    // Restore zoom-controls to its original position inside preview-container
    const zoomControls = document.getElementById('zoom-controls');
    if (zoomControls && this._zoomParent) {
      zoomControls.classList.remove('fs-zoom-detached');
      this._zoomParent.insertBefore(zoomControls, this._zoomSibling || null);
      this._zoomParent = null;
      this._zoomSibling = null;
    }
    // Restore the fullscreen toggle to its floating spot on the canvas
    const fsBtn = document.getElementById('fullscreen-toggle-btn');
    if (fsBtn && this._fsBtnParent) {
      fsBtn.classList.add('fullscreen-btn-floating');
      this._fsBtnParent.appendChild(fsBtn);
      this._fsBtnParent = null;
    }
    this.viewEditor.classList.remove('is-fullscreen');
    this.viewEditor.classList.remove('zpl-collapsed');
    this.viewEditor.removeAttribute('data-fs-active-tab');
    // Restore each <details>' prior open state from when we force-opened
    // them on enter(), so the normal-view accordion behaves as before.
    document.querySelectorAll('#settings-card details').forEach(d => {
      d.open = d.dataset.fsPrevOpen === '1';
      delete d.dataset.fsPrevOpen;
    });
    // Reset card collapse states so normal-view styles are clean
    document.querySelectorAll('#elements-card, #settings-card, #properties-card')
      .forEach(card => card.classList.remove('fs-collapsed'));
    if (this.warningsPanel) this.warningsPanel.classList.remove('fs-chip-expanded');
    // Restore toggle button
    if (this.toggleIcon) this.toggleIcon.textContent = 'zoom_out_map';
    if (this.toggleLabel) this.toggleLabel.textContent = 'Fullscreen';
    if (this.toggleBtn) this.toggleBtn.setAttribute('data-tooltip', 'Enter fullscreen');
  }

  toggleZplCollapsed() {
    const collapsed = this.viewEditor.classList.toggle('zpl-collapsed');
    if (this.zplCollapseIcon) {
      this.zplCollapseIcon.textContent = collapsed ? 'expand_more' : 'expand_less';
    }
    if (this.zplCollapseBtn) {
      this.zplCollapseBtn.setAttribute('data-tooltip', collapsed ? 'Expand' : 'Collapse');
    }
  }

  // Called by updateZPLOutput() to refresh the inline truncated preview
  updateInlineZpl(zpl) {
    const inline = document.getElementById('zpl-output-inline');
    if (!inline) return;
    const oneLine = (zpl || '').replace(/\s+/g, ' ').trim();
    inline.textContent = oneLine;
  }
}
