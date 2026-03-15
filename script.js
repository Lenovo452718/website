/* ============================================================
   STREETSTORE — Complete JavaScript
   ============================================================ */

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
          <p class="cart-item-name">${item.name}</p>
          <p class="cart-item-price">${item.price} MAD &middot; ${item.size}</p>
          <div class="cart-item-qty">
            <button onclick="updateQty('${item.id}', -1)">−</button>
            <span>${item.qty}</span>
            <button onclick="updateQty('${item.id}', 1)">+</button>
          </div>
        </div>
        <button class="cart-item-remove" onclick="removeFromCart('${item.id}')">✕</button>
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
  const totalQty = cart.reduce((sum, i) => sum + i.qty, 0);
  if (totalQty < 2) return 0;
  const subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  // Same discount % as "2 for 319 MAD" on base price 2×179=358: ratio = 39/358
  return Math.round(subtotal * 39 / 358);
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
          <p class="cart-deal-title">Add 1 more &amp; save 39 MAD!</p>
          <p class="cart-deal-sub">Buy 2 &amp; get a pack discount automatically.</p>
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

  const cards = Array.from(grid.querySelectorAll('.product-card'));
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
}

/* ============================================================
   8. COLOR SWATCH SELECTION (sidebar)
   ============================================================ */
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
function initSizeSelector() {
  const btns = document.querySelectorAll('.size-btn:not(.sold-out)');
  const selectedSizeEl = document.getElementById('selectedSize');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (selectedSizeEl) selectedSizeEl.textContent = btn.textContent.trim();
    });
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
    const qty = parseInt(document.querySelector('.qty-display')?.textContent) || 1;
    const pageProductId = document.body.dataset.product;
    const pageImageUrl = (pageProductId && typeof PRODUCTS !== 'undefined' && PRODUCTS[pageProductId]) ? PRODUCTS[pageProductId].image : null;
    for (let i = 0; i < qty; i++) addToCart(name, price, 'Dark Wash', activeSize, pageImageUrl);
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
      addToCart(name, price, '', 'M', imageUrl);
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
      shippingCost = opt.querySelector('input').value === 'express' ? 30 : 0;
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
              <p class="summary-item-name">${item.name}</p>
              <p class="summary-item-variant">Size: ${item.size}</p>
              <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
                <button onclick="updateQty('${item.id}',-1)" style="width:22px;height:22px;border:1px solid #ddd;background:#fff;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;">−</button>
                <span style="font-size:13px;min-width:16px;text-align:center;">${item.qty}</span>
                <button onclick="updateQty('${item.id}',1)" style="width:22px;height:22px;border:1px solid #ddd;background:#fff;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;">+</button>
              </div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
              <span class="summary-item-price">${item.price * item.qty} MAD</span>
              <button onclick="removeFromCartCheckout('${item.id}')" style="font-size:11px;color:#999;background:none;border:none;cursor:pointer;text-decoration:underline;padding:0;">Remove</button>
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
  const total = subtotal - discount + shippingCost;

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

  // Upsell banner: show when exactly 1 total item in cart
  if (upsellBanner) upsellBanner.style.display = (totalQty === 1 && subtotal > 0) ? '' : 'none';

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
}

/* ============================================================
   INIT — DOM READY
   ============================================================ */
/* ============================================================
   NEW GALLERY THUMBNAILS — click to switch main image
   ============================================================ */
function initNewGallery() {
  const mainImg    = document.getElementById('mainProductImg');
  const mainWrap   = document.getElementById('galleryMainNew');
  const thumbItems = document.querySelectorAll('.thumb-item');
  if (!mainImg || !thumbItems.length) return;

  const total = thumbItems.length;

  thumbItems.forEach((thumb, index) => {
    thumb.addEventListener('click', () => {
      const src = thumb.dataset.src;
      const num = thumb.dataset.num || String(index + 1).padStart(2, '0');

      // Crossfade main image
      mainImg.style.opacity = '0';
      setTimeout(() => {
        mainImg.src = src;
        mainImg.style.opacity = '1';
      }, 220);

      // Update counter
      if (mainWrap) {
        mainWrap.setAttribute('data-counter', `${num} / ${String(total).padStart(2,'0')}`);
      }

      // Update active state
      thumbItems.forEach(t => t.classList.remove('active'));
      thumb.classList.add('active');
    });
  });
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
            <div><p style="font-size:14px;font-weight:600;margin:0;">${p.name}</p><p style="font-size:12px;color:rgba(255,255,255,0.45);margin:2px 0 0;">${p.price} MAD</p></div>
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
  placeOrderBtn.addEventListener('click', e => {
    e.preventDefault();
    // Save last order for thank-you page
    const cart = getCart();
    localStorage.setItem('streetstore_last_order', JSON.stringify(cart));
    saveCart([]);
    updateCartBadge();
    window.location.href = 'thankyou.html';
  });
}

document.addEventListener('DOMContentLoaded', () => {
  injectCartDrawer();
  updateCartBadge();
  renderCartItems();
  initHeaderScroll();
  initMobileMenu();
  initCartIcon();
  initColorSwatches();
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
  initNewGallery();
  initWishlist();
  initSearch();
  initPlaceOrder();

  // Auto-open cart if redirected from checkout "return to cart"
  if (new URLSearchParams(window.location.search).get('opencart') === '1') {
    setTimeout(openCart, 300);
    history.replaceState({}, '', window.location.pathname);
  }
});
