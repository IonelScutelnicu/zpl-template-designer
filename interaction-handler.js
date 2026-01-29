// Interaction Handler for Canvas
// Handles mouse clicks, drag-to-move, and keyboard events

class InteractionHandler {
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

    this.setupEventListeners();
  }

  setupEventListeners() {
    this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
    this.canvas.addEventListener('mouseleave', this.handleMouseLeave.bind(this));

    // Keyboard events (needs to be on document for arrow keys)
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
  }

  handleMouseDown(e) {
    const coords = this.renderer.mouseToLabelCoords(e.clientX, e.clientY);
    this.mouseDownTime = Date.now();
    this.mouseDownX = coords.x;
    this.mouseDownY = coords.y;

    // Check for resize handle click first (if element is selected)
    const selectedElement = this.callbacks.getSelectedElement();
    if (selectedElement && (selectedElement.type === 'TEXTBLOCK' || selectedElement.type === 'BOX')) {
      const handle = this.getHandleAtPosition(coords.x, coords.y, selectedElement);
      if (handle) {
        this.isResizing = true;
        this.resizeHandle = handle;
        this.dragElement = selectedElement; // Use same drag element ref

        // Store original position and size for resize calculations
        this.resizeStartX = selectedElement.x;
        this.resizeStartY = selectedElement.y;
        this.resizeStartWidth = selectedElement.type === 'BOX' ? selectedElement.width : selectedElement.blockWidth;
        this.resizeStartHeight = selectedElement.type === 'BOX' ? selectedElement.height : (selectedElement.fontSize || 30) * (selectedElement.maxLines || 1);
        this.resizeMouseStartX = coords.x;
        this.resizeMouseStartY = coords.y;

        // Set cursor based on handle
        this.canvas.style.cursor = this.getCursorForHandle(handle);
        return; // Skip drag/select logic
      }
    }

    // Find element at position
    const element = this.getElementAtPosition(coords.x, coords.y);

    if (element) {
      this.dragElement = element;
      this.dragOffsetX = coords.x - element.x;
      this.dragOffsetY = coords.y - element.y;
      this.dragStartX = element.x;
      this.dragStartY = element.y;

      // Update cursor
      this.canvas.style.cursor = 'grab';

      // Select immediately on mouse down (for drag or click)
      this.callbacks.onElementSelected(element);
    } else {
      // Clicked on empty canvas - deselect
      this.callbacks.onElementSelected(null);
    }
  }

  handleMouseMove(e) {
    const coords = this.renderer.mouseToLabelCoords(e.clientX, e.clientY);

    // Handle Resize
    if (this.isResizing && this.dragElement) {
      if (this.dragElement.type === 'TEXTBLOCK') {
        // TEXTBLOCK only supports bottom-right resize
        const newWidth = Math.max(50, coords.x - this.dragElement.x);
        const newHeight = Math.max(30, coords.y - this.dragElement.y);

        this.dragElement.blockWidth = Math.round(newWidth);
        const lineHeight = (this.dragElement.fontSize || 30);
        this.dragElement.maxLines = Math.max(1, Math.round((newHeight - 10) / lineHeight));

        this.callbacks.onElementDragging(this.dragElement);
      } else if (this.dragElement.type === 'BOX') {
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

        // Enforce minimum size
        const minSize = 10;
        if (newWidth < minSize) {
          newWidth = minSize;
          // Adjust position if resizing from left
          if (this.resizeHandle.includes('l') || this.resizeHandle === 'l') {
            newX = this.resizeStartX + this.resizeStartWidth - minSize;
          }
        }
        if (newHeight < minSize) {
          newHeight = minSize;
          // Adjust position if resizing from top
          if (this.resizeHandle.includes('t') || this.resizeHandle === 't') {
            newY = this.resizeStartY + this.resizeStartHeight - minSize;
          }
        }

        // Update element
        this.dragElement.x = Math.round(newX);
        this.dragElement.y = Math.round(newY);
        this.dragElement.width = Math.round(newWidth);
        this.dragElement.height = Math.round(newHeight);

        this.callbacks.onElementDragging(this.dragElement);
      }
      return;
    }

    if (this.dragElement) {
      // Calculate distance moved
      const dx = Math.abs(coords.x - this.mouseDownX);
      const dy = Math.abs(coords.y - this.mouseDownY);
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Start dragging if moved more than 5 dots
      if (!this.isDragging && distance > 5) {
        this.isDragging = true;
        this.canvas.style.cursor = 'grabbing';
      }

      if (this.isDragging) {
        // Update element position
        let newX = coords.x - this.dragOffsetX;
        let newY = coords.y - this.dragOffsetY;

        // Constrain to label bounds
        const bounds = this.dragElement.getBounds();
        const maxX = this.labelSettings.width * this.labelSettings.dpmm - bounds.width;
        const maxY = this.labelSettings.height * this.labelSettings.dpmm - bounds.height;

        newX = Math.max(0, Math.min(newX, maxX));
        newY = Math.max(0, Math.min(newY, maxY));

        // Round to nearest dot
        this.dragElement.x = Math.round(newX);
        this.dragElement.y = Math.round(newY);

        // Trigger callbacks
        this.callbacks.onElementDragging(this.dragElement);
      }
    } else {
      // Update cursor based on hover
      const selectedElement = this.callbacks.getSelectedElement();
      if (selectedElement && (selectedElement.type === 'TEXTBLOCK' || selectedElement.type === 'BOX')) {
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

    if (clickDuration < 200 && distance < 5) {
      // This was a click, not a drag
      // Selection already handled in mousedown
    }

    if (this.isResizing) {
      this.isResizing = false;
      this.resizeHandle = null;
      this.callbacks.onElementDragEnd(this.dragElement); // Reuse drag end callback for resize end
    }

    if (this.isDragging) {
      // Finalize drag
      this.callbacks.onElementDragEnd(this.dragElement);
      this.isDragging = false;
    }

    // Reset drag state
    this.dragElement = null;
    this.canvas.style.cursor = 'default';
  }

  handleMouseLeave(e) {
    if (this.isDragging || this.isResizing) {
      // Finalize drag if mouse leaves canvas
      this.callbacks.onElementDragEnd(this.dragElement);
      this.isDragging = false;
      this.isResizing = false;
    }

    this.dragElement = null;
    this.canvas.style.cursor = 'default';
  }

  handleKeyDown(e) {
    // Don't handle keys when focus is on input/textarea
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;

    // Check if canvas is visible (canvas mode)
    const canvasContainer = this.canvas.parentElement;
    if (canvasContainer && canvasContainer.classList.contains('hidden')) return;

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

    // Only handle arrow keys if an element is selected
    if (!this.callbacks.getSelectedElement()) return;

    const selectedElement = this.callbacks.getSelectedElement();
    if (!selectedElement) return;

    let moved = false;
    const moveAmount = e.shiftKey ? 10 : 1;

    // Check if orientation is inverted - if so, reverse arrow key directions
    // so visual movement matches user expectations
    const isInverted = this.labelSettings.printOrientation === 'I';

    // Determine effective direction based on orientation
    let effectiveKey = e.key;
    if (isInverted) {
      switch (e.key) {
        case 'ArrowLeft': effectiveKey = 'ArrowRight'; break;
        case 'ArrowRight': effectiveKey = 'ArrowLeft'; break;
        case 'ArrowUp': effectiveKey = 'ArrowDown'; break;
        case 'ArrowDown': effectiveKey = 'ArrowUp'; break;
      }
    }

    switch (effectiveKey) {
      case 'ArrowLeft':
        selectedElement.x = Math.max(0, selectedElement.x - moveAmount);
        moved = true;
        break;
      case 'ArrowRight':
        const maxX = this.labelSettings.width * this.labelSettings.dpmm - selectedElement.getBounds().width;
        selectedElement.x = Math.min(maxX, selectedElement.x + moveAmount);
        moved = true;
        break;
      case 'ArrowUp':
        selectedElement.y = Math.max(0, selectedElement.y - moveAmount);
        moved = true;
        break;
      case 'ArrowDown':
        const maxY = this.labelSettings.height * this.labelSettings.dpmm - selectedElement.getBounds().height;
        selectedElement.y = Math.min(maxY, selectedElement.y + moveAmount);
        moved = true;
        break;
    }

    // Handle Delete key separately (not affected by orientation)
    if (e.key === 'Delete') {
      if (this.callbacks.onElementDeleted) {
        this.callbacks.onElementDeleted(selectedElement);
      }
    }

    if (moved) {
      e.preventDefault();
      this.callbacks.onElementMoved(selectedElement);
    }
  }

  /**
   * Get element at position (returns topmost element)
   */
  getElementAtPosition(x, y) {
    // Iterate in reverse order (top to bottom in z-order)
    for (let i = this.elements.length - 1; i >= 0; i--) {
      const element = this.elements[i];
      const bounds = element.getBounds();

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
   * Get resize handle at position
   */
  getHandleAtPosition(x, y, element) {
    if (!element) return null;

    // We need the scale to calculate handle size in dots
    // The handle is drawn as 6px square in screen coordinates
    // So in dot coordinates it is 6 / scale
    const scale = this.renderer.scale;
    const handleSizeDots = 10 / scale; // Use slightly larger hit area (10px)
    const hsHalf = handleSizeDots / 2;

    const bounds = element.getBounds();
    const bx = bounds.x;
    const by = bounds.y;
    const bw = bounds.width;
    const bh = bounds.height;

    // For BOX elements, check all 8 handles
    if (element.type === 'BOX') {
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
    } else if (element.type === 'TEXTBLOCK') {
      // For TEXTBLOCK, only check bottom-right handle
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
    const cursorMap = {
      'tl': 'nwse-resize',  // Top-left
      'tr': 'nesw-resize',  // Top-right
      'bl': 'nesw-resize',  // Bottom-left
      'br': 'nwse-resize',  // Bottom-right
      't': 'ns-resize',     // Top
      'r': 'ew-resize',     // Right
      'b': 'ns-resize',     // Bottom
      'l': 'ew-resize'      // Left
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
  }
}
