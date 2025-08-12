const express = require('express');
const bodyParser = require('body-parser');

const app = express();

// JSON verileri okuyabilmek için
app.use(bodyParser.json());

// Webhook endpoint
app.post('/getir', (req, res) => {
    console.log('📩 Getir verisi geldi:', req.body);
    res.status(200).send('OK'); // Gönderen sisteme cevap
});

app.post('/yemeksepeti', (req, res) => {
    console.log('📩 Yemeksepeti verisi geldi:', req.body);
    res.status(200).send('OK');
});

// Test GET (opsiyonel)
app.get('/', (req, res) => {
    res.send('Webhook çalışıyor!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Webhook ${PORT} portunda dinleniyor...`));
