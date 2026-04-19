/* StreetStore — Pixel Injector (Facebook, TikTok, Google Analytics) */
(function() {
  var API = window.SS_API_URL || window.STREETSTORE_BACKEND || 'https://streetstore.ma';

  function injectScript(code) {
    var stripped = code.replace(/<\/?script[^>]*>/gi, '').trim();
    if (!stripped) return;
    var s = document.createElement('script');
    s.textContent = stripped;
    document.head.appendChild(s);
  }

  fetch(API + '/api/settings/pixels', { cache: 'no-store' })
    .then(function(r) { return r.ok ? r.json() : {}; })
    .then(function(px) {
      if (px.fbActive && px.facebook) injectScript(px.facebook);
      if (px.ttActive && px.tiktok)   injectScript(px.tiktok);
      if (px.gaActive && px.google)   injectScript(px.google);
    })
    .catch(function(){});
})();
