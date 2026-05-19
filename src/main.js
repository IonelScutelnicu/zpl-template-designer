// Main entry point for ZPL Template Creator
// Defers to the router, which lazy-initializes the editor or gallery
// view based on the URL.

import { initRouter } from './router.js';

document.addEventListener('DOMContentLoaded', () => {
  initRouter();
});
