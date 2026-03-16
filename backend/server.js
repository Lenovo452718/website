/**
 * StreetStore — WhatsApp Order Bot
 * ─────────────────────────────────
 * 1. Receives orders from the website via POST /api/orders
 * 2. Saves them to orders.json
 * 3. Sends a WhatsApp message to the customer automatically
 * 4. Handles customer replies (confirm / cancel / edit)
 * 5. Exposes REST API for admin panel
 */

require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const { initWhatsApp, sendOrderMessage, getStatus } = require('./whatsapp');
const { createOrder, readOrders, getOrder, updateOrder } = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ════════════════════════════════════════
   MIDDLEWARE
════════════════════════════════════════ */
app.use(express.json());
app.use(cors({
  origin: [
    process.env.WEBSITE_URL || '*',
    'http://localhost',
    'http://127.0.0.1',
    /\.github\.io$/,       // allow all GitHub Pages
  ],
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
}));

/* ── Simple API key auth for admin routes ── */
function requireAuth(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.key;
  if (key === process.env.API_SECRET) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

/* ════════════════════════════════════════
   PUBLIC ROUTES
════════════════════════════════════════ */

/* Health check */
app.get('/', (req, res) => {
  const wa = getStatus();
  res.json({
    service:   'StreetStore Bot',
    whatsapp:  wa.ready ? 'connected' : 'waiting for QR scan',
    timestamp: new Date().toISOString(),
  });
});

/* QR Code page — open this in browser to scan */
app.get('/qr', (req, res) => {
  const { ready, qr } = getStatus();
  if (ready) {
    return res.send(`<h2 style="font-family:sans-serif;color:green">✅ WhatsApp is connected!</h2>`);
  }
  if (!qr) {
    return res.send(`<h2 style="font-family:sans-serif">⏳ Generating QR code... refresh in 5 seconds.</h2>
      <meta http-equiv="refresh" content="5">`);
  }
  res.send(`
    <!DOCTYPE html><html><head><title>Scan QR</title>
    <meta http-equiv="refresh" content="30">
    <style>body{font-family:sans-serif;text-align:center;padding:40px;background:#f7f7f5}
    h2{color:#0f1f3d}img{border:4px solid #0f1f3d;border-radius:8px;margin-top:20px}</style>
    </head><body>
    <h2>📱 Scan with your WhatsApp</h2>
    <p style="color:#888">Open WhatsApp → Menu → Linked Devices → Link a Device</p>
    <img src="${qr}" width="280">
    <p style="color:#888;font-size:13px">Page auto-refreshes every 30s</p>
    </body></html>`);
});

/* ── POST /api/orders — Website sends new order here ── */
app.post('/api/orders', async (req, res) => {
  const { product, size, qty, price, customer, phone, city, address } = req.body;

  /* Basic validation */
  if (!product || !customer || !phone || !city) {
    return res.status(400).json({ error: 'Missing required fields: product, customer, phone, city' });
  }

  /* Validate phone */
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 9) {
    return res.status(400).json({ error: 'Invalid phone number' });
  }

  /* Save order */
  const order = createOrder({ product, size, qty: qty || 1, price, customer, phone, city, address });
  console.log(`🆕 New order: ${order.id} — ${customer} — ${product}`);

  /* Send WhatsApp message (async, don't block response) */
  setTimeout(async () => {
    const sent = await sendOrderMessage(order);
    if (sent) updateOrder(order.id, { msgSent: true });
  }, 500);

  res.status(201).json({
    success: true,
    orderId: order.id,
    message: 'Order received. WhatsApp confirmation will be sent shortly.',
  });
});

/* ════════════════════════════════════════
   ADMIN ROUTES (protected by API key)
════════════════════════════════════════ */

/* GET all orders */
app.get('/api/admin/orders', requireAuth, (req, res) => {
  const orders = readOrders();
  const { status, limit = 100 } = req.query;
  const filtered = status ? orders.filter(o => o.status === status) : orders;
  res.json(filtered.slice(0, parseInt(limit)));
});

/* GET single order */
app.get('/api/admin/orders/:id', requireAuth, (req, res) => {
  const order = getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

/* PATCH update order status */
app.patch('/api/admin/orders/:id', requireAuth, (req, res) => {
  const { status, size, qty, city, address } = req.body;
  const allowed = ['pending','confirmed','cancelled','edited','processing'];
  if (status && !allowed.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const updated = updateOrder(req.params.id, { status, size, qty, city, address });
  if (!updated) return res.status(404).json({ error: 'Order not found' });
  console.log(`📝 Admin updated order ${req.params.id} → ${status || 'fields updated'}`);
  res.json(updated);
});

/* DELETE order */
app.delete('/api/admin/orders/:id', requireAuth, (req, res) => {
  const { readOrders, updateOrder } = require('./db');
  const orders  = readOrders();
  const exists  = orders.find(o => o.id === req.params.id);
  if (!exists) return res.status(404).json({ error: 'Order not found' });
  const fs   = require('fs');
  const path = require('path');
  const filtered = orders.filter(o => o.id !== req.params.id);
  fs.writeFileSync(path.join(__dirname, 'orders.json'), JSON.stringify(filtered, null, 2));
  console.log(`🗑️  Admin deleted order ${req.params.id}`);
  res.json({ success: true });
});

/* GET stats summary */
app.get('/api/admin/stats', requireAuth, (req, res) => {
  const orders = readOrders();
  res.json({
    total:      orders.length,
    pending:    orders.filter(o => o.status === 'pending').length,
    confirmed:  orders.filter(o => o.status === 'confirmed').length,
    cancelled:  orders.filter(o => o.status === 'cancelled').length,
    edited:     orders.filter(o => o.status === 'edited').length,
    processing: orders.filter(o => o.status === 'processing').length,
    whatsapp:   getStatus().ready,
  });
});

/* ════════════════════════════════════════
   START
════════════════════════════════════════ */
app.listen(PORT, () => {
  console.log(`\n🚀 StreetStore Bot running on port ${PORT}`);
  console.log(`📊 Admin API: http://localhost:${PORT}/api/admin/orders`);
  console.log(`📱 QR Code:   http://localhost:${PORT}/qr\n`);
});

/* Init WhatsApp (will show QR in terminal + at /qr) */
initWhatsApp();
