const express = require('express');
const router = express.Router();


const {
    startRide,
    cancelRideStudents,
    endRide,
    rideStatus,
    driverRideStatus,
    parentRideStatus,
    updateRideStatus,
    rideCost,
    parentRideCostAcceptance,
    driverRideCostAcceptance,
} = require("../services/routes");

//routes - ride
router.get("/ride/parent/status/:id", verifyToken, parentRideStatus);
router.post("/rideCost", verifyToken, rideCost);
router.post("/ride/start", verifyToken, startRide);
router.post("/ride/cancel/students", verifyToken, cancelRideStudents);
router.post("/ride/end", verifyToken, endRide);
router.post("/ride/status", verifyToken, rideStatus);
router.post("/ride/driver/status", verifyToken, driverRideStatus);
router.post("/ride/update/status", verifyToken, updateRideStatus);
router.post("/parent/rideCostAcceptance", verifyToken, parentRideCostAcceptance);
router.post("/driver/rideCostAcceptance", verifyToken, driverRideCostAcceptance);

  

module.exports = router; 