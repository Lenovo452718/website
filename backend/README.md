# StreetStore WhatsApp Bot — Setup Guide

## How it works

1. Customer fills the "Buy Now" form on your website
2. Website sends the order to this backend server
3. Server saves the order and sends a WhatsApp message to the customer
4. Customer replies with 1 (Confirm), 2 (Cancel), or 3 (Edit)
5. Server updates the order and replies automatically
6. Admin panel shows all orders with their status

---

## Step 1 — Install

```bash
cd backend
npm install
```

---

## Step 2 — Create your .env file

```bash
cp .env.example .env
```

Then open `.env` and fill in:

```
PORT=3000
API_SECRET=choose-any-secret-key-here
STORE_PHONE=212771152186
STORE_NAME=StreetStore
WEBSITE_URL=https://yourusername.github.io
```

---

## Step 3 — Run the server

```bash
npm start
```

The first time it runs, open your browser at:
**http://localhost:3000/qr**

You will see a QR code. Scan it with your WhatsApp:
- Open WhatsApp on your phone
- Tap Menu (3 dots) → Linked Devices → Link a Device
- Scan the QR code

Once scanned, the terminal will show: ✅ WhatsApp connected and ready!

The session is saved — you only need to scan once.

---

## Step 4 — Connect your website to the backend

In your website, add this line BEFORE script.js loads:

```html
<script>
  const STREETSTORE_BACKEND = 'http://localhost:3000';
</script>
```

For production (deployed server), change the URL to your server URL.

---

## Step 5 — Deploy to Railway (free hosting)

1. Go to https://railway.app and create a free account
2. Create a new project → Deploy from GitHub repo
3. Select the `backend` folder
4. Add your environment variables in Railway's dashboard (same as .env)
5. Railway gives you a public URL like `https://streetstore-bot.railway.app`
6. Update STREETSTORE_BACKEND in your website to that URL

---

## Admin API

All admin routes require the header: `x-api-key: your-secret`

| Method | URL | Description |
|--------|-----|-------------|
| GET | /api/admin/orders | All orders |
| GET | /api/admin/orders/:id | Single order |
| PATCH | /api/admin/orders/:id | Update status/fields |
| DELETE | /api/admin/orders/:id | Delete order |
| GET | /api/admin/stats | Dashboard stats |

Example:
```bash
curl http://localhost:3000/api/admin/orders \
  -H "x-api-key: your-secret-key"
```

---

## Customer message example

When an order is placed, the customer receives:

```
Hello Sara 👋

Thank you for your order at StreetStore!

🛍️ Order Summary
━━━━━━━━━━━━━━━━
📦 Product: High-Rise Dark Blue Jeans
📐 Size: M
🔢 Qty: 1
🏙️ City: Casablanca
💰 Total: 179 MAD
━━━━━━━━━━━━━━━━
🆔 Order ID: SS-1234567890

Please choose an option:

1️⃣ - Confirm Order
2️⃣ - Cancel Order
3️⃣ - Edit Order

Reply with 1, 2, or 3
```

---

## Order statuses

| Status | Meaning |
|--------|---------|
| pending | Order received, awaiting customer confirmation |
| confirmed | Customer replied 1 |
| cancelled | Customer replied 2 |
| edited | Customer changed size/qty/city |
| processing | You marked it as in progress |
