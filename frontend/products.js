/* ============================================================
   STREETSTORE — Dynamic Product Data (API-driven)
   All data comes from the API — no hardcoded products.
   ============================================================ */

var PRODUCTS = {};

/* ── Convert API product to PRODUCTS format ── */
function apiProductToLocal(p) {
  var images = p.images || [];
  var mainImg = images.find(function(i) { return i.isMain; }) || images[0];
  var gallery = images.map(function(i) { return i.url; });
  var variants = p.variants || [];
  var sizes = variants.map(function(v) { return v.size; }).filter(Boolean).join(',');
  var inStock = variants.length === 0 || variants.some(function(v) { return v.inStock; });
  var sizesInStock = variants.filter(function(v) { return v.inStock; }).map(function(v) { return v.size; });
  return {
    name: p.name,
    price: p.price,
    originalPrice: p.comparePrice || null,
    fit: p.fit || '',
    fitFilter: p.fitFilter || 'wide',
    href: p.href || ('product.html?slug=' + p.slug),
    badge: p.badge || '',
    color: p.color || '',
    sizes: sizes,
    sizesInStock: sizesInStock,
    inStock: inStock,
    image: mainImg ? mainImg.url : null,
    gallery: gallery,
    video: p.videoUrl || null,
    category: p.category || '',
    description: p.description || '',
    status: p.status || 'active',
    slug: p.slug,
    id: p.id,
    isFeatured: !!p.isFeatured
  };
}

/* ── Skeleton cards — shown while API loads ── */
function _showSkeletons(gridId, count) {
  var grid = document.getElementById(gridId);
  if (!grid) return;
  var skels = '';
  for (var i = 0; i < count; i++) {
    skels += '<div class="product-card ss-skeleton">'
      + '<div class="ss-skel-img"></div>'
      + '<div class="ss-skel-info">'
      + '<div class="ss-skel-line ss-skel-line-lg"></div>'
      + '<div class="ss-skel-line ss-skel-line-sm"></div>'
      + '<div class="ss-skel-line ss-skel-line-md"></div>'
      + '</div></div>';
  }
  grid.innerHTML = skels;
}

/* ── Inject skeleton CSS once ── */
(function() {
  var s = document.createElement('style');
  s.textContent = [
    '.ss-skeleton{pointer-events:none;cursor:default}',
    '.ss-skel-img{width:100%;aspect-ratio:3/4;background:linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%);background-size:200% 100%;animation:ssSkelShim 1.4s infinite}',
    '.ss-skel-info{padding:14px 0 8px}',
    '.ss-skel-line{height:12px;border-radius:4px;background:linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%);background-size:200% 100%;animation:ssSkelShim 1.4s infinite;margin-bottom:10px}',
    '.ss-skel-line-lg{width:70%}',
    '.ss-skel-line-sm{width:40%}',
    '.ss-skel-line-md{width:55%}',
    '@keyframes ssSkelShim{0%{background-position:200% 0}100%{background-position:-200% 0}}'
  ].join('');
  document.head.appendChild(s);
})();

/* ── Fetch all products from the API ── */
(function loadLiveProducts() {
  var API = (window.SS_API_URL || window.STREETSTORE_BACKEND || '');
  if (!API) {
    document.dispatchEvent(new CustomEvent('productsLoaded'));
    renderShopGrid();
    return;
  }
  fetch(API + '/api/products')
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(list) {
      if (!Array.isArray(list) || !list.length) {
        renderShopGrid(); renderHomeGrid(); return;
      }
      // Clear ALL products (hardcoded + stale cache) — API is single source of truth
      Object.keys(PRODUCTS).forEach(function(k) { delete PRODUCTS[k]; });
      // Load fresh from API
      list.forEach(function(p) {
        if ((p.status || 'active').toUpperCase() === 'ACTIVE') {
          PRODUCTS[p.slug] = apiProductToLocal(p);
        }
      });
      document.dispatchEvent(new CustomEvent('productsLoaded'));
      renderShopGrid();
      renderHomeGrid();
      if (typeof initProductImages === 'function') initProductImages();
      if (typeof initProductInfo === 'function') initProductInfo();
    })
    .catch(function() {
      // API failed — fall back to whatever is in PRODUCTS
      document.dispatchEvent(new CustomEvent('productsLoaded'));
      renderShopGrid();
      renderHomeGrid();
    });
})();

/* ── Shared refetch function ── */
var _lastProductHash = '';
function refetchProducts() {
  var API = (window.SS_API_URL || window.STREETSTORE_BACKEND || '');
  if (!API) return;
  fetch(API + '/api/products')
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(list) {
      if (!Array.isArray(list)) return;
      var hash = list.map(function(p) { return p.id + p.updatedAt + p.price; }).join('|');
      if (hash === _lastProductHash) return; // nothing changed
      _lastProductHash = hash;
      // Clear hardcoded-only products and replace with fresh API data
      Object.keys(PRODUCTS).forEach(function(k) { if (!PRODUCTS[k].id) delete PRODUCTS[k]; });
      list.forEach(function(p) {
        if ((p.status || 'active').toUpperCase() === 'ACTIVE') {
          PRODUCTS[p.slug] = apiProductToLocal(p);
        }
      });
      document.dispatchEvent(new CustomEvent('productsUpdated'));
      renderShopGrid();
      renderHomeGrid();
    })
    .catch(function() {});
}

/* ── Socket.io real-time sync ── */
(function initSocket() {
  var API = (window.SS_API_URL || window.STREETSTORE_BACKEND || '');
  if (!API) return;
  var script = document.createElement('script');
  script.src = API + '/socket.io/socket.io.js';
  script.onload = function() {
    try {
      var socket = io(API, { transports: ['websocket', 'polling'] });
      socket.on('product:updated', refetchProducts);
      socket.on('product:created', refetchProducts);
      socket.on('product:deleted', refetchProducts);
      socket.on('settings:changed', function(settings) {
        if (settings.primaryColor) document.documentElement.style.setProperty('--primary', settings.primaryColor);
        if (settings.accentColor) document.documentElement.style.setProperty('--accent', settings.accentColor);
        document.dispatchEvent(new CustomEvent('settingsUpdated', { detail: settings }));
      });
    } catch(e) {}
  };
  document.head.appendChild(script);
})();

/* ── Polling fallback — re-checks every 30 s if anything changed ── */
(function startPolling() {
  var API = (window.SS_API_URL || window.STREETSTORE_BACKEND || '');
  if (!API) return;
  var pollInterval = setInterval(refetchProducts, 30000);
  // Pause polling when tab is hidden, resume when visible
  document.addEventListener('visibilitychange', function() {
    if (document.hidden) { clearInterval(pollInterval); }
    else { pollInterval = setInterval(refetchProducts, 30000); }
  });
})();

/* ── Render home page featured grid ── */
function renderHomeGrid() {
  var grid = document.getElementById('homeProductGrid');
  if (!grid) return;
  var colorNames = {
    navy: '#0f1f3d', blue: '#1e3a5f', caramel: '#8b6347',
    black: '#1a1a1a', white: '#f0ede8', gray: '#888888',
    brown: '#6b4e30', red: '#8b2020', green: '#1e4a2e'
  };
  function toBg(c) { if (!c) return '#888'; var f = c.split(',')[0].trim(); return f.startsWith('#') ? f : (colorNames[f] || '#888'); }
  var badgeLabel = { sale: 'Sale', trending: 'Trending', new: 'New', bestseller: 'Best Seller' };
  var seenIds = {};
  var allKeys = Object.keys(PRODUCTS).filter(function(k) {
    var p = PRODUCTS[k]; var uid = p.id || p.slug || k;
    if (seenIds[uid]) return false; seenIds[uid] = true; return true;
  });
  // Show only featured products; fall back to first 6 if none are featured
  var featuredKeys = allKeys.filter(function(k) { return PRODUCTS[k].isFeatured; });
  var keys = (featuredKeys.length ? featuredKeys : allKeys).slice(0, 6);
  if (!keys.length) {
    grid.innerHTML = '<p style="padding:40px;text-align:center;color:#888">No products available.</p>';
    return;
  }
  grid.innerHTML = keys.map(function(id, idx) {
    var p = PRODUCTS[id];
    var bg = toBg(p.color);
    var imgHtml = p.image
      ? '<img loading="lazy" class="product-card-img-inner" src="' + p.image + '" alt="' + (p.name || '') + '">'
      : '<div class="product-card-img-inner" style="background:' + bg + '"></div>';
    var badgeHtml = p.badge ? '<span class="product-badge ' + p.badge + '">' + (badgeLabel[p.badge] || p.badge) + '</span>' : '';
    var name = (p.name || '').replace(/&/g, '&amp;');
    var compareHtml = p.originalPrice && p.originalPrice > p.price
      ? '<span class="original">' + p.originalPrice + ' MAD</span>' : '';
    var delayClass = idx === 0 ? '' : ' reveal-delay-' + Math.min(idx, 3);
    return '<div class="product-card reveal' + delayClass + '" data-price="' + p.price + '">' +
      '<a href="' + (p.href || '#') + '" class="product-card-img">' +
        imgHtml + badgeHtml +
        '<button class="wishlist-btn">♡</button>' +
        '<button class="product-card-quick" data-name="' + (p.name || '') + '" data-price="' + p.price + '">Quick Add</button>' +
      '</a>' +
      '<div class="product-card-info">' +
        '<p class="product-card-name"><a href="' + (p.href || '#') + '">' + name + '</a></p>' +
        '<p class="product-card-fit">' + (p.fit || '') + '</p>' +
        '<p class="product-card-price">' + compareHtml + p.price + ' MAD</p>' +
      '</div>' +
    '</div>';
  }).join('');
  if (typeof window.reObserveReveal === 'function') window.reObserveReveal();
}

/* ── Render shop product grid ── */
function renderShopGrid() {
  var grid = document.getElementById('shopProductGrid');
  if (!grid) return;
  var colorNames = {
    navy: '#0f1f3d', blue: '#1e3a5f', caramel: '#8b6347',
    black: '#1a1a1a', white: '#f0ede8', gray: '#888888',
    brown: '#6b4e30', red: '#8b2020', green: '#1e4a2e'
  };
  function toBg(c) { if (!c) return '#888'; var f = c.split(',')[0].trim(); return f.startsWith('#') ? f : (colorNames[f] || '#888'); }
  var badgeLabel = { sale: 'Sale', trending: 'Trending', new: 'New', bestseller: 'Best Seller' };

  var seenShopIds = {};
  var html = Object.keys(PRODUCTS).filter(function(k) {
    var p = PRODUCTS[k]; var uid = p.id || p.slug || k;
    if (seenShopIds[uid]) return false; seenShopIds[uid] = true; return true;
  }).map(function(id) {
    var p = PRODUCTS[id];
    var bg = toBg(p.color);
    var imgHtml = p.image
      ? '<img loading="lazy" class="product-card-img-inner" data-product-img="' + id + '" src="' + p.image + '" alt="' + (p.name || '') + '">'
      : '<div class="product-card-img-inner" data-product-img="' + id + '" style="background:' + bg + '"></div>';
    var badgeHtml = p.badge ? '<span class="product-badge ' + p.badge + '">' + (badgeLabel[p.badge] || p.badge) + '</span>' : '';
    var stockHtml = p.inStock === false ? '<span class="product-badge" style="background:#888;color:#fff">Out of Stock</span>' : '';
    var href = p.href || '#';
    var name = (p.name || '').replace(/&/g, '&amp;');
    var compareHtml = p.originalPrice ? '<span class="original">' + p.originalPrice + ' MAD</span>' : '';
    return (
      '<div class="product-card" data-price="' + p.price + '" data-fit="' + (p.fitFilter || 'wide') + '" data-color="' + normalizeColorToName(p.color) + '" data-size="' + (p.sizes || '') + '">' +
        '<a href="' + href + '">' +
          '<div class="product-card-img">' +
            imgHtml + badgeHtml + stockHtml +
            '<button class="wishlist-btn">♡</button>' +
            '<button class="product-card-quick" data-name="' + (p.name || '') + '" data-price="' + p.price + '">Quick Add</button>' +
          '</div>' +
        '</a>' +
        '<div class="product-card-info">' +
          '<p class="product-card-name"><a href="' + href + '">' + name + '</a></p>' +
          '<p class="product-card-fit">' + (p.fit || '') + '</p>' +
          '<p class="product-card-price">' + compareHtml + p.price + ' MAD</p>' +
        '</div>' +
      '</div>'
    );
  }).join('');

  grid.innerHTML = html || '<p style="padding:40px;text-align:center;color:#888">No products available.</p>';

  if (typeof window._shopApplyFilters === 'function') window._shopApplyFilters();
  if (typeof window.reObserveReveal === 'function') window.reObserveReveal();
}
// Show skeletons immediately — real products replace them after API responds
_showSkeletons('shopProductGrid', 6);
_showSkeletons('homeProductGrid', 4);

/* ── Auto-populate all product card images on the page ── */
function initProductImages() {
  document.querySelectorAll('[data-product-img]').forEach(function(el) {
    var id = el.dataset.productImg;
    var product = PRODUCTS[id];
    if (!product || !product.image) return;
    if (el.tagName === 'IMG') {
      el.src = product.image;
      el.alt = product.name;
    } else {
      var img = document.createElement('img');
      img.className = el.className;
      img.dataset.productImg = id;
      img.src = product.image;
      img.alt = product.name;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;transition:transform 0.5s cubic-bezier(0.16,1,0.3,1);';
      el.parentNode.replaceChild(img, el);
    }
  });
}
initProductImages();

/* ── Auto-detect product slug on old static product pages ── */
(function autoDetectProductSlug() {
  if (document.body.dataset.product) return; // already set (product.html?slug=)
  var pathname = window.location.pathname;
  var filename = pathname.split('/').pop().replace('.html', '');
  if (filename && filename.startsWith('product-')) {
    var slug = filename.replace(/^product-/, '');
    document.body.dataset.product = slug;
  }
})();

/* ── Map a product color (hex or name) to a canonical filter name ── */
var _hexToName = {
  '#1a1a1a':'black','#111111':'black','#000000':'black','#111':'black',
  '#1e3a5f':'navy','#1a2f6b':'navy','#0f1f3d':'navy','#003366':'navy',
  '#2980b9':'blue','#5b8db8':'blue','#1e90ff':'blue','#4a90d9':'blue','#1565c0':'blue',
  '#6b4e30':'brown','#8b6347':'caramel','#c4956a':'caramel','#a0522d':'brown',
  '#888888':'grey','#8a8a8a':'grey','#999999':'grey','#aaaaaa':'grey',
  '#ffffff':'white','#f0ede8':'white','#e8e8e8':'white','#f5f5f5':'white'
};
function normalizeColorToName(colorStr) {
  if (!colorStr) return '';
  var first = colorStr.split(',')[0].trim().toLowerCase();
  if (!first.startsWith('#')) return first; // already a name
  return _hexToName[first] || first;
}

/* ── Parse color string into [{label, hex}] array ── */
var _colorNameMap = { navy:'#0f1f3d', blue:'#1e3a5f', caramel:'#8b6347', black:'#1a1a1a', white:'#f0ede8', gray:'#888888', brown:'#6b4e30', red:'#8b2020', green:'#1e4a2e', beige:'#c8b99a', cream:'#f5f0e8' };
function parseProductColors(colorStr) {
  if (!colorStr) return [];
  return colorStr.split(',').map(function(entry) {
    entry = entry.trim();
    var colon = entry.lastIndexOf(':');
    if (colon > 0 && entry[colon + 1] === '#') {
      return { label: entry.slice(0, colon).trim(), hex: entry.slice(colon + 1).trim() };
    } else if (entry.startsWith('#')) {
      return { label: entry, hex: entry };
    } else {
      return { label: entry, hex: _colorNameMap[entry.toLowerCase()] || '#888' };
    }
  }).filter(function(c) { return c.hex; });
}

/* ── Auto-populate product info panel (product detail page) ── */
function initProductInfo() {
  var page = document.body.dataset.product;
  if (!page) return;
  var product = PRODUCTS[page];
  if (!product) return;

  document.title = product.name + ' — StreetStore';

  var crumb = document.querySelector('.breadcrumb .current');
  if (crumb) crumb.textContent = product.name;

  var nameEl = document.querySelector('.product-name');
  if (nameEl) nameEl.textContent = product.name.toUpperCase();

  var priceEl = document.querySelector('.product-price-display');
  if (priceEl) priceEl.innerHTML = (product.originalPrice ? '<span class="original" style="font-size:16px;color:var(--gray);text-decoration:line-through;margin-right:8px;">' + product.originalPrice + ' MAD</span>' : '') + product.price + ' MAD';

  var sizeWrap = document.querySelector('.size-selector');
  if (sizeWrap && product.sizes) {
    var sizesInStock = product.sizesInStock || null;
    sizeWrap.innerHTML = product.sizes.split(',').map(function(s, i) {
      s = s.trim();
      var outOfStock = sizesInStock && !sizesInStock.includes(s);
      return '<button class="size-btn' + (i === 0 && !outOfStock ? ' active' : '') + (outOfStock ? ' sold-out' : '') + '"' + (outOfStock ? ' disabled' : '') + '>' + s + '</button>';
    }).join('');
  }

  var fitNote = document.querySelector('.fit-note');
  if (fitNote && product.fit) fitNote.textContent = product.fit;

  // ── Dynamic color swatches ──
  var colors = parseProductColors(product.color);
  var swatchWrap = document.querySelector('.product-swatches');
  var colorLabel = document.querySelector('.product-option-label span:last-child');
  if (swatchWrap && colors.length) {
    swatchWrap.innerHTML = colors.map(function(c, i) {
      return '<div class="product-swatch' + (i === 0 ? ' active' : '') + '" style="background:' + c.hex + ';" title="' + c.label + '" data-color="' + c.label + '"></div>';
    }).join('');
    if (colorLabel) colorLabel.textContent = colors[0].label;
    // Update label on swatch click
    swatchWrap.addEventListener('click', function(e) {
      var swatch = e.target.closest('.product-swatch');
      if (!swatch) return;
      swatchWrap.querySelectorAll('.product-swatch').forEach(function(s) { s.classList.remove('active'); });
      swatch.classList.add('active');
      if (colorLabel) colorLabel.textContent = swatch.dataset.color || swatch.title;
      // Keep cart button aware of selected color
      var cartBtn = document.querySelector('.add-to-cart-btn');
      if (cartBtn) cartBtn.dataset.color = swatch.dataset.color || swatch.title;
    });
    // Set initial color on cart button
    var cartBtn = document.querySelector('.add-to-cart-btn');
    if (cartBtn) cartBtn.dataset.color = colors[0].label;
  }

  var cartBtn = document.querySelector('.add-to-cart-btn');
  if (cartBtn) { cartBtn.dataset.name = product.name; cartBtn.dataset.price = product.price; }

  // ── Wishlist button ──
  var wishBtn = document.querySelector('.wishlist-link');
  if (wishBtn) {
    var WISH_KEY = 'ss_wishlist';
    var slug = document.body.dataset.product;

    function getWishlist() {
      try { return JSON.parse(localStorage.getItem(WISH_KEY) || '[]'); } catch(e) { return []; }
    }
    function isWishlisted() {
      return getWishlist().some(function(i) { return i.href && i.href.indexOf('slug=' + slug) !== -1; });
    }
    function updateWishBtn() {
      if (isWishlisted()) {
        wishBtn.innerHTML = '♥ Saved to Wishlist';
        wishBtn.style.color = '#e74c3c';
      } else {
        wishBtn.innerHTML = '♡ ' + (wishBtn.dataset.i18nText || 'Add to Wishlist');
        wishBtn.style.color = '';
      }
    }

    wishBtn.dataset.i18nText = wishBtn.textContent.replace(/^[♡♥]\s*/, '').trim();
    updateWishBtn();

    wishBtn.addEventListener('click', function(e) {
      e.preventDefault();
      var list = getWishlist();
      var href = 'product.html?slug=' + slug;
      if (isWishlisted()) {
        list = list.filter(function(i) { return !i.href || i.href.indexOf('slug=' + slug) === -1; });
        localStorage.setItem(WISH_KEY, JSON.stringify(list));
      } else {
        list.push({
          name:  product.name,
          price: product.price,
          image: product.image || '',
          href:  href
        });
        localStorage.setItem(WISH_KEY, JSON.stringify(list));
      }
      updateWishBtn();
    });
  }

  // Reveal product info after populating
  document.body.classList.remove('ss-product-loading');
}

/* ── Product page skeleton — hide info until API responds ── */
(function() {
  if (!document.body.dataset.product) return; // only on product pages
  document.body.classList.add('ss-product-loading');
  var s = document.createElement('style');
  s.textContent = [
    '.ss-product-loading .product-name,',
    '.ss-product-loading .product-price-display,',
    '.ss-product-loading .size-selector,',
    '.ss-product-loading .product-swatches,',
    '.ss-product-loading .fit-note',
    '{color:transparent!important;background:linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%);',
    'background-size:200% 100%;animation:ssSkelShim 1.4s infinite;',
    'border-radius:4px;min-width:80px;display:inline-block;transition:none!important}',
    '.ss-product-loading .product-swatches .product-swatch{opacity:0}'
  ].join('');
  document.head.appendChild(s);
})();

/* ── Auto-populate product page gallery (filmstrip + video) ── */
function initProductGallery() {
  var page = document.body.dataset.product;
  if (!page) return;
  var product = PRODUCTS[page];
  if (!product) return;

  var videoSrc = document.getElementById('productVideoSrc');
  if (videoSrc && product.video) {
    videoSrc.src = product.video;
    var vid = document.getElementById('productVideo');
    if (vid) {
      vid.load();
      var pl = vid.play();
      if (pl && pl.catch) pl.catch(function() {});
    }
  }

  var thumbs = document.querySelectorAll('.thumb-item[data-gallery-index]');
  var mainImg = document.getElementById('mainProductImg');
  var mainWrap = document.getElementById('galleryMainNew');
  var gallery = product.gallery || [];

  thumbs.forEach(function(thumb) {
    var idx = parseInt(thumb.dataset.galleryIndex, 10);
    var src = gallery[idx];
    if (!src) return;
    thumb.dataset.src = src;
    var img = thumb.querySelector('img');
    if (img) img.src = src;
  });

  if (mainImg && gallery[0]) {
    mainImg.src = gallery[0];
  }
  if (mainWrap) {
    mainWrap.setAttribute('data-counter', '01 / ' + String(gallery.length).padStart(2, '0'));
  }

  // Apply per-size stock status from admin settings
  var sizesInStock = product.sizesInStock;
  if (Array.isArray(sizesInStock)) {
    document.querySelectorAll('.size-btn').forEach(function(btn) {
      var s = btn.textContent.trim();
      if (!sizesInStock.includes(s)) {
        btn.classList.add('sold-out');
        btn.disabled = true;
      }
    });
  }
}
initProductGallery();

/* ── Sync product page UI with live PRODUCTS data ─────────── */
function syncProductPageUI(productKey) {
  var key = productKey || (document.body && document.body.dataset.product);
  if (!key || !PRODUCTS[key]) return;
  var p = PRODUCTS[key];
  document.body.classList.remove('ss-product-loading');

  /* Name & breadcrumb */
  var nameEl = document.querySelector('.product-name');
  if (nameEl && p.name) nameEl.textContent = p.name.toUpperCase();
  var crumb = document.querySelector('.breadcrumb .current');
  if (crumb && p.name) crumb.textContent = p.name;
  if (p.name) document.title = p.name + ' — StreetStore';

  var priceEl = document.querySelector('.product-price-display');
  if (priceEl && p.price) {
    var orig = p.comparePrice || p.originalPrice;
    var origHtml = orig && orig > p.price ? '<span class="original" style="font-size:16px;color:var(--gray);text-decoration:line-through;margin-right:8px;">' + orig + ' MAD</span>' : '';
    priceEl.innerHTML = origHtml + p.price + ' MAD';
  }

  var badgeWrap = document.querySelector('.product-badge-wrap .product-label');
  if (badgeWrap && p.badge) {
    var badgeLabels = { sale:'Sale', trending:'Trending', 'new-badge':'New', bestseller:'Best Seller' };
    badgeWrap.textContent = badgeLabels[p.badge] || p.badge;
    badgeWrap.className = 'product-label ' + p.badge;
    badgeWrap.parentElement.style.display = '';
  } else if (badgeWrap && !p.badge) {
    badgeWrap.parentElement.style.display = 'none';
  }

  if (p.sizes) {
    var sizeSelector = document.querySelector('.size-selector');
    if (sizeSelector) {
      var sizeList = p.sizes.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
      sizeSelector.innerHTML = sizeList.map(function(s) { return '<button class="size-btn">' + s + '</button>'; }).join('');
      var inStock = Array.isArray(p.sizesInStock) ? p.sizesInStock : null;
      sizeSelector.querySelectorAll('.size-btn').forEach(function(btn) {
        if (inStock && !inStock.includes(btn.textContent.trim())) { btn.classList.add('sold-out'); btn.disabled = true; }
      });
      // Auto-select first available size
      var firstAvailable = sizeSelector.querySelector('.size-btn:not(.sold-out)');
      if (firstAvailable) {
        firstAvailable.classList.add('active');
        var selectedSizeEl = document.getElementById('selectedSize');
        if (selectedSizeEl) selectedSizeEl.textContent = firstAvailable.textContent.trim();
      }
      if (typeof initSizeSelector === 'function') initSizeSelector();
    }
  }

  if (p.gallery && p.gallery.length) {
    var track = document.getElementById('galleryTrack');
    var thumbstrip = document.querySelector('.gallery-thumbstrip');
    if (track) {
      track.innerHTML = p.gallery.map(function(src, i) {
        return '<div class="gallery-slide"><img loading="' + (i === 0 ? 'eager' : 'lazy') + '" src="' + src + '" alt="' + (p.name || '') + '"></div>';
      }).join('');
    }
    if (thumbstrip) {
      thumbstrip.innerHTML = p.gallery.map(function(src, i) {
        return '<div class="thumb-item' + (i === 0 ? ' active' : '') + '" data-gallery-index="' + i + '" data-src="' + src + '"><img loading="lazy" src="' + src + '"></div>';
      }).join('');
    }
    if (typeof initGallerySlider === 'function') initGallerySlider();
  }

  var videoWrap2 = document.getElementById('galleryVideoWrap');
  var imagesWrap2 = document.getElementById('galleryImagesWrap');
  if (p.video) {
    var videoSrc = document.getElementById('productVideoSrc');
    var vid = document.getElementById('productVideo');
    if (videoSrc && vid) {
      videoSrc.src = p.video;
      vid.load();
      if (videoWrap2) { videoWrap2.style.display = ''; videoWrap2.style.opacity = '1'; videoWrap2.style.transition = ''; }
      if (imagesWrap2) imagesWrap2.classList.remove('reveal-images');
      var pp = vid.play(); if (pp && pp.catch) pp.catch(function() {});
    }
  } else {
    /* No video — hide video wrap and show images immediately */
    if (videoWrap2) videoWrap2.style.display = 'none';
    if (imagesWrap2) imagesWrap2.classList.add('reveal-images');
  }
}

document.addEventListener('productsLoaded', function() { syncProductPageUI(); renderCompleteTheLook(); });
document.addEventListener('productsUpdated', function() { syncProductPageUI(); renderCompleteTheLook(); });
setTimeout(function() { syncProductPageUI(); renderCompleteTheLook(); }, 500);

/* ── Dynamic "Complete the Look" / "You might also like" ── */
function renderCompleteTheLook() {
  var section = document.querySelector('.complete-look');
  if (!section) return;
  var currentSlug = document.body.dataset.product || '';
  var colorNames = { navy:'#0f1f3d', blue:'#1e3a5f', caramel:'#8b6347', black:'#1a1a1a', white:'#f0ede8', gray:'#888888', brown:'#6b4e30', red:'#8b2020', green:'#1e4a2e' };
  function toBg(c) { if (!c) return '#888'; var f = c.split(',')[0].trim(); return f.startsWith('#') ? f : (colorNames[f] || '#888'); }

  // Deduplicate and exclude current product
  var seen = {}; var currentId = (PRODUCTS[currentSlug] && PRODUCTS[currentSlug].id) || currentSlug;
  var others = Object.keys(PRODUCTS).filter(function(k) {
    var p = PRODUCTS[k]; var uid = p.id || k;
    if (uid === currentId || seen[uid]) return false;
    seen[uid] = true; return true;
  }).slice(0, 4);

  if (!others.length) return;

  var cardsHtml = others.map(function(k) {
    var p = PRODUCTS[k];
    var href = p.href || ('product.html?slug=' + (p.slug || k));
    var imgHtml = p.image
      ? '<img loading="lazy" src="' + p.image + '" alt="' + (p.name || '') + '" style="width:100%;height:100%;object-fit:cover;display:block;">'
      : '<div style="width:100%;height:100%;background:' + toBg(p.color) + ';"></div>';
    var origHtml = p.originalPrice ? '<span style="font-size:12px;color:var(--gray);text-decoration:line-through;margin-right:5px;">' + p.originalPrice + ' MAD</span>' : '';
    return (
      '<div class="product-card" data-price="' + p.price + '" data-fit="' + (p.fitFilter || 'wide') + '">' +
        '<a href="' + href + '">' +
          '<div class="product-card-img"><div class="product-card-img-inner">' + imgHtml + '</div>' +
            '<button class="wishlist-btn">♡</button>' +
            '<button class="product-card-quick" data-name="' + (p.name || '') + '" data-price="' + p.price + '">Quick Add</button>' +
          '</div>' +
        '</a>' +
        '<div class="product-card-info">' +
          '<p class="product-card-name"><a href="' + href + '">' + (p.name || '') + '</a></p>' +
          '<p class="product-card-fit">' + (p.fit || '') + '</p>' +
          '<p class="product-card-price">' + origHtml + p.price + ' MAD</p>' +
        '</div>' +
      '</div>'
    );
  }).join('');

  // Replace existing hardcoded cards — try all known class names
  var existingGrid = section.querySelector('.product-grid-3-related, .product-grid-3, .complete-look-grid');
  if (existingGrid) {
    existingGrid.innerHTML = cardsHtml;
  }
}
