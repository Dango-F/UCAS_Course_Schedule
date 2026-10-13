;(function () {
  // Runs only in the bundled indicator WebView, never in the school document.
  // Both the HTML script and the native bootstrap may run, in either order.
  if (window.__lakesideReadingBackdrop && window.__lakesideReadingBackdrop.version === 3) return;
  if (window.__lakesideReadingBackdrop) window.__lakesideReadingBackdrop.clear();
  var oldShield = document.getElementById('__lakeside_reading_transition_shield__');
  if (oldShield) oldShield.remove();
  var generation = 0, activeToken = '', pendingAck = null, pendingBitmap = null, state = '', wantsAck = true;
  function acknowledge(token, value) {
    if (token !== activeToken) return;
    state = value;
    if (!wantsAck) return;
    pendingAck = { token: token, value: value };
    try {
      if (!window.plus || !window.plus.storage) return;
      window.plus.storage.setItem('__lakeside_backdrop_ready__:' + token, value);
      pendingAck = null;
    } catch (_) { /* A delayed/unavailable bridge does not invalidate the image. */ }
  }
  document.addEventListener('plusready', function () {
    if (pendingBitmap) setBitmap.apply(null, pendingBitmap);
    if (pendingAck) acknowledge(pendingAck.token, pendingAck.value);
  });
  function clear() {
    generation++; activeToken = ''; pendingAck = null; pendingBitmap = null; state = ''; wantsAck = false;
    var root = document.getElementById('__lakeside_reading_backdrop__');
    if (root) root.remove();
  }
  function silence(token) {
    if (token === activeToken) { wantsAck = false; pendingAck = null; }
    if (pendingBitmap && pendingBitmap[1] === token) pendingBitmap[4] = false;
  }
  function normalizeImageData(data) {
    if (typeof data !== 'string') return '';
    var match = /^data:image\/(?:png|jpe?g|jepg|null);base64,([\s\S]+)$/.exec(data);
    if (!match) return '';
    // HTML5+ draw() on some Android bases returns real PNG/JPEG bytes with
    // image/null as its MIME type. Detect the encoded signature, not the
    // unreliable MIME label; this must not be treated as an empty Bitmap.
    var bytes = match[1];
    if (bytes.indexOf('iVBORw0KGgo') === 0) return 'data:image/png;base64,' + bytes;
    if (bytes.indexOf('/9j/') === 0) return 'data:image/jpeg;base64,' + bytes;
    return '';
  }
  function setBitmap(id, token, radius, tint, confirm) {
    if (token === activeToken) { set('', token, radius, tint, confirm); return; }
    pendingBitmap = [id, token, radius, tint, confirm];
    if (!document.body || !window.plus || !window.plus.nativeObj) return;
    try {
      // Conversion runs in this HTML5+ renderer, not the uni-app service.
      // The manager retains the named Bitmap until reading ends, so a local
      // overlay reload can restore the same pixels without another capture.
      var bitmap = window.plus.nativeObj.Bitmap.getBitmapById(id);
      var data = normalizeImageData(bitmap && bitmap.toBase64Data());
      if (!data) return;
      set(data, token, radius, tint, confirm);
    } catch (_) { /* native bridge readiness is retried by the manager */ }
  }
  function set(data, token, radius, tint, confirm) {
    if (!document.body) return; // The native caller retries after document load.
    if (token === activeToken) {
      if (confirm === false) silence(token);
      if (state) acknowledge(token, state);
      return; // Do not clear/decode an already visible (or loading) image again.
    }
    clear(); activeToken = token; wantsAck = confirm !== false;
    var current = generation;
    data = normalizeImageData(data);
    if (!data) { acknowledge(token, 'error'); return; }
    var picture = new Image();
    picture.onload = function () {
      if (current !== generation) { picture.src = ''; return; }
      var root = document.createElement('div');
      root.id = '__lakeside_reading_backdrop__'; root.setAttribute('aria-hidden', 'true');
      root.style.cssText = 'position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none;background:#fff';
      // Opaque coverage belongs to the captured website, not a white veil.
      picture.style.cssText = 'position:absolute;left:-4px;top:-4px;width:calc(100% + 8px);height:calc(100% + 8px);object-fit:fill;filter:blur(' + radius + 'px)';
      var veil = document.createElement('div');
      veil.style.cssText = 'position:absolute;inset:0;background:rgba(225,237,246,' + tint + ')';
      root.appendChild(picture); root.appendChild(veil); document.body.appendChild(root);
      // Acknowledge only after decode and a rendered frame, not after evalJS.
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        if (current === generation && root.isConnected && picture.naturalWidth > 0) acknowledge(token, 'ready');
      }); });
    };
    picture.onerror = function () { if (current === generation) acknowledge(token, 'error'); };
    picture.src = data;
  }
  window.__lakesideReadingBackdrop = { version: 3, set: set, setBitmap: setBitmap, clear: clear, silence: silence };
})();
