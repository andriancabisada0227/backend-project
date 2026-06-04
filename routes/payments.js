const express = require('express');
const router = express.Router();
const { verifyToken } = require('../services/token');
const {
    getCardsByUserId,
    connectionToken,
    create_setup_intent,
    createCustomer,
    create_setup_intent_key,
    paymentSheet,
    createEphemeralKeys,
    attachPaymentMethod,
    attachPaymentMethodDriver,
    driverPayout,
    handlePaymentReturn,
    deleteStripeAccount
} = require('../services/payments');

//payment and cards
router.get("/payment/connectionToken", verifyToken, connectionToken);
router.get(
  "/payment/create/setup/intent/key",
  verifyToken,
  create_setup_intent_key
);
router.get("/payment/create/setup/intent", verifyToken, create_setup_intent);

router.post("/payment/:id/attach", verifyToken, attachPaymentMethod);
router.post("/payment/driver/:id/attach", verifyToken, attachPaymentMethodDriver);
router.get("/payment/:id/createEphemeralKeys/", verifyToken, createEphemeralKeys);
router.post("/payment/sheet/", verifyToken, paymentSheet);
router.get("/payment/card/user/:id", verifyToken, getCardsByUserId);
router.post("/payment/driver/payout", verifyToken, driverPayout);
router.get('/payment-return', handlePaymentReturn);

module.exports = router; 