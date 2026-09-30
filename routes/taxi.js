const express = require('express');
const router = express.Router();
const cors = require('cors');
const { verifyToken } = require('../services/token');

const {
  addTaxiCode,
  editTaxiCode,
  deleteTaxiCode,
  getTaxiCode,
  getAllTaxi,
  CreateTaxiKey
} = require("../services/taxi");

router.get("/taxi/all", cors(), verifyToken, getAllTaxi);
router.get("/taxi/details/:id", cors(), verifyToken, getTaxiCode);
router.post("/taxi/add", cors(), verifyToken, addTaxiCode);
router.post("/taxi/edit/:id", cors(), verifyToken, editTaxiCode);
router.delete("/taxi/delete/:id", cors(), verifyToken, deleteTaxiCode);

router.post("/taxi/create/key", cors(), CreateTaxiKey);

module.exports = router; 