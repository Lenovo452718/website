/* ============================================================
   StreetStore — Backend URL Configuration
   Change ONLY this file when you deploy the backend.
   ============================================================ */

// Replace with your Render URL after deployment
// e.g. 'https://streetstore-api.onrender.com'
const STREETSTORE_BACKEND = 'http://localhost:3000';

// Make API URL available to products.js real-time sync
window.SS_API_URL = STREETSTORE_BACKEND;
