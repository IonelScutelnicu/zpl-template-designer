// ConfirmModal
// Reusable in-app confirmation dialog — replaces window.confirm() for
// destructive actions. Wire it up once; call show() wherever needed.

export class ConfirmModal {
  constructor() {
    this._modal    = document.getElementById('confirm-modal');
    this._backdrop = document.getElementById('confirm-backdrop');
    this._message  = document.getElementById('confirm-message');
    this._cancelBtn = document.getElementById('confirm-cancel-btn');
    this._okBtn    = document.getElementById('confirm-ok-btn');
    this._callback = null;

    this._backdrop.addEventListener('click', () => this._hide());
    this._cancelBtn.addEventListener('click', () => this._hide());
    this._okBtn.addEventListener('click', () => {
      const cb = this._callback;
      this._hide();
      if (cb) cb();
    });
  }

  /**
   * Display the modal with a custom message.
   * @param {string}   message   - Prompt shown to the user.
   * @param {Function} onConfirm - Called only when the user clicks Replace.
   */
  show(message, onConfirm) {
    this._message.textContent = message;
    this._callback = onConfirm;
    this._modal.classList.remove('hidden');
  }

  _hide() {
    this._modal.classList.add('hidden');
    this._callback = null;
  }
}
