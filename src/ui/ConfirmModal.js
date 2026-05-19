// ConfirmModal
// Reusable in-app confirmation dialog — replaces window.confirm() for
// destructive actions. The buttons live inside <form method="dialog">,
// so the UA closes the dialog and writes the submitter's value into
// returnValue. show() resolves to true on OK, false otherwise.

export class ConfirmModal {
  constructor() {
    this._dialog  = document.getElementById('confirm-modal');
    this._message = document.getElementById('confirm-message');
    // Light-dismiss: clicks on the ::backdrop area target the dialog itself.
    this._dialog.addEventListener('click', (e) => {
      if (e.target === this._dialog) this._dialog.close();
    });
  }

  /**
   * Display the modal with a custom message.
   * @param {string} message - Prompt shown to the user.
   * @returns {Promise<boolean>} Resolves true if the user confirmed.
   */
  show(message) {
    this._message.textContent = message;
    this._dialog.returnValue = '';
    this._dialog.showModal();
    return new Promise((resolve) => {
      this._dialog.addEventListener('close', () => {
        resolve(this._dialog.returnValue === 'ok');
      }, { once: true });
    });
  }
}
