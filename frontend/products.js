/* ============================================================
   STREETSTORE — Dynamic Product Data (API-driven)
   Fetches from backend. Hardcoded data is fallback only.
   ============================================================ */

var PRODUCTS = {

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
    href: p.href || ('product-' + p.slug + '.html'),
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
    id: p.id
  };
}

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
      if (!Array.isArray(list) || !list.length) return;
      // Replace PRODUCTS with fresh API data
      var newProducts = {};
      list.forEach(function(p) {
        if ((p.status || 'active').toUpperCase() === 'ACTIVE') {
          newProducts[p.slug] = apiProductToLocal(p);
        }
      });
      // Merge: keep local fallback keys that aren't in API, override with API data
      Object.keys(newProducts).forEach(function(slug) {
        PRODUCTS[slug] = newProducts[slug];
      });
      // Remove products deleted from DB (only remove if they exist in API response)
      // (keep local fallbacks if API returns partial data)
      document.dispatchEvent(new CustomEvent('productsLoaded'));
      renderShopGrid();
      renderHomeGrid();
      if (typeof initProductImages === 'function') initProductImages();
      if (typeof initProductInfo === 'function') initProductInfo();
    })
    .catch(function() {
      // Fallback to hardcoded data
      document.dispatchEvent(new CustomEvent('productsLoaded'));
      renderShopGrid();
      renderHomeGrid();
    });
})();

/* ── Socket.io real-time sync ── */
(function initSocket() {
  var API = (window.SS_API_URL || window.STREETSTORE_BACKEND || '');
  if (!API) return;
  var script = document.createElement('script');
  script.src = API + '/socket.io/socket.io.js';
  script.onload = function() {
    try {
      var socket = io(API, { transports: ['websocket', 'polling'] });
      function refetch() {
        fetch(API + '/api/products')
          .then(function(r) { return r.ok ? r.json() : null; })
          .then(function(list) {
            if (!Array.isArray(list)) return;
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
      socket.on('product:updated', refetch);
      socket.on('product:created', refetch);
      socket.on('product:deleted', refetch);
      socket.on('settings:changed', function(settings) {
        if (settings.primaryColor) document.documentElement.style.setProperty('--primary', settings.primaryColor);
        if (settings.accentColor) document.documentElement.style.setProperty('--accent', settings.accentColor);
        document.dispatchEvent(new CustomEvent('settingsUpdated', { detail: settings }));
      });
    } catch(e) {}
  };
  document.head.appendChild(script);
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
  function toBg(c) { if (!c) return '#888'; return c.startsWith('#') ? c : (colorNames[c] || '#888'); }
  var badgeLabel = { sale: 'Sale', trending: 'Trending', new: 'New', bestseller: 'Best Seller' };
  var keys = Object.keys(PRODUCTS).slice(0, 6);
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
  function toBg(c) { if (!c) return '#888'; return c.startsWith('#') ? c : (colorNames[c] || '#888'); }
  var badgeLabel = { sale: 'Sale', trending: 'Trending', new: 'New', bestseller: 'Best Seller' };

  var html = Object.keys(PRODUCTS).map(function(id) {
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
      '<div class="product-card" data-price="' + p.price + '" data-fit="' + (p.fitFilter || 'wide') + '" data-color="' + (p.color || '') + '" data-size="' + (p.sizes || '') + '">' +
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
}
renderShopGrid();
renderHomeGrid();

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

  var cartBtn = document.querySelector('.add-to-cart-btn');
  if (cartBtn) { cartBtn.dataset.name = product.name; cartBtn.dataset.price = product.price; }
}
initProductInfo();

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

  if (p.video) {
    var videoSrc = document.getElementById('productVideoSrc');
    var vid = document.getElementById('productVideo');
    var videoWrap = document.getElementById('galleryVideoWrap');
    if (videoSrc && vid) {
      videoSrc.src = p.video;
      vid.load();
      if (videoWrap) videoWrap.style.display = '';
      var pp = vid.play(); if (pp && pp.catch) pp.catch(function() {});
    }
  }
}

document.addEventListener('productsLoaded', function() { syncProductPageUI(); });
document.addEventListener('productsUpdated', function() { syncProductPageUI(); });
setTimeout(function() { syncProductPageUI(); }, 500);
