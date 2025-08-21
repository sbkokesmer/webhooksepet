const http = require('http');
const { Server } = require('socket.io');
const express = require('express');
const bodyParser = require('body-parser');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// JSON verileri okuyabilmek için
app.use(bodyParser.json());

// Webhook endpoint
app.post('/getir/add', (req, res) => {
    console.log('📩 Getir ADD verisi geldi:', req.body);
    io.emit('newOrder', req.body);
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

// Test GET (opsiyonel)
app.get('/', (req, res) => {
    res.send('Webhook çalışıyor!');
});

io.on('connection', (socket) => {
    console.log('🔌 Bir kullanıcı bağlandı');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Webhook ${PORT} portunda dinleniyor...`));
