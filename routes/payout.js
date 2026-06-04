const express = require('express');
const router = express.Router();
const payoutController   = require("../app/controllers/payoutController");
const { verifyJWT } = require('../app/helper/jwtHelper');

router.post("/driver", payoutController.driverPayout);


module.exports = router;
