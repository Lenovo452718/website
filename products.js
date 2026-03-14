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
    href: "product-patte-elephant.html",
    badge: "sale",
    // ↓ Change this path to update the card image on ALL pages
    image: "images/products/patte-elephant/1.jpg",
    gallery: [
      "images/products/patte-elephant/1.jpg",
      "images/products/patte-elephant/2.jpg",
      "images/products/patte-elephant/3.jpg",
      "images/products/patte-elephant/4.jpg",
    ],
    video: "images/products/patte-elephant/video.mp4"
  },

  'high-rise-dark-blue': {
    name: "High-Rise Dark Blue Jeans",
    price: 179,
    originalPrice: 249,
    fit: "High Waist",
    href: "product-high-rise-dark-blue.html",
    badge: "sale",
    image: "images/products/high-rise-dark-blue/1.jpg",
    gallery: [
      "images/products/high-rise-dark-blue/1.jpg",
      "images/products/high-rise-dark-blue/2.jpg",
      "images/products/high-rise-dark-blue/3.jpg",
      "images/products/high-rise-dark-blue/4.jpg",
      "images/products/high-rise-dark-blue/5.jpg",
    ],
    video: "images/products/high-rise-dark-blue/video.mp4"
  },

  'brown-wide-leg': {
    name: "Brown Wide-Leg Jean",
    price: 179,
    originalPrice: 299,
    fit: "Wide Leg",
    href: "product-brown-wide-leg.html",
    badge: "sale",
    image: "images/products/brown-wide-leg/1.jpg",
    gallery: [
      "images/products/brown-wide-leg/1.jpg",
      "images/products/brown-wide-leg/2.jpg",
      "images/products/brown-wide-leg/3.jpg",
      "images/products/brown-wide-leg/4.jpg",
      "images/products/brown-wide-leg/5.jpg",
    ],
    video: "images/products/brown-wide-leg/video.mp4"
  },

  'baggy-wide-leg': {
    name: "Baggy Wide Leg Denim Jeans",
    price: 179,
    originalPrice: 250,
    fit: "Oversized Baggy",
    href: "product-baggy-wide-leg.html",
    badge: "sale",
    image: "images/products/baggy-wide-leg/1.jpg",
    gallery: [
      "images/products/baggy-wide-leg/1.jpg",
      "images/products/baggy-wide-leg/2.jpg",
      "images/products/baggy-wide-leg/3.jpg",
      "images/products/baggy-wide-leg/4.jpg",
      "images/products/baggy-wide-leg/5.jpg",
    ],
    video: "images/products/baggy-wide-leg/video.mp4"
  },

  'jean-skirts': {
    name: "Jean Skirts",
    price: 179,
    originalPrice: 299,
    fit: "Denim Mini Skirt",
    href: "product-jean-skirts.html",
    badge: "sale",
    image: null,   // ← drop photo here when ready
    gallery: [],
    video: null
  },

  'denim-set': {
    name: "Denim Jacket & Wide-Leg Pants Set",
    price: 299,
    originalPrice: 350,
    fit: "Full Denim Set",
    href: "product-denim-set.html",
    badge: "trending",
    image: null,   // ← drop photo here when ready
    gallery: [],
    video: null
  }

};

/* ── Auto-populate all product card images on the page ─────── */
(function initProductImages() {
  document.querySelectorAll('[data-product-img]').forEach(el => {
    const id      = el.dataset.productImg;
    const product = PRODUCTS[id];
    if (!product || !product.image) return;

    if (el.tagName === 'IMG') {
      el.src = product.image;
      el.alt = product.name;
    } else {
      // Swap placeholder div → real img
      const img = document.createElement('img');
      img.className       = el.className;
      img.dataset.productImg = id;
      img.src             = product.image;
      img.alt             = product.name;
      img.style.cssText   = 'width:100%;height:100%;object-fit:cover;display:block;transition:transform 0.5s cubic-bezier(0.16,1,0.3,1);';
      el.parentNode.replaceChild(img, el);
    }
  });
})();

/* ── Auto-populate product page gallery (filmstrip + video) ── */
(function initProductGallery() {
  const page = document.body.dataset.product;
  if (!page) return;
  const product = PRODUCTS[page];
  if (!product) return;

  // Video source
  const videoSrc = document.getElementById('productVideoSrc');
  if (videoSrc && product.video) {
    videoSrc.src = product.video;
    const vid = document.getElementById('productVideo');
    if (vid) vid.load();
  }

  // Filmstrip thumbnails
  const thumbs   = document.querySelectorAll('.thumb-item[data-gallery-index]');
  const mainImg  = document.getElementById('mainProductImg');
  const mainWrap = document.getElementById('galleryMainNew');

  thumbs.forEach(thumb => {
    const idx = parseInt(thumb.dataset.galleryIndex, 10);
    const src = product.gallery[idx];
    if (!src) return;
    thumb.dataset.src = src;
    const img = thumb.querySelector('img');
    if (img) img.src = src;
  });

  if (mainImg && product.gallery[0]) {
    mainImg.src = product.gallery[0];
  }
  if (mainWrap) {
    mainWrap.setAttribute('data-counter', '01 / ' + String(product.gallery.length).padStart(2, '0'));
  }
})();
