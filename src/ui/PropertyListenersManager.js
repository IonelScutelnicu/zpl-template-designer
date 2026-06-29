// Property Listeners Manager
// Attaches event listeners to element property inputs

import { normalizeElementFontSize } from '../utils/zplFontSnap.js';
import { DEFAULT_PREVIEW_DATA } from '../utils/barcodeGeometry.js';

/**
 * Manages property panel event listeners
 */
export class PropertyListenersManager {
  constructor(callbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Attach all property listeners for an element
   * @param {Object} element - The selected element
   * @param {HTMLElement} propertiesPanel - The properties panel element
   */
  attachListeners(element, propertiesPanel) {
    // Common interactions
    const attach = (id, field, parser = (v) => v) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', (e) => {
        const parsed = parser(e.target.value);
        element[field] = parsed;
        // Reflect clamped/parsed value back to the input
        if (String(parsed) !== e.target.value) {
          e.target.value = parsed;
        }
        this.callbacks.onPropertyChange(element);
      });
    };

    const attachAction = (id, action) => {
      const button = document.getElementById(id);
      if (!button) return;
      button.addEventListener("click", () => {
        this.callbacks.onAlignmentAction(action, element);
      });
    };

    // Alignment actions
    attachAction("prop-center-x", "center-x");
    attachAction("prop-center-y", "center-y");
    attachAction("prop-match-width", "match-width");
    attachAction("prop-match-height", "match-height");

    // Common position properties
    attach("prop-x", "x", (v) => parseInt(v) || 0);
    attach("prop-y", "y", (v) => parseInt(v) || 0);

    // Element-specific properties
    switch (element.type) {
      case "TEXT":
        this.attachTextProperties(element, attach);
        break;
      case "BARCODE":
        this.attachBarcodeProperties(element, attach);
        break;
      case "QRCODE":
        this.attachQRCodeProperties(element, attach);
        break;
      case "BOX":
        this.attachBoxProperties(element, attach);
        break;
      case "LINE":
        this.attachLineProperties(element, attach);
        break;
      case "DIAGONALLINE":
        this.attachDiagonalLineProperties(element, attach);
        break;
      case "CIRCLE":
        this.attachCircleProperties(element, attach);
        break;
      case "FIELDBLOCK":
        this.attachFieldBlockProperties(element, attach);
        break;
      case "TEXTBLOCK":
        this.attachTextBlockProperties(element, attach);
        break;
      case "GRAPHIC":
        this.attachGraphicProperties(element);
        break;
    }

    // Attach section toggle listeners for state persistence
    this.attachSectionToggleListeners(propertiesPanel);
  }

  /**
   * Attach Font ID + Font Size (Height)/Width listeners shared by TEXT, TEXTBLOCK and
   * FIELDBLOCK. The size inputs are dropdowns for bitmap fonts (A–H) and numeric inputs
   * for scalable fonts; both yield an integer value. Changing the font normalizes the
   * stored size to the new font's allowed grid and re-renders the panel so the size
   * controls swap type / repopulate.
   */
  _attachFontControls(element, attach) {
    const fontIdEl = document.getElementById("prop-font-id");
    if (fontIdEl) {
      fontIdEl.addEventListener("change", (e) => {
        element.fontId = e.target.value;
        normalizeElementFontSize(element, this.callbacks.getLabelSettings?.()?.fontId);
        this.callbacks.onPropertyChange(element);
        this.callbacks.onRerenderProperties?.();
      });
    }
    attach("prop-font-size", "fontSize", (v) => Math.max(0, parseInt(v) || 0));
    attach("prop-font-width", "fontWidth", (v) => Math.max(0, parseInt(v) || 0));
  }

  /**
   * Attach TEXT element property listeners
   */
  attachTextProperties(element, attach) {
    attach("prop-placeholder", "placeholder");
    attach("prop-preview-text", "previewText");
    this._attachToggle("prop-field-hex", element, "fieldHex");
    this._attachFontControls(element, attach);
    this._attachOrientationButtons(element);

    this._attachReverseToggle(element);
  }

  /**
   * Wire the custom symbology picker. The canonical value lives on the hidden
   * <select id="prop-symbology"> — its `change` event (fired by the popover or
   * directly in tests) runs the swap logic: switching symbology replaces the
   * preview data only when it's the previous symbology's untouched default
   * (decision C), then re-renders the panel so type-specific fields update.
   * The trigger button opens/closes the popover; option clicks set the select.
   */
  _attachSymbologyPicker(element) {
    // Tear down any popover listener left over from a previous render.
    this._closeSymbologyPopover();

    const symEl = document.getElementById("prop-symbology");
    if (!symEl) return;

    symEl.addEventListener("change", (e) => {
      const prev = element.symbology;
      const next = e.target.value;
      if (element.previewData === DEFAULT_PREVIEW_DATA[prev] && DEFAULT_PREVIEW_DATA[next] !== undefined) {
        element.previewData = DEFAULT_PREVIEW_DATA[next];
      }
      element.symbology = next;
      this.callbacks.onPropertyChange(element);
      this.callbacks.onRerenderProperties?.();
    });

    const picker = document.querySelector(".symbology-picker");
    const trigger = document.getElementById("symbology-trigger");
    const menu = document.getElementById("symbology-menu");
    if (!picker || !trigger || !menu) return;

    const open = () => {
      menu.classList.remove("hidden");
      picker.dataset.open = "true";
      trigger.setAttribute("aria-expanded", "true");
      trigger.querySelector(".symbology-chevron")?.classList.add("rotate-180");
      this._symbologyOutsideClose = (e) => {
        if (!picker.contains(e.target)) this._closeSymbologyPopover();
        else if (e.key === "Escape") this._closeSymbologyPopover();
      };
      document.addEventListener("click", this._symbologyOutsideClose, true);
      document.addEventListener("keydown", this._symbologyOutsideClose, true);
    };

    trigger.addEventListener("click", () => {
      if (picker.dataset.open === "true") this._closeSymbologyPopover();
      else open();
    });

    menu.querySelectorAll(".symbology-option").forEach((opt) => {
      opt.addEventListener("click", () => {
        this._closeSymbologyPopover();
        const next = opt.dataset.symbology;
        if (next && next !== symEl.value) {
          symEl.value = next;
          symEl.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
    });
  }

  /** Hide the symbology popover and detach its document listeners (if any). */
  _closeSymbologyPopover() {
    if (this._symbologyOutsideClose) {
      document.removeEventListener("click", this._symbologyOutsideClose, true);
      document.removeEventListener("keydown", this._symbologyOutsideClose, true);
      this._symbologyOutsideClose = null;
    }
    const picker = document.querySelector(".symbology-picker");
    const menu = document.getElementById("symbology-menu");
    const trigger = document.getElementById("symbology-trigger");
    if (menu) menu.classList.add("hidden");
    if (picker) picker.dataset.open = "false";
    if (trigger) {
      trigger.setAttribute("aria-expanded", "false");
      trigger.querySelector(".symbology-chevron")?.classList.remove("rotate-180");
    }
  }

  /**
   * Attach a checkbox toggle bound to a boolean property.
   */
  _attachToggle(id, element, field) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("change", (e) => {
      element[field] = e.target.checked;
      this.callbacks.onPropertyChange(element);
      if (id === "prop-field-hex") {
        this.callbacks.onRerenderProperties?.();
      }
    });
  }

  /**
   * Wire the N/R/I/B orientation icon buttons to element.orientation. Scoped to
   * the mounted element panel via [data-orientation][data-tooltip] (only one
   * panel is shown at a time). Shared by TEXT and BARCODE.
   */
  _attachOrientationButtons(element) {
    const orientationButtons = document.querySelectorAll('[data-orientation][data-tooltip]');
    const setOrientationActive = (value) => {
      orientationButtons.forEach((button) => {
        const isActive = button.getAttribute('data-orientation') === value;
        button.classList.toggle('bg-white', isActive);
        button.classList.toggle('text-blue-600', isActive);
        button.classList.toggle('shadow-sm', isActive);
        button.classList.toggle('text-slate-400', !isActive);
        button.classList.toggle('hover:bg-white', !isActive);
        button.classList.toggle('hover:text-slate-600', !isActive);
        button.classList.toggle('hover:shadow-sm', !isActive);
      });
    };
    setOrientationActive(element.orientation || "N");
    orientationButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const value = button.getAttribute('data-orientation');
        if (!value) return;
        element.orientation = value;
        setOrientationActive(value);
        this.callbacks.onPropertyChange(element);
      });
    });
  }

  /**
   * Attach BARCODE (1D) element property listeners
   */
  attachBarcodeProperties(element, attach) {
    this._attachSymbologyPicker(element);
    attach("prop-placeholder", "placeholder");
    attach("prop-preview-data", "previewData");
    this._attachToggle("prop-field-hex", element, "fieldHex");
    attach("prop-height", "height", (v) => parseInt(v) || 50);
    attach("prop-width", "width", (v) => parseInt(v) || 2);
    // ^B3 wide:narrow ratio — Zebra supports 2.0:1 to 3.0:1, so clamp to that range.
    attach("prop-ratio", "ratio", (v) => {
      const r = parseFloat(v);
      return Number.isNaN(r) ? 2.0 : Math.min(3, Math.max(2, r));
    });
    this._attachToggle("prop-check-digit", element, "checkDigit");
    // Codabar start/stop characters (^BK k/l). No-op when the selects aren't rendered.
    attach("prop-codabar-start", "startChar");
    attach("prop-codabar-stop", "stopChar");
    // MSI check-digit mode (^BM e) and "show check digit in HRI" (^BM e2). No-ops when
    // the controls aren't rendered.
    attach("prop-msi-check-mode", "msiCheckMode");
    this._attachToggle("prop-msi-check-intext", element, "msiCheckInText");
    this._attachHriControl(element);
    this._attachOrientationButtons(element);

    this._attachReverseToggle(element);
  }

  /**
   * Wire the Off/Below/Above HRI segmented control to showText + printTextAbove.
   * Scoped to the mounted panel via [data-hri].
   */
  _attachHriControl(element) {
    const buttons = document.querySelectorAll('[data-hri]');
    const setActive = (value) => {
      buttons.forEach((button) => {
        const isActive = button.getAttribute('data-hri') === value;
        button.setAttribute('aria-pressed', String(isActive));
        button.classList.toggle('bg-white', isActive);
        button.classList.toggle('text-blue-600', isActive);
        button.classList.toggle('shadow-sm', isActive);
        button.classList.toggle('text-slate-500', !isActive);
        button.classList.toggle('hover:bg-white', !isActive);
        button.classList.toggle('hover:text-slate-700', !isActive);
        button.classList.toggle('hover:shadow-sm', !isActive);
      });
    };
    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        const value = button.getAttribute('data-hri');
        if (!value) return;
        element.showText = value !== 'off';
        element.printTextAbove = value === 'above';
        setActive(value);
        this.callbacks.onPropertyChange(element);
      });
    });
  }

  /**
   * Attach QRCODE (2D) element property listeners
   */
  attachQRCodeProperties(element, attach) {
    this._attachSymbologyPicker(element);
    attach("prop-placeholder", "placeholder");
    attach("prop-preview-data", "previewData");
    this._attachToggle("prop-field-hex", element, "fieldHex");
    // QR
    attach("prop-model", "model", (v) => parseInt(v) || 2);
    attach("prop-magnification", "magnification", (v) => parseInt(v) || 5);
    attach("prop-error-correction", "errorCorrection");
    // Data Matrix
    attach("prop-module-size", "moduleSize", (v) => parseInt(v) || 4);
    attach("prop-quality", "quality", (v) => parseInt(v) || 200);
    // PDF417
    attach("prop-module-width", "moduleWidth", (v) => parseInt(v) || 2);
    attach("prop-row-height", "rowHeight", (v) => parseInt(v) || 4);
    attach("prop-security-level", "securityLevel", (v) => Math.max(0, Math.min(8, parseInt(v) || 0)));
    attach("prop-columns", "columns", (v) => Math.max(0, parseInt(v) || 0));
    // Micro-PDF417 (reuses module-width/row-height above)
    attach("prop-micropdf-mode", "microPdfMode", (v) => Math.max(0, Math.min(33, parseInt(v) || 0)));
    // Code 49 (reuses module-width/row-height above)
    attach("prop-code49-mode", "code49Mode");
    // Codablock (reuses module-width/row-height above)
    attach("prop-codablock-mode", "codablockMode");
    // MaxiCode (reuses magnification above)
    attach("prop-maxicode-mode", "maxicodeMode");
    // Aztec
    attach("prop-aztec-size-mode", "aztecSizeMode");
    attach("prop-aztec-error-control", "aztecErrorControl", (v) => Math.max(0, Math.min(99, parseInt(v) || 0)));
    attach("prop-aztec-layers", "aztecLayers", (v) => Math.max(0, Math.min(32, parseInt(v) || 0)));

    this._attachReverseToggle(element);
  }

  /**
   * Attach BOX element property listeners
   */
  attachBoxProperties(element, attach) {
    attach("prop-width", "width", (v) => parseInt(v) || 100);
    attach("prop-height", "height", (v) => parseInt(v) || 50);
    attach("prop-thickness", "thickness", (v) => parseInt(v) || 3);
    this._attachColorToggle(element);
    attach("prop-rounding", "rounding", (v) => Math.max(0, Math.min(8, parseInt(v) || 0)));
    this._attachReverseToggle(element);
  }

  /**
   * Attach CIRCLE element property listeners
   */
  attachCircleProperties(element, attach) {
    const widthInput = document.getElementById('prop-width');
    const heightInput = document.getElementById('prop-height');

    // ^GE/^GC dimensions are 3–4095 dots, thickness 2–4095. Clamp the stored
    // value on every keystroke so the ZPL stays in range, but only normalise
    // the visible text on blur — rewriting mid-type would make values whose
    // leading digit is below the minimum (e.g. 1500 → 3) unreachable. See ADR 0004.
    const clampDim = (v) => Math.min(4095, Math.max(3, parseInt(v) || 3));

    // Width is authoritative: while locked, editing width mirrors to height
    // (1:1 Circle / ^GC). See ADR 0004.
    if (widthInput) {
      widthInput.addEventListener('input', (e) => {
        const v = clampDim(e.target.value);
        element.width = v;
        if (element.aspectLocked) {
          element.height = v;
          if (heightInput) heightInput.value = v;
        }
        this.callbacks.onPropertyChange(element);
      });
      widthInput.addEventListener('change', (e) => { e.target.value = element.width; });
    }
    if (heightInput) {
      heightInput.addEventListener('input', (e) => {
        if (element.aspectLocked) return; // height input is disabled while locked
        element.height = clampDim(e.target.value);
        this.callbacks.onPropertyChange(element);
      });
      heightInput.addEventListener('change', (e) => { e.target.value = element.height; });
    }

    // ^GE/^GC border thickness is 2–4095 dots (same blur-normalise approach).
    const thicknessInput = document.getElementById('prop-thickness');
    if (thicknessInput) {
      thicknessInput.addEventListener('input', (e) => {
        element.thickness = Math.min(4095, Math.max(2, parseInt(e.target.value) || 2));
        this.callbacks.onPropertyChange(element);
      });
      thicknessInput.addEventListener('change', (e) => { e.target.value = element.thickness; });
    }

    this._attachColorToggle(element);
    this._attachReverseToggle(element);
    this._attachCircleAspectLock(element);
  }

  /**
   * Aspect Lock toggle for circular elements. Locked → Circle (^GC, 1:1);
   * unlocked → Ellipse (^GE). Mirrors the GRAPHIC lock UI but snaps to a fixed
   * 1:1 ratio rather than a source bitmap's natural ratio. See ADR 0004.
   */
  _attachCircleAspectLock(element) {
    const lockBtn = document.getElementById('prop-circle-aspect-lock');
    if (!lockBtn) return;
    const heightInput = document.getElementById('prop-height');
    const heightLabel = document.getElementById('prop-circle-height-label');
    const lockedInputClasses = ['bg-slate-50', 'text-slate-400', 'cursor-not-allowed'];
    const unlockedInputClasses = ['text-slate-700', 'focus:ring-1', 'focus:ring-blue-500', 'focus:border-blue-500'];

    const applyLockUI = (locked) => {
      const iconSpan = lockBtn.querySelector('.material-icons-round');
      if (iconSpan) iconSpan.textContent = locked ? 'link' : 'link_off';
      const title = locked ? 'Aspect ratio locked — click to unlock' : 'Aspect ratio unlocked — click to relock';
      lockBtn.dataset.tooltip = title;
      lockBtn.classList.toggle('bg-white', locked);
      lockBtn.classList.toggle('text-blue-600', locked);
      lockBtn.classList.toggle('shadow-sm', locked);
      lockBtn.classList.toggle('bg-slate-100', !locked);
      lockBtn.classList.toggle('text-slate-400', !locked);
      lockBtn.classList.toggle('hover:text-blue-600', !locked);

      if (heightInput) {
        heightInput.disabled = locked;
        for (const c of lockedInputClasses) heightInput.classList.toggle(c, locked);
        for (const c of unlockedInputClasses) heightInput.classList.toggle(c, !locked);
      }
      if (heightLabel) {
        heightLabel.classList.toggle('text-slate-400', locked);
        heightLabel.classList.toggle('text-slate-700', !locked);
      }
    };

    lockBtn.addEventListener('click', () => {
      element.aspectLocked = !element.aspectLocked;
      applyLockUI(element.aspectLocked);
      if (element.aspectLocked) {
        // Re-lock: snap height to width (1:1). Width is authoritative.
        element.height = element.width;
        if (heightInput) heightInput.value = element.width;
      }
      this.callbacks.onPropertyChange(element);
    });
  }

  /**
   * Attach LINE element property listeners
   */
  attachLineProperties(element, attach) {
    attach("prop-width", "width", (v) => parseInt(v) || 100);
    attach("prop-thickness", "thickness", (v) => parseInt(v) || 3);
    attach("prop-orientation", "orientation");
    this._attachColorToggle(element);
    attach("prop-rounding", "rounding", (v) => Math.max(0, Math.min(8, parseInt(v) || 0)));
    this._attachReverseToggle(element);
  }

  attachDiagonalLineProperties(element, attach) {
    attach("prop-width", "width", (v) => parseInt(v) || 100);
    attach("prop-height", "height", (v) => parseInt(v) || 100);
    attach("prop-thickness", "thickness", (v) => parseInt(v) || 3);
    this._attachOrientationToggle(element);
    this._attachColorToggle(element);
    this._attachReverseToggle(element);
  }

  /**
   * Attach orientation toggle button listeners (data-orientation + data-tooltip).
   * Mirrors _attachColorToggle's active/inactive classes so the diagonal-line
   * orientation control reads identically to the Color and Reverse Print toggles.
   */
  _attachOrientationToggle(element) {
    const orientationButtons = document.querySelectorAll('[data-orientation][data-tooltip]');
    const setOrientationActive = (value) => {
      orientationButtons.forEach((button) => {
        const isActive = button.getAttribute('data-orientation') === value;
        button.classList.toggle('bg-white', isActive);
        button.classList.toggle('text-blue-600', isActive);
        button.classList.toggle('shadow', isActive);
        button.classList.toggle('text-slate-500', !isActive);
        button.classList.toggle('hover:bg-slate-200', !isActive);
        button.setAttribute('aria-pressed', String(isActive));
      });
    };
    setOrientationActive(element.orientation || "R");
    orientationButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const value = button.getAttribute('data-orientation');
        if (!value) return;
        element.orientation = value;
        setOrientationActive(value);
        this.callbacks.onPropertyChange(element);
      });
    });
  }

  /**
   * Attach GRAPHIC element property listeners. Width and threshold changes
   * are debounced and dispatched as a re-encode request; the replace button
   * delegates to the host so it can re-open the file picker.
   */
  attachGraphicProperties(element) {
    const replaceBtn = document.getElementById('prop-graphic-replace');
    if (replaceBtn) {
      replaceBtn.addEventListener('click', () => {
        if (this.callbacks.onGraphicReplace) this.callbacks.onGraphicReplace(element);
      });
    }

    // Orientation toggle buttons (scoped to element panel via [data-tooltip])
    const orientationButtons = document.querySelectorAll('[data-orientation][data-tooltip]');
    const setOrientationActive = (value) => {
      orientationButtons.forEach((button) => {
        const isActive = button.getAttribute('data-orientation') === value;
        button.classList.toggle('bg-white', isActive);
        button.classList.toggle('text-blue-600', isActive);
        button.classList.toggle('shadow-sm', isActive);
        button.classList.toggle('text-slate-400', !isActive);
        button.classList.toggle('hover:bg-white', !isActive);
        button.classList.toggle('hover:text-slate-600', !isActive);
        button.classList.toggle('hover:shadow-sm', !isActive);
      });
    };
    setOrientationActive(element.orientation || "N");
    orientationButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const value = button.getAttribute('data-orientation');
        if (!value) return;
        element.orientation = value;
        setOrientationActive(value);
        this.callbacks.onPropertyChange(element);
      });
    });

    this._attachReverseToggle(element);

    if (!element.isEditable || !element.isEditable()) return;

    const widthInput = document.getElementById('prop-graphic-width');
    const heightInput = document.getElementById('prop-graphic-height');
    const thresholdInput = document.getElementById('prop-graphic-threshold');
    const thresholdValue = document.getElementById('prop-graphic-threshold-value');
    const lockBtn = document.getElementById('prop-graphic-aspect-lock');

    let timer = null;
    const schedule = (opts) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (this.callbacks.onGraphicReencode) this.callbacks.onGraphicReencode(element, opts);
      }, 150);
    };

    if (widthInput) {
      widthInput.addEventListener('input', (e) => {
        const v = Math.max(8, Math.min(32000, parseInt(e.target.value) || 8));
        schedule({ widthDots: v });
      });
    }
    if (heightInput) {
      heightInput.addEventListener('input', (e) => {
        if (element.aspectLocked) return;
        const v = Math.max(8, Math.min(32000, parseInt(e.target.value) || 8));
        schedule({ heightDots: v });
      });
    }
    if (thresholdInput) {
      thresholdInput.addEventListener('input', (e) => {
        const v = Math.max(1, Math.min(255, parseInt(e.target.value) || 128));
        if (thresholdValue) thresholdValue.textContent = String(v);
        schedule({ threshold: v });
      });
    }
    if (lockBtn) {
      const heightLabel = document.getElementById('prop-graphic-height-label');
      const lockedInputClasses = ['bg-slate-50', 'text-slate-400', 'cursor-not-allowed'];
      const unlockedInputClasses = ['text-slate-700', 'focus:ring-1', 'focus:ring-blue-500', 'focus:border-blue-500'];

      const applyLockUI = (locked) => {
        const iconSpan = lockBtn.querySelector('.material-icons-round');
        if (iconSpan) iconSpan.textContent = locked ? 'link' : 'link_off';
        const title = locked ? 'Aspect ratio locked — click to unlock' : 'Aspect ratio unlocked — click to relock';
        lockBtn.dataset.tooltip = title;
        lockBtn.classList.toggle('bg-white', locked);
        lockBtn.classList.toggle('text-blue-600', locked);
        lockBtn.classList.toggle('shadow-sm', locked);
        lockBtn.classList.toggle('bg-slate-100', !locked);
        lockBtn.classList.toggle('text-slate-400', !locked);
        lockBtn.classList.toggle('hover:text-blue-600', !locked);

        if (heightInput) {
          heightInput.disabled = locked;
          for (const c of lockedInputClasses) heightInput.classList.toggle(c, locked);
          for (const c of unlockedInputClasses) heightInput.classList.toggle(c, !locked);
        }
        if (heightLabel) {
          heightLabel.classList.toggle('text-slate-400', locked);
          heightLabel.classList.toggle('text-slate-700', !locked);
        }
      };

      lockBtn.addEventListener('click', () => {
        element.aspectLocked = !element.aspectLocked;
        applyLockUI(element.aspectLocked);
        if (element.aspectLocked) {
          // Re-lock: snap height to width × natural aspect ratio. If we don't
          // have a cached natural ratio (legacy element), fall back to the
          // current ratio so behavior is at least stable.
          const ratio = element.naturalAspectRatio || (element.widthDots > 0 ? element.heightDots / element.widthDots : 1);
          const snappedHeight = Math.max(1, Math.round(element.widthDots * ratio));
          schedule({ widthDots: element.widthDots, heightDots: snappedHeight });
        } else if (this.callbacks.onPropertyChange) {
          this.callbacks.onPropertyChange(element);
        }
      });
    }
  }

  /**
   * Attach reverse-print toggle listeners. Used by every element type.
   */
  _attachReverseToggle(element) {
    const reverseButtons = document.querySelectorAll('[data-reverse]');
    if (reverseButtons.length === 0) return;
    const setReverseActive = (value) => {
      reverseButtons.forEach((button) => {
        const isActive = button.getAttribute('data-reverse') === value;
        button.classList.toggle('bg-white', isActive);
        button.classList.toggle('text-blue-600', isActive);
        button.classList.toggle('shadow', isActive);
        button.classList.toggle('text-slate-500', !isActive);
        button.classList.toggle('hover:bg-slate-200', !isActive);
      });
    };
    setReverseActive(element.reverse ? 'Y' : 'N');
    reverseButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const value = button.getAttribute('data-reverse');
        if (!value) return;
        element.reverse = value === 'Y';
        setReverseActive(value);
        this.callbacks.onPropertyChange(element);
      });
    });
  }

  /**
   * Attach color toggle button listeners for Box/Line elements
   */
  _attachColorToggle(element) {
    const colorButtons = document.querySelectorAll('[data-color]');
    const setColorActive = (value) => {
      colorButtons.forEach((button) => {
        const isActive = button.getAttribute('data-color') === value;
        button.classList.toggle('bg-white', isActive);
        button.classList.toggle('text-blue-600', isActive);
        button.classList.toggle('shadow', isActive);
        button.classList.toggle('text-slate-500', !isActive);
        button.classList.toggle('hover:bg-slate-200', !isActive);
      });
    };
    setColorActive(element.color || "B");
    colorButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const value = button.getAttribute('data-color');
        if (!value) return;
        element.color = value;
        setColorActive(value);
        this.callbacks.onPropertyChange(element);
      });
    });
  }

  /**
   * Attach FIELDBLOCK element property listeners
   */
  attachFieldBlockProperties(element, attach) {
    attach("prop-placeholder", "placeholder");
    attach("prop-preview-text", "previewText");
    this._attachToggle("prop-field-hex", element, "fieldHex");
    this._attachFontControls(element, attach);
    attach("prop-block-width", "blockWidth", (v) => parseInt(v) || 200);
    attach("prop-max-lines", "maxLines", (v) => parseInt(v) || 1);
    attach("prop-line-spacing", "lineSpacing", (v) => parseInt(v) || 0);
    attach("prop-hanging-indent", "hangingIndent", (v) => parseInt(v) || 0);

    // Orientation toggle buttons (scoped to element panel via [data-tooltip])
    const orientationButtons = document.querySelectorAll('[data-orientation][data-tooltip]');
    const setOrientationActive = (value) => {
      orientationButtons.forEach((button) => {
        const isActive = button.getAttribute('data-orientation') === value;
        button.classList.toggle('bg-white', isActive);
        button.classList.toggle('text-blue-600', isActive);
        button.classList.toggle('shadow-sm', isActive);
        button.classList.toggle('text-slate-400', !isActive);
        button.classList.toggle('hover:bg-white', !isActive);
        button.classList.toggle('hover:text-slate-600', !isActive);
        button.classList.toggle('hover:shadow-sm', !isActive);
      });
    };
    setOrientationActive(element.orientation || "N");
    orientationButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const value = button.getAttribute('data-orientation');
        if (!value) return;
        element.orientation = value;
        setOrientationActive(value);
        this.callbacks.onPropertyChange(element);
      });
    });

    this._attachReverseToggle(element);

    // Justification toggle buttons
    const justificationButtons = document.querySelectorAll('[data-justification]');
    const setJustificationActive = (value) => {
      justificationButtons.forEach((button) => {
        const isActive = button.getAttribute('data-justification') === value;
        button.classList.toggle('bg-white', isActive);
        button.classList.toggle('text-blue-600', isActive);
        button.classList.toggle('shadow', isActive);
        button.classList.toggle('text-slate-500', !isActive);
        button.classList.toggle('hover:bg-slate-200', !isActive);
      });
    };
    setJustificationActive(element.justification);
    justificationButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const value = button.getAttribute('data-justification');
        if (!value) return;
        element.justification = value;
        setJustificationActive(value);
        this.callbacks.onPropertyChange(element);
      });
    });
  }

  /**
   * Attach TEXTBLOCK element property listeners
   */
  attachTextBlockProperties(element, attach) {
    attach("prop-placeholder", "placeholder");
    attach("prop-preview-text", "previewText");
    this._attachToggle("prop-field-hex", element, "fieldHex");
    this._attachFontControls(element, attach);
    attach("prop-block-width", "blockWidth", (v) => parseInt(v) || 300);
    attach("prop-block-height", "blockHeight", (v) => parseInt(v) || 200);

    // Orientation toggle buttons (scoped to element panel via [data-tooltip])
    const orientationButtons = document.querySelectorAll('[data-orientation][data-tooltip]');
    const setOrientationActive = (value) => {
      orientationButtons.forEach((button) => {
        const isActive = button.getAttribute('data-orientation') === value;
        button.classList.toggle('bg-white', isActive);
        button.classList.toggle('text-blue-600', isActive);
        button.classList.toggle('shadow-sm', isActive);
        button.classList.toggle('text-slate-400', !isActive);
        button.classList.toggle('hover:bg-white', !isActive);
        button.classList.toggle('hover:text-slate-600', !isActive);
        button.classList.toggle('hover:shadow-sm', !isActive);
      });
    };
    setOrientationActive(element.orientation || "N");
    orientationButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const value = button.getAttribute('data-orientation');
        if (!value) return;
        element.orientation = value;
        setOrientationActive(value);
        this.callbacks.onPropertyChange(element);
      });
    });

    this._attachReverseToggle(element);
  }

  /**
   * Attach section toggle listeners for collapsible sections
   */
  attachSectionToggleListeners(propertiesPanel) {
    const detailsElements = propertiesPanel.querySelectorAll('details.section-collapsible');

    detailsElements.forEach(details => {
      const elementType = details.getAttribute('data-element-type');
      const sectionTitle = details.getAttribute('data-section-title');

      if (!elementType || !sectionTitle) return;

      // Save state when user toggles section
      const toggleHandler = () => {
        // Use setTimeout to ensure 'open' attribute is updated
        setTimeout(() => {
          const isOpen = details.hasAttribute('open');
          this.callbacks.onSectionToggle(elementType, sectionTitle, isOpen);
        }, 0);
      };

      details.addEventListener('toggle', toggleHandler);
    });
  }
}
