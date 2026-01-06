// Application State
let elements = [];
let selectedElement = null;
let labelSettings = {
  width: 101.6, // in mm (4 inches)
  height: 152.4, // in mm (6 inches)
  dpmm: 8,
};

// DOM Elements
const addTextBtn = document.getElementById("add-text-btn");
const addBarcodeBtn = document.getElementById("add-barcode-btn");
const addBoxBtn = document.getElementById("add-box-btn");
const elementsList = document.getElementById("elements-list");
const propertiesPanel = document.getElementById("properties-panel");
const zplOutput = document.getElementById("zpl-output");
const copyBtn = document.getElementById("copy-btn");
const labelWidth = document.getElementById("label-width");
const labelHeight = document.getElementById("label-height");
const labelDpmm = document.getElementById("label-dpmm");
const previewImage = document.getElementById("preview-image");
const previewLoading = document.getElementById("preview-loading");
const previewError = document.getElementById("preview-error");
const refreshPreviewBtn = document.getElementById("refresh-preview-btn");

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  addTextBtn.addEventListener("click", addTextElement);
  addBarcodeBtn.addEventListener("click", addBarcodeElement);
  addBoxBtn.addEventListener("click", addBoxElement);
  copyBtn.addEventListener("click", copyZPL);
  refreshPreviewBtn.addEventListener("click", updatePreview);
  exportBtn.addEventListener("click", exportTemplate);
  importBtn.addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", handleFileImport);

  // Label settings event listeners
  labelWidth.addEventListener("input", (e) => {
    labelSettings.width = parseFloat(e.target.value) || 101.6;
  });

  labelHeight.addEventListener("input", (e) => {
    labelSettings.height = parseFloat(e.target.value) || 152.4;
  });

  labelDpmm.addEventListener("change", (e) => {
    labelSettings.dpmm = parseInt(e.target.value) || 8;
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
}

// Add Barcode Element
function addBarcodeElement() {
  const barcodeElement = new BarcodeElement(50, 100, "1234567890", 50, 2, 2.0);
  elements.push(barcodeElement);
  selectedElement = barcodeElement;
  updateElementsList();
  renderPropertiesPanel();
  updateZPLOutput();
}

// Add Box Element
function addBoxElement() {
  const boxElement = new BoxElement(50, 150, 100, 50, 3, "B", 0);
  elements.push(boxElement);
  selectedElement = boxElement;
  updateElementsList();
  renderPropertiesPanel();
  updateZPLOutput();
}

// Update Elements List
function updateElementsList() {
  if (elements.length === 0) {
    elementsList.innerHTML = '<p class="empty-state">No elements added yet</p>';
    return;
  }

  elementsList.innerHTML = elements
    .map((element) => {
      const isActive =
        selectedElement && String(selectedElement.id) === String(element.id);
      return `
            <div class="element-item ${isActive ? "active" : ""}" data-id="${
        element.id
      }">
                <div class="element-info">
                    <div class="element-type">${element.type}</div>
                    <div class="element-details">${element.getDisplayName()}</div>
                </div>
                <button class="delete-btn" data-id="${
                  element.id
                }">Delete</button>
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
}

// Render Properties Panel
function renderPropertiesPanel() {
  if (!selectedElement) {
    propertiesPanel.innerHTML =
      '<p class="empty-state">Select an element to edit properties</p>';
    return;
  }

  if (selectedElement.type === "TEXT") {
    renderTextProperties(selectedElement);
  } else if (selectedElement.type === "BARCODE") {
    renderBarcodeProperties(selectedElement);
  } else if (selectedElement.type === "BOX") {
    renderBoxProperties(selectedElement);
  }
}

// Render Text Properties
function renderTextProperties(element) {
  propertiesPanel.innerHTML = `
        <div class="property-group">
            <label>X Position</label>
            <input type="number" id="prop-x" value="${element.x}" min="0">
        </div>
        <div class="property-group">
            <label>Y Position</label>
            <input type="number" id="prop-y" value="${element.y}" min="0">
        </div>
        <div class="property-group">
            <label>Text</label>
            <input type="text" id="prop-text" value="${element.text}">
        </div>
        <div class="property-group">
            <label>Font Size (Height)</label>
            <input type="number" id="prop-font-size" value="${element.fontSize}" min="1" max="32000">
        </div>
        <div class="property-group">
            <label>Font Width</label>
            <input type="number" id="prop-font-width" value="${element.fontWidth}" min="1" max="32000">
        </div>
    `;

  // Add event listeners
  document.getElementById("prop-x").addEventListener("input", (e) => {
    element.x = parseInt(e.target.value) || 0;
    updateZPLOutput();
    updateElementsList();
  });

  document.getElementById("prop-y").addEventListener("input", (e) => {
    element.y = parseInt(e.target.value) || 0;
    updateZPLOutput();
    updateElementsList();
  });

  document.getElementById("prop-text").addEventListener("input", (e) => {
    element.text = e.target.value;
    updateZPLOutput();
    updateElementsList();
  });

  document.getElementById("prop-font-size").addEventListener("input", (e) => {
    element.fontSize = parseInt(e.target.value) || 30;
    updateZPLOutput();
  });

  document.getElementById("prop-font-width").addEventListener("input", (e) => {
    element.fontWidth = parseInt(e.target.value) || 30;
    updateZPLOutput();
  });
}

// Render Barcode Properties
function renderBarcodeProperties(element) {
  propertiesPanel.innerHTML = `
        <div class="property-group">
            <label>X Position</label>
            <input type="number" id="prop-x" value="${element.x}" min="0">
        </div>
        <div class="property-group">
            <label>Y Position</label>
            <input type="number" id="prop-y" value="${element.y}" min="0">
        </div>
        <div class="property-group">
            <label>Barcode Data</label>
            <input type="text" id="prop-data" value="${element.data}">
        </div>
        <div class="property-group">
            <label>Height</label>
            <input type="number" id="prop-height" value="${element.height}" min="1" max="1000">
        </div>
        <div class="property-group">
            <label>Width Multiplier</label>
            <input type="number" id="prop-width" value="${element.width}" min="1" max="10" step="0.1">
        </div>
        <div class="property-group">
            <label>Ratio</label>
            <input type="number" id="prop-ratio" value="${element.ratio}" min="1" max="10" step="0.1">
        </div>
    `;

  // Add event listeners
  document.getElementById("prop-x").addEventListener("input", (e) => {
    element.x = parseInt(e.target.value) || 0;
    updateZPLOutput();
    updateElementsList();
  });

  document.getElementById("prop-y").addEventListener("input", (e) => {
    element.y = parseInt(e.target.value) || 0;
    updateZPLOutput();
    updateElementsList();
  });

  document.getElementById("prop-data").addEventListener("input", (e) => {
    element.data = e.target.value;
    updateZPLOutput();
    updateElementsList();
  });

  document.getElementById("prop-height").addEventListener("input", (e) => {
    element.height = parseInt(e.target.value) || 50;
    updateZPLOutput();
  });

  document.getElementById("prop-width").addEventListener("input", (e) => {
    element.width = parseFloat(e.target.value) || 2;
    updateZPLOutput();
  });

  document.getElementById("prop-ratio").addEventListener("input", (e) => {
    element.ratio = parseFloat(e.target.value) || 2.0;
    updateZPLOutput();
  });
}

// Render Box Properties
function renderBoxProperties(element) {
  propertiesPanel.innerHTML = `
        <div class="property-group">
            <label>X Position</label>
            <input type="number" id="prop-x" value="${element.x}" min="0">
        </div>
        <div class="property-group">
            <label>Y Position</label>
            <input type="number" id="prop-y" value="${element.y}" min="0">
        </div>
        <div class="property-group">
            <label>Width</label>
            <input type="number" id="prop-width" value="${
              element.width
            }" min="1" max="32000">
        </div>
        <div class="property-group">
            <label>Height</label>
            <input type="number" id="prop-height" value="${
              element.height
            }" min="1" max="32000">
        </div>
        <div class="property-group">
            <label>Thickness</label>
            <input type="number" id="prop-thickness" value="${
              element.thickness
            }" min="1" max="32000">
        </div>
        <div class="property-group">
            <label>Color</label>
            <select id="prop-color">
                <option value="B" ${
                  element.color === "B" ? "selected" : ""
                }>Black</option>
                <option value="W" ${
                  element.color === "W" ? "selected" : ""
                }>White</option>
            </select>
        </div>
        <div class="property-group">
            <label>Rounding</label>
            <input type="number" id="prop-rounding" value="${
              element.rounding
            }" min="0" max="32000">
        </div>
    `;

  // Add event listeners
  document.getElementById("prop-x").addEventListener("input", (e) => {
    element.x = parseInt(e.target.value) || 0;
    updateZPLOutput();
    updateElementsList();
  });

  document.getElementById("prop-y").addEventListener("input", (e) => {
    element.y = parseInt(e.target.value) || 0;
    updateZPLOutput();
    updateElementsList();
  });

  document.getElementById("prop-width").addEventListener("input", (e) => {
    element.width = parseInt(e.target.value) || 100;
    updateZPLOutput();
    updateElementsList();
  });

  document.getElementById("prop-height").addEventListener("input", (e) => {
    element.height = parseInt(e.target.value) || 50;
    updateZPLOutput();
    updateElementsList();
  });

  document.getElementById("prop-thickness").addEventListener("input", (e) => {
    element.thickness = parseInt(e.target.value) || 3;
    updateZPLOutput();
  });

  document.getElementById("prop-color").addEventListener("change", (e) => {
    element.color = e.target.value;
    updateZPLOutput();
    updateElementsList();
  });

  document.getElementById("prop-rounding").addEventListener("input", (e) => {
    element.rounding = parseInt(e.target.value) || 0;
    updateZPLOutput();
  });
}

// Update ZPL Output
function updateZPLOutput() {
  if (elements.length === 0) {
    zplOutput.value = "";
    return;
  }

  // Start with ZPL header (^XA) and end with footer (^XZ)
  const zplCommands = elements.map((element) => element.render()).join("\n");
  zplOutput.value = `^XA\n${zplCommands}\n^XZ`;
}

// Update Preview using Labelary API
async function updatePreview() {
  const zpl = zplOutput.value.trim();

  // Hide preview elements
  previewImage.style.display = "none";
  previewError.style.display = "none";

  if (!zpl || elements.length === 0) {
    return;
  }

  // Show loading indicator
  previewLoading.style.display = "block";

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
    previewImage.style.display = "block";
    previewImage.onload = () => {
      // Clean up old object URL
      URL.revokeObjectURL(imageUrl);
    };

    previewError.style.display = "none";
  } catch (error) {
    console.error("Preview error:", error);
    previewError.textContent = `Error loading preview: ${error.message}`;
    previewError.style.display = "block";
    previewImage.style.display = "none";
  } finally {
    previewLoading.style.display = "none";
  }
}

// Copy ZPL to Clipboard
function copyZPL() {
  zplOutput.select();
  zplOutput.setSelectionRange(0, 99999); // For mobile devices
  document.execCommand("copy");

  // Visual feedback
  const originalText = copyBtn.textContent;
  copyBtn.textContent = "Copied!";
  copyBtn.style.background = "#28a745";
  setTimeout(() => {
    copyBtn.textContent = originalText;
    copyBtn.style.background = "";
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
