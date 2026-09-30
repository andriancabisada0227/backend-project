const express = require('express');
const router = express.Router();
const { verifyToken } = require('../services/token');

const {
    createSchedule,
    cancelScheduleStudents,
    cancelScheduleStudentDriver,
    deleteScheduleById,
    deleteStudentByScheduleId,
    editScheduleById,
    editStudentByScheduleId,
    searchAllSchedule,
    getScheduleById,
    getDriverScheduleByUserId,
  } = require("../services/schedule");
  
//schedule
router.get("/schedule/userid/limit", verifyToken, searchAllSchedule);
router.get("/schedule/driver", verifyToken, getDriverScheduleByUserId);
router.get("/schedule/:id", verifyToken, getScheduleById);

router.post("/schedule/", verifyToken, createSchedule);
router.post("/schedule/cancel/students", verifyToken, cancelScheduleStudents);
router.post(
  "/schedule/cancel/students/driver",
  verifyToken,
  cancelScheduleStudentDriver
);
router.put("/schedule/:id", verifyToken, editScheduleById);
router.post("/schedule/:id/student/edit", verifyToken, editStudentByScheduleId);
router.delete(
  "/schedule/:id/student/delete/:studentId",
  verifyToken,
  deleteStudentByScheduleId
);
router.delete("/schedule/:id", verifyToken, deleteScheduleById);

module.exports = router; 