import express from "express";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.json());

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

app.post("/webhook", (req, res) => {
  console.log("Webhook event received:", req.body);
  res.status(200).send("Webhook received");
});

// Test GET (opsiyonel)
app.get('/', (req, res) => {
    res.send('Webhook çalışıor!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
