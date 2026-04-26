// Main entry point for ZPL Template Creator
// This module initializes the application when the DOM is ready

import { initApp, renderCanvasPreview } from './app.js';

// Wait for DOM to be ready before initializing
document.addEventListener('DOMContentLoaded', () => {
  initApp();

  document.fonts
    .load('bold 1px "Roboto Condensed"')
    .then(() => renderCanvasPreview())
    .catch(() => {});
});
