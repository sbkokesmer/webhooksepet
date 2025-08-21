import dotenv from "dotenv";
dotenv.config();

import express from "express";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import Order from "./models/Order.js";

const app = express();
app.use(bodyParser.json());

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("❌ Missing MONGODB_URI in environment variableas");
  process.exit(1);
}
mongoose.connect(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log("✅ MongoDB connected successfully");
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
})
.catch(err => console.error("❌ MongoDB connection error:", err));

app.post('/getir/add', async (req, res) => {
  try {
    console.log('📩 Getir ADD verisi geldi:', req.body);

    const newOrder = new Order({
      platform: "getir",
      foodOrder: req.body.foodOrder,
      rawData: req.body
    });

    await newOrder.save();
    res.status(201).json({ message: "✅ Sipariş kaydedildi", order: newOrder });
  } catch (error) {
    console.error("❌ Sipariş kaydedilemedi:", error);
    res.status(500).json({ error: "DB hatası" });
  }
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

app.post("/webhook/getir", async (req, res) => {
  try {
    const order = new Order({
      orderId: req.body.id,
      customer: req.body.customer || "unknown",
      items: req.body.items || [],
    });
    await order.save();
    res.status(200).send("Order saved");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error saving order");
  }
});

// Test GET (opsiyonel)
app.get('/', (req, res) => {
    res.send('Webhook çalışıor!');
});
