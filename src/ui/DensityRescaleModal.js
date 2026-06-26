// DensityRescaleModal
// Three-option dialog shown when the user manually changes Print Density
// with content on the label. Resolves to one of: 'scale' | 'keep' | 'cancel'.
// Light-dismiss (click backdrop) and Escape both resolve to 'cancel'.

export class DensityRescaleModal {
  constructor() {
    this._dialog = document.getElementById('density-rescale-modal');
    this._message = document.getElementById('density-rescale-message');
    this._notes = document.getElementById('density-rescale-notes');
    this._dialog.addEventListener('click', (e) => {
      if (e.target === this._dialog) this._dialog.close('cancel');
    });
  }

  /**
   * @param {{oldDpmm: number, newDpmm: number, unscalableGraphicCount: number, clampedBarcodeCount: number}} info
   * @returns {Promise<'scale'|'keep'|'cancel'>}
   */
  show({ oldDpmm, newDpmm, unscalableGraphicCount, clampedBarcodeCount }) {
    this._message.textContent =
      `Changing print density from ${oldDpmm} to ${newDpmm} dpmm. ` +
      `Scale all elements proportionally so they stay the same physical size?`;

    const notes = [];
    if (unscalableGraphicCount > 0) {
      const noun = unscalableGraphicCount === 1 ? 'graphic element' : 'graphic elements';
      notes.push(
        `${unscalableGraphicCount} ${noun} can't be resized — they'll keep their current dot dimensions and appear smaller or larger.`
      );
    }
    if (clampedBarcodeCount > 0) {
      const noun = clampedBarcodeCount === 1 ? 'barcode' : 'barcodes';
      notes.push(
        `${clampedBarcodeCount} ${noun} will hit a module-size limit and won't reach full scale.`
      );
    }
    if (notes.length > 0) {
      this._notes.textContent = notes.join(' ');
      this._notes.classList.remove('hidden');
    } else {
      this._notes.textContent = '';
      this._notes.classList.add('hidden');
    }

    this._dialog.returnValue = '';
    this._dialog.showModal();
    return new Promise((resolve) => {
      this._dialog.addEventListener('close', () => {
        const v = this._dialog.returnValue;
        resolve(v === 'scale' || v === 'keep' ? v : 'cancel');
      }, { once: true });
    });
  }
}
