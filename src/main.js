// Main entry point for ZPL Template Creator
// Defers to the router, which lazy-initializes the editor or gallery
// view based on the URL.

import { initRouter } from './router.js';

// Dark-theme toggle. The .dark class is applied pre-paint by an inline
// script in index.html (no FOUC); here we just wire the header button and
// keep the icon + localStorage in sync.
function initThemeToggle() {
  const btn = document.getElementById('theme-toggle-btn');
  if (!btn) return;
  const icon = btn.querySelector('.material-icons-round');
  const syncIcon = () => {
    const dark = document.documentElement.classList.contains('dark');
    if (icon) icon.textContent = dark ? 'light_mode' : 'dark_mode';
    btn.setAttribute('data-tooltip', dark ? 'Switch to light mode' : 'Switch to dark mode');
  };
  syncIcon();
  btn.addEventListener('click', () => {
    const dark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', dark ? 'dark' : 'light');
    syncIcon();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle();
  initRouter();
});
