/* ============================================================
   STREETSTORE — Complete JavaScript
   ============================================================ */

/* ── Pack Deal Settings ── */
let _packSettings = {
  packDeal2: 339,
  packDeal3: 479,
  packEnabled: true,
  packDealBadge: 'Save up to 10% off',
  packDealSub: 'Mix & match any styles — discount applied automatically in cart',
};
// Load cached settings instantly (before API responds)
try {
  var _cached = localStorage.getItem('ss_pack');
  if (_cached) {
    var _cp = JSON.parse(_cached);
    if (_cp.packDeal2) _packSettings.packDeal2 = _cp.packDeal2;
    if (_cp.packDeal3) _packSettings.packDeal3 = _cp.packDeal3;
  }
} catch(e) {}

/* ── Bundle 3 Settings ── */
var _bundleSettings = { bundle3Price: 499, bundle3Enabled: true };
try {
  var _bc = JSON.parse(localStorage.getItem('ss_bundle3') || 'null');
  if (_bc) {
    if (_bc.bundle3Price) _bundleSettings.bundle3Price = _bc.bundle3Price;
    if (_bc.bundle3Enabled !== undefined) _bundleSettings.bundle3Enabled = _bc.bundle3Enabled;
  }
} catch(e2) {}
document.addEventListener('DOMContentLoaded', function() {
  var _bl = document.getElementById('bundleOfferBlock');
  if (!_bl) return;
  _bl.style.display = _bundleSettings.bundle3Enabled ? '' : 'none';
  var _pr = _bl.querySelector('.bundle-offer-price');
  if (_pr) _pr.textContent = _bundleSettings.bundle3Price + ' MAD';
});

function fetchPackSettings() {
  var API = (typeof STREETSTORE_BACKEND !== 'undefined') ? STREETSTORE_BACKEND : 'http://localhost:3000';
  fetch(API + '/api/settings')
    .then(function(r) { return r.json(); })
    .then(function(s) {
      if (s.packDeal2)    _packSettings.packDeal2    = s.packDeal2;
      if (s.packDeal3)    _packSettings.packDeal3    = s.packDeal3;
      if (s.packEnabled !== undefined) _packSettings.packEnabled = s.packEnabled;
      if (s.packDealBadge) _packSettings.packDealBadge = s.packDealBadge;
      if (s.packDealSub)   _packSettings.packDealSub   = s.packDealSub;
      // Cache to localStorage for next visit
      try { localStorage.setItem('ss_pack', JSON.stringify({packDeal2:_packSettings.packDeal2, packDeal3:_packSettings.packDeal3})); } catch(e) {}
      // Bundle3 settings
      if (s.bundle3Price !== undefined) _bundleSettings.bundle3Price = s.bundle3Price;
      if (s.bundle3Enabled !== undefined) _bundleSettings.bundle3Enabled = s.bundle3Enabled;
      try { localStorage.setItem('ss_bundle3', JSON.stringify({bundle3Price:_bundleSettings.bundle3Price, bundle3Enabled:_bundleSettings.bundle3Enabled})); } catch(e) {}
      var _bundleBlock = document.getElementById('bundleOfferBlock');
      if (_bundleBlock) {
        _bundleBlock.style.display = _bundleSettings.bundle3Enabled ? '' : 'none';
        var _bundlePrEl = _bundleBlock.querySelector('.bundle-offer-price');
        if (_bundlePrEl) _bundlePrEl.textContent = _bundleSettings.bundle3Price + ' MAD';
      }
      // Update cart deal offer text if already rendered
      var titleEl = document.getElementById('cartDealTitle');
      var subEl   = document.getElementById('cartDealSub');
      if (titleEl) titleEl.textContent = _packSettings.packDealBadge;
      if (subEl)   subEl.textContent   = _packSettings.packDealSub;
      // Update product page pack deal block
      var mainEl = document.querySelector('.pack-deal-main');
      if (mainEl) {
        var spans = mainEl.querySelectorAll('span');
        if (spans[0]) spans[0].textContent = _packSettings.packDeal2 + ' MAD';
        if (spans[1]) spans[1].textContent = _packSettings.packDeal3 + ' MAD';
      }
      document.querySelectorAll('.pack-deal-sub').forEach(function(el) {
        el.textContent = _packSettings.packDealSub;
      });
      document.querySelectorAll('.pack-deal-badge').forEach(function(el) {
        el.textContent = _packSettings.packDealBadge;
      });
      // Update "complete look" deal line
      document.querySelectorAll('.complete-look-deal span[data-lang="en"]').forEach(function(el) {
        el.textContent = 'Buy 2 & save \u2014 ' + _packSettings.packDeal2 + ' MAD for 2 items';
      });
      document.querySelectorAll('.complete-look-deal span[data-lang="fr"]').forEach(function(el) {
        el.textContent = 'Achetez 2 & \u00e9conomisez \u2014 ' + _packSettings.packDeal2 + ' MAD pour 2 articles';
      });
    })
    .catch(function() {});
}
fetchPackSettings();

/* ── Announcement Bar ── */
(async function() {
  if (sessionStorage.getItem('barDismissed')) return;

  const DEFAULT_MESSAGES = [
    '✦ Free shipping on all orders',
    '✦ COD available across Morocco',
    '✦ Delivered in 2–5 days',
  ];

  let messages = DEFAULT_MESSAGES;

  try {
    const apiBase = window.SS_API_URL || 'http://localhost:3000';
    const res = await fetch(apiBase + '/api/settings');
    if (res.ok) {
      const s = await res.json();
      if (s.announcementActive === false) return;
      if (s.announcementBar) {
        messages = s.announcementBar.split(' · ').map(m => m.trim()).filter(Boolean);
        if (!messages.length) messages = DEFAULT_MESSAGES;
      }
    }
  } catch (e) {}

  const bar = document.createElement('div');
  bar.className = 'announcement-bar';
  bar.innerHTML = `
    <span class="announcement-bar-text"></span>
    <button class="announcement-bar-close" aria-label="Close">×</button>
  `;
  document.body.prepend(bar);
  document.body.classList.add('has-bar');

  /* Rotate messages */
  const textEl = bar.querySelector('.announcement-bar-text');
  textEl.textContent = messages[0];
  let idx = 0;
  const rotateInterval = setInterval(() => {
    textEl.style.opacity = '0';
    textEl.style.transform = 'translateY(-6px)';
    setTimeout(() => {
      idx = (idx + 1) % messages.length;
      textEl.textContent = messages[idx];
      textEl.style.transform = 'translateY(6px)';
      requestAnimationFrame(() => {
        textEl.style.opacity = '1';
        textEl.style.transform = 'translateY(0)';
      });
    }, 280);
  }, 3500);

  bar.querySelector('.announcement-bar-close').addEventListener('click', () => {
    clearInterval(rotateInterval);
    bar.style.transition = 'max-height 0.3s ease, opacity 0.3s ease';
    bar.style.maxHeight = bar.scrollHeight + 'px';
    bar.style.overflow = 'hidden';
    requestAnimationFrame(() => { bar.style.maxHeight = '0'; bar.style.opacity = '0'; });
    setTimeout(() => { bar.remove(); document.body.classList.remove('has-bar'); }, 320);
    sessionStorage.setItem('barDismissed', '1');
  });
})();


/* ============================================================
   1. CART SYSTEM (localStorage)
   ============================================================ */
const CART_KEY = 'streetstore_cart';

function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function addToCart(name, price, color, size, imageUrl) {
  const cart = getCart();
  const id = name + '-' + (color || 'default') + '-' + (size || 'OS');
  const existing = cart.find(i => i.id === id);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ id, name, price: parseFloat(price), color: color || 'Dark Wash', size: size || 'M', qty: 1, imageUrl: imageUrl || null });
  }
  saveCart(cart);
  updateCartBadge();
  renderCartItems();
  openCart();
}

function removeFromCart(id) {
  const cart = getCart().filter(i => i.id !== id);
  saveCart(cart);
  updateCartBadge();
  renderCartItems();
}

function updateQty(id, delta) {
  const cart = getCart();
  const item = cart.find(i => i.id === id);
  if (item) {
    item.qty += delta;
    if (item.qty <= 0) {
      removeFromCart(id);
      return;
    }
  }
  saveCart(cart);
  updateCartBadge();
  renderCartItems();
  if (typeof window.renderCheckoutSummary === 'function') window.renderCheckoutSummary();
}

/* ============================================================
   2. CART BADGE UPDATE
   ============================================================ */
function updateCartBadge() {
  const cart = getCart();
  const total = cart.reduce((sum, i) => sum + i.qty, 0);
  document.querySelectorAll('.cart-badge').forEach(el => {
    el.textContent = total;
    el.style.display = total > 0 ? 'flex' : 'none';
  });
  const countEl = document.getElementById('cartCount');
  if (countEl) countEl.textContent = total;
}

/* ============================================================
   3. CART DRAWER — RENDER ITEMS
   ============================================================ */
function resolveCartImage(item) {
  if (item.imageUrl) return item.imageUrl;
  if (typeof PRODUCTS !== 'undefined') {
    // Try exact name match
    const byName = Object.values(PRODUCTS).find(p => p.name === item.name);
    if (byName && byName.image) return byName.image;
    // Try partial name match (case-insensitive)
    const byPartial = Object.values(PRODUCTS).find(p => item.name && p.name && item.name.toLowerCase().includes(p.name.toLowerCase().split(' ')[0]));
    if (byPartial && byPartial.image) return byPartial.image;
  }
  return null;
}

function renderCartItems() {
  let cart = getCart();
  // Patch missing imageUrl into stored cart items
  let patched = false;
  cart.forEach(item => {
    if (!item.imageUrl) {
      const img = resolveCartImage(item);
      if (img) { item.imageUrl = img; patched = true; }
    }
  });
  if (patched) saveCart(cart);

  const container = document.getElementById('cartItems');
  const totalEl = document.getElementById('cartTotal');
  if (!container) return;

  // Show deal offer when exactly 1 item in cart, hide when 2+
  const offerEl = document.getElementById('cartDealOffer');
  if (offerEl) {
    const totalQty = cart.reduce((sum, i) => sum + i.qty, 0);
    offerEl.style.display = (totalQty === 1) ? 'block' : 'none';
  }

  if (cart.length === 0) {
    const emptyTxt  = (typeof t === 'function') ? t('cart_empty')  : 'Your cart is empty.';
    const shopTxt   = (typeof t === 'function') ? t('shop_now_btn'): 'Shop Now';
    container.innerHTML = `<div class="cart-empty"><p>${emptyTxt}</p><a href="shop.html" class="btn-dark">${shopTxt}</a></div>`;
  } else {
    container.innerHTML = cart.map(item => `
      <div class="cart-item">
        <div class="cart-item-img">${(item.imageUrl || getProductImage(item.name)) ? `<img src="${item.imageUrl || getProductImage(item.name)}" style="width:100%;height:100%;object-fit:cover;display:block;">` : `<div style="width:100%;height:100%;background:${getProductColor(item.name)};"></div>`}</div>
        <div>
          <p class="cart-item-name">${escapeHtml(item.name)}</p>
          <p class="cart-item-price">${item.price} MAD &middot; ${escapeHtml(item.size)}</p>
          <div class="cart-item-qty">
            <button onclick='updateQty(${JSON.stringify(item.id)}, -1)'>−</button>
            <span>${item.qty}</span>
            <button onclick='updateQty(${JSON.stringify(item.id)}, 1)'>+</button>
          </div>
        </div>
        <button class="cart-item-remove" onclick='removeFromCart(${JSON.stringify(item.id)})'>✕</button>
      </div>
    `).join('');
  }

  const subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const discount = getPackDiscount(cart);
  const total = subtotal - discount;

  const subtotalEl2 = document.getElementById('cartSubtotal');
  if (subtotalEl2) subtotalEl2.textContent = subtotal + ' MAD';

  const discountRow = document.getElementById('cartPackDiscount');
  const discountAmt = document.getElementById('cartDiscountAmt');
  if (discountRow) discountRow.style.display = discount > 0 ? 'flex' : 'none';
  if (discountAmt) discountAmt.textContent = '-' + discount + ' MAD';

  if (totalEl) totalEl.textContent = total + ' MAD';
}

function getPackDiscount(cart) {
  if (!_packSettings.packEnabled) return 0;
  const totalQty = cart.reduce((sum, i) => sum + i.qty, 0);
  if (totalQty < 2) return 0;
  const subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);

  if (totalQty === 2) {
    // Flat deal price for exactly 2 items
    if (subtotal <= _packSettings.packDeal2) return 0;
    return Math.round(subtotal - _packSettings.packDeal2);
  }

  // 3+ items: derive % discount from the 3-item deal, apply to full subtotal
  // e.g. avg price 179, 3×179=537, packDeal3=479 → 10.8% off → same % applied to 4,5,6... items
  const avgPrice = subtotal / totalQty;
  const refPrice3 = avgPrice * 3;
  if (refPrice3 <= _packSettings.packDeal3) return 0;
  const discountPct = (refPrice3 - _packSettings.packDeal3) / refPrice3;
  return Math.round(subtotal * discountPct);
}

function getProductColor(name) {
  const map = {
    "Patte d'éléphant Jean": '#2a3f65',
    'High-Rise Dark Blue Jeans': '#1a2744',
    'Brown Wide-Leg Jean': '#6b4c2a',
    'Baggy Wide Leg Denim Jeans': '#2d3748',
    'Jean Skirts': '#1e3a5f',
    'Denim Jacket & Wide-Leg Pants Set': '#0f1f3d',
    'Noir Skinny': '#1a1a1a',
    'Sky Wide Leg': '#5b8db8',
  };
  return map[name] || '#2d3748';
}

function getProductImage(name) {
  if (typeof PRODUCTS !== 'undefined') {
    const match = Object.values(PRODUCTS).find(p => p.name === name);
    if (match && match.image) return match.image;
  }
  return null;
}

function productThumbStyle(name) {
  const img = getProductImage(name);
  if (img) return `background: ${getProductColor(name)} url('${img}') center/cover no-repeat;`;
  return `background: ${getProductColor(name)};`;
}

/* ============================================================
   4. CART DRAWER — OPEN / CLOSE
   ============================================================ */
function openCart() {
  const drawer = document.getElementById('cartDrawer');
  const overlay = document.getElementById('cartOverlay');
  if (drawer) drawer.classList.add('open');
  if (overlay) overlay.classList.add('active');
}

function closeCart() {
  const drawer = document.getElementById('cartDrawer');
  const overlay = document.getElementById('cartOverlay');
  if (drawer) drawer.classList.remove('open');
  if (overlay) overlay.classList.remove('active');
}

/* ============================================================
   15. INJECT CART DRAWER HTML
   ============================================================ */
function injectCartDrawer() {
  if (document.getElementById('cartDrawer')) return;
  const html = `
    <div class="cart-overlay" id="cartOverlay"></div>
    <aside class="cart-drawer" id="cartDrawer">
      <div class="cart-header">
        <h3><span data-i18n="your_cart">Your Cart</span> (<span id="cartCount">0</span>)</h3>
        <div style="display:flex;align-items:center;gap:12px;">
          <button id="clearCartBtn" style="font-size:11px;color:#999;background:none;border:none;cursor:pointer;text-decoration:underline;letter-spacing:0.04em;">Clear all</button>
          <button class="cart-close" id="cartClose"><img src="images/icons/close.png" alt="Close" style="width:14px;height:14px;opacity:0.7;"></button>
        </div>
      </div>
      <div class="cart-items" id="cartItems"></div>

      <!-- Deal offer — shown when cart has exactly 1 item -->
      <div class="cart-deal-offer" id="cartDealOffer" style="display:none;">
        <div class="cart-deal-icon">🎁</div>
        <div class="cart-deal-text">
          <p class="cart-deal-title" id="cartDealTitle">${_packSettings.packDealBadge}</p>
          <p class="cart-deal-sub" id="cartDealSub">${_packSettings.packDealSub}</p>
        </div>
        <a href="shop.html" style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--charcoal);white-space:nowrap;text-decoration:none;border-bottom:1px solid var(--charcoal);">Add →</a>
      </div>

      <div class="cart-footer" id="cartFooter">
        <div class="cart-subtotal"><span data-i18n="subtotal">Subtotal</span><span id="cartSubtotal">0 MAD</span></div>
        <div class="cart-pack-discount" id="cartPackDiscount" style="display:none;">
          <span>🎁 Pack Deal Applied</span>
          <span id="cartDiscountAmt">-0 MAD</span>
        </div>
        <div class="cart-subtotal" style="font-weight:700;"><span>Total</span><span id="cartTotal">0 MAD</span></div>
        <p class="cart-shipping-note" data-i18n="free_ship_note">Free shipping on all orders</p>
        <button class="btn-dark" id="checkoutBtn" style="width:100%;padding:16px;border:none;cursor:pointer;font-size:13px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;" data-i18n="checkout_btn">Checkout</button>
        <a href="#" class="btn-text cart-continue" id="continueShopping" data-i18n="continue_shopping">Continue Shopping →</a>
      </div>
    </aside>
  `;
  document.body.insertAdjacentHTML('beforeend', html);

  // Apply translations to injected cart HTML
  if (typeof applyLang === 'function') applyLang(getLang ? getLang() : 'en');
  document.getElementById('cartClose').addEventListener('click', closeCart);
  document.getElementById('clearCartBtn').addEventListener('click', () => {
    saveCart([]);
    updateCartBadge();
    renderCartItems();
  });
  document.getElementById('cartOverlay').addEventListener('click', closeCart);
  document.getElementById('continueShopping').addEventListener('click', e => { e.preventDefault(); closeCart(); });

  document.getElementById('checkoutBtn').addEventListener('click', () => {
    if (getCart().length === 0) return;
    window.location.href = 'checkout.html';
  });
}

/* ============================================================
   5. HEADER SCROLL BEHAVIOR
   ============================================================ */
function initHeaderScroll() {
  const header = document.querySelector('.site-header');
  if (!header) return;
  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 20);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* ============================================================
   4. MOBILE MENU TOGGLE
   ============================================================ */
function initMobileMenu() {
  const hamburger = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobileMenu');
  if (!hamburger || !mobileMenu) return;

  hamburger.addEventListener('click', () => {
    mobileMenu.classList.toggle('open');
    const isOpen = mobileMenu.classList.contains('open');
    hamburger.querySelectorAll('span')[0].style.transform = isOpen ? 'rotate(45deg) translate(4px, 4px)' : '';
    hamburger.querySelectorAll('span')[1].style.opacity = isOpen ? '0' : '';
    hamburger.querySelectorAll('span')[2].style.transform = isOpen ? 'rotate(-45deg) translate(4px, -4px)' : '';
  });

  mobileMenu.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      mobileMenu.classList.remove('open');
      hamburger.querySelectorAll('span').forEach(s => { s.style.transform = ''; s.style.opacity = ''; });
    });
  });
}

/* ============================================================
   6. CART ICON CLICK
   ============================================================ */
function initCartIcon() {
  document.querySelectorAll('.cart-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      openCart();
    });
  });
}

/* ============================================================
   7. SHOP PAGE FILTERS
   ============================================================ */
function initShopFilters() {
  const grid = document.querySelector('.product-grid-3');
  if (!grid) return;

  const BATCH = 10;
  let displayCount = BATCH;
  let lastVisible = [];

  /* ---- Active filter chips ---- */
  function renderActiveFilters(sizes, colors, fit, maxPrice) {
    const container = document.getElementById('activeFilters');
    if (!container) return;
    const chips = [];
    sizes.forEach(s => chips.push({ label: 'Size ' + s, type: 'size', value: s }));
    colors.forEach(c => chips.push({ label: c.charAt(0).toUpperCase() + c.slice(1), type: 'color', value: c }));
    if (fit !== 'all') chips.push({ label: fit.charAt(0).toUpperCase() + fit.slice(1), type: 'fit', value: fit });
    if (parseFloat(maxPrice) < 300) chips.push({ label: 'Max ' + maxPrice + ' MAD', type: 'price', value: maxPrice });

    container.innerHTML = chips.map(chip =>
      `<span class="filter-chip" data-type="${chip.type}" data-value="${chip.value}">${chip.label}<button class="filter-chip-x" aria-label="Remove">×</button></span>`
    ).join('');

    container.querySelectorAll('.filter-chip-x').forEach(btn => {
      btn.addEventListener('click', () => {
        const chip = btn.closest('.filter-chip');
        const type = chip.dataset.type;
        const value = chip.dataset.value;
        if (type === 'size') {
          const cb = document.querySelector(`.filter-size[value="${value}"]`);
          if (cb) cb.checked = false;
        } else if (type === 'color') {
          const cb = document.querySelector(`.filter-color[value="${value}"]`);
          if (cb) cb.checked = false;
          const swatch = document.querySelector(`.color-swatch[data-color="${value}"]`);
          if (swatch) swatch.classList.remove('active');
        } else if (type === 'fit') {
          const allRadio = document.querySelector('.filter-fit[value="all"]');
          if (allRadio) allRadio.checked = true;
        } else if (type === 'price') {
          const pr = document.getElementById('priceRange');
          const pm = document.getElementById('priceMax');
          if (pr) { pr.value = 300; if (pm) pm.textContent = '300 MAD'; }
        }
        displayCount = BATCH;
        applyFilters();
      });
    });
    container.style.display = chips.length ? 'flex' : 'none';
  }

  function applyFilters() {
    const cards = Array.from(grid.querySelectorAll('.product-card'));
    const checkedSizes = Array.from(document.querySelectorAll('.filter-size:checked')).map(i => i.value);
    const checkedColors = Array.from(document.querySelectorAll('.filter-color:checked')).map(i => i.value);
    const checkedFit = document.querySelector('.filter-fit:checked')?.value || 'all';
    const maxPrice = document.getElementById('priceRange')?.value || 300;
    const sort = document.getElementById('sortSelect')?.value || 'featured';

    lastVisible = cards.filter(card => {
      const size = card.dataset.size ? card.dataset.size.split(',') : [];
      const color = card.dataset.color || '';
      const fit = card.dataset.fit || '';
      const price = parseFloat(card.dataset.price) || 0;
      return (checkedSizes.length === 0 || checkedSizes.some(s => size.includes(s)))
        && (checkedColors.length === 0 || checkedColors.includes(color))
        && (checkedFit === 'all' || fit === checkedFit)
        && price <= parseFloat(maxPrice);
    });

    // Sort
    if (sort === 'price-asc') lastVisible.sort((a, b) => parseFloat(a.dataset.price) - parseFloat(b.dataset.price));
    if (sort === 'price-desc') lastVisible.sort((a, b) => parseFloat(b.dataset.price) - parseFloat(a.dataset.price));
    if (sort === 'newest') lastVisible.sort((a, b) => (b.dataset.new ? 1 : 0) - (a.dataset.new ? 1 : 0));

    // Reorder DOM + show/hide
    cards.forEach(c => { c.style.display = 'none'; grid.appendChild(c); });
    lastVisible.forEach((c, i) => { if (i < displayCount) c.style.display = ''; grid.appendChild(c); });

    // Count
    const countEl = document.querySelector('.page-title-bar span');
    if (countEl) countEl.textContent = lastVisible.length + ' products';

    // Empty state
    const emptyEl = document.getElementById('shopEmpty');
    if (emptyEl) emptyEl.style.display = lastVisible.length === 0 ? 'flex' : 'none';

    // Load more
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if (loadMoreBtn) {
      if (lastVisible.length > displayCount) {
        loadMoreBtn.style.display = 'block';
        loadMoreBtn.textContent = 'Load More — ' + (lastVisible.length - displayCount) + ' remaining';
      } else {
        loadMoreBtn.style.display = 'none';
      }
    }

    renderActiveFilters(checkedSizes, checkedColors, checkedFit, maxPrice);
  }

  document.querySelectorAll('.filter-size, .filter-color, .filter-fit').forEach(el =>
    el.addEventListener('change', () => { displayCount = BATCH; applyFilters(); })
  );

  const priceRange = document.getElementById('priceRange');
  const priceMax = document.getElementById('priceMax');
  if (priceRange) {
    priceRange.addEventListener('input', () => {
      if (priceMax) priceMax.textContent = priceRange.value + ' MAD';
      displayCount = BATCH;
      applyFilters();
    });
  }

  const sortSelect = document.getElementById('sortSelect');
  if (sortSelect) sortSelect.addEventListener('change', () => { displayCount = BATCH; applyFilters(); });

  const clearAll = document.querySelector('.clear-all');
  if (clearAll) {
    clearAll.addEventListener('click', () => {
      document.querySelectorAll('.filter-size, .filter-color').forEach(i => i.checked = false);
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
      const allRadio = document.querySelector('.filter-fit[value="all"]');
      if (allRadio) allRadio.checked = true;
      if (priceRange) { priceRange.value = 300; if (priceMax) priceMax.textContent = '300 MAD'; }
      if (sortSelect) sortSelect.value = 'featured';
      displayCount = BATCH;
      applyFilters();
    });
  }

  const loadMoreBtn = document.getElementById('loadMoreBtn');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      displayCount += BATCH;
      applyFilters();
    });
  }

  const emptyClearBtn = document.getElementById('emptyClearBtn');
  if (emptyClearBtn && clearAll) emptyClearBtn.addEventListener('click', () => clearAll.click());

  // Expose so renderShopGrid() can re-apply after async backend updates
  window._shopApplyFilters = applyFilters;
  window._buildColorSwatches = buildColorSwatches;
  window._buildSizeCheckboxes = buildSizeCheckboxes;

  // Initial render pass — sets count, load-more, and hides any out-of-range cards
  applyFilters();
}

/* ============================================================
   8a. SIZE CHECKBOXES (sidebar) — dynamic from products
   ============================================================ */
function buildSizeCheckboxes() {
  const wrap = document.querySelector('.filter-section .filter-checkboxes:has(.filter-size)') ||
    Array.from(document.querySelectorAll('.filter-checkboxes')).find(el => el.querySelector('.filter-size'));
  if (!wrap || typeof PRODUCTS === 'undefined') return;

  // Collect all unique sizes across all products, sorted numerically
  const sizeSet = new Set();
  Object.values(PRODUCTS).forEach(p => {
    if (!p.sizes) return;
    p.sizes.split(',').forEach(s => { s = s.trim(); if (s) sizeSet.add(s); });
  });

  if (!sizeSet.size) return;

  const sorted = Array.from(sizeSet).sort((a, b) => parseFloat(a) - parseFloat(b));

  // Preserve currently checked sizes
  const checked = new Set(
    Array.from(wrap.querySelectorAll('.filter-size:checked')).map(i => i.value)
  );

  wrap.innerHTML = sorted.map(s =>
    `<label><input type="checkbox" class="filter-size" value="${s}"${checked.has(s) ? ' checked' : ''} /> ${s}</label>`
  ).join('');

  // Re-attach change listeners (filter is already listening via event delegation in initShopFilters,
  // but new elements need explicit binding if initShopFilters already ran)
  wrap.querySelectorAll('.filter-size').forEach(cb =>
    cb.addEventListener('change', () => {
      if (typeof window._shopApplyFilters === 'function') window._shopApplyFilters();
    })
  );
}

/* ============================================================
   8. COLOR SWATCH SELECTION (sidebar) — dynamic from products
   ============================================================ */
function buildColorSwatches() {
  const wrap = document.querySelector('.color-swatches');
  if (!wrap || typeof PRODUCTS === 'undefined') return;

  // Collect unique colors from all loaded products
  const seen = {};
  Object.values(PRODUCTS).forEach(p => {
    if (!p.color) return;
    const name = (typeof normalizeColorToName === 'function') ? normalizeColorToName(p.color) : p.color.split(',')[0].trim().toLowerCase();
    if (!name || seen[name]) return;
    // Get display hex: use raw color if hex, else fall back to existing swatch or a grey
    const hex = p.color.trim().startsWith('#') ? p.color.split(',')[0].trim() : null;
    seen[name] = hex || '#888888';
  });

  if (!Object.keys(seen).length) return;

  // Preserve currently active selections
  const activeColors = new Set(
    Array.from(wrap.querySelectorAll('.color-swatch.active')).map(s => s.dataset.color)
  );

  wrap.innerHTML = Object.entries(seen).map(([name, hex]) => {
    const label = name.charAt(0).toUpperCase() + name.slice(1);
    const isActive = activeColors.has(name) ? ' active' : '';
    const border = hex === '#ffffff' || hex === '#f0ede8' || hex === '#e8e8e8' ? 'border:1px solid #ccc;' : '';
    return `<div class="color-swatch${isActive}" style="background:${hex};${border}" title="${label}" data-color="${name}">` +
      `<input type="checkbox" class="filter-color" value="${name}" style="display:none;"${isActive ? ' checked' : ''} /></div>`;
  }).join('');

  // Re-attach click listeners
  initColorSwatches();
}

function initColorSwatches() {
  document.querySelectorAll('.color-swatch[data-color]').forEach(swatch => {
    swatch.addEventListener('click', () => {
      swatch.classList.toggle('active');
      const cb = swatch.querySelector('.filter-color');
      if (cb) {
        cb.checked = swatch.classList.contains('active');
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  });
}

/* ============================================================
   9. PRODUCT PAGE — IMAGE GALLERY
   ============================================================ */
function initGallery() {
  const thumbs = document.querySelectorAll('.gallery-thumb');
  const mainImg = document.querySelector('.gallery-main-img');
  if (!thumbs.length || !mainImg) return;

  thumbs.forEach(thumb => {
    thumb.addEventListener('click', () => {
      thumbs.forEach(t => t.classList.remove('active'));
      thumb.classList.add('active');
      const bg = thumb.querySelector('.gallery-thumb-img');
      if (bg) mainImg.style.background = bg.style.background;
    });
  });
}

/* ============================================================
   10. PRODUCT PAGE — SIZE SELECTOR
   ============================================================ */
function _updateSizeStockHint(btn) {
  const hint = document.getElementById('sizeStockHint');
  if (!hint) return;
  const stock = parseInt(btn && btn.dataset.stock, 10);
  if (stock >= 1 && stock <= 3) {
    hint.textContent = t('size_stock_low').replace('{n}', stock);
    hint.style.display = '';
  } else {
    hint.style.display = 'none';
  }
}

function initSizeSelector() {
  const container = document.querySelector('.size-selector');
  const selectedSizeEl = document.getElementById('selectedSize');
  if (!container) return;
  // Auto-select first size if none is active yet
  const btns = container.querySelectorAll('.size-btn:not(.sold-out)');
  if (btns.length && !container.querySelector('.size-btn.active')) {
    btns[0].classList.add('active');
    if (selectedSizeEl) selectedSizeEl.textContent = btns[0].textContent.trim();
  }
  _updateSizeStockHint(container.querySelector('.size-btn.active'));
  // Use event delegation — one listener on the container, survives innerHTML replacements
  if (container._sizeListenerAttached) return;
  container._sizeListenerAttached = true;
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.size-btn');
    if (!btn || btn.classList.contains('sold-out')) return;
    container.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const sel = document.getElementById('selectedSize');
    if (sel) sel.textContent = btn.textContent.trim();
    _updateSizeStockHint(btn);
  });
}

/* ============================================================
   11. PRODUCT PAGE — ACCORDION
   ============================================================ */
function initAccordion() {
  document.querySelectorAll('.accordion-trigger').forEach(trigger => {
    trigger.addEventListener('click', () => {
      const item = trigger.closest('.accordion-item');
      const body = item.querySelector('.accordion-body');
      const isOpen = item.classList.contains('open');

      // close all
      document.querySelectorAll('.accordion-item').forEach(i => {
        i.classList.remove('open');
        const b = i.querySelector('.accordion-body');
        if (b) b.style.display = 'none';
      });

      if (!isOpen) {
        item.classList.add('open');
        if (body) body.style.display = 'block';
      }
    });
  });
}

/* ============================================================
   11. PRODUCT PAGE — QUANTITY SELECTOR
   ============================================================ */
function initQtySelector() {
  const display = document.querySelector('.qty-display');
  const minusBtn = document.querySelector('.qty-btn.minus');
  const plusBtn = document.querySelector('.qty-btn.plus');
  if (!display) return;
  let qty = 1;

  if (minusBtn) minusBtn.addEventListener('click', () => { if (qty > 1) { qty--; display.textContent = qty; } });
  if (plusBtn) plusBtn.addEventListener('click', () => { qty++; display.textContent = qty; });
}

/* ============================================================
   12. PRODUCT PAGE — ADD TO CART
   ============================================================ */
function initProductAddToCart() {
  const btn = document.querySelector('.add-to-cart-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const name = document.querySelector('.product-name')?.textContent?.trim() || 'Product';
    const priceEl = document.querySelector('.product-price-display');
    const prices = priceEl ? priceEl.textContent.match(/\d+/g) : null;
    const price = prices ? prices[prices.length - 1] : '179';
    const activeSize = document.querySelector('.size-btn.active')?.textContent?.trim() || 'M';
    const qty = parseInt(document.querySelector('.qty-display')?.textContent, 10) || 1;
    const pageProductId = document.body.dataset.product;
    const pageImageUrl = (pageProductId && typeof PRODUCTS !== 'undefined' && PRODUCTS[pageProductId]) ? PRODUCTS[pageProductId].image : null;
    const selectedColor = btn.dataset.color || document.querySelector('.product-swatch.active')?.dataset?.color || document.querySelector('.product-swatch.active')?.title || '';
    for (let i = 0; i < qty; i++) addToCart(name, price, selectedColor, activeSize, pageImageUrl);
  });
}

/* ============================================================
   13. QUICK ADD TO CART (product grid)
   ============================================================ */
function initQuickAdd() {
  document.querySelectorAll('.product-card-quick').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      const card = btn.closest('.product-card');
      const name = card.querySelector('.product-card-name')?.textContent?.trim() || 'Product';
      const price = card.dataset.price || '79';
      const imgEl = card.querySelector('[data-product-img]');
      const productId = imgEl ? imgEl.dataset.productImg : null;
      const imageUrl = (productId && typeof PRODUCTS !== 'undefined' && PRODUCTS[productId]) ? PRODUCTS[productId].image : null;
      const productData = (productId && typeof PRODUCTS !== 'undefined') ? PRODUCTS[productId] : null;
      const firstSize = productData && productData.sizes ? productData.sizes.split(',')[0].trim() : '';
      const firstColor = productData && productData.color ? (typeof parseProductColors !== 'undefined' ? (parseProductColors(productData.color)[0]||{}).label : productData.color.split(',')[0].split(':')[0].trim()) : '';
      addToCart(name, price, firstColor, firstSize, imageUrl);
    });
  });
}

/* ============================================================
   14. CHECKOUT — 3-STEP FORM
   ============================================================ */
function initCheckout() {
  const steps = document.querySelectorAll('.checkout-step');
  const progressSteps = document.querySelectorAll('.progress-step');
  if (!steps.length) return;

  let current = 0;

  function goTo(n) {
    steps.forEach((s, i) => s.classList.toggle('active', i === n));
    progressSteps.forEach((p, i) => {
      p.classList.remove('active', 'done');
      if (i === n) p.classList.add('active');
      if (i < n) p.classList.add('done');
    });
    current = n;
    window.scrollTo(0, 0);

    // Populate info summary when reaching step 2
    if (n === 1) {
      const first   = document.getElementById('info-first')?.value || '';
      const last    = document.getElementById('info-last')?.value || '';
      const address = document.getElementById('info-address')?.value || '';
      const city    = document.getElementById('info-city')?.value || '';
      const country = document.getElementById('info-country')?.value || '';
      const phone   = document.getElementById('info-phone')?.value || '';
      const summary = document.getElementById('infoSummary');
      if (summary) summary.textContent = `${first} ${last} — ${address}, ${city}, ${country} · ${phone}`;
    }
  }

  function validateStep1() {
    const fields = ['info-first','info-last','info-address','info-city'];
    let valid = true;
    fields.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (!el.value.trim()) {
        el.style.borderBottom = '2px solid #c0392b';
        el.style.background = '#fff5f5';
        valid = false;
      } else {
        el.style.borderBottom = '';
        el.style.background = '';
      }
    });
    // Phone validation — required, min 10 digits
    const phoneEl = document.getElementById('info-phone');
    const phoneErr = document.getElementById('phone-error');
    if (phoneEl) {
      const digits = phoneEl.value.replace(/\D/g, '');
      if (digits.length < 10) {
        phoneEl.style.borderBottom = '2px solid #c0392b';
        phoneEl.style.background = '#fff5f5';
        if (phoneErr) phoneErr.style.display = 'block';
        valid = false;
      } else {
        phoneEl.style.borderBottom = '';
        phoneEl.style.background = '';
        if (phoneErr) phoneErr.style.display = 'none';
      }
    }
    return valid;
  }

  document.querySelectorAll('.next-step').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      if (current === 0 && !validateStep1()) return;
      if (current < steps.length - 1) goTo(current + 1);
    });
  });

  document.querySelectorAll('.prev-step').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      if (current > 0) goTo(current - 1);
    });
  });

  // Shipping option toggle
  let shippingCost = 0;
  document.querySelectorAll('.shipping-option').forEach(opt => {
    opt.querySelector('input')?.addEventListener('change', () => {
      document.querySelectorAll('.shipping-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      shippingCost = opt.querySelector('input').value === 'express' ? 15 : 0;
      updateCheckoutTotals(shippingCost);
    });
  });

  // Populate order summary from cart
  const cart = getCart();
  const summaryItems = document.getElementById('checkoutSummaryItems');
  if (summaryItems) {
    if (cart.length === 0) {
      summaryItems.innerHTML = '<p style="font-size:13px;color:var(--gray);padding:12px 0;">Your cart is empty.</p>';
    } else {
      function renderCheckoutSummary() {
        let c = getCart();
        if (!summaryItems) return;
        if (c.length === 0) {
          summaryItems.innerHTML = '<p style="font-size:13px;color:var(--gray);padding:12px 0;">Your cart is empty.</p>';
          updateCheckoutTotals(shippingCost || 0);
          return;
        }
        // Patch missing imageUrl
        let patched = false;
        c.forEach(item => {
          if (!item.imageUrl) {
            const img = resolveCartImage(item);
            if (img) { item.imageUrl = img; patched = true; }
          }
        });
        if (patched) saveCart(c);
        summaryItems.innerHTML = c.map(item => `
          <div class="summary-item">
            <div class="summary-item-img">${(item.imageUrl || getProductImage(item.name)) ? `<img src="${item.imageUrl || getProductImage(item.name)}" style="width:100%;height:100%;object-fit:cover;display:block;">` : `<div style="width:100%;height:100%;background:${getProductColor(item.name)};"></div>`}
              <span class="summary-item-badge">${item.qty}</span>
            </div>
            <div class="summary-item-info">
              <p class="summary-item-name">${escapeHtml(item.name)}</p>
              <p class="summary-item-variant">Size: ${escapeHtml(item.size)}</p>
              <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
                <button onclick='updateQty(${JSON.stringify(item.id)},-1)' style="width:22px;height:22px;border:1px solid #ddd;background:#fff;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;">−</button>
                <span style="font-size:13px;min-width:16px;text-align:center;">${item.qty}</span>
                <button onclick='updateQty(${JSON.stringify(item.id)},1)' style="width:22px;height:22px;border:1px solid #ddd;background:#fff;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;">+</button>
              </div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
              <span class="summary-item-price">${item.price * item.qty} MAD</span>
              <button onclick='removeFromCartCheckout(${JSON.stringify(item.id)})' style="font-size:11px;color:#999;background:none;border:none;cursor:pointer;text-decoration:underline;padding:0;">Remove</button>
            </div>
          </div>
        `).join('');
        updateCheckoutTotals(0);
      }

      window.renderCheckoutSummary = renderCheckoutSummary;
      window.removeFromCartCheckout = function(id) {
        removeFromCart(id);
        renderCheckoutSummary();
        updateCartBadge();
      };

      renderCheckoutSummary();
    }
  }
  updateCheckoutTotals(0);

  goTo(0);
}

function updateCheckoutTotals(shippingCost) {
  const cart = getCart();
  const totalQty = cart.reduce((sum, i) => sum + i.qty, 0);
  const subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const discount = getPackDiscount(cart);
  const couponDiscount = (typeof _appliedCoupon !== 'undefined' && _appliedCoupon) ? Math.round(_appliedCoupon.discount) : 0;
  const total = subtotal - discount - couponDiscount + shippingCost;

  const subtotalEl    = document.getElementById('checkoutSubtotal');
  const shippingEl    = document.getElementById('checkoutShipping');
  const totalEl       = document.getElementById('checkoutTotal');
  const discountRow   = document.getElementById('checkoutDiscountRow');
  const discountEl    = document.getElementById('checkoutDiscount');
  const upsellBanner  = document.getElementById('checkoutUpsellBanner');
  const dealBadge     = document.getElementById('checkoutDealBadge');
  const dealSaving    = document.getElementById('checkoutDealSaving');

  if (subtotalEl) subtotalEl.textContent = subtotal + ' MAD';
  if (shippingEl) shippingEl.textContent = shippingCost > 0 ? shippingCost + ' MAD' : 'Free';
  if (totalEl)    totalEl.textContent    = total + ' MAD';

  // Discount row
  if (discountRow && discountEl) {
    discountRow.style.display = discount > 0 ? '' : 'none';
    discountEl.textContent = '−' + discount + ' MAD';
  }

  // Upsell banner: show when exactly 1 total item in cart, with dynamic saving amount
  if (upsellBanner) {
    upsellBanner.style.display = (totalQty === 1 && subtotal > 0) ? '' : 'none';
    if (totalQty === 1 && cart.length > 0) {
      const potentialSaving = Math.max(0, Math.round(cart[0].price * 2 - _packSettings.packDeal2));
      const tagEl  = document.getElementById('checkoutUpsellTag');
      const descEl = document.getElementById('checkoutUpsellDesc');
      if (tagEl && potentialSaving > 0) tagEl.textContent = '−' + potentialSaving + ' MAD';
    }
  }

  // Deal badge: show when discount is applied
  if (dealBadge) dealBadge.style.display = discount > 0 ? '' : 'none';
  if (dealSaving) dealSaving.textContent = discount + ' MAD';
}

/* ============================================================
   15. NEWSLETTER FORM
   ============================================================ */
function initNewsletter() {
  document.querySelectorAll('.newsletter-form').forEach(form => {
    form.addEventListener('submit', e => {
      e.preventDefault();
      const btn = form.querySelector('button');
      if (btn) { btn.textContent = 'Subscribed ✓'; btn.classList.add('success'); }
    });
  });
}

/* ============================================================
   16. CONTACT FORM
   ============================================================ */
function initContactForm() {
  const form = document.querySelector('.contact-form');
  if (!form) return;
  form.addEventListener('submit', e => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    if (btn) { btn.textContent = 'Sent ✓'; btn.style.background = '#27ae60'; btn.style.borderColor = '#27ae60'; }
  });
}

/* ============================================================
   17. SCROLL REVEAL (IntersectionObserver)
   ============================================================ */
function initScrollReveal() {
  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
    window.reObserveReveal = function() {
      document.querySelectorAll('.reveal:not(.visible)').forEach(el => el.classList.add('visible'));
    };
    return;
  }
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

  // Expose so dynamically-rendered grids can register new .reveal elements
  window.reObserveReveal = function() {
    document.querySelectorAll('.reveal:not(.observed-reveal)').forEach(el => {
      el.classList.add('observed-reveal');
      observer.observe(el);
    });
  };
}

/* ============================================================
   INIT — DOM READY
   ============================================================ */
/* ============================================================
   NEW GALLERY THUMBNAILS — click to switch main image
   ============================================================ */
function initGallerySlider() {
  const sliderEl   = document.getElementById('gallerySlider');
  if (!sliderEl) return;

  const track      = document.getElementById('galleryTrack');
  const prevBtn    = document.getElementById('galleryPrev');
  const nextBtn    = document.getElementById('galleryNext');
  const thumbstrip = document.querySelector('.gallery-thumbstrip');

  // ── Source priority: PRODUCTS[pageId].gallery  >  DOM thumb-items ──
  const pageId = document.body.dataset && document.body.dataset.product;
  let srcs;
  let activeThumbs;

  if (pageId && window.PRODUCTS && PRODUCTS[pageId] && (PRODUCTS[pageId].gallery || []).length) {
    // Build thumb-items dynamically from gallery so any number of images works
    srcs = PRODUCTS[pageId].gallery.filter(Boolean);
    if (thumbstrip) {
      thumbstrip.innerHTML = '';
      srcs.forEach((src, i) => {
        const t = document.createElement('div');
        t.className = 'thumb-item' + (i === 0 ? ' active' : '');
        t.dataset.galleryIndex = i;
        t.dataset.src = src;
        const img = document.createElement('img');
        img.src = src;
        t.appendChild(img);
        thumbstrip.appendChild(t);
      });
    }
    activeThumbs = thumbstrip ? Array.from(thumbstrip.querySelectorAll('.thumb-item')) : [];
  } else {
    // Static product pages: read from pre-built thumb-items in the HTML
    activeThumbs = Array.from(document.querySelectorAll('.thumb-item'));
    srcs = activeThumbs.map(t =>
      t.dataset.src || t.querySelector('img')?.getAttribute('src') || null
    ).filter(Boolean);
  }

  if (!srcs.length) {
    if (prevBtn) prevBtn.style.display = 'none';
    if (nextBtn) nextBtn.style.display = 'none';
    return;
  }

  // Clear any previous slides/dots (safe to re-init)
  track.innerHTML = '';
  const existingDots = sliderEl.parentElement.querySelector('.gallery-dot-row');
  if (existingDots) existingDots.remove();

  // Build slides
  srcs.forEach(src => {
    const slide = document.createElement('div');
    slide.className = 'gallery-slide';
    const img = document.createElement('img');
    img.src = src;
    img.draggable = false;
    slide.appendChild(img);
    track.appendChild(slide);
  });

  // Build dot row
  const dotsRow = document.createElement('div');
  dotsRow.className = 'gallery-dot-row';
  srcs.forEach((_, i) => {
    const dot = document.createElement('span');
    dot.className = 'gallery-dot' + (i === 0 ? ' active' : '');
    dot.addEventListener('click', () => goTo(i));
    dotsRow.appendChild(dot);
  });
  sliderEl.insertAdjacentElement('afterend', dotsRow);

  let current = 0;

  function goTo(idx) {
    current = (idx + srcs.length) % srcs.length;
    track.style.transform = `translateX(-${current * 100}%)`;
    dotsRow.querySelectorAll('.gallery-dot').forEach((d, i) => d.classList.toggle('active', i === current));
    activeThumbs.forEach((t, i) => t.classList.toggle('active', i === current));
  }

  if (prevBtn) prevBtn.addEventListener('click', () => goTo(current - 1));
  if (nextBtn) nextBtn.addEventListener('click', () => goTo(current + 1));

  activeThumbs.forEach((thumb, i) => thumb.addEventListener('click', () => goTo(i)));

  let touchX = 0;
  sliderEl.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
  sliderEl.addEventListener('touchend', e => {
    const delta = touchX - e.changedTouches[0].clientX;
    if (Math.abs(delta) > 40) goTo(delta > 0 ? current + 1 : current - 1);
  });

  if (srcs.length <= 1) {
    if (prevBtn) prevBtn.style.display = 'none';
    if (nextBtn) nextBtn.style.display = 'none';
  }

  goTo(0);
}

/* ============================================================
   PRODUCT VIDEO — reveal images after video ends
   ============================================================ */
function initProductVideo() {
  const video      = document.getElementById('productVideo');
  const videoWrap  = document.getElementById('galleryVideoWrap');
  const imagesWrap = document.getElementById('galleryImagesWrap');
  const skipBtn    = document.getElementById('videoSkipBtn');

  if (!video || !videoWrap || !imagesWrap) return;

  function revealImages() {
    videoWrap.style.transition = 'opacity 0.5s ease';
    videoWrap.style.opacity = '0';
    setTimeout(() => {
      videoWrap.style.display = 'none';
      imagesWrap.classList.add('reveal-images');
    }, 500);
  }

  video.addEventListener('ended', revealImages);
  video.addEventListener('error', revealImages);
  video.addEventListener('stalled', function() { setTimeout(revealImages, 2000); });
  // Auto-skip if video hasn't started playing within 4 seconds (missing file, mobile block, slow network)
  var videoTimeout = setTimeout(revealImages, 4000);
  video.addEventListener('playing', function() { clearTimeout(videoTimeout); }, { once: true });
  if (skipBtn) skipBtn.addEventListener('click', revealImages);
}

/* ============================================================
   WISHLIST TOGGLE
   ============================================================ */
function initWishlist() {
  document.querySelectorAll('.wishlist-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      const active = btn.classList.toggle('active');
      btn.textContent = active ? '♥' : '♡';
      btn.style.color = active ? '#e74c3c' : '';
    });
  });
}

/* ============================================================
   SEARCH OVERLAY
   ============================================================ */
function initSearch() {
  const searchBtns = document.querySelectorAll('.nav-icon-btn[aria-label="Search"]');
  if (!searchBtns.length) return;

  // Create overlay once
  if (!document.getElementById('searchOverlay')) {
    const overlay = document.createElement('div');
    overlay.id = 'searchOverlay';
    overlay.innerHTML = `
      <div id="searchBox">
        <input id="searchInput" type="text" placeholder="Search products…" autocomplete="off">
        <button id="searchClose" aria-label="Close">✕</button>
      </div>
      <div id="searchResults"></div>
    `;
    overlay.style.cssText = 'display:none;position:fixed;inset:0;z-index:2000;background:rgba(6,13,26,0.92);padding:120px 40px 40px;';
    overlay.querySelector('#searchBox').style.cssText = 'max-width:600px;margin:0 auto;display:flex;gap:12px;align-items:center;border-bottom:1.5px solid rgba(255,255,255,0.2);padding-bottom:16px;';
    overlay.querySelector('#searchInput').style.cssText = 'flex:1;background:none;border:none;outline:none;color:#fff;font-size:24px;font-family:inherit;';
    overlay.querySelector('#searchClose').style.cssText = 'background:none;border:none;color:#fff;font-size:20px;cursor:pointer;opacity:0.6;';
    overlay.querySelector('#searchResults').style.cssText = 'max-width:600px;margin:24px auto 0;';
    document.body.appendChild(overlay);

    // Product data for search
    const allProducts = typeof PRODUCTS !== 'undefined' ? Object.values(PRODUCTS) : [];

    overlay.querySelector('#searchInput').addEventListener('input', function() {
      const q = this.value.toLowerCase().trim();
      const res = overlay.querySelector('#searchResults');
      if (!q) { res.innerHTML = ''; return; }
      const matches = allProducts.filter(p => p.name.toLowerCase().includes(q));
      res.innerHTML = matches.length
        ? matches.map(p => `<a href="${p.href}" style="display:flex;align-items:center;gap:16px;padding:14px 0;border-bottom:1px solid rgba(255,255,255,0.08);color:#fff;text-decoration:none;">
            <div style="width:48px;height:48px;background:${getProductColor(p.name)};flex-shrink:0;border-radius:4px;${p.image ? `background-image:url(${p.image});background-size:cover;` : ''}"></div>
            <div><p style="font-size:14px;font-weight:600;margin:0;">${escapeHtml(p.name)}</p><p style="font-size:12px;color:rgba(255,255,255,0.45);margin:2px 0 0;">${p.price} MAD</p></div>
          </a>`).join('')
        : '<p style="color:rgba(255,255,255,0.4);font-size:14px;padding-top:8px;">No products found.</p>';
    });

    overlay.querySelector('#searchClose').addEventListener('click', () => { overlay.style.display = 'none'; document.body.style.overflow = ''; });
    overlay.addEventListener('click', e => { if (e.target === overlay) { overlay.style.display = 'none'; document.body.style.overflow = ''; } });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { overlay.style.display = 'none'; document.body.style.overflow = ''; } });
  }

  searchBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const overlay = document.getElementById('searchOverlay');
      overlay.style.display = 'block';
      document.body.style.overflow = 'hidden';
      setTimeout(() => overlay.querySelector('#searchInput').focus(), 50);
    });
  });
}

/* ============================================================
   PLACE ORDER — clear cart and save order to localStorage
   ============================================================ */
function initPlaceOrder() {
  const placeOrderBtn = document.querySelector('.place-order-btn');
  if (!placeOrderBtn) return;
  placeOrderBtn.addEventListener('click', async e => {
    e.preventDefault();

    // Gather form fields
    const firstName = (document.getElementById('info-first')?.value || '').trim();
    const lastName  = (document.getElementById('info-last')?.value  || '').trim();
    const customer  = (firstName + ' ' + lastName).trim() || firstName || lastName;
    const phone     = (document.getElementById('info-phone')?.value   || '').trim();
    const city      = (document.getElementById('info-city')?.value    || '').trim();
    const address   = (document.getElementById('info-address')?.value || '').trim();

    if (!customer) { alert('Please enter your name.'); return; }
    if (!phone || phone.replace(/\D/g,'').length < 9) { alert('Please enter a valid phone number.'); return; }
    if (!city) { alert('Please enter your city.'); return; }

    const cart = getCart();
    if (!cart.length) { alert('Your cart is empty.'); return; }

    const packDiscount   = getPackDiscount(cart);
    const couponDiscount = (typeof _appliedCoupon !== 'undefined' && _appliedCoupon) ? Math.round(_appliedCoupon.discount) : 0;
    const subtotal       = cart.reduce((s, i) => s + i.price * i.qty, 0);
    const total          = Math.max(0, subtotal - packDiscount - couponDiscount);
    const couponCode     = (typeof _appliedCoupon !== 'undefined' && _appliedCoupon) ? _appliedCoupon.code : null;

    const items = cart.map(i => ({ name: i.name, size: i.size || null, qty: i.qty, price: i.price }));

    placeOrderBtn.disabled = true;
    placeOrderBtn.textContent = 'Placing order...';

    const BACKEND_URL = typeof STREETSTORE_BACKEND !== 'undefined' ? STREETSTORE_BACKEND : 'http://localhost:3000';

    try {
      const _orderHeaders = { 'Content-Type': 'application/json' };
      const _customerToken = localStorage.getItem('ss_customer_token');
      if (_customerToken) _orderHeaders['Authorization'] = `Bearer ${_customerToken}`;
      const resp = await fetch(BACKEND_URL + '/api/orders', {
        method: 'POST',
        headers: _orderHeaders,
        body: JSON.stringify({ customer, phone, city, address, items, total, discount: packDiscount + couponDiscount, couponCode }),
      });

      if (resp.status === 403) {
        const data = await resp.json().catch(() => ({}));
        alert(data.message || 'Your access has been blocked.');
        placeOrderBtn.disabled = false;
        placeOrderBtn.textContent = 'Place Order →';
        return;
      }

      if (resp.ok) {
        const orderData = await resp.json().catch(() => ({}));
        localStorage.setItem('streetstore_last_order', JSON.stringify(cart));
        localStorage.setItem('streetstore_last_order_total', total);
        if (couponCode) localStorage.setItem('streetstore_last_coupon', couponCode);
        if (orderData.orderId) localStorage.setItem('ss_guest_order_id', orderData.orderId);
        saveCart([]);
        updateCartBadge();
        window.location.href = 'thankyou.html';
        return;
      }

      throw new Error('Server error');
    } catch (err) {
      console.error('Order error:', err);
      placeOrderBtn.disabled = false;
      placeOrderBtn.textContent = 'Place Order →';
      alert('Could not place order. Please try again.');
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  injectCartDrawer();
  updateCartBadge();
  renderCartItems();
  initHeaderScroll();
  initMobileMenu();
  initCartIcon();
  buildSizeCheckboxes();
  buildColorSwatches();
  initShopFilters();
  initGallery();
  initSizeSelector();
  initAccordion();
  initQtySelector();
  initProductAddToCart();
  initQuickAdd();
  initCheckout();
  initNewsletter();
  initContactForm();
  initScrollReveal();
  initProductVideo();
  initGallerySlider();
  initWishlist();
  initSearch();
  initPlaceOrder();

  // Auto-open cart if redirected from checkout "return to cart"
  if (new URLSearchParams(window.location.search).get('opencart') === '1') {
    setTimeout(openCart, 300);
    history.replaceState({}, '', window.location.pathname);
  }
});

/* ============================================================
   BUY NOW — Quick Order Modal
   ============================================================ */
(function () {
  const addBtn = document.querySelector('.add-to-cart-btn');
  if (!addBtn) return;

  /* ── Inject Buy Now button ── */
  const buyBtn = document.createElement('button');
  buyBtn.className = 'buy-now-btn';
  buyBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Buy Now';
  addBtn.insertAdjacentElement('afterend', buyBtn);

  /* ── Inject modal ── */
  const WA_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';

  const overlay = document.createElement('div');
  overlay.id = 'buyNowOverlay';
  overlay.className = 'buynow-overlay';
  overlay.innerHTML = `
    <div class="buynow-modal" id="buyNowModal">
      <button class="buynow-close" id="buyNowClose" aria-label="Close">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>

      <p class="buynow-title">Quick Order</p>

      <div class="buynow-summary">
        <div class="buynow-summary-name" id="bnSummaryName"></div>
        <div class="buynow-summary-meta" id="bnSummaryMeta"></div>
        <div class="buynow-summary-price" id="bnSummaryPrice"></div>
      </div>

      <div class="buynow-upsell" id="buyNowUpsell">
        <span class="buynow-upsell-icon">💡</span>
        <div>
          <strong>Save more — grab a 2nd item!</strong>
          <span>2 items → <b>${_packSettings.packDeal2} MAD</b> &nbsp;·&nbsp; 3 items → <b>${_packSettings.packDeal3} MAD</b></span>
        </div>
      </div>

      <form class="buynow-form" id="buyNowForm" novalidate>
        <div class="buynow-field">
          <label for="bnName">Full Name</label>
          <input type="text" id="bnName" placeholder="Your full name" required autocomplete="name">
        </div>
        <div class="buynow-field">
          <label for="bnPhone">Phone Number</label>
          <input type="tel" id="bnPhone" placeholder="06 XX XX XX XX" required autocomplete="tel">
        </div>
        <div class="buynow-field">
          <label for="bnCity">City</label>
          <input type="text" id="bnCity" placeholder="Your city" required autocomplete="address-level2">
        </div>
        <div class="buynow-field">
          <label for="bnAddress">Address</label>
          <input type="text" id="bnAddress" placeholder="Street / neighbourhood" required autocomplete="street-address">
        </div>
        <button type="submit" class="buynow-submit"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="20 6 9 17 4 12"/></svg> Confirm Order</button>
      </form>
      <div style="display:flex;align-items:center;gap:10px;margin:12px 0 4px"><hr style="flex:1;border:none;border-top:1px solid #e5e0d8"><span style="color:#999;font-size:12px">or</span><hr style="flex:1;border:none;border-top:1px solid #e5e0d8"></div>
      <button type="button" id="bnWhatsAppBtn" style="width:100%;padding:13px;background:#25D366;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">${WA_SVG} Order via WhatsApp</button>
    </div>
  `;
  document.body.appendChild(overlay);

  /* ── Helpers ── */
  let _bnSelectedColor = '';

  function getProductData() {
    const name = document.querySelector('.product-name')?.textContent?.trim() || '';
    const activeSize = document.querySelector('.size-btn.active');
    const size = activeSize ? activeSize.textContent.trim() : 'Not selected';
    const qty = parseInt(document.querySelector('.qty-display')?.textContent || '1', 10);
    const priceEl = document.querySelector('.product-price-display');
    let price = '';
    if (priceEl) {
      const clone = priceEl.cloneNode(true);
      clone.querySelector('.original')?.remove();
      price = clone.textContent.trim();
    }
    const activeSwatch = document.querySelector('.product-swatch.active');
    const color = activeSwatch?.dataset?.color || activeSwatch?.title || '';
    return { name, size, qty, price, color };
  }

  function openModal() {
    const { name, size, qty, price, color } = getProductData();
    _bnSelectedColor = color;
    document.getElementById('bnSummaryName').textContent = name;
    document.getElementById('bnSummaryMeta').textContent = `Size: ${size}  ·  Qty: ${qty}`;
    document.getElementById('bnSummaryPrice').textContent = price;
    document.getElementById('buyNowUpsell').style.display = qty === 1 ? 'flex' : 'none';
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    if (window.fillDetectedCity) window.fillDetectedCity();
    setTimeout(() => {
      if (window._initCityInput) window._initCityInput(document.getElementById('bnCity'));
      document.getElementById('bnName').focus();
    }, 100);
  }

  function closeModal() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  /* ── Events ── */
  buyBtn.addEventListener('click', openModal);
  document.getElementById('buyNowClose').addEventListener('click', closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  document.getElementById('bnWhatsAppBtn').addEventListener('click', () => {
    const { name, size, qty, price } = getProductData();
    const cName  = document.getElementById('bnName').value.trim();
    const cPhone = document.getElementById('bnPhone').value.trim();
    const cCity  = document.getElementById('bnCity').value.trim();
    const cAddr  = document.getElementById('bnAddress').value.trim();
    const meta   = `Size: ${size}  ·  Qty: ${qty}`;
    const lines  = [
      '🛍️ *New Order — StreetStore*', '',
      `📦 *Product:* ${name}`, `📐 *${meta}*`, `💰 *Price:* ${price}`, '',
      `👤 *Name:* ${cName || '—'}`, `📞 *Phone:* ${cPhone || '—'}`, `🏙️ *City:* ${cCity || '—'}`,
      cAddr ? `📍 *Address:* ${cAddr}` : null,
    ].filter(Boolean).join('\n');
    const adminSettings = JSON.parse(localStorage.getItem('admin_settings') || '{}');
    const waNumber = adminSettings.waNumber || '212771152186';
    window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(lines)}`, '_blank');
    closeModal();
  });

  document.getElementById('buyNowForm').addEventListener('submit', async e => {
    e.preventDefault();
    const name    = document.getElementById('bnSummaryName').textContent;
    const meta    = document.getElementById('bnSummaryMeta').textContent;
    const price   = document.getElementById('bnSummaryPrice').textContent;
    const cName   = document.getElementById('bnName').value.trim();
    const cPhone  = document.getElementById('bnPhone').value.trim();
    const cCity   = document.getElementById('bnCity').value.trim();
    const cAddr   = document.getElementById('bnAddress').value.trim();

    if (!cName || !cPhone || !cCity || !cAddr) return;

    // Parse size and qty from summary meta ("Size: S  ·  Qty: 2")
    const metaParts = meta.split('·');
    const orderSize = (metaParts[0] || '').replace('Size:', '').trim();
    const orderQty  = parseInt((metaParts[1] || '1').replace('Qty:', '').trim(), 10) || 1;

    const orderData = {
      product: name, size: orderSize, qty: orderQty, price,
      customer: cName, phone: cPhone, city: cCity, address: cAddr,
    };

    // ── Try backend bot first (auto WhatsApp message to customer) ──
    const BACKEND_URL = typeof STREETSTORE_BACKEND !== 'undefined' ? STREETSTORE_BACKEND : null;

    if (BACKEND_URL) {
      try {
        const _bnHeaders = { 'Content-Type': 'application/json' };
        const _bnToken = localStorage.getItem('ss_customer_token');
        if (_bnToken) _bnHeaders['Authorization'] = `Bearer ${_bnToken}`;
        const resp = await fetch(BACKEND_URL + '/api/orders', {
          method: 'POST',
          headers: _bnHeaders,
          body: JSON.stringify(orderData),
        });
        if (resp.status === 403) {
          // Blocked customer — show explanation, do NOT fall through to WhatsApp
          const data = await resp.json().catch(() => ({}));
          const msg = data.message || 'Your access has been blocked. Please contact us on WhatsApp.';
          const submitBtn = document.getElementById('buyNowForm').querySelector('.buynow-submit');
          submitBtn.textContent = '🚫 Order blocked';
          submitBtn.style.background = '#8b0000';
          submitBtn.disabled = true;
          // Show explanation below the button
          let errBox = document.getElementById('blockedErrorMsg');
          if (!errBox) {
            errBox = document.createElement('p');
            errBox.id = 'blockedErrorMsg';
            errBox.style.cssText = 'color:#8b0000;font-size:13px;margin-top:12px;text-align:center;line-height:1.5;padding:10px 14px;background:#fff5f5;border-radius:6px;border:1px solid #f5c6cb';
            submitBtn.parentNode.insertBefore(errBox, submitBtn.nextSibling);
          }
          errBox.textContent = msg;
          return; // hard stop — no WhatsApp fallback
        }
        if (resp.ok) {
          const data = await resp.json().catch(() => ({}));
          const guestOrderId = data.orderId || data.id;
          if (guestOrderId) localStorage.setItem('ss_guest_order_id', guestOrderId);
          const numericPrice = parseFloat(String(price).replace(/[^\d.]/g, '')) || 0;
          localStorage.setItem('streetstore_last_order', JSON.stringify([{ name, size: orderSize, color: _bnSelectedColor, qty: orderQty, price: numericPrice }]));
          localStorage.setItem('streetstore_last_order_total', String(numericPrice * orderQty));
          window.location.href = 'thankyou.html';
          return;
        }
      } catch (_) { /* fall through to WhatsApp fallback */ }
    }

    // ── Fallback: save to localStorage ──
    const orders = JSON.parse(localStorage.getItem('ss_orders') || '[]');
    orders.unshift({
      id: Date.now(), date: new Date().toISOString(), status: 'new', ...orderData
    });
    localStorage.setItem('ss_orders', JSON.stringify(orders));

    const numericPriceFb = parseFloat(String(price).replace(/[^\d.]/g, '')) || 0;
    localStorage.setItem('streetstore_last_order', JSON.stringify([{ name, size: orderSize, color: _bnSelectedColor, qty: orderQty, price: numericPriceFb }]));
    localStorage.setItem('streetstore_last_order_total', String(numericPriceFb * orderQty));
    const fallbackId = Date.now();
    localStorage.setItem('ss_guest_order_id', fallbackId);
    window.location.href = 'thankyou.html';
  });
})();

/* ═══════════════════════════════════════════════════════════════
   BUNDLE PICKER — Buy 3 for X MAD
   ═══════════════════════════════════════════════════════════════ */

var _bundleProducts = null;
var _bundleSlots = [null, null, null];
var _bundleCurrentProduct = null;
var _bosSelectedColor = null;
var _bosSelectedSize = null;

var _BUNDLE_COLOR_NAMES = {
  '#0f1f3d':'Navy','#1e3a5f':'Dark Blue','#2980b9':'Blue','#1a1a1a':'Black',
  '#333333':'Charcoal','#8b6347':'Caramel','#6b4e30':'Brown','#c0392b':'Red',
  '#e67e22':'Orange','#e0c97a':'Gold','#f5f0e8':'Cream','#ffffff':'White',
  '#dcdfe5':'Lt Gray','#888888':'Gray','#1e4a2e':'Green','#8b0000':'Burgundy'
};
function bundleColorName(hex) {
  if (!hex) return '';
  return _BUNDLE_COLOR_NAMES[hex.toLowerCase()] || hex.toUpperCase();
}

function openBundlePicker() {
  if (!_bundleSettings.bundle3Enabled) return;
  _bundleSlots = [null, null, null];
  _bundleCurrentProduct = null;
  var overlay = document.createElement('div');
  overlay.id = 'bundlePickerOverlay';
  overlay.innerHTML = `
    <div id="bundlePicker">
      <div class="bundle-header">
        <button class="bundle-close" onclick="closeBundlePicker()">✕</button>
        <div>
          <h2 class="bundle-title">Build Your Bundle</h2>
          <p class="bundle-subtitle">Pick any 3 — <strong>${_bundleSettings.bundle3Price} MAD</strong></p>
        </div>
      </div>
      <div class="bundle-slots">
        <div class="bundle-slot empty" id="bundleSlot0"><div class="bundle-slot-inner"><span class="bundle-slot-plus">+</span></div><span class="bundle-slot-num">1</span></div>
        <div class="bundle-slot empty" id="bundleSlot1"><div class="bundle-slot-inner"><span class="bundle-slot-plus">+</span></div><span class="bundle-slot-num">2</span></div>
        <div class="bundle-slot empty" id="bundleSlot2"><div class="bundle-slot-inner"><span class="bundle-slot-plus">+</span></div><span class="bundle-slot-num">3</span></div>
      </div>
      <div class="bundle-grid-area">
        <p class="bundle-grid-label">Choose your jeans</p>
        <div class="bundle-product-grid" id="bundleProductGrid"><div class="bundle-loading">Loading\u2026</div></div>
      </div>
      <div class="bundle-options-sheet" id="bundleOptionsSheet">
        <div class="bos-header">
          <p class="bos-product-name" id="bosProductName"></p>
          <button class="bos-close" onclick="closeBundleOptions()">✕</button>
        </div>
        <div id="bosColorSection"></div>
        <div id="bosSizeSection"></div>
        <button class="bos-add-btn" onclick="confirmBundleAdd()">Add to Bundle \u2192</button>
      </div>
      <div class="bundle-footer">
        <div class="bundle-footer-info"><span id="bundleSelectedCount">0</span> of 3 selected</div>
        <button class="bundle-checkout-btn" id="bundleCheckoutBtn" disabled onclick="openBundleCheckout()">Checkout \u2014 ${_bundleSettings.bundle3Price} MAD</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  overlay.addEventListener('click', function(e) { if (e.target === overlay) closeBundlePicker(); });
  requestAnimationFrame(function() { overlay.classList.add('active'); });
  loadBundleProducts();
}

function closeBundlePicker() {
  var ov = document.getElementById('bundlePickerOverlay');
  if (!ov) return;
  ov.classList.remove('active');
  setTimeout(function() { ov.remove(); document.body.style.overflow = ''; }, 300);
}

async function loadBundleProducts() {
  if (_bundleProducts) { renderBundleGrid(_bundleProducts); return; }
  try {
    var API = (typeof STREETSTORE_BACKEND !== 'undefined') ? STREETSTORE_BACKEND : 'http://localhost:3000';
    var r = await fetch(API + '/api/products');
    _bundleProducts = await r.json();
    renderBundleGrid(_bundleProducts);
  } catch(e) {
    var g = document.getElementById('bundleProductGrid');
    if (g) g.innerHTML = '<p style="text-align:center;color:#888;padding:40px">Could not load products</p>';
  }
}

function renderBundleGrid(products) {
  var grid = document.getElementById('bundleProductGrid');
  if (!grid) return;
  var available = products.filter(function(p) {
    if (!p.variants || !p.variants.length) return true;
    return p.variants.some(function(v) { return v.inStock; });
  });
  if (!available.length) {
    grid.innerHTML = '<p style="text-align:center;color:#888;padding:40px">No products available</p>';
    return;
  }
  grid.innerHTML = available.map(function(p) {
    var mainImg = (p.images || []).find(function(i) { return i.isMain; }) || (p.images || [])[0];
    var imgEl = mainImg
      ? '<img src="' + mainImg.url + '" alt="" class="bundle-card-img" onerror="this.style.display=\'none\'">'
      : '<div class="bundle-card-img-placeholder">\uD83D\uDC56</div>';
    return '<div class="bundle-product-card" onclick="showBundleOptions(\'' + p.id + '\')">'
      + '<div class="bundle-card-img-wrap">' + imgEl + '</div>'
      + '<div class="bundle-card-info"><p class="bundle-card-name">' + p.name + '</p>'
      + '<p class="bundle-card-price">' + p.price + ' MAD each</p></div></div>';
  }).join('');
}

function showBundleOptions(productId) {
  var products = _bundleProducts || [];
  var p = products.find(function(x) { return x.id === productId; });
  if (!p) return;
  _bundleCurrentProduct = p;
  var colors = p.color ? p.color.split(',').map(function(c) { return c.trim(); }).filter(Boolean) : [];
  var sizes = (p.variants || []).filter(function(v) { return v.inStock; }).map(function(v) { return v.size; }).filter(Boolean);
  _bosSelectedColor = colors[0] || null;
  _bosSelectedSize = sizes[0] || null;
  var sheet = document.getElementById('bundleOptionsSheet');
  document.getElementById('bosProductName').textContent = p.name;
  var cs = document.getElementById('bosColorSection');
  if (colors.length) {
    cs.innerHTML = '<div class="bos-section"><p class="bos-label">Color: <span id="bosColorLabel">' + bundleColorName(colors[0]) + '</span></p>'
      + '<div class="bos-colors">' + colors.map(function(hex, i) {
          return '<div class="bos-swatch' + (i===0?' selected':'') + '" data-hex="' + hex + '" style="background:' + hex + '" title="' + bundleColorName(hex) + '" onclick="bosPickColor(this)"></div>';
        }).join('') + '</div></div>';
    cs.style.display = '';
  } else { cs.innerHTML = ''; cs.style.display = 'none'; }
  var ss = document.getElementById('bosSizeSection');
  if (sizes.length) {
    ss.innerHTML = '<div class="bos-section"><p class="bos-label">Size</p>'
      + '<div class="bos-sizes">' + sizes.map(function(sz, i) {
          return '<button class="bos-size' + (i===0?' selected':'') + '" onclick="bosPickSize(this)">' + sz + '</button>';
        }).join('') + '</div></div>';
    ss.style.display = '';
  } else { ss.innerHTML = ''; ss.style.display = 'none'; }
  sheet.classList.add('active');
}

function closeBundleOptions() {
  var sheet = document.getElementById('bundleOptionsSheet');
  if (sheet) sheet.classList.remove('active');
  _bundleCurrentProduct = null;
}

function bosPickColor(el) {
  el.closest('.bos-colors').querySelectorAll('.bos-swatch').forEach(function(s) { s.classList.remove('selected'); });
  el.classList.add('selected');
  _bosSelectedColor = el.dataset.hex;
  var lbl = document.getElementById('bosColorLabel');
  if (lbl) lbl.textContent = bundleColorName(el.dataset.hex);
}

function bosPickSize(el) {
  el.closest('.bos-sizes').querySelectorAll('.bos-size').forEach(function(b) { b.classList.remove('selected'); });
  el.classList.add('selected');
  _bosSelectedSize = el.textContent.trim();
}

function confirmBundleAdd() {
  if (!_bundleCurrentProduct) return;
  var slotIdx = _bundleSlots.findIndex(function(s) { return s === null; });
  if (slotIdx === -1) {
    closeBundleOptions();
    bundleShowToast('All 3 slots filled. Tap a slot to remove.');
    return;
  }
  var p = _bundleCurrentProduct;
  var mainImg = (p.images || []).find(function(i) { return i.isMain; }) || (p.images || [])[0];
  _bundleSlots[slotIdx] = { id: p.id, name: p.name, color: _bosSelectedColor, size: _bosSelectedSize, price: p.price, image: mainImg ? mainImg.url : null };
  closeBundleOptions();
  updateBundleSlots();
  updateBundleFooter();
}

function bundleSlotClick(idx) {
  if (_bundleSlots[idx]) { _bundleSlots[idx] = null; updateBundleSlots(); updateBundleFooter(); }
}

function updateBundleSlots() {
  for (var i = 0; i < 3; i++) {
    var el = document.getElementById('bundleSlot' + i);
    if (!el) continue;
    var slot = _bundleSlots[i];
    if (slot) {
      var meta = [slot.color ? bundleColorName(slot.color) : null, slot.size].filter(Boolean).join(' / ');
      el.className = 'bundle-slot filled';
      (function(idx) { el.onclick = function() { bundleSlotClick(idx); }; })(i);
      el.innerHTML = (slot.image ? '<img src="' + slot.image + '" alt="" class="bundle-slot-img">' : '<div class="bundle-slot-placeholder">\uD83D\uDC56</div>')
        + '<div class="bundle-slot-overlay"><p class="bundle-slot-name">' + slot.name + '</p>' + (meta ? '<p class="bundle-slot-meta">' + meta + '</p>' : '') + '</div>'
        + '<button class="bundle-slot-remove" onclick="event.stopPropagation();bundleSlotClick(' + i + ')">\u2715</button>'
        + '<span class="bundle-slot-num">' + (i+1) + '</span>';
    } else {
      el.className = 'bundle-slot empty';
      el.onclick = null;
      el.innerHTML = '<div class="bundle-slot-inner"><span class="bundle-slot-plus">+</span></div><span class="bundle-slot-num">' + (i+1) + '</span>';
    }
  }
}

function updateBundleFooter() {
  var filled = _bundleSlots.filter(Boolean).length;
  var c = document.getElementById('bundleSelectedCount');
  var btn = document.getElementById('bundleCheckoutBtn');
  if (c) c.textContent = filled;
  if (btn) btn.disabled = filled < 3;
}

function bundleShowToast(msg) {
  var picker = document.getElementById('bundlePicker');
  if (!picker) return;
  var t = document.createElement('div');
  t.className = 'bundle-toast';
  t.textContent = msg;
  picker.appendChild(t);
  requestAnimationFrame(function() { t.classList.add('show'); });
  setTimeout(function() { t.classList.remove('show'); setTimeout(function() { t.remove(); }, 300); }, 2500);
}

function openBundleCheckout() {
  if (_bundleSlots.filter(Boolean).length < 3) return;
  var checkoutEl = document.createElement('div');
  checkoutEl.id = 'bundleCheckoutOverlay';
  var itemsHtml = _bundleSlots.map(function(s) {
    var meta = [s.color ? bundleColorName(s.color) : null, s.size].filter(Boolean).join(' / ');
    return '<div class="bco-item">' + (s.image ? '<img src="' + s.image + '" alt="" class="bco-item-img">' : '<div class="bco-item-img-ph">\uD83D\uDC56</div>')
      + '<div class="bco-item-info"><p class="bco-item-name">' + s.name + '</p>' + (meta ? '<p class="bco-item-meta">' + meta + '</p>' : '') + '</div></div>';
  }).join('');
  checkoutEl.innerHTML = `
    <div id="bundleCheckoutModal">
      <div class="bco-header">
        <button class="bco-back" onclick="closeBundleCheckout()">\u2190 Back</button>
        <h2 class="bco-title">Bundle Checkout</h2>
      </div>
      <div class="bco-body">
        <div class="bco-items">${itemsHtml}</div>
        <div class="bco-total-row"><span>Bundle Total</span><strong>${_bundleSettings.bundle3Price} MAD</strong></div>
        <div class="bco-form">
          <p class="bco-form-title">Your details</p>
          <input class="bco-input" id="bcoName" placeholder="Full name" autocomplete="name">
          <input class="bco-input" id="bcoPhone" placeholder="Phone number" type="tel" autocomplete="tel">
          <input class="bco-input" id="bcoCity" placeholder="City" autocomplete="address-level2">
          <input class="bco-input" id="bcoAddress" placeholder="Address" autocomplete="street-address">
        </div>
      </div>
      <div class="bco-footer">
        <button class="bco-submit-btn" id="bcoSubmitBtn" onclick="placeBundleOrder()">Place Bundle Order \u2014 ${_bundleSettings.bundle3Price} MAD</button>
      </div>
    </div>`;
  document.body.appendChild(checkoutEl);
  requestAnimationFrame(function() { checkoutEl.classList.add('active'); });
  if (window.fillDetectedCity) window.fillDetectedCity();
  setTimeout(function() {
    if (window._initCityInput) window._initCityInput(document.getElementById('bcoCity'));
  }, 100);
}

function closeBundleCheckout() {
  var el = document.getElementById('bundleCheckoutOverlay');
  if (el) { el.classList.remove('active'); setTimeout(function() { el.remove(); }, 300); }
}

async function placeBundleOrder() {
  var customer  = (document.getElementById('bcoName')    ? document.getElementById('bcoName').value    : '').trim();
  var phone     = (document.getElementById('bcoPhone')   ? document.getElementById('bcoPhone').value   : '').trim();
  var city      = (document.getElementById('bcoCity')    ? document.getElementById('bcoCity').value    : '').trim();
  var address   = (document.getElementById('bcoAddress') ? document.getElementById('bcoAddress').value : '').trim();
  if (!customer) { alert('Please enter your full name.'); return; }
  if (!phone || phone.replace(/\D/g,'').length < 9) { alert('Please enter a valid phone number.'); return; }
  if (!city) { alert('Please enter your city.'); return; }
  if (!address) { alert('Please enter your address.'); return; }
  var btn = document.getElementById('bcoSubmitBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Placing order\u2026'; }
  var base = Math.floor(_bundleSettings.bundle3Price / 3);
  var rem  = _bundleSettings.bundle3Price - base * 3;
  var items = _bundleSlots.map(function(s, i) {
    var label = s.name + (s.color || s.size ? ' (' + [s.color ? bundleColorName(s.color) : null, s.size].filter(Boolean).join(' / ') + ')' : '');
    return { name: label, size: s.size || null, qty: 1, price: base + (i === 0 ? rem : 0) };
  });
  try {
    var API = (typeof STREETSTORE_BACKEND !== 'undefined') ? STREETSTORE_BACKEND : 'http://localhost:3000';
    var hdrs = { 'Content-Type': 'application/json' };
    var tok = localStorage.getItem('ss_customer_token');
    if (tok) hdrs['Authorization'] = 'Bearer ' + tok;
    var resp = await fetch(API + '/api/orders', {
      method: 'POST', headers: hdrs,
      body: JSON.stringify({ customer: customer, phone: phone, city: city, address: address, items: items, total: _bundleSettings.bundle3Price, discount: 0 })
    });
    if (resp.ok) {
      var data = await resp.json().catch(function() { return {}; });
      if (data.id) localStorage.setItem('ss_guest_order_id', data.id);
      localStorage.setItem('streetstore_last_order', JSON.stringify(items));
      localStorage.setItem('streetstore_last_order_total', String(_bundleSettings.bundle3Price));
      window.location.href = 'thankyou.html';
    } else if (resp.status === 403) {
      var d = await resp.json().catch(function() { return {}; });
      alert(d.message || 'Your access has been blocked.');
      if (btn) { btn.disabled = false; btn.textContent = 'Place Bundle Order \u2014 ' + _bundleSettings.bundle3Price + ' MAD'; }
    } else {
      throw new Error();
    }
  } catch(e) {
    alert('Could not place order. Please try again.');
    if (btn) { btn.disabled = false; btn.textContent = 'Place Bundle Order \u2014 ' + _bundleSettings.bundle3Price + ' MAD'; }
  }
}

/* ═══════════════════════════════════════════════════════════════
   REVIEWS SYSTEM
   ═══════════════════════════════════════════════════════════════ */
var _reviewRating = 0;

function initReviews() {
  if (!document.getElementById('reviewsGrid')) return;
  var params = new URLSearchParams(window.location.search);
  var slug = params.get('slug');
  if (!slug) return;

  // Pre-fill name if customer is logged in
  try {
    var tok = localStorage.getItem('ss_customer_token');
    if (tok) {
      var payload = JSON.parse(atob(tok.split('.')[1]));
      if (payload && payload.name) {
        var nameEl = document.getElementById('reviewName');
        if (nameEl) nameEl.value = payload.name;
      }
    }
  } catch(e) {}

  // Load reviews
  var API = (typeof STREETSTORE_BACKEND !== 'undefined') ? STREETSTORE_BACKEND : 'http://localhost:3000';
  fetch(API + '/api/reviews/' + encodeURIComponent(slug))
    .then(function(r) { return r.json(); })
    .then(function(data) { renderReviews(data.reviews || [], data.avg, data.count); })
    .catch(function() {
      var g = document.getElementById('reviewsGrid');
      if (g) g.innerHTML = '<p class="reviews-loading">Could not load reviews.</p>';
    });

  // Star picker interactions
  document.querySelectorAll('.rsp-star').forEach(function(star) {
    star.addEventListener('mouseenter', function() { highlightStars(parseInt(this.dataset.val)); });
    star.addEventListener('mouseleave', function() { highlightStars(_reviewRating); });
    star.addEventListener('click', function() {
      _reviewRating = parseInt(this.dataset.val);
      highlightStars(_reviewRating);
      var labels = ['','Poor','Fair','Good','Very Good','Excellent'];
      var lbl = document.getElementById('reviewStarLabel');
      if (lbl) lbl.textContent = labels[_reviewRating];
    });
  });
}

function highlightStars(val) {
  document.querySelectorAll('.rsp-star').forEach(function(s) {
    s.classList.toggle('active', parseInt(s.dataset.val) <= val);
  });
}

function renderReviews(reviews, avg, count) {
  var avgEl  = document.getElementById('reviewsAvg');
  var avgNum = document.getElementById('reviewsAvgNum');
  var avgStars = document.getElementById('reviewsAvgStars');
  var countEl  = document.getElementById('reviewsCount');
  var grid     = document.getElementById('reviewsGrid');

  if (avg && count > 0) {
    if (avgEl) avgEl.style.display = 'flex';
    if (avgNum) avgNum.textContent = avg;
    if (avgStars) avgStars.textContent = '\u2605'.repeat(Math.round(avg)) + '\u2606'.repeat(5 - Math.round(avg));
    if (countEl) countEl.textContent = 'Based on ' + count + ' review' + (count !== 1 ? 's' : '');
  }

  if (!grid) return;
  if (!reviews.length) {
    grid.innerHTML = '<p class="reviews-loading">No reviews yet. Be the first!</p>';
    return;
  }
  grid.innerHTML = reviews.map(function(r) {
    var stars = '\u2605'.repeat(r.rating) + '\u2606'.repeat(5 - r.rating);
    var date = new Date(r.createdAt).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });
    return '<div class="review-card">'
      + '<div class="review-stars">' + stars + '</div>'
      + '<p class="review-quote">\u201c' + r.text.replace(/</g,'&lt;') + '\u201d</p>'
      + '<p class="review-author">' + r.name.replace(/</g,'&lt;') + '</p>'
      + '<p class="review-date">' + date + '</p>'
      + '</div>';
  }).join('');
}

function toggleReviewForm() {
  var wrap = document.getElementById('reviewFormWrap');
  if (!wrap) return;
  var open = wrap.style.display === 'none' || !wrap.style.display;
  wrap.style.display = open ? 'block' : 'none';
  if (open) setTimeout(function() { wrap.scrollIntoView({ behavior:'smooth', block:'nearest' }); }, 50);
}

async function submitReview() {
  var name   = (document.getElementById('reviewName')  ? document.getElementById('reviewName').value  : '').trim();
  var text   = (document.getElementById('reviewText')  ? document.getElementById('reviewText').value  : '').trim();
  if (!_reviewRating) { alert('Please select a star rating.'); return; }
  if (!name)           { alert('Please enter your name.');      return; }
  if (text.length < 10){ alert('Please write at least 10 characters.'); return; }

  var params = new URLSearchParams(window.location.search);
  var slug = params.get('slug');
  if (!slug) return;

  var btn = document.getElementById('reviewSubmitBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Submitting\u2026'; }

  try {
    var API = (typeof STREETSTORE_BACKEND !== 'undefined') ? STREETSTORE_BACKEND : 'http://localhost:3000';
    var hdrs = { 'Content-Type': 'application/json' };
    var tok = localStorage.getItem('ss_customer_token');
    if (tok) hdrs['Authorization'] = 'Bearer ' + tok;
    var resp = await fetch(API + '/api/reviews', {
      method: 'POST', headers: hdrs,
      body: JSON.stringify({ productSlug: slug, name: name, rating: _reviewRating, text: text })
    });
    if (resp.ok) {
      var wrap = document.getElementById('reviewFormWrap');
      if (wrap) wrap.innerHTML = '<div class="review-submitted"><p>\uD83C\uDF89 Thank you, ' + name + '!</p><p>Your review is pending approval and will appear shortly.</p></div>';
    } else { throw new Error(); }
  } catch(e) {
    alert('Could not submit review. Please try again.');
    if (btn) { btn.disabled = false; btn.textContent = 'Submit Review'; }
  }
}

document.addEventListener('DOMContentLoaded', initReviews);
