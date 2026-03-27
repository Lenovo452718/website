/* ============================================================
   STREETSTORE — Central Product Data
   Change images here → updates everywhere automatically
   ============================================================ */

const PRODUCTS = {

  'patte-elephant': {
    name: "Patte d'éléphant Jean",
    price: 179,
    originalPrice: 249,
    fit: "Wide Flare Leg",
    fitFilter: "wide",
    href: "product-patte-elephant.html",
    badge: "sale",
    color: "navy",
    sizes: "34,36,38,40,42",
    inStock: true,
    image: "images/products/patte-elephant/1.jpg",
    gallery: [
      "images/products/patte-elephant/1.jpg",
      "images/products/patte-elephant/2.jpg",
      "images/products/patte-elephant/3.jpg",
      "images/products/patte-elephant/4.jpg",
    ],
    video: null
  },

  'high-rise-dark-blue': {
    name: "High-Rise Dark Blue Jeans",
    price: 179,
    originalPrice: 249,
    fit: "High Waist",
    fitFilter: "skinny",
    href: "product-high-rise-dark-blue.html",
    badge: "sale",
    color: "navy",
    sizes: "34,36,38,40,42,44",
    inStock: true,
    image: "images/products/high-rise-dark-blue/1.jpg",
    gallery: [
      "images/products/high-rise-dark-blue/1.jpg",
      "images/products/high-rise-dark-blue/2.jpg",
      "images/products/high-rise-dark-blue/3.jpg",
      "images/products/high-rise-dark-blue/4.jpg",
      "images/products/high-rise-dark-blue/5.jpg",
    ],
    video: null
  },

  'brown-wide-leg': {
    name: "Brown Wide-Leg Jean",
    price: 179,
    originalPrice: 299,
    fit: "Wide Leg",
    fitFilter: "wide",
    href: "product-brown-wide-leg.html",
    badge: "sale",
    color: "caramel",
    sizes: "36,38,40,42",
    inStock: true,
    image: "images/products/brown-wide-leg/1.jpg",
    gallery: [
      "images/products/brown-wide-leg/1.jpg",
      "images/products/brown-wide-leg/2.jpg",
      "images/products/brown-wide-leg/3.jpg",
      "images/products/brown-wide-leg/4.jpg",
      "images/products/brown-wide-leg/5.jpg",
    ],
    video: null
  },

  'baggy-wide-leg': {
    name: "Baggy Wide Leg Denim Jeans",
    price: 179,
    originalPrice: 250,
    fit: "Oversized Baggy",
    fitFilter: "wide",
    href: "product-baggy-wide-leg.html",
    badge: "sale",
    color: "black",
    sizes: "34,36,38,40",
    inStock: true,
    image: "images/products/baggy-wide-leg/1.jpg",
    gallery: [
      "images/products/baggy-wide-leg/1.jpg",
      "images/products/baggy-wide-leg/2.jpg",
      "images/products/baggy-wide-leg/3.jpg",
      "images/products/baggy-wide-leg/4.jpg",
      "images/products/baggy-wide-leg/5.jpg",
    ],
    video: null
  },

  'jean-skirts': {
    name: "Jean Skirts",
    price: 179,
    originalPrice: 299,
    fit: "Denim Mini Skirt",
    fitFilter: "straight",
    href: "product-jean-skirts.html",
    badge: "sale",
    color: "blue",
    sizes: "34,36,38,40,42",
    inStock: true,
    image: null,
    gallery: [],
    video: null
  },

  'denim-set': {
    name: "Denim Jacket & Wide-Leg Pants Set",
    price: 299,
    originalPrice: 350,
    fit: "Full Denim Set",
    fitFilter: "straight",
    href: "product-denim-set.html",
    badge: "trending",
    color: "navy",
    sizes: "36,38,40,42",
    inStock: true,
    image: null,
    gallery: [],
    video: null
  }

};

/* ── Fetch live products from backend API and merge ── */
(function loadLiveProducts() {
  var API = (window.SS_API_URL || 'https://streetstore-api.onrender.com');
  fetch(API + '/api/products/overrides')
    .then(function(r) { return r.json(); })
    .then(function(overrides) {
      Object.keys(overrides).forEach(function(slug) {
        if (overrides[slug] === null) { delete PRODUCTS[slug]; }
        else { PRODUCTS[slug] = Object.assign({}, PRODUCTS[slug] || {}, overrides[slug]); }
      });
      // Notify any listeners that products are loaded
      if (typeof window.onProductsLoaded === 'function') window.onProductsLoaded();
      document.dispatchEvent(new CustomEvent('productsLoaded'));
    })
    .catch(function() {
      // Fallback: apply localStorage overrides (offline/dev mode)
      try {
        var ov = JSON.parse(localStorage.getItem('ss_products_override') || '{}');
        Object.keys(ov).forEach(function(id) {
          if (ov[id] === null) { delete PRODUCTS[id]; }
          else { PRODUCTS[id] = Object.assign({}, PRODUCTS[id] || {}, ov[id]); }
        });
      } catch(e) {}
    });
})();

/* ── Socket.io real-time sync ── */
(function initSocket() {
  var API = (window.SS_API_URL || 'https://streetstore-api.onrender.com');
  var script = document.createElement('script');
  script.src = API + '/socket.io/socket.io.js';
  script.onload = function() {
    try {
      var socket = io(API, { transports: ['websocket', 'polling'] });
      socket.on('product:updated', function(data) {
        // Re-fetch overrides and re-render page
        fetch(API + '/api/products/overrides')
          .then(function(r) { return r.json(); })
          .then(function(overrides) {
            Object.keys(overrides).forEach(function(slug) {
              PRODUCTS[slug] = Object.assign({}, PRODUCTS[slug] || {}, overrides[slug]);
            });
            document.dispatchEvent(new CustomEvent('productsUpdated', { detail: data }));
          });
      });
      socket.on('product:created', function() {
        fetch(API + '/api/products/overrides')
          .then(function(r) { return r.json(); })
          .then(function(overrides) {
            Object.keys(overrides).forEach(function(slug) {
              PRODUCTS[slug] = Object.assign({}, PRODUCTS[slug] || {}, overrides[slug]);
            });
            document.dispatchEvent(new CustomEvent('productsUpdated'));
          });
      });
      socket.on('settings:changed', function(settings) {
        if (settings.primaryColor) {
          document.documentElement.style.setProperty('--primary', settings.primaryColor);
        }
        if (settings.accentColor) {
          document.documentElement.style.setProperty('--accent', settings.accentColor);
        }
        document.dispatchEvent(new CustomEvent('settingsUpdated', { detail: settings }));
      });
    } catch(e) {}
  };
  document.head.appendChild(script);
})();

/* ── Fetch overrides from backend so all devices stay in sync ── */
setTimeout(function() {
  var backend = window.STREETSTORE_BACKEND;
  if (!backend) return;
  fetch(backend + '/api/products/overrides')
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(ov) {
      if (!ov || typeof ov !== 'object') return;
      // Cache in localStorage for next load
      localStorage.setItem('ss_products_override', JSON.stringify(ov));
      // Apply to PRODUCTS and re-init video if it changed for the current page
      var page = document.body.dataset.product;
      var prevVideo   = page && PRODUCTS[page] ? PRODUCTS[page].video : undefined;
      var prevGallery = page && PRODUCTS[page] ? (PRODUCTS[page].gallery || []).join(',') : '';
      Object.keys(ov).forEach(function(id) {
        if (ov[id] === null) { delete PRODUCTS[id]; }
        else { PRODUCTS[id] = Object.assign({}, PRODUCTS[id] || {}, ov[id]); }
      });
      renderShopGrid();
      if (!page || !PRODUCTS[page]) return;
      // Re-init gallery slider if gallery changed (covers first cross-device visit)
      var newGallery = (PRODUCTS[page].gallery || []).join(',');
      if (newGallery && newGallery !== prevGallery && typeof initGallerySlider === 'function') {
        initGallerySlider();
      }
      // Re-apply per-size stock status
      var sizesInStock = PRODUCTS[page].sizesInStock;
      if (Array.isArray(sizesInStock)) {
        document.querySelectorAll('.size-btn').forEach(function(btn) {
          var s = btn.textContent.trim();
          if (!sizesInStock.includes(s)) { btn.classList.add('sold-out'); btn.disabled = true; }
          else { btn.classList.remove('sold-out'); btn.disabled = false; }
        });
      } else {
        document.querySelectorAll('.size-btn').forEach(function(btn) {
          btn.classList.remove('sold-out'); btn.disabled = false;
        });
      }
      var newVideo = PRODUCTS[page].video;
      if (newVideo && newVideo !== prevVideo) {
        var videoSrc = document.getElementById('productVideoSrc');
        var vid = document.getElementById('productVideo');
        if (videoSrc && vid) {
          videoSrc.src = newVideo;
          vid.load();
          var p = vid.play();
          if (p && p.catch) p.catch(function() {});
        }
      }
    })
    .catch(function() {});
}, 0);

/* ── Render shop product grid dynamically ────────────────── */
function renderShopGrid() {
  var grid = document.getElementById('shopProductGrid');
  if (!grid) return;

  var colorNames = {
    navy: '#0f1f3d', blue: '#1e3a5f', caramel: '#8b6347',
    black: '#1a1a1a', white: '#f0ede8', gray: '#888888',
    brown: '#6b4e30', red: '#8b2020', green: '#1e4a2e'
  };
  function toBg(c) { if (!c) return '#888'; return c.startsWith('#') ? c : (colorNames[c]||'#888'); }
  var badgeLabel = { sale: 'Sale', trending: 'Trending', 'new-badge': 'New', bestseller: 'Best Seller' };

  var html = Object.keys(PRODUCTS).map(function(id) {
    var p = PRODUCTS[id];
    var bg = toBg(p.color);
    var imgHtml = p.image
      ? '<img class="product-card-img-inner" data-product-img="' + id + '" src="' + p.image + '" alt="' + p.name + '">'
      : '<div class="product-card-img-inner" data-product-img="' + id + '" style="background:' + bg + '"></div>';
    var badgeHtml = p.badge ? '<span class="product-badge ' + p.badge + '">' + (badgeLabel[p.badge] || p.badge) + '</span>' : '';
    var stockHtml = p.inStock === false ? '<span class="product-badge" style="background:#888;color:#fff">Out of Stock</span>' : '';
    var href = p.href || '#';
    var name = p.name.replace(/&/g, '&amp;');
    return (
      '<div class="product-card" data-price="' + p.price + '" data-fit="' + (p.fitFilter || 'wide') + '" data-color="' + (p.color || '') + '" data-size="' + (p.sizes || '') + '">' +
        '<a href="' + href + '">' +
          '<div class="product-card-img">' +
            imgHtml + badgeHtml + stockHtml +
            '<button class="wishlist-btn">♡</button>' +
            '<button class="product-card-quick" data-name="' + p.name + '" data-price="' + p.price + '">Quick Add</button>' +
          '</div>' +
        '</a>' +
        '<div class="product-card-info">' +
          '<p class="product-card-name"><a href="' + href + '">' + name + '</a></p>' +
          '<p class="product-card-fit">' + (p.fit || '') + '</p>' +
          '<p class="product-card-price"><span class="original">' + p.originalPrice + ' MAD</span>' + p.price + ' MAD</p>' +
        '</div>' +
      '</div>'
    );
  }).join('');

  grid.innerHTML = html || '<p style="padding:40px;text-align:center;color:#888">No products available.</p>';

  // Re-apply filters so new/updated products respect the current filter state
  if (typeof window._shopApplyFilters === 'function') window._shopApplyFilters();
}
renderShopGrid();

/* ── Auto-populate all product card images on the page ─────── */
(function initProductImages() {
  document.querySelectorAll('[data-product-img]').forEach(function(el) {
    var id      = el.dataset.productImg;
    var product = PRODUCTS[id];
    if (!product || !product.image) return;

    if (el.tagName === 'IMG') {
      el.src = product.image;
      el.alt = product.name;
    } else {
      var img = document.createElement('img');
      img.className          = el.className;
      img.dataset.productImg = id;
      img.src                = product.image;
      img.alt                = product.name;
      img.style.cssText      = 'width:100%;height:100%;object-fit:cover;display:block;transition:transform 0.5s cubic-bezier(0.16,1,0.3,1);';
      el.parentNode.replaceChild(img, el);
    }
  });
})();

/* ── Auto-populate product info panel (name, price, sizes…) ── */
(function initProductInfo() {
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
  if (priceEl) priceEl.innerHTML = '<span class="original" style="font-size:16px;color:var(--gray);text-decoration:line-through;margin-right:8px;">' + product.originalPrice + ' MAD</span>' + product.price + ' MAD';

  var sizeWrap = document.querySelector('.size-selector');
  if (sizeWrap && product.sizes) {
    sizeWrap.innerHTML = product.sizes.split(',').map(function(s, i) {
      return '<button class="size-btn' + (i === 0 ? ' active' : '') + '">' + s.trim() + '</button>';
    }).join('');
  }

  var fitNote = document.querySelector('.fit-note');
  if (fitNote && product.fit) fitNote.textContent = product.fit;

  var cartBtn = document.querySelector('.add-to-cart-btn');
  if (cartBtn) { cartBtn.dataset.name = product.name; cartBtn.dataset.price = product.price; }
})();

/* ── Auto-populate product page gallery (filmstrip + video) ── */
(function initProductGallery() {
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
      var p = vid.play();
      if (p && p.catch) p.catch(function() {});
    }
  }

  var thumbs   = document.querySelectorAll('.thumb-item[data-gallery-index]');
  var mainImg  = document.getElementById('mainProductImg');
  var mainWrap = document.getElementById('galleryMainNew');
  var gallery  = product.gallery || [];

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
  var sizesInStock = product.sizesInStock; // null = all in stock; array = only listed sizes
  if (Array.isArray(sizesInStock)) {
    document.querySelectorAll('.size-btn').forEach(function(btn) {
      var s = btn.textContent.trim();
      if (!sizesInStock.includes(s)) {
        btn.classList.add('sold-out');
        btn.disabled = true;
      }
    });
  }
})();
