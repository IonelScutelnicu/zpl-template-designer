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
    if (this.isDragging) {
      // Finalize drag if mouse leaves canvas
      this.callbacks.onElementDragEnd(this.dragElement);
      this.isDragging = false;
    }

    this.dragElement = null;
    this.canvas.style.cursor = 'default';
  }

  handleKeyDown(e) {
    // Only handle arrow keys if an element is selected and focus is not on an input
    if (!this.callbacks.getSelectedElement()) return;
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;

    const selectedElement = this.callbacks.getSelectedElement();
    if (!selectedElement) return;

    let moved = false;
    const moveAmount = e.shiftKey ? 10 : 1;

    switch (e.key) {
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
      case 'Delete':
        if (this.callbacks.onElementDeleted) {
          this.callbacks.onElementDeleted(selectedElement);
        }
        break;
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
