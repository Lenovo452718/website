/* StreetStore — Page View Tracker (silent) */
(function() {
  var API = window.SS_API_URL || window.STREETSTORE_BACKEND || 'https://streetstore.ma';

  /* Generate or retrieve persistent visitor ID */
  function getVid() {
    var k = 'ss_vid';
    var v = localStorage.getItem(k);
    if (!v) {
      v = 'v' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      try { localStorage.setItem(k, v); } catch(e){}
    }
    return v;
  }

  /* Determine canonical page name */
  function getPage() {
    var p = location.pathname.replace(/\/$/, '') || '/';
    /* strip .html for cleaner names */
    return p.replace(/\.html$/, '') || '/';
  }

  /* Fire and forget — never blocks the page */
  function track() {
    try {
      var body = JSON.stringify({ page: getPage(), vid: getVid() });
      if (navigator.sendBeacon) {
        var blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon(API + '/api/track', blob);
      } else {
        fetch(API + '/api/track', { method:'POST', headers:{'Content-Type':'application/json'}, body:body, keepalive:true })
          .catch(function(){});
      }
    } catch(e){}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', track);
  } else {
    track();
  }
})();
