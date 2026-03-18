/**
 * StreetStore — Secure Order & Admin API
 */

require('dotenv').config();

const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const multer    = require('multer');
const path      = require('path');
const fs        = require('fs');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode    = require('qrcode');
const { createOrder, readOrders, getOrder, updateOrder } = require('./db');

/* ════════════════════════════════════════
   AUTH STORE — hashed password + 2FA secret
════════════════════════════════════════ */
const AUTH_FILE    = path.join(__dirname, 'auth.json');
const JWT_SECRET   = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRY   = '8h';
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

/* On first run: hash API_SECRET and store it */
(async function bootstrap() {
  const auth = readAuth();
  if (!auth.passwordHash) {
    const raw = process.env.API_SECRET || 'admin123';
    const hash = await bcrypt.hash(raw, BCRYPT_ROUNDS);
    writeAuth({ ...auth, passwordHash: hash });
    console.log('🔐 Password hashed and stored in auth.json');
  }
})();

/* ── Login attempt tracker (in-memory) ── */
const loginAttempts = new Map(); // ip → { count, lockedUntil }
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
  if (rec.count >= MAX_ATTEMPTS) {
    rec.lockedUntil = Date.now() + LOCK_MINUTES * 60 * 1000;
    console.warn(`🔒 IP ${ip} locked out for ${LOCK_MINUTES} min after ${MAX_ATTEMPTS} failed logins`);
  }
  loginAttempts.set(ip, rec);
}

function resetLoginAttempts(ip) {
  loginAttempts.delete(ip);
}

/* ── Blocked IPs store ── */
const BLOCKED_IPS_FILE = path.join(__dirname, 'blocked_ips.json');
function readBlockedIps() {
  try { return JSON.parse(fs.existsSync(BLOCKED_IPS_FILE) ? fs.readFileSync(BLOCKED_IPS_FILE,'utf8') : '[]'); }
  catch { return []; }
}
function writeBlockedIps(list) { fs.writeFileSync(BLOCKED_IPS_FILE, JSON.stringify(list, null, 2)); }

/* ── Backup ── */
const BACKUP_DIR = path.join(__dirname, 'backups');
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);

function runBackup() {
  const ordersFile = path.join(__dirname, 'orders.json');
  if (!fs.existsSync(ordersFile)) return;
  const ts   = new Date().toISOString().slice(0,10);
  const dest = path.join(BACKUP_DIR, `orders-${ts}.json`);
  fs.copyFileSync(ordersFile, dest);
  // Keep only last 30 backups
  const files = fs.readdirSync(BACKUP_DIR).filter(f=>f.startsWith('orders-')).sort();
  if (files.length > 30) {
    files.slice(0, files.length - 30).forEach(f => fs.unlinkSync(path.join(BACKUP_DIR, f)));
  }
  console.log(`💾 Backup saved: ${dest}`);
}

// Daily backup at startup, then every 24h
runBackup();
setInterval(runBackup, 24 * 60 * 60 * 1000);

/* ── Helpers ── */
function getClientIp(req) { return req.socket?.remoteAddress || 'unknown'; }

function sanitize(str, maxLen = 200) {
  if (typeof str !== 'string') return '';
  return str.replace(/<[^>]*>/g, '').trim().slice(0, maxLen);
}

function isValidId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

function isStrongPassword(p) {
  // min 8 chars, at least 1 letter + 1 number
  return typeof p === 'string' && p.length >= 8 && /[A-Za-z]/.test(p) && /[0-9]/.test(p);
}

/* ── File upload ── */
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext).replace(/[^a-z0-9]/gi, '-').toLowerCase();
    cb(null, `${base}-${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|mp4|mov|webm|avi)$/i;
    if (allowed.test(path.extname(file.originalname))) cb(null, true);
    else cb(new Error('Only images and videos are allowed'));
  }
});

const app  = express();
const PORT = process.env.PORT || 3000;

/* ════════════════════════════════════════
   MIDDLEWARE
════════════════════════════════════════ */
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));

app.use(express.json({ limit: '10kb' }));

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || origin === 'null') return callback(null, true);
    if (origin.startsWith('http://localhost') ||
        origin.startsWith('http://127.0.0.1') ||
        origin.endsWith('.github.io') ||
        origin === (process.env.WEBSITE_URL || '')) return callback(null, true);
    callback(null, false);
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT'],
}));

app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, '..')));

/* ── Rate limiters ── */
const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many orders submitted. Please wait 15 minutes.' },
  keyGenerator: (req) => getClientIp(req),
});

const adminLimiter = rateLimit({
  windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests.' },
  keyGenerator: (req) => getClientIp(req),
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Try again later.' },
  keyGenerator: (req) => getClientIp(req),
});

/* ── JWT auth middleware ── */
function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    console.warn(`⚠️  No token from ${getClientIp(req)}`);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch(e) {
    return res.status(401).json({ error: 'Token expired or invalid. Please log in again.' });
  }
}

/* ════════════════════════════════════════
   PUBLIC ROUTES
════════════════════════════════════════ */
app.get('/', (req, res) => {
  res.json({ service: 'StreetStore API', status: 'running', timestamp: new Date().toISOString() });
});

/* ── POST /api/orders ── */
app.post('/api/orders', orderLimiter, async (req, res) => {
  const clientIp = getClientIp(req);

  if (readBlockedIps().includes(clientIp)) {
    return res.status(403).json({
      error: 'blocked',
      message: 'Your account has been blocked due to multiple undelivered or cancelled orders. If you believe this is a mistake, please contact us on WhatsApp.'
    });
  }

  const product  = sanitize(req.body.product,  100);
  const customer = sanitize(req.body.customer,  80);
  const phone    = sanitize(req.body.phone,     20);
  const city     = sanitize(req.body.city,      60);
  const address  = sanitize(req.body.address,  200);
  const size     = sanitize(req.body.size,       10);
  const price    = sanitize(String(req.body.price || ''), 20);
  const qty      = Math.min(Math.max(parseInt(req.body.qty) || 1, 1), 99);

  if (!product || !customer || !phone || !city) {
    return res.status(400).json({ error: 'Missing required fields: product, customer, phone, city' });
  }

  const digits = phone.replace(/\D/g, '');
  if (digits.length < 9 || digits.length > 15) {
    return res.status(400).json({ error: 'Invalid phone number' });
  }

  if (!/^[\p{L}\s'\-\.]{2,80}$/u.test(customer)) {
    return res.status(400).json({ error: 'Invalid customer name' });
  }

  const order = createOrder({ product, size, qty, price, customer, phone, city, address, clientIp });
  console.log(`🆕 New order: ${order.id} — ${customer} — ${product}`);

  res.status(201).json({ success: true, orderId: order.id, message: 'Order received successfully.' });
});

/* ════════════════════════════════════════
   AUTH ROUTES
════════════════════════════════════════ */

/* POST /api/admin/login */
app.post('/api/admin/login', authLimiter, async (req, res) => {
  const ip = getClientIp(req);

  // Check lockout
  if (checkLoginLock(ip)) {
    return res.status(429).json({ error: `Too many failed attempts. Try again in ${LOCK_MINUTES} minutes.` });
  }

  const { password, totpCode } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });

  const auth = readAuth();

  // Verify password
  const valid = auth.passwordHash
    ? await bcrypt.compare(password, auth.passwordHash)
    : password === process.env.API_SECRET; // fallback before first hash

  if (!valid) {
    recordFailedLogin(ip);
    const rec = loginAttempts.get(ip) || {};
    const remaining = MAX_ATTEMPTS - (rec.count || 0);
    console.warn(`🔐 Failed login from ${ip} (${rec.count || 1}/${MAX_ATTEMPTS})`);
    if (remaining <= 0) {
      return res.status(429).json({ error: `Account locked for ${LOCK_MINUTES} minutes.` });
    }
    return res.status(401).json({ error: `Wrong password. ${remaining} attempt${remaining===1?'':'s'} remaining.` });
  }

  // 2FA check
  if (auth.twoFactorEnabled) {
    if (!totpCode) {
      return res.status(200).json({ require2fa: true });
    }
    const verified = speakeasy.totp.verify({
      secret: auth.twoFactorSecret,
      encoding: 'base32',
      token: totpCode,
      window: 1,
    });
    if (!verified) {
      recordFailedLogin(ip);
      return res.status(401).json({ error: 'Invalid 2FA code.' });
    }
  }

  resetLoginAttempts(ip);

  const token = jwt.sign({ role: 'admin', ip }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
  console.log(`✅ Admin login from ${ip}`);
  res.json({ token, expiresIn: JWT_EXPIRY });
});

/* POST /api/admin/change-password */
app.post('/api/admin/change-password', authLimiter, requireAuth, async (req, res) => {
  const { newPassword } = req.body;
  if (!isStrongPassword(newPassword)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters and include a letter and a number.' });
  }
  const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  const auth = readAuth();
  writeAuth({ ...auth, passwordHash: hash });
  console.log(`🔐 Password changed by admin`);
  res.json({ success: true });
});

/* GET /api/admin/2fa/setup — generate TOTP secret + QR code */
app.get('/api/admin/2fa/setup', adminLimiter, requireAuth, async (req, res) => {
  const secret = speakeasy.generateSecret({ name: 'StreetStore Admin', length: 20 });
  const qr = await QRCode.toDataURL(secret.otpauth_url);
  // Store temp secret (not enabled yet)
  const auth = readAuth();
  writeAuth({ ...auth, twoFactorSecret: secret.base32, twoFactorEnabled: false });
  res.json({ qr, secret: secret.base32 });
});

/* POST /api/admin/2fa/verify — verify code and enable 2FA */
app.post('/api/admin/2fa/verify', adminLimiter, requireAuth, (req, res) => {
  const { code } = req.body;
  const auth = readAuth();
  if (!auth.twoFactorSecret) return res.status(400).json({ error: 'Run setup first' });
  const valid = speakeasy.totp.verify({
    secret: auth.twoFactorSecret,
    encoding: 'base32',
    token: String(code),
    window: 1,
  });
  if (!valid) return res.status(400).json({ error: 'Invalid code. Try again.' });
  writeAuth({ ...auth, twoFactorEnabled: true });
  console.log('🔒 2FA enabled');
  res.json({ success: true });
});

/* POST /api/admin/2fa/disable */
app.post('/api/admin/2fa/disable', adminLimiter, requireAuth, (req, res) => {
  const auth = readAuth();
  writeAuth({ ...auth, twoFactorSecret: null, twoFactorEnabled: false });
  console.log('🔓 2FA disabled');
  res.json({ success: true });
});

/* GET /api/admin/2fa/status */
app.get('/api/admin/2fa/status', adminLimiter, requireAuth, (req, res) => {
  const auth = readAuth();
  res.json({ enabled: auth.twoFactorEnabled || false });
});

/* POST /api/admin/backup — manual backup */
app.post('/api/admin/backup', adminLimiter, requireAuth, (req, res) => {
  try {
    runBackup();
    const files = fs.readdirSync(BACKUP_DIR).filter(f=>f.startsWith('orders-'));
    res.json({ success: true, backupCount: files.length });
  } catch(e) {
    res.status(500).json({ error: 'Backup failed' });
  }
});

/* GET /api/admin/backups — list backups */
app.get('/api/admin/backups', adminLimiter, requireAuth, (req, res) => {
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f=>f.startsWith('orders-'))
    .sort()
    .reverse()
    .map(f => ({ name: f, size: fs.statSync(path.join(BACKUP_DIR,f)).size, date: f.replace('orders-','').replace('.json','') }));
  res.json(files);
});

/* ════════════════════════════════════════
   ADMIN ROUTES
════════════════════════════════════════ */

app.get('/api/admin/orders', adminLimiter, requireAuth, (req, res) => {
  const orders = readOrders();
  const { status } = req.query;
  const limit  = Math.min(parseInt(req.query.limit) || 100, 500);
  const filtered = status ? orders.filter(o => o.status === status) : orders;
  res.json(filtered.slice(0, limit));
});

app.get('/api/admin/orders/:id', adminLimiter, requireAuth, (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid ID' });
  const order = getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

app.patch('/api/admin/orders/:id', adminLimiter, requireAuth, (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid ID' });
  const { status, size, qty, city, address } = req.body;
  const allowed = ['new','pending','confirmed','cancelled','edited','processing','called','reported','done'];
  if (status && !allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const updated = updateOrder(req.params.id, {
    status,
    size:    sanitize(size || '', 10),
    qty:     qty ? Math.min(Math.max(parseInt(qty)||1,1),99) : undefined,
    city:    sanitize(city || '', 60),
    address: sanitize(address || '', 200),
  });
  if (!updated) return res.status(404).json({ error: 'Order not found' });
  res.json(updated);
});

app.delete('/api/admin/orders/:id', adminLimiter, requireAuth, (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid ID' });
  const orders = readOrders();
  if (!orders.find(o => o.id === req.params.id)) return res.status(404).json({ error: 'Order not found' });
  fs.writeFileSync(path.join(__dirname, 'orders.json'), JSON.stringify(orders.filter(o => o.id !== req.params.id), null, 2));
  res.json({ success: true });
});

app.post('/api/admin/upload', adminLimiter, requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ url: `uploads/${req.file.filename}`, filename: req.file.filename });
});

app.get('/api/admin/suspicious', adminLimiter, requireAuth, (req, res) => {
  const orders = readOrders();
  const map = {};
  orders.forEach(o => {
    const key = o.phone || o.clientIp || 'unknown';
    if (!map[key]) map[key] = { name: o.customer, phone: o.phone, clientIp: o.clientIp, failedCount: 0, totalOrders: 0 };
    map[key].totalOrders++;
    if (o.status === 'cancelled' || o.deliveryStatus === 'failed') map[key].failedCount++;
    if (o.customer && o.customer !== 'Unknown') map[key].name = o.customer;
    if (o.clientIp) map[key].clientIp = o.clientIp;
  });
  res.json(Object.values(map).filter(c => c.failedCount >= 3));
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

app.get('/api/admin/stats', adminLimiter, requireAuth, (req, res) => {
  const orders = readOrders();
  res.json({
    total:      orders.length,
    pending:    orders.filter(o => o.status === 'pending').length,
    confirmed:  orders.filter(o => o.status === 'confirmed').length,
    cancelled:  orders.filter(o => o.status === 'cancelled').length,
    edited:     orders.filter(o => o.status === 'edited').length,
    processing: orders.filter(o => o.status === 'processing').length,
  });
});

/* ════════════════════════════════════════
   OLIVRAISON — Send confirmed orders
════════════════════════════════════════ */
app.post('/api/admin/olivraison/send', adminLimiter, requireAuth, async (req, res) => {
  const { orderIds, publicKey, privateKey } = req.body;
  if (!Array.isArray(orderIds) || !orderIds.length) return res.status(400).json({ error: 'No order IDs provided' });
  if (!publicKey || !privateKey) return res.status(400).json({ error: 'Olivraison credentials required' });

  const GRAPHQL_URL = 'https://api.olivraison.com/graphql';
  const orders = readOrders();
  const results = [];

  for (const id of orderIds.slice(0, 100)) { // cap at 100 to prevent abuse
    const order = orders.find(o => o.id === id);
    if (!order) { results.push({ orderId: id, success: false, error: 'Order not found' }); continue; }

    const mutation = `mutation CreateShipment($input: ShipmentInput!) {
      createShipment(input: $input) {
        id trackingCode status
      }
    }`;

    const variables = {
      input: {
        recipientName:    order.customer  || 'Unknown',
        recipientPhone:   order.phone     || '',
        recipientAddress: order.address   || '',
        recipientCity:    order.city      || '',
        description:      order.product   || '',
        weight:           1,
        price:            order.total     || 0,
        codAmount:        order.total     || 0,
        externalId:       order.id,
      }
    };

    try {
      const resp = await fetch(GRAPHQL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-public-key':  publicKey,
          'x-private-key': privateKey,
        },
        body: JSON.stringify({ query: mutation, variables }),
      });
      const json = await resp.json();

      if (json.errors && json.errors.length) {
        results.push({ orderId: id, customer: order.customer, success: false, error: json.errors[0].message });
      } else {
        const shipment = json.data?.createShipment;
        // Update order status to 'processing' and store tracking code
        updateOrder(id, { status: 'processing', trackingCode: shipment?.trackingCode || null, olivraisonId: shipment?.id || null });
        results.push({ orderId: id, customer: order.customer, success: true, trackingCode: shipment?.trackingCode || null });
      }
    } catch (err) {
      results.push({ orderId: id, customer: order.customer, success: false, error: err.message });
    }
  }

  res.json({ results });
});

/* ════════════════════════════════════════
   PRODUCT OVERRIDES
════════════════════════════════════════ */
const OVERRIDES_FILE = path.join(__dirname, 'product_overrides.json');

function readOverrides() {
  try { return JSON.parse(fs.existsSync(OVERRIDES_FILE) ? fs.readFileSync(OVERRIDES_FILE, 'utf8') : '{}'); }
  catch { return {}; }
}

/* GET /api/products/overrides — public, used by product pages on all devices */
app.get('/api/products/overrides', (req, res) => {
  res.json(readOverrides());
});

/* PUT /api/admin/products/overrides — admin only, called when admin saves a product */
app.put('/api/admin/products/overrides', adminLimiter, requireAuth, (req, res) => {
  const overrides = req.body;
  if (typeof overrides !== 'object' || Array.isArray(overrides)) {
    return res.status(400).json({ error: 'Invalid overrides data' });
  }
  fs.writeFileSync(OVERRIDES_FILE, JSON.stringify(overrides, null, 2));
  res.json({ success: true });
});

/* ════════════════════════════════════════
   START
════════════════════════════════════════ */
app.listen(PORT, () => {
  console.log(`\n🚀 StreetStore API running on port ${PORT}\n`);
});
