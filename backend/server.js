/**
 * StreetStore — API Server
 * Express + Prisma (MySQL) + Cloudinary + Socket.io
 */

/* ── Ensure Prisma uses library engine (no subprocess) ── */
(function patchPrismaEngine() {
  const fs   = require('fs');
  const path = require('path');
  const clientDir = path.join(__dirname, 'node_modules/.prisma/client');

  // 1. Copy .so.node engine file if missing
  const soFile = 'libquery_engine-debian-openssl-1.1.x.so.node';
  const dest = path.join(clientDir, soFile);
  if (!fs.existsSync(dest)) {
    const sources = [
      path.join(__dirname, 'node_modules/@prisma/engines', soFile),
      path.join(__dirname, 'node_modules/prisma', soFile),
    ];
    for (const src of sources) {
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        console.log('[startup] Copied engine file to .prisma/client');
        break;
      }
    }
  }

  // 2. Patch index.js to use library runtime instead of binary
  const indexFile = path.join(clientDir, 'index.js');
  try {
    let src = fs.readFileSync(indexFile, 'utf8');
    let patched = src
      .replace(/runtime\/binary/g, 'runtime/library')
      .replace(/"engineType"\s*:\s*"binary"/g, '"engineType":"library"')
      .replace(/'engineType'\s*:\s*'binary'/g, "'engineType':'library'");
    if (patched !== src) {
      fs.writeFileSync(indexFile, patched);
      console.log('[startup] Prisma client patched → library engine');
    }
  } catch (e) {
    console.error('[startup] Prisma patch skipped:', e.message);
  }
})();

require('dotenv').config();

const crypto       = require('crypto');
const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const multer       = require('multer');
const path         = require('path');
const fs           = require('fs');
const bcrypt       = require('bcryptjs');
const jwt          = require('jsonwebtoken');
const speakeasy    = require('speakeasy');
const QRCode       = require('qrcode');
const http         = require('http');
const { Server }   = require('socket.io');
const prisma       = require('./prisma');
const compression  = require('compression');
const cloudinary   = require('cloudinary').v2;
const webpush      = require('web-push');

/* ── Cloudinary — always required ── */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure:     true,
});
if (!process.env.CLOUDINARY_API_KEY) {
  console.error('WARNING: CLOUDINARY_API_KEY not set — uploads will fail');
} else {
  console.log('Cloudinary enabled');
}

/* ── Web Push (VAPID) ── */
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:admin@streetstore.ma',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  console.log('Web Push enabled');
}

/* ════════════════════════════════════════
   AUTH STORE
════════════════════════════════════════ */
const AUTH_FILE     = path.join(__dirname, 'auth.json');
const JWT_SECRET    = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRY    = '8h';
const BCRYPT_ROUNDS = 12;

function readAuth() {
  try {
    if (fs.existsSync(AUTH_FILE)) return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
  } catch {}
  return { passwordHash: null, twoFactorSecret: null, twoFactorEnabled: false };
}

function writeAuth(data) {
  fs.writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2));
}

/* ── Login throttle ── */
const loginAttempts = new Map();
const MAX_ATTEMPTS  = 5;
const LOCK_MINUTES  = 15;

function checkLoginLock(ip) {
  const rec = loginAttempts.get(ip);
  if (!rec) return false;
  if (rec.lockedUntil && Date.now() < rec.lockedUntil) return true;
  if (rec.lockedUntil && Date.now() >= rec.lockedUntil) loginAttempts.delete(ip);
  return false;
}
function recordFailedLogin(ip) {
  const rec = loginAttempts.get(ip) || { count: 0, lockedUntil: null };
  rec.count++;
  if (rec.count >= MAX_ATTEMPTS) rec.lockedUntil = Date.now() + LOCK_MINUTES * 60_000;
  loginAttempts.set(ip, rec);
}
function resetLoginAttempts(ip) { loginAttempts.delete(ip); }

/* ── Blocked IPs (memory cache — no disk read per request) ── */
const BLOCKED_IPS_FILE = path.join(__dirname, 'blocked_ips.json');
let _blockedIpsCache = null;
function readBlockedIps() {
  if (_blockedIpsCache) return _blockedIpsCache;
  try { _blockedIpsCache = JSON.parse(fs.existsSync(BLOCKED_IPS_FILE) ? fs.readFileSync(BLOCKED_IPS_FILE, 'utf8') : '[]'); }
  catch { _blockedIpsCache = []; }
  return _blockedIpsCache;
}
function writeBlockedIps(list) {
  _blockedIpsCache = list;
  fs.writeFileSync(BLOCKED_IPS_FILE, JSON.stringify(list, null, 2));
}

/* ── Helpers ── */
function getClientIp(req) { return req.ip || req.socket?.remoteAddress || 'unknown'; }
function normalizePhone(p) { return p ? p.replace(/[\s\-\.()]/g, '') : ''; }
function sanitize(str, maxLen = 200) {
  if (typeof str !== 'string') return '';
  return str.replace(/<[^>]*>/g, '').trim().slice(0, maxLen);
}
function isValidId(id) { return typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id); }
function isStrongPassword(p) {
  return typeof p === 'string' && p.length >= 8 && /[A-Za-z]/.test(p) && /[0-9]/.test(p);
}
function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/* ── File upload — memory storage, always Cloudinary ── */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const isImage = /^image\//i.test(file.mimetype);
    const isVideo = /^video\//i.test(file.mimetype) || /\.(mp4|mov|webm|avi)$/i.test(file.originalname);
    if (isImage || isVideo) cb(null, true);
    else cb(new Error('Only image and video files are allowed'));
  }
});

/* ── Cloudinary stream upload from memory buffer ── */
const streamUpload = (buffer, options) => new Promise((resolve, reject) => {
  const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
    if (err) reject(err); else resolve(result);
  });
  stream.end(buffer);
});

/* ════════════════════════════════════════
   APP + SOCKET.IO
════════════════════════════════════════ */
const app        = express();
app.set('trust proxy', 1); // trust CDN/proxy — use X-Forwarded-For for real client IPs
const httpServer = http.createServer(app);
const io         = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});
const PORT = process.env.PORT || 3000;

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);
  socket.on('disconnect', () => console.log(`Socket disconnected: ${socket.id}`));
});

/* Helper: emit storefront sync event + auto-invalidate products cache */
function emit(event, data) {
  if (event.startsWith('product')) invalidateProductsCache();
  io.emit(event, data);
}

/* ════════════════════════════════════════
   MIDDLEWARE
════════════════════════════════════════ */
app.use(compression());
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
  frameguard: false, // allow TikTok/FB Event Builder iframes
}));
/* Prevent CDN from caching API responses */
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  next();
});
app.use(express.json({ limit: '10kb' }));
app.use(cors({
  origin: function(origin, callback) {
    if (!origin || origin === 'null') return callback(null, true);
    if (origin.startsWith('http://localhost') ||
        origin.startsWith('http://127.0.0.1') ||
        origin.endsWith('.github.io') ||
        origin === 'https://streetstore.ma' ||
        origin === 'https://www.streetstore.ma' ||
        origin === (process.env.WEBSITE_URL || '')) return callback(null, true);
    callback(null, false);
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT'],
}));
/* ── Inline pixel injection: serves HTML pages with pixel code in <head> ── */
let _pixelCache = null, _pixelCacheTime = 0;
async function getPixelInlineScript() {
  const now = Date.now();
  if (_pixelCache !== null && now - _pixelCacheTime < 300000) return _pixelCache;
  try {
    const [row] = await prisma.$queryRawUnsafe("SELECT pixelsJson FROM `SiteSettings` WHERE id='singleton' LIMIT 1");
    let px = {};
    try { px = JSON.parse(row?.pixelsJson || '{}'); } catch(e) {}
    const strip = code => code.replace(/<\/?script[^>]*>/gi, '').replace(/<!--.*?-->/gs, '').trim();
    let js = '';
    if (px.ttActive && px.tiktok)   js += strip(px.tiktok)   + '\n';
    if (px.fbActive && px.facebook) js += strip(px.facebook) + '\n';
    if (px.gaActive && px.google)   js += strip(px.google)   + '\n';
    _pixelCache = js ? `\n<script>\n${js}</script>` : '';
    _pixelCacheTime = now;
    return _pixelCache;
  } catch(e) { return ''; }
}
const SSR_HTML_PAGES = new Set(['index.html','shop.html','product.html','checkout.html','thankyou.html','signup.html']);
app.use(async (req, res, next) => {
  if (req.method !== 'GET') return next();
  const file = req.path === '/' ? 'index.html' : req.path.slice(1);
  if (!SSR_HTML_PAGES.has(file)) return next();
  const filePath = path.join(__dirname, '../frontend', file);
  try {
    let html = fs.readFileSync(filePath, 'utf8');
    const inlinePixel = await getPixelInlineScript();
    if (inlinePixel) html = html.replace('</head>', inlinePixel + '\n</head>');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch(e) { next(); }
});

app.use(express.static(path.join(__dirname, '../frontend'), {
  maxAge: 0,
  etag: true,
  setHeaders: function(res, filePath) {
    if (/\.(jpg|jpeg|png|webp|gif|svg|mp4|mov|webm|woff2?|ttf)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=604800'); // 7d for images/fonts/videos
    } else if (/\.(css|js)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=300'); // 5 min for CSS/JS
    }
  }
}));

/* ── Rate limiters ── */
const orderLimiter = rateLimit({ windowMs: 15 * 60_000, max: 5,   keyGenerator: req => getClientIp(req), message: { error: 'Too many orders. Wait 15 min.' } });
const adminLimiter = rateLimit({ windowMs: 60_000,       max: 120, keyGenerator: req => getClientIp(req), message: { error: 'Too many requests.' } });
const authLimiter  = rateLimit({ windowMs: 15 * 60_000, max: 20,  keyGenerator: req => getClientIp(req), message: { error: 'Too many auth attempts.' } });

/* ── Customer JWT middleware ── */
function requireCustomerAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.customerId) return res.status(401).json({ error: 'Invalid token' });
    req.customerId = decoded.customerId;
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
}

/* ── JWT middleware ── */
function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token expired or invalid. Please log in again.' });
  }
}

/* ════════════════════════════════════════
   PUBLIC ROUTES
════════════════════════════════════════ */
app.get('/api/status', (req, res) => {
  res.json({ service: 'StreetStore API', status: 'running', timestamp: new Date().toISOString() });
});

/* POST /api/orders — place order from storefront */
app.post('/api/orders', orderLimiter, async (req, res) => {
  const clientIp = getClientIp(req);
  if (readBlockedIps().includes(clientIp)) {
    return res.status(403).json({ error: 'blocked', message: 'Your account has been blocked. Contact us on WhatsApp.' });
  }

  const product  = sanitize(req.body.product  || '', 100);
  const customer = sanitize(req.body.customer || '', 80);
  const phone    = sanitize(req.body.phone    || '', 20);
  const city     = sanitize(req.body.city     || '', 60);
  const address  = sanitize(req.body.address  || '', 200);
  const size     = sanitize(req.body.size     || '', 10);
  const price    = sanitize(String(req.body.price || ''), 20);
  const qty      = Math.min(Math.max(parseInt(req.body.qty) || 1, 1), 99);

  if (!customer || !phone || !city) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return res.status(400).json({ error: 'Invalid phone number' });
  if (!/^[\p{L}\s'\-\.]{2,80}$/u.test(customer)) return res.status(400).json({ error: 'Invalid customer name' });

  // Identify logged-in customer from auth token (optional)
  let customerId = null;
  const authHeader = req.headers['authorization'] || '';
  const customerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (customerToken) {
    try {
      const decoded = jwt.verify(customerToken, JWT_SECRET);
      if (decoded.customerId) customerId = decoded.customerId;
    } catch (_) {}
  }

  // Support both old single-product format and new cart format
  const items = Array.isArray(req.body.items) && req.body.items.length
    ? req.body.items
    : [{ name: product, size, qty, price: parseFloat(price) || 0 }];

  const couponCode  = sanitize(req.body.couponCode  || '', 50) || null;
  const discount    = parseFloat(req.body.discount)  || 0;
  const total       = parseFloat(req.body.total)     || items.reduce((s, i) => s + (parseFloat(i.price) || 0) * (parseInt(i.qty) || 1), 0);

  try {
    const order = await prisma.order.create({
      data: {
        status:    'pending',
        customer,
        phone,
        city,
        address,
        total,
        couponCode,
        discount,
        clientIp,
        msgSent:   false,
        items: {
          create: items.map(i => ({
            name:  sanitize(String(i.name || ''), 200),
            size:  i.size ? sanitize(String(i.size), 20) : null,
            qty:   Math.min(Math.max(parseInt(i.qty) || 1, 1), 99),
            price: parseFloat(i.price) || 0,
          }))
        }
      },
      include: { items: true },
    });

    // Link order to customer account + save phone — via raw SQL (customerId not in Prisma schema)
    if (customerId) {
      try {
        await prisma.$executeRawUnsafe(
          'UPDATE `Order` SET customerId = ? WHERE id = ?',
          customerId, order.id
        );
        // Save normalized phone so future lookups always match
        const phoneNorm = normalizePhone(phone);
        await prisma.$executeRawUnsafe(
          'UPDATE `Customer` SET phone = ? WHERE id = ? AND (phone IS NULL OR phone = "")',
          phoneNorm, customerId
        );
      } catch (_) {}
    }

    emit('order:new', { orderId: order.id, customer: order.customer });

    // Push notification to admin browsers
    sendAdminPush(
      `🛍️ New Order #${order.id.slice(-6)}`,
      `${order.customer} · ${order.total} MAD`
    ).catch(() => {});

    // WhatsApp admin notification via CallMeBot (non-blocking)
    (async () => {
      try {
        const settings = await prisma.siteSettings.findUnique({ where: { id: 'singleton' } });
        if (settings && settings.whatsapp && settings.whatsappBotKey) {
          const itemsSummary = order.items.map(i => `${i.name} x${i.qty}`).join(', ');
          const msg = encodeURIComponent(
            `🛍️ New Order #${order.id.slice(-6)}
` +
            `Customer: ${order.customer}
` +
            `Phone: ${order.phone}
` +
            `City: ${order.city}
` +
            `Items: ${itemsSummary}
` +
            `Total: ${order.total} MAD`
          );
          const waPhone = settings.whatsapp.replace(/[^0-9]/g, '');
          const url = `https://api.callmebot.com/whatsapp.php?phone=${waPhone}&text=${msg}&apikey=${settings.whatsappBotKey}`;
          await fetch(url).catch(() => {});
        }
      } catch (_) {}
    })();

    res.status(201).json({ success: true, orderId: order.id, message: 'Order received.' });
  } catch (err) {
    console.error('POST /api/orders error:', err);
    res.status(500).json({ error: 'Failed to place order' });
  }
});

/* GET /api/coupons/validate — public coupon validation */
app.get('/api/coupons/validate', async (req, res) => {
  const code  = sanitize(req.query.code || '', 50).toUpperCase();
  const total = parseFloat(req.query.total) || 0;
  if (!code) return res.status(400).json({ error: 'No code provided' });
  try {
    const coupon = await prisma.coupon.findUnique({ where: { code } });
    if (!coupon || !coupon.isActive) return res.status(404).json({ error: 'Invalid coupon' });
    if (coupon.expiresAt && new Date() > coupon.expiresAt) return res.status(400).json({ error: 'Coupon expired' });
    if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) return res.status(400).json({ error: 'Coupon usage limit reached' });
    if (total < coupon.minOrder) return res.status(400).json({ error: `Minimum order is ${coupon.minOrder} MAD` });
    const discount = coupon.type === 'percent' ? (total * coupon.value / 100) : coupon.value;
    res.json({ valid: true, discount: Math.min(discount, total), type: coupon.type, value: coupon.value });
  } catch (err) {
    console.error('GET /api/coupons/validate error:', err);
    res.status(500).json({ error: 'Failed to validate coupon' });
  }
});

/* GET /api/products/overrides — legacy compat for products.js */
let _productsCache = null;
let _productsCacheTime = 0;
const PRODUCTS_CACHE_TTL = 30_000; // 30 seconds
function invalidateProductsCache() { _productsCache = null; }

app.get('/api/products/overrides', async (req, res) => {
  try {
    if (_productsCache && Date.now() - _productsCacheTime < PRODUCTS_CACHE_TTL) {
      return res.json(_productsCache);
    }
    const products = await prisma.product.findMany({
      include: { images: { orderBy: { sortOrder: 'asc' } }, variants: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    });
    const overrides = {};
    for (const p of products) {
      if (p.status !== 'ACTIVE') {
        // Signal the storefront to hide this product
        overrides[p.slug] = null;
        continue;
      }
      overrides[p.slug] = {
        name:          p.name,
        price:         p.price,
        originalPrice: p.comparePrice || undefined,
        fit:           p.fit || '',
        fitFilter:     p.fitFilter || 'wide',
        badge:         p.badge || '',
        sizes:         p.variants.map(v => v.size).filter(Boolean).join(','),
        sizesInStock:  p.variants.filter(v => v.inStock).map(v => v.size).filter(Boolean),
        color:         '',
        image:         (p.images.find(i => i.isMain) || p.images[0])?.url || null,
        gallery:       p.images.map(i => i.url),
        video:         null,
        href:          p.href || `product-${p.slug}.html`,
        description:   p.description || '',
        inStock:       p.variants.length === 0 || p.variants.some(v => v.inStock),
        status:        p.status,
      };
    }
    _productsCache = overrides;
    _productsCacheTime = Date.now();
    res.json(overrides);
  } catch (err) {
    console.error(err);
    res.status(500).json({});
  }
});

/* GET /api/products — public product list for storefront */
app.get('/api/products', async (req, res) => {
  try {
    const now = Date.now();
    if (_productsCache && (now - _productsCacheTime) < PRODUCTS_CACHE_TTL) {
      return res.json(_productsCache);
    }
    const products = await prisma.product.findMany({
      where:   { status: 'ACTIVE' },
      include: { images: { orderBy: { sortOrder: 'asc' } }, variants: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    });
    _productsCache = products;
    _productsCacheTime = now;
    res.json(products);
  } catch (err) {
    console.error('GET /api/products error:', err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

/* ── Reviews (public) ── */
app.post('/api/reviews', async (req, res) => {
  try {
    const { productSlug, name, rating, text } = req.body;
    if (!productSlug || !name || !rating || !text) return res.status(400).json({ error: 'Missing fields' });
    if (rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be 1-5' });
    let customerId = null;
    const authHeader = req.headers['authorization'] || '';
    const tok = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (tok) { try { const d = jwt.verify(tok, JWT_SECRET); if (d.customerId) customerId = d.customerId; } catch(_) {} }
    const review = await prisma.review.create({
      data: { productSlug: String(productSlug).slice(0,100), name: String(name).slice(0,80), rating: parseInt(rating), text: String(text).slice(0,1000), approved: false, customerId }
    });
    res.status(201).json({ ok: true, id: review.id });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to submit review' }); }
});

app.get('/api/reviews/:slug', async (req, res) => {
  try {
    const reviews = await prisma.review.findMany({ where: { productSlug: req.params.slug, approved: true }, orderBy: { createdAt: 'desc' } });
    const avg = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : null;
    res.json({ reviews, avg: avg ? parseFloat(avg) : null, count: reviews.length });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch reviews' }); }
});

/* GET /api/products/:slug — public single product */
app.get('/api/products/:slug', async (req, res) => {
  try {
    const product = await prisma.product.findUnique({
      where:   { slug: req.params.slug },
      include: { images: { orderBy: { sortOrder: 'asc' } }, variants: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

/* GET /api/settings — public site settings (excludes sensitive fields) */
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await prisma.siteSettings.findUnique({ where: { id: 'singleton' } });
    if (!settings) return res.json({});
    const { whatsappBotKey: _k, logoPublicId: _l, ...pub } = settings;
    res.json(pub);
  } catch {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

/* GET /api/banners — public banners */
app.get('/api/banners', async (req, res) => {
  try {
    const { position } = req.query;
    const where = { isActive: true };
    if (position) where.position = position;
    const banners = await prisma.banner.findMany({ where, orderBy: { sortOrder: 'asc' } });
    res.json(banners);
  } catch {
    res.status(500).json({ error: 'Failed to fetch banners' });
  }
});

/* ════════════════════════════════════════
   AUTH ROUTES
════════════════════════════════════════ */
app.post('/api/admin/login', authLimiter, async (req, res) => {
  const ip = getClientIp(req);
  if (checkLoginLock(ip)) return res.status(429).json({ error: `Too many failed attempts. Try again in ${LOCK_MINUTES} minutes.` });
  const { password, totpCode } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });
  const auth  = readAuth();
  const valid = auth.passwordHash
    ? await bcrypt.compare(password, auth.passwordHash)
    : password === process.env.API_SECRET;
  if (!valid) {
    recordFailedLogin(ip);
    const rec = loginAttempts.get(ip) || {};
    const remaining = MAX_ATTEMPTS - (rec.count || 0);
    if (remaining <= 0) return res.status(429).json({ error: `Account locked for ${LOCK_MINUTES} minutes.` });
    return res.status(401).json({ error: `Wrong password. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.` });
  }
  if (auth.twoFactorEnabled) {
    if (!totpCode) return res.status(200).json({ require2fa: true });
    const verified = speakeasy.totp.verify({ secret: auth.twoFactorSecret, encoding: 'base32', token: totpCode, window: 1 });
    if (!verified) { recordFailedLogin(ip); return res.status(401).json({ error: 'Invalid 2FA code.' }); }
  }
  resetLoginAttempts(ip);
  const token = jwt.sign({ role: 'admin', ip }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
  res.json({ token, expiresIn: JWT_EXPIRY });
});

app.post('/api/admin/change-password', authLimiter, requireAuth, async (req, res) => {
  const { newPassword } = req.body;
  if (!isStrongPassword(newPassword)) return res.status(400).json({ error: 'Password must be 8+ chars with a letter and number.' });
  const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  writeAuth({ ...readAuth(), passwordHash: hash });
  res.json({ success: true });
});

app.get('/api/admin/2fa/setup', adminLimiter, requireAuth, async (req, res) => {
  const secret = speakeasy.generateSecret({ name: 'StreetStore Admin', length: 20 });
  const qr     = await QRCode.toDataURL(secret.otpauth_url);
  writeAuth({ ...readAuth(), twoFactorSecret: secret.base32, twoFactorEnabled: false });
  res.json({ qr, secret: secret.base32 });
});

app.post('/api/admin/2fa/verify', adminLimiter, requireAuth, (req, res) => {
  const { code } = req.body;
  const auth = readAuth();
  if (!auth.twoFactorSecret) return res.status(400).json({ error: 'Run setup first' });
  const valid = speakeasy.totp.verify({ secret: auth.twoFactorSecret, encoding: 'base32', token: String(code), window: 1 });
  if (!valid) return res.status(400).json({ error: 'Invalid code.' });
  writeAuth({ ...auth, twoFactorEnabled: true });
  res.json({ success: true });
});

app.post('/api/admin/2fa/disable', adminLimiter, requireAuth, (req, res) => {
  writeAuth({ ...readAuth(), twoFactorSecret: null, twoFactorEnabled: false });
  res.json({ success: true });
});

app.get('/api/admin/2fa/status', adminLimiter, requireAuth, (req, res) => {
  res.json({ enabled: readAuth().twoFactorEnabled || false });
});

/* ════════════════════════════════════════
   ADMIN — ORDERS (MySQL via Prisma)
════════════════════════════════════════ */
app.get('/api/admin/orders', adminLimiter, requireAuth, async (req, res) => {
  try {
    const { status } = req.query;
    const limit = Math.min(parseInt(req.query.limit) || 200, 500);
    const where = {};
    if (status) where.status = status;
    const orders = await prisma.order.findMany({
      where,
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take:    limit,
    });
    res.json(orders);
  } catch (err) {
    console.error('GET /api/admin/orders error:', err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

app.get('/api/admin/orders/:id', adminLimiter, requireAuth, async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid ID' });
  try {
    const order = await prisma.order.findUnique({
      where:   { id: req.params.id },
      include: { items: { include: { product: { select: { shortName: true, color: true } } } } },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

app.patch('/api/admin/orders/:id', adminLimiter, requireAuth, async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid ID' });
  const { status, city, address, notes, msgSent, phone } = req.body;
  const allowed = ['new','pending','confirmed','cancelled','edited','processing','called','reported','done'];
  if (status && !allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const data = {};
  if (status   !== undefined) data.status  = status;
  if (city     !== undefined) data.city    = sanitize(city, 60);
  if (address  !== undefined) data.address = sanitize(address, 200);
  if (notes    !== undefined) data.notes   = sanitize(notes, 1000);
  if (msgSent  !== undefined) data.msgSent = Boolean(msgSent);
  if (phone    !== undefined) data.phone   = sanitize(String(phone).replace(/^\+212/, '0').replace(/\s+/g,''), 30);
  try {
    // Fetch existing order (need pushEndpoint + customerId for push notifications)
    const existing = await prisma.$queryRawUnsafe(
      'SELECT pushEndpoint, customerId FROM `Order` WHERE id = ? LIMIT 1', req.params.id
    ).then(r => r[0] || {});

    const order = await prisma.order.update({
      where:   { id: req.params.id },
      data,
      include: { items: { include: { product: { select: { shortName: true, color: true } } } } },
    });
    emit('order:statusChanged', { orderId: order.id, newStatus: order.status });


    // ── Push notification on status change ─────────────────────────────
    if (status && status !== order.status) {
      sendOrderStatusPush({ ...existing, id: order.id }, status).catch(() => {});
    }
    // ───────────────────────────────────────────────────────────────────

    res.json(order);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Order not found' });
    console.error(err);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

app.delete('/api/admin/orders/:id', adminLimiter, requireAuth, async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid ID' });
  try {
    await prisma.order.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Order not found' });
    res.status(500).json({ error: 'Failed to delete order' });
  }
});

app.get('/api/admin/stats', adminLimiter, requireAuth, async (req, res) => {
  try {
    const [total, pending, confirmed, cancelled, processing, productCount, revenueAgg] = await Promise.all([
      prisma.order.count(),
      prisma.order.count({ where: { status: 'pending' } }),
      prisma.order.count({ where: { status: 'confirmed' } }),
      prisma.order.count({ where: { status: 'cancelled' } }),
      prisma.order.count({ where: { status: 'processing' } }),
      prisma.product.count({ where: { status: 'ACTIVE' } }),
      prisma.order.aggregate({ _sum: { total: true }, where: { status: { in: ['confirmed', 'delivered', 'done'] } } }),
    ]);
    const revenue = revenueAgg._sum.total || 0;
    res.json({ total, pending, confirmed, cancelled, processing, productCount, revenue });
  } catch (err) {
    console.error('GET /api/admin/stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

app.get('/api/admin/suspicious', adminLimiter, requireAuth, async (req, res) => {
  try {
    const orders = await prisma.order.findMany({ include: { items: true } });
    const map = {};
    orders.forEach(o => {
      const key = o.phone || o.clientIp || 'unknown';
      if (!map[key]) map[key] = { name: o.customer, phone: o.phone, clientIp: o.clientIp, failedCount: 0, totalOrders: 0 };
      map[key].totalOrders++;
      if (o.status === 'cancelled') map[key].failedCount++;
    });
    res.json(Object.values(map).filter(c => c.failedCount >= 3));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch suspicious orders' });
  }
});

app.get('/api/admin/blocked-ips', adminLimiter, requireAuth, (req, res) => res.json(readBlockedIps()));
app.post('/api/admin/block-ip', adminLimiter, requireAuth, (req, res) => {
  const ip = sanitize(req.body.ip || '', 45);
  if (!ip || !/^[\d.:a-fA-F]+$/.test(ip)) return res.status(400).json({ error: 'Invalid IP' });
  const list = readBlockedIps();
  if (!list.includes(ip)) { list.push(ip); writeBlockedIps(list); }
  res.json({ success: true, blocked: list });
});
app.delete('/api/admin/block-ip/:ip', adminLimiter, requireAuth, (req, res) => {
  const ip = decodeURIComponent(req.params.ip);
  if (!/^[\d.:a-fA-F]+$/.test(ip)) return res.status(400).json({ error: 'Invalid IP' });
  writeBlockedIps(readBlockedIps().filter(x => x !== ip));
  res.json({ success: true });
});

app.post('/api/admin/backup', adminLimiter, requireAuth, (req, res) => {
  try {
    runBackup();
    res.json({ success: true, backupCount: fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('orders-')).length });
  } catch { res.status(500).json({ error: 'Backup failed' }); }
});

app.get('/api/admin/backups', adminLimiter, requireAuth, (req, res) => {
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('orders-'))
    .sort().reverse()
    .map(f => ({ name: f, size: fs.statSync(path.join(BACKUP_DIR, f)).size, date: f.replace('orders-', '').replace('.json', '') }));
  res.json(files);
});

/* ════════════════════════════════════════
   ADMIN — COUPONS (CRUD)
════════════════════════════════════════ */
app.get('/api/admin/coupons', adminLimiter, requireAuth, async (req, res) => {
  try {
    const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(coupons);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch coupons' });
  }
});

app.post('/api/admin/coupons', adminLimiter, requireAuth, async (req, res) => {
  try {
    const { code, type, value, minOrder, maxUses, expiresAt, isActive } = req.body;
    if (!code || value === undefined) return res.status(400).json({ error: 'code and value are required' });
    const coupon = await prisma.coupon.create({
      data: {
        code:      sanitize(code, 50).toUpperCase(),
        type:      type || 'percent',
        value:     parseFloat(value),
        minOrder:  parseFloat(minOrder) || 0,
        maxUses:   parseInt(maxUses) || 0,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        isActive:  isActive !== false,
      }
    });
    res.status(201).json(coupon);
  } catch (err) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'Coupon code already exists' });
    console.error(err);
    res.status(500).json({ error: 'Failed to create coupon' });
  }
});

app.patch('/api/admin/coupons/:id', adminLimiter, requireAuth, async (req, res) => {
  try {
    const { code, type, value, minOrder, maxUses, expiresAt, isActive } = req.body;
    const data = {};
    if (code      !== undefined) data.code      = sanitize(code, 50).toUpperCase();
    if (type      !== undefined) data.type      = type;
    if (value     !== undefined) data.value     = parseFloat(value);
    if (minOrder  !== undefined) data.minOrder  = parseFloat(minOrder) || 0;
    if (maxUses   !== undefined) data.maxUses   = parseInt(maxUses) || 0;
    if (expiresAt !== undefined) data.expiresAt = expiresAt ? new Date(expiresAt) : null;
    if (isActive  !== undefined) data.isActive  = Boolean(isActive);
    const coupon = await prisma.coupon.update({ where: { id: req.params.id }, data });
    res.json(coupon);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Coupon not found' });
    console.error(err);
    res.status(500).json({ error: 'Failed to update coupon' });
  }
});

app.delete('/api/admin/coupons/:id', adminLimiter, requireAuth, async (req, res) => {
  try {
    await prisma.coupon.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Coupon not found' });
    res.status(500).json({ error: 'Failed to delete coupon' });
  }
});

/* ════════════════════════════════════════
   ADMIN — DEALS (CRUD)
════════════════════════════════════════ */
app.get('/api/admin/deals', adminLimiter, requireAuth, async (req, res) => {
  try {
    const deals = await prisma.$queryRaw`SELECT * FROM Deal ORDER BY createdAt DESC`;
    res.json(deals);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch deals' });
  }
});

app.post('/api/admin/deals', adminLimiter, requireAuth, async (req, res) => {
  try {
    const { title, productId, discountPrice, isActive } = req.body;
    if (!title || !discountPrice) return res.status(400).json({ error: 'title and discountPrice required' });
    const id = 'deal-' + Date.now();
    await prisma.$executeRaw`INSERT INTO Deal (id, title, productId, discountPrice, isActive) VALUES (${id}, ${sanitize(title, 200)}, ${productId || null}, ${parseFloat(discountPrice)}, ${isActive !== false ? 1 : 0})`;
    const [deal] = await prisma.$queryRaw`SELECT * FROM Deal WHERE id = ${id}`;
    res.status(201).json(deal);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create deal' });
  }
});

app.patch('/api/admin/deals/:id', adminLimiter, requireAuth, async (req, res) => {
  try {
    const { title, productId, discountPrice, isActive } = req.body;
    if (title !== undefined) await prisma.$executeRaw`UPDATE Deal SET title = ${sanitize(title, 200)} WHERE id = ${req.params.id}`;
    if (discountPrice !== undefined) await prisma.$executeRaw`UPDATE Deal SET discountPrice = ${parseFloat(discountPrice)} WHERE id = ${req.params.id}`;
    if (productId !== undefined) await prisma.$executeRaw`UPDATE Deal SET productId = ${productId || null} WHERE id = ${req.params.id}`;
    if (isActive !== undefined) await prisma.$executeRaw`UPDATE Deal SET isActive = ${isActive ? 1 : 0} WHERE id = ${req.params.id}`;
    const [deal] = await prisma.$queryRaw`SELECT * FROM Deal WHERE id = ${req.params.id}`;
    res.json(deal);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update deal' });
  }
});

app.delete('/api/admin/deals/:id', adminLimiter, requireAuth, async (req, res) => {
  try {
    await prisma.$executeRaw`DELETE FROM Deal WHERE id = ${req.params.id}`;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete deal' });
  }
});

/* Public deals endpoint */
app.get('/api/deals', async (req, res) => {
  try {
    const deals = await prisma.$queryRaw`SELECT * FROM Deal WHERE isActive = 1 ORDER BY createdAt DESC`;
    res.json(deals);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch deals' });
  }
});

/* ════════════════════════════════════════
   ADMIN — PRODUCTS (CRUD)
════════════════════════════════════════ */

/* ════════════════════════════════════════
   ADMIN — REVIEWS
════════════════════════════════════════ */
app.get('/api/admin/reviews', adminLimiter, requireAuth, async (req, res) => {
  try {
    const { status } = req.query;
    const where = status === 'pending' ? { approved: false } : status === 'approved' ? { approved: true } : {};
    const reviews = await prisma.review.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json(reviews);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch reviews' }); }
});

app.patch('/api/admin/reviews/:id', adminLimiter, requireAuth, async (req, res) => {
  try {
    const review = await prisma.review.update({ where: { id: req.params.id }, data: { approved: Boolean(req.body.approved) } });
    res.json(review);
  } catch (err) { res.status(500).json({ error: 'Failed to update review' }); }
});

app.delete('/api/admin/reviews/:id', adminLimiter, requireAuth, async (req, res) => {
  try {
    await prisma.review.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete review' }); }
});

/* GET /api/admin/products */
app.get('/api/admin/products', adminLimiter, requireAuth, async (req, res) => {
  try {
    const { status, q } = req.query;
    const where = {};
    if (status) where.status = status;
    if (q) where.name = { contains: q };
    const products = await prisma.product.findMany({
      where,
      include: { images: { where: { isMain: true }, take: 1 }, variants: true },
      orderBy: { sortOrder: 'asc' },
    });
    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

/* GET /api/admin/products/:id */
app.get('/api/admin/products/:id', adminLimiter, requireAuth, async (req, res) => {
  try {
    const product = await prisma.product.findUnique({
      where:   { id: req.params.id },
      include: { images: { orderBy: { sortOrder: 'asc' } }, variants: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!product) return res.status(404).json({ error: 'Not found' });
    res.json(product);
  } catch {
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

/* POST /api/admin/products */
app.post('/api/admin/products', adminLimiter, requireAuth, async (req, res) => {
  try {
    const { name, shortName, description, price, costPrice, comparePrice, badge, fit, fitFilter, category, href, status, variants, videoUrl, color, isFeatured } = req.body;
    if (!name || !price) return res.status(400).json({ error: 'name and price are required' });
    let slug = slugify(name);
    const existing = await prisma.product.findUnique({ where: { slug } });
    if (existing) slug = slug + '-' + Date.now();

    const product = await prisma.product.create({
      data: {
        name:         sanitize(name, 200),
        shortName:    shortName ? sanitize(shortName, 60) : null,
        slug,
        description:  sanitize(description || '', 5000),
        price:        parseFloat(price),
        comparePrice: comparePrice ? parseFloat(comparePrice) : null,
        costPrice:    costPrice ? parseFloat(costPrice) : null,
        badge:        badge || null,
        fit:          fit || null,
        fitFilter:    fitFilter || null,
        category:     category || null,
        href:         href || null,
        videoUrl:     videoUrl || null,
        color:        color || null,
        status:       (status || 'ACTIVE').toUpperCase(),
        isFeatured:   Boolean(isFeatured),
        variants: variants ? {
          create: variants.map(v => ({
            size:    v.size || null,
            inStock: v.inStock !== false,
            stock:   parseInt(v.stock) || 10,
          }))
        } : undefined,
      },
      include: { images: true, variants: true },
    });

    _productsCache = null;
    emit('product:created', { product });
    res.status(201).json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

/* PATCH /api/admin/products/:id */
app.patch('/api/admin/products/:id', adminLimiter, requireAuth, async (req, res) => {
  try {
    const { name, shortName, description, price, costPrice, comparePrice, badge, fit, fitFilter, category, href, status, sortOrder, videoUrl, color, isFeatured } = req.body;
    const data = {};
    if (name         !== undefined) { data.name = sanitize(name, 200); data.slug = slugify(name); }
    if (shortName    !== undefined) data.shortName = shortName ? sanitize(shortName, 60) : null;
    if (description  !== undefined) data.description  = sanitize(description, 5000);
    if (price        !== undefined) data.price         = parseFloat(price);
    if (comparePrice !== undefined) data.comparePrice  = comparePrice ? parseFloat(comparePrice) : null;
    if (costPrice    !== undefined) data.costPrice     = costPrice ? parseFloat(costPrice) : null;
    if (badge        !== undefined) data.badge         = badge || null;
    if (fit          !== undefined) data.fit           = fit || null;
    if (fitFilter    !== undefined) data.fitFilter     = fitFilter || null;
    if (category     !== undefined) data.category      = category || null;
    if (href         !== undefined) data.href          = href || null;
    if (videoUrl     !== undefined) data.videoUrl      = videoUrl || null;
    if (color        !== undefined) data.color         = color || null;
    if (status       !== undefined) data.status        = status.toUpperCase();
    if (sortOrder    !== undefined) data.sortOrder     = parseInt(sortOrder);
    if (isFeatured   !== undefined) data.isFeatured    = Boolean(isFeatured);

    const product = await prisma.product.update({
      where:   { id: req.params.id },
      data,
      include: { images: { orderBy: { sortOrder: 'asc' } }, variants: true },
    });

    _productsCache = null;
    emit('product:updated', { productId: product.id, product });
    res.json(product);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Not found' });
    console.error(err);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

/* DELETE /api/admin/products/:id */
app.delete('/api/admin/products/:id', adminLimiter, requireAuth, async (req, res) => {
  try {
    await prisma.product.delete({ where: { id: req.params.id } });
    _productsCache = null;
    emit('product:deleted', { productId: req.params.id });
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Not found' });
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

/* POST /api/admin/products/:id/variants — add/replace variants */
app.post('/api/admin/products/:id/variants', adminLimiter, requireAuth, async (req, res) => {
  try {
    const { variants } = req.body;
    if (!Array.isArray(variants)) return res.status(400).json({ error: 'variants must be an array' });
    await prisma.variant.deleteMany({ where: { productId: req.params.id } });
    await prisma.variant.createMany({
      data: variants.map((v, i) => ({
        productId: req.params.id,
        size:      v.size || null,
        inStock:   v.inStock !== false,
        stock:     parseInt(v.stock) || 10,
        sortOrder: i,
      }))
    });
    const product = await prisma.product.findUnique({
      where:   { id: req.params.id },
      include: { images: true, variants: { orderBy: { sortOrder: 'asc' } } },
    });
    emit('product:updated', { productId: req.params.id, product });
    res.json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update variants' });
  }
});

/* PATCH /api/admin/products/:id/variants/:variantId — toggle in-stock status */
app.patch('/api/admin/products/:id/variants/:variantId', adminLimiter, requireAuth, async (req, res) => {
  try {
    const { inStock, stock } = req.body;
    const data = {};
    if (inStock !== undefined) data.inStock = Boolean(inStock);
    if (stock   !== undefined) data.stock   = parseInt(stock) || 0;
    const variant = await prisma.variant.update({
      where: { id: req.params.variantId },
      data,
    });
    const product = await prisma.product.findUnique({
      where:   { id: req.params.id },
      include: { images: true, variants: { orderBy: { sortOrder: 'asc' } } },
    });
    emit('product:updated', { productId: req.params.id, product });
    res.json(variant);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Variant not found' });
    console.error(err);
    res.status(500).json({ error: 'Failed to update variant' });
  }
});

/* ── Product images ── */

/* POST /api/admin/upload — upload image/video to Cloudinary, return URL */
app.post('/api/admin/upload', adminLimiter, requireAuth, upload.single('file'), async (req, res) => {
  console.log('Upload request received, file:', req.file ? req.file.originalname : 'none');
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const isVideo    = /\.(mp4|mov|webm|avi)$/i.test(req.file.originalname);
    const productId  = req.body.productId || null;

    let uploadOptions;
    if (isVideo && productId) {
      // Use deterministic public_id so re-uploading replaces the old video in-place
      // Old Cloudinary file is overwritten — no orphaned files accumulate
      const deterministicId = `streetstore/products/${productId}/video`;

      // If product has an old video with a different public_id (legacy random name), delete it
      try {
        const existing = await prisma.product.findUnique({ where: { id: productId }, select: { videoUrl: true } });
        if (existing && existing.videoUrl) {
          const oldPublicId = existing.videoUrl.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.\w+)?$/)?.[1];
          if (oldPublicId && oldPublicId !== deterministicId) {
            await cloudinary.uploader.destroy(oldPublicId, { resource_type: 'video', invalidate: true })
              .catch(e => console.warn('Could not delete old video:', e.message));
          }
        }
      } catch (e) { console.warn('Old video cleanup skipped:', e.message); }

      uploadOptions = {
        resource_type:   'video',
        public_id:       deterministicId,
        overwrite:       true,
        invalidate:      true,
      };
    } else {
      uploadOptions = {
        resource_type:   isVideo ? 'video' : 'image',
        folder:          'streetstore',
        use_filename:    true,
        unique_filename: true,
      };
    }

    const result = await streamUpload(req.file.buffer, uploadOptions);
    return res.json({ url: result.secure_url, publicId: result.public_id });
  } catch (err) {
    console.error('Cloudinary upload error:', err.message);
    res.status(500).json({ error: 'Upload failed' });
  }
});

/* POST /api/admin/products/:id/images — add image record after upload */
app.post('/api/admin/products/:id/images', adminLimiter, requireAuth, async (req, res) => {
  try {
    const { url, publicId, alt, isMain } = req.body;
    if (!url) return res.status(400).json({ error: 'url is required' });
    const count = await prisma.image.count({ where: { productId: req.params.id } });
    if (isMain) {
      await prisma.image.updateMany({ where: { productId: req.params.id }, data: { isMain: false } });
    }
    const image = await prisma.image.create({
      data: {
        productId: req.params.id,
        url,
        publicId:  publicId || '',
        alt:       alt || null,
        isMain:    isMain || count === 0,
        sortOrder: count,
      }
    });
    const product = await prisma.product.findUnique({
      where:   { id: req.params.id },
      include: { images: { orderBy: { sortOrder: 'asc' } }, variants: true },
    });
    emit('product:updated', { productId: req.params.id, product });
    res.status(201).json(image);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add image' });
  }
});

/* DELETE /api/admin/products/:id/images/:imageId */
app.delete('/api/admin/products/:id/images/:imageId', adminLimiter, requireAuth, async (req, res) => {
  try {
    await prisma.image.delete({ where: { id: req.params.imageId } });
    const product = await prisma.product.findUnique({
      where:   { id: req.params.id },
      include: { images: { orderBy: { sortOrder: 'asc' } }, variants: true },
    });
    emit('product:updated', { productId: req.params.id, product });
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Image not found' });
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

/* PATCH /api/admin/products/:id/images/:imageId — set main */
app.patch('/api/admin/products/:id/images/:imageId', adminLimiter, requireAuth, async (req, res) => {
  try {
    const { isMain, alt } = req.body;
    if (isMain) {
      await prisma.image.updateMany({ where: { productId: req.params.id }, data: { isMain: false } });
    }
    const image = await prisma.image.update({
      where: { id: req.params.imageId },
      data: {
        ...(isMain !== undefined && { isMain }),
        ...(alt    !== undefined && { alt }),
      }
    });
    emit('product:updated', { productId: req.params.id });
    res.json(image);
  } catch {
    res.status(500).json({ error: 'Failed to update image' });
  }
});

/* POST /api/admin/products/:id/images/reorder */
app.post('/api/admin/products/:id/images/reorder', adminLimiter, requireAuth, async (req, res) => {
  try {
    const { imageIds } = req.body;
    if (!Array.isArray(imageIds)) return res.status(400).json({ error: 'imageIds required' });
    await Promise.all(imageIds.map((id, idx) => prisma.image.update({ where: { id }, data: { sortOrder: idx } })));
    emit('product:updated', { productId: req.params.id });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to reorder images' });
  }
});

/* ── Bulk product actions ── */
app.post('/api/admin/products/bulk', adminLimiter, requireAuth, async (req, res) => {
  try {
    const { action, ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids required' });
    if (action === 'delete') {
      await prisma.product.deleteMany({ where: { id: { in: ids } } });
    } else if (action === 'publish') {
      await prisma.product.updateMany({ where: { id: { in: ids } }, data: { status: 'ACTIVE' } });
    } else if (action === 'archive') {
      await prisma.product.updateMany({ where: { id: { in: ids } }, data: { status: 'ARCHIVED' } });
    } else if (action === 'draft') {
      await prisma.product.updateMany({ where: { id: { in: ids } }, data: { status: 'DRAFT' } });
    } else {
      return res.status(400).json({ error: 'Unknown action' });
    }
    _productsCache = null;
    emit('product:bulkUpdated', { ids, action });
    res.json({ success: true, count: ids.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Bulk action failed' });
  }
});

/* ════════════════════════════════════════
   ADMIN — BANNERS
════════════════════════════════════════ */
app.get('/api/admin/banners', adminLimiter, requireAuth, async (req, res) => {
  try {
    const banners = await prisma.banner.findMany({ orderBy: { sortOrder: 'asc' } });
    res.json(banners);
  } catch { res.status(500).json({ error: 'Failed to fetch banners' }); }
});

app.post('/api/admin/banners', adminLimiter, requireAuth, async (req, res) => {
  try {
    const { title, subtitle, imageUrl, publicId, linkUrl, position, isActive } = req.body;
    if (!title || !imageUrl) return res.status(400).json({ error: 'title and imageUrl required' });
    const count  = await prisma.banner.count();
    const banner = await prisma.banner.create({
      data: {
        title,
        subtitle:  subtitle || null,
        imageUrl,
        publicId:  publicId || '',
        linkUrl:   linkUrl || null,
        position:  position || 'hero',
        isActive:  isActive !== false,
        sortOrder: count
      }
    });
    emit('banner:changed', { bannerId: banner.id });
    res.status(201).json(banner);
  } catch { res.status(500).json({ error: 'Failed to create banner' }); }
});

app.patch('/api/admin/banners/:id', adminLimiter, requireAuth, async (req, res) => {
  try {
    const { title, subtitle, imageUrl, publicId, linkUrl, position, isActive, sortOrder } = req.body;
    const banner = await prisma.banner.update({
      where: { id: req.params.id },
      data: {
        ...(title     !== undefined && { title }),
        ...(subtitle  !== undefined && { subtitle }),
        ...(imageUrl  !== undefined && { imageUrl }),
        ...(publicId  !== undefined && { publicId }),
        ...(linkUrl   !== undefined && { linkUrl }),
        ...(position  !== undefined && { position }),
        ...(isActive  !== undefined && { isActive }),
        ...(sortOrder !== undefined && { sortOrder: parseInt(sortOrder) }),
      }
    });
    emit('banner:changed', { bannerId: banner.id });
    res.json(banner);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Not found' });
    res.status(500).json({ error: 'Failed to update banner' });
  }
});

app.delete('/api/admin/banners/:id', adminLimiter, requireAuth, async (req, res) => {
  try {
    await prisma.banner.delete({ where: { id: req.params.id } });
    emit('banner:changed', {});
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Not found' });
    res.status(500).json({ error: 'Failed to delete banner' });
  }
});

/* ════════════════════════════════════════
   ADMIN — SITE SETTINGS
════════════════════════════════════════ */
app.get('/api/admin/settings', adminLimiter, requireAuth, async (req, res) => {
  try {
    const settings = await prisma.siteSettings.findUnique({ where: { id: 'singleton' } });
    res.json(settings || {});
  } catch { res.status(500).json({ error: 'Failed to fetch settings' }); }
});

app.patch('/api/admin/settings', adminLimiter, requireAuth, async (req, res) => {
  try {
    const { storeName, primaryColor, accentColor, currency, whatsapp, email, logo, logoPublicId, announcementBar, announcementActive, packDeal2, packDeal3, packDealBadge, packDealSub, packEnabled, bundle3Price, bundle3Enabled, whatsappBotKey, heroVideoUrl, heroVideoActive } = req.body;
    const data = {};
    if (storeName          !== undefined) data.storeName          = sanitize(storeName, 100);
    if (primaryColor       !== undefined) data.primaryColor       = sanitize(primaryColor, 20);
    if (accentColor        !== undefined) data.accentColor        = sanitize(accentColor, 20);
    if (currency           !== undefined) data.currency           = sanitize(currency, 10);
    if (whatsapp           !== undefined) data.whatsapp           = sanitize(whatsapp, 30);
    if (email              !== undefined) data.email              = sanitize(email, 100);
    if (logo               !== undefined) data.logo               = logo || null;
    if (logoPublicId       !== undefined) data.logoPublicId       = logoPublicId || null;
    if (announcementBar    !== undefined) data.announcementBar    = sanitize(announcementBar, 300);
    if (announcementActive !== undefined) data.announcementActive = Boolean(announcementActive);
    if (packDeal2     !== undefined) data.packDeal2     = parseFloat(packDeal2) || 319;
    if (packDeal3     !== undefined) data.packDeal3     = parseFloat(packDeal3) || 479;
    if (packDealBadge !== undefined) data.packDealBadge = sanitize(packDealBadge, 100);
    if (packDealSub   !== undefined) data.packDealSub   = sanitize(packDealSub, 100);
    if (packEnabled     !== undefined) data.packEnabled     = Boolean(packEnabled);
    if (bundle3Price    !== undefined) data.bundle3Price    = parseFloat(bundle3Price) || 499;
    if (bundle3Enabled  !== undefined) data.bundle3Enabled  = Boolean(bundle3Enabled);
    if (whatsappBotKey  !== undefined) data.whatsappBotKey = sanitize(whatsappBotKey, 100);
    if (heroVideoUrl    !== undefined) data.heroVideoUrl   = heroVideoUrl || null;
    if (heroVideoActive !== undefined) data.heroVideoActive = Boolean(heroVideoActive);

    const settings = await prisma.siteSettings.upsert({
      where:  { id: 'singleton' },
      update: data,
      create: { id: 'singleton', ...data },
    });
    emit('settings:changed', settings);
    res.json(settings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

/* ════════════════════════════════════════
   SITE API CREDENTIALS
════════════════════════════════════════ */

app.get('/api/admin/api-credentials', adminLimiter, requireAuth, async (req, res) => {
  try {
    const row = await prisma.$queryRawUnsafe(
      'SELECT siteApiKey, siteApiSecret FROM `SiteSettings` WHERE id = "singleton" LIMIT 1'
    );
    const r = row[0] || {};
    res.json({ apiKey: r.siteApiKey || '', apiSecret: r.siteApiSecret || '' });
  } catch { res.status(500).json({ error: 'Failed to fetch credentials' }); }
});

app.post('/api/admin/api-credentials/regenerate', adminLimiter, requireAuth, async (req, res) => {
  try {
    const apiKey    = crypto.randomBytes(24).toString('hex');
    const apiSecret = crypto.randomBytes(32).toString('hex');
    await prisma.$executeRawUnsafe(
      'UPDATE `SiteSettings` SET siteApiKey = ?, siteApiSecret = ? WHERE id = "singleton"',
      apiKey, apiSecret
    );
    res.json({ apiKey, apiSecret });
  } catch { res.status(500).json({ error: 'Failed to regenerate credentials' }); }
});

/* ════════════════════════════════════════
   OLIVRAISON — AUTO-TRACKING
════════════════════════════════════════ */

/* Map Olivraison shipment statuses → StreetStore order statuses */
const OLIVRAISON_STATUS_MAP = {
  // Olivraison REST statuses (uppercase, trimmed to lowercase)
  created:          'processing',
  confirmed:        'processing',
  pickup:           'processing',
  assigned:         'processing',
  pickedup:         'processing',
  inhouse:          'processing',
  enroute:          'transit',
  transit:          'transit',
  in_transit:       'transit',
  out_for_delivery: 'transit',
  delivered:        'done',
  returned:         'cancelled',
  failed:           'reported',
  exception:        'reported',
  reported:         'reported',
  cancelled:        'cancelled',
  // webhook variants
  picked_up:        'processing',
};

/* Internal helper — called automatically after admin confirms an order */
async function autoSendToOlivraison(order) {
  const cfg = await prisma.olivraisonConfig.findUnique({ where: { id: 'singleton' } });
  if (!cfg || !cfg.isActive || !cfg.apiKey || !cfg.apiSecret) return; // not configured — skip silently

  const BASE_URL  = 'https://partners.olivraison.com';
  // Step 1: login to get bearer token
  const loginResp = await fetch(`${BASE_URL}/auth/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ apiKey: cfg.apiKey, secretKey: cfg.apiSecret }),
  });
  const loginJson = await loginResp.json();
  const token = loginJson.token;
  if (!token) throw new Error(loginJson.message || 'Olivraison login failed');

  // Step 2: create shipment
  const many = (order.items || []).length >= 3;
  const olivDesc = (order.items || []).map(i => {
    const name = (i.product?.shortName || i.name || '') + (i.product?.color ? ' ' + i.product.color : '');
    const size = i.size ? (many ? ' ' + i.size : ' (' + i.size + ')') : '';
    return `${name}${size} x${i.qty || 1}`;
  }).join(', ');
  const payload = {
    price:       String(order.total || 0),
    comment:     order.notes        || '',
    description: olivDesc,
    inventory:   true,
    name:        order.customer     || 'Unknown',
    destination: {
      name:          order.customer || 'Unknown',
      phone:         order.phone    || '',
      city:          order.city     || '',
      streetAddress: order.address  || '',
    },
  };

  console.log('[Olivraison auto-send payload]', JSON.stringify(payload));
  const resp = await fetch(`${BASE_URL}/package`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    JSON.stringify(payload),
  });
  const json = await resp.json();
  if (!resp.ok) {
    console.error('[Olivraison auto-send 400 body]', JSON.stringify(json));
    throw new Error(json.message || json.error || JSON.stringify(json) || `Olivraison error ${resp.status}`);
  }

  const trackingCode = json.trackingID || null;

  // Save tracking code + advance status to processing
  await prisma.$executeRawUnsafe(
    'UPDATE `Order` SET `trackingCode` = ?, `status` = ? WHERE `id` = ?',
    trackingCode, 'processing', order.id
  );

  emit('order:statusChanged', { orderId: order.id, newStatus: 'processing', trackingCode });
  console.log(`[Olivraison] Shipment created for order ${order.id} — tracking: ${trackingCode}`);
}

/* ════════════════════════════════════════
   OLIVRAISON POLLING SYNC
════════════════════════════════════════ */

/* Get a fresh Bearer token from Olivraison REST API */
async function getOlivraisonToken(cfg) {
  const resp = await fetch('https://partners.olivraison.com/auth/login', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ apiKey: cfg.apiKey, secretKey: cfg.apiSecret }),
  });
  const json = await resp.json();
  if (!json.token) throw new Error(json.message || 'Olivraison login failed');
  return json.token;
}

/* Fetch full package details from Olivraison REST — returns raw JSON */
async function fetchOlivraisonPackage(trackingCode, token) {
  const resp = await fetch(`https://partners.olivraison.com/package/${trackingCode}`, {
    method:  'GET',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const json = await resp.json();
  // Log full raw response so we can discover ALL available fields (incl. driver)
  console.log(`[Olivraison RAW] ${trackingCode}:`, JSON.stringify(json));
  return { ok: resp.ok, status: resp.status, data: json };
}

/* Extract driver phone from Olivraison response — tries every known field name */
function extractDriverPhone(data) {
  if (!data) return null;
  return (
    data.transport?.currentDriverPhone ||   // confirmed field from real API test
    data.transport?.driverPhone        ||
    data.driverPhone                   ||
    data.courierPhone                  ||
    data.agentPhone                    ||
    data.deliveryPhone                 ||
    data.driver?.phone                 ||
    data.courier?.phone                ||
    data.livreur?.phone                ||
    data.livreur?.telephone            ||
    data.agent?.phone                  ||
    data.deliveryman?.phone            ||
    null
  );
}

/* Extract driver name from Olivraison response */
function extractDriverName(data) {
  if (!data) return null;
  const raw =
    data.transport?.currentDriverName ||
    data.transport?.driverName        ||
    data.driver?.name                 ||
    data.courier?.name                ||
    null;
  if (!raw) return null;
  // Clean up "username - real name nv" format → take part after " - "
  const parts = raw.split(' - ');
  return (parts[1] || parts[0]).replace(/\s*nv\s*$/i, '').trim();
}

/* Core sync: polls Olivraison for all in-progress orders and updates DB */
async function syncOlivraisonOrders() {
  try {
    const cfg = await prisma.olivraisonConfig.findUnique({ where: { id: 'singleton' } });
    if (!cfg || !cfg.isActive || !cfg.apiKey || !cfg.apiSecret) return;

    // Find all orders that have a trackingCode and are not yet finished
    const activeOrders = await prisma.$queryRawUnsafe(
      `SELECT id, trackingCode, status, pushEndpoint, customerId FROM \`Order\`
       WHERE trackingCode IS NOT NULL AND trackingCode != ''
       AND status NOT IN ('done','delivered','cancelled')
       LIMIT 100`
    );

    if (!activeOrders.length) {
      console.log('[Olivraison Sync] No active tracked orders to poll.');
      return;
    }

    console.log(`[Olivraison Sync] Polling ${activeOrders.length} orders…`);
    const token = await getOlivraisonToken(cfg);

    let updated = 0;
    for (const order of activeOrders) {
      try {
        const { ok, data } = await fetchOlivraisonPackage(order.trackingCode, token);
        if (!ok || !data) continue;

        const olivStatus  = (data.status || '').trim().toLowerCase().replace(/\s+/g, '_');
        const newStatus   = OLIVRAISON_STATUS_MAP[olivStatus];
        const driverPhone = extractDriverPhone(data);
        const driverName  = extractDriverName(data);

        // Build update only if something changed
        const statusChanged = newStatus && newStatus !== order.status;
        const phoneFound    = driverPhone && driverPhone.length > 4;
        const nameFound     = driverName  && driverName.length  > 1;

        if (statusChanged || phoneFound || nameFound) {
          const setParts = [];
          const vals     = [];
          if (statusChanged) { setParts.push('`status` = ?');        vals.push(newStatus); }
          if (phoneFound)    { setParts.push('`deliveryPhone` = ?'); vals.push(driverPhone); }
          if (nameFound)     { setParts.push('`deliveryName` = ?');  vals.push(driverName); }
          vals.push(order.id);
          await prisma.$executeRawUnsafe(
            `UPDATE \`Order\` SET ${setParts.join(', ')} WHERE id = ?`, ...vals
          );
          emit('order:statusChanged', {
            orderId: order.id,
            newStatus: statusChanged ? newStatus : order.status,
            trackingCode: order.trackingCode,
            deliveryPhone: driverPhone,
            deliveryName: driverName
          });
          if (statusChanged) {
            sendOrderStatusPush(order, newStatus).catch(() => {});
          }
          console.log(`[Olivraison Sync] Order ${order.id} → status:${newStatus || '(unchanged)'} driver:${driverName || '?'} phone:${driverPhone || 'none'}`);
          updated++;
        }
      } catch (err) {
        console.error(`[Olivraison Sync] Error on order ${order.id}:`, err.message);
      }
    }
    console.log(`[Olivraison Sync] Done — ${updated}/${activeOrders.length} orders updated.`);
  } catch (err) {
    console.error('[Olivraison Sync] Fatal error:', err.message);
  }
}

/* Run sync on startup (after 10s) then every 2 hours */
setTimeout(syncOlivraisonOrders, 10000);
setInterval(syncOlivraisonOrders, 2 * 60 * 60 * 1000);

/* Admin — manual trigger + raw response test */
app.post('/api/admin/olivraison/sync', adminLimiter, requireAuth, async (req, res) => {
  try {
    const cfg = await prisma.olivraisonConfig.findUnique({ where: { id: 'singleton' } });
    if (!cfg || !cfg.apiKey || !cfg.apiSecret) return res.status(400).json({ error: 'Olivraison not configured' });

    // If a specific trackingCode is passed → return raw response for inspection
    const { trackingCode } = req.body || {};
    if (trackingCode) {
      const token = await getOlivraisonToken(cfg);
      const { ok, status, data } = await fetchOlivraisonPackage(trackingCode, token);
      return res.json({ trackingCode, httpStatus: status, raw: data, driverPhone: extractDriverPhone(data) });
    }

    // Otherwise run full sync and return summary
    await syncOlivraisonOrders();
    res.json({ ok: true, message: 'Sync completed — check server logs for details' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/delivery/webhook — Olivraison pushes status updates here */
app.post('/api/delivery/webhook', async (req, res) => {
  // Respond immediately so Olivraison doesn't retry
  res.sendStatus(200);

  const { trackingCode, tracking_number, status } = req.body;
  const code = trackingCode || tracking_number;
  if (!code || !status) return;

  const olivStatus = (status || '').trim().toLowerCase().replace(/\s+/g, '_');
  const newStatus  = OLIVRAISON_STATUS_MAP[olivStatus];
  if (!newStatus) return;

  // Try to get driver phone from webhook payload
  let deliveryPhone = extractDriverPhone(req.body);

  // If not in payload but driver is now assigned, poll Olivraison REST for it
  if (!deliveryPhone && ['assigned', 'in_transit', 'out_for_delivery'].includes(olivStatus)) {
    try {
      const cfg = await prisma.olivraisonConfig.findUnique({ where: { id: 'singleton' } });
      if (cfg?.apiKey && cfg?.apiSecret) {
        const token = await getOlivraisonToken(cfg);
        const { data } = await fetchOlivraisonPackage(code, token);
        deliveryPhone = extractDriverPhone(data);
      }
    } catch(e) { console.error('[Webhook] driver fetch error:', e.message); }
  }

  try {
    const [row] = await prisma.$queryRawUnsafe(
      'SELECT id FROM `Order` WHERE `trackingCode` = ? LIMIT 1', code
    );
    if (!row) return;

    if (deliveryPhone) {
      await prisma.$executeRawUnsafe(
        'UPDATE `Order` SET `status` = ?, `deliveryPhone` = ? WHERE `id` = ?',
        newStatus, deliveryPhone, row.id
      );
    } else {
      await prisma.$executeRawUnsafe(
        'UPDATE `Order` SET `status` = ? WHERE `id` = ?',
        newStatus, row.id
      );
    }

    emit('order:statusChanged', { orderId: row.id, newStatus, trackingCode: code, deliveryPhone });
    console.log(`[Webhook] Order ${row.id} → ${newStatus} | driver: ${deliveryPhone || 'not yet assigned'}`);
  } catch (err) {
    console.error('[Webhook] Error processing delivery update:', err.message);
  }
});

/* ════════════════════════════════════════
   CITIES LIST
════════════════════════════════════════ */
const CITIES_FILE = path.join(__dirname, 'cities.json');

function loadCities() {
  try {
    if (fs.existsSync(CITIES_FILE)) {
      return JSON.parse(fs.readFileSync(CITIES_FILE, 'utf8'));
    }
  } catch (e) {}
  return null;
}

/* Public — used by cities.js on every page */
app.get('/api/cities', (req, res) => {
  const saved = loadCities();
  if (saved) return res.json({ cities: saved });
  res.json({ cities: [] }); // fallback to hardcoded list in cities.js
});

/* Admin — save edited list */
app.put('/api/admin/cities', adminLimiter, requireAuth, (req, res) => {
  const { cities } = req.body;
  if (!Array.isArray(cities) || !cities.length) return res.status(400).json({ error: 'Invalid city list' });
  try {
    const clean = cities.map(c => String(c).trim()).filter(Boolean);
    fs.writeFileSync(CITIES_FILE, JSON.stringify(clean, null, 2), 'utf8');
    res.json({ ok: true, count: clean.length });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save cities' });
  }
});

/* ════════════════════════════════════════
   OLIVRAISON
════════════════════════════════════════ */
app.get('/api/admin/olivraison/config', adminLimiter, requireAuth, async (req, res) => {
  try {
    const config = await prisma.olivraisonConfig.findUnique({ where: { id: 'singleton' } });
    res.json(config || {});
  } catch { res.status(500).json({ error: 'Failed to fetch config' }); }
});

app.patch('/api/admin/olivraison/config', adminLimiter, requireAuth, async (req, res) => {
  try {
    const { apiKey, apiSecret, storeId, isActive } = req.body;
    const config = await prisma.olivraisonConfig.upsert({
      where:  { id: 'singleton' },
      update: {
        ...(apiKey    !== undefined && { apiKey:    sanitize(apiKey, 500) }),
        ...(apiSecret !== undefined && { apiSecret: sanitize(apiSecret, 500) }),
        ...(storeId   !== undefined && { storeId:   sanitize(storeId, 100) }),
        ...(isActive  !== undefined && { isActive:  Boolean(isActive) }),
      },
      create: { id: 'singleton', apiKey: sanitize(apiKey||'',500), apiSecret: sanitize(apiSecret||'',500), storeId: storeId || '', isActive: false },
    });
    res.json(config);
  } catch { res.status(500).json({ error: 'Failed to save config' }); }
});

app.post('/api/admin/olivraison/send', adminLimiter, requireAuth, async (req, res) => {
  const { orderIds, descriptions = {} } = req.body;
  if (!Array.isArray(orderIds) || !orderIds.length) return res.status(400).json({ error: 'No order IDs provided' });

  // Read credentials from DB
  const cfg = await prisma.olivraisonConfig.findUnique({ where: { id: 'singleton' } });
  if (!cfg?.apiKey || !cfg?.apiSecret) return res.status(400).json({ error: 'Olivraison credentials not configured. Go to Integrations and save your API keys.' });

  const BASE_URL = 'https://partners.olivraison.com';

  // Login once for all orders in this batch
  let token;
  try {
    const loginResp = await fetch(`${BASE_URL}/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ apiKey: cfg.apiKey, secretKey: cfg.apiSecret }),
    });
    const loginJson = await loginResp.json();
    token = loginJson.token;
    if (!token) return res.status(401).json({ error: loginJson.message || 'Olivraison login failed' });
  } catch (err) {
    return res.status(502).json({ error: 'Could not reach Olivraison: ' + err.message });
  }

  const results = [];

  for (const id of orderIds.slice(0, 100)) {
    let order;
    try {
      order = await prisma.order.findUnique({ where: { id }, include: { items: { include: { product: { select: { shortName: true, color: true } } } } } });
    } catch (e) {
      results.push({ orderId: id, success: false, error: 'DB error' });
      continue;
    }
    if (!order) { results.push({ orderId: id, success: false, error: 'Order not found' }); continue; }

    if (order.trackingCode) {
      results.push({ orderId: id, customer: order.customer, success: false, error: `Already sent — tracking: ${order.trackingCode}`, trackingCode: order.trackingCode });
      continue;
    }

    const many = order.items.length >= 3;
    const autoDesc = order.items.map(i => {
      const name = (i.product?.shortName || i.name || '') + (i.product?.color ? ' ' + i.product.color : '');
      const size = i.size ? (many ? ' ' + i.size : ' (' + i.size + ')') : '';
      return `${name}${size} x${i.qty || 1}`;
    }).join(', ');
    const description = descriptions[id] || autoDesc;
    const payload = {
      price:       String(order.total || 0),
      comment:     order.notes        || '',
      description,
      inventory:   true,
      name:        order.customer     || 'Unknown',
      destination: {
        name:          order.customer || 'Unknown',
        phone:         order.phone    || '',
        city:          order.city     || '',
        streetAddress: order.address  || '',
      },
    };

    try {
      console.log(`[Olivraison manual send payload ${id}]`, JSON.stringify(payload));
      const resp = await fetch(`${BASE_URL}/package`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify(payload),
      });
      const json = await resp.json();
      if (!resp.ok) {
        console.error(`[Olivraison manual send ${id}]`, resp.status, JSON.stringify(json));
        results.push({ orderId: id, customer: order.customer, success: false, error: json.message || json.error || JSON.stringify(json) || `Error ${resp.status}` });
      } else {
        const trackingCode = json.trackingID || null;
        await prisma.order.update({
          where: { id },
          data:  { status: 'processing', trackingCode },
        });
        results.push({ orderId: id, customer: order.customer, success: true, trackingCode });
      }
    } catch (err) {
      results.push({ orderId: id, customer: order.customer, success: false, error: err.message });
    }
  }

  res.json({ results });
});

app.get('/api/admin/orders/:id/olivraison-status', adminLimiter, requireAuth, async (req, res) => {
  const { id } = req.params;
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order?.trackingCode) return res.status(404).json({ error: 'No tracking code for this order' });

  const cfg = await prisma.olivraisonConfig.findUnique({ where: { id: 'singleton' } });
  if (!cfg?.apiKey) return res.status(503).json({ error: 'Olivraison not configured' });

  try {
    const token = await getOlivraisonToken(cfg);
    const { ok, data } = await fetchOlivraisonPackage(order.trackingCode, token);
    if (!ok) return res.status(502).json({ error: 'Olivraison returned an error' });

    const rawStatus = (data.status || '').trim().toLowerCase().replace(/\s+/g, '_');
    const comment = data.comment || data.note || data.remarks || data.description || data.livreurComment || data.deliveryNote || data.message || null;
    res.json({ rawStatus, trackingCode: order.trackingCode, comment });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

/* POST /api/admin/migrate-images — one-time: upload local images to Cloudinary */
app.post('/api/admin/migrate-images', adminLimiter, requireAuth, async (req, res) => {
  const results = { uploaded: 0, skipped: 0, errors: [] };
  try {
    const images = await prisma.image.findMany({ include: { product: true } });
    const frontendDir = path.join(__dirname, '../frontend');

    for (const img of images) {
      // Skip already Cloudinary URLs
      if (img.url && img.url.includes('cloudinary.com')) { results.skipped++; continue; }
      // Resolve local file path
      const localPath = img.url ? path.join(frontendDir, img.url.startsWith('/') ? img.url.slice(1) : img.url) : null;
      if (!localPath || !fs.existsSync(localPath)) { results.errors.push({ id: img.id, url: img.url, reason: 'file not found' }); continue; }

      try {
        const fileBuffer = fs.readFileSync(localPath);
        const folder = 'streetstore/products/' + (img.product?.slug || 'misc');
        const result = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder, resource_type: 'image', use_filename: true, unique_filename: true },
            (err, r) => err ? reject(err) : resolve(r)
          );
          stream.end(fileBuffer);
        });
        await prisma.image.update({ where: { id: img.id }, data: { url: result.secure_url, publicId: result.public_id } });
        results.uploaded++;
      } catch (err) {
        results.errors.push({ id: img.id, url: img.url, reason: err.message });
      }
    }
    res.json({ success: true, ...results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ════════════════════════════════════════
   PUBLIC CONFIG
════════════════════════════════════════ */
app.get('/api/config/public', (req, res) => {
  res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || '' });
});

/* ════════════════════════════════════════
   CUSTOMER AUTH (Google Sign-In)
════════════════════════════════════════ */

/* POST /api/auth/google */
app.post('/api/auth/google', authLimiter, async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: 'No credential provided' });
  try {
    const info = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`).then(r => r.json());
    if (info.error) return res.status(401).json({ error: 'Invalid Google token' });
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (clientId && info.aud !== clientId) return res.status(401).json({ error: 'Token audience mismatch' });
    const { email, name, picture, sub: googleId } = info;
    if (!email) return res.status(400).json({ error: 'No email in token' });

    let isNew = false;
    let [customer] = await prisma.$queryRaw`SELECT id, name, email, avatar, googleId, phone, createdAt FROM Customer WHERE email = ${email} LIMIT 1`;
    if (!customer) {
      isNew = true;
      const id = 'cust-' + Date.now();
      await prisma.$executeRaw`INSERT INTO Customer (id, email, name, avatar, googleId) VALUES (${id}, ${email}, ${name || ''}, ${picture || null}, ${googleId || null})`;
      [customer] = await prisma.$queryRaw`SELECT id, name, email, avatar, googleId, phone, createdAt FROM Customer WHERE id = ${id} LIMIT 1`;
    } else if (!customer.googleId) {
      await prisma.$executeRaw`UPDATE Customer SET googleId = ${googleId}, avatar = ${picture || null} WHERE id = ${customer.id}`;
      customer.googleId = googleId;
      customer.avatar   = picture;
    }

    const token = jwt.sign({ customerId: customer.id }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, customer: { id: customer.id, name: customer.name, email: customer.email, avatar: customer.avatar, phone: customer.phone || null, createdAt: customer.createdAt }, isNew });
  } catch (err) {
    console.error('Google auth error:', err.message);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

/* POST /api/auth/register */
app.post('/api/auth/register', authLimiter, async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required' });
  if (!isStrongPassword(password)) return res.status(400).json({ error: 'Password must be at least 8 characters with a letter and a number' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email address' });
  try {
    const [existing] = await prisma.$queryRaw`SELECT id FROM Customer WHERE email = ${email.toLowerCase()} LIMIT 1`;
    if (existing) return res.status(409).json({ error: 'An account with this email already exists' });
    const id   = 'cust-' + Date.now();
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await prisma.$executeRaw`INSERT INTO Customer (id, email, name, passwordHash) VALUES (${id}, ${email.toLowerCase()}, ${sanitize(name, 100)}, ${hash})`;
    const [customer] = await prisma.$queryRaw`SELECT id, name, email, avatar, phone, createdAt FROM Customer WHERE id = ${id} LIMIT 1`;
    const token = jwt.sign({ customerId: customer.id }, JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({ token, customer: { id: customer.id, name: customer.name, email: customer.email, avatar: customer.avatar, phone: customer.phone || null, createdAt: customer.createdAt }, isNew: true });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Registration failed' });
  }
});

/* POST /api/auth/login */
app.post('/api/auth/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  try {
    const [customer] = await prisma.$queryRaw`SELECT id, name, email, avatar, phone, passwordHash, createdAt FROM Customer WHERE email = ${email.toLowerCase()} LIMIT 1`;
    if (!customer) return res.status(401).json({ error: 'No account found with this email' });
    if (!customer.passwordHash) return res.status(401).json({ error: 'This account uses Google Sign-In. Please sign in with Google.' });
    const valid = await bcrypt.compare(password, customer.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Incorrect password' });
    const token = jwt.sign({ customerId: customer.id }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, customer: { id: customer.id, name: customer.name, email: customer.email, avatar: customer.avatar, phone: customer.phone || null, createdAt: customer.createdAt } });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

/* POST /api/auth/claim-order — link a guest order to a logged-in customer */
app.post('/api/auth/claim-order', requireCustomerAuth, async (req, res) => {
  const { orderId } = req.body;
  if (!orderId) return res.status(400).json({ error: 'orderId required' });
  try {
    const [order] = await prisma.$queryRaw`SELECT id, customerId FROM \`Order\` WHERE id = ${orderId} LIMIT 1`;
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.customerId && order.customerId !== req.customerId) {
      return res.status(403).json({ error: 'Order already linked to another account' });
    }
    await prisma.$executeRawUnsafe('UPDATE `Order` SET customerId = ? WHERE id = ?', req.customerId, orderId);
    res.json({ success: true });
  } catch (err) {
    console.error('claim-order error:', err.message);
    res.status(500).json({ error: 'Failed to claim order' });
  }
});

/* GET /api/customer/me */
app.get('/api/customer/me', requireCustomerAuth, async (req, res) => {
  try {
    const [customer] = await prisma.$queryRaw`SELECT id, name, email, avatar, phone, createdAt FROM Customer WHERE id = ${req.customerId} LIMIT 1`;
    if (!customer) return res.status(404).json({ error: 'Account not found' });
    res.json(customer);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

/* PATCH /api/customer/profile */
app.patch('/api/customer/profile', requireCustomerAuth, async (req, res) => {
  try {
    const { phone, name } = req.body;
    if (phone !== undefined) await prisma.$executeRaw`UPDATE Customer SET phone = ${sanitize(phone, 20) || null} WHERE id = ${req.customerId}`;
    if (name  !== undefined) await prisma.$executeRaw`UPDATE Customer SET name  = ${sanitize(name, 100)}      WHERE id = ${req.customerId}`;
    const [customer] = await prisma.$queryRaw`SELECT id, name, email, avatar, phone, createdAt FROM Customer WHERE id = ${req.customerId} LIMIT 1`;
    res.json(customer);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

/* PATCH /api/customer/password — change password (email accounts only) */
app.patch('/api/customer/password', requireCustomerAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Missing fields' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  try {
    const [customer] = await prisma.$queryRaw`SELECT id, passwordHash, googleId FROM Customer WHERE id = ${req.customerId} LIMIT 1`;
    if (!customer) return res.status(404).json({ error: 'Account not found' });
    if (customer.googleId && !customer.passwordHash) {
      return res.status(400).json({ error: 'Google account — password is managed by Google' });
    }
    const valid = await bcrypt.compare(currentPassword, customer.passwordHash || '');
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await prisma.$executeRaw`UPDATE Customer SET passwordHash = ${newHash} WHERE id = ${req.customerId}`;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update password' });
  }
});

/* GET /api/orders/track?id=ORDER_ID — public, returns limited info */
app.get('/api/orders/track', async (req, res) => {
  const id = (req.query.id || '').trim();
  if (!id || id.length > 40) return res.status(400).json({ error: 'Invalid order ID' });
  try {
    // Use raw query so trackingCode column works even before Prisma client regen
    const [row] = await prisma.$queryRawUnsafe(
      'SELECT id, status, city, total, createdAt, trackingCode, deliveryPhone FROM `Order` WHERE id = ? LIMIT 1', id
    );
    if (!row) return res.status(404).json({ error: 'Order not found' });
    const items = await prisma.orderItem.findMany({
      where:  { orderId: id },
      select: { name: true, size: true, qty: true, price: true },
    });
    res.json({ ...row, items });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

/* GET /api/customer/orders */
app.get('/api/customer/orders', requireCustomerAuth, async (req, res) => {
  try {
    const [customer] = await prisma.$queryRaw`SELECT phone FROM Customer WHERE id = ${req.customerId} LIMIT 1`;
    // Build phone variants for fuzzy match (with/without spaces/dashes)
    const rawPhone = customer?.phone || '';
    const normPhone = normalizePhone(rawPhone); // e.g. "0612345678"
    // Query by customerId (new orders) OR either phone variant (old orders)
    const orders = normPhone
      ? await prisma.$queryRawUnsafe(
          `SELECT id, status, city, address, total, couponCode, discount, notes, createdAt, updatedAt,
                  trackingCode, deliveryPhone, deliveryName
           FROM \`Order\`
           WHERE customerId = ?
              OR REPLACE(REPLACE(REPLACE(phone,' ',''),'-',''),'.','') = ?
           ORDER BY createdAt DESC LIMIT 50`,
          req.customerId, normPhone
        )
      : await prisma.$queryRawUnsafe(
          `SELECT id, status, city, address, total, couponCode, discount, notes, createdAt, updatedAt,
                  trackingCode, deliveryPhone, deliveryName
           FROM \`Order\` WHERE customerId = ? ORDER BY createdAt DESC LIMIT 50`,
          req.customerId
        );
    const orderIds = orders.map(o => o.id);
    let items = [];
    if (orderIds.length) {
      items = await prisma.orderItem.findMany({
        where:  { orderId: { in: orderIds } },
        select: { orderId: true, name: true, size: true, qty: true, price: true },
      });
    }
    const itemsByOrder = {};
    items.forEach(it => {
      if (!itemsByOrder[it.orderId]) itemsByOrder[it.orderId] = [];
      itemsByOrder[it.orderId].push(it);
    });
    res.json(orders.map(o => ({ ...o, items: itemsByOrder[o.id] || [] })));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

/* GET /api/customer/orders/:id/olivraison-status */
app.get('/api/customer/orders/:id/olivraison-status', requireCustomerAuth, async (req, res) => {
  const { id } = req.params;
  // Verify order belongs to this customer (by customerId or phone)
  const [customer] = await prisma.$queryRaw`SELECT phone FROM Customer WHERE id = ${req.customerId} LIMIT 1`;
  const normPhone = normalizePhone(customer?.phone || '');
  const [order] = await prisma.$queryRawUnsafe(
    `SELECT id, trackingCode FROM \`Order\` WHERE id = ? AND (customerId = ?${normPhone ? ' OR REPLACE(REPLACE(REPLACE(phone,\' \',\'\'),\'-\',\'\'),\'.\',\'\') = ?' : ''}) LIMIT 1`,
    id, req.customerId, ...(normPhone ? [normPhone] : [])
  );
  if (!order?.trackingCode) return res.status(404).json({ error: 'No tracking info for this order' });

  const cfg = await prisma.olivraisonConfig.findUnique({ where: { id: 'singleton' } });
  if (!cfg?.apiKey) return res.status(503).json({ error: 'Delivery tracking unavailable' });

  try {
    const token = await getOlivraisonToken(cfg);
    const { ok, data } = await fetchOlivraisonPackage(order.trackingCode, token);
    if (!ok) return res.status(502).json({ error: 'Could not fetch delivery status' });
    const rawStatus = (data.status || '').trim().toLowerCase().replace(/\s+/g, '_');
    const comment = data.comment || data.note || data.remarks || data.description || data.livreurComment || data.deliveryNote || data.message || null;
    const transitStatuses = ['pickedup','picked_up','inhouse','enroute','transit','in_transit','out_for_delivery'];
    const driverPhone = transitStatuses.includes(rawStatus) ? extractDriverPhone(data) : null;
    const driverName  = transitStatuses.includes(rawStatus) ? extractDriverName(data)  : null;
    res.json({ rawStatus, trackingCode: order.trackingCode, comment, driverPhone, driverName });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

/* ════════════════════════════════════════
   ANALYTICS TRACKING
════════════════════════════════════════ */
const ANALYTICS_FILE = path.join(__dirname, 'analytics.json');
function readAnalytics() {
  try { if (fs.existsSync(ANALYTICS_FILE)) return JSON.parse(fs.readFileSync(ANALYTICS_FILE,'utf8')); } catch(e){}
  return {};
}
function writeAnalytics(d) { try { fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(d),'utf8'); } catch(e){} }

/* Public — tracker.js calls this on every page load */
app.post('/api/track', (req, res) => {
  res.sendStatus(200);
  try {
    const { page='/', vid='' } = req.body || {};
    const today = new Date().toISOString().slice(0,10);
    const hour  = String(new Date().getHours());
    const data  = readAnalytics();
    if (!data[today]) data[today] = { views:0, uniques:[], pages:{}, hours:{} };
    const day = data[today];
    day.views++;
    if (vid && !day.uniques.includes(vid)) day.uniques.push(vid);
    day.pages[page]  = (day.pages[page]  || 0) + 1;
    day.hours[hour]  = (day.hours[hour]  || 0) + 1;
    writeAnalytics(data);
  } catch(e){}
});

/* Admin — aggregated analytics */
app.get('/api/admin/analytics', adminLimiter, requireAuth, (req, res) => {
  try {
    const raw   = readAnalytics();
    const today = new Date().toISOString().slice(0,10);
    const sorted = Object.keys(raw).sort();
    const last30 = sorted.slice(-30).map(d => ({
      date:    d,
      views:   raw[d].views   || 0,
      uniques: Array.isArray(raw[d].uniques) ? raw[d].uniques.length : 0,
    }));
    const todayD   = raw[today] || {};
    const todayViews   = todayD.views   || 0;
    const todayUniques = Array.isArray(todayD.uniques) ? todayD.uniques.length : 0;
    const last7  = last30.slice(-7);
    const week7Views   = last7.reduce((s,d)=>s+d.views,  0);
    const week7Uniques = last7.reduce((s,d)=>s+d.uniques,0);
    /* peak hours (all-time aggregate) */
    const hoursAll = {};
    for (let h=0;h<24;h++) hoursAll[h]=0;
    for (const d of Object.values(raw)) {
      for (const [h,v] of Object.entries(d.hours||{})) hoursAll[h]=(hoursAll[h]||0)+v;
    }
    /* top pages */
    const pagesAll = {};
    for (const d of Object.values(raw)) {
      for (const [p,v] of Object.entries(d.pages||{})) pagesAll[p]=(pagesAll[p]||0)+v;
    }
    const topPages = Object.entries(pagesAll).sort((a,b)=>b[1]-a[1]).slice(0,6);
    res.json({ days:last30, todayViews, todayUniques, week7Views, week7Uniques, hoursAll, topPages });
  } catch(e){ res.status(500).json({error:e.message}); }
});

/* ════════════════════════════════════════
   PIXELS
════════════════════════════════════════ */
/* Public — pixels.js fetches this on every customer page */
app.get('/api/settings/pixels', async (req, res) => {
  try {
    const s = await prisma.siteSettings.findUnique({ where:{ id:'singleton' } });
    let px = {};
    try { px = JSON.parse(s?.pixelsJson || '{}'); } catch(e){}
    res.json(px);
  } catch(e){ res.json({}); }
});

/* Synchronous pixel loader — served as a JS file for TikTok/FB/GA verification */
app.get('/pixel-config.js', async (req, res) => {
  try {
    const [row] = await prisma.$queryRawUnsafe("SELECT pixelsJson FROM `SiteSettings` WHERE id='singleton' LIMIT 1");
    let px = {};
    try { px = JSON.parse(row?.pixelsJson || '{}'); } catch(e) {}

    const strip = code => code.replace(/<\/?script[^>]*>/gi, '').replace(/<!--.*?-->/gs, '').trim();
    let js = '/* StreetStore pixel config */\n';
    if (px.ttActive && px.tiktok)   js += strip(px.tiktok)   + '\n';
    if (px.fbActive && px.facebook) js += strip(px.facebook) + '\n';
    if (px.gaActive && px.google)   js += strip(px.google)   + '\n';

    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(js);
  } catch(e) {
    res.setHeader('Content-Type', 'application/javascript');
    res.send('/* pixel config unavailable */');
  }
});

/* Admin — save pixel IDs */
app.get('/api/admin/pixels', adminLimiter, requireAuth, async (req, res) => {
  try {
    const s = await prisma.siteSettings.findUnique({ where:{ id:'singleton' } });
    let px = {};
    try { px = JSON.parse(s?.pixelsJson || '{}'); } catch(e){}
    res.json(px);
  } catch(e){ res.json({}); }
});

app.patch('/api/admin/pixels', adminLimiter, requireAuth, async (req, res) => {
  try {
    const { facebook='', tiktok='', google='', fbActive=false, ttActive=false, gaActive=false } = req.body;
    const pixelsJson = JSON.stringify({
      facebook: String(facebook).slice(0,5000), tiktok: String(tiktok).slice(0,5000), google: String(google).slice(0,5000),
      fbActive: Boolean(fbActive), ttActive: Boolean(ttActive), gaActive: Boolean(gaActive),
    });
    await prisma.$executeRawUnsafe('UPDATE `SiteSettings` SET `pixelsJson`=? WHERE `id`=?', pixelsJson,'singleton');
    res.json({ ok:true });
  } catch(e){ res.status(500).json({error:e.message}); }
});


/* GET /api/admin/business-costs */
app.get('/api/admin/business-costs', requireAuth, async (req, res) => {
  try {
    const [row] = await prisma.$queryRawUnsafe('SELECT packagingPerOrder, deliveryCasa, deliveryOther, dailyAdBudget FROM `BusinessCosts` WHERE id = 1 LIMIT 1');
    const adSpend = await prisma.$queryRawUnsafe('SELECT date, amount FROM `AdSpend` ORDER BY date DESC LIMIT 90');
    res.json({
      packagingPerOrder: row ? parseFloat(row.packagingPerOrder) : 0,
      deliveryCasa:      row ? parseFloat(row.deliveryCasa)      : 25,
      deliveryOther:     row ? parseFloat(row.deliveryOther)     : 35,
      dailyAdBudget:     row ? parseFloat(row.dailyAdBudget)     : 0,
      adSpend: adSpend.map(r => ({ date: r.date instanceof Date ? r.date.toISOString().slice(0,10) : String(r.date).slice(0,10), amount: parseFloat(r.amount) })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load business costs' });
  }
});

/* PATCH /api/admin/business-costs */
app.patch('/api/admin/business-costs', requireAuth, async (req, res) => {
  try {
    const packaging      = parseFloat(req.body.packagingPerOrder) || 0;
    const deliveryCasa   = parseFloat(req.body.deliveryCasa)      || 25;
    const deliveryOther  = parseFloat(req.body.deliveryOther)     || 35;
    const dailyAdBudget  = parseFloat(req.body.dailyAdBudget)     || 0;
    await prisma.$queryRawUnsafe(
      'INSERT INTO `BusinessCosts` (id, packagingPerOrder, deliveryCasa, deliveryOther, dailyAdBudget) VALUES (1, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE packagingPerOrder = ?, deliveryCasa = ?, deliveryOther = ?, dailyAdBudget = ?',
      packaging, deliveryCasa, deliveryOther, dailyAdBudget, packaging, deliveryCasa, deliveryOther, dailyAdBudget
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[business-costs PATCH]', err);
    res.status(500).json({ error: 'Failed to save business costs' });
  }
});

/* POST /api/admin/ad-spend — upsert daily ad spend */
app.post('/api/admin/ad-spend', requireAuth, async (req, res) => {
  try {
    const date   = (req.body.date || '').trim();
    const amount = parseFloat(req.body.amount) || 0;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Invalid date' });
    await prisma.$queryRawUnsafe(
      'INSERT INTO `AdSpend` (date, amount) VALUES (?, ?) ON DUPLICATE KEY UPDATE amount = ?',
      date, amount, amount
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save ad spend' });
  }
});

/* ════════════════════════════════════════
   CUSTOMER NOTIFICATIONS
════════════════════════════════════════ */

/* GET /api/push/vapid-public-key — client needs this to subscribe */
app.get('/api/push/vapid-public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || '' });
});

/* POST /api/push/subscribe — save a push subscription */
app.post('/api/push/subscribe', async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) return res.status(400).json({ error: 'Invalid subscription' });
    // Optionally link to customer if logged in
    let customerId = null;
    const header = req.headers['authorization'] || '';
    const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (token) {
      try { const d = require('jsonwebtoken').verify(token, process.env.JWT_SECRET || 'change-me-in-production'); customerId = d.customerId || null; } catch (_) {}
    }
    await prisma.$executeRawUnsafe(
      'INSERT INTO `PushSubscription` (customerId, endpoint, p256dh, auth) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE customerId=VALUES(customerId), p256dh=VALUES(p256dh), auth=VALUES(auth)',
      customerId, endpoint, keys.p256dh, keys.auth
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

/* DELETE /api/push/unsubscribe */
app.delete('/api/push/unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (endpoint) await prisma.$executeRawUnsafe('DELETE FROM `PushSubscription` WHERE endpoint = ?', endpoint);
    res.json({ ok: true });
  } catch (_) { res.json({ ok: true }); }
});

/* POST /api/orders/:id/push-link — link a push endpoint to an order */
app.post('/api/orders/:id/push-link', async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: 'endpoint required' });
    await prisma.$executeRawUnsafe('UPDATE `Order` SET pushEndpoint = ? WHERE id = ?', endpoint, req.params.id);
    res.json({ ok: true });
  } catch (_) { res.json({ ok: true }); }
});

/* Helper: send push for order status change */
async function sendOrderStatusPush(order, newStatus) {
  const transitBody = order.deliveryPhone
    ? `Your driver ${order.deliveryPhone} is on the way 🛵 They will contact you soon!`
    : 'Your order is on its way! It will arrive soon.';
  const messages = {
    confirmed:   { title: 'Order Confirmed ✅',  body: 'Your order is confirmed! We\'re preparing it now.' },
    processing:  { title: 'Order Processing ⚙️', body: 'Your order is being processed and will ship soon.' },
    transit:     { title: 'Order Shipped 🚚',    body: transitBody },
    done:        { title: 'Order Delivered 🎉',  body: 'Your order has been delivered. Enjoy your purchase!' },
    delivered:   { title: 'Order Delivered 🎉',  body: 'Your order has been delivered. Enjoy your purchase!' },
    cancelled:   { title: 'Order Cancelled ❌',   body: 'Your order has been cancelled. Contact us if you need help.' },
  };
  const msg = messages[newStatus];
  if (!msg) return;
  const payload = JSON.stringify({ title: msg.title, body: msg.body });

  const endpoints = new Set();

  // 1. Order's own linked push endpoint
  if (order.pushEndpoint) endpoints.add(order.pushEndpoint);

  // 2. Customer's registered subscriptions
  if (order.customerId) {
    try {
      const subs = await prisma.$queryRawUnsafe('SELECT endpoint FROM `PushSubscription` WHERE customerId = ?', order.customerId);
      subs.forEach(s => endpoints.add(s.endpoint));
    } catch (_) {}
  }

  if (!endpoints.size) return;

  for (const ep of endpoints) {
    try {
      const [row] = await prisma.$queryRawUnsafe('SELECT p256dh, auth FROM `PushSubscription` WHERE endpoint = ?', ep);
      if (!row) continue;
      await webpush.sendNotification({ endpoint: ep, keys: { p256dh: row.p256dh, auth: row.auth } }, payload);
    } catch (e) {
      if (e.statusCode === 410 || e.statusCode === 404) {
        await prisma.$executeRawUnsafe('DELETE FROM `PushSubscription` WHERE endpoint = ?', ep).catch(() => {});
      }
    }
  }
}

/* GET /api/admin/push/subscriber-count — count active push subscriptions */
app.get('/api/admin/push/subscriber-count', requireAuth, async (req, res) => {
  try {
    const [row] = await prisma.$queryRawUnsafe('SELECT COUNT(*) AS count FROM `PushSubscription`');
    res.json({ count: Number(row.count) });
  } catch (_) {
    res.json({ count: 0 });
  }
});

/* POST /api/admin/push/subscribe-admin — save admin browser push subscription */
app.post('/api/admin/push/subscribe-admin', requireAuth, async (req, res) => {
  const { endpoint, p256dh, auth } = req.body;
  if (!endpoint || !p256dh || !auth) return res.status(400).json({ error: 'Missing fields' });
  try {
    await prisma.$executeRawUnsafe(
      'INSERT INTO `AdminPushSubscription` (endpoint, p256dh, auth) VALUES (?,?,?) ON DUPLICATE KEY UPDATE p256dh=VALUES(p256dh), auth=VALUES(auth)',
      endpoint, p256dh, auth
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

/* DELETE /api/admin/push/unsubscribe-admin — remove admin push subscription */
app.delete('/api/admin/push/unsubscribe-admin', requireAuth, async (req, res) => {
  const { endpoint } = req.body;
  try {
    if (endpoint) await prisma.$executeRawUnsafe('DELETE FROM `AdminPushSubscription` WHERE endpoint = ?', endpoint);
    res.json({ ok: true });
  } catch (_) {
    res.status(500).json({ error: 'Failed to remove subscription' });
  }
});

/* Helper: send push to all admin subscriptions */
async function sendAdminPush(title, body) {
  try {
    const subs = await prisma.$queryRawUnsafe('SELECT endpoint, p256dh, auth FROM `AdminPushSubscription`');
    const payload = JSON.stringify({ title, body, url: '/admin.html' });
    await Promise.all(subs.map(async sub => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await prisma.$executeRawUnsafe('DELETE FROM `AdminPushSubscription` WHERE endpoint = ?', sub.endpoint).catch(() => {});
        }
      }
    }));
  } catch (_) {}
}

/* GET /api/admin/registered-customers — list customers with accounts */
app.get('/api/admin/registered-customers', requireAuth, async (req, res) => {
  try {
    const rows = await prisma.$queryRawUnsafe('SELECT id, name, email, phone FROM `Customer` ORDER BY createdAt DESC LIMIT 500');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

/* POST /api/admin/notifications — send to one customer or all */
app.post('/api/admin/notifications', requireAuth, async (req, res) => {
  try {
    const title      = sanitize(String(req.body.title   || '').trim(), 255);
    const message    = sanitize(String(req.body.message || '').trim(), 2000);
    const customerId = req.body.customerId || null; // null = broadcast
    if (!title || !message) return res.status(400).json({ error: 'title and message required' });
    // Save to DB
    await prisma.$executeRawUnsafe(
      'INSERT INTO `CustomerNotification` (customerId, title, message) VALUES (?, ?, ?)',
      customerId, title, message
    );
    // Send Web Push to matching subscriptions
    try {
      let subs;
      if (customerId) {
        subs = await prisma.$queryRawUnsafe('SELECT endpoint, p256dh, auth FROM `PushSubscription` WHERE customerId = ?', customerId);
      } else {
        subs = await prisma.$queryRawUnsafe('SELECT endpoint, p256dh, auth FROM `PushSubscription`');
      }
      const payload = JSON.stringify({ title, body: message });
      await Promise.allSettled(subs.map(sub =>
        webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
          .catch(async e => {
            if (e.statusCode === 410 || e.statusCode === 404) {
              // Expired subscription — remove it
              await prisma.$executeRawUnsafe('DELETE FROM `PushSubscription` WHERE endpoint = ?', sub.endpoint).catch(() => {});
            }
          })
      ));
    } catch (_) {}
    res.json({ ok: true });
  } catch (err) {
    console.error('Notification error:', err);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

/* GET /api/admin/notifications — list all sent notifications */
app.get('/api/admin/notifications', requireAuth, async (req, res) => {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT n.id, n.customerId, n.title, n.message, n.createdAt,
              c.name AS customerName, c.email AS customerEmail,
              (SELECT COUNT(*) FROM \`CustomerNotification\` cn WHERE cn.customerId = n.customerId OR cn.customerId IS NULL) AS sentCount
       FROM \`CustomerNotification\` n
       LEFT JOIN \`Customer\` c ON c.id = n.customerId
       ORDER BY n.createdAt DESC LIMIT 100`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

/* GET /api/customer/notifications — get notifications for logged-in customer */
app.get('/api/customer/notifications', requireCustomerAuth, async (req, res) => {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT id, title, message, isRead, createdAt
       FROM \`CustomerNotification\`
       WHERE customerId = ? OR customerId IS NULL
       ORDER BY createdAt DESC LIMIT 50`,
      req.customerId
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

/* POST /api/customer/notifications/read — mark all as read for customer */
app.post('/api/customer/notifications/read', requireCustomerAuth, async (req, res) => {
  try {
    // For broadcast (customerId IS NULL) we can't mark per-customer easily
    // so we duplicate-insert the notification into the customer's own read record
    // Simple approach: mark personal ones as read
    await prisma.$executeRawUnsafe(
      'UPDATE `CustomerNotification` SET isRead = 1 WHERE customerId = ?',
      req.customerId
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark read' });
  }
});

/* ════════════════════════════════════════
   START
════════════════════════════════════════ */
/* Run DB migrations FIRST, then bootstrap, then start listening.
   This order guarantees columns always exist before Prisma touches them. */
async function runMigrations() {
  const migrations = [
    "ALTER TABLE `Product` ADD COLUMN `videoUrl` VARCHAR(2048) NULL",
    "ALTER TABLE `Product` ADD COLUMN `color` VARCHAR(100) NULL",
    "ALTER TABLE `SiteSettings` ADD COLUMN `packDeal2` DOUBLE NOT NULL DEFAULT 319",
    "ALTER TABLE `SiteSettings` ADD COLUMN `packDeal3` DOUBLE NOT NULL DEFAULT 479",
    "ALTER TABLE `SiteSettings` ADD COLUMN `packDealBadge` VARCHAR(255) NOT NULL DEFAULT 'Save up to 10% off'",
    "ALTER TABLE `SiteSettings` ADD COLUMN `packDealSub` VARCHAR(255) NOT NULL DEFAULT 'Mix & match any styles'",
    "ALTER TABLE `SiteSettings` ADD COLUMN `packEnabled` TINYINT(1) NOT NULL DEFAULT 1",
    "ALTER TABLE `SiteSettings` ADD COLUMN `whatsappBotKey` VARCHAR(100) NOT NULL DEFAULT ''",
    "ALTER TABLE `Product` ADD COLUMN `isFeatured` TINYINT(1) NOT NULL DEFAULT 0",
    "CREATE TABLE IF NOT EXISTS `Deal` (`id` VARCHAR(30) NOT NULL PRIMARY KEY, `title` VARCHAR(255) NOT NULL, `productId` VARCHAR(30) NULL, `discountPrice` DOUBLE NOT NULL, `isActive` TINYINT(1) NOT NULL DEFAULT 1, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3))",
    "UPDATE `Product` SET href = NULL WHERE href IS NOT NULL",
    "CREATE INDEX IF NOT EXISTS idx_product_status ON `Product` (status)",
    "CREATE INDEX IF NOT EXISTS idx_order_status ON `Order` (status)",
    "CREATE INDEX IF NOT EXISTS idx_order_created ON `Order` (createdAt)",
    "CREATE TABLE IF NOT EXISTS `Customer` (`id` VARCHAR(30) NOT NULL PRIMARY KEY, `email` VARCHAR(255) NOT NULL, `name` VARCHAR(255) NOT NULL DEFAULT '', `avatar` VARCHAR(500) NULL, `googleId` VARCHAR(255) NULL, `phone` VARCHAR(30) NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3))",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_email ON `Customer` (email)",
    "ALTER TABLE `Customer` ADD COLUMN `passwordHash` VARCHAR(255) NULL",
    "ALTER TABLE `Order` ADD COLUMN `trackingCode` VARCHAR(255) NULL",
    "ALTER TABLE `Order` ADD COLUMN `deliveryPhone` VARCHAR(30) NULL",
    "ALTER TABLE `Order` ADD COLUMN `customerId` VARCHAR(30) NULL",
    "ALTER TABLE `SiteSettings` ADD COLUMN `bundle3Price` DOUBLE NOT NULL DEFAULT 499",
    "ALTER TABLE `SiteSettings` ADD COLUMN `bundle3Enabled` TINYINT(1) NOT NULL DEFAULT 1",
    "CREATE TABLE IF NOT EXISTS `Review` (`id` VARCHAR(30) NOT NULL PRIMARY KEY, `productSlug` VARCHAR(255) NOT NULL, `customerId` VARCHAR(30) NULL, `name` VARCHAR(255) NOT NULL, `rating` INT NOT NULL, `text` TEXT NOT NULL, `approved` TINYINT(1) NOT NULL DEFAULT 0, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3))",
    "ALTER TABLE `SiteSettings` ADD COLUMN `pixelsJson` TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE `Order` ADD COLUMN `deliveryName` VARCHAR(255) NULL",
    "ALTER TABLE `Product` ADD COLUMN `costPrice` DECIMAL(10,2) NULL",
    "CREATE TABLE IF NOT EXISTS `BusinessCosts` (`id` INT NOT NULL DEFAULT 1 PRIMARY KEY, `packagingPerOrder` DECIMAL(10,2) NOT NULL DEFAULT 0, `deliveryPerOrder` DECIMAL(10,2) NOT NULL DEFAULT 0, `deliveryCasa` DECIMAL(10,2) NOT NULL DEFAULT 25, `deliveryOther` DECIMAL(10,2) NOT NULL DEFAULT 35, `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3))",
    "ALTER TABLE `BusinessCosts` ADD COLUMN `deliveryCasa` DECIMAL(10,2) NOT NULL DEFAULT 25",
    "ALTER TABLE `BusinessCosts` ADD COLUMN `deliveryOther` DECIMAL(10,2) NOT NULL DEFAULT 35",
    "ALTER TABLE `BusinessCosts` ADD COLUMN `dailyAdBudget` DECIMAL(10,2) NOT NULL DEFAULT 0",
    "CREATE TABLE IF NOT EXISTS `AdSpend` (`id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY, `date` DATE NOT NULL, `amount` DECIMAL(10,2) NOT NULL DEFAULT 0, UNIQUE KEY `date_unique` (`date`))",
    "ALTER TABLE `AdSpend` ADD COLUMN `date` DATE NULL",
    "ALTER TABLE `AdSpend` DROP INDEX IF EXISTS `month_year`",
    "CREATE TABLE IF NOT EXISTS `CustomerNotification` (`id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY, `customerId` VARCHAR(30) NULL COMMENT 'NULL = broadcast to all', `title` VARCHAR(255) NOT NULL, `message` TEXT NOT NULL, `isRead` TINYINT(1) NOT NULL DEFAULT 0, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3))",
    "CREATE INDEX IF NOT EXISTS idx_cn_customer ON `CustomerNotification` (customerId)",
    "CREATE TABLE IF NOT EXISTS `PushSubscription` (`id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY, `customerId` VARCHAR(30) NULL, `endpoint` TEXT NOT NULL, `p256dh` VARCHAR(500) NOT NULL, `auth` VARCHAR(200) NOT NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), UNIQUE KEY `endpoint_unique` (endpoint(255)))",
    "ALTER TABLE `Order` ADD COLUMN `pushEndpoint` TEXT NULL",
    "CREATE TABLE IF NOT EXISTS `AdminPushSubscription` (`id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY, `endpoint` TEXT NOT NULL, `p256dh` VARCHAR(500) NOT NULL, `auth` VARCHAR(200) NOT NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), UNIQUE KEY `admin_endpoint_unique` (endpoint(255)))",
    "ALTER TABLE `SiteSettings` ADD COLUMN `siteApiKey` VARCHAR(64) NOT NULL DEFAULT ''",
    "ALTER TABLE `SiteSettings` ADD COLUMN `siteApiSecret` VARCHAR(64) NOT NULL DEFAULT ''",
  ];
  for (const sql of migrations) {
    try { await prisma.$executeRawUnsafe(sql); } catch (_) {}
  }
  console.log('DB migrations complete');
}

async function bootstrap() {
  const auth = readAuth();
  if (!auth.passwordHash) {
    const raw  = process.env.API_SECRET || 'admin123';
    const hash = await bcrypt.hash(raw, BCRYPT_ROUNDS);
    writeAuth({ ...auth, passwordHash: hash });
    console.log('Password hashed and stored');
  }
  await prisma.siteSettings.upsert({ where: { id: 'singleton' }, update: {}, create: { id: 'singleton' } });
  await prisma.olivraisonConfig.upsert({ where: { id: 'singleton' }, update: {}, create: { id: 'singleton' } });
  const videoSeeds = [
    { slug: 'patte-elephant',     videoUrl: 'https://res.cloudinary.com/dze20ah0s/video/upload/v1774703910/streetstore/products/videos/patte-elephant.mp4' },
    { slug: 'high-rise-dark-blue',videoUrl: 'https://res.cloudinary.com/dze20ah0s/video/upload/v1774703925/streetstore/products/videos/high-rise-dark-blue.mp4' },
    { slug: 'brown-wide-leg',     videoUrl: 'https://res.cloudinary.com/dze20ah0s/video/upload/v1774703935/streetstore/products/videos/brown-wide-leg.mp4' },
    { slug: 'baggy-wide-leg',     videoUrl: 'https://res.cloudinary.com/dze20ah0s/video/upload/v1774703938/streetstore/products/videos/baggy-wide-leg.mp4' },
  ];
  for (const v of videoSeeds) {
    try { await prisma.product.updateMany({ where: { slug: v.slug, videoUrl: null }, data: { videoUrl: v.videoUrl } }); } catch(_) {}
  }
  console.log('Video URLs seeded');
}

/* Startup sequence: migrations → bootstrap → listen (strict order, no race conditions) */
runMigrations()
  .then(() => bootstrap())
  .catch(err => console.error('Startup error:', err.message))
  .finally(() => {
    httpServer.listen(PORT, () => {
      console.log(`\nStreetStore API + Socket.io running on port ${PORT}\n`);
    });
  });
