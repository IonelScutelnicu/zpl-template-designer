// Application imports
import { CanvasRenderer } from './canvas-renderer.js';
import { InteractionHandler } from './interaction-handler.js';
import { HISTORY_LIMIT, BUILTIN_FONTS, FONT_LABELS } from './config/constants.js';
import { AppState } from './state/AppState.js';
import { ElementService } from './services/ElementService.js';
import { AlignmentService } from './services/AlignmentService.js';
import { SerializationService } from './services/SerializationService.js';
import { ZPLGenerator } from './services/ZPLGenerator.js';
import { TemplateManager } from './services/TemplateManager.js';
import { PropertiesPanelRenderer } from './ui/PropertiesPanelRenderer.js';
import { ElementsListRenderer } from './ui/ElementsListRenderer.js';
import { HistoryPanel } from './ui/HistoryPanel.js';
import { CustomFontsManager } from './ui/CustomFontsManager.js';
import { PropertyListenersManager } from './ui/PropertyListenersManager.js';

// Initialize centralized state management
const state = new AppState();

// Initialize services
const serializationService = new SerializationService();
const alignmentService = new AlignmentService();
const zplGenerator = new ZPLGenerator();
const templateManager = new TemplateManager(serializationService);
let elementService; // Initialized after pushHistory is defined

// Initialize UI renderers (getSectionState will be available later)
let propertiesPanelRenderer;
const elementsListRenderer = new ElementsListRenderer();

// Export state for use in other modules
export { state };

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

// Initialize properties panel renderer (after helper functions are defined)
propertiesPanelRenderer = new PropertiesPanelRenderer(() => state.labelSettings, getSectionState);

// Initialize UI renderers (will be fully initialized after DOM elements are loaded)
let historyPanelUI;
let customFontsManager;
let propertyListenersManager;

// DOM Elements
const addTextBtn = document.getElementById("add-text-btn");
const addBarcodeBtn = document.getElementById("add-barcode-btn");
const addQRCodeBtn = document.getElementById("add-qrcode-btn");
const addBoxBtn = document.getElementById("add-box-btn");
const addTextBlockBtn = document.getElementById("add-textblock-btn");
const addLineBtn = document.getElementById("add-line-btn");
const addCircleBtn = document.getElementById("add-circle-btn");
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
const orientationButtons = document.querySelectorAll('[data-orientation]');
const mirrorButtons = document.querySelectorAll('[data-mirror]');

const setOrientationActive = (value) => {
  orientationButtons.forEach(btn => {
    const isActive = btn.getAttribute('data-orientation') === value;
    btn.className = `px-3 py-1 text-xs rounded transition-colors ${isActive ? 'bg-white text-blue-600 shadow' : 'text-slate-500 hover:bg-slate-200'}`;
  });
};

const setMirrorActive = (value) => {
  mirrorButtons.forEach(btn => {
    const isActive = btn.getAttribute('data-mirror') === value;
    btn.className = `px-3 py-1 text-xs rounded transition-colors ${isActive ? 'bg-white text-blue-600 shadow' : 'text-slate-500 hover:bg-slate-200'}`;
  });
};
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

  // Initialize history panel UI
  historyPanelUI = new HistoryPanel(
    { panel: historyPanel, backdrop: historyBackdrop, list: historyList },
    (index) => {
      if (index === state.getHistoryIndex()) return;
      state.setHistoryIndex(index);
      const historyEntries = state.getHistoryEntries();
      applyAppState(historyEntries[state.getHistoryIndex()].state);
    }
  );

  // Initialize custom fonts manager
  customFontsManager = new CustomFontsManager(
    {
      newFontId,
      newFontFile,
      list: customFontsList,
      error: customFontError,
      fontDropdown: fontId
    },
    BUILTIN_FONTS,
    {
      onRemove: (fontId) => removeCustomFont(fontId),
      onUpdateFile: (fontId, newFile) => updateCustomFontFile(fontId, newFile),
      onRender: () => renderCustomFonts()
    }
  );

  // Initialize property listeners manager
  propertyListenersManager = new PropertyListenersManager({
    onPropertyChange: (element) => {
      updateZPLOutput();
      updateElementsList();
      renderCanvasPreview();
      scheduleHistoryCommit(`element-${element.id}`, `Updated ${element.type} properties`, {
        kind: "edit",
        detail: element.getDisplayName()
      });
    },
    onAlignmentAction: (action, element) => {
      applyAlignmentAction(action, element);
      updateZPLOutput();
      updateElementsList();
      renderCanvasPreview();
      renderPropertiesPanel();
      scheduleHistoryCommit(`element-${element.id}`, `Aligned ${element.type}`, {
        kind: "align",
        detail: element.getDisplayName()
      });
    },
    onSectionToggle: (elementType, sectionTitle, isOpen) => {
      setSectionState(elementType, sectionTitle, isOpen);
    }
  });

  // Initialize element service with callbacks
  elementService = new ElementService(state, {
    onElementsChanged: () => {
      interactionHandler.updateElements(state.elements);
      updateElementsList();
      renderPropertiesPanel();
      updateZPLOutput();
      renderCanvasPreview();
    },
    onPushHistory: (label, options) => pushHistory(label, options)
  });

  // Initialize interaction handler
  interactionHandler = new InteractionHandler(canvasRenderer, state.elements, state.labelSettings, {
    onElementSelected: (element) => {
      state.setSelectedElement(element);
      updateElementsList();
      renderPropertiesPanel();
      renderCanvasPreview();
    },
    onElementDragging: (element) => {
      // Update canvas in real-time during drag
      renderCanvasPreview();
      // Update properties panel X/Y inputs if properties panel is showing this element
      if (state.selectedElement && state.selectedElement.id === element.id) {
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
  addCircleBtn.addEventListener("click", addCircleElement);
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
    state.updateLabelSettings({ width: parseFloat(e.target.value) || 100 });
    updateZPLOutput();
    renderCanvasPreview();
    scheduleHistoryCommit("label-settings", "Updated label settings", { kind: "settings" });
  });

  labelHeight.addEventListener("input", (e) => {
    state.updateLabelSettings({ height: parseFloat(e.target.value) || 50 });
    renderCanvasPreview();
    scheduleHistoryCommit("label-settings", "Updated label settings", { kind: "settings" });
  });

  labelDpmm.addEventListener("change", (e) => {
    state.updateLabelSettings({ dpmm: parseInt(e.target.value) || 8 });
    updateZPLOutput();
    renderCanvasPreview();
    scheduleHistoryCommit("label-settings", "Updated label settings", { kind: "settings" });
  });

  orientationButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const value = btn.getAttribute('data-orientation');
      state.updateLabelSettings({ printOrientation: value });
      setOrientationActive(value);
      updateZPLOutput();
      renderCanvasPreview();
      scheduleHistoryCommit("label-settings", "Updated label settings", { kind: "settings" });
    });
  });

  mirrorButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const value = btn.getAttribute('data-mirror');
      state.updateLabelSettings({ printMirror: value });
      setMirrorActive(value);
      updateZPLOutput();
      renderCanvasPreview();
      scheduleHistoryCommit("label-settings", "Updated label settings", { kind: "settings" });
    });
  });

  mediaDarkness.addEventListener("input", (e) => {
    state.updateLabelSettings({ mediaDarkness: parseInt(e.target.value) || 25 });
    updateZPLOutput();
    scheduleHistoryCommit("label-settings", "Updated label settings", { kind: "settings" });
  });

  printSpeed.addEventListener("input", (e) => {
    state.updateLabelSettings({ printSpeed: parseInt(e.target.value) || 4 });
    updateZPLOutput();
    scheduleHistoryCommit("label-settings", "Updated label settings", { kind: "settings" });
  });

  slewSpeed.addEventListener("input", (e) => {
    state.updateLabelSettings({ slewSpeed: parseInt(e.target.value) || 4 });
    updateZPLOutput();
    scheduleHistoryCommit("label-settings", "Updated label settings", { kind: "settings" });
  });

  backfeedSpeed.addEventListener("input", (e) => {
    state.updateLabelSettings({ backfeedSpeed: parseInt(e.target.value) || 4 });
    updateZPLOutput();
    scheduleHistoryCommit("label-settings", "Updated label settings", { kind: "settings" });
  });

  // Font settings event listeners
  fontId.addEventListener("change", (e) => {
    state.updateLabelSettings({ fontId: e.target.value || "0" });
    updateZPLOutput();
    renderCanvasPreview();
    scheduleHistoryCommit("label-settings", "Updated label settings", { kind: "settings" });
  });

  // Custom fonts management
  addCustomFontBtn.addEventListener("click", addCustomFont);

  defaultFontHeight.addEventListener("input", (e) => {
    state.updateLabelSettings({ defaultFontHeight: parseInt(e.target.value) || 20 });
    updateZPLOutput();
    scheduleHistoryCommit("label-settings", "Updated label settings", { kind: "settings" });
  });

  defaultFontWidth.addEventListener("input", (e) => {
    state.updateLabelSettings({ defaultFontWidth: parseInt(e.target.value) || 20 });
    updateZPLOutput();
    scheduleHistoryCommit("label-settings", "Updated label settings", { kind: "settings" });
  });

  // Position offset event listeners
  homeX.addEventListener("input", (e) => {
    state.updateLabelSettings({ homeX: parseInt(e.target.value) || 0 });
    updateZPLOutput();
    renderCanvasPreview();
    scheduleHistoryCommit("label-settings", "Updated label settings", { kind: "settings" });
  });

  homeY.addEventListener("input", (e) => {
    state.updateLabelSettings({ homeY: parseInt(e.target.value) || 0 });
    updateZPLOutput();
    renderCanvasPreview();
    scheduleHistoryCommit("label-settings", "Updated label settings", { kind: "settings" });
  });

  labelTop.addEventListener("input", (e) => {
    state.updateLabelSettings({ labelTop: parseInt(e.target.value) || 0 });
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
      if (!isNaN(index) && index < state.elements.length - 1) {
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
        const element = state.elements.find((el) => String(el.id) === idStr);
        if (element) {
          state.setSelectedElement(element);
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
  canvasRenderer.renderCanvas(state.elements, state.labelSettings, state.selectedElement);
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

function serializeAppState() {
  return state.serialize();
}

function syncLabelSettingsInputs() {
  labelWidth.value = state.labelSettings.width;
  labelHeight.value = state.labelSettings.height;
  labelDpmm.value = state.labelSettings.dpmm;
  homeX.value = state.labelSettings.homeX;
  homeY.value = state.labelSettings.homeY;
  labelTop.value = state.labelSettings.labelTop;
  setOrientationActive(state.labelSettings.printOrientation);
  setMirrorActive(state.labelSettings.printMirror);
  mediaDarkness.value = state.labelSettings.mediaDarkness;
  printSpeed.value = state.labelSettings.printSpeed;
  slewSpeed.value = state.labelSettings.slewSpeed;
  backfeedSpeed.value = state.labelSettings.backfeedSpeed;
  fontId.value = state.labelSettings.fontId;
  renderCustomFonts();
  defaultFontHeight.value = state.labelSettings.defaultFontHeight;
  defaultFontWidth.value = state.labelSettings.defaultFontWidth;
}

function addCustomFont() {
  const id = newFontId.value;
  const file = newFontFile.value;

  const newFonts = customFontsManager.add(id, file, state.labelSettings.customFonts);
  if (newFonts === null) {
    return; // Validation failed, error already shown
  }

  state.updateLabelSettings({ customFonts: newFonts });
  renderCustomFonts();
  updateFontDropdownOptions();
  updateZPLOutput();
  scheduleHistoryCommit("custom-fonts", "Added custom font", { kind: "settings" });
}

function removeCustomFont(id) {
  const customFonts = customFontsManager.remove(id, state.labelSettings.customFonts);
  state.updateLabelSettings({ customFonts });
  renderCustomFonts();
  updateFontDropdownOptions();
  updateZPLOutput();
  scheduleHistoryCommit("custom-fonts", "Removed custom font", { kind: "settings" });
}

function renderCustomFonts() {
  customFontsManager.render(state.labelSettings.customFonts);
}


function updateCustomFontFile(fontId, newFontFile) {
  const customFonts = customFontsManager.updateFile(fontId, newFontFile, state.labelSettings.customFonts);
  state.updateLabelSettings({ customFonts });
  updateZPLOutput();
  scheduleHistoryCommit("label-settings", "Updated custom font", { kind: "settings" });
  renderCustomFonts();
}

function updateFontDropdownOptions() {
  customFontsManager.updateFontDropdown(state.labelSettings.customFonts);
}


function applyAppState(stateData) {
  if (!stateData) return;
  state.setApplyingHistory(true);
  state.setActiveTransformSession(null);
  state.setKeyboardMoveSession(null);

  state.restore(stateData, createElementFromData);
  interactionHandler.updateElements(state.elements);

  syncLabelSettingsInputs();

  updateElementsList();
  renderPropertiesPanel();
  updateZPLOutput();
  renderCanvasPreview();

  state.setApplyingHistory(false);
  updateUndoRedoUI();
  renderHistoryList();
}

function pushHistory(label, options = {}) {
  if (state.isApplyingHistory() && !options.force) return;
  const entry = {
    id: Date.now() + Math.random(),
    label,
    timestamp: new Date(),
    state: serializeAppState(),
    kind: options.kind || "edit",
    detail: options.detail || ""
  };

  state.addHistoryEntry(entry);
  updateUndoRedoUI();
  renderHistoryList();
}

function resetHistory(label, options = {}) {
  state.resetHistory();
  pushHistory(label, { force: true, kind: options.kind, detail: options.detail });
}

function scheduleHistoryCommit(key, label, options = {}) {
  if (state.isApplyingHistory()) return;
  const delay = options.delay ?? 300;

  state.clearHistoryCommitTimer(key);

  const timer = setTimeout(() => {
    state.deleteHistoryCommitTimer(key);
    pushHistory(label, { kind: options.kind, detail: options.detail });
  }, delay);

  state.setHistoryCommitTimer(key, timer);
}

function updateUndoRedoUI() {
  const historyIndex = state.getHistoryIndex();
  const historyEntries = state.getHistoryEntries();
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
  const html = historyPanelUI.renderList(state.getHistoryEntries(), state.getHistoryIndex());
  historyList.innerHTML = html;
}

function undo() {
  const historyIndex = state.getHistoryIndex();
  if (historyIndex <= 0) return;
  state.setHistoryIndex(historyIndex - 1);
  const historyEntries = state.getHistoryEntries();
  applyAppState(historyEntries[state.getHistoryIndex()].state);
}

function redo() {
  const historyIndex = state.getHistoryIndex();
  const historyEntries = state.getHistoryEntries();
  if (historyIndex >= historyEntries.length - 1) return;
  state.setHistoryIndex(historyIndex + 1);
  applyAppState(historyEntries[state.getHistoryIndex()].state);
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
  state.setActiveTransformSession({
    id: String(element.id),
    mode,
    before: getElementTransformState(element)
  });
}

function finalizeTransformSession(element) {
  const activeTransformSession = state.getActiveTransformSession();
  if (!activeTransformSession || !element) return;
  if (String(element.id) !== activeTransformSession.id) {
    state.setActiveTransformSession(null);
    return;
  }

  const after = getElementTransformState(element);
  if (JSON.stringify(after) !== JSON.stringify(activeTransformSession.before)) {
    const isResize = activeTransformSession.mode === "resize";
    const label = isResize ? `Resized ${element.type}` : `Moved ${element.type}`;
    pushHistory(label, { kind: isResize ? "resize" : "move", detail: element.getDisplayName() });
  }

  state.setActiveTransformSession(null);
}

function startKeyboardMoveSession(element) {
  if (!element) return;
  if (state.getKeyboardMoveSession()) return;
  state.setKeyboardMoveSession({
    id: String(element.id),
    before: { x: element.x, y: element.y }
  });
}

function endKeyboardMoveSession(element) {
  const keyboardMoveSession = state.getKeyboardMoveSession();
  if (!keyboardMoveSession) return;
  const target = element && String(element.id) === keyboardMoveSession.id
    ? element
    : state.elements.find((el) => String(el.id) === keyboardMoveSession.id);

  if (target && (target.x !== keyboardMoveSession.before.x || target.y !== keyboardMoveSession.before.y)) {
    pushHistory(`Moved ${target.type} (keyboard)`, { kind: "move", detail: target.getDisplayName() });
  }

  state.setKeyboardMoveSession(null);
}

// Add Element Functions (delegated to ElementService)
function addTextElement() {
  elementService.createElement('TEXT', { text: 'Sample Text', orientation: 'N' });
}

function addBarcodeElement() {
  elementService.createElement('BARCODE', { data: '1234567890', height: 50, width: 2, ratio: 2.0 });
}

function addQRCodeElement() {
  elementService.createElement('QRCODE', { data: 'https://example.com', model: 2, magnification: 5, errorCorrection: 'Q' });
}

function addBoxElement() {
  elementService.createElement('BOX', { width: 100, height: 50, thickness: 3, color: 'B', rounding: 0 });
}

function addTextBlockElement() {
  elementService.createElement('TEXTBLOCK', { text: 'Sample text that can wrap across multiple lines', blockWidth: 200, maxLines: 3, justification: 'L' });
}

function addLineElement() {
  elementService.createElement('LINE', { width: 200, thickness: 3, orientation: 'H' });
}

function addCircleElement() {
  elementService.createElement('CIRCLE', { width: 80, height: 80, thickness: 3, color: 'B' });
}

// Serialization functions (delegated to SerializationService)
function serializeElement(element) {
  return serializationService.serializeElement(element);
}

function serializeElementWithId(element) {
  return serializationService.serializeElementWithId(element);
}

function createElementFromData(data, options = {}) {
  return serializationService.createElementFromData(data, options);
}

function pasteElementFromData(data) {
  elementService.pasteElement(data, createElementFromData);
}

// Render Properties Panel
function renderPropertiesPanel() {
  const html = propertiesPanelRenderer.render(state.selectedElement);
  propertiesPanel.innerHTML = html;

  if (state.selectedElement) {
    attachPropertyListeners(state.selectedElement);
  }
}

// Update Elements List
function updateElementsList() {
  const html = elementsListRenderer.render(state.elements, state.selectedElement);
  elementsList.innerHTML = html;
}

// Element operations (delegated to ElementService)
function deleteElement(id) {
  elementService.deleteElement(id);
}

function moveElementUp(index) {
  const previousPositions = captureElementListPositions();
  if (elementService.moveElement(index, 'up')) {
    animateElementListReorder(previousPositions);
  }
}

function moveElementDown(index) {
  const previousPositions = captureElementListPositions();
  if (elementService.moveElement(index, 'down')) {
    animateElementListReorder(previousPositions);
  }
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



// Alignment operations (delegated to AlignmentService)
function applyAlignmentAction(action, element) {
  alignmentService.applyAlignment(action, element, state.labelSettings, canvasRenderer);
}

function attachPropertyListeners(element) {
  propertyListenersManager.attachListeners(element, propertiesPanel);
}

// Update ZPL Output
function updateZPLOutput() {
  const zpl = zplGenerator.generateZPL(state.elements, state.labelSettings);
  zplOutput.value = zpl;
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

  if (state.elements.length === 0) {
    previewPlaceholder.classList.remove('hidden');
    return;
  }

  // Generate preview ZPL
  const previewZpl = zplGenerator.generatePreviewZPL(state.elements, state.labelSettings, state.selectedElement);
  const { width, height, dpmm } = state.labelSettings;

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
  templateManager.exportToFile(state.elements, state.labelSettings);
}

// Handle File Import
function handleFileImport(event) {
  templateManager.handleFileImport(
    event,
    (template) => importTemplate(template),
    (error) => alert("Error importing template: " + error)
  );
}

// Import Template from JSON
function importTemplate(template) {
  // Clear current elements
  state.setElements([]);
  state.setSelectedElement(null);

  // Import label settings
  state.updateLabelSettings(template.labelSettings);
  syncLabelSettingsInputs();

  if (template.labelSettings.customFonts !== undefined && Array.isArray(template.labelSettings.customFonts)) {
    renderCustomFonts();
    updateFontDropdownOptions();
  }

  // Recreate elements from template
  const importedElements = template.elements
    .map(elementData => createElementFromData(elementData, { keepId: false }))
    .filter(element => element !== null);

  // Set all imported elements at once
  state.setElements(importedElements);

  // Update UI
  interactionHandler.updateElements(state.elements);
  updateElementsList();
  renderPropertiesPanel();
  updateZPLOutput();
  renderCanvasPreview();
  resetHistory("Imported template", { kind: "import" });
}

function handleHistoryClick(e) {
  historyPanelUI.handleClick(e);
}

function openHistoryPanel() {
  historyPanelUI.open();
}

function closeHistoryPanel() {
  historyPanelUI.close();
}
