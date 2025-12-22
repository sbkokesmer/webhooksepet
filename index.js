// index.js
require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const express = require('express');
// İstersen body-parser yerine express.json da kullanabilirsin
const bodyParser = require('body-parser');
const cors = require('cors');

const { createClient } = require('@supabase/supabase-js');

// Supabase env fallback (bazı kurulumlarda VITE_ prefix ile geliyor)
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  console.error('❌ SUPABASE_URL / VITE_SUPABASE_URL bulunamadı. .env kontrol et');
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY bulunamadı. .env kontrol et');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

// Helper to log and emit newOrder events
function emitNewOrder(data) {
  console.log('➡️  Emitting newOrder:', data);
  io.emit('newOrder', data);
}

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

// ===================== GLOBAL WEBHOOK FORWARDER =====================
async function forwardToSupabase(req) {
  try {
    await fetch(
      'https://kuyrlntjlaabnpmvmezn.supabase.co/functions/v1/webhook-handler',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          path: req.originalUrl,
          method: req.method,
          headers: req.headers,
          body: req.body
        })
      }
    );
  } catch (err) {
    console.error('❌ Supabase forward error:', err.message);
  }
}

app.use(async (req, res, next) => {
  // tüm gelen istekleri supabase'e forward et
  forwardToSupabase(req);
  next();
});

// ===================== YEMEKSEPETI =====================

// ===================== YEMEKSEPETI LOGIN =====================
// Yemeksepeti token alma (axios'suz, fetch ile)
app.post('/yemeksepeti/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ error: 'username ve password zorunlu' });
    }

    const formBody = new URLSearchParams({
      username,
      password,
      grant_type: 'client_credentials'
    });

    const upstream = await fetch(
      'https://integration-middleware-tr.me.restaurant-partners.com/v2/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formBody.toString()
      }
    );

    const text = await upstream.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }

    return res.status(upstream.status).json(json);
  } catch (err) {
    console.error('❌ YEMEKSEPETI LOGIN ERROR:', err);
    return res.status(500).json({ error: 'Yemeksepeti login failed' });
  }
});

// ===================== YEMEKSEPETI ACCEPT =====================
// Proxy endpoint: POST /order/accept  -> upstream: https://integration-middleware-tr.me.restaurant-partners.com/v2/order/accept
// - Raw JSON body forward edilir
// - Bearer token: Öncelik Authorization header (Bearer ...). Yoksa body.token / body.access_token / body.bearerToken alanlarından alınır.
app.post('/order/accept', async (req, res) => {
  try {
    const upstreamUrl = 'https://integration-middleware-tr.me.restaurant-partners.com/v2/order/accept';

    // Bearer token kaynağı: header > body
    const authHeader = req.headers['authorization'];
    const bodyToken =
      (req.body && (req.body.token || req.body.access_token || req.body.bearerToken)) || null;

    let authorization = null;
    if (authHeader && typeof authHeader === 'string' && authHeader.trim().length > 0) {
      // Kullanıcı zaten Bearer gönderdiyse aynen ilet
      authorization = authHeader;
    } else if (bodyToken && typeof bodyToken === 'string' && bodyToken.trim().length > 0) {
      // Body'den token geldiyse Bearer olarak sar
      authorization = bodyToken.toLowerCase().startsWith('bearer ')
        ? bodyToken
        : `Bearer ${bodyToken}`;
    }

    if (!authorization) {
      return res.status(400).json({
        error: 'Authorization gerekli. Header: Authorization: Bearer <token> veya body içinde token/access_token/bearerToken gönder.'
      });
    }

    const upstream = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authorization
      },
      body: JSON.stringify(req.body || {})
    });

    const text = await upstream.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }

    return res.status(upstream.status).json(json);
  } catch (err) {
    console.error('❌ /order/accept ERROR:', err);
    return res.status(502).json({ error: 'Upstream call failed' });
  }
});
// Yemeksepeti siparişini Supabase'e kaydet (mevcut kolonlara map'ler)
// Not: Bazı akışlarda veri wrapper ile gelir: { platform, orderId, data: {...} }
async function saveYemeksepetiOrderToDB(body) {
  try {
    // Wrapper normalize
    const isWrapped = body && typeof body === 'object' && body.data && typeof body.data === 'object';
    const src = isWrapped ? body.data : body;
    const wrapperOrderId = isWrapped ? body.orderId : null;

    // order_id önceliği: wrapper.orderId > src.orderId > src.id > src.code > src.foodOrder.id
    const orderId =
      wrapperOrderId ||
      src?.orderId ||
      src?.id ||
      src?.code ||
      src?.foodOrder?.id ||
      null;

    // Adres (tek string) - tabloda delivery_address kolonu var
    const a = src?.delivery?.address || {};
    const deliveryAddress = [
      a.street,
      a.number,
      a.building,
      a.floor,
      a.entrance,
      a.flatNumber,
      a.district,
      a.deliveryMainArea,
      a.postcode,
      a.city
    ]
      .filter((x) => x !== undefined && x !== null && String(x).trim() !== '')
      .map(String)
      .join(' | ');

    const payload = {
      order_id: orderId,
      platform: 'YEMEKSEPETI',

      // meta
      token: src?.token || null,
      code: src?.code || null,
      pre_order: src?.preOrder ?? null,
      expiry_date: src?.expiryDate || null,
      created_at_platform: src?.createdAt || null,
      platform_restaurant_id: src?.platformRestaurant?.id || null,

      // customer
      customer_id: src?.customer?.id || null,
      customer_first_name: src?.customer?.firstName || null,
      customer_last_name: src?.customer?.lastName || null,
      customer_name:
        src?.customer?.firstName || src?.customer?.lastName
          ? `${src?.customer?.firstName || ''} ${src?.customer?.lastName || ''}`.trim()
          : null,
      customer_phone: src?.customer?.mobilePhone || null,

      // payment
      payment_type: src?.payment?.type || null,
      payment_status: src?.payment?.status || null,

      // price / currency
      subtotal: src?.price?.subTotal ? Number(src.price.subTotal) : null,
      vat_total: src?.price?.vatTotal ? Number(src.price.vatTotal) : null,
      total_price: src?.price?.grandTotal ? Number(src.price.grandTotal) : null,
      currency: src?.localInfo?.currencySymbol || null,

      // delivery
      delivery_type: src?.expeditionType || null,
      delivery_expected_time: src?.delivery?.expectedDeliveryTime || null,
      delivery_city: a.city || null,
      delivery_postcode: a.postcode || null,
      delivery_street: a.street || null,
      delivery_address: deliveryAddress || null,
      city: a.city || null,

      // json
      products: src?.products || null,
      comments: src?.comments || null,

      // raw
      raw_payload: body
    };

    const { error } = await supabase
      .from('yemeksepeti_orders')
      .insert(payload);

    if (error) {
      console.error('❌ YEMEKSEPETI DB INSERT ERROR:', error, payload);
    } else {
      console.log('✅ YEMEKSEPETI ORDER DB KAYDEDILDI:', orderId);
    }
  } catch (err) {
    console.error('🔥 YEMEKSEPETI SAVE ERROR:', err);
  }
}

app.post('/yemeksepeti/add', (req, res) => {
  console.log('📩 Yemeksepeti ADD verisi geldi:', req.body);
  saveYemeksepetiOrderToDB(req.body);
  emitNewOrder(req.body);
  res.status(200).send('OK');
});

app.post('/yemeksepeti/update', (req, res) => {
  console.log('📩 Yemeksepeti UPDATE verisi geldi:', req.body);
  saveYemeksepetiOrderToDB(req.body);
  emitNewOrder(req.body);
  res.status(200).send('OK');
});

// Yeni route: /yemeksepeti/add/order/:id
app.post('/yemeksepeti/add/order/:id', (req, res) => {
  console.log('🆕 /yemeksepeti/add/order/:id çağrıldı');
  console.log('orderId:', req.params.id);
  console.log('body:', req.body);
  // orderId parametresini body'ye ekleyip kaydet (bazı payload'larda orderId gelmiyor)
  saveYemeksepetiOrderToDB({ platform: 'yemeksepeti', orderId: req.params.id, data: req.body });
  emitNewOrder({
    platform: 'yemeksepeti',
    orderId: req.params.id,
    data: req.body
  });
  res.status(200).send('OK');
});

// ===================== GETIR WEBHOOK =====================
app.post('/getir/add', (req, res) => {
  console.log('📩 Getir ADD verisi geldi:', req.body);

  emitNewOrder({
    platform: 'getir',
    data: req.body
  });

  res.status(200).send('OK');
});

// ===================== MIGROS =====================
app.post('/migros/add', (req, res) => {
  console.log('📩 Migros Yemek ADD verisi geldi:', req.body);

  emitNewOrder({
    platform: 'migros',
    data: req.body
  });

  res.status(200).send('OK');
});

// ===================== Migros CANCEL Webhook =====================
app.post('/migros/cancel', (req, res) => {
  console.log('❌ Migros Yemek CANCEL verisi geldi:', req.body);

  emitNewOrder({
    platform: 'migros',
    type: 'cancel',
    data: req.body
  });

  res.status(200).send('OK');
});

// ===================== Migros COURIER Webhook =====================
app.post('/migros/kurye', (req, res) => {
  console.log('🚴 Migros Yemek KURYE verisi geldi:', req.body);

  emitNewOrder({
    platform: 'migros',
    type: 'courier',
    data: req.body
  });

  res.status(200).send('OK');
});


// ===================== Test GET =====================
app.get('/', (req, res) => {
  res.send('Webhook çalışıyor!');
});

// ===================== Socket.IO bağlantı logu =====================
io.on('connection', (socket) => {
  console.log('🔌 Bir kullanıcı bağlandı (socket id:', socket.id, ')');

  // HTML'nin dinlediği event'in AYNISINI backend de dinlesin
  socket.on('newOrder', (order) => {
    console.log('📥 Socket üzerinden newOrder yakalandı:', order);
  });

  // Her gelen event'i de logla (debug)
  socket.onAny((event, payload) => {
    console.log('📡 Socket event yakalandı:', event, payload);
  });
});

// ===================== BACKEND SOCKET.IO CLIENT (HTML ile BİREBİR) =====================
const { io: ClientIO } = require("socket.io-client");

const SOCKET_URL = "https://webhookposkobi-03c384c3643f.herokuapp.com";

const socketClient = ClientIO(SOCKET_URL, {
  transports: ["websocket"],
});

socketClient.on("connect", () => {
  console.log("🟢 BACKEND SOCKET CLIENT BAĞLANDI (HTML ile aynı)");
});

socketClient.on("newOrder", (order) => {
  console.log("🔥 BACKEND SOCKET CLIENT newOrder YAKALADI:");
  console.log(order);
});

socketClient.onAny((event, payload) => {
  console.log("📡 BACKEND SOCKET EVENT:", event, payload);
});

// ===================== Sunucu =====================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Webhook ${PORT} portunda dinleniyor...`));