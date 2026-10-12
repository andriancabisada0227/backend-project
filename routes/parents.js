const express = require('express');
const router = express.Router();
const { verifyToken } = require('../services/token');
const isTokenInvalidated  = require('../services/middleware/tokenInvalidated');
const cors = require("cors");
const parentController = require('../app/controllers/parentController');

const {
  getParentById,
  getLatestDriver,
  getParentByName,
  addParent,
  deleteParentById,
  editParent,
  addParentLocation,
  addParentImage,
  getParentDetailStudents,
  getAllConfirmedParentsDriver,
  getConfirmedParentStudentDriver,
} = require('../services/parents');

// Parents routes
router.get("/parents/driver/latest", cors(), verifyToken, getLatestDriver);
router.get("/parents/:id", cors(), isTokenInvalidated, verifyToken, getParentById);
router.get("/parents/name/:parentName", cors(), verifyToken, getParentByName);
router.get("/parents/details/student/details", cors(), verifyToken, getParentDetailStudents);
router.get("/parents/confirmed/booking", cors(), verifyToken, getAllConfirmedParentsDriver);
router.get("/parents/students/confirmed", cors(), verifyToken, getConfirmedParentStudentDriver);
router.put("/parent/edit", cors(), verifyToken, editParent);
router.post("/parent/edit", cors(), verifyToken, editParent);
router.post("/parent/location/add", cors(), verifyToken, addParentLocation);
router.post("/parent/image", cors(), verifyToken, addParentImage);
router.post("/parents", cors(), verifyToken, addParent);
router.delete("/parents/:id", cors(), verifyToken, deleteParentById);

router.post('/assign-driver', verifyToken, parentController.asignDriver);
module.exports = router; 