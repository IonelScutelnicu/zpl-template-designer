// Canvas Renderer for ZPL Template Creator
// Renders all element types on HTML5 Canvas

class CanvasRenderer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.showGrid = false; // Hide grid to match API preview look
  }

  /**
   * Render all elements on canvas
   * @param {Array} elements - Array of ZPLElement objects
   * @param {Object} labelSettings - Label configuration
   */
  renderCanvas(elements, labelSettings, selectedElement = null) {
    const { width, height, dpmm } = labelSettings;

    // Calculate label dimensions in dots
    const labelWidthDots = width * dpmm;
    const labelHeightDots = height * dpmm;

    // Calculate scale to fit canvas container while maintaining aspect ratio
    const containerWidth = this.canvas.parentElement.clientWidth - 48; // Account for padding
    const containerHeight = this.canvas.parentElement.clientHeight - 48;

    this.scale = Math.min(
      containerWidth / labelWidthDots,
      containerHeight / labelHeightDots,
      2 // Max scale to prevent labels from being too large
    );

    // Set canvas actual size (scaled)
    const scaledWidth = labelWidthDots * this.scale;
    const scaledHeight = labelHeightDots * this.scale;

    this.canvas.width = scaledWidth;
    this.canvas.height = scaledHeight;

    // Calculate offsets to center canvas
    this.offsetX = 0;
    this.offsetY = 0;

    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw white label background
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.fillRect(0, 0, scaledWidth, scaledHeight);

    // Draw grid if enabled
    if (this.showGrid) {
      this.drawGrid(labelWidthDots, labelHeightDots, dpmm);
    }

    // Draw label border
    this.ctx.strokeStyle = '#94a3b8';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(0, 0, scaledWidth, scaledHeight);

    // Render each element
    elements.forEach(element => {
      this.drawElement(element, selectedElement);
    });
  }

  /**
   * Draw grid overlay
   */
  drawGrid(labelWidthDots, labelHeightDots, dpmm) {
    const gridSpacing = 5 * dpmm; // 5mm grid spacing
    const majorGridSpacing = 10 * dpmm; // 10mm major grid lines

    this.ctx.save();

    // Minor grid lines (5mm)
    this.ctx.strokeStyle = '#e2e8f0';
    this.ctx.lineWidth = 0.5;

    // Vertical lines
    for (let x = gridSpacing; x < labelWidthDots; x += gridSpacing) {
      const scaledX = x * this.scale;
      this.ctx.beginPath();
      this.ctx.moveTo(scaledX, 0);
      this.ctx.lineTo(scaledX, labelHeightDots * this.scale);
      this.ctx.stroke();
    }

    // Horizontal lines
    for (let y = gridSpacing; y < labelHeightDots; y += gridSpacing) {
      const scaledY = y * this.scale;
      this.ctx.beginPath();
      this.ctx.moveTo(0, scaledY);
      this.ctx.lineTo(labelWidthDots * this.scale, scaledY);
      this.ctx.stroke();
    }

    // Major grid lines (10mm)
    this.ctx.strokeStyle = '#cbd5e1';
    this.ctx.lineWidth = 1;

    // Vertical major lines
    for (let x = majorGridSpacing; x < labelWidthDots; x += majorGridSpacing) {
      const scaledX = x * this.scale;
      this.ctx.beginPath();
      this.ctx.moveTo(scaledX, 0);
      this.ctx.lineTo(scaledX, labelHeightDots * this.scale);
      this.ctx.stroke();
    }

    // Horizontal major lines
    for (let y = majorGridSpacing; y < labelHeightDots; y += majorGridSpacing) {
      const scaledY = y * this.scale;
      this.ctx.beginPath();
      this.ctx.moveTo(0, scaledY);
      this.ctx.lineTo(labelWidthDots * this.scale, scaledY);
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  /**
   * Draw a single element on canvas
   */
  drawElement(element, selectedElement) {
    const isSelected = selectedElement && element.id === selectedElement.id;

    this.ctx.save();

    // Draw element based on type
    switch (element.type) {
      case 'TEXT':
        this.drawText(element);
        break;
      case 'TEXTBLOCK':
        this.drawTextBlock(element);
        break;
      case 'BARCODE':
        this.drawBarcode(element);
        break;
      case 'QRCODE':
        this.drawQRCode(element);
        break;
      case 'BOX':
        this.drawBox(element);
        break;
    }

    // Draw selection indicator
    if (isSelected) {
      this.drawSelectionIndicator(element);
    }

    this.ctx.restore();
  }

  /**
   * Draw TEXT element
   */
  drawText(element) {
    const x = element.x * this.scale;
    const y = element.y * this.scale;
    const fontSize = element.fontSize * this.scale;

    this.ctx.fillStyle = '#000000';
    this.ctx.font = `bold ${fontSize}px Arial, sans-serif`;
    this.ctx.textBaseline = 'top';

    const text = element.previewText || '';
    this.ctx.fillText(text, x, y);
  }

  /**
   * Draw TEXTBLOCK element
   */
  drawTextBlock(element) {
    const x = element.x * this.scale;
    const y = element.y * this.scale;
    const fontSize = element.fontSize * this.scale;
    const blockWidth = element.blockWidth * this.scale;

    this.ctx.fillStyle = '#000000';
    this.ctx.font = `bold ${fontSize}px Arial, sans-serif`;
    this.ctx.textBaseline = 'top';

    const text = element.previewText || '';

    // Simple text wrapping
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    words.forEach(word => {
      const testLine = currentLine + (currentLine ? ' ' : '') + word;
      const metrics = this.ctx.measureText(testLine);

      if (metrics.width > blockWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    });

    if (currentLine) {
      lines.push(currentLine);
    }

    // Draw lines (respect maxLines)
    const maxLines = element.maxLines || lines.length;
    const lineHeight = fontSize * 1.2;

    lines.slice(0, maxLines).forEach((line, i) => {
      let lineX = x;

      // Apply justification
      if (element.justification === 'C') {
        const metrics = this.ctx.measureText(line);
        lineX = x + (blockWidth - metrics.width) / 2;
      } else if (element.justification === 'R') {
        const metrics = this.ctx.measureText(line);
        lineX = x + blockWidth - metrics.width;
      }

      this.ctx.fillText(line, lineX, y + (i * lineHeight));
    });
  }

  /**
   * Draw BARCODE element (placeholder)
   */
  drawBarcode(element) {
    const x = element.x * this.scale;
    const y = element.y * this.scale;
    const height = element.height * this.scale;

    // Estimate barcode width based on data length
    const estimatedWidth = Math.max(element.previewData.length * 10, 100) * this.scale;

    // Draw simplified barcode bars (no background)
    this.ctx.fillStyle = '#000000';
    const barWidth = 2 * this.scale;
    const barSpacing = 2 * this.scale;

    for (let i = 0; i < estimatedWidth; i += barWidth + barSpacing) {
      // Draw bars at full height for cleaner look
      this.ctx.fillRect(x + i, y, barWidth, height);
    }

    // Draw barcode number below the barcode
    this.ctx.fillStyle = '#000000';
    this.ctx.font = `${12 * this.scale}px Arial, sans-serif`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'top';
    this.ctx.fillText(element.previewData || '', x + estimatedWidth / 2, y + height + (2 * this.scale));
  }

  /**
   * Draw QRCODE element (placeholder)
   */
  drawQRCode(element) {
    const x = element.x * this.scale;
    const y = element.y * this.scale;

    // QR code size based on magnification (approximate)
    const size = element.magnification * 20 * this.scale;

    // Draw white background first (no border)
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.fillRect(x, y, size, size);

    // Draw simplified QR pattern
    this.ctx.fillStyle = '#000000';
    const moduleSize = size / 20;

    // Draw random QR-like pattern
    for (let row = 0; row < 20; row++) {
      for (let col = 0; col < 20; col++) {
        if (Math.random() > 0.5) {
          this.ctx.fillRect(
            x + col * moduleSize,
            y + row * moduleSize,
            moduleSize,
            moduleSize
          );
        }
      }
    }

    // Draw positioning markers (corners)
    this.drawQRPositioningMarker(x, y, moduleSize * 3);
    this.drawQRPositioningMarker(x + size - moduleSize * 3, y, moduleSize * 3);
    this.drawQRPositioningMarker(x, y + size - moduleSize * 3, moduleSize * 3);
  }

  /**
   * Draw QR code positioning marker (corner squares)
   */
  drawQRPositioningMarker(x, y, size) {
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(x, y, size, size);

    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.fillRect(x + size * 0.2, y + size * 0.2, size * 0.6, size * 0.6);

    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(x + size * 0.35, y + size * 0.35, size * 0.3, size * 0.3);
  }

  /**
   * Draw BOX element
   */
  drawBox(element) {
    const x = element.x * this.scale;
    const y = element.y * this.scale;
    const width = element.width * this.scale;
    const height = element.height * this.scale;
    const thickness = element.thickness * this.scale;
    const rounding = element.rounding * this.scale;

    this.ctx.lineWidth = thickness;
    this.ctx.strokeStyle = element.color === 'B' ? '#000000' : '#FFFFFF';
    this.ctx.fillStyle = element.color === 'B' ? '#000000' : '#FFFFFF';

    if (thickness >= width || thickness >= height) {
      // Filled box
      if (rounding > 0) {
        this.roundRect(x, y, width, height, rounding, true, false);
      } else {
        this.ctx.fillRect(x, y, width, height);
      }
    } else {
      // Outlined box
      if (rounding > 0) {
        this.roundRect(x, y, width, height, rounding, false, true);
      } else {
        this.ctx.strokeRect(x, y, width, height);
      }
    }
  }

  /**
   * Draw rounded rectangle
   */
  roundRect(x, y, width, height, radius, fill, stroke) {
    this.ctx.beginPath();
    this.ctx.moveTo(x + radius, y);
    this.ctx.lineTo(x + width - radius, y);
    this.ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    this.ctx.lineTo(x + width, y + height - radius);
    this.ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    this.ctx.lineTo(x + radius, y + height);
    this.ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    this.ctx.lineTo(x, y + radius);
    this.ctx.quadraticCurveTo(x, y, x + radius, y);
    this.ctx.closePath();

    if (fill) {
      this.ctx.fill();
    }
    if (stroke) {
      this.ctx.stroke();
    }
  }

  /**
   * Draw selection indicator around element
   */
  drawSelectionIndicator(element) {
    const bounds = element.getBounds();
    const x = bounds.x * this.scale;
    const y = bounds.y * this.scale;
    const width = bounds.width * this.scale;
    const height = bounds.height * this.scale;

    // Blue outline
    this.ctx.strokeStyle = '#3B82F6';
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([]);
    this.ctx.strokeRect(x - 2, y - 2, width + 4, height + 4);

    // Draw resize handles
    const handleSize = 6;
    this.ctx.fillStyle = '#3B82F6';

    // For BOX elements, show all 8 handles (4 corners + 4 edges)
    if (element.type === 'BOX') {
      // Corner handles
      this.ctx.fillRect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize); // Top-left
      this.ctx.fillRect(x + width - handleSize / 2, y - handleSize / 2, handleSize, handleSize); // Top-right
      this.ctx.fillRect(x - handleSize / 2, y + height - handleSize / 2, handleSize, handleSize); // Bottom-left
      this.ctx.fillRect(x + width - handleSize / 2, y + height - handleSize / 2, handleSize, handleSize); // Bottom-right

      // Edge handles
      this.ctx.fillRect(x + width / 2 - handleSize / 2, y - handleSize / 2, handleSize, handleSize); // Top
      this.ctx.fillRect(x + width - handleSize / 2, y + height / 2 - handleSize / 2, handleSize, handleSize); // Right
      this.ctx.fillRect(x + width / 2 - handleSize / 2, y + height - handleSize / 2, handleSize, handleSize); // Bottom
      this.ctx.fillRect(x - handleSize / 2, y + height / 2 - handleSize / 2, handleSize, handleSize); // Left
    } else if (element.type === 'TEXTBLOCK') {
      // For TEXTBLOCK, only show bottom-right handle
      this.ctx.fillRect(x + width - handleSize / 2, y + height - handleSize / 2, handleSize, handleSize);
    } else {
      // For other elements, show 4 corner handles
      this.ctx.fillRect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize); // Top-left
      this.ctx.fillRect(x + width - handleSize / 2, y - handleSize / 2, handleSize, handleSize); // Top-right
      this.ctx.fillRect(x - handleSize / 2, y + height - handleSize / 2, handleSize, handleSize); // Bottom-left
      this.ctx.fillRect(x + width - handleSize / 2, y + height - handleSize / 2, handleSize, handleSize); // Bottom-right
    }
  }

  /**
   * Convert mouse coordinates to label coordinates (in dots)
   */
  mouseToLabelCoords(mouseX, mouseY) {
    const rect = this.canvas.getBoundingClientRect();
    const canvasX = mouseX - rect.left;
    const canvasY = mouseY - rect.top;

    return {
      x: canvasX / this.scale,
      y: canvasY / this.scale
    };
  }

  /**
   * Toggle grid visibility
   */
  toggleGrid() {
    this.showGrid = !this.showGrid;
  }
}
