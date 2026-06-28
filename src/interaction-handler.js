// Interaction Handler for Canvas
// Handles mouse clicks, drag-to-move, and keyboard events

import { getBarcodeGeometry, matrixModuleDots, linearFallbackModules, BARCODE_2D_SIZE_BOUNDS } from './utils/barcodeGeometry.js';
import { LINE_HEIGHT_RATIO, clampNumber } from './utils/geometry.js';
import { resolveFontLineHeight, resolveFontMetrics } from './utils/fontMetrics.js';
import { snapRequestedToAllowed, proportionalRequestedWidth } from './utils/zplFontSnap.js';

export class InteractionHandler {
  constructor(canvasRenderer, elements, labelSettings, callbacks) {
    this.renderer = canvasRenderer;
    this.canvas = canvasRenderer.canvas;
    this.elements = elements;
    this.labelSettings = labelSettings;
    this.callbacks = callbacks;

    // Drag state
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
    this.dragElement = null;

    // Click detection
    this.mouseDownTime = 0;
    this.mouseDownX = 0;
    this.mouseDownY = 0;

    // Resize state
    this.isResizing = false;
    this.resizeHandle = null; // 'br' only for now
    this.clipboardData = null;
    this.hasNotifiedDragStart = false;
    this.keyboardMoveActive = false;
    this.keyboardMoveTimer = null;
    this.keyboardMoveTargets = null;
    this.smartGuideService = null;

    // Multi-select state
    this.dragGroup = null;          // [{el, dx, dy}] offsets vs the primary drag element
    this.dragGroupBounds = null;    // union bounds of the drag group relative to the primary
    this.pendingCollapseElement = null; // member of a multi-selection clicked without dragging
    this.isMarquee = false;         // drag-select rectangle in progress
    this.marqueeStart = null;       // {x, y} in label dots
    this.marqueeAdditive = false;   // Shift held → add to existing selection
    this.marqueeBase = [];          // selection that existed when an additive marquee began
    this.marqueeSelection = null;   // latest hits computed during the marquee drag
    // While a marquee is active these are bound to window so the drag keeps
    // tracking past the canvas edge and finalizes on release anywhere.
    this._boundMarqueeMove = this.handleMarqueeMove.bind(this);
    this._boundMarqueeUp = this.handleMarqueeUp.bind(this);

    this.setupEventListeners();
  }

  setupEventListeners() {
    this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
    this.canvas.addEventListener('mouseleave', this.handleMouseLeave.bind(this));
    this.canvas.addEventListener('contextmenu', this.handleContextMenu.bind(this));

    // Keyboard events (needs to be on document for arrow keys)
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
    document.addEventListener('keyup', this.handleKeyUp.bind(this));
  }

  shouldUseSmartGuides(ctrlKey) {
    return Boolean(this.smartGuideService && ctrlKey);
  }

  syncSmartGuidesForDrag(proposedX, proposedY, ctrlKey, applySnap = true) {
    if (!this.dragElement || !this.shouldUseSmartGuides(ctrlKey)) {
      this.renderer.clearSmartGuides();
      return { snapX: null, snapY: null };
    }

    const guideResult = this.smartGuideService.detectGuides(
      this.dragElement, proposedX, proposedY,
      this.elements, this.labelSettings, this.renderer
    );

    this.renderer.setSmartGuides(guideResult.guides);
    return applySnap ? guideResult : { snapX: null, snapY: null };
  }

  syncSmartGuidesForResize(ctrlKey) {
    if (!this.dragElement || !this.shouldUseSmartGuides(ctrlKey)) {
      this.renderer.clearSmartGuides();
      return;
    }

    const guideResult = this.smartGuideService.detectGuides(
      this.dragElement, this.dragElement.x, this.dragElement.y,
      this.elements, this.labelSettings, this.renderer
    );

    this.renderer.setSmartGuides(guideResult.guides);
  }

  refreshSmartGuidesForActiveTransform(ctrlKey) {
    if (!this.dragElement || (!this.isDragging && !this.isResizing)) {
      return;
    }

    if (this.isResizing) {
      this.syncSmartGuidesForResize(ctrlKey);
    } else {
      this.syncSmartGuidesForDrag(this.dragElement.x, this.dragElement.y, ctrlKey, false);
    }

    if (this.callbacks.onElementDragging) {
      this.callbacks.onElementDragging(this.dragElement);
    }
  }

  getFieldBlockLineHeight(element) {
    const fontMetrics = resolveFontMetrics(element, this.labelSettings || {}, 1);
    return resolveFontLineHeight(fontMetrics, LINE_HEIGHT_RATIO);
  }

  handleMouseDown(e) {
    // Only left-button starts an element interaction; middle/right are reserved
    // for viewport pan and context menu.
    if (e.button !== 0) return;

    const coords = this.renderer.mouseToLabelCoords(e.clientX, e.clientY);
    this.mouseDownTime = Date.now();
    this.mouseDownX = coords.x;
    this.mouseDownY = coords.y;
    this.pendingCollapseElement = null;

    // Check for resize handle click first — only with a single selection
    // (group resize is out of scope; handles aren't drawn for multi-selections).
    const selectedElement = this.callbacks.getSelectedElement();
    const selectionList = this.callbacks.getSelectedElements ? this.callbacks.getSelectedElements() : (selectedElement ? [selectedElement] : []);
    if (selectionList.length === 1 && selectedElement && (selectedElement.type === 'FIELDBLOCK' || selectedElement.type === 'TEXTBLOCK' || selectedElement.type === 'BOX' || selectedElement.type === 'LINE' || selectedElement.type === 'BARCODE' || selectedElement.type === 'QRCODE' || selectedElement.type === 'CIRCLE' || selectedElement.type === 'DIAGONALLINE' || selectedElement.type === 'TEXT' || selectedElement.type === 'GRAPHIC')) {
      const handle = this.getHandleAtPosition(coords.x, coords.y, selectedElement);
      if (handle) {
        if (selectedElement.locked) return;
        this.isResizing = true;
        this.resizeHandle = handle;
        this.dragElement = selectedElement; // Use same drag element ref
        this.hasNotifiedDragStart = false;
        if (this.callbacks.onElementTransformStart) {
          this.callbacks.onElementTransformStart(selectedElement, 'resize');
        }

        // Store original position and size for resize calculations
        this.resizeStartX = selectedElement.x;
        this.resizeStartY = selectedElement.y;

        if (selectedElement.type === 'LINE' || selectedElement.type === 'BARCODE' || selectedElement.type === 'QRCODE') {
          const bounds = selectedElement.getBounds();
          this.resizeStartWidth = bounds.width;
          this.resizeStartHeight = bounds.height;
        } else if (selectedElement.type === 'CIRCLE' || selectedElement.type === 'DIAGONALLINE') {
          this.resizeStartWidth = selectedElement.width;
          this.resizeStartHeight = selectedElement.height;
        } else if (selectedElement.type === 'GRAPHIC') {
          const graphicRotated90 = selectedElement.orientation === 'R' || selectedElement.orientation === 'B';
          this.resizeStartWidth = graphicRotated90 ? selectedElement.heightDots : selectedElement.widthDots;
          this.resizeStartHeight = graphicRotated90 ? selectedElement.widthDots : selectedElement.heightDots;
        } else if (selectedElement.type === 'TEXT') {
          const resolvedFontId = selectedElement.fontId || this.labelSettings?.fontId || '0';
          this.resizeStartHeight = selectedElement.fontSize || this.labelSettings?.defaultFontHeight || 20;
          this.resizeStartFontWidth = selectedElement.fontWidth
            || this.labelSettings?.defaultFontWidth
            || proportionalRequestedWidth(resolvedFontId, this.resizeStartHeight);
          // Store the measured text width so horizontal drag tracks the right edge 1:1
          const measuredBounds = this.renderer.measureTextBounds(selectedElement, this.labelSettings);
          this.resizeStartWidth = measuredBounds.width;
          this.resizeStartMeasuredWidth = measuredBounds.width;
          this.resizeStartMeasuredHeight = measuredBounds.height;
        } else if (selectedElement.type === 'TEXTBLOCK') {
          this.resizeStartWidth = selectedElement.blockWidth;
          this.resizeStartHeight = selectedElement.blockHeight;
        } else {
          this.resizeStartWidth = selectedElement.type === 'BOX' ? selectedElement.width : selectedElement.blockWidth;
          if (selectedElement.type === 'FIELDBLOCK') {
            const maxLines = selectedElement.maxLines || 1;
            const lineSpacing = selectedElement.lineSpacing || 0;
            // Line spacing is only between lines, not after the last line
            const baseLineHeight = this.getFieldBlockLineHeight(selectedElement);
            this.resizeStartHeight = baseLineHeight * maxLines + lineSpacing * Math.max(0, maxLines - 1);
          } else {
            this.resizeStartHeight = selectedElement.type === 'BOX' ? selectedElement.height : (selectedElement.fontSize || this.labelSettings?.defaultFontHeight || 30) * (selectedElement.maxLines || 1);
          }
        }
        this.resizeMouseStartX = coords.x;
        this.resizeMouseStartY = coords.y;

        // Set cursor based on handle
        this.canvas.style.cursor = this.getCursorForHandle(handle);
        return; // Skip drag/select logic
      }
    }

    // Find element at position (Alt = ignore topmost)
    let element = null;
    if (e.altKey) {
      const hits = this.getElementsAtPosition(coords.x, coords.y);
      if (hits.length > 0) {
        const current = this.callbacks.getSelectedElement();
        const currentIndex = hits.findIndex((item) => current && item.id === current.id);
        const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % hits.length;
        element = hits[nextIndex];
      }
    } else {
      element = this.getElementAtPosition(coords.x, coords.y);
    }

    if (element) {
      // Shift+Click toggles membership (Alt overrides Shift and stays single-replace).
      if (e.shiftKey && !e.altKey) {
        if (this.callbacks.toggleSelection) this.callbacks.toggleSelection(element);
        return;
      }

      const inMulti = selectionList.length > 1 && selectionList.some(el => String(el.id) === String(element.id));
      if (inMulti) {
        // Keep the group so it can be dragged as a unit; a click without a drag
        // collapses to just this element (resolved in handleMouseUp).
        this.pendingCollapseElement = element;
      } else {
        // Replace selection with this single element.
        this.callbacks.onElementSelected(element);
      }

      if (!element.locked) {
        this.dragElement = element;
        this.dragOffsetX = coords.x - element.x;
        this.dragOffsetY = coords.y - element.y;
        this.dragStartX = element.x;
        this.dragStartY = element.y;
        this.buildDragGroup(element, inMulti);

        // Update cursor
        this.canvas.style.cursor = 'grab';
      } else {
        this.dragGroup = null;
      }
    } else {
      // Empty canvas → start a marquee drag-select. Shift adds to the current
      // selection; without Shift we deselect (a plain empty click clears).
      this.isMarquee = true;
      this.marqueeStart = { x: coords.x, y: coords.y };
      this.marqueeSelection = null;
      this.marqueeAdditive = e.shiftKey;
      this.marqueeBase = e.shiftKey && this.callbacks.getSelectedElements
        ? this.callbacks.getSelectedElements()
        : [];
      if (!e.shiftKey) {
        this.callbacks.onElementSelected(null);
      }
      // Track the marquee at the window level so it survives the pointer leaving
      // the canvas and finalizes on release wherever that happens.
      window.addEventListener('mousemove', this._boundMarqueeMove);
      window.addEventListener('mouseup', this._boundMarqueeUp);
    }
  }

  /**
   * Update the marquee from a window-level mouse move (pointer may be off-canvas).
   */
  handleMarqueeMove(e) {
    if (!this.isMarquee) return;
    const coords = this.renderer.mouseToLabelCoords(e.clientX, e.clientY);
    const rect = this.normalizeRect(this.marqueeStart, coords);

    const hits = this.getElementsInRect(rect);
    let selection = hits;
    if (this.marqueeAdditive) {
      const byId = new Map();
      [...this.marqueeBase, ...hits].forEach(el => byId.set(String(el.id), el));
      selection = [...byId.values()];
    }
    this.marqueeSelection = selection;
    // Lightweight live update: set the rect + selection and redraw the canvas
    // only (panels are refreshed once on release to avoid per-frame DOM churn).
    if (this.callbacks.onMarqueeSelect) this.callbacks.onMarqueeSelect(selection, rect);
  }

  /**
   * Finalize a marquee on window-level mouse up (release may be off-canvas).
   */
  handleMarqueeUp() {
    if (!this.isMarquee) return;
    this.endMarquee(true);
  }

  /**
   * Tear down an active marquee. When `apply` is true the final hit set becomes
   * the selection; otherwise the selection is left as-is (used on cancel).
   */
  endMarquee(apply) {
    if (!this.isMarquee) return;
    this.isMarquee = false;
    window.removeEventListener('mousemove', this._boundMarqueeMove);
    window.removeEventListener('mouseup', this._boundMarqueeUp);

    if (this.callbacks.onMarqueeUpdate) this.callbacks.onMarqueeUpdate(null);
    if (apply && this.marqueeSelection && this.callbacks.onSelectionChanged) {
      this.callbacks.onSelectionChanged(this.marqueeSelection);
    }

    this.marqueeStart = null;
    this.marqueeBase = [];
    this.marqueeSelection = null;
    this.dragElement = null;
    this.canvas.style.cursor = 'default';
  }

  /**
   * Snapshot the set of elements that will move together on drag, with each
   * member's offset from the primary (clicked) element, plus the union bounds
   * of the group relative to the primary for boundary clamping.
   */
  buildDragGroup(primary, inMulti) {
    const selection = this.callbacks.getSelectedElements ? this.callbacks.getSelectedElements() : [];
    const members = (inMulti ? selection : [primary]).filter(el => !el.locked);
    this.dragGroup = members.map(el => ({ el, dx: el.x - primary.x, dy: el.y - primary.y }));

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const el of members) {
      const b = this.getDragConstraintBounds(el);
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width);
      maxY = Math.max(maxY, b.y + b.height);
    }
    this.dragGroupBounds = {
      offsetX: minX - primary.x,
      offsetY: minY - primary.y,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  /**
   * Move every member of the drag group, keeping their relative offsets and
   * clamping the group's union bounds inside the label.
   */
  handleGroupDrag(coords) {
    let newX = coords.x - this.dragOffsetX;
    let newY = coords.y - this.dragOffsetY;

    const labelW = this.labelSettings.width * this.labelSettings.dpmm;
    const labelH = this.labelSettings.height * this.labelSettings.dpmm;
    const gb = this.dragGroupBounds;

    const minX = -gb.offsetX;
    const maxX = labelW - gb.width - gb.offsetX;
    const minY = -gb.offsetY;
    const maxY = labelH - gb.height - gb.offsetY;

    newX = Math.max(minX, Math.min(newX, maxX));
    newY = Math.max(minY, Math.min(newY, maxY));

    const px = Math.round(newX);
    const py = Math.round(newY);
    for (const m of this.dragGroup) {
      m.el.x = px + m.dx;
      m.el.y = py + m.dy;
    }

    if (this.callbacks.onElementsDragging) {
      this.callbacks.onElementsDragging(this.dragGroup.map(m => m.el));
    }
  }

  /**
   * Elements whose selection bounds intersect the marquee rectangle (touch
   * semantics), excluding locked elements.
   */
  getElementsInRect(rect) {
    const rx2 = rect.x + rect.width;
    const ry2 = rect.y + rect.height;
    return this.elements.filter(el => {
      if (el.locked) return false;
      const b = this.getSelectionBounds(el);
      return !(b.x > rx2 || b.x + b.width < rect.x || b.y > ry2 || b.y + b.height < rect.y);
    });
  }

  handleMouseMove(e) {
    const coords = this.renderer.mouseToLabelCoords(e.clientX, e.clientY);

    // A marquee in progress is driven by window-level listeners (so it keeps
    // tracking off-canvas); the canvas move handler stays out of the way.
    if (this.isMarquee) return;

    // Handle Resize
    if (this.isResizing && this.dragElement) {
      if (this.dragElement.type === 'TEXTBLOCK') {
        // TEXTBLOCK supports bottom-right resize for both blockWidth and blockHeight
        const isRotated = this.dragElement.orientation === 'R' || this.dragElement.orientation === 'B';
        const newWidth = isRotated
          ? Math.max(50, coords.y - this.dragElement.y)
          : Math.max(50, coords.x - this.dragElement.x);
        const newHeight = isRotated
          ? Math.max(20, coords.x - this.dragElement.x)
          : Math.max(20, coords.y - this.dragElement.y);

        this.dragElement.blockWidth = Math.round(newWidth);
        this.dragElement.blockHeight = Math.round(newHeight);

        this.syncSmartGuidesForResize(e.ctrlKey);
        this.callbacks.onElementDragging(this.dragElement);
      } else if (this.dragElement.type === 'FIELDBLOCK') {
        // FIELDBLOCK only supports bottom-right resize
        const lineSpacing = this.dragElement.lineSpacing || 0;
        const baseLineHeight = this.getFieldBlockLineHeight(this.dragElement);
        const minHeight = baseLineHeight; // Minimum height is one line
        const isRotated = this.dragElement.orientation === 'R' || this.dragElement.orientation === 'B';
        // When rotated, visual width comes from Y axis, visual height from X axis
        const newWidth = isRotated
          ? Math.max(50, coords.y - this.dragElement.y)
          : Math.max(50, coords.x - this.dragElement.x);
        const newHeight = isRotated
          ? Math.max(minHeight, coords.x - this.dragElement.x)
          : Math.max(minHeight, coords.y - this.dragElement.y);

        this.dragElement.blockWidth = Math.round(newWidth);
        // Calculate maxLines considering line spacing between lines
        const effectiveLineHeight = baseLineHeight + lineSpacing;
        this.dragElement.maxLines = Math.max(1, Math.round((newHeight + lineSpacing) / effectiveLineHeight));

        this.syncSmartGuidesForResize(e.ctrlKey);
        this.callbacks.onElementDragging(this.dragElement);
      } else if (this.dragElement.type === 'QRCODE') {
        // 2D barcodes support bottom-right resize by adjusting their module size.
        const el = this.dragElement;
        const newWidth = Math.max(10, coords.x - el.x);
        const newHeight = Math.max(10, coords.y - el.y);
        const geom = getBarcodeGeometry(el);
        const b = BARCODE_2D_SIZE_BOUNDS;
        if (geom.kind === 'matrix') {
          if (el.symbology === 'PDF417' || el.symbology === 'MICROPDF417') {
            el.moduleWidth = clampNumber(Math.round(newWidth / geom.cols), b[el.symbology].moduleWidth.min, b[el.symbology].moduleWidth.max);
            el.rowHeight = clampNumber(Math.round(newHeight / geom.rows), b[el.symbology].rowHeight.min, b[el.symbology].rowHeight.max);
          } else if (el.symbology === 'DATAMATRIX') {
            el.moduleSize = clampNumber(Math.round(Math.min(newWidth, newHeight) / geom.cols), b.DATAMATRIX.moduleSize.min, b.DATAMATRIX.moduleSize.max);
          } else {
            el.magnification = clampNumber(Math.round(Math.min(newWidth, newHeight) / geom.cols), b.QR.magnification.min, b.QR.magnification.max);
          }
        }
        this.syncSmartGuidesForResize(e.ctrlKey);
        this.callbacks.onElementDragging(this.dragElement);
      } else if (this.dragElement.type === 'TEXT') {
        const dx = coords.x - this.resizeMouseStartX;
        const dy = coords.y - this.resizeMouseStartY;
        const isRotated = this.dragElement.orientation === 'R' || this.dragElement.orientation === 'B';
        const fontSizeDelta = isRotated ? dx : dy;
        const resolvedFontId = this.dragElement.fontId || this.labelSettings?.fontId || '0';
        const rawFontSize = Math.max(1, Math.round(this.resizeStartHeight + fontSizeDelta));
        // Scale fontWidth so the right edge of the selection box tracks the mouse 1:1.
        // measuredWidth = charPixels * fontWidth / fontSize, so fontWidth scales proportionally.
        const startMeasure = isRotated ? this.resizeStartMeasuredHeight : this.resizeStartMeasuredWidth;
        const deltaMeasure = isRotated ? dy : dx;
        const targetWidth = Math.max(1, startMeasure + deltaMeasure);
        const safeStart = Math.max(1, startMeasure);
        // Floor at 1 (not 8) so snapping can reach a font's smallest magnification —
        // e.g. Font A width 5 needs a requested value ≤7; snapRequestedToAllowed clamps
        // the magnification to ≥1 anyway, so no separate minimum is needed here.
        const rawFontWidth = Math.max(1, Math.round(this.resizeStartFontWidth * targetWidth / safeStart));
        // Snap live to the font's allowed grid (no-op for scalable fonts).
        const snapped = snapRequestedToAllowed(resolvedFontId, rawFontSize, rawFontWidth);
        this.dragElement.fontSize = snapped.height;
        this.dragElement.fontWidth = snapped.width;
        this.syncSmartGuidesForResize(e.ctrlKey);
        this.callbacks.onElementDragging(this.dragElement);
      } else if (this.dragElement.type === 'BOX' || this.dragElement.type === 'LINE' || this.dragElement.type === 'BARCODE' || this.dragElement.type === 'CIRCLE' || this.dragElement.type === 'DIAGONALLINE' || this.dragElement.type === 'GRAPHIC') {
        // Calculate mouse delta from resize start
        const dx = coords.x - this.resizeMouseStartX;
        const dy = coords.y - this.resizeMouseStartY;

        let newX = this.resizeStartX;
        let newY = this.resizeStartY;
        let newWidth = this.resizeStartWidth;
        let newHeight = this.resizeStartHeight;

        // Apply resize based on handle type
        switch (this.resizeHandle) {
          case 'tl': // Top-left
            newX = this.resizeStartX + dx;
            newY = this.resizeStartY + dy;
            newWidth = this.resizeStartWidth - dx;
            newHeight = this.resizeStartHeight - dy;
            break;
          case 'tr': // Top-right
            newY = this.resizeStartY + dy;
            newWidth = this.resizeStartWidth + dx;
            newHeight = this.resizeStartHeight - dy;
            break;
          case 'bl': // Bottom-left
            newX = this.resizeStartX + dx;
            newWidth = this.resizeStartWidth - dx;
            newHeight = this.resizeStartHeight + dy;
            break;
          case 'br': // Bottom-right
            newWidth = this.resizeStartWidth + dx;
            newHeight = this.resizeStartHeight + dy;
            break;
          case 't': // Top
            newY = this.resizeStartY + dy;
            newHeight = this.resizeStartHeight - dy;
            break;
          case 'r': // Right
            newWidth = this.resizeStartWidth + dx;
            break;
          case 'b': // Bottom
            newHeight = this.resizeStartHeight + dy;
            break;
          case 'l': // Left
            newX = this.resizeStartX + dx;
            newWidth = this.resizeStartWidth - dx;
            break;
        }

        // Boundary Constraints
        const labelW = this.labelSettings.width * this.labelSettings.dpmm;
        const labelH = this.labelSettings.height * this.labelSettings.dpmm;

        const widthOverhang = this.dragElement.type === 'DIAGONALLINE'
          ? this.dragElement.thickness
          : 0;

        // Constrain X and Width
        if (this.resizeHandle.includes('l')) { // Modifying Left edge
          if (newX < 0) {
            newX = 0;
            newWidth = (this.resizeStartX + this.resizeStartWidth) - newX;
          }
        } else { // Right edge moving or static
          if (newX + newWidth + widthOverhang > labelW) {
            newWidth = labelW - newX - widthOverhang;
          }
        }

        // Constrain Y and Height
        if (this.resizeHandle.includes('t')) { // Modifying Top edge
          if (newY < 0) {
            newY = 0;
            newHeight = (this.resizeStartY + this.resizeStartHeight) - newY;
          }
        } else { // Bottom edge moving or static
          if (newY + newHeight > labelH) {
            newHeight = labelH - newY;
          }
        }

        // Enforce minimum size
        const minSize = 10; // Minimum size for interaction
        const minThickness = 1; // True minimum thickness for lines

        // For line thickness, allow going smaller than 10 (down to 1)
        const isLine = this.dragElement.type === 'LINE';
        const isBarcode = this.dragElement.type === 'BARCODE';
        const isHorizontal = isLine && this.dragElement.orientation === 'H';

        // Determine min limits for width/height based on type and orientation
        let minW = minSize;
        let minH = minSize;

        if (isLine) {
          if (isHorizontal) {
            minH = minThickness;
          } else {
            minW = minThickness;
          }
        } else if (isBarcode) {
          minW = 10;
          minH = 10;
        }

        if (newWidth < minW) {
          newWidth = minW;
          // Adjust position if resizing from left
          if (this.resizeHandle.includes('l') || this.resizeHandle === 'l') {
            newX = this.resizeStartX + this.resizeStartWidth - minW;
          }
        }
        if (newHeight < minH) {
          newHeight = minH;
          // Adjust position if resizing from top
          if (this.resizeHandle.includes('t') || this.resizeHandle === 't') {
            newY = this.resizeStartY + this.resizeStartHeight - minH;
          }
        }

        // GRAPHIC and CIRCLE: Shift only has an effect when aspect is currently
        // locked — it breaks the lock for this resize (CIRCLE → Ellipse). When
        // already unlocked, Shift is a no-op. A locked CIRCLE has a 1:1 start
        // ratio, so the shared projection math keeps it circular. See ADR 0004.
        const supportsAspectLock = this.dragElement.type === 'GRAPHIC' || this.dragElement.type === 'CIRCLE';
        const isAspectLocked = this.dragElement.aspectLocked ?? true;
        const wantAspect = isAspectLocked && !e.shiftKey;
        if (supportsAspectLock && e.shiftKey && isAspectLocked) {
          this._aspectLockBrokenByShift = true;
        }
        if (supportsAspectLock && wantAspect && this.resizeStartHeight > 0) {
          const aspect = this.resizeStartHeight / this.resizeStartWidth;
          const widthDelta = newWidth - this.resizeStartWidth;
          const heightDelta = newHeight - this.resizeStartHeight;
          const isCorner = this.resizeHandle.length === 2;
          if (isCorner) {
            const t = (widthDelta + aspect * heightDelta) / (1 + aspect * aspect);
            newWidth = Math.max(1, this.resizeStartWidth + t);
            newHeight = newWidth * aspect;
          } else {
            if (Math.abs(widthDelta) >= Math.abs(heightDelta)) {
              newHeight = Math.max(1, this.resizeStartWidth + widthDelta) * aspect;
            } else {
              newWidth = Math.max(1, this.resizeStartHeight + heightDelta) / aspect;
            }
          }
          // Re-apply position adjustments for top/left handles after recompute
          if (this.resizeHandle.includes('t')) {
            newY = this.resizeStartY + this.resizeStartHeight - newHeight;
          }
          if (this.resizeHandle.includes('l')) {
            newX = this.resizeStartX + this.resizeStartWidth - newWidth;
          }
        }

        // Update element
        this.dragElement.x = Math.round(newX);
        this.dragElement.y = Math.round(newY);

        if (this.dragElement.type === 'BOX' || this.dragElement.type === 'CIRCLE' || this.dragElement.type === 'DIAGONALLINE') {
          this.dragElement.width = Math.round(newWidth);
          this.dragElement.height = Math.round(newHeight);
        } else if (this.dragElement.type === 'LINE') {
          if (this.dragElement.orientation === 'H') {
            this.dragElement.width = Math.round(newWidth);
            this.dragElement.thickness = Math.round(newHeight);
          } else {
            this.dragElement.width = Math.round(newHeight);
            this.dragElement.thickness = Math.round(newWidth);
          }
        } else if (this.dragElement.type === 'GRAPHIC') {
          // Live preview: bump widthDots/heightDots; the renderer scales the
          // existing ImageData to match. Re-rasterization happens once on
          // mouseup via the onElementDragEnd hook (look for _needsReencode).
          // For R/B orientations the bitmap is rendered rotated 90°, so the
          // visual width maps to heightDots and visual height maps to widthDots.
          const graphicRotated90 = this.dragElement.orientation === 'R' || this.dragElement.orientation === 'B';
          this.dragElement.widthDots = Math.max(8, Math.round(graphicRotated90 ? newHeight : newWidth));
          this.dragElement.heightDots = Math.max(8, Math.round(graphicRotated90 ? newWidth : newHeight));
          this.dragElement.bytesPerRow = Math.ceil(this.dragElement.widthDots / 8);
          this.dragElement._needsReencode = true;
        } else if (this.dragElement.type === 'BARCODE') {
          const dataLength = (this.dragElement.previewData || '').length;
          const geom = getBarcodeGeometry(this.dragElement);
          const totalModules = geom.kind === 'linear' ? geom.modules : linearFallbackModules(dataLength);
          const availableWidth = labelW - newX;
          const maxMultiplier = totalModules > 0 ? Math.floor(Math.min(10, availableWidth / totalModules)) : this.dragElement.width;
          const targetMultiplier = totalModules > 0 ? newWidth / totalModules : this.dragElement.width;
          const roundedMultiplier = Math.round(targetMultiplier);
          const clampedMultiplier = Math.max(1, Math.min(maxMultiplier, roundedMultiplier));

          this.dragElement.width = clampedMultiplier;
          this.dragElement.height = Math.round(newHeight);

          const actualWidth = totalModules * this.dragElement.width;
          if (this.resizeHandle.includes('l') || this.resizeHandle === 'l') {
            this.dragElement.x = Math.round(this.resizeStartX + this.resizeStartWidth - actualWidth);
          }
        }

        this.syncSmartGuidesForResize(e.ctrlKey);
        this.callbacks.onElementDragging(this.dragElement);
      }
      return;
    }

    if (this.dragElement) {
      // Calculate distance moved
      const dx = Math.abs(coords.x - this.mouseDownX);
      const dy = Math.abs(coords.y - this.mouseDownY);
      const distance = Math.sqrt(dx * dx + dy * dy);

      const isGroupDrag = this.dragGroup && this.dragGroup.length > 1;

      // Start dragging if moved more than 5 dots
      if (!this.isDragging && distance > 5) {
        this.isDragging = true;
        this.pendingCollapseElement = null; // an actual drag, not a collapse-click
        this.canvas.style.cursor = 'grabbing';
        if (!this.hasNotifiedDragStart) {
          if (isGroupDrag) {
            this.renderer.clearSmartGuides(); // smart guides are disabled for group drag
            if (this.callbacks.onGroupTransformStart) {
              this.callbacks.onGroupTransformStart(this.dragGroup.map(m => m.el));
            }
          } else if (this.callbacks.onElementTransformStart) {
            this.callbacks.onElementTransformStart(this.dragElement, 'drag');
          }
          this.hasNotifiedDragStart = true;
        }
      }

      if (this.isDragging && isGroupDrag) {
        this.handleGroupDrag(coords);
        return;
      }

      if (this.isDragging) {
        // Update element position
        let newX = coords.x - this.dragOffsetX;
        let newY = coords.y - this.dragOffsetY;

        // Smart guide detection and snapping (before boundary clamping)
        if (this.shouldUseSmartGuides(e.ctrlKey)) {
          const guideResult = this.syncSmartGuidesForDrag(newX, newY, e.ctrlKey);
          if (guideResult.snapX !== null) newX = guideResult.snapX;
          if (guideResult.snapY !== null) newY = guideResult.snapY;
        } else {
          this.renderer.clearSmartGuides();
        }

        // Constrain to label bounds
        const bounds = this.getDragConstraintBounds(this.dragElement);
        const labelW = this.labelSettings.width * this.labelSettings.dpmm;
        const labelH = this.labelSettings.height * this.labelSettings.dpmm;

        // Calculate offset between element pivot and bounds top-left
        const offsetX = bounds.x - this.dragElement.x;
        const offsetY = bounds.y - this.dragElement.y;

        // Calculate valid range for element.x/y
        const minX = -offsetX;
        const maxX = labelW - bounds.width - offsetX;
        const minY = -offsetY;
        const maxY = labelH - bounds.height - offsetY;

        newX = Math.max(minX, Math.min(newX, maxX));
        newY = Math.max(minY, Math.min(newY, maxY));

        // Round to nearest dot
        this.dragElement.x = Math.round(newX);
        this.dragElement.y = Math.round(newY);

        // Trigger callbacks
        this.callbacks.onElementDragging(this.dragElement);
      }
    } else {
      // Update cursor based on hover
      const selectedElement = this.callbacks.getSelectedElement();
      const selCount = this.callbacks.getSelectedElements ? this.callbacks.getSelectedElements().length : (selectedElement ? 1 : 0);
      if (selCount === 1 && selectedElement && (selectedElement.type === 'FIELDBLOCK' || selectedElement.type === 'TEXTBLOCK' || selectedElement.type === 'BOX' || selectedElement.type === 'LINE' || selectedElement.type === 'BARCODE' || selectedElement.type === 'QRCODE' || selectedElement.type === 'CIRCLE' || selectedElement.type === 'DIAGONALLINE' || selectedElement.type === 'TEXT' || selectedElement.type === 'GRAPHIC')) {
        const handle = this.getHandleAtPosition(coords.x, coords.y, selectedElement);
        if (handle) {
          this.canvas.style.cursor = this.getCursorForHandle(handle);
          return;
        }
      }

      const element = this.getElementAtPosition(coords.x, coords.y);
      this.canvas.style.cursor = element ? 'grab' : 'default';
    }
  }

  handleMouseUp(e) {
    const coords = this.renderer.mouseToLabelCoords(e.clientX, e.clientY);
    const clickDuration = Date.now() - this.mouseDownTime;

    // Detect click (mousedown + mouseup within 200ms without significant drag)
    const dx = Math.abs(coords.x - this.mouseDownX);
    const dy = Math.abs(coords.y - this.mouseDownY);
    const distance = Math.sqrt(dx * dx + dy * dy);
    const isClick = clickDuration < 200 && distance < 5;

    // A marquee is finalized by its window-level mouseup handler, not here.
    if (this.isMarquee) return;

    // A plain click on one member of a multi-selection collapses to that element.
    if (isClick && this.pendingCollapseElement) {
      this.callbacks.onElementSelected(this.pendingCollapseElement);
    }

    if (this.isResizing) {
      this.isResizing = false;
      this.resizeHandle = null;
      this.renderer.clearSmartGuides();
      if (this._aspectLockBrokenByShift && this.dragElement &&
          (this.dragElement.type === 'GRAPHIC' || this.dragElement.type === 'CIRCLE')) {
        this.dragElement.aspectLocked = false;
        this._aspectLockBrokenByShift = false;
      }
      this.callbacks.onElementDragEnd(this.dragElement); // Reuse drag end callback for resize end
    }

    if (this.isDragging) {
      // Finalize drag
      this.renderer.clearSmartGuides();
      if (this.dragGroup && this.dragGroup.length > 1) {
        if (this.callbacks.onElementsDragEnd) {
          this.callbacks.onElementsDragEnd(this.dragGroup.map(m => m.el));
        }
      } else {
        this.callbacks.onElementDragEnd(this.dragElement);
      }
      this.isDragging = false;
    }

    // Reset drag state
    this.dragElement = null;
    this.dragGroup = null;
    this.dragGroupBounds = null;
    this.pendingCollapseElement = null;
    this.canvas.style.cursor = 'default';
    this.hasNotifiedDragStart = false;
  }

  handleMouseLeave(e) {
    // A marquee keeps tracking past the canvas edge (window-level listeners),
    // so leaving the canvas must NOT cancel it.
    if (this.isMarquee) return;

    if (this.isDragging || this.isResizing) {
      // Finalize drag if mouse leaves canvas
      this.renderer.clearSmartGuides();
      if (this._aspectLockBrokenByShift && this.dragElement &&
          (this.dragElement.type === 'GRAPHIC' || this.dragElement.type === 'CIRCLE')) {
        this.dragElement.aspectLocked = false;
        this._aspectLockBrokenByShift = false;
      }
      if (this.isDragging && this.dragGroup && this.dragGroup.length > 1) {
        if (this.callbacks.onElementsDragEnd) {
          this.callbacks.onElementsDragEnd(this.dragGroup.map(m => m.el));
        }
      } else {
        this.callbacks.onElementDragEnd(this.dragElement);
      }
      this.isDragging = false;
      this.isResizing = false;
    }

    this.dragElement = null;
    this.dragGroup = null;
    this.dragGroupBounds = null;
    this.pendingCollapseElement = null;
    this.canvas.style.cursor = 'default';
    this.hasNotifiedDragStart = false;
  }

  /**
   * Normalize two points into a positive-size rect in label dots.
   */
  normalizeRect(a, b) {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return { x, y, width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
  }

  handleContextMenu(e) {
    e.preventDefault();

    // Don't show context menu during drag or resize
    if (this.isDragging || this.isResizing) return;

    // Hit test at right-click position
    const coords = this.renderer.mouseToLabelCoords(e.clientX, e.clientY);
    const element = this.getElementAtPosition(coords.x, coords.y);

    // Select the right-clicked element unless it's already part of the selection
    // (so right-clicking a member of a multi-selection keeps the whole group).
    if (element) {
      const selected = this.callbacks.getSelectedElements ? this.callbacks.getSelectedElements() : [];
      const inSelection = selected.some(el => String(el.id) === String(element.id));
      if (!inSelection) {
        this.callbacks.onElementSelected(element);
      }
    }

    if (this.callbacks.onContextMenu) {
      this.callbacks.onContextMenu(e.clientX, e.clientY, coords, element);
    }
  }

  handleKeyDown(e) {
    // ESC during a marquee cancels it, leaving the live selection as-is.
    if (e.key === 'Escape' && this.isMarquee) {
      e.preventDefault();
      this.endMarquee(false);
      return;
    }

    // ESC cancels an active drag/resize transform and restores pre-transform state.
    if (e.key === 'Escape' && (this.isDragging || this.isResizing) && this.dragElement) {
      e.preventDefault();
      this.renderer.clearSmartGuides();
      if (this.isDragging && this.dragGroup && this.dragGroup.length > 1) {
        if (this.callbacks.onGroupTransformCancel) {
          this.callbacks.onGroupTransformCancel(this.dragGroup.map(m => m.el));
        }
      } else if (this.callbacks.onElementTransformCancel) {
        this.callbacks.onElementTransformCancel(this.dragElement);
      }

      this.isDragging = false;
      this.isResizing = false;
      this.resizeHandle = null;
      this.dragElement = null;
      this.dragGroup = null;
      this.dragGroupBounds = null;
      this._aspectLockBrokenByShift = false;
      this.canvas.style.cursor = 'default';
      this.hasNotifiedDragStart = false;
      return;
    }

    if (e.key === 'Control') {
      this.refreshSmartGuidesForActiveTransform(true);
    }

    // Don't handle keys when focus is on input/textarea
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;

    // Check if canvas is visible (canvas mode)
    const canvasContainer = this.canvas.parentElement;
    if (canvasContainer && canvasContainer.classList.contains('hidden')) return;

    const isModifier = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    // Ctrl+Alt+N (⌥⌘N) starts a new blank label. Ctrl+N alone is reserved by
    // the browser (new window) and can't be captured, so we require Alt.
    if (isModifier && e.altKey && key === 'n') {
      e.preventDefault();
      if (this.callbacks.onNewTemplate) {
        this.callbacks.onNewTemplate();
      }
      return;
    }

    if (isModifier && key === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        if (this.callbacks.onRedo) {
          this.callbacks.onRedo();
        }
      } else if (this.callbacks.onUndo) {
        this.callbacks.onUndo();
      }
      return;
    }

    if (isModifier && key === 'y') {
      e.preventDefault();
      if (this.callbacks.onRedo) {
        this.callbacks.onRedo();
      }
      return;
    }

    if (isModifier && key === 'a') {
      e.preventDefault();
      if (this.callbacks.onSelectAll) this.callbacks.onSelectAll();
      return;
    }

    if (isModifier && key === 'c') {
      // Allow native copy when text is selected on the page
      const copySelection = window.getSelection();
      if (copySelection && copySelection.toString().length > 0) return;

      const selection = this.getActiveSelection();
      if (selection.length > 0 && this.callbacks.serializeElement) {
        this.clipboardData = selection.map(el => this.callbacks.serializeElement(el)).filter(Boolean);
      }
      e.preventDefault();
      return;
    }

    if (isModifier && key === 'v') {
      // Allow native paste when text is selected on the page
      const pasteSelection = window.getSelection();
      if (pasteSelection && pasteSelection.toString().length > 0) return;

      if (this.clipboardData && this.callbacks.pasteElement) {
        this.callbacks.pasteElement(this.clipboardData);
      }
      e.preventDefault();
      return;
    }

    if (isModifier && key === 'd') {
      e.preventDefault();
      const selection = this.getActiveSelection();
      if (selection.length > 0 && this.callbacks.serializeElement && this.callbacks.pasteElement) {
        const data = selection.map(el => this.callbacks.serializeElement(el)).filter(Boolean);
        if (data.length > 0) {
          this.callbacks.pasteElement(data);
        }
      }
      return;
    }


    // Handle Tab key for element navigation
    if (e.key === 'Tab') {
      e.preventDefault();

      if (this.elements.length === 0) return;

      const currentElement = this.callbacks.getSelectedElement();

      if (!currentElement) {
        // No element selected - select first element
        this.callbacks.onElementSelected(this.elements[0]);
        return;
      }

      // Find current element index
      const currentIndex = this.elements.findIndex(
        el => String(el.id) === String(currentElement.id)
      );

      if (currentIndex === -1) {
        // Current element not found - select first
        this.callbacks.onElementSelected(this.elements[0]);
        return;
      }

      // Calculate next/previous index with wrapping
      let nextIndex;
      if (e.shiftKey) {
        // Shift+Tab: previous element
        nextIndex = currentIndex === 0 ? this.elements.length - 1 : currentIndex - 1;
      } else {
        // Tab: next element
        nextIndex = currentIndex === this.elements.length - 1 ? 0 : currentIndex + 1;
      }

      this.callbacks.onElementSelected(this.elements[nextIndex]);
      return;
    }

    // Arrow-move and Delete operate on the whole selection (locked excluded).
    const selection = this.getActiveSelection();
    if (selection.length === 0) return;

    // Handle Delete separately (not affected by orientation).
    if (e.key === 'Delete') {
      const deletable = selection.filter(el => !el.locked);
      if (deletable.length === 0) return;
      if (deletable.length > 1 && this.callbacks.onElementsDeleted) {
        this.callbacks.onElementsDeleted(deletable);
      } else if (this.callbacks.onElementDeleted) {
        this.callbacks.onElementDeleted(deletable[0]);
      }
      return;
    }

    const movable = selection.filter(el => !el.locked);
    if (movable.length === 0) return;

    const moveAmount = e.shiftKey ? 10 : 1;

    // Reverse arrow directions under inverted/mirror so visual movement matches.
    const isInverted = this.labelSettings.printOrientation === 'I';
    const isMirrored = this.labelSettings.printMirror === 'Y';
    let effectiveKey = e.key;
    if (isInverted) {
      switch (e.key) {
        case 'ArrowLeft': effectiveKey = 'ArrowRight'; break;
        case 'ArrowRight': effectiveKey = 'ArrowLeft'; break;
        case 'ArrowUp': effectiveKey = 'ArrowDown'; break;
        case 'ArrowDown': effectiveKey = 'ArrowUp'; break;
      }
    }
    if (isMirrored) {
      switch (effectiveKey) {
        case 'ArrowLeft': effectiveKey = 'ArrowRight'; break;
        case 'ArrowRight': effectiveKey = 'ArrowLeft'; break;
      }
    }

    let dx = 0, dy = 0;
    switch (effectiveKey) {
      case 'ArrowLeft': dx = -moveAmount; break;
      case 'ArrowRight': dx = moveAmount; break;
      case 'ArrowUp': dy = -moveAmount; break;
      case 'ArrowDown': dy = moveAmount; break;
      default: return;
    }

    // Clamp the delta so the selection's union bounds stay inside the label.
    const labelW = this.labelSettings.width * this.labelSettings.dpmm;
    const labelH = this.labelSettings.height * this.labelSettings.dpmm;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const el of movable) {
      const b = this.getDragConstraintBounds(el);
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width);
      maxY = Math.max(maxY, b.y + b.height);
    }
    if (minX + dx < 0) dx = -minX;
    if (maxX + dx > labelW) dx = labelW - maxX;
    if (minY + dy < 0) dy = -minY;
    if (maxY + dy > labelH) dy = labelH - maxY;

    if (dx === 0 && dy === 0) {
      e.preventDefault();
      return;
    }

    movable.forEach(el => { el.x += dx; el.y += dy; });
    e.preventDefault();
    this.startKeyboardMove(movable);
    if (movable.length > 1 && this.callbacks.onElementsMoved) {
      this.callbacks.onElementsMoved(movable);
    } else {
      this.callbacks.onElementMoved(movable[0]);
    }
  }

  /**
   * Current selection as an array (back-compat with the single-selection getter).
   */
  getActiveSelection() {
    if (this.callbacks.getSelectedElements) {
      return this.callbacks.getSelectedElements();
    }
    const single = this.callbacks.getSelectedElement && this.callbacks.getSelectedElement();
    return single ? [single] : [];
  }

  handleKeyUp(e) {
    if (e.key === 'Control') {
      this.refreshSmartGuidesForActiveTransform(false);
    }

    if (!this.keyboardMoveActive) return;
    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      this.endKeyboardMove();
    }
  }

  startKeyboardMove(target) {
    const targets = Array.isArray(target) ? target : [target];
    if (!this.keyboardMoveActive) {
      this.keyboardMoveActive = true;
      this.keyboardMoveTargets = targets;
      if (targets.length > 1) {
        if (this.callbacks.onGroupMoveStart) this.callbacks.onGroupMoveStart(targets);
      } else if (this.callbacks.onKeyboardMoveStart) {
        this.callbacks.onKeyboardMoveStart(targets[0]);
      }
    }

    if (this.keyboardMoveTimer) {
      clearTimeout(this.keyboardMoveTimer);
    }
    this.keyboardMoveTimer = setTimeout(() => {
      this.endKeyboardMove();
    }, 250);
  }

  endKeyboardMove() {
    if (!this.keyboardMoveActive) return;
    if (this.keyboardMoveTimer) {
      clearTimeout(this.keyboardMoveTimer);
      this.keyboardMoveTimer = null;
    }
    const targets = this.keyboardMoveTargets || [];
    this.keyboardMoveActive = false;
    this.keyboardMoveTargets = null;
    if (targets.length > 1) {
      if (this.callbacks.onGroupMoveEnd) this.callbacks.onGroupMoveEnd(targets);
    } else if (targets.length === 1 && this.callbacks.onKeyboardMoveEnd) {
      this.callbacks.onKeyboardMoveEnd(targets[0]);
    }
  }

  /**
   * Get element at position (returns topmost element)
   */
  getElementAtPosition(x, y) {
    // Iterate in reverse order (top to bottom in z-order)
    for (let i = this.elements.length - 1; i >= 0; i--) {
      const element = this.elements[i];
      const bounds = this.getSelectionBounds(element);

      if (
        x >= bounds.x &&
        x <= bounds.x + bounds.width &&
        y >= bounds.y &&
        y <= bounds.y + bounds.height
      ) {
        return element;
      }
    }

    return null;
  }

  /**
   * Get all elements at position (topmost first)
   */
  getElementsAtPosition(x, y) {
    const hits = [];
    for (let i = this.elements.length - 1; i >= 0; i--) {
      const element = this.elements[i];
      const bounds = this.getSelectionBounds(element);
      if (
        x >= bounds.x &&
        x <= bounds.x + bounds.width &&
        y >= bounds.y &&
        y <= bounds.y + bounds.height
      ) {
        hits.push(element);
      }
    }
    return hits;
  }

  /**
   * Get resize handle at position
   */
  getSelectionBounds(element) {
    if (element.type === 'TEXT' && this.labelSettings && this.renderer) {
      return this.renderer.measureTextBounds(element, this.labelSettings);
    }
    if (element.type === 'TEXTBLOCK') {
      const blockW = element.blockWidth || 200;
      const blockH = element.blockHeight || 50;
      if (element.orientation === 'R' || element.orientation === 'B') {
        return { x: element.x, y: element.y, width: blockH, height: blockW };
      }
      return { x: element.x, y: element.y, width: blockW, height: blockH };
    }
    if (element.type === 'FIELDBLOCK' && this.labelSettings) {
      const maxLines = element.maxLines || 1;
      const lineSpacing = element.lineSpacing || 0;
      // Line spacing is only between lines, not after the last line
      const baseLineHeight = this.getFieldBlockLineHeight(element);
      const totalHeight = baseLineHeight * maxLines + lineSpacing * Math.max(0, maxLines - 1);
      const blockW = element.blockWidth || 200;
      if (element.orientation === 'R' || element.orientation === 'B') {
        return { x: element.x, y: element.y, width: totalHeight, height: blockW };
      }
      return { x: element.x, y: element.y, width: blockW, height: totalHeight };
    }
    return element.getBounds();
  }

  /**
   * Bounds used for drag and keyboard-move constraints.
   * For TEXT elements, uses actual canvas measurement to match the drawn selection box exactly.
   */
  getDragConstraintBounds(element) {
    if (element.type === 'TEXT' && this.labelSettings && this.renderer) {
      return this.renderer.measureTextBounds(element, this.labelSettings);
    }
    return this.getSelectionBounds(element);
  }

  getHandleAtPosition(x, y, element) {
    if (!element) return null;

    // We need the scale to calculate handle size in dots
    // The handle is drawn as 6px square in screen coordinates
    // So in dot coordinates it is 6 / scale
    const scale = this.renderer.scale || 1;
    const handleSizeDots = 20 / scale; // Use larger hit area (20px) for better usability
    const hsHalf = handleSizeDots / 2;

    // Use accurate measured bounds for TEXT so the handle hit area matches the drawn selection box
    const bounds = (element.type === 'TEXT' && this.labelSettings && this.renderer)
      ? this.renderer.measureTextBounds(element, this.labelSettings)
      : this.getSelectionBounds(element);
    const bx = bounds.x;
    const by = bounds.y;
    const bw = bounds.width;
    const bh = bounds.height;

    // GRAPHIC supports resize handles only when editable (has a source image
    // we can re-rasterize). Parsed/opaque graphics show no handles.
    if (element.type === 'GRAPHIC' && (!element.isEditable || !element.isEditable())) {
      return null;
    }

    // For BOX, LINE, BARCODE, CIRCLE, DIAGONALLINE, and editable GRAPHIC elements, check all 8 handles
    if (element.type === 'BOX' || element.type === 'LINE' || element.type === 'BARCODE' || element.type === 'CIRCLE' || element.type === 'DIAGONALLINE' || element.type === 'GRAPHIC') {
      // Corner handles (check these first as they have priority)
      // Top-left
      if (x >= bx - hsHalf && x <= bx + hsHalf && y >= by - hsHalf && y <= by + hsHalf) {
        return 'tl';
      }
      // Top-right
      if (x >= bx + bw - hsHalf && x <= bx + bw + hsHalf && y >= by - hsHalf && y <= by + hsHalf) {
        return 'tr';
      }
      // Bottom-left
      if (x >= bx - hsHalf && x <= bx + hsHalf && y >= by + bh - hsHalf && y <= by + bh + hsHalf) {
        return 'bl';
      }
      // Bottom-right
      if (x >= bx + bw - hsHalf && x <= bx + bw + hsHalf && y >= by + bh - hsHalf && y <= by + bh + hsHalf) {
        return 'br';
      }

      // Edge handles
      // Top
      if (x >= bx + bw / 2 - hsHalf && x <= bx + bw / 2 + hsHalf && y >= by - hsHalf && y <= by + hsHalf) {
        return 't';
      }
      // Right
      if (x >= bx + bw - hsHalf && x <= bx + bw + hsHalf && y >= by + bh / 2 - hsHalf && y <= by + bh / 2 + hsHalf) {
        return 'r';
      }
      // Bottom
      if (x >= bx + bw / 2 - hsHalf && x <= bx + bw / 2 + hsHalf && y >= by + bh - hsHalf && y <= by + bh + hsHalf) {
        return 'b';
      }
      // Left
      if (x >= bx - hsHalf && x <= bx + hsHalf && y >= by + bh / 2 - hsHalf && y <= by + bh / 2 + hsHalf) {
        return 'l';
      }
    } else if (element.type === 'FIELDBLOCK' || element.type === 'TEXTBLOCK' || element.type === 'QRCODE' || element.type === 'TEXT') {
      // For FIELDBLOCK, TEXTBLOCK, QRCODE, and TEXT, only check bottom-right handle
      if (x >= bx + bw - hsHalf && x <= bx + bw + hsHalf && y >= by + bh - hsHalf && y <= by + bh + hsHalf) {
        return 'br';
      }
    }

    return null;
  }

  /**
   * Get cursor style for a given resize handle
   */
  getCursorForHandle(handle) {
    const isMirrored = this.labelSettings.printMirror === 'Y';
    const cursorMap = {
      'tl': isMirrored ? 'nesw-resize' : 'nwse-resize',
      'tr': isMirrored ? 'nwse-resize' : 'nesw-resize',
      'bl': isMirrored ? 'nwse-resize' : 'nesw-resize',
      'br': isMirrored ? 'nesw-resize' : 'nwse-resize',
      't': 'ns-resize',
      'r': 'ew-resize',
      'b': 'ns-resize',
      'l': 'ew-resize'
    };
    return cursorMap[handle] || 'default';
  }

  /**
   * Update elements reference (when elements array changes)
   */
  updateElements(elements) {
    this.elements = elements;
  }

  /**
   * Cleanup event listeners
   */
  destroy() {
    this.canvas.removeEventListener('mousedown', this.handleMouseDown);
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('mouseup', this.handleMouseUp);
    this.canvas.removeEventListener('mouseleave', this.handleMouseLeave);
    document.removeEventListener('keydown', this.handleKeyDown);
    document.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('mousemove', this._boundMarqueeMove);
    window.removeEventListener('mouseup', this._boundMarqueeUp);
    if (this.keyboardMoveTimer) {
      clearTimeout(this.keyboardMoveTimer);
      this.keyboardMoveTimer = null;
    }
  }
}
