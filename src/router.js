// Lightweight SPA router that swaps between the editor and gallery views
// while keeping the shared header fixed. Each view lazy-initializes on
// first entry and listens for `view:enter` / `view:leave` events to
// rehydrate or tear down view-specific state.

const VIEWS = {
  editor: {
    title: 'ZPL Template Creator',
    containerId: 'view-editor',
  },
  gallery: {
    title: 'Zebra ZPL Editor · Template Gallery',
    containerId: 'view-gallery',
  },
};

const initialized = { editor: false, gallery: false };
const scrollByView = new Map();
let currentView = 'editor';

function readViewFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const v = params.get('view');
  return v === 'gallery' ? 'gallery' : 'editor';
}

function buildUrl(view, extraParams) {
  const params = new URLSearchParams(window.location.search);
  if (view === 'gallery') {
    params.set('view', 'gallery');
  } else {
    params.delete('view');
  }
  if (extraParams) {
    Object.keys(extraParams).forEach((k) => {
      const v = extraParams[k];
      if (v === null || v === undefined || v === '') {
        params.delete(k);
      } else {
        params.set(k, v);
      }
    });
  }
  const qs = params.toString();
  return window.location.pathname + (qs ? '?' + qs : '') + window.location.hash;
}

function updateHeaderToggle(view) {
  const tabs = document.querySelectorAll('#view-toggle [data-view]');
  tabs.forEach((tab) => {
    const isActive = tab.dataset.view === view;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });

  const tourBtn = document.getElementById('tour-btn');
  if (tourBtn) {
    const disabled = view === 'gallery';
    tourBtn.disabled = disabled;
    tourBtn.classList.toggle('opacity-40', disabled);
    tourBtn.classList.toggle('cursor-not-allowed', disabled);
    tourBtn.classList.toggle('pointer-events-none', disabled);
  }
}

async function ensureInitialized(view) {
  if (initialized[view]) return;
  initialized[view] = true;
  if (view === 'editor') {
    const mod = await import('./app.js');
    mod.initApp();
    document.fonts.load('bold 1px "Roboto Condensed"').then(() => {
      try { mod.renderCanvasPreview(); } catch (_) {}
    }).catch(() => {});
  } else {
    const mod = await import('./gallery.js');
    mod.initGallery();
  }
}

async function showView(view) {
  const previous = currentView;
  if (previous === view && initialized[view]) {
    return;
  }

  const prevContainer = document.getElementById(VIEWS[previous].containerId);
  const nextContainer = document.getElementById(VIEWS[view].containerId);

  if (prevContainer && previous !== view) {
    scrollByView.set(previous, window.scrollY);
    prevContainer.dispatchEvent(new CustomEvent('view:leave', { detail: { view: previous } }));
    prevContainer.hidden = true;
  }

  if (nextContainer) nextContainer.hidden = false;

  currentView = view;
  document.title = VIEWS[view].title;
  updateHeaderToggle(view);

  await ensureInitialized(view);

  document.documentElement.dataset.viewReady = view;

  if (nextContainer) {
    nextContainer.dispatchEvent(new CustomEvent('view:enter', { detail: { view, previous } }));
  }

  const savedScroll = scrollByView.get(view);
  window.scrollTo(0, typeof savedScroll === 'number' ? savedScroll : 0);
}

export function getCurrentView() {
  return currentView;
}

export function navigate(view, extraParams) {
  if (view !== 'editor' && view !== 'gallery') return;
  const url = buildUrl(view, extraParams);
  window.history.pushState({ view }, '', url);
  showView(view);
}

function onPopState() {
  const view = readViewFromUrl();
  showView(view);
}

function wireHeaderToggle() {
  const tabs = document.querySelectorAll('#view-toggle [data-view]');
  tabs.forEach((tab) => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const target = tab.dataset.view === 'gallery' ? 'gallery' : 'editor';
      navigate(target);
    });
  });
}

export function initRouter() {
  const initialView = readViewFromUrl();
  currentView = initialView;

  // Hide the non-default view immediately so first paint is clean.
  Object.keys(VIEWS).forEach((v) => {
    const c = document.getElementById(VIEWS[v].containerId);
    if (c) c.hidden = v !== initialView;
  });

  document.title = VIEWS[initialView].title;
  updateHeaderToggle(initialView);
  wireHeaderToggle();
  window.addEventListener('popstate', onPopState);

  // Initialize the active view and emit the initial view:enter.
  ensureInitialized(initialView).then(() => {
    document.documentElement.dataset.viewReady = initialView;
    const c = document.getElementById(VIEWS[initialView].containerId);
    if (c) {
      c.dispatchEvent(new CustomEvent('view:enter', { detail: { view: initialView, previous: null } }));
    }
  });
}
