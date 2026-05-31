// Application imports
import { CanvasRenderer } from './canvas-renderer.js';
import { InteractionHandler } from './interaction-handler.js';
import { BUILTIN_FONTS } from './config/constants.js';
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
import { TooltipManager } from './ui/TooltipManager.js';
import { WarningParser } from './services/WarningParser.js';
import { WarningsPanelRenderer } from './ui/WarningsPanelRenderer.js';
import { highlightZPL } from './utils/zpl-highlighter.js';
import { ZPLParser } from './services/ZPLParser.js';
import { UrlShareService } from './services/UrlShareService.js';
import { SmartGuideService } from './services/SmartGuideService.js';
import { ContextMenu } from './ui/ContextMenu.js';
import { OnboardingWalkthrough } from './ui/OnboardingWalkthrough.js';
import { FullscreenController } from './ui/FullscreenController.js';
import { ConfirmModal } from './ui/ConfirmModal.js';
import { imageToBitmap } from './utils/graphicField.js';
import { escapeHtml, escapeAttr } from './utils/dom-helpers.js';
import { DriveTemplateService } from './services/DriveTemplateService.js';
import * as driveAuth from './services/DriveAuth.js';
import { isConfigured as isDriveConfigured } from './config/drive-config.js';
import { getCurrentView } from './router.js';
import { normalizeElementFontSize } from './utils/zplFontSnap.js';

// Initialize centralized state management
const state = new AppState();

// Initialize services
const serializationService = new SerializationService();
const alignmentService = new AlignmentService();
const zplGenerator = new ZPLGenerator();
const templateManager = new TemplateManager(serializationService);
const zplParser = new ZPLParser();
const urlShareService = new UrlShareService(serializationService);
const smartGuideService = new SmartGuideService();
const driveTemplateService = new DriveTemplateService();
let elementService; // Initialized after pushHistory is defined
let currentTemplateMetadata = null;

// Drive document state — tracks the editor's relationship with Drive.
const driveDoc = {
  fileId: null,        // null = unsaved
  folderId: null,
  dirty: false,
  saving: false,
  lastSavedAt: null,
  driveMode: false, // 'create' = Save As, 'update' = Rename/edit existing, false = Export JSON
};

// Guards against repeat Drive fetches when the user re-enters the editor view
// with the same ?drive=<id> still in the URL.
let lastLoadedDriveId = null;

function rehydrateFromHandoff() {
  const galleryTemplateJson = sessionStorage.getItem('gallery_template');
  if (galleryTemplateJson) {
    sessionStorage.removeItem('gallery_template');
    try {
      const galleryTemplate = JSON.parse(galleryTemplateJson);
      if (galleryTemplate.elements && galleryTemplate.labelSettings) {
        importTemplate(galleryTemplate);
      }
      if (galleryTemplate.driveFileId) {
        driveDoc.fileId = galleryTemplate.driveFileId;
        driveDoc.folderId = galleryTemplate.driveFolderId || null;
        lastLoadedDriveId = galleryTemplate.driveFileId;
        markClean();
        syncEditorUrlForDrive();
        updateDriveSaveBtnState();
      }
    } catch (err) {
      console.warn('Failed to load gallery template:', err);
    }
    return;
  }

  // No sessionStorage payload — fall back to URL ?drive=<id>.
  const urlParams = new URLSearchParams(window.location.search);
  const driveId = urlParams.get('drive');
  if (driveId && driveId !== lastLoadedDriveId && driveAuth.isConnected()) {
    lastLoadedDriveId = driveId;
    driveTemplateService.load(driveId).then(({ json, meta }) => {
      const template = {
        metadata: json.metadata || { name: (meta.name || '').replace(/\.json$/i, '') },
        elements: json.elements || [],
        labelSettings: json.labelSettings || {},
      };
      importTemplate(template);
      driveDoc.fileId = meta.id;
      driveDoc.folderId = (meta.parents && meta.parents[0]) || null;
      markClean();
      updateDriveSaveBtnState();
    }).catch((err) => {
      console.warn('Failed to load Drive template by URL:', err);
      showToast('Couldn\'t load template from Drive: ' + (err.message || ''), 'error');
    });
  }
}

// Single-slot registry for outside-click listeners attached to `document`.
// Re-renders bind to a slot via bindOutsideClick(slot, fn); the previous
// listener under that slot is removed first so handlers never stack up.
const outsideClickHandlers = {};
function bindOutsideClick(slot, handler) {
  if (outsideClickHandlers[slot]) {
    document.removeEventListener('click', outsideClickHandlers[slot]);
  }
  outsideClickHandlers[slot] = handler;
  document.addEventListener('click', handler);
}
function unbindOutsideClick(slot) {
  if (outsideClickHandlers[slot]) {
    document.removeEventListener('click', outsideClickHandlers[slot]);
    delete outsideClickHandlers[slot];
  }
}

// Initialize UI renderers (getSectionState will be available later)
let propertiesPanelRenderer;
const elementsListRenderer = new ElementsListRenderer();
const warningParser = new WarningParser();
const warningsPanelRenderer = new WarningsPanelRenderer(
  (id) => state.elements.find(el => String(el.id) === String(id)) || null
);

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

// Initialize properties panel renderer (after helper functions are defined)
propertiesPanelRenderer = new PropertiesPanelRenderer(() => state.labelSettings, getSectionState);

// Initialize UI renderers (will be fully initialized after DOM elements are loaded)
let historyPanelUI;
let customFontsManager;
let propertyListenersManager;
let fullscreen;

// DOM Elements
const addTextBlockBtn = document.getElementById("add-textblock-btn");
const addTextBtn = document.getElementById("add-text-btn");
const addBarcodeBtn = document.getElementById("add-barcode-btn");
const addQRCodeBtn = document.getElementById("add-qrcode-btn");
const addBoxBtn = document.getElementById("add-box-btn");
const addFieldBlockBtn = document.getElementById("add-fieldblock-btn");
const addLineBtn = document.getElementById("add-line-btn");
const addCircleBtn = document.getElementById("add-circle-btn");
const addGraphicBtn = document.getElementById("add-graphic-btn");
const addGraphicFileInput = document.getElementById("add-graphic-file-input");
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
const zplOutputHighlight = document.getElementById("zpl-output-highlight");
const zplOutputRaw = document.getElementById("zpl-output-raw");
const copyBtn = document.getElementById("copy-btn");
const copyBtnLabel = document.getElementById("copy-btn-label");
const exportBtn = document.getElementById("export-btn");
const exportGalleryBtn = document.getElementById("export-gallery-btn");
const exportGalleryModal = document.getElementById("export-gallery-modal");
const exportGalleryCloseBtn = document.getElementById("export-gallery-close-btn");
const exportGalleryCancelBtn = document.getElementById("export-gallery-cancel-btn");
const exportGalleryConfirmBtn = document.getElementById("export-gallery-confirm-btn");
const importBtn = document.getElementById("import-btn");
const importFile = document.getElementById("import-file");
const shareBtn = document.getElementById("share-btn");
const shareBtnLabel = document.getElementById("share-btn-label");
const zplMoreBtn = document.getElementById("zpl-more-btn");
const zplMoreMenu = document.getElementById("zpl-more-menu");
const importZPLBtn = document.getElementById("import-zpl-btn");
const openLabelaryBtn = document.getElementById("open-labelary-btn");
const zplImportModal = document.getElementById("zpl-import-modal");
const zplImportInput = document.getElementById("zpl-import-input");
const zplImportWarnings = document.getElementById("zpl-import-warnings");
const zplImportWarningsList = document.getElementById("zpl-import-warnings-list");
const zplImportCloseBtn = document.getElementById("zpl-import-close-btn");
const zplImportCancelBtn = document.getElementById("zpl-import-cancel-btn");
const zplImportConfirmBtn = document.getElementById("zpl-import-confirm-btn");
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
    btn.setAttribute('aria-pressed', String(isActive));
  });
};

const setMirrorActive = (value) => {
  mirrorButtons.forEach(btn => {
    const isActive = btn.getAttribute('data-mirror') === value;
    btn.className = `px-3 py-1 text-xs rounded transition-colors ${isActive ? 'bg-white text-blue-600 shadow' : 'text-slate-500 hover:bg-slate-200'}`;
    btn.setAttribute('aria-pressed', String(isActive));
  });
};
const mediaDarkness = document.getElementById("media-darkness");
const printSpeed = document.getElementById("print-speed");
const slewSpeed = document.getElementById("slew-speed");
const backfeedSpeed = document.getElementById("backfeed-speed");
const printQuantity = document.getElementById("print-quantity");
const pauseCount = document.getElementById("pause-count");
const replicatesInput = document.getElementById("replicates");
const printQuantityPlaceholder = document.getElementById("print-quantity-placeholder");
const fontId = document.getElementById("font-id");
const defaultFontHeight = document.getElementById("default-font-height");
const defaultFontWidth = document.getElementById("default-font-width");
const newFontId = document.getElementById("new-font-id");
const newFontFile = document.getElementById("new-font-file");
const addCustomFontBtn = document.getElementById("add-custom-font-btn");
const customFontsList = document.getElementById("custom-fonts-list");
const customFontError = document.getElementById("custom-font-error");
const previewImage = document.getElementById("preview-image");
const previewBacking = document.getElementById("preview-backing");
const previewError = document.getElementById("preview-error");
const previewPlaceholder = document.getElementById("preview-placeholder");
const refreshPreviewIcon = document.getElementById("refresh-preview-icon");
const warningsPanel = document.getElementById("warnings-panel");
const warningsList = document.getElementById("warnings-list");
const warningsCount = document.getElementById("warnings-count");
const warningsDismissBtn = document.getElementById("warnings-dismiss-btn");
const refreshPreviewBtn = document.getElementById("refresh-preview-btn");
const togglePreviewModeBtn = null; // Deprecated
const modeCanvasBtn = document.getElementById("mode-canvas-btn");
const modeOverlayBtn = document.getElementById("mode-overlay-btn");
const modeApiBtn = document.getElementById("mode-api-btn");
const overlayOpacityControl = document.getElementById("overlay-opacity-control");
const overlayOpacitySlider = document.getElementById("overlay-opacity-slider");
const overlayOpacityValueLabel = document.getElementById("overlay-opacity-value");
const labelCanvas = document.getElementById("label-canvas");
const apiPreviewContainer = document.getElementById("api-preview-container");
const previewContainer = document.getElementById("preview-container");
const previewViewport = document.getElementById("preview-viewport");
const zoomControls = document.getElementById("zoom-controls");
const zoomLevelBtn = document.getElementById("zoom-level-btn");
const zoomLevelLabel = document.getElementById("zoom-level-label");
const zoomInBtn = document.getElementById("zoom-in-btn");
const zoomOutBtn = document.getElementById("zoom-out-btn");
const zoomPresetsMenu = document.getElementById("zoom-presets-menu");

// Canvas and interaction state
let canvasRenderer = null;
let interactionHandler = null;
let contextMenu = null;
let lastContextMenuLabelPosition = null;
let previewMode = 'canvas'; // 'canvas', 'overlay', or 'api'

// ============================================================
// Viewport: zoom + pan
// ============================================================

// Single zoom/pan applied to all 3 preview modes. `zoom` is the ratio of
// screen pixels to label dots; `panX/Y` is the translation in screen pixels
// applied on top of the centered viewport. `isAtFit` is sticky: while true,
// zoom auto-recomputes to fit on label/container resize; any explicit zoom
// interaction clears it until the user picks Fit again.
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 8;
const ZOOM_PRESETS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 4, 8];
let zoom = 1;
let panX = 0;
let panY = 0;
let isAtFit = true;
let isSpacePressed = false;
let isPanning = false;
let panStartClientX = 0;
let panStartClientY = 0;
let panStartPanX = 0;
let panStartPanY = 0;
let viewportResizeObserver = null;

// Initialize function
export function initApp() {
  // Initialize tooltip manager
  new TooltipManager().init();

  // Initialize confirmation modal
  const confirmModal = new ConfirmModal();

  // Initialize fullscreen controller (workspace layout state)
  fullscreen = new FullscreenController();
  fullscreen.init();

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
      updateZplDocLink();
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
    },
    onGraphicReencode: (element, opts) => {
      reencodeGraphicElement(element, opts);
    },
    onGraphicReplace: (element) => {
      pendingGraphicReplaceId = String(element.id);
      addGraphicFileInput.click();
    },
    onRerenderProperties: () => renderPropertiesPanel(),
    getLabelSettings: () => state.labelSettings
  });

  // Initialize element service with callbacks
  elementService = new ElementService(state, {
    onElementsChanged: () => {
      interactionHandler.updateElements(state.elements);
      updateElementsList();
      renderPropertiesPanel();
      updateZPLOutput();
      renderCanvasPreview();
      updateCopyExportUI();
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
        if (element.type === 'FIELDBLOCK') {
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
        } else if (element.type === 'TEXT') {
          const propFontSize = document.getElementById('prop-font-size');
          const propFontWidth = document.getElementById('prop-font-width');
          if (propFontSize) propFontSize.value = element.fontSize === 0 ? "" : element.fontSize;
          if (propFontWidth) propFontWidth.value = element.fontWidth === 0 ? "" : element.fontWidth;
        }
      }
    },
    onElementDragEnd: (element) => {
      // Finalize drag - update ZPL output
      updateZPLOutput();
      renderCanvasPreview();
      renderPropertiesPanel();
      finalizeTransformSession(element);
      // GRAPHIC needs an async re-rasterize after corner-handle resize so the
      // emitted bitmap matches the new dot dimensions.
      if (element && element.type === 'GRAPHIC' && element.isEditable && element.isEditable() && element._needsReencode) {
        element._needsReencode = false;
        reencodeGraphicElement(element, { widthDots: element.widthDots, heightDots: element.heightDots });
      }
    },
    onElementMoved: (element) => {
      // Keyboard nudge - update everything
      updateZPLOutput();
      renderCanvasPreview();
      renderPropertiesPanel();
    },
    onElementDeleted: (element) => {
      if (element.locked) return;
      if (previewMode !== 'api') {
        const idStr = String(element.id);
        deleteElement(idStr);
      }
    },
    onElementTransformStart: (element, mode) => {
      startTransformSession(element, mode);
    },
    onElementTransformCancel: (element) => {
      cancelTransformSession(element);
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
    pasteElement: (data) => pasteElementFromData(data),
    onContextMenu: (clientX, clientY, labelPosition, element) => {
      if (previewMode !== 'api') {
        lastContextMenuLabelPosition = labelPosition;
        contextMenu.show(clientX, clientY, element);
      }
    }
  });

  // Wire up smart guide service
  interactionHandler.smartGuideService = smartGuideService;

  const runContextMenuAlignment = (action, element, historyLabel) => {
    applyAlignmentAction(action, element);
    updateZPLOutput();
    updateElementsList();
    renderCanvasPreview();
    renderPropertiesPanel();
    scheduleHistoryCommit(`element-${element.id}`, historyLabel, {
      kind: 'align',
      detail: element.getDisplayName()
    });
  };

  // Initialize context menu
  contextMenu = new ContextMenu(document.getElementById('preview-container'), {
    getSelectedElement: () => state.selectedElement,
    getClipboardData: () => interactionHandler.clipboardData,
    getElements: () => state.elements,
    closeOtherMenus: () => closeZPLMoreMenu(),
    onCopy: (element) => {
      interactionHandler.clipboardData = serializeElement(element);
    },
    onPaste: () => {
      if (interactionHandler.clipboardData) {
        pasteElementFromData(interactionHandler.clipboardData, lastContextMenuLabelPosition);
      }
    },
    onDuplicate: (element) => {
      const data = serializeElement(element);
      if (data) {
        pasteElementFromData(data);
      }
    },
    onMoveUp: (element) => {
      const index = state.elements.findIndex(el => String(el.id) === String(element.id));
      if (index > 0) {
        moveElementUp(index);
      }
    },
    onMoveDown: (element) => {
      const index = state.elements.findIndex(el => String(el.id) === String(element.id));
      if (index >= 0 && index < state.elements.length - 1) {
        moveElementDown(index);
      }
    },
    onCenterHorizontally: (element) => {
      runContextMenuAlignment('center-x', element, `Centered ${element.type} horizontally`);
    },
    onCenterVertically: (element) => {
      runContextMenuAlignment('center-y', element, `Centered ${element.type} vertically`);
    },
    onMatchLabelWidth: (element) => {
      runContextMenuAlignment('match-width', element, `Matched ${element.type} to label width`);
    },
    onMatchLabelHeight: (element) => {
      runContextMenuAlignment('match-height', element, `Matched ${element.type} to label height`);
    },
    onToggleLock: (element) => {
      element.locked = !element.locked;
      pushHistory(element.locked ? `Locked ${element.type}` : `Unlocked ${element.type}`, {
        kind: 'edit',
        detail: element.getDisplayName()
      });
      updateElementsList();
      renderPropertiesPanel();
      renderCanvasPreview();
    },
    onDelete: (element) => {
      if (element.locked) return;
      deleteElement(String(element.id));
    }
  });

  // Add button event listeners
  addTextBlockBtn.addEventListener("click", addTextBlockElement);
  addTextBtn.addEventListener("click", addTextElement);
  addBarcodeBtn.addEventListener("click", addBarcodeElement);
  addQRCodeBtn.addEventListener("click", addQRCodeElement);
  addBoxBtn.addEventListener("click", addBoxElement);
  addFieldBlockBtn.addEventListener("click", addFieldBlockElement);
  addLineBtn.addEventListener("click", addLineElement);
  addCircleBtn.addEventListener("click", addCircleElement);
  addGraphicBtn.addEventListener("click", () => addGraphicFileInput.click());
  addGraphicFileInput.addEventListener("change", handleGraphicFileSelected);
  copyBtn.addEventListener("click", copyZPL);
  refreshPreviewBtn.addEventListener("click", updatePreview);
  // Mode switching
  modeCanvasBtn.addEventListener("click", () => setPreviewMode('canvas'));
  modeOverlayBtn.addEventListener("click", () => setPreviewMode('overlay'));
  modeApiBtn.addEventListener("click", () => setPreviewMode('api'));
  window.addEventListener('resize', () => {
    if (isAtFit) renderCanvasPreview();
    else applyViewport();
  });
  // Overlay opacity slider — stop click from bubbling to the parent div (which would re-trigger mode switch)
  overlayOpacitySlider.addEventListener("click", (e) => e.stopPropagation());
  overlayOpacitySlider.addEventListener("input", () => {
    const pct = overlayOpacitySlider.value;
    overlayOpacityValueLabel.textContent = `${pct}%`;
    previewImage.style.opacity = pct / 100;
  });
  zplMoreBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleZPLMoreMenu();
  });
  exportBtn.addEventListener("click", () => {
    exportTemplate();
    closeZPLMoreMenu();
  });
  exportGalleryBtn.addEventListener("click", () => {
    openExportGalleryModal();
    closeZPLMoreMenu();
  });
  exportGalleryCloseBtn.addEventListener("click", closeExportGalleryModal);
  exportGalleryCancelBtn.addEventListener("click", closeExportGalleryModal);
  exportGalleryConfirmBtn.addEventListener("click", doExportForGallery);
  // Light-dismiss: clicking the ::backdrop area targets the <dialog> itself.
  const dismissOnBackdrop = (dialog) => dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
  dismissOnBackdrop(exportGalleryModal);
  dismissOnBackdrop(zplImportModal);
  shareBtn.addEventListener("click", shareTemplate);
  importBtn.addEventListener("click", async () => {
    closeZPLMoreMenu();
    if (state.elements.length > 0) {
      if (await confirmModal.show(
        "Importing a template will replace your current work. Continue?"
      )) importFile.click();
      return;
    }
    importFile.click();
  });
  importFile.addEventListener("change", handleFileImport);
  importZPLBtn.addEventListener("click", async () => {
    closeZPLMoreMenu();
    if (state.elements.length > 0) {
      if (await confirmModal.show(
        "Importing a ZPL template will replace your current work. Continue?"
      )) openZPLImportModal();
      return;
    }
    openZPLImportModal();
  });
  openLabelaryBtn.addEventListener("click", () => {
    closeZPLMoreMenu();
    openInLabelary();
  });
  document.addEventListener("click", (event) => {
    if (zplMoreMenu.classList.contains("hidden")) return;
    if (zplMoreMenu.contains(event.target) || zplMoreBtn.contains(event.target)) return;
    closeZPLMoreMenu();
  });
  zplImportCloseBtn.addEventListener("click", closeZPLImportModal);
  zplImportCancelBtn.addEventListener("click", closeZPLImportModal);
  zplImportConfirmBtn.addEventListener("click", handleZPLImport);
  zplImportInput.addEventListener("input", () => {
    pendingZPLResult = null;
    zplImportConfirmBtn.textContent = 'Import';
    zplImportWarnings.classList.add('hidden');
  });
  undoBtn.addEventListener("click", undo);
  redoBtn.addEventListener("click", redo);
  historyToggleBtn.addEventListener("click", openHistoryPanel);
  historyCloseBtn.addEventListener("click", closeHistoryPanel);
  historyBackdrop.addEventListener("click", closeHistoryPanel);
  historyClearBtn.addEventListener("click", () => resetHistory("History cleared", { kind: "clear" }));
  historyList.addEventListener("click", handleHistoryClick);

  // Shortcuts modal — click to open, backdrop/close/Esc to dismiss.
  const shortcutsBtn = document.getElementById("shortcuts-btn");
  const shortcutsModal = document.getElementById("shortcuts-modal");
  const shortcutsClose = document.getElementById("shortcuts-close");
  const shortcutsBackdrop = document.getElementById("shortcuts-backdrop");
  const openShortcuts = () => {
    shortcutsModal.classList.remove("hidden");
    requestAnimationFrame(() => shortcutsModal.setAttribute("data-state", "open"));
  };
  const closeShortcuts = () => {
    shortcutsModal.setAttribute("data-state", "closed");
    setTimeout(() => shortcutsModal.classList.add("hidden"), 180);
  };
  if (shortcutsBtn) shortcutsBtn.addEventListener("click", openShortcuts);
  if (shortcutsClose) shortcutsClose.addEventListener("click", closeShortcuts);
  if (shortcutsBackdrop) shortcutsBackdrop.addEventListener("click", closeShortcuts);
  document.addEventListener("keydown", (e) => {
    if (shortcutsModal.classList.contains("hidden")) {
      // "?" opens the shortcuts modal — only when not typing in an input
      if (e.key === "?" && !e.target.closest("input,textarea,select,[contenteditable]")) {
        e.preventDefault();
        openShortcuts();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeShortcuts();
    }
  });

  // Warnings panel event listeners
  warningsDismissBtn.addEventListener("click", () => {
    warningsPanelDismissed = true;
    warningsPanel.classList.add('hidden');
  });

  warningsList.addEventListener("click", (e) => {
    const item = e.target.closest('.warning-item[data-element-id]');
    if (!item) return;
    const elementId = item.getAttribute('data-element-id');
    const element = state.elements.find(el => String(el.id) === String(elementId));
    if (element) {
      state.setSelectedElement(element);
      updateElementsList();
      renderPropertiesPanel();
      renderCanvasPreview();
    }
  });

  // Subscribe to warnings changes
  state.subscribe('warningsChanged', (warnings) => {
    if (warnings.length > 0 && !warningsPanelDismissed) {
      warningsPanel.classList.remove('hidden');
      warningsCount.textContent = warnings.length;
      warningsList.innerHTML = warningsPanelRenderer.render(warnings);
    } else {
      warningsPanel.classList.add('hidden');
    }
    updateElementsList();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !e.defaultPrevented) {
      if (!zplMoreMenu.classList.contains('hidden')) {
        closeZPLMoreMenu();
      } else if (historyPanel.classList.contains('open')) {
        closeHistoryPanel();
      } else if (fullscreen.isOn()) {
        fullscreen.exit();
      }
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
    updateZPLOutput();
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

  printQuantity.addEventListener("input", (e) => {
    state.updateLabelSettings({ printQuantity: parseInt(e.target.value) || 1 });
    updateZPLOutput();
    scheduleHistoryCommit("label-settings", "Updated label settings", { kind: "settings" });
  });

  pauseCount.addEventListener("input", (e) => {
    state.updateLabelSettings({ pauseCount: parseInt(e.target.value) || 0 });
    updateZPLOutput();
    scheduleHistoryCommit("label-settings", "Updated label settings", { kind: "settings" });
  });

  replicatesInput.addEventListener("input", (e) => {
    state.updateLabelSettings({ replicates: parseInt(e.target.value) || 0 });
    updateZPLOutput();
    scheduleHistoryCommit("label-settings", "Updated label settings", { kind: "settings" });
  });

  printQuantityPlaceholder.addEventListener("input", (e) => {
    state.updateLabelSettings({ printQuantityPlaceholder: e.target.value || '' });
    updateZPLOutput();
    scheduleHistoryCommit("label-settings", "Updated label settings", { kind: "settings" });
  });

  // Font settings event listeners
  fontId.addEventListener("change", (e) => {
    const newFontId = e.target.value || "0";
    state.updateLabelSettings({ fontId: newFontId });
    // Elements inheriting the label font (fontId === '') now resolve to the new
    // default — re-snap their bitmap sizes to that font's allowed grid.
    state.elements.forEach(el => { if (!el.fontId) normalizeElementFontSize(el, newFontId); });
    updateZPLOutput();
    renderCanvasPreview();
    scheduleHistoryCommit("label-settings", "Updated label settings", { kind: "settings" });
  });

  // Custom fonts management
  addCustomFontBtn.addEventListener("click", addCustomFont);

  defaultFontHeight.addEventListener("input", (e) => {
    const parsed = parseInt(e.target.value);
    state.updateLabelSettings({ defaultFontHeight: Number.isNaN(parsed) ? 20 : Math.max(1, parsed) });
    updateZPLOutput();
    renderCanvasPreview();
    scheduleHistoryCommit("label-settings", "Updated label settings", { kind: "settings" });
  });

  defaultFontWidth.addEventListener("input", (e) => {
    const parsed = parseInt(e.target.value);
    state.updateLabelSettings({ defaultFontWidth: Number.isNaN(parsed) ? 0 : Math.max(0, parsed) });
    updateZPLOutput();
    renderCanvasPreview();
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
    // Check if lock button was clicked
    const lockBtn = e.target.closest(".lock-btn");
    if (lockBtn) {
      e.stopPropagation();
      e.preventDefault();
      const idStr = lockBtn.getAttribute("data-id");
      if (idStr) {
        const element = state.elements.find((el) => String(el.id) === idStr);
        if (element) {
          element.locked = !element.locked;
          pushHistory(element.locked ? `Locked ${element.type}` : `Unlocked ${element.type}`, { kind: "edit", detail: element.getDisplayName() });
          updateElementsList();
          renderPropertiesPanel();
          renderCanvasPreview();
        }
      }
      return;
    }

    // Check if delete button was clicked (either directly or as closest parent)
    const deleteBtn = e.target.closest(".delete-btn");
    if (deleteBtn || e.target.classList.contains("delete-btn")) {
      e.stopPropagation();
      e.preventDefault();
      const btn = deleteBtn || e.target;
      const idStr = btn.getAttribute("data-id");
      if (idStr) {
        const element = state.elements.find((el) => String(el.id) === idStr);
        if (element && element.locked) return;
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

  // Wire viewport (zoom + pan) listeners before the first render.
  wireViewportListeners();

  // Initialize functionality
  setPreviewMode('canvas');

  updateZPLOutput();
  renderCanvasPreview();
  resetHistory("Initial state", { kind: "init" });
  updateCopyExportUI();

  // Hydrate from sessionStorage (gallery handoff) or ?drive=<id> URL param.
  rehydrateFromHandoff();

  // Re-run on every editor view entry so navigating gallery→editor without
  // a full reload still imports the chosen template. Also repaint the
  // shared header chip since the gallery may have overwritten it.
  const editorViewContainer = document.getElementById('view-editor');
  if (editorViewContainer) {
    editorViewContainer.addEventListener('view:enter', () => {
      rehydrateFromHandoff();
      renderEditorHeaderChip();
    });
  }

  // Check for shared template in URL hash
  const sharedEncoded = urlShareService.getTemplateFromUrl();
  if (sharedEncoded) {
    urlShareService.decodeTemplate(sharedEncoded).then(template => {
      if (template) {
        try {
          importTemplate(template);
        } catch (err) {
          console.error('Failed to apply shared template:', err);
        }
      } else {
        console.warn('Invalid shared template in URL');
      }
    }).catch(error => {
      console.error('Failed to decode shared template:', error);
    }).finally(() => {
      urlShareService.clearUrlTemplate();
    });
  }

  // Initialize onboarding walkthrough
  const walkthrough = new OnboardingWalkthrough();
  walkthrough.init();
  document.getElementById('tour-btn').addEventListener('click', () => {
    if (fullscreen.isOn()) fullscreen.exit();
    walkthrough.start();
  });

  // Expose internals for automated tests only
  const isE2E = typeof window !== 'undefined' && (
    window.__E2E__ === true ||
    window.location.search.includes('e2e=1')
  );
  if (isE2E) {
    window.canvasRenderer = canvasRenderer;
    window.appState = state;
    window.interactionHandler = interactionHandler;
  }
}

function toggleZPLMoreMenu() {
  if (zplMoreMenu.classList.contains('hidden')) {
    zplMoreMenu.classList.remove('hidden');
    zplMoreBtn.setAttribute('aria-expanded', 'true');
    return;
  }
  closeZPLMoreMenu();
}

function closeZPLMoreMenu() {
  zplMoreMenu.classList.add('hidden');
  zplMoreBtn.setAttribute('aria-expanded', 'false');
}

// Render Canvas Preview
export function renderCanvasPreview() {
  if (!canvasRenderer) return;
  if (isAtFit) {
    // Auto mode (sticky): pick 100% when the label fits at native size,
    // otherwise scale down to fit. See CONTEXT.md `Fit` glossary entry.
    const fit = computeFitZoom();
    if (fit > 0) zoom = fit >= 1 ? 1 : fit;
  }
  canvasRenderer.setZoom(zoom);
  canvasRenderer.setTransparentBackground(previewMode === 'overlay');
  canvasRenderer.renderCanvas(state.elements, state.labelSettings, state.selectedElement);
  applyViewport();
}

// ============================================================
// Viewport helpers — size + position the canvas, preview image, and
// preview backing inside the pan/zoom viewport.
// ============================================================

function getLabelDots() {
  const dpmm = state.labelSettings?.dpmm || 8;
  const actualDpi = Math.floor(dpmm * 25.4);
  const w = Math.floor(((state.labelSettings?.width || 100) / 25.4) * actualDpi);
  const h = Math.floor(((state.labelSettings?.height || 50) / 25.4) * actualDpi);
  return { w: Math.max(1, w), h: Math.max(1, h) };
}

function computeFitZoom() {
  if (!previewContainer) return 1;
  // Bail if the container hasn't been laid out yet — the ResizeObserver
  // re-fits the moment it becomes measurable.
  if (!previewContainer.clientWidth || !previewContainer.clientHeight) return 1;
  const { w, h } = getLabelDots();
  // Reserve breathing room so the label doesn't touch the edge and the
  // floating zoom pill doesn't overlap it.
  const padding = 48;
  const availW = Math.max(1, previewContainer.clientWidth - padding);
  const availH = Math.max(1, previewContainer.clientHeight - padding);
  return Math.min(availW / w, availH / h);
}

function applyViewport() {
  if (!previewViewport) return;
  const { w, h } = getLabelDots();
  const pxW = Math.max(1, Math.round(w * zoom));
  const pxH = Math.max(1, Math.round(h * zoom));

  previewViewport.style.width = `${pxW}px`;
  previewViewport.style.height = `${pxH}px`;
  previewViewport.style.transform =
    `translate(-50%, -50%) translate(${Math.round(panX)}px, ${Math.round(panY)}px)`;

  // The canvas's internal width/height is set by the renderer; force the CSS
  // size to match (so rect.width === canvas.width and `cssScaleX === 1`).
  if (labelCanvas) {
    labelCanvas.style.width = `${pxW}px`;
    labelCanvas.style.height = `${pxH}px`;
  }
  if (previewImage) {
    previewImage.style.width = `${pxW}px`;
    previewImage.style.height = `${pxH}px`;
    previewImage.style.maxWidth = `${pxW}px`;
    previewImage.style.maxHeight = `${pxH}px`;
  }
  if (previewBacking) {
    previewBacking.style.width = `${pxW}px`;
    previewBacking.style.height = `${pxH}px`;
  }

  updateZoomLabel();
}

function updateZoomLabel() {
  if (!zoomLevelLabel) return;
  const pct = Math.round(zoom * 100);
  zoomLevelLabel.textContent = isAtFit ? `Fit ${pct}%` : `${pct}%`;
}

function clampZoom(z) {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
}

// Zoom around an anchor point in *container* coordinates so the dot under
// the anchor stays visually fixed across the zoom step.
function setZoomAt(newZoom, anchorClientX, anchorClientY, { fromUser = true } = {}) {
  const next = clampZoom(newZoom);
  if (Math.abs(next - zoom) < 1e-6 && fromUser) return;

  const rect = previewContainer.getBoundingClientRect();
  // Default anchor: center of preview container.
  const ax = (anchorClientX ?? (rect.left + rect.width / 2)) - rect.left;
  const ay = (anchorClientY ?? (rect.top + rect.height / 2)) - rect.top;

  // Convert anchor to the offset relative to the viewport's centered origin.
  // viewport.transform = translate(-50%, -50%) translate(pan); so the
  // viewport center is at (containerCenter + pan).
  const cx = rect.width / 2 + panX;
  const cy = rect.height / 2 + panY;
  const dx = ax - cx;
  const dy = ay - cy;

  // After zoom changes from `zoom` to `next`, the dot that was under the
  // anchor should stay under it. Distance from viewport center scales by
  // (next/zoom); adjust pan to keep the anchor stable.
  const ratio = next / zoom;
  panX = panX + dx - dx * ratio;
  panY = panY + dy - dy * ratio;
  zoom = next;
  if (fromUser) isAtFit = false;

  renderCanvasPreview();
}

function setZoomPreset(preset, { fromUser = true } = {}) {
  if (preset === 'fit') {
    isAtFit = true;
    zoom = computeFitZoom() || 1;
    panX = 0;
    panY = 0;
    renderCanvasPreview();
    return;
  }
  const z = Number(preset);
  if (!Number.isFinite(z)) return;
  // Preset-via-button keeps the center of the viewport stable (no anchor).
  setZoomAt(z, undefined, undefined, { fromUser });
}

function stepZoom(direction, anchorClientX, anchorClientY) {
  const ladder = ZOOM_PRESETS;
  // Find next preset strictly above (or below) current zoom.
  let target;
  if (direction > 0) {
    target = ladder.find((p) => p > zoom + 1e-6);
    if (target === undefined) target = ZOOM_MAX;
  } else {
    for (let i = ladder.length - 1; i >= 0; i--) {
      if (ladder[i] < zoom - 1e-6) { target = ladder[i]; break; }
    }
    if (target === undefined) target = ZOOM_MIN;
  }
  setZoomAt(target, anchorClientX, anchorClientY);
}

function toggleZoomPresetsMenu(force) {
  if (!zoomPresetsMenu) return;
  const wantOpen = force ?? zoomPresetsMenu.classList.contains('hidden');
  zoomPresetsMenu.classList.toggle('hidden', !wantOpen);
}

function wireViewportListeners() {
  if (!previewContainer) return;

  // Pill: buttons + preset dropdown.
  if (zoomInBtn) zoomInBtn.addEventListener('click', (e) => { e.stopPropagation(); stepZoom(+1); });
  if (zoomOutBtn) zoomOutBtn.addEventListener('click', (e) => { e.stopPropagation(); stepZoom(-1); });
  if (zoomLevelBtn) zoomLevelBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleZoomPresetsMenu(); });
  if (zoomPresetsMenu) {
    zoomPresetsMenu.addEventListener('click', (e) => {
      const btn = e.target.closest('.zoom-preset');
      if (!btn) return;
      e.stopPropagation();
      setZoomPreset(btn.getAttribute('data-zoom'));
      toggleZoomPresetsMenu(false);
    });
  }
  // Dismiss the presets menu on outside click.
  document.addEventListener('click', (e) => {
    if (!zoomPresetsMenu || zoomPresetsMenu.classList.contains('hidden')) return;
    if (zoomControls && zoomControls.contains(e.target)) return;
    toggleZoomPresetsMenu(false);
  });

  // Ctrl+wheel = zoom anchored at cursor; plain wheel = vertical pan;
  // Shift+wheel = horizontal pan. preventDefault so the page doesn't scroll.
  previewContainer.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.0015);
      setZoomAt(zoom * factor, e.clientX, e.clientY);
      return;
    }
    if (e.shiftKey) {
      // Some browsers/devices emit deltaX when Shift is held; others keep deltaY.
      // Honor whichever has a value so horizontal pan works everywhere.
      e.preventDefault();
      panX -= e.deltaX || e.deltaY;
      isAtFit = false;
      applyViewport();
      return;
    }
    if (zoom <= computeFitZoom() + 1e-3) return; // No pan if fully visible
    e.preventDefault();
    panX -= e.deltaX;
    panY -= e.deltaY;
    isAtFit = false;
    applyViewport();
  }, { passive: false });

  // Middle-mouse pan starts on container; Space+left-button pan uses
  // capture-phase so we intercept before the canvas's selection handler.
  previewContainer.addEventListener('mousedown', (e) => {
    const wantPan = e.button === 1 || (e.button === 0 && isSpacePressed);
    if (!wantPan) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    beginPan(e);
  }, true);

  window.addEventListener('mousemove', (e) => {
    if (!isPanning) return;
    panX = panStartPanX + (e.clientX - panStartClientX);
    panY = panStartPanY + (e.clientY - panStartClientY);
    isAtFit = false;
    applyViewport();
  });

  window.addEventListener('mouseup', () => {
    if (!isPanning) return;
    isPanning = false;
    previewContainer.style.cursor = isSpacePressed ? 'grab' : '';
  });

  // Space: hold to pan (Figma-style). Ignore when typing in an input.
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space') return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (document.activeElement && document.activeElement.isContentEditable)) return;
    if (isSpacePressed) return; // ignore key repeat
    isSpacePressed = true;
    previewContainer.style.cursor = 'grab';
    e.preventDefault();
  });
  document.addEventListener('keyup', (e) => {
    if (e.code !== 'Space') return;
    isSpacePressed = false;
    if (!isPanning) previewContainer.style.cursor = '';
  });

  // Zoom shortcuts work in all 3 modes — bound at document level.
  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (document.activeElement && document.activeElement.isContentEditable)) return;
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key === '0') { e.preventDefault(); setZoomPreset('fit'); return; }
    if (e.key === '1') { e.preventDefault(); setZoomPreset('1'); return; }
    if (e.key === '=' || e.key === '+') { e.preventDefault(); stepZoom(+1); return; }
    if (e.key === '-' || e.key === '_') { e.preventDefault(); stepZoom(-1); return; }
  });

  // Re-fit on container resize while at Fit; otherwise hold the zoom.
  if (typeof ResizeObserver !== 'undefined') {
    viewportResizeObserver = new ResizeObserver(() => {
      if (isAtFit) renderCanvasPreview();
      else applyViewport();
    });
    viewportResizeObserver.observe(previewContainer);
  }
}

function beginPan(e) {
  isPanning = true;
  panStartClientX = e.clientX;
  panStartClientY = e.clientY;
  panStartPanX = panX;
  panStartPanY = panY;
  previewContainer.style.cursor = 'grabbing';
}

const OVERLAY_PREVIEW_DEBOUNCE_MS = 400;
const PREVIEW_REQUEST_MIN_INTERVAL_MS = 1000;
let overlayPreviewTimer = null;
let nextPreviewRequestAt = 0;
let previewRequestGate = Promise.resolve();

function clearOverlayPreviewRefresh() {
  if (!overlayPreviewTimer) return;
  clearTimeout(overlayPreviewTimer);
  overlayPreviewTimer = null;
}

function scheduleOverlayPreviewRefresh() {
  if (previewMode !== 'overlay') return;

  clearOverlayPreviewRefresh();
  overlayPreviewTimer = setTimeout(() => {
    overlayPreviewTimer = null;
    void updatePreview();
  }, OVERLAY_PREVIEW_DEBOUNCE_MS);
}

function waitForPreviewRequestWindow() {
  const scheduled = previewRequestGate.then(async () => {
    const delay = Math.max(0, nextPreviewRequestAt - Date.now());
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    nextPreviewRequestAt = Date.now() + PREVIEW_REQUEST_MIN_INTERVAL_MS;
  });

  previewRequestGate = scheduled.catch(() => {});
  return scheduled;
}

// Set Preview Mode
function setPreviewMode(mode) {
  const prevMode = previewMode;
  previewMode = mode;
  if (mode !== 'overlay') {
    clearOverlayPreviewRefresh();
  }

  // Reset button styles
  const activeClass = ["bg-white", "text-slate-700", "shadow-sm"];
  const inactiveClass = ["text-slate-500", "hover:text-slate-700"];
  const buttonModes = [
    [modeCanvasBtn, 'canvas'],
    [modeOverlayBtn, 'overlay'],
    [modeApiBtn, 'api']
  ];

  buttonModes.forEach(([button, buttonMode]) => {
    const isActive = buttonMode === mode;
    button.classList.toggle(activeClass[0], isActive);
    button.classList.toggle(activeClass[1], isActive);
    button.classList.toggle(activeClass[2], isActive);
    button.classList.toggle(inactiveClass[0], !isActive);
    button.classList.toggle(inactiveClass[1], !isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });

  previewContainer.dataset.mode = mode;

  const isOverlay = mode === 'overlay';
  overlayOpacityControl.classList.toggle('hidden', !isOverlay);

  if (mode === 'canvas') {
    labelCanvas.classList.remove('hidden');
    apiPreviewContainer.classList.add('hidden');
    previewBacking.classList.add('hidden');
    previewImage.classList.add('hidden');
    labelCanvas.classList.add('bg-white');
    labelCanvas.classList.remove('bg-transparent');
    previewImage.style.opacity = '';
    previewImage.classList.add('opacity-100');
    refreshPreviewBtn.disabled = true;

    renderCanvasPreview();
    return;
  }

  labelCanvas.classList.toggle('hidden', mode === 'api');
  apiPreviewContainer.classList.remove('hidden');
  previewBacking.classList.remove('hidden');
  labelCanvas.classList.toggle('bg-white', !isOverlay);
  labelCanvas.classList.toggle('bg-transparent', isOverlay);
  previewBacking.classList.toggle('shadow-lg', mode === 'api');
  previewBacking.classList.toggle('shadow-none', isOverlay);
  // In overlay mode drive opacity from the slider; otherwise restore full opacity via class.
  previewImage.classList.remove('opacity-20');
  if (isOverlay) {
    previewImage.classList.remove('opacity-100');
    previewImage.style.opacity = overlayOpacitySlider.value / 100;
  } else {
    previewImage.style.opacity = '';
    previewImage.classList.add('opacity-100');
  }
  refreshPreviewBtn.disabled = isOverlay;
  applyViewport();
  if (isOverlay) renderCanvasPreview();
  // When returning to overlay from the editor (canvas), discard the cached
  // preview image so the stale frame isn't shown while the new one loads.
  if (isOverlay && prevMode === 'canvas') {
    lastPreviewImageUrl = null;
    previewImage.classList.add('hidden');
  }
  void updatePreview();
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
  printQuantity.value = state.labelSettings.printQuantity ?? 1;
  pauseCount.value = state.labelSettings.pauseCount ?? 0;
  replicatesInput.value = state.labelSettings.replicates ?? 0;
  printQuantityPlaceholder.value = state.labelSettings.printQuantityPlaceholder ?? '';
  fontId.value = state.labelSettings.fontId;
  renderCustomFonts();
  defaultFontHeight.value = state.labelSettings.defaultFontHeight;
  defaultFontWidth.value = state.labelSettings.defaultFontWidth || '';
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
  updateCopyExportUI();
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

  // Skip init/import/load so loading a doc doesn't show as "Unsaved changes".
  if (options.kind !== 'init' && options.kind !== 'import') {
    markDirty();
  }
}

// ============================================================
// Drive save lifecycle
// ============================================================

function markDirty() {
  if (!driveDoc.dirty) {
    driveDoc.dirty = true;
    updateSaveStatusUI();
  }
}

function markClean() {
  driveDoc.dirty = false;
  driveDoc.lastSavedAt = new Date();
  updateSaveStatusUI();
}

function setSaving(saving) {
  driveDoc.saving = saving;
  updateSaveStatusUI();
}

function formatRelativeTime(date) {
  if (!date) return '';
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString();
}

function updateSaveStatusUI() {
  const el = document.getElementById('drive-chip-status');
  if (!el) return;
  if (driveDoc.saving) {
    el.textContent = '· Saving';
    el.className = 'font-normal text-blue-500';
  } else if (driveDoc.dirty) {
    el.textContent = '· Unsaved';
    el.className = 'font-normal text-amber-500';
  } else {
    el.textContent = '';
    el.className = 'font-normal';
  }
}

// Re-render the relative timestamp every 30s so "just now" → "30s ago" etc.
setInterval(() => { if (driveDoc.lastSavedAt && !driveDoc.dirty && !driveDoc.saving) updateSaveStatusUI(); }, 30000);

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

  const chip = document.getElementById("history-count-chip");
  if (chip) chip.textContent = String(historyEntries.length);
}

function updateCopyExportUI() {
  const hasElements = state.elements.length > 0;

  copyBtn.disabled = !hasElements;
  copyBtn.classList.toggle('opacity-50', !hasElements);
  copyBtn.classList.toggle('cursor-not-allowed', !hasElements);

  exportBtn.disabled = !hasElements;
  exportBtn.classList.toggle('opacity-50', !hasElements);
  exportBtn.classList.toggle('cursor-not-allowed', !hasElements);

  exportGalleryBtn.disabled = !hasElements;
  exportGalleryBtn.classList.toggle('opacity-50', !hasElements);
  exportGalleryBtn.classList.toggle('cursor-not-allowed', !hasElements);

  shareBtn.disabled = !hasElements;
  shareBtn.classList.toggle('opacity-50', !hasElements);
  shareBtn.classList.toggle('cursor-not-allowed', !hasElements);
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
  } else if (element.type === "CIRCLE") {
    state.width = element.width;
    state.height = element.height;
    state.thickness = element.thickness;
  } else if (element.type === "FIELDBLOCK") {
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

function restoreElementTransformState(element, before) {
  if (!element || !before) return;

  if (typeof before.x === "number") element.x = before.x;
  if (typeof before.y === "number") element.y = before.y;

  if (element.type === "BOX") {
    if (typeof before.width === "number") element.width = before.width;
    if (typeof before.height === "number") element.height = before.height;
    if (typeof before.thickness === "number") element.thickness = before.thickness;
  } else if (element.type === "LINE") {
    if (typeof before.width === "number") element.width = before.width;
    if (typeof before.thickness === "number") element.thickness = before.thickness;
    if (typeof before.orientation === "string") element.orientation = before.orientation;
  } else if (element.type === "BARCODE") {
    if (typeof before.width === "number") element.width = before.width;
    if (typeof before.height === "number") element.height = before.height;
  } else if (element.type === "CIRCLE") {
    if (typeof before.width === "number") element.width = before.width;
    if (typeof before.height === "number") element.height = before.height;
    if (typeof before.thickness === "number") element.thickness = before.thickness;
  } else if (element.type === "FIELDBLOCK") {
    if (typeof before.blockWidth === "number") element.blockWidth = before.blockWidth;
    if (typeof before.maxLines === "number") element.maxLines = before.maxLines;
  } else if (element.type === "QRCODE") {
    if (typeof before.magnification === "number") element.magnification = before.magnification;
  } else if (element.type === "TEXT") {
    if (typeof before.fontSize === "number") element.fontSize = before.fontSize;
    if (typeof before.fontWidth === "number") element.fontWidth = before.fontWidth;
  }
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

function cancelTransformSession(element) {
  const activeTransformSession = state.getActiveTransformSession();
  if (!activeTransformSession || !element) return;

  if (String(element.id) !== activeTransformSession.id) {
    state.setActiveTransformSession(null);
    return;
  }

  restoreElementTransformState(element, activeTransformSession.before);
  state.setActiveTransformSession(null);
  updateZPLOutput();
  renderCanvasPreview();
  renderPropertiesPanel();
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
function addTextBlockElement() {
  elementService.createElement('TEXTBLOCK', { text: 'Sample text block content', blockWidth: 200, blockHeight: 50 });
}

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

function addFieldBlockElement() {
  elementService.createElement('FIELDBLOCK', { text: 'Sample text that can wrap across multiple lines', blockWidth: 200, maxLines: 3, justification: 'L' });
}

function addLineElement() {
  elementService.createElement('LINE', { width: 200, thickness: 3, orientation: 'H' });
}

function addCircleElement() {
  elementService.createElement('CIRCLE', { width: 80, height: 80, thickness: 3, color: 'B' });
}

let pendingGraphicReplaceId = null;

async function handleGraphicFileSelected(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = '';
  const replaceId = pendingGraphicReplaceId;
  pendingGraphicReplaceId = null;
  if (!file) return;

  const dataUrl = await readFileAsDataUrl(file).catch(() => null);
  if (!dataUrl) return;

  const dpmm = state.labelSettings?.dpmm || 8;
  const labelWidthDots = Math.round((state.labelSettings?.width || 50) * dpmm);
  const labelHeightDots = Math.round((state.labelSettings?.height || 50) * dpmm);
  const maxDots = Math.max(8, Math.floor(Math.min(labelWidthDots, labelHeightDots) * 0.8));

  if (replaceId) {
    const target = state.elements.find(el => String(el.id) === replaceId);
    if (!target) return;
    let result;
    try {
      const probe = await loadImageNaturalSize(dataUrl);
      const desired = target.widthDots && target.isEditable && target.isEditable()
        ? target.widthDots
        : Math.max(8, Math.min(probe.width, maxDots));
      result = await imageToBitmap(dataUrl, desired, target.threshold ?? 128);
    } catch (err) {
      console.error('Failed to rasterize replacement graphic:', err);
      return;
    }
    target.opaqueRaw = null;
    target.sourceDataUrl = dataUrl;
    target.encodingFormat = 'A';
    target.crcWarning = false;
    target.threshold = target.threshold ?? 128;
    target.setBitmap(result);
    onGraphicElementUpdated(target, { rerenderPanel: true });
    return;
  }

  let result;
  try {
    const probe = await loadImageNaturalSize(dataUrl);
    const targetWidth = Math.max(8, Math.min(probe.width, maxDots));
    result = await imageToBitmap(dataUrl, targetWidth, 128);
  } catch (err) {
    console.error('Failed to rasterize graphic image:', err);
    return;
  }

  elementService.createElement('GRAPHIC', {
    sourceDataUrl: dataUrl,
    widthDots: result.widthDots,
    heightDots: result.heightDots,
    bytesPerRow: result.bytesPerRow,
    threshold: 128,
    encodingFormat: 'A',
    bytes: result.bytes,
    imageData: result.imageData,
    naturalAspectRatio: result.naturalAspectRatio,
  });
}

async function reencodeGraphicElement(element, opts = {}) {
  if (!element || !element.sourceDataUrl) return;
  const widthDots = Math.max(8, Math.min(32000, opts.widthDots ?? element.widthDots));
  const threshold = Math.max(1, Math.min(255, opts.threshold ?? element.threshold ?? 128));
  // When unlocked, preserve the user's current heightDots on a width-only
  // change so it doesn't auto-derive from the source aspect.
  const heightOpt = opts.heightDots ?? (element.aspectLocked === false ? element.heightDots : null);
  const heightDots = heightOpt ? Math.max(1, Math.round(heightOpt)) : null;
  // Monotonic token: if a newer reencode starts before this one resolves,
  // drop the stale result instead of overwriting the latest dimensions.
  element._reencodeSeq = (element._reencodeSeq || 0) + 1;
  const seq = element._reencodeSeq;
  let result;
  try {
    result = await imageToBitmap(element.sourceDataUrl, widthDots, threshold, heightDots);
  } catch (err) {
    console.error('Failed to re-encode graphic:', err);
    return;
  }
  if (element._reencodeSeq !== seq) return;
  element.threshold = threshold;
  element.setBitmap(result);
  // Width change auto-derives a new height — patch the readonly height field
  // so the panel doesn't show a stale value. Full re-render would steal focus
  // from the input the user is still interacting with.
  // Only patch when locked: when unlocked, the user owns the value.
  const widthChanged = 'widthDots' in opts;
  onGraphicElementUpdated(element, { patchHeightDisplay: widthChanged && element.aspectLocked !== false });
}

function onGraphicElementUpdated(element, options = {}) {
  updateZPLOutput();
  updateElementsList();
  renderCanvasPreview();
  scheduleHistoryCommit(`element-${element.id}`, `Updated ${element.type} properties`, {
    kind: 'edit',
    detail: element.getDisplayName(),
  });
  if (options.rerenderPanel) {
    renderPropertiesPanel();
  } else if (options.patchHeightDisplay) {
    const heightField = document.getElementById('prop-graphic-height');
    if (heightField) heightField.value = element.heightDots;
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImageNaturalSize(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = dataUrl;
  });
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

function pasteElementFromData(data, options = {}) {
  elementService.pasteElement(data, createElementFromData, options);
}

// Render Properties Panel
const ZPL_DOC_MAP = {
  TEXT: { command: '^A', url: 'https://docs.zebra.com/us/en/printers/software/zpl-pg/c-zpl-zpl-commands/r-zpl-a.html' },
  TEXTBLOCK: { command: '^TB', url: 'https://docs.zebra.com/us/en/printers/software/zpl-pg/c-zpl-zpl-commands/r-zpl-tb.html' },
  FIELDBLOCK: { command: '^FB', url: 'https://docs.zebra.com/us/en/printers/software/zpl-pg/c-zpl-zpl-commands/r-zpl-fb.html' },
  BARCODE: { command: '^BC', url: 'https://docs.zebra.com/us/en/printers/software/zpl-pg/c-zpl-zpl-commands/r-zpl-bc.html' },
  QRCODE: { command: '^BQ', url: 'https://docs.zebra.com/us/en/printers/software/zpl-pg/c-zpl-zpl-commands/r-zpl-bq.html' },
  BOX: { command: '^GB', url: 'https://docs.zebra.com/us/en/printers/software/zpl-pg/c-zpl-zpl-commands/r-zpl-gb.html' },
  LINE: { command: '^GB', url: 'https://docs.zebra.com/us/en/printers/software/zpl-pg/c-zpl-zpl-commands/r-zpl-gb.html' },
  CIRCLE: { command: '^GE', url: 'https://docs.zebra.com/us/en/printers/software/zpl-pg/c-zpl-zpl-commands/r-zpl-ge.html' },
  GRAPHIC: { command: '^GF', url: 'https://docs.zebra.com/us/en/printers/software/zpl-pg/c-zpl-zpl-commands/r-zpl-gf.html' },
};

// A locked Circle exports ^GC; an unlocked Ellipse exports ^GE (see ADR 0004),
// so the doc link follows the aspect lock.
const ZPL_GC_DOC = { command: '^GC', url: 'https://docs.zebra.com/us/en/printers/software/zpl-pg/c-zpl-zpl-commands/r-zpl-gc.html' };

function resolveZplDoc(element) {
  if (!element) return null;
  if (element.type === 'CIRCLE' && element.aspectLocked !== false) return ZPL_GC_DOC;
  return ZPL_DOC_MAP[element.type] || null;
}

function renderPropertiesPanel() {
  const html = propertiesPanelRenderer.render(state.selectedElement);
  propertiesPanel.innerHTML = html;

  if (state.selectedElement) {
    attachPropertyListeners(state.selectedElement);
  }

  updateZplDocLink();
}

// Sync the ZPL doc link to the current selection. Kept separate from the panel
// render so it can also refresh on property changes (e.g. toggling a Circle's
// aspect lock flips the link between ^GC and ^GE without a full re-render).
function updateZplDocLink() {
  const docLink = document.getElementById('zpl-doc-link');
  if (!docLink) return;
  const doc = resolveZplDoc(state.selectedElement);
  if (doc) {
    docLink.textContent = `${doc.command} docs`;
    docLink.href = doc.url;
    docLink.removeAttribute('hidden');
  } else {
    docLink.setAttribute('hidden', '');
  }
}

// Update Elements List
function updateElementsList() {
  const html = elementsListRenderer.render(state.elements, state.selectedElement, state.warnings);
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
  zplOutputRaw.value = zpl;
  zplOutputHighlight.innerHTML = highlightZPL(zpl);
  zplOutputHighlight.classList.toggle("is-empty", zpl.trim().length === 0);
  if (fullscreen) fullscreen.updateInlineZpl(zpl);
  scheduleOverlayPreviewRefresh();
}

// Cache for API preview
let lastPreviewZpl = null;
let lastPreviewImageUrl = null;
let warningsPanelDismissed = false;
let previewRequestId = 0;
let pendingPreviewFetches = 0;

function setRefreshSpinning(active) {
  if (active) pendingPreviewFetches++;
  else pendingPreviewFetches = Math.max(0, pendingPreviewFetches - 1);
  refreshPreviewIcon.classList.toggle('animate-spin', pendingPreviewFetches > 0);
}

async function fetchPreviewResponse(url, previewZpl, requestId, retriesRemaining = 1) {
  await waitForPreviewRequestWindow();

  if (requestId !== previewRequestId) {
    return null;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Linter": "On",
    },
    body: previewZpl,
  });

  if (response.status === 429 && retriesRemaining > 0) {
    return fetchPreviewResponse(url, previewZpl, requestId, retriesRemaining - 1);
  }

  return response;
}

// Update Preview using Labelary API
async function updatePreview() {
  const requestId = ++previewRequestId;
  const shouldPaintPreview = () => previewMode === 'api' || previewMode === 'overlay';

  if (state.elements.length === 0) {
    lastPreviewZpl = null;
    lastPreviewImageUrl = null;
    if (shouldPaintPreview()) {
      previewImage.classList.add('hidden');
      previewError.classList.add('hidden');
      previewPlaceholder.classList.remove('hidden');
    }
    state.clearWarnings();
    return;
  }

  // Generate preview ZPL with byte map for warning resolution
  const { zpl: previewZpl, byteMap } = zplGenerator.generatePreviewZPLWithMap(state.elements, state.labelSettings, state.selectedElement);
  const { width, height, dpmm } = state.labelSettings;

  // Check cache - if ZPL hasn't changed, reuse the existing image
  if (previewZpl === lastPreviewZpl && lastPreviewImageUrl) {
    if (shouldPaintPreview()) {
      previewError.classList.add('hidden');
      previewPlaceholder.classList.add('hidden');
      previewImage.src = lastPreviewImageUrl;
      previewImage.classList.remove('hidden');
    }
    return;
  }

  // Keep the previous render visible while the new one is fetched.
  // The refresh button icon spins to indicate the in-flight request.
  if (shouldPaintPreview()) {
    previewError.classList.add('hidden');
    previewPlaceholder.classList.add('hidden');
    if (lastPreviewImageUrl) {
      previewImage.src = lastPreviewImageUrl;
      previewImage.classList.remove('hidden');
    } else {
      previewImage.classList.add('hidden');
    }
  }

  setRefreshSpinning(true);
  try {
    // Convert mm to inches for the API (1 inch = 25.4 mm)
    const widthInches = width / 25.4;
    const heightInches = height / 25.4;
    const url = `https://api.labelary.com/v1/printers/${dpmm}dpmm/labels/${widthInches}x${heightInches}/0/`;

    const response = await fetchPreviewResponse(url, previewZpl, requestId);

    if (!response) {
      return;
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    if (requestId !== previewRequestId) {
      return;
    }

    // Parse linter warnings from response header
    const warningsHeader = response.headers.get('X-Warnings');
    if (warningsHeader) {
      const parsed = warningParser.parse(warningsHeader);
      const resolved = warningParser.resolveElements(parsed, byteMap);
      state.setWarnings(resolved);
      warningsPanelDismissed = false;
    } else {
      state.clearWarnings();
    }

    const blob = await response.blob();
    const imageUrl = URL.createObjectURL(blob);

    if (requestId !== previewRequestId) {
      URL.revokeObjectURL(imageUrl);
      return;
    }

    // Clean up old cached image URL
    if (lastPreviewImageUrl) {
      URL.revokeObjectURL(lastPreviewImageUrl);
    }

    // Cache the new ZPL and image URL
    lastPreviewZpl = previewZpl;
    lastPreviewImageUrl = imageUrl;

    if (shouldPaintPreview()) {
      previewImage.src = imageUrl;
      previewImage.classList.remove('hidden');
    }

  } catch (error) {
    if (requestId !== previewRequestId) {
      return;
    }
    console.error("Preview error:", error);
    if (shouldPaintPreview()) {
      previewImage.classList.add('hidden');
      previewError.textContent = `Error loading preview: ${error.message}`;
      previewError.classList.remove('hidden');
    }
    state.clearWarnings();
  } finally {
    setRefreshSpinning(false);
  }
}

// Copy ZPL to Clipboard
async function copyZPL() {
  const text = zplOutputRaw.value;
  const copied = await copyTextToClipboard(text);
  if (!copied) {
    showToast('Failed to copy ZPL. Please select and copy the text manually.', 'error');
    return;
  }

  // Visual feedback
  copyBtnLabel.textContent = "Copied!";
  copyBtn.classList.remove('bg-slate-800', 'hover:bg-slate-700');
  copyBtn.classList.add('bg-green-600', 'hover:bg-green-700');

  setTimeout(() => {
    copyBtnLabel.textContent = "Copy";
    copyBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
    copyBtn.classList.add('bg-slate-800', 'hover:bg-slate-700');
    // Re-sync disabled styling in case elements changed during the feedback window
    updateCopyExportUI();
  }, 2000);
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      // Fall back to execCommand copy below.
    }
  }
  return fallbackCopyZPL(text);
}

function fallbackCopyZPL(text) {
  zplOutputRaw.value = text;
  zplOutputRaw.select();
  zplOutputRaw.setSelectionRange(0, 99999); // For mobile devices
  return document.execCommand("copy");
}


// Export Template to JSON
function exportTemplate() {
  templateManager.exportToFile(state.elements, state.labelSettings);
}

function openInLabelary() {
  const { width, height, dpmm } = state.labelSettings;
  const zpl = zplGenerator.generateZPL(state.elements, state.labelSettings);
  const qs =
    `density=${dpmm}` +
    `&quality=grayscale` +
    `&width=${width}` +
    `&height=${height}` +
    `&units=mm` +
    `&index=0` +
    `&rotation=0` +
    `&zpl=${encodeURIComponent(zpl)}`;
  window.open(`https://labelary.com/viewer.html?${qs}`, '_blank', 'noopener');
}

// Export for Gallery (also reused for Save to Drive via driveMode)
function openExportGalleryModal(driveMode = false) {
  const meta = currentTemplateMetadata || {};
  document.getElementById('gallery-name').value = meta.name || '';
  document.getElementById('gallery-use').value = meta.use || 'shipping';
  document.getElementById('gallery-desc').value = meta.desc || '';
  document.getElementById('gallery-tags').value = (meta.tags || []).join(', ');

  driveDoc.driveMode = driveMode;
  const titleEl = exportGalleryModal.querySelector('h2');
  if (titleEl) titleEl.textContent =
    driveMode === 'update' ? 'Edit Template' :
    driveMode === 'create' ? 'Save to Google Drive' :
    'Export for Gallery';
  if (exportGalleryConfirmBtn) {
    exportGalleryConfirmBtn.textContent =
      driveMode === 'update' ? 'Save' :
      driveMode === 'create' ? 'Save to Drive' :
      'Export JSON';
  }

  exportGalleryModal.showModal();
  document.getElementById('gallery-name').focus();
}

function deriveMediaString(labelSettings) {
  const w = labelSettings.width;
  const h = labelSettings.height;
  return `${w}×${h} mm`;
}

function closeExportGalleryModal() {
  exportGalleryModal.close();
}

async function doExportForGallery() {
  const name = document.getElementById('gallery-name').value.trim();
  const use = document.getElementById('gallery-use').value;
  const desc = document.getElementById('gallery-desc').value.trim();
  const tagsRaw = document.getElementById('gallery-tags').value.trim();

  if (!name || !desc) {
    showToast('Name and description are required.', 'error');
    return;
  }

  const tags = tagsRaw
    ? tagsRaw.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  const serialized = JSON.parse(serializationService.exportTemplate(state.elements, state.labelSettings));

  const metadata = {
    name,
    use,
    media: deriveMediaString(serialized.labelSettings),
    tags,
    desc,
  };

  const galleryExport = {
    metadata,
    elements: serialized.elements,
    labelSettings: serialized.labelSettings,
  };

  // Drive-save branch.
  if (driveDoc.driveMode) {
    closeExportGalleryModal();
    try {
      setSaving(true);
      if (driveDoc.driveMode === 'update') {
        // Rename / edit existing file in place.
        const updated = await driveTemplateService.update({ fileId: driveDoc.fileId, name, json: galleryExport });
        document.dispatchEvent(new CustomEvent('drive:template-saved', {
          detail: { json: galleryExport, fileMeta: { id: driveDoc.fileId, name: updated.name, modifiedTime: updated.modifiedTime } }
        }));
        showToast('Saved', 'success');
      } else {
        // 'create' — Save As or first save.
        const created = await driveTemplateService.create({ name, json: galleryExport });
        driveDoc.fileId = created.id;
        document.dispatchEvent(new CustomEvent('drive:template-saved', {
          detail: { json: galleryExport, fileMeta: { id: created.id, name: created.name, modifiedTime: created.modifiedTime, createdTime: created.createdTime } }
        }));
        syncEditorUrlForDrive();
        showToast('Saved to Drive', 'success');
      }
      currentTemplateMetadata = metadata;
      updateDriveChipLabel();
      document.title = metadata.name + ' — Zebra ZPL Editor';
      setSaving(false);
      markClean();
    } catch (err) {
      setSaving(false);
      console.warn('Drive save failed:', err);
      showToast('Couldn\'t save to Drive: ' + (err.message || ''), 'error');
    }
    return;
  }

  // Default download path (unchanged).
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const blob = new Blob([JSON.stringify(galleryExport, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (slug || 'gallery-template') + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  closeExportGalleryModal();
}

// Share Template via URL
async function shareTemplate() {
  try {
    const url = await urlShareService.generateShareUrl(state.elements, state.labelSettings);
    const copied = await copyTextToClipboard(url);
    if (!copied) {
      throw new Error('Clipboard copy failed');
    }

    // Visual feedback
    shareBtnLabel.textContent = "Link Copied!";
    shareBtn.classList.remove('bg-indigo-600', 'hover:bg-indigo-700');
    shareBtn.classList.add('bg-green-600', 'hover:bg-green-700');

    setTimeout(() => {
      shareBtnLabel.textContent = "Share";
      shareBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
      shareBtn.classList.add('bg-indigo-600', 'hover:bg-indigo-700');
      updateCopyExportUI();
    }, 2000);
  } catch (error) {
    console.error('Failed to share template URL:', error);
    showToast('Failed to copy share link. Please try exporting as a file instead.', 'error');
  }
}

// Handle File Import
function handleFileImport(event) {
  templateManager.handleFileImport(
    event,
    (template) => importTemplate(template),
    (error) => showToast("Error importing template: " + error, 'error')
  );
}

// ZPL Import Modal
let pendingZPLResult = null;

function openZPLImportModal() {
  zplImportInput.value = '';
  zplImportWarnings.classList.add('hidden');
  zplImportWarningsList.innerHTML = '';
  zplImportConfirmBtn.textContent = 'Import';
  pendingZPLResult = null;
  zplImportModal.showModal();
  zplImportInput.focus();
}

function closeZPLImportModal() {
  zplImportModal.close();
  pendingZPLResult = null;
}

function handleZPLImport() {
  const zplText = zplImportInput.value.trim();
  if (!zplText) return;

  // If we already parsed and showed warnings, proceed with import on second click
  if (pendingZPLResult) {
    const template = {
      elements: pendingZPLResult.elements,
      labelSettings: pendingZPLResult.labelSettings
    };
    importTemplate(template);
    pendingZPLResult = null;
    closeZPLImportModal();
    return;
  }

  const dpmm = state.labelSettings.dpmm || 8;
  const labelHeightVal = state.labelSettings.height || 50;
  const result = zplParser.parse(zplText, { dpmm, labelHeight: labelHeightVal });

  if (result.warnings.length > 0) {
    // Show warnings inline, change button to "Import Anyway"
    zplImportWarnings.classList.remove('hidden');
    zplImportWarningsList.innerHTML = result.warnings
      .map(w => {
        const cmd = w.command ? `<code class="bg-amber-100 px-1 rounded">${escapeHtmlForZPLImport(w.command)}</code> ` : '';
        return `<li>${cmd}${escapeHtmlForZPLImport(w.message)}</li>`;
      })
      .join('');
    zplImportConfirmBtn.textContent = 'Import Anyway';
    pendingZPLResult = result;
  } else {
    // No warnings, import directly
    const template = {
      elements: result.elements,
      labelSettings: result.labelSettings
    };
    importTemplate(template);
    closeZPLImportModal();
  }
}

function escapeHtmlForZPLImport(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Import Template from JSON
function importTemplate(template) {
  // Reset viewport to Fit for the new template — different label dimensions
  // need a fresh fit, and the user's prior zoom/pan no longer makes sense.
  isAtFit = true;
  panX = 0;
  panY = 0;

  // Clear stale Labelary preview so the old template doesn't flash in overlay mode
  if (lastPreviewImageUrl) {
    URL.revokeObjectURL(lastPreviewImageUrl);
    lastPreviewImageUrl = null;
  }
  lastPreviewZpl = null;
  previewImage.classList.add('hidden');

  // Clear current elements
  state.setElements([]);
  state.setSelectedElement(null);
  state.clearWarnings();
  warningsPanelDismissed = false;

  currentTemplateMetadata = template.metadata || null;
  updateDriveChipLabel();

  // Import label settings
  state.updateLabelSettings(template.labelSettings);
  syncLabelSettingsInputs();

  if (template.labelSettings.customFonts !== undefined && Array.isArray(template.labelSettings.customFonts)) {
    renderCustomFonts();
    updateFontDropdownOptions();
  }

  // Recreate elements from template. Pass the label default so inherited bitmap
  // sizes snap to the right grid.
  const importedElements = template.elements
    .map(elementData => createElementFromData(elementData, { keepId: false, labelFontId: template.labelSettings?.fontId }))
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
  updateCopyExportUI();
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

// ============================================================
// Drive: editor-side wiring (Save button, Ctrl+S, name input,
// header chip, beforeunload, toasts).
// ============================================================

function updateDriveSaveBtnState() {
  const btn = document.getElementById('drive-chip-btn');
  if (!btn) return;
  const connected = isDriveConfigured() && driveAuth.isConnected();
  btn.disabled = !connected;
  btn.dataset.tooltip = connected ? 'Save to Google Drive' : 'Connect Google Drive to save';
  const wrap = document.getElementById('drive-save-wrap');
  if (wrap) wrap.classList.toggle('hidden', !connected);
  const renameBtn = document.getElementById('drive-menu-rename');
  if (renameBtn) renameBtn.disabled = !driveDoc.fileId;
}

function updateDriveChipLabel() {
  const el = document.getElementById('drive-chip-name');
  if (!el) return;
  if (!isDriveConfigured() || !driveAuth.isConnected()) return;
  el.textContent = (currentTemplateMetadata && currentTemplateMetadata.name) || 'Untitled template';
}

function syncEditorUrlForDrive() {
  if (!driveDoc.fileId) return;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('drive') !== driveDoc.fileId) {
      url.searchParams.set('drive', driveDoc.fileId);
      window.history.replaceState({}, '', url.toString());
    }
  } catch {
    // best-effort
  }
}

async function saveToDrive() {
  if (!isDriveConfigured()) {
    showToast('Google Drive is not configured. See src/config/drive-config.js.', 'error');
    return;
  }
  if (!driveAuth.isConnected()) {
    showToast('Connect Google Drive first.', 'error');
    return;
  }
  if (state.elements.length === 0) {
    showToast('Add at least one element before saving.', 'error');
    return;
  }

  // First save → reuse Export-for-Gallery modal to collect metadata.
  if (!driveDoc.fileId) {
    openExportGalleryModal('create');
    return;
  }

  // Subsequent save → silent PATCH.
  const name = (currentTemplateMetadata && currentTemplateMetadata.name) || 'Untitled template';
  const serialized = JSON.parse(serializationService.exportTemplate(state.elements, state.labelSettings));
  const meta = currentTemplateMetadata || {};
  const payload = {
    metadata: {
      name,
      use: meta.use || 'shipping',
      media: deriveMediaString(serialized.labelSettings),
      tags: meta.tags || [],
      desc: meta.desc || '',
    },
    elements: serialized.elements,
    labelSettings: serialized.labelSettings,
  };
  try {
    setSaving(true);
    const updated = await driveTemplateService.update({ fileId: driveDoc.fileId, name, json: payload });
    document.dispatchEvent(new CustomEvent('drive:template-saved', {
      detail: { json: payload, fileMeta: { id: driveDoc.fileId, name: updated.name, modifiedTime: updated.modifiedTime } }
    }));
    currentTemplateMetadata = payload.metadata;
    setSaving(false);
    markClean();
    updateDriveChipLabel();
    showToast('Saved', 'success');
  } catch (err) {
    setSaving(false);
    console.warn('Drive update failed:', err);
    showToast('Couldn\'t save: ' + (err.message || ''), 'error');
  }
}

function wireDriveEditorBindings() {
  // Save to Drive dropdown (ZPL panel)
  const chipBtn = document.getElementById('drive-chip-btn');
  if (chipBtn) {
    chipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('drive-chip-menu').classList.toggle('hidden');
    });
  }
  const menuSave = document.getElementById('drive-menu-save');
  if (menuSave) menuSave.addEventListener('click', () => {
    document.getElementById('drive-chip-menu').classList.add('hidden');
    saveToDrive();
  });
  const menuSaveAs = document.getElementById('drive-menu-save-as');
  if (menuSaveAs) menuSaveAs.addEventListener('click', () => {
    document.getElementById('drive-chip-menu').classList.add('hidden');
    openExportGalleryModal('create');
  });
  const menuRename = document.getElementById('drive-menu-rename');
  if (menuRename) menuRename.addEventListener('click', () => {
    document.getElementById('drive-chip-menu').classList.add('hidden');
    openExportGalleryModal('update');
  });

  // Ctrl/Cmd+S → Save to Drive (suppress browser save-page default).
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      saveToDrive();
    }
  });

  // Close drive dropdown when clicking outside it.
  document.addEventListener('click', () => {
    const menu = document.getElementById('drive-chip-menu');
    if (menu) menu.classList.add('hidden');
  });

  // Confirm-on-close if dirty.
  window.addEventListener('beforeunload', (e) => {
    if (driveDoc.dirty) {
      e.preventDefault();
      e.returnValue = '';
      return '';
    }
  });

  // Initial UI sync
  updateSaveStatusUI();
  updateDriveSaveBtnState();

  // Mount header chip and listen for auth state changes.
  renderEditorHeaderChip();
  driveAuth.subscribe(renderEditorHeaderChip);
  driveAuth.subscribe(updateDriveSaveBtnState);
  driveAuth.refreshProfileIfMissing();
}

async function connectDriveFromEditor() {
  try {
    await driveAuth.signIn();
    if (!driveAuth.getFolder()) {
      const folder = await driveAuth.pickFolder();
      driveAuth.setFolder(folder.id, folder.name);
    }
    showToast('Connected to Google Drive', 'success');
  } catch (err) {
    if (err && /cancelled/i.test(err.message || '')) return;
    console.warn('Drive connect failed:', err);
    showToast(err.message || 'Failed to connect', 'error');
  }
}

function renderEditorHeaderChip() {
  // Only the active view owns the shared #drive-auth-chip slot — bail when
  // the gallery is showing so we don't clobber its rendering.
  if (getCurrentView() !== 'editor') return;
  const host = document.getElementById('drive-auth-chip');
  if (!host) return;

  if (!isDriveConfigured()) {
    host.innerHTML = '';
    unbindOutsideClick('editor-drive-profile');
    return;
  }

  const authState = driveAuth.getState();
  if (!authState.connected) {
    host.innerHTML = `<button id="editor-drive-connect-btn"
      class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700">
      <svg width="16" height="16" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" class="shrink-0">
        <path fill="#0066da" d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0a7.3 7.3 0 0 0 1.05 3.55z"/>
        <path fill="#00ac47" d="M43.65 25L29.9 1.2C28.55 2 27.4 3.1 26.6 4.5L1.05 48.5A7.3 7.3 0 0 0 0 52h27.5z"/>
        <path fill="#ea4335" d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.7-1.2 1.05-2.5 1.05-3.8H59.8L73.55 76.8z"/>
        <path fill="#00832d" d="M43.65 25L57.4 1.2C56.05.45 54.55 0 52.9 0H34.4c-1.65 0-3.15.45-4.5 1.2z"/>
        <path fill="#2684fc" d="M59.8 52H27.5L13.75 75.8c1.35.75 2.85 1.2 4.5 1.2h50.3c1.65 0 3.15-.45 4.5-1.2z"/>
        <path fill="#ffba00" d="M73.4 26.5l-12.75-22.1c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.8 52h27.45a7.3 7.3 0 0 0-1.05-3.8z"/>
      </svg>
      <span>Connect Drive</span>
    </button>`;
    unbindOutsideClick('editor-drive-profile');
    document.getElementById('editor-drive-connect-btn').addEventListener('click', connectDriveFromEditor);
    return;
  }

  const profile = authState.profile || {};
  const initial = (profile.name || '?').charAt(0).toUpperCase();
  const avatarHtml = profile.picture
    ? `<img src="${escapeAttr(profile.picture)}" class="w-6 h-6 rounded-full object-cover flex-shrink-0" alt="">`
    : `<span class="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold inline-flex items-center justify-center flex-shrink-0">${escapeHtml(initial)}</span>`;

  host.innerHTML = `<div class="relative inline-flex items-center">
    <button id="editor-drive-profile-btn"
      class="inline-flex items-center gap-1.5 border border-slate-200 rounded-full py-[3px] pr-2.5 pl-[3px] text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer bg-transparent"
      aria-haspopup="true" aria-expanded="false">
      ${avatarHtml}
      <span class="truncate max-w-[120px]">${escapeHtml(profile.name || 'Connected')}</span>
      <span class="material-icons-round text-[14px] text-slate-400">expand_more</span>
    </button>
    <div id="editor-drive-dropdown"
      class="hidden absolute top-[calc(100%+6px)] right-0 min-w-[220px] bg-white border border-slate-200 rounded-xl shadow-lg p-2 z-30">
      <button id="editor-drive-disconnect"
        class="flex items-center gap-2 w-full text-left text-[12.5px] font-medium text-red-500 px-2.5 py-1.5 rounded-lg hover:bg-red-50 transition-colors">
        <span class="material-icons-round text-[16px]">logout</span> Disconnect
      </button>
    </div>
  </div>`;

  const profileBtn = document.getElementById('editor-drive-profile-btn');
  const dropdown = document.getElementById('editor-drive-dropdown');

  profileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = !dropdown.classList.contains('hidden');
    dropdown.classList.toggle('hidden', open);
    profileBtn.setAttribute('aria-expanded', String(!open));
  });

  // Slot-bound: each chip re-render (auth state change) replaces this handler.
  // Look up the nodes inside the handler — captured refs go stale across renders.
  bindOutsideClick('editor-drive-profile', () => {
    const dd = document.getElementById('editor-drive-dropdown');
    const btn = document.getElementById('editor-drive-profile-btn');
    if (dd) dd.classList.add('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  });

  document.getElementById('editor-drive-disconnect').addEventListener('click', async () => {
    dropdown.classList.add('hidden');
    const ok = window.confirm('Disconnect Google Drive?\n\nYour templates remain in your Drive folder.');
    if (!ok) return;
    await driveAuth.disconnect();
  });
}


function showToast(message, kind) {
  const host = document.getElementById('toast-host');
  if (!host) {
    if (kind === 'error') console.warn(message); else console.log(message);
    return;
  }
  const el = document.createElement('div');
  const bg = kind === 'error' ? 'bg-red-600' : kind === 'success' ? 'bg-green-600' : 'bg-slate-800';
  el.className = `${bg} text-white text-xs font-medium px-3 py-2 rounded-lg shadow-lg pointer-events-auto flex items-center gap-2 max-w-sm`;
  el.style.animation = 'fadeIn 180ms ease-out';
  const icon = kind === 'error' ? 'error_outline' : kind === 'success' ? 'check_circle' : 'info';
  el.innerHTML = `<span class="material-icons-round text-[16px]">${icon}</span><span></span>`;
  el.querySelector('span:last-child').textContent = message;
  host.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 200ms';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 220);
  }, 3200);
}

// Wire up on DOM ready. main.js will call this via the existing init path,
// but we also defer to a microtask to make sure all the DOM nodes exist.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wireDriveEditorBindings);
} else {
  queueMicrotask(wireDriveEditorBindings);
}
