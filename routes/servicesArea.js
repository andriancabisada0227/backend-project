const express = require('express');
const router = express.Router();
const cors = require("cors");
const { verifyToken } = require('../services/token');

const {
    addServiceArea,
    getAllServiceAreas,
    getServiceAreaById,
    updateServiceArea,
    deleteServiceArea
  } = require("../services/serviceAreas");


router.get("/", cors(),verifyToken, getAllServiceAreas);
router.get("/:id", cors(),verifyToken, getServiceAreaById);
router.post("/", cors(),verifyToken, addServiceArea);
router.put("/:id", cors(),verifyToken, updateServiceArea);
router.delete("s/:id", cors(),verifyToken, deleteServiceArea);
  

  

module.exports = router; 