;(function () {
  // Installed before page scripts where supported, with HTML5+ fallback.
  // It only blocks SEP's
  // cross-origin logout probe and keeps known UCAS links in this WebView.
  // Course data is read later by the typed extraction script.
  try {
    var SEP_ORIGIN = 'https://sep.ucas.ac.cn';
    var COURSE_ORIGIN = 'https://xkgo.ucas.ac.cn:3000';
    var ALTERNATE_COURSE_ORIGIN = 'https://xkgodj.ucas.ac.cn';
    if (String(location.origin || '').toLowerCase() !== SEP_ORIGIN) return;
    if (window.__lakesidePortalPreloadV2) return;
    window.__lakesidePortalPreloadV2 = true;
    console.info('[UCAS import v2] portal guard active');

    function asUrl(raw) {
      var text = String(raw || '').trim();
      if (!text) return null;
      try {
        // Preserve the actual school URL and browser-relative resolution.
        // Rewriting xkgo links to xkcts could bypass an authentication step.
        return new URL(text, location.href);
      } catch (_) { return null; }
    }
    function isCourseTarget(url) {
      if (!url || url.protocol !== 'https:') return false;
      var origin = url.origin.toLowerCase();
      var path = url.pathname + url.search + url.hash;
      if (origin === SEP_ORIGIN) return /^\/portal\/site\//i.test(url.pathname);
      if (origin === COURSE_ORIGIN || origin === ALTERNATE_COURSE_ORIGIN) return /^\/(?:courseManage(?:[/?#]|$)|course\/personSchedule(?:[/?#]|$))/i.test(path);
      if (origin === 'https://xkcts.ucas.ac.cn:8443' || origin === 'https://jwxk.ucas.ac.cn') return /^\/(?:login|main|redirect|course\/coursetime\/\d+)(?:[/?#]|$)/i.test(path);
      return false;
    }
    function isLogout(raw) {
      try {
        var url = asUrl(raw);
        return Boolean(/^\/portal\/site\//i.test(location.pathname) && url && (url.origin.toLowerCase() === COURSE_ORIGIN || url.origin.toLowerCase() === ALTERNATE_COURSE_ORIGIN) && /^\/user\/logout\/?$/i.test(url.pathname));
      } catch (_) { return false; }
    }
    function emptyResponse() {
      try {
        var ResponseCtor = window.Response || (typeof Response !== 'undefined' ? Response : null);
        if (ResponseCtor) return new ResponseCtor('', { status: 204 });
      } catch (_) {}
      return { ok: true, status: 204, text: function () { return Promise.resolve(''); } };
    }
    function installLogoutGuard() {
      try {
        var Xhr = window.XMLHttpRequest;
        var proto = Xhr && Xhr.prototype;
        if (proto && !proto.__lakesideLogoutGuard) {
          var open = proto.open;
          var send = proto.send;
          proto.open = function (method, url) {
            this.__lakesideLogoutBlocked = isLogout(url);
            if (this.__lakesideLogoutBlocked) return open.call(this, method, '/__lakeside_logout_blocked__');
            return open.apply(this, arguments);
          };
          proto.send = function () {
            if (this.__lakesideLogoutBlocked) { console.info('[UCAS import v2] blocked portal logout probe'); try { this.abort(); } catch (_) {} return; }
            return send.apply(this, arguments);
          };
          proto.__lakesideLogoutGuard = true;
        }
      } catch (_) {}
      try {
        var fetchApi = window.fetch;
        if (typeof fetchApi === 'function' && !fetchApi.__lakesideLogoutGuard) {
          var guardedFetch = function (input) {
            var raw = input && input.url ? input.url : input;
            return isLogout(raw) ? Promise.resolve(emptyResponse()) : fetchApi.apply(this, arguments);
          };
          guardedFetch.__lakesideLogoutGuard = true;
          window.fetch = guardedFetch;
        }
      } catch (_) {}
      try {
        var navigatorApi = window.navigator;
        var beacon = navigatorApi && navigatorApi.sendBeacon;
        if (typeof beacon === 'function' && !beacon.__lakesideLogoutGuard) {
          var guardedBeacon = function (url) { return isLogout(url) ? true : beacon.apply(this, arguments); };
          guardedBeacon.__lakesideLogoutGuard = true;
          navigatorApi.sendBeacon = guardedBeacon;
        }
      } catch (_) {}
    }
    function installOpenGuard() {
      try {
        var nativeOpen = window.open;
        if (typeof nativeOpen !== 'function' || nativeOpen.__lakesideSepOpenGuard) return;
        var guardedOpen = function (raw) {
          var target = asUrl(raw);
          if (isCourseTarget(target)) {
            try { location.href = target.href; } catch (_) {}
            return null;
          }
          return nativeOpen.apply(window, arguments);
        };
        guardedOpen.__lakesideSepOpenGuard = true;
        window.open = guardedOpen;
      } catch (_) {}
    }
    function normalizeLinks() {
      try {
        var nodes = document.querySelectorAll('a[href], [data-href], [data-url]');
        for (var i = 0; i < nodes.length; i++) {
          var raw = nodes[i].getAttribute('href') || nodes[i].getAttribute('data-href') || nodes[i].getAttribute('data-url') || '';
          if (isCourseTarget(asUrl(raw)) && nodes[i].getAttribute('target')) nodes[i].setAttribute('target', '_self');
        }
      } catch (_) {}
    }
    installLogoutGuard();
    installOpenGuard();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', normalizeLinks, false);
    else normalizeLinks();
    try {
      if (typeof MutationObserver === 'function') new MutationObserver(function () { installLogoutGuard(); installOpenGuard(); normalizeLinks(); }).observe(document.documentElement || document, { childList: true, subtree: true });
    } catch (_) {}
  } catch (_) {}
})();
