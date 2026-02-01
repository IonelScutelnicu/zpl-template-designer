// Application State
let elements = [];
let selectedElement = null;
let labelSettings = {
  width: 100, // in mm
  height: 50, // in mm
  dpmm: 8,
  printOrientation: "N", // N = normal, I = inverted
  mediaDarkness: 25, // ~SD value (0-30)
  printSpeed: 4, // ^PR value (2-14)
  slewSpeed: 4, // ^PR value (2-14)
  backfeedSpeed: 4, // ^PR value (2-14)
  fontId: "0", // ^CW font identifier
  fontFile: "", // ^CW font file name (empty = no ^CW command)
  defaultFontHeight: 20, // ^CF default font height
  homeX: 0, // ^LH x position
  homeY: 0, // ^LH y position
  labelTop: 0, // ^LT label top shift
};

// DOM Elements
const addTextBtn = document.getElementById("add-text-btn");
const addBarcodeBtn = document.getElementById("add-barcode-btn");
const addQRCodeBtn = document.getElementById("add-qrcode-btn");
const addBoxBtn = document.getElementById("add-box-btn");
const addTextBlockBtn = document.getElementById("add-textblock-btn");
const addLineBtn = document.getElementById("add-line-btn");
const elementsList = document.getElementById("elements-list");
const propertiesPanel = document.getElementById("properties-panel");
const zplOutput = document.getElementById("zpl-output");
const copyBtn = document.getElementById("copy-btn");
const exportBtn = document.getElementById("export-btn");
const importBtn = document.getElementById("import-btn");
const importFile = document.getElementById("import-file");
const labelWidth = document.getElementById("label-width");
const labelHeight = document.getElementById("label-height");
const labelDpmm = document.getElementById("label-dpmm");
const homeX = document.getElementById("home-x");
const homeY = document.getElementById("home-y");
const labelTop = document.getElementById("label-top");
const printOrientation = document.getElementById("print-orientation");
const mediaDarkness = document.getElementById("media-darkness");
const printSpeed = document.getElementById("print-speed");
const slewSpeed = document.getElementById("slew-speed");
const backfeedSpeed = document.getElementById("backfeed-speed");
const fontId = document.getElementById("font-id");
const fontFile = document.getElementById("font-file");
const defaultFontHeight = document.getElementById("default-font-height");
const previewImage = document.getElementById("preview-image");
const previewLoading = document.getElementById("preview-loading");
const previewError = document.getElementById("preview-error");
const previewPlaceholder = document.getElementById("preview-placeholder");
const refreshPreviewBtn = document.getElementById("refresh-preview-btn");
const togglePreviewModeBtn = null; // Deprecated
const modeCanvasBtn = document.getElementById("mode-canvas-btn");
const modeApiBtn = document.getElementById("mode-api-btn");
const labelCanvas = document.getElementById("label-canvas");
const apiPreviewContainer = document.getElementById("api-preview-container");

// Canvas and interaction state
let canvasRenderer = null;
let interactionHandler = null;
let previewMode = 'canvas'; // 'canvas' or 'api'

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  // Initialize canvas renderer
  canvasRenderer = new CanvasRenderer('label-canvas');

  // Initialize interaction handler
  interactionHandler = new InteractionHandler(canvasRenderer, elements, labelSettings, {
    onElementSelected: (element) => {
      selectedElement = element;
      updateElementsList();
      renderPropertiesPanel();
      renderCanvasPreview();
    },
    onElementDragging: (element) => {
      // Update canvas in real-time during drag
      renderCanvasPreview();
      // Update properties panel X/Y inputs if properties panel is showing this element
      if (selectedElement && selectedElement.id === element.id) {
        const propX = document.getElementById('prop-x');
        const propY = document.getElementById('prop-y');
        if (propX) propX.value = element.x;
        if (propY) propY.value = element.y;

        // Update size properties if they exist (for resizing)
        if (element.type === 'TEXTBLOCK') {
          const propBlockWidth = document.getElementById('prop-block-width');
          const propMaxLines = document.getElementById('prop-max-lines');
          if (propBlockWidth) propBlockWidth.value = element.blockWidth;
          if (propMaxLines) propMaxLines.value = element.maxLines;
        } else if (element.type === 'BOX') {
          const propWidth = document.getElementById('prop-width');
          const propHeight = document.getElementById('prop-height');
          if (propWidth) propWidth.value = element.width;
          if (propHeight) propHeight.value = element.height;
        }
      }
    },
    onElementDragEnd: (element) => {
      // Finalize drag - update ZPL output
      updateZPLOutput();
      renderCanvasPreview();
      renderPropertiesPanel();
    },
    onElementMoved: (element) => {
      // Keyboard nudge - update everything
      updateZPLOutput();
      renderCanvasPreview();
      renderPropertiesPanel();
    },
    onElementDeleted: (element) => {
      if (previewMode === 'canvas') {
        const idStr = String(element.id);
        deleteElement(idStr);
      }
    },
    getSelectedElement: () => selectedElement
  });

  // Add button event listeners
  addTextBtn.addEventListener("click", addTextElement);
  addBarcodeBtn.addEventListener("click", addBarcodeElement);
  addQRCodeBtn.addEventListener("click", addQRCodeElement);
  addBoxBtn.addEventListener("click", addBoxElement);
  addTextBlockBtn.addEventListener("click", addTextBlockElement);
  addLineBtn.addEventListener("click", addLineElement);
  copyBtn.addEventListener("click", copyZPL);
  refreshPreviewBtn.addEventListener("click", updatePreview);
  // Mode switching
  modeCanvasBtn.addEventListener("click", () => setPreviewMode('canvas'));
  modeApiBtn.addEventListener("click", () => setPreviewMode('api'));
  exportBtn.addEventListener("click", exportTemplate);
  importBtn.addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", handleFileImport);

  // Label settings event listeners
  labelWidth.addEventListener("input", (e) => {
    labelSettings.width = parseFloat(e.target.value) || 100;
    updateZPLOutput();
    renderCanvasPreview();
  });

  labelHeight.addEventListener("input", (e) => {
    labelSettings.height = parseFloat(e.target.value) || 50;
    renderCanvasPreview();
  });

  labelDpmm.addEventListener("change", (e) => {
    labelSettings.dpmm = parseInt(e.target.value) || 8;
    updateZPLOutput();
    renderCanvasPreview();
  });

  printOrientation.addEventListener("change", (e) => {
    labelSettings.printOrientation = e.target.value || "N";
    updateZPLOutput();
    renderCanvasPreview();
  });

  mediaDarkness.addEventListener("input", (e) => {
    labelSettings.mediaDarkness = parseInt(e.target.value) || 25;
    updateZPLOutput();
  });

  printSpeed.addEventListener("input", (e) => {
    labelSettings.printSpeed = parseInt(e.target.value) || 4;
    updateZPLOutput();
  });

  slewSpeed.addEventListener("input", (e) => {
    labelSettings.slewSpeed = parseInt(e.target.value) || 4;
    updateZPLOutput();
  });

  backfeedSpeed.addEventListener("input", (e) => {
    labelSettings.backfeedSpeed = parseInt(e.target.value) || 4;
    updateZPLOutput();
  });

  // Font settings event listeners
  fontId.addEventListener("input", (e) => {
    labelSettings.fontId = e.target.value || "0";
    updateZPLOutput();
  });

  fontFile.addEventListener("input", (e) => {
    labelSettings.fontFile = e.target.value;
    updateZPLOutput();
  });

  defaultFontHeight.addEventListener("input", (e) => {
    labelSettings.defaultFontHeight = parseInt(e.target.value) || 20;
    updateZPLOutput();
  });

  // Position offset event listeners
  homeX.addEventListener("input", (e) => {
    labelSettings.homeX = parseInt(e.target.value) || 0;
    updateZPLOutput();
    renderCanvasPreview();
  });

  homeY.addEventListener("input", (e) => {
    labelSettings.homeY = parseInt(e.target.value) || 0;
    updateZPLOutput();
    renderCanvasPreview();
  });

  labelTop.addEventListener("input", (e) => {
    labelSettings.labelTop = parseInt(e.target.value) || 0;
    updateZPLOutput();
    renderCanvasPreview();
  });

  // Set up event delegation for elements list (only once)
  elementsList.addEventListener("click", (e) => {
    // Check if delete button was clicked (either directly or as closest parent)
    const deleteBtn = e.target.closest(".delete-btn");
    if (deleteBtn || e.target.classList.contains("delete-btn")) {
      e.stopPropagation();
      e.preventDefault();
      const btn = deleteBtn || e.target;
      const idStr = btn.getAttribute("data-id");
      if (idStr) {
        deleteElement(idStr);
      }
      return;
    }

    // Check if move up button was clicked
    const moveUpBtn = e.target.closest(".move-up-btn");
    if (moveUpBtn) {
      e.stopPropagation();
      e.preventDefault();
      const index = parseInt(moveUpBtn.getAttribute("data-index"));
      if (!isNaN(index) && index > 0) {
        moveElementUp(index);
      }
      return;
    }

    // Check if move down button was clicked
    const moveDownBtn = e.target.closest(".move-down-btn");
    if (moveDownBtn) {
      e.stopPropagation();
      e.preventDefault();
      const index = parseInt(moveDownBtn.getAttribute("data-index"));
      if (!isNaN(index) && index < elements.length - 1) {
        moveElementDown(index);
      }
      return;
    }

    // Check if element item was clicked (but not the delete button or reorder buttons)
    const elementItem = e.target.closest(".element-item");
    if (elementItem) {
      const idStr = elementItem.getAttribute("data-id");
      if (idStr) {
        // Find element by comparing string representations of IDs
        selectedElement = elements.find((el) => String(el.id) === idStr);
        if (selectedElement) {
          updateElementsList();
          renderPropertiesPanel();
          renderCanvasPreview();
          if (previewMode === 'api') {
            updatePreview(); // Auto-refresh preview to show debug highlight
          }
        }
      }
    }
  });

  // Initialize functionality
  setPreviewMode('canvas');

  updateZPLOutput();
  renderCanvasPreview();
});

// Render Canvas Preview
function renderCanvasPreview() {
  if (!canvasRenderer) return;
  canvasRenderer.renderCanvas(elements, labelSettings, selectedElement);
}

// Set Preview Mode
function setPreviewMode(mode) {
  previewMode = mode;

  // Reset button styles
  const activeClass = ["bg-white", "text-slate-700", "shadow-sm"];
  const inactiveClass = ["text-slate-500", "hover:text-slate-700"];

  if (mode === 'canvas') {
    // UI Logic
    labelCanvas.classList.remove('hidden');
    apiPreviewContainer.classList.add('hidden');

    // Update buttons
    modeCanvasBtn.classList.add(...activeClass);
    modeCanvasBtn.classList.remove(...inactiveClass);
    modeApiBtn.classList.remove(...activeClass);
    modeApiBtn.classList.add(...inactiveClass);

    // Disable refresh
    refreshPreviewBtn.disabled = true;

    renderCanvasPreview();
  } else {
    // API Mode
    labelCanvas.classList.add('hidden');
    apiPreviewContainer.classList.remove('hidden');

    // Update buttons
    modeApiBtn.classList.add(...activeClass);
    modeApiBtn.classList.remove(...inactiveClass);
    modeCanvasBtn.classList.remove(...activeClass);
    modeCanvasBtn.classList.add(...inactiveClass);

    // Enable refresh
    refreshPreviewBtn.disabled = false;

    updatePreview(); // Auto-refresh API preview
  }
}

// Add Text Element
function addTextElement() {
  const textElement = new TextElement(50, 50, "Sample Text", 30, 30, "", "", "N");
  elements.push(textElement);
  selectedElement = textElement;
  interactionHandler.updateElements(elements);
  updateElementsList();
  renderPropertiesPanel();
  updateZPLOutput();
  renderCanvasPreview();
}

// Add Barcode Element
function addBarcodeElement() {
  const barcodeElement = new BarcodeElement(50, 100, "1234567890", 50, 2, 2.0);
  elements.push(barcodeElement);
  selectedElement = barcodeElement;
  interactionHandler.updateElements(elements);
  updateElementsList();
  renderPropertiesPanel();
  updateZPLOutput();
  renderCanvasPreview();
}

// Add QR Code Element
function addQRCodeElement() {
  const qrcodeElement = new QRCodeElement(50, 150, "https://example.com", 2, 5, "Q");
  elements.push(qrcodeElement);
  selectedElement = qrcodeElement;
  interactionHandler.updateElements(elements);
  updateElementsList();
  renderPropertiesPanel();
  updateZPLOutput();
  renderCanvasPreview();
}

// Add Box Element
function addBoxElement() {
  const boxElement = new BoxElement(50, 150, 100, 50, 3, "B", 0);
  elements.push(boxElement);
  selectedElement = boxElement;
  interactionHandler.updateElements(elements);
  updateElementsList();
  renderPropertiesPanel();
  updateZPLOutput();
  renderCanvasPreview();
}

// Add Text Block Element
function addTextBlockElement() {
  const textBlockElement = new TextBlockElement(50, 200, "Sample text that can wrap across multiple lines", 30, 30, 200, 3, 0, "L", 0);
  elements.push(textBlockElement);
  selectedElement = textBlockElement;
  interactionHandler.updateElements(elements);
  updateElementsList();
  renderPropertiesPanel();
  updateZPLOutput();
  renderCanvasPreview();
}

// Add Line Element
function addLineElement() {
  const lineElement = new LineElement(50, 250, 200, 3, "H");
  elements.push(lineElement);
  selectedElement = lineElement;
  interactionHandler.updateElements(elements);
  updateElementsList();
  renderPropertiesPanel();
  updateZPLOutput();
  renderCanvasPreview();
}

// Update Elements List
function updateElementsList() {
  if (elements.length === 0) {
    elementsList.innerHTML = '<p class="text-center text-slate-400 py-8 italic text-xs">No elements added yet</p>';
    return;
  }

  elementsList.innerHTML = elements
    .map((element, index) => {
      const isActive =
        selectedElement && String(selectedElement.id) === String(element.id);

      const activeClasses = isActive
        ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
        : "border-slate-200 hover:border-blue-300 hover:shadow-sm bg-white";

      const isFirst = index === 0;
      const isLast = index === elements.length - 1;

      return `
            <div class="element-item group relative flex justify-between items-center p-2.5 mb-1.5 rounded-md border transition-all cursor-pointer ${activeClasses}" data-id="${element.id}" data-index="${index}">
                <div class="flex-1 min-w-0 pr-2">
                    <div class="flex items-center gap-2">
                        <span class="inline-flex items-center justify-center px-1.5 py-0.5 rounded-[3px] text-[10px] font-bold uppercase tracking-wide bg-blue-100 text-blue-800">
                          ${element.type}
                        </span>
                    </div>
                    <div class="text-xs text-slate-600 mt-1 truncate font-medium">${element.getDisplayName()}</div>
                </div>
                <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button class="reorder-btn move-up-btn p-0.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Move Up" data-id="${element.id}" data-index="${index}" ${isFirst ? 'disabled' : ''}>
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7" />
                        </svg>
                    </button>
                    <button class="reorder-btn move-down-btn p-0.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Move Down" data-id="${element.id}" data-index="${index}" ${isLast ? 'disabled' : ''}>
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                    <div class="w-px h-4 bg-slate-300 mx-0.5"></div>
                    <button class="delete-btn p-1 text-red-500 hover:bg-red-50 rounded" title="Delete" data-id="${element.id}">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                </div>
            </div>
        `;
    })
    .join("");
}

// Delete Element
function deleteElement(id) {
  // Convert id to string for reliable comparison
  const idStr = String(id);
  // Filter out the element with matching ID (compare as strings)
  elements = elements.filter((el) => String(el.id) !== idStr);
  if (selectedElement && String(selectedElement.id) === idStr) {
    selectedElement = null;
  }
  interactionHandler.updateElements(elements);
  updateElementsList();
  renderPropertiesPanel();
  updateZPLOutput();
  renderCanvasPreview();
}

// Move Element Up
function moveElementUp(index) {
  if (index <= 0 || index >= elements.length) return;

  // Swap with the element above
  const temp = elements[index];
  elements[index] = elements[index - 1];
  elements[index - 1] = temp;

  // Add animation class to visually indicate movement
  interactionHandler.updateElements(elements);
  updateElementsList();
  updateZPLOutput();
  renderCanvasPreview();
}

// Move Element Down
function moveElementDown(index) {
  if (index < 0 || index >= elements.length - 1) return;

  // Swap with the element below
  const temp = elements[index];
  elements[index] = elements[index + 1];
  elements[index + 1] = temp;

  interactionHandler.updateElements(elements);
  updateElementsList();
  updateZPLOutput();
  renderCanvasPreview();
}

// Helper to generate input HTML
function createInputGroup(label, id, value, type = "text", options = {}) {
  const { min, max, step } = options;
  const attributes = [
    min !== undefined ? `min="${min}"` : "",
    max !== undefined ? `max="${max}"` : "",
    step !== undefined ? `step="${step}"` : "",
  ].join(" ");

  return `
    <div class="mb-3">
        <label class="block text-xs font-medium text-slate-700 mb-1">${label}</label>
        <input 
            type="${type}" 
            id="${id}" 
            value="${value}" 
            ${attributes}
            class="w-full rounded border-slate-300 py-1.5 px-2 text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white"
        >
    </div>
  `;
}

// Render Properties Panel
function renderPropertiesPanel() {
  if (!selectedElement) {
    propertiesPanel.innerHTML =
      '<p class="text-center text-slate-400 py-12 italic text-sm">Select an element to edit properties</p>';
    return;
  }

  // Common wrapper with fade-in effect
  let content = '';

  if (selectedElement.type === "TEXT") {
    content = renderTextPropertiesHTML(selectedElement);
  } else if (selectedElement.type === "BARCODE") {
    content = renderBarcodePropertiesHTML(selectedElement);
  } else if (selectedElement.type === "BOX") {
    content = renderBoxPropertiesHTML(selectedElement);
  } else if (selectedElement.type === "TEXTBLOCK") {
    content = renderTextBlockPropertiesHTML(selectedElement);
  } else if (selectedElement.type === "QRCODE") {
    content = renderQRCodePropertiesHTML(selectedElement);
  } else if (selectedElement.type === "LINE") {
    content = renderLinePropertiesHTML(selectedElement);
  }

  propertiesPanel.innerHTML = `<div class="animate-fade-in">${content}</div>`;
  attachPropertyListeners(selectedElement);
}

function renderTextPropertiesHTML(element) {
  return `
        ${createInputGroup("X Position", "prop-x", element.x, "number", { min: 0 })}
        ${createInputGroup("Y Position", "prop-y", element.y, "number", { min: 0 })}
        ${createInputGroup("Placeholder", "prop-placeholder", element.placeholder)}
        ${createInputGroup("Preview Text", "prop-preview-text", element.previewText)}
        <div class="mb-3">
            <label class="block text-xs font-medium text-slate-700 mb-1">Font ID (override)</label>
            <input type="text" id="prop-font-id" value="${element.fontId}" maxlength="1" placeholder="Use label default"
                class="w-full rounded border-slate-300 py-1.5 px-2 text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white">
        </div>
        ${createInputGroup("Font Size (Height)", "prop-font-size", element.fontSize, "number", { min: 1, max: 32000 })}
        ${createInputGroup("Font Width", "prop-font-width", element.fontWidth, "number", { min: 1, max: 32000 })}
        <div class="mb-3">
            <label class="block text-xs font-medium text-slate-700 mb-1">Reverse Print (^FR)</label>
            <select id="prop-reverse" class="w-full rounded border-slate-300 py-1.5 px-2 text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white">
                <option value="N" ${element.reverse ? "" : "selected"}>Normal (N)</option>
                <option value="Y" ${element.reverse ? "selected" : ""}>Reverse (Y)</option>
            </select>
        </div>
        <div class="mb-3">
            <label class="block text-xs font-medium text-slate-700 mb-1">Orientation</label>
            <select id="prop-orientation" class="w-full rounded border-slate-300 py-1.5 px-2 text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white">
                <option value="N" ${element.orientation === "N" ? "selected" : ""}>Normal (N)</option>
                <option value="R" ${element.orientation === "R" ? "selected" : ""}>Rotated 90° (R)</option>
                <option value="I" ${element.orientation === "I" ? "selected" : ""}>Inverted 180° (I)</option>
                <option value="B" ${element.orientation === "B" ? "selected" : ""}>Bottom-Up 270° (B)</option>
            </select>
        </div>
    `;
}

function renderBarcodePropertiesHTML(element) {
  return `
        ${createInputGroup("X Position", "prop-x", element.x, "number", { min: 0 })}
        ${createInputGroup("Y Position", "prop-y", element.y, "number", { min: 0 })}
        ${createInputGroup("Placeholder", "prop-placeholder", element.placeholder)}
        ${createInputGroup("Preview Data", "prop-preview-data", element.previewData)}
        ${createInputGroup("Height", "prop-height", element.height, "number", { min: 1, max: 1000 })}
        ${createInputGroup("Width Multiplier", "prop-width", element.width, "number", { min: 1, max: 10, step: 0.1 })}
        ${createInputGroup("Ratio", "prop-ratio", element.ratio, "number", { min: 1, max: 10, step: 0.1 })}
        <div class="mb-3">
            <label class="block text-xs font-medium text-slate-700 mb-1">Print Interpretation Line</label>
            <select id="prop-show-text" class="w-full rounded border-slate-300 py-1.5 px-2 text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white">
                <option value="Y" ${element.showText === true ? "selected" : ""}>Yes (Show)</option>
                <option value="N" ${element.showText === false ? "selected" : ""}>No (Hide)</option>
            </select>
        </div>
    `;
}

function renderLinePropertiesHTML(element) {
  return `
        ${createInputGroup("X Position", "prop-x", element.x, "number", { min: 0 })}
        ${createInputGroup("Y Position", "prop-y", element.y, "number", { min: 0 })}
        ${createInputGroup("Length (Width)", "prop-width", element.width, "number", { min: 1, max: 32000 })}
        ${createInputGroup("Thickness", "prop-thickness", element.thickness, "number", { min: 1, max: 32000 })}
        <div class="mb-3">
            <label class="block text-xs font-medium text-slate-700 mb-1">Orientation</label>
            <select id="prop-orientation" class="w-full rounded border-slate-300 py-1.5 px-2 text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white">
                <option value="H" ${element.orientation === "H" ? "selected" : ""}>Horizontal</option>
                <option value="V" ${element.orientation === "V" ? "selected" : ""}>Vertical</option>
            </select>
        </div>
    `;
}

function renderBoxPropertiesHTML(element) {
  return `
        ${createInputGroup("X Position", "prop-x", element.x, "number", { min: 0 })}
        ${createInputGroup("Y Position", "prop-y", element.y, "number", { min: 0 })}
        ${createInputGroup("Width", "prop-width", element.width, "number", { min: 1, max: 32000 })}
        ${createInputGroup("Height", "prop-height", element.height, "number", { min: 1, max: 32000 })}
        ${createInputGroup("Thickness", "prop-thickness", element.thickness, "number", { min: 1, max: 32000 })}
        <div class="mb-3">
            <label class="block text-xs font-medium text-slate-700 mb-1">Color</label>
            <select id="prop-color" class="w-full rounded border-slate-300 py-1.5 px-2 text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white">
                <option value="B" ${element.color === "B" ? "selected" : ""}>Black</option>
                <option value="W" ${element.color === "W" ? "selected" : ""}>White</option>
            </select>
        </div>
        ${createInputGroup("Rounding", "prop-rounding", element.rounding, "number", { min: 0, max: 32000 })}
    `;
}

function renderTextBlockPropertiesHTML(element) {
  return `
        ${createInputGroup("X Position", "prop-x", element.x, "number", { min: 0 })}
        ${createInputGroup("Y Position", "prop-y", element.y, "number", { min: 0 })}
        ${createInputGroup("Placeholder", "prop-placeholder", element.placeholder)}
        <div class="mb-3">
            <label class="block text-xs font-medium text-slate-700 mb-1">Preview Text</label>
            <textarea
                id="prop-preview-text"
                rows="3"
                class="w-full rounded border-slate-300 py-1.5 px-2 text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >${element.previewText}</textarea>
        </div>
        <div class="mb-3">
            <label class="block text-xs font-medium text-slate-700 mb-1">Font ID (override)</label>
            <input type="text" id="prop-font-id" value="${element.fontId}" maxlength="1" placeholder="Use label default"
                class="w-full rounded border-slate-300 py-1.5 px-2 text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white">
        </div>
        ${createInputGroup("Font Size (Height)", "prop-font-size", element.fontSize, "number", { min: 1, max: 32000 })}
        ${createInputGroup("Font Width", "prop-font-width", element.fontWidth, "number", { min: 1, max: 32000 })}
        ${createInputGroup("Block Width (dots)", "prop-block-width", element.blockWidth, "number", { min: 0, max: 32000 })}
        ${createInputGroup("Max Lines", "prop-max-lines", element.maxLines, "number", { min: 1, max: 9999 })}
        ${createInputGroup("Line Spacing", "prop-line-spacing", element.lineSpacing, "number", { min: -9999, max: 9999 })}
        <div class="mb-3">
            <label class="block text-xs font-medium text-slate-700 mb-1">Text Justification</label>
            <select id="prop-justification" class="w-full rounded border-slate-300 py-1.5 px-2 text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white">
                <option value="L" ${element.justification === "L" ? "selected" : ""}>Left</option>
                <option value="C" ${element.justification === "C" ? "selected" : ""}>Center</option>
                <option value="R" ${element.justification === "R" ? "selected" : ""}>Right</option>
                <option value="J" ${element.justification === "J" ? "selected" : ""}>Justified</option>
            </select>
        </div>
        <div class="mb-3">
            <label class="block text-xs font-medium text-slate-700 mb-1">Reverse Print (^FR)</label>
            <select id="prop-reverse" class="w-full rounded border-slate-300 py-1.5 px-2 text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white">
                <option value="N" ${element.reverse ? "" : "selected"}>Normal (N)</option>
                <option value="Y" ${element.reverse ? "selected" : ""}>Reverse (Y)</option>
            </select>
        </div>
        ${createInputGroup("Hanging Indent (dots)", "prop-hanging-indent", element.hangingIndent, "number", { min: 0, max: 9999 })}
    `;
}

function renderQRCodePropertiesHTML(element) {
  return `
        ${createInputGroup("X Position", "prop-x", element.x, "number", { min: 0 })}
        ${createInputGroup("Y Position", "prop-y", element.y, "number", { min: 0 })}
        ${createInputGroup("Placeholder", "prop-placeholder", element.placeholder)}
        <div class="mb-3">
            <label class="block text-xs font-medium text-slate-700 mb-1">Preview Data</label>
            <textarea
                id="prop-preview-data"
                rows="2"
                class="w-full rounded border-slate-300 py-1.5 px-2 text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >${element.previewData}</textarea>
        </div>
        <div class="mb-3">
            <label class="block text-xs font-medium text-slate-700 mb-1">Model</label>
            <select id="prop-model" class="w-full rounded border-slate-300 py-1.5 px-2 text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white">
                <option value="1" ${element.model === 1 ? "selected" : ""}>Model 1 (Original)</option>
                <option value="2" ${element.model === 2 ? "selected" : ""}>Model 2 (Enhanced)</option>
            </select>
        </div>
        ${createInputGroup("Magnification", "prop-magnification", element.magnification, "number", { min: 1, max: 10 })}
        <div class="mb-3">
            <label class="block text-xs font-medium text-slate-700 mb-1">Error Correction</label>
            <select id="prop-error-correction" class="w-full rounded border-slate-300 py-1.5 px-2 text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white">
                <option value="H" ${element.errorCorrection === "H" ? "selected" : ""}>H - Ultra-High (30%)</option>
                <option value="Q" ${element.errorCorrection === "Q" ? "selected" : ""}>Q - Quality (25%)</option>
                <option value="M" ${element.errorCorrection === "M" ? "selected" : ""}>M - Medium (15%)</option>
                <option value="L" ${element.errorCorrection === "L" ? "selected" : ""}>L - Low (7%)</option>
            </select>
        </div>
    `;
}

function attachPropertyListeners(element) {
  // Common interactions
  const attach = (id, field, parser = (v) => v) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', (e) => {
      element[field] = parser(e.target.value);
      updateZPLOutput();
      updateElementsList(); // Update list to refect changes (like display name)
      renderCanvasPreview(); // Update canvas to reflect changes
    });
  };

  attach("prop-x", "x", (v) => parseInt(v) || 0);
  attach("prop-y", "y", (v) => parseInt(v) || 0);

  if (element.type === "TEXT") {
    attach("prop-placeholder", "placeholder");
    attach("prop-preview-text", "previewText");
    attach("prop-font-id", "fontId");
    attach("prop-font-size", "fontSize", (v) => parseInt(v) || 30);
    attach("prop-font-width", "fontWidth", (v) => parseInt(v) || 30);
    attach("prop-reverse", "reverse", (v) => v === "Y");
    attach("prop-orientation", "orientation");
  } else if (element.type === "BARCODE") {
    attach("prop-placeholder", "placeholder");
    attach("prop-preview-data", "previewData");
    attach("prop-height", "height", (v) => parseInt(v) || 50);
    attach("prop-width", "width", (v) => parseFloat(v) || 2);
    attach("prop-ratio", "ratio", (v) => parseFloat(v) || 2.0);

    // Handle show text select
    attach("prop-show-text", "showText", (v) => v === "Y");
  } else if (element.type === "BOX") {
    attach("prop-width", "width", (v) => parseInt(v) || 100);
    attach("prop-height", "height", (v) => parseInt(v) || 50);
    attach("prop-thickness", "thickness", (v) => parseInt(v) || 3);
    attach("prop-color", "color");
    attach("prop-rounding", "rounding", (v) => parseInt(v) || 0);
  } else if (element.type === "TEXTBLOCK") {
    attach("prop-placeholder", "placeholder");
    attach("prop-preview-text", "previewText");
    attach("prop-font-id", "fontId");
    attach("prop-font-size", "fontSize", (v) => parseInt(v) || 30);
    attach("prop-font-width", "fontWidth", (v) => parseInt(v) || 30);
    attach("prop-block-width", "blockWidth", (v) => parseInt(v) || 200);
    attach("prop-max-lines", "maxLines", (v) => parseInt(v) || 1);
    attach("prop-line-spacing", "lineSpacing", (v) => parseInt(v) || 0);
    attach("prop-justification", "justification");
    attach("prop-reverse", "reverse", (v) => v === "Y");
    attach("prop-hanging-indent", "hangingIndent", (v) => parseInt(v) || 0);
  } else if (element.type === "QRCODE") {
    attach("prop-placeholder", "placeholder");
    attach("prop-preview-data", "previewData");
    attach("prop-model", "model", (v) => parseInt(v) || 2);
    attach("prop-magnification", "magnification", (v) => parseInt(v) || 5);
    attach("prop-error-correction", "errorCorrection");
  } else if (element.type === "LINE") {
    attach("prop-width", "width", (v) => parseInt(v) || 100);
    attach("prop-thickness", "thickness", (v) => parseInt(v) || 3);
    attach("prop-orientation", "orientation");
  }
}


// Update ZPL Output
function updateZPLOutput() {
  if (elements.length === 0) {
    zplOutput.value = "";
    return;
  }

  // Build ZPL with settings commands
  const { width, dpmm, homeX: hx, homeY: hy, labelTop: lt, printOrientation: po, mediaDarkness: md, printSpeed: ps, slewSpeed: ss, backfeedSpeed: bs, fontId: fid, fontFile: ffile, defaultFontHeight: dfh } = labelSettings;

  // Calculate print width in dots (width in mm × dpmm)
  const printWidthDots = Math.round(width * dpmm);

  let zplHeader = "^XA\n";

  // Add print width command
  zplHeader += `^PW${printWidthDots}\n`;

  // Add print speed command
  zplHeader += `^PR${ps},${ss},${bs}\n`;

  // Add print orientation command
  zplHeader += `^PO${po}\n`;

  // Add media darkness command
  zplHeader += `~SD${md}\n`;

  // Add position offset commands
  zplHeader += `^LH${hx},${hy}\n`;
  zplHeader += `^LT${lt}\n`;

  zplHeader += `^CI28\n`;
  zplHeader += `^MTT\n`;

  // Add font configuration commands (only include ^CW if font file is set)
  if (ffile && ffile.trim() !== '') {
    zplHeader += `^CW${fid},${ffile}\n`;
  }
  zplHeader += `^CF${fid},${dfh}\n`;

  const zplCommands = elements.map((element) => element.render(fid)).join("\n");
  zplOutput.value = `${zplHeader}${zplCommands}\n^XZ`;
}

// Update Preview using Labelary API
async function updatePreview() {
  // Reset states
  previewImage.classList.add('hidden');
  previewError.classList.add('hidden');
  previewPlaceholder.classList.add('hidden');

  if (elements.length === 0) {
    previewPlaceholder.classList.remove('hidden');
    return;
  }

  // Generate preview ZPL using renderPreview() method
  const { width, height, dpmm, homeX: hx, homeY: hy, labelTop: lt, printOrientation: po, mediaDarkness: md, printSpeed: ps, slewSpeed: ss, backfeedSpeed: bs, fontId: fid, fontFile: ffile, defaultFontHeight: dfh } = labelSettings;

  // Calculate print width in dots (width in mm × dpmm)
  const printWidthDots = Math.round(width * dpmm);

  let zplHeader = "^XA\n";
  zplHeader += `^PW${printWidthDots}\n`;
  zplHeader += `^PR${ps},${ss},${bs}\n`;
  zplHeader += `^PO${po}\n`;
  zplHeader += `~SD${md}\n`;
  zplHeader += `^LH${hx},${hy}\n`;
  zplHeader += `^LT${lt}\n`;
  zplHeader += `^CI28\n`;
  zplHeader += `^MTT\n`;
  if (ffile && ffile.trim() !== '') {
    zplHeader += `^CW${fid},${ffile}\n`;
  }
  zplHeader += `^CF${fid},${dfh}\n`;

  const zplCommands = elements.map((element) => {
    let cmd = element.renderPreview(fid);

    // Add debug highlight box for selected TEXT or TEXTBLOCK elements
    // if (selectedElement && String(element.id) === String(selectedElement.id) &&
    //   (element.type === "TEXT" || element.type === "TEXTBLOCK")) {
    //   // Calculate element dimensions
    //   let boxWidth, boxHeight;

    //   if (element.type === "TEXTBLOCK") {
    //     // TEXTBLOCK uses the defined blockWidth
    //     boxWidth = element.blockWidth || 200;
    //     boxHeight = (element.fontSize || 30) * (element.maxLines || 1);
    //   } else {
    //     // TEXT: estimate width based on text length and font
    //     const text = element.previewText || '';
    //     boxWidth = Math.max(text.length * (element.fontWidth || 30) * 0.6, 50);
    //     boxHeight = (element.fontSize || 30);
    //   }

    //   // Add a highlight box around the element
    //   const padding = 5;
    //   const highlightBox = `^FO${Math.max(0, element.x - padding)},${Math.max(0, element.y - padding)}^GB${boxWidth + padding * 2},${boxHeight + padding * 2},1,B^FS`;
    //   cmd = highlightBox + "\n" + cmd;
    // }

    return cmd;
  }).join("\n");
  const previewZpl = `${zplHeader}${zplCommands}\n^XZ`;

  // Show loading indicator
  previewLoading.classList.remove('hidden');

  try {
    // Convert mm to inches for the API (1 inch = 25.4 mm)
    const widthInches = width / 25.4;
    const heightInches = height / 25.4;
    const url = `https://api.labelary.com/v1/printers/${dpmm}dpmm/labels/${widthInches}x${heightInches}/0/`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: previewZpl,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const blob = await response.blob();
    const imageUrl = URL.createObjectURL(blob);

    previewImage.src = imageUrl;
    previewImage.classList.remove('hidden');
    previewImage.onload = () => {
      // Clean up old object URL
      URL.revokeObjectURL(imageUrl);
    };

  } catch (error) {
    console.error("Preview error:", error);
    previewError.textContent = `Error loading preview: ${error.message}`;
    previewError.classList.remove('hidden');
  } finally {
    previewLoading.classList.add('hidden');
  }
}

// Copy ZPL to Clipboard
function copyZPL() {
  zplOutput.select();
  zplOutput.setSelectionRange(0, 99999); // For mobile devices
  document.execCommand("copy");

  // Visual feedback
  const originalText = copyBtn.textContent;
  const originalClasses = copyBtn.className;

  copyBtn.textContent = "Copied!";
  copyBtn.classList.remove('bg-slate-800', 'hover:bg-slate-700');
  copyBtn.classList.add('bg-green-600', 'hover:bg-green-700');

  setTimeout(() => {
    copyBtn.textContent = originalText;
    copyBtn.className = originalClasses;
  }, 2000);
}

// Export Template to JSON
function exportTemplate() {
  const template = {
    version: "1.0",
    labelSettings: labelSettings,
    elements: elements.map((element) => {
      const elementData = {
        type: element.type,
        x: element.x,
        y: element.y,
      };

      if (element.type === "TEXT") {
        elementData.placeholder = element.placeholder;
        elementData.previewText = element.previewText;
        elementData.fontId = element.fontId;
        elementData.fontSize = element.fontSize;
        elementData.fontWidth = element.fontWidth;
        elementData.orientation = element.orientation;
        elementData.reverse = element.reverse;
      } else if (element.type === "BARCODE") {
        elementData.placeholder = element.placeholder;
        elementData.previewData = element.previewData;
        elementData.height = element.height;
        elementData.width = element.width;
        elementData.ratio = element.ratio;
        elementData.showText = element.showText;
      } else if (element.type === "BOX") {
        elementData.width = element.width;
        elementData.height = element.height;
        elementData.thickness = element.thickness;
        elementData.color = element.color;
        elementData.rounding = element.rounding;
      } else if (element.type === "TEXTBLOCK") {
        elementData.placeholder = element.placeholder;
        elementData.previewText = element.previewText;
        elementData.fontId = element.fontId;
        elementData.fontSize = element.fontSize;
        elementData.fontWidth = element.fontWidth;
        elementData.blockWidth = element.blockWidth;
        elementData.maxLines = element.maxLines;
        elementData.lineSpacing = element.lineSpacing;
        elementData.justification = element.justification;
        elementData.hangingIndent = element.hangingIndent;
        elementData.reverse = element.reverse;
      } else if (element.type === "QRCODE") {
        elementData.placeholder = element.placeholder;
        elementData.previewData = element.previewData;
        elementData.model = element.model;
        elementData.magnification = element.magnification;
        elementData.errorCorrection = element.errorCorrection;
      } else if (element.type === "LINE") {
        elementData.width = element.width;
        elementData.thickness = element.thickness;
        elementData.orientation = element.orientation;
      }

      return elementData;
    }),
  };

  const json = JSON.stringify(template, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "zpl-template.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Handle File Import
function handleFileImport(event) {
  const file = event.target.files[0];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const template = JSON.parse(e.target.result);
      importTemplate(template);
    } catch (error) {
      alert("Error importing template: " + error.message);
    }
  };
  reader.readAsText(file);

  // Reset file input so the same file can be imported again
  event.target.value = "";
}

// Import Template from JSON
function importTemplate(template) {
  // Validate template structure
  if (!template.elements || !Array.isArray(template.elements)) {
    alert("Invalid template format: missing elements array");
    return;
  }

  if (!template.labelSettings) {
    alert("Invalid template format: missing label settings");
    return;
  }

  // Clear current elements
  elements = [];
  selectedElement = null;

  // Import label settings
  if (template.labelSettings.width !== undefined) {
    labelSettings.width = template.labelSettings.width;
    labelWidth.value = labelSettings.width;
  }
  if (template.labelSettings.height !== undefined) {
    labelSettings.height = template.labelSettings.height;
    labelHeight.value = labelSettings.height;
  }
  if (template.labelSettings.dpmm !== undefined) {
    labelSettings.dpmm = template.labelSettings.dpmm;
    labelDpmm.value = labelSettings.dpmm;
  }
  if (template.labelSettings.homeX !== undefined) {
    labelSettings.homeX = template.labelSettings.homeX;
    homeX.value = labelSettings.homeX;
  }
  if (template.labelSettings.homeY !== undefined) {
    labelSettings.homeY = template.labelSettings.homeY;
    homeY.value = labelSettings.homeY;
  }
  if (template.labelSettings.labelTop !== undefined) {
    labelSettings.labelTop = template.labelSettings.labelTop;
    labelTop.value = labelSettings.labelTop;
  }
  if (template.labelSettings.printOrientation !== undefined) {
    labelSettings.printOrientation = template.labelSettings.printOrientation;
    printOrientation.value = labelSettings.printOrientation;
  }
  if (template.labelSettings.mediaDarkness !== undefined) {
    labelSettings.mediaDarkness = template.labelSettings.mediaDarkness;
    mediaDarkness.value = labelSettings.mediaDarkness;
  }
  if (template.labelSettings.printSpeed !== undefined) {
    labelSettings.printSpeed = template.labelSettings.printSpeed;
    printSpeed.value = labelSettings.printSpeed;
  }
  if (template.labelSettings.slewSpeed !== undefined) {
    labelSettings.slewSpeed = template.labelSettings.slewSpeed;
    slewSpeed.value = labelSettings.slewSpeed;
  }
  if (template.labelSettings.backfeedSpeed !== undefined) {
    labelSettings.backfeedSpeed = template.labelSettings.backfeedSpeed;
    backfeedSpeed.value = labelSettings.backfeedSpeed;
  }
  if (template.labelSettings.fontId !== undefined) {
    labelSettings.fontId = template.labelSettings.fontId;
    fontId.value = labelSettings.fontId;
  }
  if (template.labelSettings.fontFile !== undefined) {
    labelSettings.fontFile = template.labelSettings.fontFile;
    fontFile.value = labelSettings.fontFile;
  }
  if (template.labelSettings.defaultFontHeight !== undefined) {
    labelSettings.defaultFontHeight = template.labelSettings.defaultFontHeight;
    defaultFontHeight.value = labelSettings.defaultFontHeight;
  }

  // Recreate elements from template
  template.elements.forEach((elementData) => {
    let element;

    if (elementData.type === "TEXT") {
      element = new TextElement(
        elementData.x || 0,
        elementData.y || 0,
        elementData.previewText || elementData.text || "",
        elementData.fontSize || 30,
        elementData.fontWidth || 30,
        elementData.placeholder || "",
        elementData.fontId || "",
        elementData.orientation || "N",
        elementData.reverse || false
      );
    } else if (elementData.type === "BARCODE") {
      element = new BarcodeElement(
        elementData.x || 0,
        elementData.y || 0,
        elementData.previewData || elementData.data || "",
        elementData.height || 50,
        elementData.width || 2,
        elementData.ratio || 2.0,
        elementData.placeholder || "",
        elementData.showText !== undefined ? elementData.showText : true
      );
    } else if (elementData.type === "BOX") {
      element = new BoxElement(
        elementData.x || 0,
        elementData.y || 0,
        elementData.width || 100,
        elementData.height || 50,
        elementData.thickness || 3,
        elementData.color || "B",
        elementData.rounding || 0
      );
    } else if (elementData.type === "TEXTBLOCK") {
      element = new TextBlockElement(
        elementData.x || 0,
        elementData.y || 0,
        elementData.previewText || elementData.text || "",
        elementData.fontSize || 30,
        elementData.fontWidth || 30,
        elementData.blockWidth || 200,
        elementData.maxLines || 1,
        elementData.lineSpacing || 0,
        elementData.justification || "L",
        elementData.hangingIndent || 0,
        elementData.placeholder || "",
        elementData.fontId || "",
        elementData.reverse || false
      );
    } else if (elementData.type === "QRCODE") {
      element = new QRCodeElement(
        elementData.x || 0,
        elementData.y || 0,
        elementData.previewData || elementData.data || "",
        elementData.model || 2,
        elementData.magnification || 5,
        elementData.errorCorrection || "Q",
        elementData.placeholder || ""
      );
    } else if (elementData.type === "LINE") {
      element = new LineElement(
        elementData.x || 0,
        elementData.y || 0,
        elementData.width || 100,
        elementData.thickness || 3,
        elementData.orientation || "H"
      );
    } else {
      console.warn("Unknown element type:", elementData.type);
      return;
    }

    // Generate new ID for imported element (don't preserve old IDs)
    elements.push(element);
  });

  // Update UI
  interactionHandler.updateElements(elements);
  updateElementsList();
  renderPropertiesPanel();
  updateZPLOutput();
  renderCanvasPreview();
}
