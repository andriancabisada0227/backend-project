const express = require('express');
const router = express.Router();
const cors = require('cors');
const { verifyToken } = require('../services/token');

const {
  registerForPushNotifications,
  unregisterForPushNotifications,
} = require("../services/pushnotification");

const {
  addWhiteList,
  removeWhiteList,
  checkWhiteList,
} = require("../services/whiteList");

const {
  sendHelpAndSupport,
  contactUs,
  faq,
} = require("../services/helpSupport");

// Push notification
router.post("/registerForPushNotifications", verifyToken, registerForPushNotifications);
router.post("/unregisterForPushNotifications", verifyToken, unregisterForPushNotifications);

// WhiteList
router.post("/white/list/add", verifyToken, addWhiteList);
router.post("/white/list/remove", verifyToken, removeWhiteList);
router.get("/white/list/check", verifyToken, checkWhiteList);

// Help and support
router.post("/sendHelpAndSupport", verifyToken, sendHelpAndSupport);
router.post("/web/contactUs", cors(), contactUs);
router.post("/web/faq", cors(), faq);

module.exports = router; 