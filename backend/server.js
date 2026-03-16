/**
 * StreetStore — Order & Admin API
 * ─────────────────────────────────
 * 1. Receives orders from the website via POST /api/orders
 * 2. Saves them to orders.json
 * 3. Exposes REST API for admin panel
 */

require('dotenv').config();

const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const multer    = require('multer');
const path      = require('path');
const fs        = require('fs');
const { createOrder, readOrders, getOrder, updateOrder } = require('./db');

/* ── Blocked IPs store ── */
const BLOCKED_IPS_FILE = path.join(__dirname, 'blocked_ips.json');
function readBlockedIps() {
  try { return JSON.parse(fs.existsSync(BLOCKED_IPS_FILE) ? fs.readFileSync(BLOCKED_IPS_FILE,'utf8') : '[]'); }
  catch { return []; }
}
function writeBlockedIps(list) { fs.writeFileSync(BLOCKED_IPS_FILE, JSON.stringify(list, null, 2)); }

/* ── Get real client IP ── */
function getClientIp(req) {
  return req.socket?.remoteAddress || 'unknown';
}

/* ── Sanitize string: strip HTML tags, trim, limit length ── */
function sanitize(str, maxLen = 200) {
  if (typeof str !== 'string') return '';
  return str.replace(/<[^>]*>/g, '').trim().slice(0, maxLen);
}

/* ── Validate ID format ── */
function isValidId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

/* ── File upload setup ── */
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
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|mp4|mov|webm|avi)$/i;
    if (allowed.test(path.extname(file.originalname))) cb(null, true);
    else cb(new Error('Only images and videos are allowed'));
  }
});

const app  = express();
const PORT = process.env.PORT || 3000;

/* ════════════════════════════════════════
   SECURITY MIDDLEWARE
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

/* ── Rate limiters ── */
const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 5,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many orders submitted. Please wait 15 minutes and try again.' },
  keyGenerator: (req) => req.socket?.remoteAddress || 'unknown',
});

const adminLimiter = rateLimit({
  windowMs: 60 * 1000, max: 60,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests.' },
  keyGenerator: (req) => req.socket?.remoteAddress || 'unknown',
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Try again later.' },
  keyGenerator: (req) => req.socket?.remoteAddress || 'unknown',
});

/* ── API key auth ── */
function requireAuth(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key || key !== process.env.API_SECRET) {
    console.warn(`⚠️  Unauthorized access attempt from ${getClientIp(req)}`);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

/* ════════════════════════════════════════
   PUBLIC ROUTES
════════════════════════════════════════ */

/* Health check */
app.get('/', (req, res) => {
  res.json({ service: 'StreetStore API', status: 'running', timestamp: new Date().toISOString() });
});

/* ── POST /api/orders ── */
app.post('/api/orders', orderLimiter, async (req, res) => {
  const clientIp = getClientIp(req);

  if (readBlockedIps().includes(clientIp)) {
    console.log(`🚫 Blocked IP tried to order: ${clientIp}`);
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

  res.status(201).json({
    success: true,
    orderId: order.id,
    message: 'Order received successfully.',
  });
});

/* ════════════════════════════════════════
   ADMIN ROUTES
════════════════════════════════════════ */

/* POST /api/admin/login */
app.post('/api/admin/login', authLimiter, (req, res) => {
  const { password } = req.body;
  if (!password || password !== process.env.API_SECRET) {
    console.warn(`🔐 Failed login attempt from ${getClientIp(req)}`);
    return res.status(401).json({ error: 'Wrong password' });
  }
  res.json({ token: process.env.API_SECRET });
});

/* GET all orders */
app.get('/api/admin/orders', adminLimiter, requireAuth, (req, res) => {
  const orders = readOrders();
  const { status } = req.query;
  const limit  = Math.min(parseInt(req.query.limit) || 100, 500);
  const filtered = status ? orders.filter(o => o.status === status) : orders;
  res.json(filtered.slice(0, limit));
});

/* GET single order */
app.get('/api/admin/orders/:id', adminLimiter, requireAuth, (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid ID' });
  const order = getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

/* PATCH update order */
app.patch('/api/admin/orders/:id', adminLimiter, requireAuth, (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid ID' });
  const { status, size, qty, city, address } = req.body;
  const allowed = ['pending','confirmed','cancelled','edited','processing'];
  if (status && !allowed.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const updated = updateOrder(req.params.id, {
    status,
    size:    sanitize(size || '', 10),
    qty:     qty ? Math.min(Math.max(parseInt(qty) || 1, 1), 99) : undefined,
    city:    sanitize(city || '', 60),
    address: sanitize(address || '', 200),
  });
  if (!updated) return res.status(404).json({ error: 'Order not found' });
  console.log(`📝 Admin updated order ${req.params.id} → ${status || 'fields updated'}`);
  res.json(updated);
});

/* DELETE order */
app.delete('/api/admin/orders/:id', adminLimiter, requireAuth, (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid ID' });
  const orders = readOrders();
  const exists = orders.find(o => o.id === req.params.id);
  if (!exists) return res.status(404).json({ error: 'Order not found' });
  const filtered = orders.filter(o => o.id !== req.params.id);
  fs.writeFileSync(path.join(__dirname, 'orders.json'), JSON.stringify(filtered, null, 2));
  console.log(`🗑️  Admin deleted order ${req.params.id}`);
  res.json({ success: true });
});

/* POST upload file */
app.post('/api/admin/upload', adminLimiter, requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  console.log(`📁 Uploaded: ${req.file.filename}`);
  res.json({ url: `uploads/${req.file.filename}`, filename: req.file.filename });
});

/* GET suspicious customers */
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

/* GET blocked IPs */
app.get('/api/admin/blocked-ips', adminLimiter, requireAuth, (req, res) => {
  res.json(readBlockedIps());
});

/* POST block IP */
app.post('/api/admin/block-ip', adminLimiter, requireAuth, (req, res) => {
  const ip = sanitize(req.body.ip || '', 45);
  if (!ip || !/^[\d.:a-fA-F]+$/.test(ip)) return res.status(400).json({ error: 'Invalid IP' });
  const list = readBlockedIps();
  if (!list.includes(ip)) { list.push(ip); writeBlockedIps(list); }
  console.log(`🚫 Blocked IP: ${ip}`);
  res.json({ success: true, blocked: list });
});

/* DELETE unblock IP */
app.delete('/api/admin/block-ip/:ip', adminLimiter, requireAuth, (req, res) => {
  const ip = decodeURIComponent(req.params.ip);
  if (!/^[\d.:a-fA-F]+$/.test(ip)) return res.status(400).json({ error: 'Invalid IP' });
  const list = readBlockedIps().filter(x => x !== ip);
  writeBlockedIps(list);
  console.log(`✅ Unblocked IP: ${ip}`);
  res.json({ success: true, blocked: list });
});

/* GET stats */
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
   START
════════════════════════════════════════ */
app.listen(PORT, () => {
  console.log(`\n🚀 StreetStore API running on port ${PORT}`);
  console.log(`📊 Admin: http://localhost:${PORT}/api/admin/orders\n`);
});
