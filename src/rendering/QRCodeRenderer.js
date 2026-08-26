// QR Code Renderer
// Renders 2D QRCODE elements (QR, Data Matrix, PDF417) using real bwip-js geometry.

import { getBarcodeGeometry, matrixModuleDots, resolveSymbology, SYMBOLOGY_LABELS } from '../utils/barcodeGeometry.js';
import { createCanvasHelpers, getQRCodeSymbology } from '../barcodes/QRCodeSymbologies.js';
import { TextRenderer } from './TextRenderer.js';

/**
 * Renderer for QRCODE elements
 */
export class QRCodeRenderer {
  constructor() {
    this.textRenderer = new TextRenderer();
  }

  /**
   * Render a QRCODE element on canvas
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {HTMLCanvasElement} canvas - Main canvas (for reverse overlay)
   * @param {Object} element - QRCODE element
   * @param {Object} labelSettings - Label settings (supplies dpmm for fixed-size MaxiCode)
   * @param {Object} transform - Transform parameters {scale, homeX, homeY, labelTop}
   */
  render(ctx, canvas, element, labelSettings, transform) {
    const symbology = resolveSymbology(element);
    if (symbology === 'CODE49') {
      // Labelary ignores ^B4 parameters and renders its ^FD as unrotated default-font text.
      this.textRenderer.render(ctx, canvas, {
        ...element,
        orientation: 'N',
        fontId: '',
        fontSize: 0,
        fontWidth: 0,
        printDirection: 'H',
        charGap: 0,
      }, labelSettings, transform);
      return;
    }

    const dpmm = labelSettings?.dpmm || 8;
    const helpers = createCanvasHelpers({ matrixModuleDots, resolveSymbology, labels: SYMBOLOGY_LABELS, dpmm });
    const frame = helpers.frame(element, transform);
    const geom = getBarcodeGeometry(element, labelSettings?.previewData);
    getQRCodeSymbology(symbology).renderCanvas(ctx, canvas, element, geom, frame, helpers);
  }
}
