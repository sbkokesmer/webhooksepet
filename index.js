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
      return res.status(400).json({ error: 'token headerc is required' });
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

// ===================== Getir Verify Scheduled Proxy =====================
app.post('/api/getir/orders/:id/verifyScheduled', async (req, res) => {
  try {
    const { id } = req.params;
    const url = `https://food-external-api-gateway.development.getirapi.com/food-orders/${id}/verify-scheduled`;

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
    console.error('Getir verifyScheduled proxy error:', err);
    return res.status(502).json({ error: 'Upstream call failed' });
  }
});

// ===================== Getir Cancel Order Proxy =====================
app.post('/api/getir/orders/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const url = `https://food-external-api-gateway.development.getirapi.com/food-orders/${id}/cancel`;

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
    console.error('Getir cancel proxy error:', err);
    return res.status(502).json({ error: 'Upstream call failed' });
  }
});

// ===================== Getir Cancel Options Proxy =====================
app.get('/api/getir/orders/:id/cancel-options', async (req, res) => {
  try {
    const { id } = req.params;
    const url = `https://food-external-api-gateway.development.getirapi.com/food-orders/${id}/cancel-options`;

    const token = req.headers['token'];
    if (!token) {
      return res.status(400).json({ error: 'token header is required' });
    }

    const headers = {
      'Content-Type': 'application/json',
      'token': token
    };

    const upstream = await fetch(url, { method: 'GET', headers });
    const text = await upstream.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    return res.status(upstream.status).json(json);
  } catch (err) {
    console.error('Getir cancel-options proxy error:', err);
    return res.status(502).json({ error: 'Upstream call failed' });
  }
});

// ===================== Getir Auth Login Proxy =====================
app.post('/api/getir/login', async (req, res) => {
  try {
    const url = 'https://food-external-api-gateway.development.getirapi.com/auth/login';
    const headers = {
      'Content-Type': 'application/json'
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
    console.error('Getir auth login proxy error:', err);
    return res.status(502).json({ error: 'Upstream call failed' });
  }
});

// ===================== Getir Restaurant Status Proxy =====================
// RESTAURANT CLOSE ENDPOINT
app.put('/api/getir/restaurants/status/close', async (req, res) => {
  try {
    const url = 'https://food-external-api-gateway.development.getirapi.com/restaurants/status/close';
    const token = req.headers['token'];
    if (!token) {
      return res.status(400).json({ error: 'token header is required' });
    }
    const headers = {
      'Content-Type': 'application/json',
      'token': token
    };
    const upstream = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify(req.body || {})
    });
    const text = await upstream.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
    return res.status(upstream.status).json(json);
  } catch (err) {
    console.error('Getir restaurant close proxy error:', err);
    return res.status(502).json({ error: 'Upstream call failed' });
  }
});

// RESTAURANT OPEN ENDPOINT
app.put('/api/getir/restaurants/status/open', async (req, res) => {
  try {
    const url = 'https://food-external-api-gateway.development.getirapi.com/restaurants/status/open';
    const token = req.headers['token'];
    if (!token) {
      return res.status(400).json({ error: 'token header is required' });
    }
    const headers = {
      'Content-Type': 'application/json',
      'token': token
    };
    const upstream = await fetch(url, {
      method: 'PUT',
      headers,
      // open için body boş olabilir, göndermiyoruz
    });
    const text = await upstream.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
    return res.status(upstream.status).json(json);
  } catch (err) {
    console.error('Getir restaurant open proxy error:', err);
    return res.status(502).json({ error: 'Upstream call failed' });
  }
});

// ===================== Getir Restaurant Menu Proxy =====================
app.get('/api/getir/restaurants/menu', async (req, res) => {
  try {
    const url = 'https://food-external-api-gateway.development.getirapi.com/restaurants/menu';
    const token = req.headers['token'];
    if (!token) {
      return res.status(400).json({ error: 'token header is required' });
    }
    const headers = {
      'Content-Type': 'application/json',
      'token': token
    };
    const upstream = await fetch(url, {
      method: 'GET',
      headers
    });
    const text = await upstream.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
    return res.status(upstream.status).json(json);
  } catch (err) {
    console.error('Getir restaurant menu proxy error:', err);
    return res.status(502).json({ error: 'Upstream call failed' });
  }
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