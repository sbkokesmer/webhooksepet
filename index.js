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
// Yemeksepeti siparişini Supabase'e kaydet (tüm alanları yeni kolonlara map'ler)
async function saveYemeksepetiOrderToDB(body) {
  try {
    const orderId =
      body?.orderId ||
      body?.id ||
      body?.code ||
      body?.foodOrder?.id ||
      null;

    const payload = {
      order_id: orderId,
      platform: 'YEMEKSEPETI',

      // meta
      token: body?.token || null,
      code: body?.code || null,
      pre_order: body?.preOrder ?? null,
      expiry_date: body?.expiryDate || null,
      created_at_platform: body?.createdAt || null,
      platform_restaurant_id: body?.platformRestaurant?.id || null,

      // customer
      customer_id: body?.customer?.id || null,
      customer_first_name: body?.customer?.firstName || null,
      customer_last_name: body?.customer?.lastName || null,
      customer_name:
        body?.customer?.firstName || body?.customer?.lastName
          ? `${body?.customer?.firstName || ''} ${body?.customer?.lastName || ''}`.trim()
          : null,
      customer_phone: body?.customer?.mobilePhone || null,

      // payment
      payment_type: body?.payment?.type || null,
      payment_status: body?.payment?.status || null,

      // delivery
      delivery_type: body?.expeditionType || null,
      delivery_expected_time: body?.delivery?.expectedDeliveryTime || null,
      delivery_city: body?.delivery?.address?.city || null,
      delivery_postcode: body?.delivery?.address?.postcode || null,
      delivery_street: body?.delivery?.address?.street || null,

      // price
      subtotal: body?.price?.subTotal ? Number(body.price.subTotal) : null,
      vat_total: body?.price?.vatTotal ? Number(body.price.vatTotal) : null,
      total_price: body?.price?.grandTotal ? Number(body.price.grandTotal) : null,

      // json
      products: body?.products || null,
      comments: body?.comments || null,

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
  saveYemeksepetiOrderToDB(req.body);
  emitNewOrder({
    platform: 'yemeksepeti',
    orderId: req.params.id,
    data: req.body
  });
  res.status(200).send('OK');
});

// ===================== GETIR =====================
// Getir Token Manager
let GETIR_TOKEN_CACHE = null;
let GETIR_TOKEN_EXPIRY = null;

const fetchGetirToken = async () => {
  try {
    const url = 'https://food-external-api-gateway.development.getirapi.com/auth/login';
    const headers = {
      'Content-Type': 'application/json'
    };
    const body = {
      appSecretKey: '4940b25d95c518c8a5c6be188408addb922972f0',
      restaurantSecretKey: 'ce690a2598f17f2b715ef447c5d8355439e9ee72'
    };
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const errText = await response.text();
      console.error('❌ Getir token fetch failed:', errText);
      return null;
    }
    const data = await response.json();
    GETIR_TOKEN_CACHE = data.token;
    // Set expiry 55 minutes from now
    GETIR_TOKEN_EXPIRY = Date.now() + 55 * 60 * 1000;
    console.log('✅ Getir token fetched/refreshed successfully');
    return GETIR_TOKEN_CACHE;
  } catch (err) {
    console.error('❌ Getir token fetch error:', err);
    return null;
  }
};

const ensureGetirToken = async () => {
  if (!GETIR_TOKEN_CACHE || Date.now() >= GETIR_TOKEN_EXPIRY) {
    await fetchGetirToken();
  }
};

// Initial fetch
ensureGetirToken();
// Refresh token every 55 minutes
setInterval(fetchGetirToken, 55 * 60 * 1000);

// Webhook endpointleri
app.post('/getir/add', (req, res) => {
  console.log('📩 Getir ADD verisi geldi:', req.body);
  // Log simplified order summary
  const order = req.body;
  const orderId = order.orderId || order.id || 'unknown';
  const totalPrice = order.totalPrice || order.total_price || 'unknown';
  const discountedPrice = order.discountedPrice || order.discounted_price;
  let summary = `Order Summary - orderId: ${orderId}, totalPrice: ${totalPrice}`;
  if (discountedPrice !== undefined) {
    summary += `, discountedPrice: ${discountedPrice}`;
  }
  console.log(summary);

  emitNewOrder(req.body);   // frontend 'newOrder' eventini dinliyor
  res.status(200).send('OK');
});

// ===================== GETIR INTERNAL ROUTES =====================
// Backend managed internal routes
app.post('/api/internal/getir/verify/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Token garanti altına al
    await ensureGetirToken();
    if (!GETIR_TOKEN_CACHE) {
      return res.status(500).json({ error: 'Getir token yok' });
    }

    const url = `https://food-external-api-gateway.development.getirapi.com/food-orders/${id}/verify`;

    const headers = {
      'Content-Type': 'application/json',
      'token': GETIR_TOKEN_CACHE
    };

    const upstream = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({})
    });

    const text = await upstream.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    console.log('✅ GETIR VERIFY RESULT:', id, json);

    return res.status(upstream.status).json(json);
  } catch (err) {
    console.error('❌ INTERNAL GETIR VERIFY ERROR:', err);
    return res.status(502).json({ error: 'Verify failed' });
  }
});

app.post('/api/internal/getir/verify-scheduled/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await ensureGetirToken();
    if (!GETIR_TOKEN_CACHE) {
      return res.status(500).json({ error: 'Getir token yok' });
    }

    const url = `https://food-external-api-gateway.development.getirapi.com/food-orders/${id}/verify-scheduled`;

    const headers = {
      'Content-Type': 'application/json',
      'token': GETIR_TOKEN_CACHE
    };

    const upstream = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({})
    });

    const text = await upstream.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    console.log('🗓️ GETIR VERIFY SCHEDULED RESULT:', id, json);

    return res.status(upstream.status).json(json);
  } catch (err) {
    console.error('❌ INTERNAL GETIR VERIFY SCHEDULED ERROR:', err);
    return res.status(502).json({ error: 'Verify scheduled failed' });
  }
});

app.post('/api/internal/getir/prepare/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await ensureGetirToken();
    if (!GETIR_TOKEN_CACHE) {
      return res.status(500).json({ error: 'Getir token yok' });
    }

    const url = `https://food-external-api-gateway.development.getirapi.com/food-orders/${id}/prepare`;

    const headers = {
      'Content-Type': 'application/json',
      'token': GETIR_TOKEN_CACHE
    };

    const upstream = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({})
    });

    const text = await upstream.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    console.log('🍳 GETIR PREPARE RESULT:', id, json);

    return res.status(upstream.status).json(json);
  } catch (err) {
    console.error('❌ INTERNAL GETIR PREPARE ERROR:', err);
    return res.status(502).json({ error: 'Prepare failed' });
  }
});

app.post('/api/internal/getir/deliver/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await ensureGetirToken();
    if (!GETIR_TOKEN_CACHE) {
      return res.status(500).json({ error: 'Getir token yok' });
    }

    const url = `https://food-external-api-gateway.development.getirapi.com/food-orders/${id}/deliver`;

    const headers = {
      'Content-Type': 'application/json',
      'token': GETIR_TOKEN_CACHE
    };

    const upstream = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({})
    });

    const text = await upstream.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    console.log('🚚 GETIR DELIVER RESULT:', id, json);

    return res.status(upstream.status).json(json);
  } catch (err) {
    console.error('❌ INTERNAL GETIR DELIVER ERROR:', err);
    return res.status(502).json({ error: 'Deliver failed' });
  }
});

app.get('/api/internal/getir/cancel-options/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await ensureGetirToken();
    if (!GETIR_TOKEN_CACHE) {
      return res.status(500).json({ error: 'Getir token yok' });
    }

    const url = `https://food-external-api-gateway.development.getirapi.com/food-orders/${id}/cancel-options`;

    const headers = {
      'Content-Type': 'application/json',
      'token': GETIR_TOKEN_CACHE
    };

    const upstream = await fetch(url, { method: 'GET', headers });

    const text = await upstream.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    console.log('🛑 GETIR CANCEL OPTIONS:', id, json);

    return res.status(upstream.status).json(json);
  } catch (err) {
    console.error('❌ INTERNAL GETIR CANCEL OPTIONS ERROR:', err);
    return res.status(502).json({ error: 'Cancel options failed' });
  }
});

app.post('/api/internal/getir/cancel/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { cancelReasonId, cancelNote, productId } = req.body || {};

    if (!cancelReasonId) {
      return res.status(400).json({ error: 'cancelReasonId is required' });
    }

    await ensureGetirToken();
    if (!GETIR_TOKEN_CACHE) {
      return res.status(500).json({ error: 'Getir token yok' });
    }

    const url = `https://food-external-api-gateway.development.getirapi.com/food-orders/${id}/cancel`;

    const headers = {
      'Content-Type': 'application/json',
      'token': GETIR_TOKEN_CACHE
    };

    const body = {
      cancelReasonId,
      cancelNote: cancelNote || ''
    };

    if (productId) body.productId = productId;

    const upstream = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    const text = await upstream.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    console.log('🛑 GETIR CANCEL RESULT:', id, json);

    return res.status(upstream.status).json(json);
  } catch (err) {
    console.error('❌ INTERNAL GETIR CANCEL ERROR:', err);
    return res.status(502).json({ error: 'Cancel failed' });
  }
});

app.get('/api/internal/getir/active', async (req, res) => {
  try {
    await ensureGetirToken();
    if (!GETIR_TOKEN_CACHE) {
      return res.status(500).json({ error: 'Getir token yok' });
    }

    const url = 'https://food-external-api-gateway.development.getirapi.com/food-orders/active';

    const headers = {
      'Content-Type': 'application/json',
      'token': GETIR_TOKEN_CACHE
    };

    const upstream = await fetch(url, {
      method: 'POST',
      headers
    });

    const text = await upstream.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    console.log('📦 GETIR ACTIVE ORDERS (BACKEND):', json);

    return res.status(upstream.status).json(json);
  } catch (err) {
    console.error('❌ INTERNAL GETIR ACTIVE ERROR:', err);
    return res.status(502).json({ error: 'Active orders failed' });
  }
});

// ===================== GETIR PROXY ROUTES =====================
// Proxy API routes for Getir
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

app.get('/api/getir/token', async (req, res) => {
  try {
    const url = 'https://food-external-api-gateway.development.getirapi.com/auth/login';
    const headers = {
      'Content-Type': 'application/json'
    };

    const body = {
      appSecretKey: '4940b25d95c518c8a5c6be188408addb922972f0',
      restaurantSecretKey: 'ce690a2598f17f2b715ef447c5d8355439e9ee72'
    };

    const upstream = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error('❌ Getir token hatası:', errText);
      return res.status(upstream.status).json({ error: 'Getir token request failed', details: errText });
    }

    const data = await upstream.json();
    return res.status(200).json({
      restaurantId: data.restaurantId || '6848ec6b03df6e37f62278d0',
      token: data.token
    });

  } catch (err) {
    console.error('❌ Getir token proxy error:', err);
    return res.status(502).json({ error: 'Token retrieval failed' });
  }
});

app.post('/api/getir/orders/active', async (req, res) => {
  try {
    const url = 'https://food-external-api-gateway.development.getirapi.com/food-orders/active';

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
      headers
    });

    const text = await upstream.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    return res.status(upstream.status).json(json);
  } catch (err) {
    console.error('Getir active orders proxy error:', err);
    return res.status(502).json({ error: 'Upstream call failed' });
  }
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

// ===================== Getir VERIFY (BACKEND MANAGED) =====================
// Frontend sadece orderId yollar, token ve çağrı tamamen backend'de çözülür
app.post('/api/internal/getir/verify/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Token garanti altına al
    await ensureGetirToken();
    if (!GETIR_TOKEN_CACHE) {
      return res.status(500).json({ error: 'Getir token yok' });
    }

    const url = `https://food-external-api-gateway.development.getirapi.com/food-orders/${id}/verify`;

    const headers = {
      'Content-Type': 'application/json',
      'token': GETIR_TOKEN_CACHE
    };

    const upstream = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({})
    });

    const text = await upstream.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    console.log('✅ GETIR VERIFY RESULT:', id, json);

    return res.status(upstream.status).json(json);
  } catch (err) {
    console.error('❌ INTERNAL GETIR VERIFY ERROR:', err);
    return res.status(502).json({ error: 'Verify failed' });
  }
});

// ===================== Getir VERIFY SCHEDULED (BACKEND MANAGED) =====================
// İleri tarihli siparişlerin ilk onayı için kullanılır
app.post('/api/internal/getir/verify-scheduled/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await ensureGetirToken();
    if (!GETIR_TOKEN_CACHE) {
      return res.status(500).json({ error: 'Getir token yok' });
    }

    const url = `https://food-external-api-gateway.development.getirapi.com/food-orders/${id}/verify-scheduled`;

    const headers = {
      'Content-Type': 'application/json',
      'token': GETIR_TOKEN_CACHE
    };

    const upstream = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({})
    });

    const text = await upstream.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    console.log('🗓️ GETIR VERIFY SCHEDULED RESULT:', id, json);

    return res.status(upstream.status).json(json);
  } catch (err) {
    console.error('❌ INTERNAL GETIR VERIFY SCHEDULED ERROR:', err);
    return res.status(502).json({ error: 'Verify scheduled failed' });
  }
});

// ===================== Getir PREPARE (BACKEND MANAGED) =====================
// Backend-managed prepare endpoint (mirrors verify)
app.post('/api/internal/getir/prepare/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await ensureGetirToken();
    if (!GETIR_TOKEN_CACHE) {
      return res.status(500).json({ error: 'Getir token yok' });
    }

    const url = `https://food-external-api-gateway.development.getirapi.com/food-orders/${id}/prepare`;

    const headers = {
      'Content-Type': 'application/json',
      'token': GETIR_TOKEN_CACHE
    };

    const upstream = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({})
    });

    const text = await upstream.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    console.log('🍳 GETIR PREPARE RESULT:', id, json);

    return res.status(upstream.status).json(json);
  } catch (err) {
    console.error('❌ INTERNAL GETIR PREPARE ERROR:', err);
    return res.status(502).json({ error: 'Prepare failed' });
  }
});

// ===================== Getir DELIVER (BACKEND MANAGED) =====================
// Backend-managed deliver endpoint (mirrors verify)
app.post('/api/internal/getir/deliver/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await ensureGetirToken();
    if (!GETIR_TOKEN_CACHE) {
      return res.status(500).json({ error: 'Getir token yok' });
    }

    const url = `https://food-external-api-gateway.development.getirapi.com/food-orders/${id}/deliver`;

    const headers = {
      'Content-Type': 'application/json',
      'token': GETIR_TOKEN_CACHE
    };

    const upstream = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({})
    });

    const text = await upstream.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    console.log('🚚 GETIR DELIVER RESULT:', id, json);

    return res.status(upstream.status).json(json);
  } catch (err) {
    console.error('❌ INTERNAL GETIR DELIVER ERROR:', err);
    return res.status(502).json({ error: 'Deliver failed' });
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

// ===================== Getir CANCEL OPTIONS (BACKEND MANAGED) =====================
app.get('/api/internal/getir/cancel-options/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await ensureGetirToken();
    if (!GETIR_TOKEN_CACHE) {
      return res.status(500).json({ error: 'Getir token yok' });
    }

    const url = `https://food-external-api-gateway.development.getirapi.com/food-orders/${id}/cancel-options`;

    const headers = {
      'Content-Type': 'application/json',
      'token': GETIR_TOKEN_CACHE
    };

    const upstream = await fetch(url, { method: 'GET', headers });

    const text = await upstream.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    console.log('🛑 GETIR CANCEL OPTIONS:', id, json);

    return res.status(upstream.status).json(json);
  } catch (err) {
    console.error('❌ INTERNAL GETIR CANCEL OPTIONS ERROR:', err);
    return res.status(502).json({ error: 'Cancel options failed' });
  }
});

// ===================== Getir CANCEL (BACKEND MANAGED) =====================
// Frontend sadece orderId + reason yollar, token backend'de çözülür
app.post('/api/internal/getir/cancel/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { cancelReasonId, cancelNote, productId } = req.body || {};

    if (!cancelReasonId) {
      return res.status(400).json({ error: 'cancelReasonId is required' });
    }

    await ensureGetirToken();
    if (!GETIR_TOKEN_CACHE) {
      return res.status(500).json({ error: 'Getir token yok' });
    }

    const url = `https://food-external-api-gateway.development.getirapi.com/food-orders/${id}/cancel`;

    const headers = {
      'Content-Type': 'application/json',
      'token': GETIR_TOKEN_CACHE
    };

    const body = {
      cancelReasonId,
      cancelNote: cancelNote || ''
    };

    if (productId) body.productId = productId;

    const upstream = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    const text = await upstream.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    console.log('🛑 GETIR CANCEL RESULT:', id, json);

    return res.status(upstream.status).json(json);
  } catch (err) {
    console.error('❌ INTERNAL GETIR CANCEL ERROR:', err);
    return res.status(502).json({ error: 'Cancel failed' });
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

// ===================== Getir Token Proxy =====================
app.get('/api/getir/token', async (req, res) => {
  try {
    const url = 'https://food-external-api-gateway.development.getirapi.com/auth/login';
    const headers = {
      'Content-Type': 'application/json'
    };

    const body = {
      appSecretKey: '4940b25d95c518c8a5c6be188408addb922972f0',
      restaurantSecretKey: 'ce690a2598f17f2b715ef447c5d8355439e9ee72'
    };

    const upstream = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error('❌ Getir token hatası:', errText);
      return res.status(upstream.status).json({ error: 'Getir token request failed', details: errText });
    }

    const data = await upstream.json();
    return res.status(200).json({
      restaurantId: data.restaurantId || '6848ec6b03df6e37f62278d0',
      token: data.token
    });

  } catch (err) {
    console.error('❌ Getir token proxy error:', err);
    return res.status(502).json({ error: 'Token retrieval failed' });
  }
});

// ===================== Getir Active Food Orders Proxy =====================
app.post('/api/getir/orders/active', async (req, res) => {
  try {
    const url = 'https://food-external-api-gateway.development.getirapi.com/food-orders/active';

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
      headers
    });

    const text = await upstream.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    return res.status(upstream.status).json(json);
  } catch (err) {
    console.error('Getir active orders proxy error:', err);
    return res.status(502).json({ error: 'Upstream call failed' });
  }
});

// ===================== Getir Active Food Orders (BACKEND MANAGED) =====================
app.get('/api/internal/getir/active', async (req, res) => {
  try {
    await ensureGetirToken();
    if (!GETIR_TOKEN_CACHE) {
      return res.status(500).json({ error: 'Getir token yok' });
    }

    const url = 'https://food-external-api-gateway.development.getirapi.com/food-orders/active';

    const headers = {
      'Content-Type': 'application/json',
      'token': GETIR_TOKEN_CACHE
    };

    const upstream = await fetch(url, {
      method: 'POST',
      headers
    });

    const text = await upstream.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    console.log('📦 GETIR ACTIVE ORDERS (BACKEND):', json);

    return res.status(upstream.status).json(json);
  } catch (err) {
    console.error('❌ INTERNAL GETIR ACTIVE ERROR:', err);
    return res.status(502).json({ error: 'Active orders failed' });
  }
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