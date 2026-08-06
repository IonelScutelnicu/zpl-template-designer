// ZPL Template Designer embed SDK.
// Wraps iframe/new-tab embedding of the editor and its postMessage protocol
// (v1). Dependency-free; include via:
//   <script src="https://ionelscutelnicu.github.io/zpl-template-designer/embed/zpl-designer-embed.js"></script>
// Docs: https://github.com/IonelScutelnicu/zpl-template-designer/blob/main/docs/EMBEDDING.md
(function () {
  'use strict';

  var PROTOCOL_VERSION = 1;
  var SOURCE_EDITOR = 'zpl-designer';
  var SOURCE_HOST = 'zpl-designer-host';
  var DEFAULT_URL = 'https://ionelscutelnicu.github.io/zpl-template-designer/';

  // opts.hidePanels / opts.hideElements are maps of key -> hidden, so a host
  // can keep every key it cares about listed and flip one to false.
  // hidePanels keys: zplOutput, warnings, header, actions, fullscreenToggle
  // (the last hides both the enter and the exit button, pinning the layout
  // the host launched with).
  function hiddenKeys(map) {
    var out = [];
    for (var key in map) {
      if (map[key]) out.push(key);
    }
    return out;
  }

  // Launch state travels in the URL: which panels (?hidePanels=a,b) and which
  // Add-palette element types (?hideElements=a,b) are gone, plus the layout
  // (?fullscreen=). The editor applies all of it pre-paint (see the inline
  // script in index.html), so nothing is visible switching in.
  function buildEmbedUrl(opts) {
    var u = new URL(opts.url || DEFAULT_URL, window.location.href);
    u.searchParams.set('embed', '1');
    var panels = hiddenKeys(opts.hidePanels);
    if (panels.length) u.searchParams.set('hidePanels', panels.join(','));
    var elements = hiddenKeys(opts.hideElements);
    if (elements.length) u.searchParams.set('hideElements', elements.join(','));
    if (opts.fullscreen !== undefined) u.searchParams.set('fullscreen', opts.fullscreen ? '1' : '0');
    return u;
  }

  // Shared wiring for both iframe and new-tab modes. getWindow() resolves the
  // editor window lazily (an iframe's contentWindow changes on reload).
  // getEditorOrigin() returns 'null' when the editor frame is sandboxed
  // without allow-same-origin (opaque origin); event.source is the primary
  // sender check — a WindowProxy identity cannot be forged.
  function connect(opts, getEditorOrigin, getWindow) {
    var initPayload = {};
    if (opts.template !== undefined) initPayload.template = opts.template;
    if (opts.zpl !== undefined) initPayload.zpl = opts.zpl;
    if (opts.previewData !== undefined) initPayload.previewData = opts.previewData;
    // Fonts stay on the payload across later loads: `ready` re-fires on reload,
    // and the editor's registry is gone by then.
    if (opts.fonts !== undefined) initPayload.fonts = opts.fonts;

    function postToEditor(type, payload) {
      var win = getWindow();
      // '*' is the only targetOrigin that reaches an opaque-origin window;
      // the reference to that window is ours, so delivery stays scoped.
      var target = getEditorOrigin() === 'null' ? '*' : getEditorOrigin();
      if (win) win.postMessage({ source: SOURCE_HOST, version: PROTOCOL_VERSION, type: type, payload: payload }, target);
    }

    function onMessage(event) {
      if (event.source !== getWindow() || event.origin !== getEditorOrigin()) return;
      var msg = event.data;
      if (!msg || msg.source !== SOURCE_EDITOR || msg.version !== PROTOCOL_VERSION) return;
      switch (msg.type) {
        case 'ready':
          // Fires on first load and again on reload — re-init each time.
          postToEditor('init', initPayload);
          if (opts.onReady) opts.onReady(msg.payload);
          break;
        case 'save':
          if (opts.onSave) opts.onSave(msg.payload);
          break;
        case 'cancel':
          if (opts.onCancel) opts.onCancel();
          break;
        case 'change':
          if (opts.onChange) opts.onChange(msg.payload);
          break;
        case 'error':
          if (opts.onError) opts.onError(msg.payload);
          break;
      }
    }

    window.addEventListener('message', onMessage);

    return {
      loadTemplate: function (template, previewData) {
        initPayload = { template: template, fonts: initPayload.fonts };
        if (previewData !== undefined) initPayload.previewData = previewData;
        postToEditor('loadTemplate', initPayload);
      },
      loadZPL: function (zpl, previewData) {
        initPayload = { zpl: zpl, fonts: initPayload.fonts };
        if (previewData !== undefined) initPayload.previewData = previewData;
        postToEditor('loadZPL', initPayload);
      },
      // Preview fonts for the printer-resident fonts a template names: a
      // template declaring E:NOTO.TTF renders in the NOTO.TTF sent here,
      // with no user action. `data` is an ArrayBuffer, a typed array, or
      // base64 text. Merged with fonts already supplied.
      setFonts: function (fonts) {
        initPayload.fonts = (initPayload.fonts || []).concat(fonts);
        postToEditor('setFonts', { fonts: fonts });
      },
      // Define placeholders and/or set their sample values without reloading.
      // Merged into whatever the editor already has, so a partial map is fine.
      setPreviewData: function (previewData) {
        initPayload.previewData = Object.assign({}, initPayload.previewData, previewData);
        postToEditor('setPreviewData', { previewData: previewData });
      },
      save: function () {
        postToEditor('requestSave', {});
      },
      disconnect: function () {
        window.removeEventListener('message', onMessage);
      },
    };
  }

  window.ZplDesigner = {
    /**
     * Embed the editor as an iframe.
     * ZplDesigner.embed({ container, url?, template?, zpl?, fonts?, sandbox?,
     *                     hidePanels?, hideElements?, fullscreen?, onReady?,
     *                     onSave?, onCancel?, onChange?, onError? })
     * Returns { iframe, loadTemplate(t), loadZPL(z), setPreviewData(m),
     *            setFonts(f), save(), destroy() }.
     */
    embed: function (opts) {
      var container = typeof opts.container === 'string'
        ? document.querySelector(opts.container)
        : opts.container;
      if (!container) throw new Error('ZplDesigner.embed: container not found');

      var url = buildEmbedUrl(opts);
      var iframe = document.createElement('iframe');
      if (opts.sandbox !== undefined) iframe.setAttribute('sandbox', opts.sandbox);
      iframe.src = url.href;
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.border = '0';
      // Without this the iframe sits on a text baseline, and the descender
      // gap under it makes a full-height container overflow by a few px —
      // giving the host page a scrollbar it never asked for.
      iframe.style.display = 'block';
      iframe.allow = 'clipboard-write';
      container.appendChild(iframe);

      // Sandboxing without allow-same-origin gives the editor an opaque
      // origin; its messages then arrive with origin 'null'. Evaluated per
      // message so a sandbox set on handle.iframe after creation also works.
      var editorOrigin = function () {
        var sb = iframe.getAttribute('sandbox');
        return sb !== null && sb.indexOf('allow-same-origin') === -1 ? 'null' : url.origin;
      };
      var conn = connect(opts, editorOrigin, function () { return iframe.contentWindow; });
      return {
        iframe: iframe,
        loadTemplate: conn.loadTemplate,
        loadZPL: conn.loadZPL,
        setPreviewData: conn.setPreviewData,
        setFonts: conn.setFonts,
        save: conn.save,
        destroy: function () {
          conn.disconnect();
          iframe.remove();
        },
      };
    },

    /**
     * Open the editor in a new tab. Same options as embed() minus container.
     * Returns { window, loadTemplate(t), loadZPL(z), setPreviewData(m),
     * setFonts(f), save(), close() } or null
     * when the popup was blocked.
     */
    open: function (opts) {
      opts = opts || {};
      // A popup carries no host chrome, so the editor's own action bar is the
      // only way a user can send anything back — never let it be hidden here.
      if (opts.hidePanels && opts.hidePanels.actions) {
        opts = Object.assign({}, opts, {
          hidePanels: Object.assign({}, opts.hidePanels, { actions: false }),
        });
      }
      var url = buildEmbedUrl(opts);
      var win = window.open(url.href);
      if (!win) return null;

      var conn = connect(opts, function () { return url.origin; }, function () { return win; });
      return {
        window: win,
        loadTemplate: conn.loadTemplate,
        loadZPL: conn.loadZPL,
        setPreviewData: conn.setPreviewData,
        setFonts: conn.setFonts,
        save: conn.save,
        close: function () {
          conn.disconnect();
          try { win.close(); } catch (_) { }
        },
      };
    },
  };
})();
