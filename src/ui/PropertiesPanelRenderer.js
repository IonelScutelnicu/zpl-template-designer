// Properties Panel Renderer
// Generates HTML for the element properties editing panel

import { BUILTIN_FONTS, FONT_LABELS } from '../config/constants.js';

/**
 * Renderer for the properties panel UI
 */
export class PropertiesPanelRenderer {
  constructor(getLabelSettingsFn, getSectionStateFn) {
    this.getLabelSettings = getLabelSettingsFn;
    this.getSectionState = getSectionStateFn;
  }

  get labelSettings() {
    return this.getLabelSettings();
  }

  /**
   * Render the complete properties panel
   * @param {Object|null} selectedElement - Currently selected element
   * @returns {string} HTML string
   */
  render(selectedElement) {
    if (!selectedElement) {
      return '<p class="text-center text-slate-400 py-12 italic text-sm">Select an element to edit properties</p>';
    }

    const content = this.renderElementProperties(selectedElement);
    return `<div class="animate-fade-in">${content}</div>`;
  }

  /**
   * Render properties based on element type
   */
  renderElementProperties(element) {
    const renderers = {
      TEXT: () => this.renderTextProperties(element),
      BARCODE: () => this.renderBarcodeProperties(element),
      QRCODE: () => this.renderQRCodeProperties(element),
      BOX: () => this.renderBoxProperties(element),
      LINE: () => this.renderLineProperties(element),
      TEXTBLOCK: () => this.renderTextBlockProperties(element)
    };

    const renderer = renderers[element.type];
    return renderer ? renderer() : '<p>Unknown element type</p>';
  }

  /**
   * Render a collapsible section
   */
  renderSection(title, body, options = {}) {
    const { open = true, elementType = null } = options;

    let isOpen = open;
    if (elementType && this.getSectionState) {
      isOpen = this.getSectionState(elementType, title);
    }

    const dataAttr = elementType ? `data-element-type="${elementType}" data-section-title="${title}"` : '';

    return `
      <details class="group mb-3 border-b border-slate-200 pb-3 section-collapsible" ${isOpen ? "open" : ""} ${dataAttr}>
        <summary class="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500 cursor-pointer select-none">
          <span>${title}</span>
          <span class="transition group-open:rotate-180">
            <svg fill="none" height="14" shape-rendering="geometricPrecision" stroke="currentColor"
              stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" viewBox="0 0 24 24" width="14">
              <path d="M6 9l6 6 6-6"></path>
            </svg>
          </span>
        </summary>
        <div class="mt-3">
          ${body}
        </div>
      </details>
    `;
  }

  /**
   * Create an input group with label
   */
  createInputGroup(label, id, value, type = "text", options = {}) {
    const { min, max, step, placeholder } = options;
    const attributes = [
      min !== undefined ? `min="${min}"` : "",
      max !== undefined ? `max="${max}"` : "",
      step !== undefined ? `step="${step}"` : "",
      placeholder !== undefined ? `placeholder="${placeholder}"` : "",
    ].join(" ");

    // For number inputs with 0 meaning "use default", show empty instead of 0
    const displayValue = (type === "number" && value === 0 && placeholder) ? "" : value;

    return `
      <div class="mb-3">
        <label class="block text-xs font-medium text-slate-700 mb-1">${label}</label>
        <input
          type="${type}"
          id="${id}"
          value="${displayValue}"
          ${attributes}
          class="w-full rounded-md border border-slate-200 py-1.5 px-2 text-xs text-slate-700 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white"
        >
      </div>
    `;
  }

  /**
   * Render alignment controls section
   */
  renderAlignmentControls(element) {
    const disableMatchSize = element?.type === "TEXT" || element?.type === "QRCODE";
    const disabledAttr = disableMatchSize ? "disabled" : "";
    const disabledClass = disableMatchSize ? "opacity-50 cursor-not-allowed hover:border-slate-200 hover:bg-white" : "";

    return this.renderSection(
      "Alignment &amp; Size",
      `
        <div class="grid grid-cols-4 gap-2">
          <button id="prop-center-x"
            class="group flex items-center justify-center h-10 bg-white border border-slate-200 rounded-md hover:border-blue-500 hover:bg-blue-50 transition-all"
            title="Center Horizontally">
            <span class="material-icons-round text-slate-400 group-hover:text-blue-500 mb-1 transition-colors">align_horizontal_center</span>
          </button>
          <button id="prop-center-y"
            class="group flex items-center justify-center h-10 bg-white border border-slate-200 rounded-md hover:border-blue-500 hover:bg-blue-50 transition-all"
            title="Center Vertically">
            <span class="material-icons-round text-slate-400 group-hover:text-blue-500 mb-1 transition-colors">align_vertical_center</span>
          </button>
          <button id="prop-match-width"
            class="group flex items-center justify-center h-10 bg-white border border-slate-200 rounded-md hover:border-blue-500 hover:bg-blue-50 transition-all ${disabledClass}"
            ${disabledAttr}
            title="Match Label Width">
            <span class="material-icons-round text-slate-400 group-hover:text-blue-500 mb-1 transition-colors">fit_screen</span>
          </button>
          <button id="prop-match-height"
            class="group flex items-center justify-center h-10 bg-white border border-slate-200 rounded-md hover:border-blue-500 hover:bg-blue-50 transition-all ${disabledClass}"
            ${disabledAttr}
            title="Match Label Height">
            <span class="material-icons-round text-slate-400 group-hover:text-blue-500 mb-1 transition-colors rotate-90">fit_screen</span>
          </button>
        </div>
      `,
      { open: true, elementType: element.type }
    );
  }

  /**
   * Render font selection dropdown
   */
  renderFontSelect(element) {
    return `
      <div class="mb-3">
        <label class="block text-xs font-medium text-slate-700 mb-1">Font ID (override)</label>
        <select id="prop-font-id" class="w-full rounded-md border border-slate-200 py-1.5 px-2 text-xs text-slate-700 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white">
          <option value="">Use label default</option>
          ${BUILTIN_FONTS.map(id => `<option value="${id}" ${element.fontId === id ? 'selected' : ''}>${FONT_LABELS[id] || id}</option>`).join('')}
          ${this.labelSettings.customFonts.map(font => `<option value="${font.id}" ${element.fontId === font.id ? 'selected' : ''}>${font.id} - Custom</option>`).join('')}
        </select>
      </div>
    `;
  }

  /**
   * Render TEXT element properties
   */
  renderTextProperties(element) {
    return `
      ${this.renderAlignmentControls(element)}
      ${this.renderSection("Position &amp; Size", `
        <div class="grid grid-cols-2 gap-3">
          ${this.createInputGroup("X Position", "prop-x", element.x, "number", { min: 0 })}
          ${this.createInputGroup("Y Position", "prop-y", element.y, "number", { min: 0 })}
        </div>
        <div class="mb-3">
          <label class="block text-xs font-medium text-slate-700 mb-1">Orientation</label>
          <div class="flex gap-1 bg-slate-100 rounded-lg p-1 border border-slate-200">
            <button type="button" data-orientation="N"
              class="flex-1 flex items-center justify-center p-1.5 rounded-md transition-all ${element.orientation === "N" ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:bg-white hover:text-slate-600 hover:shadow-sm"}"
              title="Normal (N)">
              <span class="material-icons-round text-base">text_rotation_none</span>
            </button>
            <button type="button" data-orientation="R"
              class="flex-1 flex items-center justify-center p-1.5 rounded-md transition-all ${element.orientation === "R" ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:bg-white hover:text-slate-600 hover:shadow-sm"}"
              title="Rotated 90° (R)">
              <span class="material-icons-round text-base inline-block rotate-90">text_rotation_none</span>
            </button>
            <button type="button" data-orientation="I"
              class="flex-1 flex items-center justify-center p-1.5 rounded-md transition-all ${element.orientation === "I" ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:bg-white hover:text-slate-600 hover:shadow-sm"}"
              title="Inverted 180° (I)">
              <span class="material-icons-round text-base inline-block rotate-180">text_rotation_none</span>
            </button>
            <button type="button" data-orientation="B"
              class="flex-1 flex items-center justify-center p-1.5 rounded-md transition-all ${element.orientation === "B" ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:bg-white hover:text-slate-600 hover:shadow-sm"}"
              title="Bottom-Up 270° (B)">
              <span class="material-icons-round text-base inline-block -rotate-90">text_rotation_none</span>
            </button>
          </div>
        </div>
      `, { elementType: element.type })}
      ${this.renderSection("Text Content", `
        ${this.createInputGroup("Preview Text", "prop-preview-text", element.previewText)}
        ${this.createInputGroup("Placeholder", "prop-placeholder", element.placeholder)}
      `, { open: true, elementType: element.type })}
      ${this.renderSection("Font Settings", `
        ${this.renderFontSelect(element)}
        <div class="grid grid-cols-2 gap-3">
          ${this.createInputGroup("Font Size (Height)", "prop-font-size", element.fontSize, "number", { min: 0, max: 32000, placeholder: "Use default" })}
          ${this.createInputGroup("Font Width", "prop-font-width", element.fontWidth, "number", { min: 0, max: 32000, placeholder: "Use default" })}
        </div>
      `, { elementType: element.type })}
      ${this.renderSection("Appearance", `
        <div class="flex items-center justify-between">
          <label class="text-xs text-slate-700">
            Reverse Print
            <a href="https://docs.zebra.com/us/en/printers/software/zpl-pg/c-zpl-zpl-commands/r-zpl-fr.html"
              target="_blank" class="text-blue-500 hover:underline">^FR</a>
          </label>
          <div class="flex gap-1 bg-slate-100 rounded p-1 border border-slate-200">
            <button type="button" data-reverse="N"
              class="px-3 py-1 text-xs rounded ${element.reverse ? "text-slate-500 hover:bg-slate-200" : "bg-white text-blue-600 shadow"} transition-colors">
              Normal
            </button>
            <button type="button" data-reverse="Y"
              class="px-3 py-1 text-xs rounded ${element.reverse ? "bg-white text-blue-600 shadow" : "text-slate-500 hover:bg-slate-200"} transition-colors">
              Reverse
            </button>
          </div>
        </div>
      `, { open: true, elementType: element.type })}
    `;
  }

  /**
   * Render BARCODE element properties
   */
  renderBarcodeProperties(element) {
    return `
      ${this.renderAlignmentControls(element)}
      ${this.renderSection("Position &amp; Size", `
        <div class="grid grid-cols-2 gap-3">
          ${this.createInputGroup("X Position", "prop-x", element.x, "number", { min: 0 })}
          ${this.createInputGroup("Y Position", "prop-y", element.y, "number", { min: 0 })}
          ${this.createInputGroup("Height", "prop-height", element.height, "number", { min: 1, max: 1000 })}
          ${this.createInputGroup("Width Multiplier", "prop-width", element.width, "number", { min: 1, max: 10, step: 0.1 })}
        </div>
      `, { elementType: element.type })}
      ${this.renderSection("Content", `
        ${this.createInputGroup("Preview Data", "prop-preview-data", element.previewData)}
        ${this.createInputGroup("Placeholder", "prop-placeholder", element.placeholder)}
      `, { elementType: element.type })}
      ${this.renderSection("Barcode Settings", `
        ${this.createInputGroup("Ratio", "prop-ratio", element.ratio, "number", { min: 1, max: 10, step: 0.1 })}
        <div class="mb-3">
          <label class="flex items-center justify-between cursor-pointer">
            <span class="text-xs font-medium text-slate-700">Show Text Below Barcode</span>
            <div class="relative">
              <input type="checkbox" id="prop-show-text" class="sr-only peer" ${element.showText === true ? "checked" : ""}>
              <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
            </div>
          </label>
        </div>
      `, { open: true, elementType: element.type })}
    `;
  }

  /**
   * Render QRCODE element properties
   */
  renderQRCodeProperties(element) {
    return `
      ${this.renderAlignmentControls(element)}
      ${this.renderSection("Position &amp; Size", `
        <div class="grid grid-cols-2 gap-3">
          ${this.createInputGroup("X Position", "prop-x", element.x, "number", { min: 0 })}
          ${this.createInputGroup("Y Position", "prop-y", element.y, "number", { min: 0 })}
          ${this.createInputGroup("Magnification", "prop-magnification", element.magnification, "number", { min: 1, max: 10 })}
        </div>
      `, { elementType: element.type })}
      ${this.renderSection("Content", `
        <div class="mb-3">
          <label class="block text-xs font-medium text-slate-700 mb-1">Preview Data</label>
          <textarea
            id="prop-preview-data"
            rows="2"
            class="w-full rounded-md border border-slate-200 py-1.5 px-2 text-xs text-slate-700 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white"
          >${element.previewData}</textarea>
        </div>
        ${this.createInputGroup("Placeholder", "prop-placeholder", element.placeholder)}
      `, { elementType: element.type })}
      ${this.renderSection("QR Settings", `
        <div class="mb-3">
          <label class="block text-xs font-medium text-slate-700 mb-1">Model</label>
          <select id="prop-model" class="w-full rounded-md border border-slate-200 py-1.5 px-2 text-xs text-slate-700 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white">
            <option value="1" ${element.model === 1 ? "selected" : ""}>Model 1 (Original)</option>
            <option value="2" ${element.model === 2 ? "selected" : ""}>Model 2 (Enhanced)</option>
          </select>
        </div>
        <div class="mb-3">
          <label class="block text-xs font-medium text-slate-700 mb-1">Error Correction</label>
          <select id="prop-error-correction" class="w-full rounded-md border border-slate-200 py-1.5 px-2 text-xs text-slate-700 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white">
            <option value="H" ${element.errorCorrection === "H" ? "selected" : ""}>H - Ultra-High (30%)</option>
            <option value="Q" ${element.errorCorrection === "Q" ? "selected" : ""}>Q - Quality (25%)</option>
            <option value="M" ${element.errorCorrection === "M" ? "selected" : ""}>M - Medium (15%)</option>
            <option value="L" ${element.errorCorrection === "L" ? "selected" : ""}>L - Low (7%)</option>
          </select>
        </div>
      `, { open: true, elementType: element.type })}
    `;
  }

  /**
   * Render BOX element properties
   */
  renderBoxProperties(element) {
    return `
      ${this.renderAlignmentControls(element)}
      ${this.renderSection("Position &amp; Size", `
        <div class="grid grid-cols-2 gap-3">
          ${this.createInputGroup("X Position", "prop-x", element.x, "number", { min: 0 })}
          ${this.createInputGroup("Y Position", "prop-y", element.y, "number", { min: 0 })}
          ${this.createInputGroup("Width", "prop-width", element.width, "number", { min: 1, max: 32000 })}
          ${this.createInputGroup("Height", "prop-height", element.height, "number", { min: 1, max: 32000 })}
          ${this.createInputGroup("Thickness", "prop-thickness", element.thickness, "number", { min: 1, max: 32000 })}
        </div>
      `, { elementType: element.type })}
      ${this.renderSection("Appearance", `
        <div class="mb-3">
          <label class="block text-xs font-medium text-slate-700 mb-1">Color</label>
          <select id="prop-color" class="w-full rounded-md border border-slate-200 py-1.5 px-2 text-xs text-slate-700 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white">
            <option value="B" ${element.color === "B" ? "selected" : ""}>Black</option>
            <option value="W" ${element.color === "W" ? "selected" : ""}>White</option>
          </select>
        </div>
        ${this.createInputGroup("Rounding", "prop-rounding", element.rounding, "number", { min: 0, max: 32000 })}
      `, { open: true, elementType: element.type })}
    `;
  }

  /**
   * Render LINE element properties
   */
  renderLineProperties(element) {
    return `
      ${this.renderAlignmentControls(element)}
      ${this.renderSection("Position &amp; Size", `
        <div class="grid grid-cols-2 gap-3">
          ${this.createInputGroup("X Position", "prop-x", element.x, "number", { min: 0 })}
          ${this.createInputGroup("Y Position", "prop-y", element.y, "number", { min: 0 })}
          ${this.createInputGroup("Length (Width)", "prop-width", element.width, "number", { min: 1, max: 32000 })}
          ${this.createInputGroup("Thickness", "prop-thickness", element.thickness, "number", { min: 1, max: 32000 })}
        </div>
        <div class="mb-3">
          <label class="block text-xs font-medium text-slate-700 mb-1">Orientation</label>
          <select id="prop-orientation" class="w-full rounded-md border border-slate-200 py-1.5 px-2 text-xs text-slate-700 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white">
            <option value="H" ${element.orientation === "H" ? "selected" : ""}>Horizontal</option>
            <option value="V" ${element.orientation === "V" ? "selected" : ""}>Vertical</option>
          </select>
        </div>
      `, { elementType: element.type })}
    `;
  }

  /**
   * Render TEXTBLOCK element properties
   */
  renderTextBlockProperties(element) {
    return `
      ${this.renderAlignmentControls(element)}
      ${this.renderSection("Position &amp; Size", `
        <div class="grid grid-cols-2 gap-3">
          ${this.createInputGroup("X Position", "prop-x", element.x, "number", { min: 0 })}
          ${this.createInputGroup("Y Position", "prop-y", element.y, "number", { min: 0 })}
        </div>
      `, { elementType: element.type })}
      ${this.renderSection("Text Content", `
        <div class="mb-3">
          <label class="block text-xs font-medium text-slate-700 mb-1">Preview Text</label>
          <textarea id="prop-preview-text" rows="3"
            class="w-full rounded-md border border-slate-200 py-1.5 px-2 text-xs text-slate-700 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white">${element.previewText}</textarea>
        </div>
        ${this.createInputGroup("Placeholder", "prop-placeholder", element.placeholder)}
      `, { elementType: element.type })}
      ${this.renderSection("Font Settings", `
        ${this.renderFontSelect(element)}
        <div class="grid grid-cols-2 gap-3">
          ${this.createInputGroup("Font Size (Height)", "prop-font-size", element.fontSize, "number", { min: 0, max: 32000, placeholder: "Use default" })}
          ${this.createInputGroup("Font Width", "prop-font-width", element.fontWidth, "number", { min: 0, max: 32000, placeholder: "Use default" })}
        </div>
      `, { elementType: element.type })}
      ${this.renderSection("Block Configuration", `
        <div class="grid grid-cols-2 gap-3">
          ${this.createInputGroup("Block Width (dots)", "prop-block-width", element.blockWidth, "number", { min: 0, max: 32000 })}
          ${this.createInputGroup("Max Lines", "prop-max-lines", element.maxLines, "number", { min: 1, max: 9999 })}
          ${this.createInputGroup("Line Spacing", "prop-line-spacing", element.lineSpacing, "number", { min: -9999, max: 9999 })}
          ${this.createInputGroup("Hanging Indent (dots)", "prop-hanging-indent", element.hangingIndent, "number", { min: 0, max: 9999 })}
        </div>
      `, { open: true, elementType: element.type })}
      ${this.renderSection("Alignment", `
        <div class="mb-3">
          <label class="block text-xs font-medium text-slate-700 mb-1">Text Justification</label>
          <div class="flex gap-1 bg-slate-100 rounded-lg p-1 border border-slate-200">
            <button type="button" data-justification="L"
              class="flex-1 p-1 rounded-md ${element.justification === "L" ? "bg-white text-blue-600 shadow" : "text-slate-500 hover:bg-slate-200"} transition-all"
              title="Left Align">
              <span class="material-icons-round text-sm">format_align_left</span>
            </button>
            <button type="button" data-justification="C"
              class="flex-1 p-1 rounded-md ${element.justification === "C" ? "bg-white text-blue-600 shadow" : "text-slate-500 hover:bg-slate-200"} transition-all"
              title="Center Align">
              <span class="material-icons-round text-sm">format_align_center</span>
            </button>
            <button type="button" data-justification="R"
              class="flex-1 p-1 rounded-md ${element.justification === "R" ? "bg-white text-blue-600 shadow" : "text-slate-500 hover:bg-slate-200"} transition-all"
              title="Right Align">
              <span class="material-icons-round text-sm">format_align_right</span>
            </button>
            <button type="button" data-justification="J"
              class="flex-1 p-1 rounded-md ${element.justification === "J" ? "bg-white text-blue-600 shadow" : "text-slate-500 hover:bg-slate-200"} transition-all"
              title="Justified">
              <span class="material-icons-round text-sm">format_align_justify</span>
            </button>
          </div>
        </div>
      `, { open: true, elementType: element.type })}
      ${this.renderSection("Appearance", `
        <div class="flex items-center justify-between">
          <label class="text-xs text-slate-700">
            Reverse Print
            <a href="https://docs.zebra.com/us/en/printers/software/zpl-pg/c-zpl-zpl-commands/r-zpl-fr.html"
              target="_blank" class="text-blue-500 hover:underline">^FR</a>
          </label>
          <div class="flex gap-1 bg-slate-100 rounded p-1 border border-slate-200">
            <button type="button" data-reverse="N"
              class="px-3 py-1 text-xs rounded ${element.reverse ? "text-slate-500 hover:bg-slate-200" : "bg-white text-blue-600 shadow"} transition-colors">
              Normal
            </button>
            <button type="button" data-reverse="Y"
              class="px-3 py-1 text-xs rounded ${element.reverse ? "bg-white text-blue-600 shadow" : "text-slate-500 hover:bg-slate-200"} transition-colors">
              Reverse
            </button>
          </div>
        </div>
      `, { open: true, elementType: element.type })}
    `;
  }
}
