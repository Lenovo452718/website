/**
 * WhatsApp client using whatsapp-web.js
 * Connects to your WhatsApp by scanning a QR code once.
 * Session is saved so you only need to scan once.
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode  = require('qrcode-terminal');
const QRCode  = require('qrcode');
const { getOrderByPhone, updateOrder, normalizePhone } = require('./db');

let client      = null;
let isReady     = false;
let lastQR      = null;   // latest QR as data URL (for web display)

// Conversation state: tracks customers mid-edit flow
// { "2126XXXXXXXX@c.us": { step: 'awaiting_edit_choice' | 'awaiting_size' | ..., orderId: '...' } }
const convState = {};

/* ════════════════════════════════════════
   INIT
════════════════════════════════════════ */
function initWhatsApp() {
  client = new Client({
    authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    },
  });

  /* ── QR Code ── */
  client.on('qr', (qr) => {
    console.log('\n📱 Scan this QR code with your WhatsApp:\n');
    qrcode.generate(qr, { small: true });
    // Also save as image URL so you can view it in the browser at /qr
    QRCode.toDataURL(qr).then(url => { lastQR = url; });
  });

  /* ── Ready ── */
  client.on('ready', () => {
    isReady  = true;
    lastQR   = null;
    console.log('✅ WhatsApp connected and ready!');
  });

  /* ── Disconnected ── */
  client.on('disconnected', (reason) => {
    isReady = false;
    console.log('❌ WhatsApp disconnected:', reason);
    // Auto-reconnect after 5 seconds
    setTimeout(() => client.initialize(), 5000);
  });

  /* ── Incoming messages (customer replies) ── */
  client.on('message', async (msg) => {
    const from = msg.from;
    const body = msg.body.trim().toLowerCase();

    // Ignore group messages
    if (from.endsWith('@g.us')) return;

    const state = convState[from];

    /* ─ Mid-edit conversation ─ */
    if (state) {
      await handleEditConversation(msg, from, body, state);
      return;
    }

    /* ─ First-time reply to order message ─ */
    const order = getOrderByPhone(from);
    if (!order) return;  // no pending order for this number

    if (body === '1' || body.includes('confirm') || body.includes('oui') || body.includes('yes')) {
      await handleConfirm(from, order);
    } else if (body === '2' || body.includes('cancel') || body.includes('annul') || body.includes('no') || body.includes('non')) {
      await handleCancel(from, order);
    } else if (body === '3' || body.includes('edit') || body.includes('modif') || body.includes('change')) {
      await handleEditStart(from, order);
    }
  });

  client.initialize();
}

/* ════════════════════════════════════════
   SEND ORDER CONFIRMATION MESSAGE
════════════════════════════════════════ */
async function sendOrderMessage(order) {
  if (!isReady) {
    console.log('⚠️  WhatsApp not ready — message queued');
    return false;
  }

  const to  = normalizePhone(order.phone);
  const msg =
`Hello ${order.customer} 👋

Thank you for your order at *${process.env.STORE_NAME || 'StreetStore'}*!

🛍️ *Order Summary*
━━━━━━━━━━━━━━━━
📦 Product: ${order.product}
📐 Size: ${order.size}
🔢 Qty: ${order.qty}
🏙️ City: ${order.city}
💰 Total: *${order.price}*
━━━━━━━━━━━━━━━━
🆔 Order ID: ${order.id}

Please choose an option:

1️⃣ - *Confirm Order*
2️⃣ - *Cancel Order*
3️⃣ - *Edit Order*

Reply with *1*, *2*, or *3*`;

  try {
    await client.sendMessage(to, msg);
    updateOrder(order.id, { msgSent: true });
    console.log(`📤 Order message sent to ${order.customer} (${order.phone})`);
    return true;
  } catch (err) {
    console.error('❌ Failed to send message:', err.message);
    return false;
  }
}

/* ════════════════════════════════════════
   HANDLE CONFIRM
════════════════════════════════════════ */
async function handleConfirm(from, order) {
  updateOrder(order.id, { status: 'confirmed' });
  await client.sendMessage(from,
`✅ *Order Confirmed!*

Your order *${order.id}* has been confirmed and will be processed soon.

We will contact you to arrange delivery to *${order.city}*.

Thank you for shopping at ${process.env.STORE_NAME || 'StreetStore'} 🙏`
  );
  console.log(`✅ Order ${order.id} confirmed by customer`);
}

/* ════════════════════════════════════════
   HANDLE CANCEL
════════════════════════════════════════ */
async function handleCancel(from, order) {
  updateOrder(order.id, { status: 'cancelled' });
  await client.sendMessage(from,
`❌ *Order Cancelled*

Your order *${order.id}* has been cancelled.

If you change your mind, visit our store anytime.
Thank you! 🙏`
  );
  console.log(`❌ Order ${order.id} cancelled by customer`);
}

/* ════════════════════════════════════════
   HANDLE EDIT — START
════════════════════════════════════════ */
async function handleEditStart(from, order) {
  convState[from] = { step: 'awaiting_edit_choice', orderId: order.id };
  await client.sendMessage(from,
`✏️ *Edit Order ${order.id}*

What would you like to change?

1️⃣ - Size (current: *${order.size}*)
2️⃣ - Quantity (current: *${order.qty}*)
3️⃣ - City / Address (current: *${order.city}*)

Reply with *1*, *2*, or *3*`
  );
}

/* ════════════════════════════════════════
   HANDLE EDIT — CONVERSATION FLOW
════════════════════════════════════════ */
async function handleEditConversation(msg, from, body, state) {
  const { step, orderId } = state;

  if (step === 'awaiting_edit_choice') {
    if (body === '1') {
      convState[from] = { step: 'awaiting_size', orderId };
      await client.sendMessage(from, '📐 Please type your new size (XS / S / M / L / XL):');
    } else if (body === '2') {
      convState[from] = { step: 'awaiting_qty', orderId };
      await client.sendMessage(from, '🔢 Please type the new quantity (e.g. 2):');
    } else if (body === '3') {
      convState[from] = { step: 'awaiting_city', orderId };
      await client.sendMessage(from, '🏙️ Please type your new city / delivery address:');
    } else {
      await client.sendMessage(from, 'Please reply with *1*, *2*, or *3*.');
    }
    return;
  }

  if (step === 'awaiting_size') {
    const validSizes = ['xs','s','m','l','xl','34','36','38','40','42'];
    const newSize = body.toUpperCase();
    if (!validSizes.includes(body)) {
      await client.sendMessage(from, `❌ Invalid size. Please choose from: XS, S, M, L, XL`);
      return;
    }
    updateOrder(orderId, { size: newSize, status: 'edited' });
    delete convState[from];
    await client.sendMessage(from, `✅ Size updated to *${newSize}*. Your order has been saved.\n\nOrder ID: *${orderId}*`);
    return;
  }

  if (step === 'awaiting_qty') {
    const qty = parseInt(body, 10);
    if (isNaN(qty) || qty < 1 || qty > 10) {
      await client.sendMessage(from, '❌ Please enter a valid quantity (1–10).');
      return;
    }
    updateOrder(orderId, { qty, status: 'edited' });
    delete convState[from];
    await client.sendMessage(from, `✅ Quantity updated to *${qty}*. Your order has been saved.\n\nOrder ID: *${orderId}*`);
    return;
  }

  if (step === 'awaiting_city') {
    if (body.length < 2) {
      await client.sendMessage(from, '❌ Please enter a valid city or address.');
      return;
    }
    const newCity = msg.body.trim(); // preserve original casing
    updateOrder(orderId, { city: newCity, status: 'edited' });
    delete convState[from];
    await client.sendMessage(from, `✅ Delivery address updated to *${newCity}*. Your order has been saved.\n\nOrder ID: *${orderId}*`);
    return;
  }
}

/* ════════════════════════════════════════
   EXPORTS
════════════════════════════════════════ */
function getStatus()  { return { ready: isReady, qr: lastQR }; }
function getClient()  { return client; }

module.exports = { initWhatsApp, sendOrderMessage, getStatus, getClient };
