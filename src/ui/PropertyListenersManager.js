// Property Listeners Manager
// Attaches event listeners to element property inputs

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
        element[field] = parser(e.target.value);
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
      case "TEXTBLOCK":
        this.attachTextBlockProperties(element, attach);
        break;
    }

    // Attach section toggle listeners for state persistence
    this.attachSectionToggleListeners(propertiesPanel);
  }

  /**
   * Attach TEXT element property listeners
   */
  attachTextProperties(element, attach) {
    attach("prop-placeholder", "placeholder");
    attach("prop-preview-text", "previewText");
    attach("prop-font-id", "fontId");
    attach("prop-font-size", "fontSize", (v) => parseInt(v) || 0);
    attach("prop-font-width", "fontWidth", (v) => parseInt(v) || 0);
    attach("prop-orientation", "orientation");

    // Reverse toggle buttons
    const reverseButtons = document.querySelectorAll('[data-reverse]');
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
    setReverseActive(element.reverse ? "Y" : "N");
    reverseButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const value = button.getAttribute('data-reverse');
        if (!value) return;
        element.reverse = value === "Y";
        setReverseActive(value);
        this.callbacks.onPropertyChange(element);
      });
    });
  }

  /**
   * Attach BARCODE element property listeners
   */
  attachBarcodeProperties(element, attach) {
    attach("prop-placeholder", "placeholder");
    attach("prop-preview-data", "previewData");
    attach("prop-height", "height", (v) => parseInt(v) || 50);
    attach("prop-width", "width", (v) => parseFloat(v) || 2);
    attach("prop-ratio", "ratio", (v) => parseFloat(v) || 2.0);

    // Handle show text toggle
    const showTextToggle = document.getElementById("prop-show-text");
    if (showTextToggle) {
      showTextToggle.addEventListener("change", (e) => {
        element.showText = e.target.checked;
        this.callbacks.onPropertyChange(element);
      });
    }
  }

  /**
   * Attach QRCODE element property listeners
   */
  attachQRCodeProperties(element, attach) {
    attach("prop-placeholder", "placeholder");
    attach("prop-preview-data", "previewData");
    attach("prop-model", "model", (v) => parseInt(v) || 2);
    attach("prop-magnification", "magnification", (v) => parseInt(v) || 5);
    attach("prop-error-correction", "errorCorrection");
  }

  /**
   * Attach BOX element property listeners
   */
  attachBoxProperties(element, attach) {
    attach("prop-width", "width", (v) => parseInt(v) || 100);
    attach("prop-height", "height", (v) => parseInt(v) || 50);
    attach("prop-thickness", "thickness", (v) => parseInt(v) || 3);
    attach("prop-color", "color");
    attach("prop-rounding", "rounding", (v) => parseInt(v) || 0);
  }

  /**
   * Attach LINE element property listeners
   */
  attachLineProperties(element, attach) {
    attach("prop-width", "width", (v) => parseInt(v) || 100);
    attach("prop-thickness", "thickness", (v) => parseInt(v) || 3);
    attach("prop-orientation", "orientation");
  }

  /**
   * Attach TEXTBLOCK element property listeners
   */
  attachTextBlockProperties(element, attach) {
    attach("prop-placeholder", "placeholder");
    attach("prop-preview-text", "previewText");
    attach("prop-font-id", "fontId");
    attach("prop-font-size", "fontSize", (v) => parseInt(v) || 0);
    attach("prop-font-width", "fontWidth", (v) => parseInt(v) || 0);
    attach("prop-block-width", "blockWidth", (v) => parseInt(v) || 200);
    attach("prop-max-lines", "maxLines", (v) => parseInt(v) || 1);
    attach("prop-line-spacing", "lineSpacing", (v) => parseInt(v) || 0);
    attach("prop-hanging-indent", "hangingIndent", (v) => parseInt(v) || 0);

    // Reverse toggle buttons
    const reverseButtons = document.querySelectorAll('[data-reverse]');
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
    setReverseActive(element.reverse ? "Y" : "N");
    reverseButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const value = button.getAttribute('data-reverse');
        if (!value) return;
        element.reverse = value === "Y";
        setReverseActive(value);
        this.callbacks.onPropertyChange(element);
      });
    });

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
