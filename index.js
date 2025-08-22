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
app.use(cors({ origin: "*", methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"] }));
app.options("*", cors());

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

// ===================== Getir API Proxy =====================
// Frontend doğrudan Getir'e değil, buraya vuracak.
// Örn: POST /api/getir/orders/:id/verify  -> sunucu tarafı Getir'e çağrı yapar.
app.post('/api/getir/orders/:id/verify', async (req, res) => {
  try {
    const { id } = req.params;
    const url = `https://food-external-api-gateway.development.getirapi.com/food-orders/${id}/verify`;

    const upstream = await fetch(url, {
      method: 'POST', // gerekirse GET/PATCH/PUT ise değiştir
      headers: {
        'Content-Type': 'application/json',
        // Gerekli kimlik doğrulama/sig header’larını .env’den ekleyin:
        // 'X-Api-Key': process.env.GETIR_API_KEY,
        // 'Authorization': `Bearer ${process.env.GETIR_TOKEN}`,
        // 'X-Signature': hesapladığın_imza,
      },
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