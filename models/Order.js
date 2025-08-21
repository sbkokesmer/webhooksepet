const mongoose = require("mongoose");

const OrderSchema = new mongoose.Schema({
  platform: String, // getir, yemeksepeti, vb
  foodOrder: {
    id: String,
    status: Number,
    isScheduled: Boolean,
    confirmationId: String,
    client: {
      id: String,
      name: String,
      contactPhoneNumber: String,
      clientPhoneNumber: String,
      deliveryAddress: Object,
      location: Object
    },
    courier: {
      status: Number,
      name: String,
      location: Object
    },
    products: Array,
    clientNote: String,
    doNotKnock: Boolean,
    dropOffAtDoor: Boolean,
    totalPrice: Number,
    checkoutDate: Date,
    deliveryType: Number,
    isEcoFriendly: Boolean,
    paymentMethod: Number,
    paymentMethodText: Object,
    restaurant: {
      id: String,
      name: String,
      brand: Object
    },
    isQueued: Boolean
  },
  rawData: Object, // ham JSON'u tutmak için
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Order", OrderSchema);