

// getir.js
const express = require('express');
const fetch = (...args) =>
  import('node-fetch').then(({ default: fetch }) => fetch(...args));

const router = express.Router();

/**
 * NOT:
 * Bu dosyada SADECE Getir ile ilgili API proxy / business endpointleri var.
 * Webhook (Getir ADD vb.) kesinlikle burada YOK.
 */

// ===================== Getir Verify Order =====================
router.post('/orders/:id/verify', async (req, res) => {
  try {
    const { id } = req.params;
    const token = req.headers['token'];
    if (!token) return res.status(400).json({ error: 'token header is required' });

    const url = `https://food-external-api-gateway.development.getirapi.com/food-orders/${id}/verify`;

    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        token
      },
      body: JSON.stringify(req.body || {})
    });

    const text = await upstream.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    return res.status(upstream.status).json(json);
  } catch (err) {
    console.error('Getir verify error:', err);
    return res.status(502).json({ error: 'Upstream call failed' });
  }
});

// ===================== Getir Prepare =====================
router.post('/orders/:id/prepare', async (req, res) => {
  try {
    const { id } = req.params;
    const token = req.headers['token'];
    if (!token) return res.status(400).json({ error: 'token header is required' });

    const url = `https://food-external-api-gateway.development.getirapi.com/food-orders/${id}/prepare`;

    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        token
      },
      body: JSON.stringify(req.body || {})
    });

    const text = await upstream.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    return res.status(upstream.status).json(json);
  } catch (err) {
    console.error('Getir prepare error:', err);
    return res.status(502).json({ error: 'Upstream call failed' });
  }
});

// ===================== Getir Deliver =====================
router.post('/orders/:id/deliver', async (req, res) => {
  try {
    const { id } = req.params;
    const token = req.headers['token'];
    if (!token) return res.status(400).json({ error: 'token header is required' });

    const url = `https://food-external-api-gateway.development.getirapi.com/food-orders/${id}/deliver`;

    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        token
      },
      body: JSON.stringify(req.body || {})
    });

    const text = await upstream.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    return res.status(upstream.status).json(json);
  } catch (err) {
    console.error('Getir deliver error:', err);
    return res.status(502).json({ error: 'Upstream call failed' });
  }
});

// ===================== Getir Cancel =====================
router.post('/orders/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const token = req.headers['token'];
    if (!token) return res.status(400).json({ error: 'token header is required' });

    const url = `https://food-external-api-gateway.development.getirapi.com/food-orders/${id}/cancel`;

    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        token
      },
      body: JSON.stringify(req.body || {})
    });

    const text = await upstream.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    return res.status(upstream.status).json(json);
  } catch (err) {
    console.error('Getir cancel error:', err);
    return res.status(502).json({ error: 'Upstream call failed' });
  }
});

// ===================== Getir Cancel Options =====================
router.get('/orders/:id/cancel-options', async (req, res) => {
  try {
    const { id } = req.params;
    const token = req.headers['token'];
    if (!token) return res.status(400).json({ error: 'token header is required' });

    const url = `https://food-external-api-gateway.development.getirapi.com/food-orders/${id}/cancel-options`;

    const upstream = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        token
      }
    });

    const text = await upstream.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    return res.status(upstream.status).json(json);
  } catch (err) {
    console.error('Getir cancel-options error:', err);
    return res.status(502).json({ error: 'Upstream call failed' });
  }
});

// ===================== Getir Token (auto) =====================
router.get('/token', async (req, res) => {
  try {
    const url = 'https://food-external-api-gateway.development.getirapi.com/auth/login';

    const body = {
      appSecretKey: process.env.GETIR_APP_SECRET,
      restaurantSecretKey: process.env.GETIR_RESTAURANT_SECRET
    };

    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      return res.status(upstream.status).json({ error: errText });
    }

    const data = await upstream.json();
    return res.json(data);
  } catch (err) {
    console.error('Getir token error:', err);
    return res.status(502).json({ error: 'Token failed' });
  }
});

module.exports = router;