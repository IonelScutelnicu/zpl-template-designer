// Main entry point for ZPL Template Creator
// This module initializes the application when the DOM is ready

import { initApp } from './app.js';

// Wait for DOM to be ready before initializing
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});
