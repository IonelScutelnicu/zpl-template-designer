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
  fontId: "K", // ^CW font identifier
  fontFile: "tt0003m_.TTF", // ^CW font file name
  defaultFontHeight: 20, // ^CF default font height
  homeX: 0, // ^LH x position
  homeY: 0, // ^LH y position
  labelTop: 0, // ^LT label top shift
};

// DOM Elements
const addTextBtn = document.getElementById("add-text-btn");
const addBarcodeBtn = document.getElementById("add-barcode-btn");
const addBoxBtn = document.getElementById("add-box-btn");
const addTextBlockBtn = document.getElementById("add-textblock-btn");
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

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  addTextBtn.addEventListener("click", addTextElement);
  addBarcodeBtn.addEventListener("click", addBarcodeElement);
  addBoxBtn.addEventListener("click", addBoxElement);
  addTextBlockBtn.addEventListener("click", addTextBlockElement);
  copyBtn.addEventListener("click", copyZPL);
  refreshPreviewBtn.addEventListener("click", updatePreview);
  exportBtn.addEventListener("click", exportTemplate);
  importBtn.addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", handleFileImport);

  // Label settings event listeners
  labelWidth.addEventListener("input", (e) => {
    labelSettings.width = parseFloat(e.target.value) || 100;
    updateZPLOutput();
  });

  labelHeight.addEventListener("input", (e) => {
    labelSettings.height = parseFloat(e.target.value) || 50;
  });

  labelDpmm.addEventListener("change", (e) => {
    labelSettings.dpmm = parseInt(e.target.value) || 8;
    updateZPLOutput();
  });

  printOrientation.addEventListener("change", (e) => {
    labelSettings.printOrientation = e.target.value || "N";
    updateZPLOutput();
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
    labelSettings.fontId = e.target.value || "K";
    updateZPLOutput();
  });

  fontFile.addEventListener("input", (e) => {
    labelSettings.fontFile = e.target.value || "tt0003m_.TTF";
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
  });

  homeY.addEventListener("input", (e) => {
    labelSettings.homeY = parseInt(e.target.value) || 0;
    updateZPLOutput();
  });

  labelTop.addEventListener("input", (e) => {
    labelSettings.labelTop = parseInt(e.target.value) || 0;
    updateZPLOutput();
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

    // Check if element item was clicked (but not the delete button)
    const elementItem = e.target.closest(".element-item");
    if (elementItem) {
      const idStr = elementItem.getAttribute("data-id");
      if (idStr) {
        // Find element by comparing string representations of IDs
        selectedElement = elements.find((el) => String(el.id) === idStr);
        if (selectedElement) {
          updateElementsList();
          renderPropertiesPanel();
        }
      }
    }
  });

  updateZPLOutput();
});

// Add Text Element
function addTextElement() {
  const textElement = new TextElement(50, 50, "Sample Text", 30, 30);
  elements.push(textElement);
  selectedElement = textElement;
  updateElementsList();
  renderPropertiesPanel();
  updateZPLOutput();
  updatePreview();
}

// Add Barcode Element
function addBarcodeElement() {
  const barcodeElement = new BarcodeElement(50, 100, "1234567890", 50, 2, 2.0);
  elements.push(barcodeElement);
  selectedElement = barcodeElement;
  updateElementsList();
  renderPropertiesPanel();
  updateZPLOutput();
  updatePreview();
}

// Add Box Element
function addBoxElement() {
  const boxElement = new BoxElement(50, 150, 100, 50, 3, "B", 0);
  elements.push(boxElement);
  selectedElement = boxElement;
  updateElementsList();
  renderPropertiesPanel();
  updateZPLOutput();
  updatePreview();
}

// Add Text Block Element
function addTextBlockElement() {
  const textBlockElement = new TextBlockElement(50, 200, "Sample text that can wrap across multiple lines", 30, 30, 200, 3, 0, "L", 0);
  elements.push(textBlockElement);
  selectedElement = textBlockElement;
  updateElementsList();
  renderPropertiesPanel();
  updateZPLOutput();
  updatePreview();
}

// Update Elements List
function updateElementsList() {
  if (elements.length === 0) {
    elementsList.innerHTML = '<p class="text-center text-gray-400 py-8 italic text-sm">No elements added yet</p>';
    return;
  }

  elementsList.innerHTML = elements
    .map((element) => {
      const isActive =
        selectedElement && String(selectedElement.id) === String(element.id);

      const activeClasses = isActive
        ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500"
        : "border-gray-200 hover:border-indigo-300 hover:shadow-md";

      return `
            <div class="element-item group relative flex justify-between items-center p-3 mb-2 rounded-lg border transition-all cursor-pointer shadow-sm ${activeClasses}" data-id="${element.id}">
                <div class="flex-1 min-w-0 pr-2">
                    <div class="flex items-center gap-2">
                        <span class="inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800">
                          ${element.type}
                        </span>
                    </div>
                    <div class="text-sm text-gray-600 mt-1 truncate font-medium">${element.getDisplayName()}</div>
                </div>
                <button class="delete-btn opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-red-500 hover:bg-red-50 rounded-md" title="Delete" data-id="${element.id}">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
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
  updateElementsList();
  renderPropertiesPanel();
  updateZPLOutput();
  updatePreview();
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
    <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 mb-1">${label}</label>
        <input 
            type="${type}" 
            id="${id}" 
            value="${value}" 
            ${attributes}
            class="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 bg-gray-50 border p-2 text-sm"
        >
    </div>
  `;
}

// Render Properties Panel
function renderPropertiesPanel() {
  if (!selectedElement) {
    propertiesPanel.innerHTML =
      '<p class="text-center text-gray-400 py-12 italic">Select an element to edit properties</p>';
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
  }

  propertiesPanel.innerHTML = `<div class="animate-fade-in">${content}</div>`;
  attachPropertyListeners(selectedElement);
}

function renderTextPropertiesHTML(element) {
  return `
        ${createInputGroup("X Position", "prop-x", element.x, "number", { min: 0 })}
        ${createInputGroup("Y Position", "prop-y", element.y, "number", { min: 0 })}
        ${createInputGroup("Text", "prop-text", element.text)}
        ${createInputGroup("Font Size (Height)", "prop-font-size", element.fontSize, "number", { min: 1, max: 32000 })}
        ${createInputGroup("Font Width", "prop-font-width", element.fontWidth, "number", { min: 1, max: 32000 })}
    `;
}

function renderBarcodePropertiesHTML(element) {
  return `
        ${createInputGroup("X Position", "prop-x", element.x, "number", { min: 0 })}
        ${createInputGroup("Y Position", "prop-y", element.y, "number", { min: 0 })}
        ${createInputGroup("Barcode Data", "prop-data", element.data)}
        ${createInputGroup("Height", "prop-height", element.height, "number", { min: 1, max: 1000 })}
        ${createInputGroup("Width Multiplier", "prop-width", element.width, "number", { min: 1, max: 10, step: 0.1 })}
        ${createInputGroup("Ratio", "prop-ratio", element.ratio, "number", { min: 1, max: 10, step: 0.1 })}
    `;
}

function renderBoxPropertiesHTML(element) {
  return `
        ${createInputGroup("X Position", "prop-x", element.x, "number", { min: 0 })}
        ${createInputGroup("Y Position", "prop-y", element.y, "number", { min: 0 })}
        ${createInputGroup("Width", "prop-width", element.width, "number", { min: 1, max: 32000 })}
        ${createInputGroup("Height", "prop-height", element.height, "number", { min: 1, max: 32000 })}
        ${createInputGroup("Thickness", "prop-thickness", element.thickness, "number", { min: 1, max: 32000 })}
        <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">Color</label>
            <select id="prop-color" class="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 bg-gray-50 border p-2 text-sm">
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
        <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">Text</label>
            <textarea
                id="prop-text"
                rows="3"
                class="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 bg-gray-50 border p-2 text-sm"
            >${element.text}</textarea>
        </div>
        ${createInputGroup("Font Size (Height)", "prop-font-size", element.fontSize, "number", { min: 1, max: 32000 })}
        ${createInputGroup("Font Width", "prop-font-width", element.fontWidth, "number", { min: 1, max: 32000 })}
        ${createInputGroup("Block Width (dots)", "prop-block-width", element.blockWidth, "number", { min: 0, max: 32000 })}
        ${createInputGroup("Max Lines", "prop-max-lines", element.maxLines, "number", { min: 1, max: 9999 })}
        ${createInputGroup("Line Spacing", "prop-line-spacing", element.lineSpacing, "number", { min: -9999, max: 9999 })}
        <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">Text Justification</label>
            <select id="prop-justification" class="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 bg-gray-50 border p-2 text-sm">
                <option value="L" ${element.justification === "L" ? "selected" : ""}>Left</option>
                <option value="C" ${element.justification === "C" ? "selected" : ""}>Center</option>
                <option value="R" ${element.justification === "R" ? "selected" : ""}>Right</option>
                <option value="J" ${element.justification === "J" ? "selected" : ""}>Justified</option>
            </select>
        </div>
        ${createInputGroup("Hanging Indent (dots)", "prop-hanging-indent", element.hangingIndent, "number", { min: 0, max: 9999 })}
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
    });
  };

  attach("prop-x", "x", (v) => parseInt(v) || 0);
  attach("prop-y", "y", (v) => parseInt(v) || 0);

  if (element.type === "TEXT") {
    attach("prop-text", "text");
    attach("prop-font-size", "fontSize", (v) => parseInt(v) || 30);
    attach("prop-font-width", "fontWidth", (v) => parseInt(v) || 30);
  } else if (element.type === "BARCODE") {
    attach("prop-data", "data");
    attach("prop-height", "height", (v) => parseInt(v) || 50);
    attach("prop-width", "width", (v) => parseFloat(v) || 2);
    attach("prop-ratio", "ratio", (v) => parseFloat(v) || 2.0);
  } else if (element.type === "BOX") {
    attach("prop-width", "width", (v) => parseInt(v) || 100);
    attach("prop-height", "height", (v) => parseInt(v) || 50);
    attach("prop-thickness", "thickness", (v) => parseInt(v) || 3);
    attach("prop-color", "color");
    attach("prop-rounding", "rounding", (v) => parseInt(v) || 0);
  } else if (element.type === "TEXTBLOCK") {
    attach("prop-text", "text");
    attach("prop-font-size", "fontSize", (v) => parseInt(v) || 30);
    attach("prop-font-width", "fontWidth", (v) => parseInt(v) || 30);
    attach("prop-block-width", "blockWidth", (v) => parseInt(v) || 200);
    attach("prop-max-lines", "maxLines", (v) => parseInt(v) || 1);
    attach("prop-line-spacing", "lineSpacing", (v) => parseInt(v) || 0);
    attach("prop-justification", "justification");
    attach("prop-hanging-indent", "hangingIndent", (v) => parseInt(v) || 0);
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

  // Add font configuration commands
  zplHeader += `^CW${fid},${ffile}\n`;
  zplHeader += `^CF${fid},${dfh}\n`;

  const zplCommands = elements.map((element) => element.render()).join("\n");
  zplOutput.value = `${zplHeader}${zplCommands}\n^XZ`;
}

// Update Preview using Labelary API
async function updatePreview() {
  const zpl = zplOutput.value.trim();

  // Reset states
  previewImage.classList.add('hidden');
  previewError.classList.add('hidden');
  previewPlaceholder.classList.add('hidden');

  if (!zpl || elements.length === 0) {
    previewPlaceholder.classList.remove('hidden');
    return;
  }

  // Show loading indicator
  previewLoading.classList.remove('hidden');

  try {
    const { width, height, dpmm } = labelSettings;
    // Convert mm to inches for the API (1 inch = 25.4 mm)
    const widthInches = width / 25.4;
    const heightInches = height / 25.4;
    const url = `https://api.labelary.com/v1/printers/${dpmm}dpmm/labels/${widthInches}x${heightInches}/0/`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: zpl,
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
  copyBtn.classList.remove('bg-gray-800', 'hover:bg-gray-900');
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
        elementData.text = element.text;
        elementData.fontSize = element.fontSize;
        elementData.fontWidth = element.fontWidth;
      } else if (element.type === "BARCODE") {
        elementData.data = element.data;
        elementData.height = element.height;
        elementData.width = element.width;
        elementData.ratio = element.ratio;
      } else if (element.type === "BOX") {
        elementData.width = element.width;
        elementData.height = element.height;
        elementData.thickness = element.thickness;
        elementData.color = element.color;
        elementData.rounding = element.rounding;
      } else if (element.type === "TEXTBLOCK") {
        elementData.text = element.text;
        elementData.fontSize = element.fontSize;
        elementData.fontWidth = element.fontWidth;
        elementData.blockWidth = element.blockWidth;
        elementData.maxLines = element.maxLines;
        elementData.lineSpacing = element.lineSpacing;
        elementData.justification = element.justification;
        elementData.hangingIndent = element.hangingIndent;
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
        elementData.text || "",
        elementData.fontSize || 30,
        elementData.fontWidth || 30
      );
    } else if (elementData.type === "BARCODE") {
      element = new BarcodeElement(
        elementData.x || 0,
        elementData.y || 0,
        elementData.data || "",
        elementData.height || 50,
        elementData.width || 2,
        elementData.ratio || 2.0
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
        elementData.text || "",
        elementData.fontSize || 30,
        elementData.fontWidth || 30,
        elementData.blockWidth || 200,
        elementData.maxLines || 1,
        elementData.lineSpacing || 0,
        elementData.justification || "L",
        elementData.hangingIndent || 0
      );
    } else {
      console.warn("Unknown element type:", elementData.type);
      return;
    }

    // Generate new ID for imported element (don't preserve old IDs)
    elements.push(element);
  });

  // Update UI
  updateElementsList();
  renderPropertiesPanel();
  updateZPLOutput();

  // Trigger preview refresh
  updatePreview();
}
