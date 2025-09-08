// index.js
const http = require('http');
const { Server } = require('socket.io');
const express = require('express');
// İstersen body-parser yerine express.json da kullanabilirsin
const bodyParser = require('body-parser');
const cors = require('cors');

// Node 18+ ise fetch global; değilse aşağıyı aç:
// const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const app = express();
const server = http.createServer(app);

// Socket.IO (CORS açık)
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
  }
});

// REST için CORS (preflight dahil)
app.use(cors({
  origin: "*",
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type", "token"],
  exposedHeaders: []
}));
app.options("*", cors({
  origin: "*",
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type", "token"],
  exposedHeaders: []
}));

// JSON gövde parse
app.use(bodyParser.json()); // alternatif: app.use(express.json());

// ===================== Webhook endpointleri =====================
app.post('/getir/add', (req, res) => {
  console.log('📩 Getir ADD verisi geldi:', req.body);
  io.emit('newOrder', req.body);   // frontend 'newOrder' eventini dinliyor
  res.status(200).send('OK');
});

app.post('/getir/cancel', (req, res) => {
  console.log('📩 Getir CANCEL verisi geldi:', req.body);
  io.emit('newOrder', req.body);
  res.status(200).send('OK');
});

app.post('/yemeksepeti/add', (req, res) => {
  console.log('📩 Yemeksepeti ADD verisi geldi:', req.body);
  io.emit('newOrder', req.body);
  res.status(200).send('OK');
});

app.post('/yemeksepeti/update', (req, res) => {
  console.log('📩 Yemeksepeti UPDATE verisi geldi:', req.body);
  io.emit('newOrder', req.body);
  res.status(200).send('OK');
});

// Helper function to safely parse JSON responses
function tryJson(text) {
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

// ===================== Getir API Proxy =====================
// Frontend doğrudan Getir'e değil, buraya vuracak.
// Örn: POST /api/getir/orders/:id/verify  -> sunucu tarafı Getir'e çağrı yapar.
app.post('/api/getir/orders/:id/verify', async (req, res) => {
  try {
    const { id } = req.params;
    const url = `https://food-external-api-gateway.development.getirapi.com/food-orders/${id}/verify`;

    // Token'ı öncelikle istemcinin header'ından al, yoksa env'den kullan
    const token = req.headers['token'];
    if (!token) {
      return res.status(400).json({ error: 'token header is required' });
    }

    // Upstream header'ları
    const headers = {
      'Content-Type': 'application/json',
      'token': token
    };

    const upstream = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(req.body || {})
    });

    const text = await upstream.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    return res.status(upstream.status).json(json);
  } catch (err) {
    console.error('Getir verify proxy error:', err);
    return res.status(502).json({ error: 'Upstream call failed' });
  }
});

// ===================== Getir Prepare Order Proxy =====================
app.post('/api/getir/orders/:id/prepare', async (req, res) => {
  try {
    const { id } = req.params;
    const url = `https://food-external-api-gateway.development.getirapi.com/food-orders/${id}/prepare`;

    const token = req.headers['token'];
    if (!token) {
      return res.status(400).json({ error: 'token header is required' });
    }

    const headers = {
      'Content-Type': 'application/json',
      'token': token
    };

    const upstream = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(req.body || {})
    });

    const text = await upstream.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    return res.status(upstream.status).json(json);
  } catch (err) {
    console.error('Getir prepare proxy error:', err);
    return res.status(502).json({ error: 'Upstream call failed' });
  }
});

// ===================== Getir Deliver Order Proxy =====================
app.post('/api/getir/orders/:id/deliver', async (req, res) => {
  try {
    const { id } = req.params;
    const url = `https://food-external-api-gateway.development.getirapi.com/food-orders/${id}/deliver`;

    const token = req.headers['token'];
    if (!token) {
      return res.status(400).json({ error: 'token header is required' });
    }

    const headers = {
      'Content-Type': 'application/json',
      'token': token
    };

    const upstream = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(req.body || {})
    });

    const text = await upstream.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    return res.status(upstream.status).json(json);
  } catch (err) {
    console.error('Getir deliver proxy error:', err);
    return res.status(502).json({ error: 'Upstream call failed' });
  }
});

// ===================== Getir Restaurant Status (Close/Open) =====================
// Close restaurant for a limited time (15 | 30 | 45 minutes)
app.put('/api/getir/restaurant/close', async (req, res) => {
  try {
    const token = req.headers['token'];
    if (!token) return res.status(400).json({ error: 'token header is required' });

    const { timeOffAmount } = req.body; // expected: 15 | 30 | 45
    if (![15, 30, 45].includes(Number(timeOffAmount))) {
      return res.status(400).json({ error: 'timeOffAmount must be 15, 30 or 45' });
    }

    const upstream = await fetch('https://developers.getir.com/restaurants/status/close', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', token },
      body: JSON.stringify({ timeOffAmount: Number(timeOffAmount) })
    });

    const text = await upstream.text();
    return res.status(upstream.status).json(tryJson(text));
  } catch (err) {
    console.error('Getir restaurant close error:', err);
    return res.status(502).json({ error: 'Upstream call failed' });
  }
});

// Open restaurant immediately
app.put('/api/getir/restaurant/open', async (req, res) => {
  try {
    const token = req.headers['token'];
    if (!token) return res.status(400).json({ error: 'token header is required' });

    const upstream = await fetch('https://developers.getir.com/restaurants/status/open', {
      method: 'PUT',
      headers: { token }
    });

    const text = await upstream.text();
    return res.status(upstream.status).json(tryJson(text));
  } catch (err) {
    console.error('Getir restaurant open error:', err);
    return res.status(502).json({ error: 'Upstream call failed' });
  }
});

// ===================== Getir Login Proxy + Socket Publish =====================
// Test ortamı için sabit keyler
const GETIR_LOGIN_URL = 'https://food-external-api-gateway.development.getirapi.com/auth/login';
const APP_SECRET_KEY = '4940b25d95c518c8a5c6be188408addb922972f0';
const RESTAURANT_SECRET_KEY = 'ce690a2598f17f2b715ef447c5d8355439e9ee72';

let LAST_GETIR_TOKEN = null;
let LAST_GETIR_RESTAURANT_ID = null;
let LAST_GETIR_EXPIRES_AT = null;

app.post('/api/getir/login', async (req, res) => {
  try {
    const body = {
      appSecretKey: APP_SECRET_KEY,
      restaurantSecretKey: RESTAURANT_SECRET_KEY,
    };

    const upstream = await fetch(GETIR_LOGIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const text = await upstream.text();
    let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }

    if (!upstream.ok) {
      return res.status(upstream.status).json(json);
    }

    const { restaurantId, token, expiresAt } = json;

    LAST_GETIR_TOKEN = token || null;
    LAST_GETIR_RESTAURANT_ID = restaurantId || null;
    LAST_GETIR_EXPIRES_AT = expiresAt || null;

    io.emit('getirToken', {
      restaurantId: restaurantId || null,
      token: token || null,
      expiresAt: expiresAt || null,
      ts: new Date().toISOString(),
    });

    return res.status(200).json({
      restaurantId: restaurantId || null,
      token: token || null,
      expiresAt: expiresAt || null,
    });
  } catch (err) {
    console.error('Getir login proxy error:', err);
    return res.status(502).json({ error: 'Upstream call failed' });
  }
});

app.get('/api/getir/token', (req, res) => {
  return res.status(200).json({
    restaurantId: LAST_GETIR_RESTAURANT_ID,
    token: LAST_GETIR_TOKEN,
    expiresAt: LAST_GETIR_EXPIRES_AT,
  });
});

// ===================== Test GET =====================
app.get('/', (req, res) => {
  res.send('Webhook çalışıyor!');
});

// ===================== Socket.IO bağlantı logu =====================
io.on('connection', (socket) => {
  console.log('🔌 Bir kullanıcı bağlandı');
});

// ===================== Sunucu =====================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Webhook ${PORT} portunda dinleniyor...`));