/**
 * Simple JSON file database for orders.
 * All orders are stored in orders.json next to this file.
 */

const fs   = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'orders.json');

/* ── Read all orders ── */
function readOrders() {
  try {
    if (!fs.existsSync(DB_FILE)) return [];
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return [];
  }
}

/* ── Write all orders ── */
function writeOrders(orders) {
  fs.writeFileSync(DB_FILE, JSON.stringify(orders, null, 2));
}

/* ── Get one order by ID ── */
function getOrder(id) {
  return readOrders().find(o => o.id === id) || null;
}

/* ── Get order by phone (latest pending) ── */
function getOrderByPhone(phone) {
  const orders = readOrders();
  // Find the most recent pending order for this phone
  return orders
    .filter(o => normalizePhone(o.phone) === normalizePhone(phone) && o.status === 'pending')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
}

/* ── Save a new order ── */
function createOrder(data) {
  const orders = readOrders();
  const order = {
    id:         'SS-' + Date.now(),
    status:     'pending',       // pending → confirmed / cancelled / edited
    createdAt:  new Date().toISOString(),
    updatedAt:  new Date().toISOString(),
    msgSent:    false,
    ...data,
  };
  orders.unshift(order);
  writeOrders(orders);
  return order;
}

/* ── Update order fields ── */
function updateOrder(id, fields) {
  const orders = readOrders();
  const idx    = orders.findIndex(o => o.id === id);
  if (idx === -1) return null;
  orders[idx] = { ...orders[idx], ...fields, updatedAt: new Date().toISOString() };
  writeOrders(orders);
  return orders[idx];
}

/* ── Normalize phone to WhatsApp ID format ── */
function normalizePhone(raw) {
  if (!raw) return '';
  let n = String(raw).replace(/\D/g, '');        // strip non-digits
  if (n.startsWith('0') && n.length === 10) {    // 06XXXXXXXX → 2126XXXXXXXX
    n = '212' + n.slice(1);
  }
  if (!n.endsWith('@c.us')) n = n + '@c.us';
  return n;
}

module.exports = { readOrders, getOrder, getOrderByPhone, createOrder, updateOrder, normalizePhone };
