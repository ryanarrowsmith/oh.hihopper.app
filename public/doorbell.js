/* Doorbell — the whole tracker.
 *
 * No cookie, no localStorage identifier, no fingerprint, nothing that follows
 * anyone off this page. It sends the path, the referrer and the window width.
 * Everything else the report shows — who, roughly where, on what — is derived
 * server-side from headers the browser was sending anyway, and the address is
 * hashed with a salt that is deleted two days later.
 *
 * Install: copy into the app's public/ and add to the root layout
 *
 *   <script defer src="/doorbell.js"></script>
 *
 * Fire an event from anywhere:  doorbell('beta.signup', { plan: 'reader' })
 * Stop counting yourself:       visit any page with #doorbell-ignore
 */
(function () {
  var el = document.currentScript;
  var endpoint = (el && el.getAttribute('data-endpoint')) || '/api/doorbell';

  // Set or clear the personal opt-out before anything else decides to send.
  try {
    if (location.hash === '#doorbell-ignore') localStorage.setItem('doorbell-ignore', '1');
    if (location.hash === '#doorbell-count')  localStorage.removeItem('doorbell-ignore');
    if (localStorage.getItem('doorbell-ignore') === '1') return;
  } catch (e) { /* private window, storage blocked — carry on and count */ }

  // Global Privacy Control is a legally recognized "do not sell or share" in
  // several states. Doorbell shares nothing with anyone, so honoring it costs
  // only a little accuracy — and a product whose best sentence is "nobody sees
  // it but you" does not get to ignore the signal on a technicality.
  if (navigator.globalPrivacyControl) return;

  // Never count a dev server or a preview deploy.
  var h = location.hostname;
  if (!h || h === 'localhost' || h === '127.0.0.1' || /\.local$/.test(h) ||
      /\.vercel\.app$/.test(h) || location.protocol === 'file:') return;

  function send(payload) {
    var body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon &&
          navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }))) return;
    } catch (e) { /* fall through */ }
    try {
      fetch(endpoint, {
        method: 'POST', body: body, keepalive: true,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (e) { /* a page view is never worth an error in the console */ }
  }

  var last = null;
  function view() {
    var p = location.pathname + location.search;
    if (p === last) return;          // a replaced state is not a second view
    last = p;
    send({ p: p, r: document.referrer || null, w: window.innerWidth || null });
  }

  window.doorbell = function (name, props) {
    if (!name) return;
    send({ p: location.pathname, e: String(name).slice(0, 60), d: props || null });
  };

  view();

  // The App Router changes the URL without a page load, so a route change has
  // to be watched for rather than waited on.
  ['pushState', 'replaceState'].forEach(function (m) {
    var orig = history[m];
    history[m] = function () { var r = orig.apply(this, arguments); setTimeout(view, 0); return r; };
  });
  addEventListener('popstate', view);
})();
