const express = require('express');
const router = express.Router();
const { verifyToken } = require('../services/token');
const { isTokenInvalidated } = require('../services/middleware/tokenInvalidated');

const {
    getStudentById,
    getStudentByName,
    saveStudent,
    updateStudent,
    deleteStudentById,
    getAllStudents,
    getConfirmedStudentsDriver,
  } = require("../services/students");

//student api
router.get("/students", verifyToken, getAllStudents);
router.get("/students/all/confirmed", verifyToken, getConfirmedStudentsDriver);
router.get("/students/:id", verifyToken, getStudentById);
router.get("/students/:studentName", verifyToken, getStudentByName);

router.post("/students/", verifyToken, saveStudent);
router.put("/students/:id", verifyToken, updateStudent);
router.delete("/students/:id", verifyToken, deleteStudentById);

module.exports = router; 