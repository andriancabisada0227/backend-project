const express = require('express');
const router = express.Router();
const cors = require("cors");

const {
    WebhookNotifyDriver,
    Booking,
    CancelScheduleParent,
    InvoicePayment,
    updateSchedule,
    deleteSchedule
  } = require("../services/webhook");


router.post("/notify-driver", cors(), WebhookNotifyDriver);
router.post("/booking", cors(), Booking);
router.post("/cancel-schedule/parent", cors(), CancelScheduleParent);
router.post("/invoice/payment", cors(), InvoicePayment);
router.post("/update-schedule", cors(), updateSchedule);
router.post("/delete-schedule", cors(), deleteSchedule);
  

module.exports = router; 