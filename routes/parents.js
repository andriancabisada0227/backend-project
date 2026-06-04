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
  getParentDetailStudents,
  getAllConfirmedParentsDriver,
  getConfirmedParentStudentDriver,
} = require('../services/parents');

// Parents routes
router.get("/driver/latest",cors(), verifyToken, getLatestDriver);
router.get("/:id",cors(), isTokenInvalidated, verifyToken, getParentById);
router.get("/name/:parentName",cors(), verifyToken, getParentByName);
router.get("/details/student/details",cors(), verifyToken, getParentDetailStudents);
router.get("/confirmed/booking",cors(), verifyToken, getAllConfirmedParentsDriver);
router.get("/students/confirmed",cors(), verifyToken, getConfirmedParentStudentDriver);
// router.put("/edit",cors(), verifyToken, editParent);
router.post("/",cors(), verifyToken, addParent);
router.delete("/:id",cors(), verifyToken, deleteParentById);

router.post('/assign-driver', verifyToken, parentController.asignDriver);
module.exports = router; 