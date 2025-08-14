const express = require('express');
const bodyParser = require('body-parser');

const app = express();

// JSON verileri okuyabilmek için
app.use(bodyParser.json());

// Webhook endpoint
app.post('/getir/add', (req, res) => {
    console.log('📩 Getir ADD verisi geldi:', req.body);
    res.status(200).send('OK');
});

app.post('/getir/cancel', (req, res) => {
    console.log('📩 Getir CANCEL verisi geldi:', req.body);
    res.status(200).send('OK');
});

app.post('/yemeksepeti/add', (req, res) => {
    console.log('📩 Yemeksepeti ADD verisi geldi:', req.body);
    res.status(200).send('OK');
});

app.post('/yemeksepeti/update', (req, res) => {
    console.log('📩 Yemeksepeti UPDATE verisi geldi:', req.body);
    res.status(200).send('OK');
});

// Test GET (opsiyonel)
app.get('/', (req, res) => {
    res.send('Webhook çalışıyor!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Webhook ${PORT} portunda dinleniyor...`));
