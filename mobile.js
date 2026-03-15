/* ============================================================
   STREETSTORE — Mobile Enhancements
   Only activates on screens ≤ 768px. Desktop untouched.
   ============================================================ */

/* ---- 1. Bottom Navigation Bar ---- */
function initMobileBottomNav() {
  if (window.innerWidth > 768) return;
  if (document.querySelector('.mobile-bottom-nav')) return;

  const page = window.location.pathname.split('/').pop() || 'index.html';
  const isProduct = page.startsWith('product-');
  const nav = document.createElement('nav');
  nav.className = 'mobile-bottom-nav';
  nav.innerHTML = `
    <a href="index.html" class="mobile-nav-item${page === 'index.html' ? ' active' : ''}">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
      <span>Home</span>
    </a>
    <a href="shop.html" class="mobile-nav-item${page === 'shop.html' || isProduct ? ' active' : ''}">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
      <span>Shop</span>
    </a>
    <button class="mobile-nav-item mobile-nav-cart-btn" aria-label="Cart">
      <span style="position:relative;display:inline-flex;align-items:center;justify-content:center;">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
        <span class="mobile-nav-badge">0</span>
      </span>
      <span>Cart</span>
    </button>
    <!-- account nav item hidden for now -->
  `;
  document.body.appendChild(nav);

  // Cart button opens the existing cart drawer
  nav.querySelector('.mobile-nav-cart-btn').addEventListener('click', () => {
    const cartBtn = document.querySelector('.cart-btn');
    if (cartBtn) cartBtn.click();
  });

  // Keep badge synced with header badge
  const headerBadge = document.querySelector('.cart-badge');
  const mobileBadge = nav.querySelector('.mobile-nav-badge');
  if (headerBadge && mobileBadge) {
    const sync = () => {
      const n = headerBadge.textContent;
      mobileBadge.textContent = n;
      mobileBadge.style.display = n === '0' ? 'none' : 'flex';
    };
    sync();
    new MutationObserver(sync).observe(headerBadge, { childList: true, characterData: true, subtree: true });
  }
}

/* ---- 2. Product Gallery — swipe gestures + dot indicators ---- */
function initMobileGallerySwipe() {
  if (window.innerWidth > 768) return;
  const mainWrap = document.getElementById('galleryMainNew');
  const thumbItems = Array.from(document.querySelectorAll('.thumb-item'));
  if (!mainWrap || !thumbItems.length) return;

  let currentIndex = 0;
  let startX = 0;

  // Create dot indicators below the main image
  const dotsWrap = document.createElement('div');
  dotsWrap.className = 'gallery-dots';
  thumbItems.forEach((_, i) => {
    const dot = document.createElement('span');
    dot.className = 'gallery-dot' + (i === 0 ? ' active' : '');
    dotsWrap.appendChild(dot);
  });
  mainWrap.insertAdjacentElement('afterend', dotsWrap);

  function updateDots(i) {
    document.querySelectorAll('.gallery-dot').forEach((d, j) => d.classList.toggle('active', j === i));
  }
  function goTo(i) {
    currentIndex = Math.max(0, Math.min(i, thumbItems.length - 1));
    thumbItems[currentIndex].click();
    updateDots(currentIndex);
  }

  // Touch swipe
  mainWrap.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
  mainWrap.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) < 40) return;
    goTo(dx < 0 ? currentIndex + 1 : currentIndex - 1);
  }, { passive: true });

  // Keep dot in sync when filmstrip thumb is clicked manually
  thumbItems.forEach((thumb, i) => {
    thumb.addEventListener('click', () => { currentIndex = i; updateDots(i); });
  });
}

/* ---- 3. Shop page — slide-up filter panel ---- */
function initMobileFilterPanel() {
  const sidebar = document.querySelector('.shop-sidebar');
  if (!sidebar || window.innerWidth > 768) return;

  // "Filters" + sort bar injected above the product grid
  const filterBar = document.createElement('div');
  filterBar.className = 'mobile-filter-bar';
  filterBar.innerHTML = `
    <button class="mobile-filter-btn" id="mobileFilterBtn">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
      Filters
    </button>
    <select class="sort-select-mobile" id="sortSelectMobile">
      <option value="featured">Featured</option>
      <option value="price-asc">Price: Low → High</option>
      <option value="price-desc">Price: High → Low</option>
      <option value="newest">Newest</option>
    </select>
  `;
  const main = document.querySelector('.shop-layout main');
  if (main) main.insertBefore(filterBar, main.firstChild);

  // Dark backdrop behind the panel
  const backdrop = document.createElement('div');
  backdrop.className = 'mobile-filter-backdrop';
  document.body.appendChild(backdrop);

  // Close button inside sidebar
  const closeBtn = document.createElement('button');
  closeBtn.className = 'sidebar-mobile-close';
  closeBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    Close
  `;
  sidebar.insertBefore(closeBtn, sidebar.firstChild);

  function openPanel() {
    sidebar.classList.add('mobile-panel-open');
    backdrop.classList.add('active');
  }
  function closePanel() {
    sidebar.classList.remove('mobile-panel-open');
    backdrop.classList.remove('active');
  }

  document.getElementById('mobileFilterBtn').addEventListener('click', openPanel);
  closeBtn.addEventListener('click', closePanel);
  backdrop.addEventListener('click', closePanel);

  // Close after clicking Clear All inside the panel
  sidebar.querySelector('.clear-all')?.addEventListener('click', () => setTimeout(closePanel, 200));

  // Sync mobile sort with sidebar sort select
  const mobileSortSelect = document.getElementById('sortSelectMobile');
  const sidebarSort = document.getElementById('sortSelect');
  if (mobileSortSelect && sidebarSort) {
    mobileSortSelect.addEventListener('change', () => {
      sidebarSort.value = mobileSortSelect.value;
      sidebarSort.dispatchEvent(new Event('change', { bubbles: true }));
      closePanel();
    });
  }
}

/* ---- 4. Sticky Add to Cart bar on product pages ---- */
function initStickyAddToCart() {
  if (window.innerWidth > 768) return;
  const addBtn = document.querySelector('.add-to-cart-btn');
  if (!addBtn) return;

  const bar = document.createElement('div');
  bar.className = 'sticky-atc-bar';
  const nameEl = document.querySelector('.product-name');
  bar.innerHTML = `
    <span class="sticky-atc-name">${nameEl ? nameEl.textContent.trim() : ''}</span>
    <button class="sticky-atc-btn">Add to Cart</button>
  `;
  document.body.appendChild(bar);

  bar.querySelector('.sticky-atc-btn').addEventListener('click', () => addBtn.click());

  // Show bar only when original button is off-screen
  new IntersectionObserver(entries => {
    bar.classList.toggle('visible', !entries[0].isIntersecting);
  }, { threshold: 0 }).observe(addBtn);
}

/* ---- Register Service Worker (PWA) ---- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

/* ---- Run on DOM ready ---- */
document.addEventListener('DOMContentLoaded', () => {
  initMobileBottomNav();
  initMobileGallerySwipe();
  initMobileFilterPanel();
  initStickyAddToCart();
});
