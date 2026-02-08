// Application imports
import { TextElement } from './elements/TextElement.js';
import { BarcodeElement } from './elements/BarcodeElement.js';
import { BoxElement } from './elements/BoxElement.js';
import { TextBlockElement } from './elements/TextBlockElement.js';
import { QRCodeElement } from './elements/QRCodeElement.js';
import { LineElement } from './elements/LineElement.js';
import { CanvasRenderer } from './canvas-renderer.js';
import { InteractionHandler } from './interaction-handler.js';
import { HISTORY_LIMIT, BUILTIN_FONTS, FONT_LABELS } from './config/constants.js';
import {
  clampNumber,
  getLabelSizeDots,
  getElementBoundsResolved,
  getElementBoundsSafe
} from './utils/geometry.js';
import { AppState } from './state/AppState.js';

// Initialize centralized state management
const state = new AppState();

// Export state for use during migration
export { state };

// Legacy global state (will be removed after migration)
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
  fontId: "0", // ^CF default font identifier
  customFonts: [], // Array of {id, fontFile} for ^CW commands
  defaultFontHeight: 20, // ^CF default font height
  defaultFontWidth: 20, // ^CF default font width
  homeX: 0, // ^LH x position
  homeY: 0, // ^LH y position
  labelTop: 0, // ^LT label top shift
};

let historyEntries = [];
let historyIndex = -1;
let isApplyingHistory = false;
const historyCommitTimers = new Map();
let activeTransformSession = null;
let keyboardMoveSession = null;

// Section State Management with localStorage
const SECTION_STATE_KEY = 'zebra-sections-state';

function getSectionState(elementType, sectionTitle) {
  try {
    const stored = localStorage.getItem(SECTION_STATE_KEY);
    if (!stored) return true; // Default to expanded

    const state = JSON.parse(stored);
    if (state[elementType] && typeof state[elementType][sectionTitle] === 'boolean') {
      return state[elementType][sectionTitle];
    }
    return true; // Default to expanded if not found
  } catch (error) {
    console.warn('Failed to read section state from localStorage:', error);
    return true; // Default to expanded on error
  }
}

function setSectionState(elementType, sectionTitle, isOpen) {
  try {
    const stored = localStorage.getItem(SECTION_STATE_KEY);
    const state = stored ? JSON.parse(stored) : {};

    if (!state[elementType]) {
      state[elementType] = {};
    }

    state[elementType][sectionTitle] = isOpen;
    localStorage.setItem(SECTION_STATE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Failed to save section state to localStorage:', error);
  }
}

function clearSectionStates() {
  try {
    localStorage.removeItem(SECTION_STATE_KEY);
  } catch (error) {
    console.warn('Failed to clear section states from localStorage:', error);
  }
}

// DOM Elements
const addTextBtn = document.getElementById("add-text-btn");
const addBarcodeBtn = document.getElementById("add-barcode-btn");
const addQRCodeBtn = document.getElementById("add-qrcode-btn");
const addBoxBtn = document.getElementById("add-box-btn");
const addTextBlockBtn = document.getElementById("add-textblock-btn");
const addLineBtn = document.getElementById("add-line-btn");
const undoBtn = document.getElementById("undo-btn");
const redoBtn = document.getElementById("redo-btn");
const historyToggleBtn = document.getElementById("history-toggle-btn");
const historyPanel = document.getElementById("history-panel");
const historyCloseBtn = document.getElementById("history-close-btn");
const historyList = document.getElementById("history-list");
const historyClearBtn = document.getElementById("history-clear-btn");
const historyBackdrop = document.getElementById("history-backdrop");
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
const defaultFontHeight = document.getElementById("default-font-height");
const defaultFontWidth = document.getElementById("default-font-width");
const newFontId = document.getElementById("new-font-id");
const newFontFile = document.getElementById("new-font-file");
const addCustomFontBtn = document.getElementById("add-custom-font-btn");
const customFontsList = document.getElementById("custom-fonts-list");
const customFontError = document.getElementById("custom-font-error");
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

// Initialize function
export function initApp() {
  // Initialize canvas renderer
  canvasRenderer = new CanvasRenderer('label-canvas');

  // Initialize interaction handler
  interactionHandler = new InteractionHandler(canvasRenderer, state.elements, state.labelSettings, {
    onElementSelected: (element) => {
      selectedElement = element;  // Keep legacy sync for now
      state.setSelectedElement(element);
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
        } else if (element.type === 'BARCODE') {
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
      finalizeTransformSession(element);
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
    onElementTransformStart: (element, mode) => {
      startTransformSession(element, mode);
    },
    onKeyboardMoveStart: (element) => {
      startKeyboardMoveSession(element);
    },
    onKeyboardMoveEnd: (element) => {
      endKeyboardMoveSession(element);
    },
    onUndo: () => undo(),
    onRedo: () => redo(),
    getSelectedElement: () => state.selectedElement,  // Read from state
    serializeElement: (element) => serializeElement(element),
    pasteElement: (data) => pasteElementFromData(data)
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
  undoBtn.addEventListener("click", undo);
  redoBtn.addEventListener("click", redo);
  historyToggleBtn.addEventListener("click", openHistoryPanel);
  historyCloseBtn.addEventListener("click", closeHistoryPanel);
  historyBackdrop.addEventListener("click", closeHistoryPanel);
  historyClearBtn.addEventListener("click", () => resetHistory("History cleared", { kind: "clear" }));
  historyList.addEventListener("click", handleHistoryClick);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeHistoryPanel();
    }
  });

  // Label settings event listeners
  labelWidth.addEventListener("input", (e) => {
    labelSettings.width = parseFloat(e.target.value) || 100;
    updateZPLOutput();
    renderCanvasPreview();
    scheduleHistoryCommit("label-settings", "Updated label settings", { kind: "settings" });
  });

  labelHeight.addEventListener("input", (e) => {
    labelSettings.height = parseFloat(e.target.value) || 50;
    renderCanvasPreview();
    scheduleHistoryCommit("label-settings", "Updated label settings", { kind: "settings" });
  });

  labelDpmm.addEventListener("change", (e) => {
    labelSettings.dpmm = parseInt(e.target.value) || 8;
    updateZPLOutput();
    renderCanvasPreview();
    scheduleHistoryCommit("label-settings", "Updated label settings", { kind: "settings" });
  });

  printOrientation.addEventListener("change", (e) => {
    labelSettings.printOrientation = e.target.value || "N";
    updateZPLOutput();
    renderCanvasPreview();
    scheduleHistoryCommit("label-settings", "Updated label settings", { kind: "settings" });
  });

  mediaDarkness.addEventListener("input", (e) => {
    labelSettings.mediaDarkness = parseInt(e.target.value) || 25;
    updateZPLOutput();
    scheduleHistoryCommit("label-settings", "Updated label settings", { kind: "settings" });
  });

  printSpeed.addEventListener("input", (e) => {
    labelSettings.printSpeed = parseInt(e.target.value) || 4;
    updateZPLOutput();
    scheduleHistoryCommit("label-settings", "Updated label settings", { kind: "settings" });
  });

  slewSpeed.addEventListener("input", (e) => {
    labelSettings.slewSpeed = parseInt(e.target.value) || 4;
    updateZPLOutput();
    scheduleHistoryCommit("label-settings", "Updated label settings", { kind: "settings" });
  });

  backfeedSpeed.addEventListener("input", (e) => {
    labelSettings.backfeedSpeed = parseInt(e.target.value) || 4;
    updateZPLOutput();
    scheduleHistoryCommit("label-settings", "Updated label settings", { kind: "settings" });
  });

  // Font settings event listeners
  fontId.addEventListener("change", (e) => {
    labelSettings.fontId = e.target.value || "0";
    updateZPLOutput();
    renderCanvasPreview();
    scheduleHistoryCommit("label-settings", "Updated label settings", { kind: "settings" });
  });

  // Custom fonts management
  addCustomFontBtn.addEventListener("click", addCustomFont);

  defaultFontHeight.addEventListener("input", (e) => {
    labelSettings.defaultFontHeight = parseInt(e.target.value) || 20;
    updateZPLOutput();
    scheduleHistoryCommit("label-settings", "Updated label settings", { kind: "settings" });
  });

  defaultFontWidth.addEventListener("input", (e) => {
    labelSettings.defaultFontWidth = parseInt(e.target.value) || 20;
    updateZPLOutput();
    scheduleHistoryCommit("label-settings", "Updated label settings", { kind: "settings" });
  });

  // Position offset event listeners
  homeX.addEventListener("input", (e) => {
    labelSettings.homeX = parseInt(e.target.value) || 0;
    updateZPLOutput();
    renderCanvasPreview();
    scheduleHistoryCommit("label-settings", "Updated label settings", { kind: "settings" });
  });

  homeY.addEventListener("input", (e) => {
    labelSettings.homeY = parseInt(e.target.value) || 0;
    updateZPLOutput();
    renderCanvasPreview();
    scheduleHistoryCommit("label-settings", "Updated label settings", { kind: "settings" });
  });

  labelTop.addEventListener("input", (e) => {
    labelSettings.labelTop = parseInt(e.target.value) || 0;
    updateZPLOutput();
    renderCanvasPreview();
    scheduleHistoryCommit("label-settings", "Updated label settings", { kind: "settings" });
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
  resetHistory("Initial state", { kind: "init" });
}

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

function serializeElementWithId(element) {
  if (!element) return null;
  const data = JSON.parse(JSON.stringify(element));
  data.id = element.id;
  return data;
}

function serializeAppState() {
  return {
    labelSettings: JSON.parse(JSON.stringify(labelSettings)),
    elements: elements.map((element) => serializeElementWithId(element)),
    selectedElementId: selectedElement ? String(selectedElement.id) : null
  };
}

function syncLabelSettingsInputs() {
  labelWidth.value = labelSettings.width;
  labelHeight.value = labelSettings.height;
  labelDpmm.value = labelSettings.dpmm;
  homeX.value = labelSettings.homeX;
  homeY.value = labelSettings.homeY;
  labelTop.value = labelSettings.labelTop;
  printOrientation.value = labelSettings.printOrientation;
  mediaDarkness.value = labelSettings.mediaDarkness;
  printSpeed.value = labelSettings.printSpeed;
  slewSpeed.value = labelSettings.slewSpeed;
  backfeedSpeed.value = labelSettings.backfeedSpeed;
  fontId.value = labelSettings.fontId;
  renderCustomFonts();
  defaultFontHeight.value = labelSettings.defaultFontHeight;
  defaultFontWidth.value = labelSettings.defaultFontWidth;
}

function addCustomFont() {
  const id = newFontId.value.trim().toUpperCase();
  const file = newFontFile.value.trim();

  // Validation
  if (!id || !file) {
    showCustomFontError("Both ID and Font File are required");
    return;
  }

  if (!/^[A-Z0-9]$/.test(id)) {
    showCustomFontError("ID must be a single letter (A-Z) or digit (0-9)");
    return;
  }

  if (BUILTIN_FONTS.includes(id)) {
    showCustomFontError(`Font ID '${id}' is a built-in font and cannot be overridden`);
    return;
  }

  if (labelSettings.customFonts.some(f => f.id === id)) {
    showCustomFontError(`Font ID '${id}' is already defined`);
    return;
  }

  // Add font
  labelSettings.customFonts.push({ id, fontFile: file });

  // Clear inputs and error
  newFontId.value = "";
  newFontFile.value = "";
  hideCustomFontError();

  // Update UI
  renderCustomFonts();
  updateFontDropdownOptions();
  updateZPLOutput();
  scheduleHistoryCommit("custom-fonts", "Added custom font", { kind: "settings" });
}

function removeCustomFont(id) {
  labelSettings.customFonts = labelSettings.customFonts.filter(f => f.id !== id);
  renderCustomFonts();
  updateFontDropdownOptions();
  updateZPLOutput();
  scheduleHistoryCommit("custom-fonts", "Removed custom font", { kind: "settings" });
}

function renderCustomFonts() {
  if (!customFontsList) return;

  if (labelSettings.customFonts.length === 0) {
    customFontsList.innerHTML = '<p class="text-slate-400 text-[10px] italic">No custom fonts defined</p>';
    return;
  }

  customFontsList.innerHTML = labelSettings.customFonts.map(font => `
    <div class="flex items-center gap-2 bg-slate-50 rounded px-2 py-1.5 border border-slate-100">
      <span class="font-mono font-bold text-blue-600 w-6">${font.id}</span>
      <span class="custom-font-file flex-1 text-slate-600 truncate text-[11px] cursor-pointer hover:text-blue-600"
        data-font-id="${font.id}" title="${font.fontFile} (click to edit)">${font.fontFile}</span>
      <button onclick="removeCustomFont('${font.id}')"
        class="text-slate-400 hover:text-red-500 transition-colors p-0.5" title="Remove">
        <span class="material-icons-round text-sm">close</span>
      </button>
    </div>
  `).join('');

  // Attach click handlers for inline editing
  customFontsList.querySelectorAll('.custom-font-file').forEach(span => {
    span.addEventListener('click', startEditCustomFont);
  });
}

function startEditCustomFont(e) {
  const span = e.target;
  const fontId = span.dataset.fontId;
  const currentValue = span.textContent;

  // Create input field
  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentValue;
  input.className = 'flex-1 text-[11px] px-1 py-0.5 border border-blue-400 rounded outline-none focus:ring-1 focus:ring-blue-500';
  input.dataset.fontId = fontId;

  // Replace span with input
  span.replaceWith(input);
  input.focus();
  input.select();

  // Handle save on blur or Enter
  const saveEdit = () => {
    const newValue = input.value.trim();
    if (newValue && newValue !== currentValue) {
      updateCustomFontFile(fontId, newValue);
    } else {
      renderCustomFonts(); // Restore original if empty or unchanged
    }
  };

  input.addEventListener('blur', saveEdit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    } else if (e.key === 'Escape') {
      input.value = currentValue; // Reset to original
      input.blur();
    }
  });
}

function updateCustomFontFile(fontId, newFontFile) {
  const font = labelSettings.customFonts.find(f => f.id === fontId);
  if (font) {
    font.fontFile = newFontFile;
    updateZPLOutput();
    scheduleHistoryCommit("label-settings", "Updated custom font", { kind: "settings" });
  }
  renderCustomFonts();
}

function updateFontDropdownOptions() {
  if (!fontId) return;

  // Store current value
  const currentValue = fontId.value;

  // Remove existing custom font options (keep only built-in)
  const options = Array.from(fontId.options);
  options.forEach(opt => {
    if (!BUILTIN_FONTS.includes(opt.value)) {
      opt.remove();
    }
  });

  // Add custom fonts
  labelSettings.customFonts.forEach(font => {
    const option = document.createElement('option');
    option.value = font.id;
    option.textContent = `${font.id} - Custom`;
    fontId.appendChild(option);
  });

  // Restore value if still valid
  if (Array.from(fontId.options).some(opt => opt.value === currentValue)) {
    fontId.value = currentValue;
  }
}

function showCustomFontError(message) {
  if (customFontError) {
    customFontError.textContent = message;
    customFontError.classList.remove('hidden');
  }
}

function hideCustomFontError() {
  if (customFontError) {
    customFontError.classList.add('hidden');
  }
}

function applyAppState(state) {
  if (!state) return;
  isApplyingHistory = true;
  activeTransformSession = null;
  keyboardMoveSession = null;

  elements = state.elements.map((data) => createElementFromData(data, { keepId: true }));
  interactionHandler.updateElements(elements);

  Object.assign(labelSettings, state.labelSettings || {});
  syncLabelSettingsInputs();

  selectedElement = null;
  if (state.selectedElementId) {
    selectedElement = elements.find((el) => String(el.id) === String(state.selectedElementId)) || null;
  }

  updateElementsList();
  renderPropertiesPanel();
  updateZPLOutput();
  renderCanvasPreview();

  isApplyingHistory = false;
  updateUndoRedoUI();
  renderHistoryList();
}

function pushHistory(label, options = {}) {
  if (isApplyingHistory && !options.force) return;
  const entry = {
    id: Date.now() + Math.random(),
    label,
    timestamp: new Date(),
    state: serializeAppState(),
    kind: options.kind || "edit",
    detail: options.detail || ""
  };

  if (historyIndex < historyEntries.length - 1) {
    historyEntries = historyEntries.slice(0, historyIndex + 1);
  }

  historyEntries.push(entry);
  historyIndex = historyEntries.length - 1;

  if (historyEntries.length > HISTORY_LIMIT) {
    const overflow = historyEntries.length - HISTORY_LIMIT;
    historyEntries.splice(0, overflow);
    historyIndex = Math.max(0, historyIndex - overflow);
  }

  updateUndoRedoUI();
  renderHistoryList();
}

function resetHistory(label, options = {}) {
  historyEntries = [];
  historyIndex = -1;
  historyCommitTimers.forEach((timer) => clearTimeout(timer));
  historyCommitTimers.clear();
  pushHistory(label, { force: true, kind: options.kind, detail: options.detail });
}

function scheduleHistoryCommit(key, label, options = {}) {
  if (isApplyingHistory) return;
  const delay = options.delay ?? 300;
  if (historyCommitTimers.has(key)) {
    clearTimeout(historyCommitTimers.get(key));
  }
  const timer = setTimeout(() => {
    historyCommitTimers.delete(key);
    pushHistory(label, { kind: options.kind, detail: options.detail });
  }, delay);
  historyCommitTimers.set(key, timer);
}

function updateUndoRedoUI() {
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex >= 0 && historyIndex < historyEntries.length - 1;

  undoBtn.disabled = !canUndo;
  redoBtn.disabled = !canRedo;

  undoBtn.classList.toggle("text-blue-600", canUndo);
  undoBtn.classList.toggle("text-slate-400", !canUndo);
  undoBtn.classList.toggle("hover:bg-blue-100", canUndo);
  undoBtn.classList.toggle("cursor-not-allowed", !canUndo);

  redoBtn.classList.toggle("text-blue-600", canRedo);
  redoBtn.classList.toggle("hover:bg-blue-100", canRedo);
  redoBtn.classList.toggle("text-slate-400", !canRedo);
  redoBtn.classList.toggle("cursor-not-allowed", !canRedo);
}

function renderHistoryList() {
  if (!historyList) return;
  if (historyEntries.length === 0) {
    historyList.innerHTML = '<p class="text-center text-slate-400 py-10 italic text-xs">No history yet</p>';
    return;
  }

  const iconMap = {
    add: { icon: "add_box", color: "text-green-600 bg-green-100" },
    delete: { icon: "delete", color: "text-red-600 bg-red-100" },
    move: { icon: "open_with", color: "text-blue-600 bg-blue-100" },
    resize: { icon: "crop_free", color: "text-blue-600 bg-blue-100" },
    align: { icon: "align_horizontal_left", color: "text-indigo-600 bg-indigo-100" },
    reorder: { icon: "swap_vert", color: "text-slate-600 bg-slate-100" },
    settings: { icon: "tune", color: "text-amber-600 bg-amber-100" },
    edit: { icon: "edit", color: "text-slate-700 bg-slate-100" },
    paste: { icon: "content_paste", color: "text-emerald-600 bg-emerald-100" },
    import: { icon: "file_upload", color: "text-sky-600 bg-sky-100" },
    clear: { icon: "delete_sweep", color: "text-red-600 bg-red-100" },
    init: { icon: "description", color: "text-slate-500 bg-slate-100" }
  };

  historyList.innerHTML = historyEntries
    .map((entry, index) => {
      const isActive = index === historyIndex;
      const activeClasses = isActive
        ? "bg-blue-50 border-l-4 border-blue-500"
        : "hover:bg-slate-50";
      const labelClasses = isActive ? "text-blue-600 font-semibold" : "text-slate-700";
      const time = entry.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const meta = iconMap[entry.kind] || iconMap.edit;
      const detail = entry.detail ? `<p class="text-[11px] text-slate-500 mt-1">${entry.detail}</p>` : "";

      return `
        <button class="w-full text-left px-4 py-3 border-b border-slate-100 ${activeClasses}" data-history-index="${index}">
          <div class="flex items-start gap-3">
            <div class="mt-0.5 w-8 h-8 rounded-full flex items-center justify-center ${meta.color}">
              <span class="material-icons-round text-sm">${meta.icon}</span>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs ${labelClasses}">${entry.label}</span>
                <span class="text-[10px] text-slate-400 font-mono">${time}</span>
              </div>
              ${detail}
            </div>
          </div>
        </button>
      `;
    })
    .join("");
}

function undo() {
  if (historyIndex <= 0) return;
  historyIndex -= 1;
  applyAppState(historyEntries[historyIndex].state);
}

function redo() {
  if (historyIndex >= historyEntries.length - 1) return;
  historyIndex += 1;
  applyAppState(historyEntries[historyIndex].state);
}

function getElementTransformState(element) {
  if (!element) return null;
  const state = { x: element.x, y: element.y, type: element.type };

  if (element.type === "BOX") {
    state.width = element.width;
    state.height = element.height;
    state.thickness = element.thickness;
  } else if (element.type === "LINE") {
    state.width = element.width;
    state.thickness = element.thickness;
    state.orientation = element.orientation;
  } else if (element.type === "BARCODE") {
    state.width = element.width;
    state.height = element.height;
  } else if (element.type === "TEXTBLOCK") {
    state.blockWidth = element.blockWidth;
    state.maxLines = element.maxLines;
  } else if (element.type === "QRCODE") {
    state.magnification = element.magnification;
  } else if (element.type === "TEXT") {
    state.fontSize = element.fontSize;
    state.fontWidth = element.fontWidth;
  }

  return state;
}

function startTransformSession(element, mode) {
  if (!element) return;
  activeTransformSession = {
    id: String(element.id),
    mode,
    before: getElementTransformState(element)
  };
}

function finalizeTransformSession(element) {
  if (!activeTransformSession || !element) return;
  if (String(element.id) !== activeTransformSession.id) {
    activeTransformSession = null;
    return;
  }

  const after = getElementTransformState(element);
  if (JSON.stringify(after) !== JSON.stringify(activeTransformSession.before)) {
    const isResize = activeTransformSession.mode === "resize";
    const label = isResize ? `Resized ${element.type}` : `Moved ${element.type}`;
    pushHistory(label, { kind: isResize ? "resize" : "move", detail: element.getDisplayName() });
  }

  activeTransformSession = null;
}

function startKeyboardMoveSession(element) {
  if (!element) return;
  if (keyboardMoveSession) return;
  keyboardMoveSession = {
    id: String(element.id),
    before: { x: element.x, y: element.y }
  };
}

function endKeyboardMoveSession(element) {
  if (!keyboardMoveSession) return;
  const target = element && String(element.id) === keyboardMoveSession.id
    ? element
    : elements.find((el) => String(el.id) === keyboardMoveSession.id);

  if (target && (target.x !== keyboardMoveSession.before.x || target.y !== keyboardMoveSession.before.y)) {
    pushHistory(`Moved ${target.type} (keyboard)`, { kind: "move", detail: target.getDisplayName() });
  }

  keyboardMoveSession = null;
}

// Add Text Element
function addTextElement() {
  const textElement = new TextElement(50, 50, "Sample Text", 0, 0, "", "", "N");
  elements.push(textElement);
  selectedElement = textElement;
  interactionHandler.updateElements(elements);
  updateElementsList();
  renderPropertiesPanel();
  updateZPLOutput();
  renderCanvasPreview();
  pushHistory("Added Text", { kind: "add", detail: textElement.getDisplayName() });
}

// Add Barcode Element
function addBarcodeElement() {
  const barcodeElement = new BarcodeElement(50, 50, "1234567890", 50, 2, 2.0);
  elements.push(barcodeElement);
  selectedElement = barcodeElement;
  interactionHandler.updateElements(elements);
  updateElementsList();
  renderPropertiesPanel();
  updateZPLOutput();
  renderCanvasPreview();
  pushHistory("Added Barcode", { kind: "add", detail: barcodeElement.getDisplayName() });
}

// Add QR Code Element
function addQRCodeElement() {
  const qrcodeElement = new QRCodeElement(50, 50, "https://example.com", 2, 5, "Q");
  elements.push(qrcodeElement);
  selectedElement = qrcodeElement;
  interactionHandler.updateElements(elements);
  updateElementsList();
  renderPropertiesPanel();
  updateZPLOutput();
  renderCanvasPreview();
  pushHistory("Added QR Code", { kind: "add", detail: qrcodeElement.getDisplayName() });
}

// Add Box Element
function addBoxElement() {
  const boxElement = new BoxElement(50, 50, 100, 50, 3, "B", 0);
  elements.push(boxElement);
  selectedElement = boxElement;
  interactionHandler.updateElements(elements);
  updateElementsList();
  renderPropertiesPanel();
  updateZPLOutput();
  renderCanvasPreview();
  pushHistory("Added Box", { kind: "add", detail: boxElement.getDisplayName() });
}

// Add Text Block Element
function addTextBlockElement() {
  const textBlockElement = new TextBlockElement(50, 50, "Sample text that can wrap across multiple lines", 0, 0, 200, 3, 0, "L", 0);
  elements.push(textBlockElement);
  selectedElement = textBlockElement;
  interactionHandler.updateElements(elements);
  updateElementsList();
  renderPropertiesPanel();
  updateZPLOutput();
  renderCanvasPreview();
  pushHistory("Added Text Block", { kind: "add", detail: textBlockElement.getDisplayName() });
}

// Add Line Element
function addLineElement() {
  const lineElement = new LineElement(50, 50, 200, 3, "H");
  elements.push(lineElement);
  selectedElement = lineElement;
  interactionHandler.updateElements(elements);
  updateElementsList();
  renderPropertiesPanel();
  updateZPLOutput();
  renderCanvasPreview();
  pushHistory("Added Line", { kind: "add", detail: lineElement.getDisplayName() });
}

function serializeElement(element) {
  if (!element) return null;
  const data = JSON.parse(JSON.stringify(element));
  delete data.id;
  return data;
}

function createElementFromData(data, options = {}) {
  if (!data || !data.type) return null;
  const { keepId = false } = options;
  let element = null;
  if (data.type === "TEXT") {
    element = new TextElement(data.x, data.y, data.previewText, data.fontSize, data.fontWidth, data.placeholder, data.fontId, data.orientation, data.reverse);
  } else if (data.type === "BARCODE") {
    element = new BarcodeElement(data.x, data.y, data.previewData, data.height, data.width, data.ratio, data.placeholder, data.showText);
  } else if (data.type === "QRCODE") {
    element = new QRCodeElement(data.x, data.y, data.previewData, data.model, data.magnification, data.errorCorrection, data.placeholder);
  } else if (data.type === "BOX") {
    element = new BoxElement(data.x, data.y, data.width, data.height, data.thickness, data.color, data.rounding);
  } else if (data.type === "TEXTBLOCK") {
    element = new TextBlockElement(data.x, data.y, data.previewText, data.fontSize, data.fontWidth, data.blockWidth, data.maxLines, data.lineSpacing, data.justification, data.hangingIndent, data.placeholder, data.fontId, data.reverse);
  } else if (data.type === "LINE") {
    element = new LineElement(data.x, data.y, data.width, data.thickness, data.orientation);
  }

  if (!element) return null;
  Object.assign(element, data);
  if (!keepId) {
    element.id = Date.now() + Math.random();
  }
  return element;
}

function pasteElementFromData(data) {
  const element = createElementFromData(data);
  if (!element) return;

  const labelW = labelSettings.width * labelSettings.dpmm;
  const labelH = labelSettings.height * labelSettings.dpmm;
  const offset = 10;

  element.x = Math.max(0, element.x + offset);
  element.y = Math.max(0, element.y + offset);

  const bounds = getElementBoundsResolved(element, labelSettings);
  element.x = Math.min(element.x, Math.max(0, labelW - bounds.width));
  element.y = Math.min(element.y, Math.max(0, labelH - bounds.height));

  elements.push(element);
  selectedElement = element;
  interactionHandler.updateElements(elements);
  updateElementsList();
  renderPropertiesPanel();
  updateZPLOutput();
  renderCanvasPreview();
  pushHistory(`Pasted ${element.type}`, { kind: "paste", detail: element.getDisplayName() });
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
  const elementToDelete = elements.find((el) => String(el.id) === idStr);
  // Filter out the element with matching ID (compare as strings)
  elements = elements.filter((el) => String(el.id) !== idStr);
  if (selectedElement && String(selectedElement.id) === idStr) {
    selectedElement = null;
  }
  if (activeTransformSession && activeTransformSession.id === idStr) {
    activeTransformSession = null;
  }
  if (keyboardMoveSession && keyboardMoveSession.id === idStr) {
    keyboardMoveSession = null;
  }
  interactionHandler.updateElements(elements);
  updateElementsList();
  renderPropertiesPanel();
  updateZPLOutput();
  renderCanvasPreview();
  if (elementToDelete) {
    pushHistory(`Deleted ${elementToDelete.type}`, { kind: "delete", detail: elementToDelete.getDisplayName() });
  }
}

// Move Element Up
function moveElementUp(index) {
  if (index <= 0 || index >= elements.length) return;

  const previousPositions = captureElementListPositions();

  // Swap with the element above
  const temp = elements[index];
  elements[index] = elements[index - 1];
  elements[index - 1] = temp;

  interactionHandler.updateElements(elements);
  updateElementsList();
  animateElementListReorder(previousPositions);
  updateZPLOutput();
  renderCanvasPreview();
  pushHistory("Reordered elements", { kind: "reorder" });
}

// Move Element Down
function moveElementDown(index) {
  if (index < 0 || index >= elements.length - 1) return;

  const previousPositions = captureElementListPositions();

  // Swap with the element below
  const temp = elements[index];
  elements[index] = elements[index + 1];
  elements[index + 1] = temp;

  interactionHandler.updateElements(elements);
  updateElementsList();
  animateElementListReorder(previousPositions);
  updateZPLOutput();
  renderCanvasPreview();
  pushHistory("Reordered elements", { kind: "reorder" });
}

function captureElementListPositions() {
  const positions = new Map();
  elementsList.querySelectorAll('.element-item').forEach((item) => {
    positions.set(item.dataset.id, item.getBoundingClientRect());
  });
  return positions;
}

function animateElementListReorder(previousPositions) {
  const items = elementsList.querySelectorAll('.element-item');
  items.forEach((item) => {
    const previous = previousPositions.get(item.dataset.id);
    if (!previous) return;
    const next = item.getBoundingClientRect();
    const deltaY = previous.top - next.top;
    if (!deltaY) return;
    item.style.transition = 'none';
    item.style.transform = `translateY(${deltaY}px)`;
  });

  requestAnimationFrame(() => {
    items.forEach((item) => {
      if (!item.style.transform) return;
      item.style.transition = 'transform 0.2s ease';
      item.style.transform = 'translateY(0)';
      item.addEventListener(
        'transitionend',
        () => {
          item.style.transition = '';
          item.style.transform = '';
        },
        { once: true }
      );
    });
  });
}

// Helper to generate input HTML
function createInputGroup(label, id, value, type = "text", options = {}) {
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

function renderSection(title, body, options = {}) {
  const { open = true, elementType = null } = options;

  // Check localStorage for saved state if elementType is provided
  let isOpen = open;
  if (elementType) {
    isOpen = getSectionState(elementType, title);
  }

  // Create unique identifier for this section
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

function renderAlignmentControlsHTML(element) {
  const disableMatchSize = element?.type === "TEXT" || element?.type === "QRCODE";
  const disabledAttr = disableMatchSize ? "disabled" : "";
  const disabledClass = disableMatchSize ? "opacity-50 cursor-not-allowed hover:border-slate-200 hover:bg-white" : "";
  return renderSection(
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

function renderTextPropertiesHTML(element) {
  return `
        ${renderAlignmentControlsHTML(element)}
        ${renderSection("Position &amp; Size", `
            <div class="grid grid-cols-2 gap-3">
                ${createInputGroup("X Position", "prop-x", element.x, "number", { min: 0 })}
                ${createInputGroup("Y Position", "prop-y", element.y, "number", { min: 0 })}
            </div>
            <div class="mb-3">
                <label class="block text-xs font-medium text-slate-700 mb-1">Orientation</label>
                <select id="prop-orientation" class="w-full rounded-md border border-slate-200 py-1.5 px-2 text-xs text-slate-700 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white">
                    <option value="N" ${element.orientation === "N" ? "selected" : ""}>Normal (N)</option>
                    <option value="R" ${element.orientation === "R" ? "selected" : ""}>Rotated 90° (R)</option>
                    <option value="I" ${element.orientation === "I" ? "selected" : ""}>Inverted 180° (I)</option>
                    <option value="B" ${element.orientation === "B" ? "selected" : ""}>Bottom-Up 270° (B)</option>
                </select>
            </div>
        `, { elementType: element.type })}
        ${renderSection("Text Content", `
            ${createInputGroup("Preview Text", "prop-preview-text", element.previewText)}
            ${createInputGroup("Placeholder", "prop-placeholder", element.placeholder)}
        `, { open: true, elementType: element.type })}
        ${renderSection("Font Settings", `
            <div class="mb-3">
                <label class="block text-xs font-medium text-slate-700 mb-1">Font ID (override)</label>
                <select id="prop-font-id" class="w-full rounded-md border border-slate-200 py-1.5 px-2 text-xs text-slate-700 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white">
                    <option value="">${'Use label default'}</option>
                    ${BUILTIN_FONTS.map(id => `<option value="${id}" ${element.fontId === id ? 'selected' : ''}>${FONT_LABELS[id] || id}</option>`).join('')}
                    ${labelSettings.customFonts.map(font => `<option value="${font.id}" ${element.fontId === font.id ? 'selected' : ''}>${font.id} - Custom</option>`).join('')}
                </select>
            </div>
            <div class="grid grid-cols-2 gap-3">
                ${createInputGroup("Font Size (Height)", "prop-font-size", element.fontSize, "number", { min: 0, max: 32000, placeholder: "Use default" })}
                ${createInputGroup("Font Width", "prop-font-width", element.fontWidth, "number", { min: 0, max: 32000, placeholder: "Use default" })}
            </div>
        `, { elementType: element.type })}
        ${renderSection("Appearance", `
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

function renderBarcodePropertiesHTML(element) {
  return `
        ${renderAlignmentControlsHTML(element)}
        ${renderSection("Position &amp; Size", `
            <div class="grid grid-cols-2 gap-3">
                ${createInputGroup("X Position", "prop-x", element.x, "number", { min: 0 })}
                ${createInputGroup("Y Position", "prop-y", element.y, "number", { min: 0 })}
                ${createInputGroup("Height", "prop-height", element.height, "number", { min: 1, max: 1000 })}
                ${createInputGroup("Width Multiplier", "prop-width", element.width, "number", { min: 1, max: 10, step: 0.1 })}
            </div>
        `, { elementType: element.type })}
        ${renderSection("Content", `
            ${createInputGroup("Preview Data", "prop-preview-data", element.previewData)}
            ${createInputGroup("Placeholder", "prop-placeholder", element.placeholder)}
        `, { elementType: element.type })}
        ${renderSection("Barcode Settings", `
            ${createInputGroup("Ratio", "prop-ratio", element.ratio, "number", { min: 1, max: 10, step: 0.1 })}
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

function renderLinePropertiesHTML(element) {
  return `
        ${renderAlignmentControlsHTML(element)}
        ${renderSection("Position &amp; Size", `
            <div class="grid grid-cols-2 gap-3">
                ${createInputGroup("X Position", "prop-x", element.x, "number", { min: 0 })}
                ${createInputGroup("Y Position", "prop-y", element.y, "number", { min: 0 })}
                ${createInputGroup("Length (Width)", "prop-width", element.width, "number", { min: 1, max: 32000 })}
                ${createInputGroup("Thickness", "prop-thickness", element.thickness, "number", { min: 1, max: 32000 })}
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

function renderBoxPropertiesHTML(element) {
  return `
        ${renderAlignmentControlsHTML(element)}
        ${renderSection("Position &amp; Size", `
            <div class="grid grid-cols-2 gap-3">
                ${createInputGroup("X Position", "prop-x", element.x, "number", { min: 0 })}
                ${createInputGroup("Y Position", "prop-y", element.y, "number", { min: 0 })}
                ${createInputGroup("Width", "prop-width", element.width, "number", { min: 1, max: 32000 })}
                ${createInputGroup("Height", "prop-height", element.height, "number", { min: 1, max: 32000 })}
                ${createInputGroup("Thickness", "prop-thickness", element.thickness, "number", { min: 1, max: 32000 })}
            </div>
        `, { elementType: element.type })}
        ${renderSection("Appearance", `
            <div class="mb-3">
                <label class="block text-xs font-medium text-slate-700 mb-1">Color</label>
                <select id="prop-color" class="w-full rounded-md border border-slate-200 py-1.5 px-2 text-xs text-slate-700 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white">
                    <option value="B" ${element.color === "B" ? "selected" : ""}>Black</option>
                    <option value="W" ${element.color === "W" ? "selected" : ""}>White</option>
                </select>
            </div>
            ${createInputGroup("Rounding", "prop-rounding", element.rounding, "number", { min: 0, max: 32000 })}
        `, { open: true, elementType: element.type })}
    `;
}

function renderTextBlockPropertiesHTML(element) {
  return `
        ${renderAlignmentControlsHTML(element)}
        ${renderSection("Position &amp; Size", `
            <div class="grid grid-cols-2 gap-3">
                ${createInputGroup("X Position", "prop-x", element.x, "number", { min: 0 })}
                ${createInputGroup("Y Position", "prop-y", element.y, "number", { min: 0 })}
            </div>
        `, { elementType: element.type })}
        ${renderSection("Text Content", `
            <div class="mb-3">
                <label class="block text-xs font-medium text-slate-700 mb-1">Preview Text</label>
                <textarea
                    id="prop-preview-text"
                    rows="3"
                    class="w-full rounded-md border border-slate-200 py-1.5 px-2 text-xs text-slate-700 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white"
                >${element.previewText}</textarea>
            </div>
            ${createInputGroup("Placeholder", "prop-placeholder", element.placeholder)}
        `, { elementType: element.type })}
        ${renderSection("Font Settings", `
            <div class="mb-3">
                <label class="block text-xs font-medium text-slate-700 mb-1">Font ID (override)</label>
                <select id="prop-font-id" class="w-full rounded-md border border-slate-200 py-1.5 px-2 text-xs text-slate-700 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white">
                    <option value="">${'Use label default'}</option>
                    ${BUILTIN_FONTS.map(id => `<option value="${id}" ${element.fontId === id ? 'selected' : ''}>${FONT_LABELS[id] || id}</option>`).join('')}
                    ${labelSettings.customFonts.map(font => `<option value="${font.id}" ${element.fontId === font.id ? 'selected' : ''}>${font.id} - Custom</option>`).join('')}
                </select>
            </div>
            <div class="grid grid-cols-2 gap-3">
                ${createInputGroup("Font Size (Height)", "prop-font-size", element.fontSize, "number", { min: 0, max: 32000, placeholder: "Use default" })}
                ${createInputGroup("Font Width", "prop-font-width", element.fontWidth, "number", { min: 0, max: 32000, placeholder: "Use default" })}
            </div>
        `, { elementType: element.type })}
        ${renderSection("Block Configuration", `
            <div class="grid grid-cols-2 gap-3">
                ${createInputGroup("Block Width (dots)", "prop-block-width", element.blockWidth, "number", { min: 0, max: 32000 })}
                ${createInputGroup("Max Lines", "prop-max-lines", element.maxLines, "number", { min: 1, max: 9999 })}
                ${createInputGroup("Line Spacing", "prop-line-spacing", element.lineSpacing, "number", { min: -9999, max: 9999 })}
                ${createInputGroup("Hanging Indent (dots)", "prop-hanging-indent", element.hangingIndent, "number", { min: 0, max: 9999 })}
            </div>
        `, { open: true, elementType: element.type })}
        ${renderSection("Alignment", `
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
        ${renderSection("Appearance", `
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

function renderQRCodePropertiesHTML(element) {
  return `
        ${renderAlignmentControlsHTML(element)}
        ${renderSection("Position &amp; Size", `
            <div class="grid grid-cols-2 gap-3">
                ${createInputGroup("X Position", "prop-x", element.x, "number", { min: 0 })}
                ${createInputGroup("Y Position", "prop-y", element.y, "number", { min: 0 })}
                ${createInputGroup("Magnification", "prop-magnification", element.magnification, "number", { min: 1, max: 10 })}
            </div>
        `, { elementType: element.type })}
        ${renderSection("Content", `
            <div class="mb-3">
                <label class="block text-xs font-medium text-slate-700 mb-1">Preview Data</label>
                <textarea
                    id="prop-preview-data"
                    rows="2"
                    class="w-full rounded-md border border-slate-200 py-1.5 px-2 text-xs text-slate-700 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white"
                >${element.previewData}</textarea>
            </div>
            ${createInputGroup("Placeholder", "prop-placeholder", element.placeholder)}
        `, { elementType: element.type })}
        ${renderSection("QR Settings", `
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


function applyAlignmentAction(action, element) {
  if (!element) return;
  const labelSize = getLabelSizeDots(labelSettings);
  const bounds = getElementBoundsSafe(element);

  if (action === "center-x") {
    const centeredX = Math.round((labelSize.width - bounds.width) / 2);
    element.x = Math.max(0, centeredX);
    return;
  }

  if (action === "center-y") {
    const centeredY = Math.round((labelSize.height - bounds.height) / 2);
    element.y = Math.max(0, centeredY);
    return;
  }

  if (action === "match-width") {
    element.x = 0;
    if (element.type === "BOX") {
      element.width = labelSize.width;
    } else if (element.type === "LINE") {
      if (element.orientation === "H") {
        element.width = labelSize.width;
      } else {
        element.thickness = labelSize.width;
      }
    } else if (element.type === "TEXTBLOCK") {
      element.blockWidth = labelSize.width;
    } else if (element.type === "BARCODE") {
      const dataLength = (element.previewData || "").length;
      const totalModules = 35 + (11 * dataLength);
      const targetMultiplier = totalModules > 0 ? labelSize.width / totalModules : element.width;
      const rounded = Math.round(targetMultiplier * 10) / 10;
      element.width = clampNumber(rounded, 1, 10);
    } else if (element.type === "QRCODE") {
      const dataLength = (element.previewData || "").length;
      const version = calculateQRVersion(dataLength, element.errorCorrection);
      const modules = qrVersionToModules(version);
      const targetMag = modules > 0 ? Math.round(labelSize.width / modules) : element.magnification;
      element.magnification = clampNumber(targetMag, 1, 10);
    } else if (element.type === "TEXT") {
      const textLength = (element.previewText || "").length;
      if (textLength > 0) {
        const resolvedWidth = element.fontWidth || labelSettings.defaultFontWidth || 30;
        const currentWidth = Math.max(textLength * resolvedWidth * 0.6, 50);
        const scale = labelSize.width / currentWidth;
        element.fontWidth = clampNumber(Math.round(resolvedWidth * scale), 1, 32000);
      }
    }
    return;
  }

  if (action === "match-height") {
    element.y = 0;
    if (element.type === "BOX") {
      element.height = labelSize.height;
    } else if (element.type === "LINE") {
      if (element.orientation === "V") {
        element.width = labelSize.height;
      } else {
        element.thickness = labelSize.height;
      }
    } else if (element.type === "BARCODE") {
      element.height = labelSize.height;
    } else if (element.type === "QRCODE") {
      const dataLength = (element.previewData || "").length;
      const version = calculateQRVersion(dataLength, element.errorCorrection);
      const modules = qrVersionToModules(version);
      const targetMag = modules > 0 ? Math.round(labelSize.height / modules) : element.magnification;
      element.magnification = clampNumber(targetMag, 1, 10);
    } else if (element.type === "TEXTBLOCK") {
      const fontSize = element.fontSize || labelSettings.defaultFontHeight || 30;
      const estimatedLines = Math.max(1, Math.round(labelSize.height / fontSize));
      element.maxLines = clampNumber(estimatedLines, 1, 9999);
    } else if (element.type === "TEXT") {
      const currentHeight = element.fontSize || labelSettings.defaultFontHeight || 30;
      const scale = labelSize.height / currentHeight;
      element.fontSize = clampNumber(Math.round(currentHeight * scale), 1, 32000);
    }
  }
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
      scheduleHistoryCommit(`element-${element.id}`, `Updated ${element.type} properties`, {
        kind: "edit",
        detail: element.getDisplayName()
      });
    });
  };

  const attachAction = (id, action) => {
    const button = document.getElementById(id);
    if (!button) return;
    button.addEventListener("click", () => {
      applyAlignmentAction(action, element);
      updateZPLOutput();
      updateElementsList();
      renderCanvasPreview();
      renderPropertiesPanel();
      scheduleHistoryCommit(`element-${element.id}`, `Aligned ${element.type}`, {
        kind: "align",
        detail: element.getDisplayName()
      });
    });
  };

  attachAction("prop-center-x", "center-x");
  attachAction("prop-center-y", "center-y");
  attachAction("prop-match-width", "match-width");
  attachAction("prop-match-height", "match-height");

  attach("prop-x", "x", (v) => parseInt(v) || 0);
  attach("prop-y", "y", (v) => parseInt(v) || 0);

  if (element.type === "TEXT") {
    attach("prop-placeholder", "placeholder");
    attach("prop-preview-text", "previewText");
    attach("prop-font-id", "fontId");
    attach("prop-font-size", "fontSize", (v) => parseInt(v) || 0);
    attach("prop-font-width", "fontWidth", (v) => parseInt(v) || 0);
    attach("prop-orientation", "orientation");
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
        updateZPLOutput();
        renderCanvasPreview();
        setReverseActive(value);
        scheduleHistoryCommit(`element-${element.id}`, `Updated ${element.type} properties`, {
          kind: "edit",
          detail: element.getDisplayName()
        });
      });
    });
  } else if (element.type === "BARCODE") {
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
        updateZPLOutput();
        updateElementsList();
        renderCanvasPreview();
        scheduleHistoryCommit(`element-${element.id}`, `Updated ${element.type} properties`, {
          kind: "edit",
          detail: element.getDisplayName()
        });
      });
    }
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
    attach("prop-font-size", "fontSize", (v) => parseInt(v) || 0);
    attach("prop-font-width", "fontWidth", (v) => parseInt(v) || 0);
    attach("prop-block-width", "blockWidth", (v) => parseInt(v) || 200);
    attach("prop-max-lines", "maxLines", (v) => parseInt(v) || 1);
    attach("prop-line-spacing", "lineSpacing", (v) => parseInt(v) || 0);
    attach("prop-hanging-indent", "hangingIndent", (v) => parseInt(v) || 0);
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
        updateZPLOutput();
        renderCanvasPreview();
        setReverseActive(value);
        scheduleHistoryCommit(`element-${element.id}`, `Updated ${element.type} properties`, {
          kind: "edit",
          detail: element.getDisplayName()
        });
      });
    });
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
        updateZPLOutput();
        renderCanvasPreview();
        setJustificationActive(value);
        scheduleHistoryCommit(`element-${element.id}`, `Updated ${element.type} properties`, {
          kind: "edit",
          detail: element.getDisplayName()
        });
      });
    });
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

  // Attach section toggle listeners for state persistence
  attachSectionToggleListeners();
}

function attachSectionToggleListeners() {
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
        setSectionState(elementType, sectionTitle, isOpen);
      }, 0);
    };

    details.addEventListener('toggle', toggleHandler);
  });
}

// Update ZPL Output
function updateZPLOutput() {
  if (elements.length === 0) {
    zplOutput.value = "";
    return;
  }

  // Build ZPL with settings commands
  const { width, dpmm, homeX: hx, homeY: hy, labelTop: lt, printOrientation: po, mediaDarkness: md, printSpeed: ps, slewSpeed: ss, backfeedSpeed: bs, fontId: fid, customFonts, defaultFontHeight: dfh, defaultFontWidth: dfw } = labelSettings;

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

  // Add custom font configuration commands (^CW for each custom font)
  if (customFonts && customFonts.length > 0) {
    customFonts.forEach(font => {
      zplHeader += `^CW${font.id},${font.fontFile}\n`;
    });
  }
  zplHeader += `^CF${fid},${dfh},${dfw}\n`;

  const zplCommands = elements.map((element) => element.render(fid)).join("\n");
  zplOutput.value = `${zplHeader}${zplCommands}\n^XZ`;
}

// Cache for API preview
let lastPreviewZpl = null;
let lastPreviewImageUrl = null;

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
  const { width, height, dpmm, homeX: hx, homeY: hy, labelTop: lt, printOrientation: po, mediaDarkness: md, printSpeed: ps, slewSpeed: ss, backfeedSpeed: bs, fontId: fid, fontFile: ffile, defaultFontHeight: dfh, defaultFontWidth: dfw } = labelSettings;

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
  zplHeader += `^CF${fid},${dfh},${dfw}\n`;

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

  // Check cache - if ZPL hasn't changed, reuse the existing image
  if (previewZpl === lastPreviewZpl && lastPreviewImageUrl) {
    previewImage.src = lastPreviewImageUrl;
    previewImage.classList.remove('hidden');
    return;
  }

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

    // Clean up old cached image URL
    if (lastPreviewImageUrl) {
      URL.revokeObjectURL(lastPreviewImageUrl);
    }

    // Cache the new ZPL and image URL
    lastPreviewZpl = previewZpl;
    lastPreviewImageUrl = imageUrl;

    previewImage.src = imageUrl;
    previewImage.classList.remove('hidden');

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
  if (template.labelSettings.defaultFontWidth !== undefined) {
    labelSettings.defaultFontWidth = template.labelSettings.defaultFontWidth;
    defaultFontWidth.value = labelSettings.defaultFontWidth;
  }
  if (template.labelSettings.customFonts !== undefined && Array.isArray(template.labelSettings.customFonts)) {
    labelSettings.customFonts = template.labelSettings.customFonts;
    renderCustomFonts();
    updateFontDropdownOptions();
  }

  // Recreate elements from template
  template.elements.forEach((elementData) => {
    let element;

    if (elementData.type === "TEXT") {
      element = new TextElement(
        elementData.x || 0,
        elementData.y || 0,
        elementData.previewText || elementData.text || "",
        elementData.fontSize !== undefined ? elementData.fontSize : 0,
        elementData.fontWidth !== undefined ? elementData.fontWidth : 0,
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
        elementData.fontSize !== undefined ? elementData.fontSize : 0,
        elementData.fontWidth !== undefined ? elementData.fontWidth : 0,
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
  resetHistory("Imported template", { kind: "import" });
}

function handleHistoryClick(e) {
  const button = e.target.closest("[data-history-index]");
  if (!button) return;
  const index = parseInt(button.dataset.historyIndex, 10);
  if (Number.isNaN(index) || index === historyIndex) return;
  historyIndex = index;
  applyAppState(historyEntries[historyIndex].state);
}

function openHistoryPanel() {
  historyPanel.classList.add("open");
  historyBackdrop.classList.add("open");
}

function closeHistoryPanel() {
  historyPanel.classList.remove("open");
  historyBackdrop.classList.remove("open");
}
