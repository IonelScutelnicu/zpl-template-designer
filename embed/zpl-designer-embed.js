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

  function buildEmbedUrl(url) {
    var u = new URL(url || DEFAULT_URL, window.location.href);
    u.searchParams.set('embed', '1');
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
      loadTemplate: function (template) {
        initPayload = { template: template };
        postToEditor('loadTemplate', { template: template });
      },
      loadZPL: function (zpl) {
        initPayload = { zpl: zpl };
        postToEditor('loadZPL', { zpl: zpl });
      },
      disconnect: function () {
        window.removeEventListener('message', onMessage);
      },
    };
  }

  window.ZplDesigner = {
    /**
     * Embed the editor as an iframe.
     * ZplDesigner.embed({ container, url?, template?, zpl?, sandbox?,
     *                     onReady?, onSave?, onCancel?, onChange?, onError? })
     * Returns { iframe, loadTemplate(t), loadZPL(z), destroy() }.
     */
    embed: function (opts) {
      var container = typeof opts.container === 'string'
        ? document.querySelector(opts.container)
        : opts.container;
      if (!container) throw new Error('ZplDesigner.embed: container not found');

      var url = buildEmbedUrl(opts.url);
      var iframe = document.createElement('iframe');
      if (opts.sandbox !== undefined) iframe.setAttribute('sandbox', opts.sandbox);
      iframe.src = url.href;
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.border = '0';
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
        destroy: function () {
          conn.disconnect();
          iframe.remove();
        },
      };
    },

    /**
     * Open the editor in a new tab. Same options as embed() minus container.
     * Returns { window, loadTemplate(t), loadZPL(z), close() } or null when
     * the popup was blocked.
     */
    open: function (opts) {
      opts = opts || {};
      var url = buildEmbedUrl(opts.url);
      var win = window.open(url.href);
      if (!win) return null;

      var conn = connect(opts, function () { return url.origin; }, function () { return win; });
      return {
        window: win,
        loadTemplate: conn.loadTemplate,
        loadZPL: conn.loadZPL,
        close: function () {
          conn.disconnect();
          try { win.close(); } catch (_) { }
        },
      };
    },
  };
})();
