const express = require('express');
const router = express.Router();
const { verifyToken } = require('../services/token');
const cors = require("cors");

const {
    checkApproval,
    getMyCurrentDriver,
    getDriverReviews,
    approvedDriver,
    addDriver,
    addDriverReview,
    addDriverStudent,
    addDriverLocation,
    getDriverDetailsById,
    getDriverStudents,
    editDriver,
    editDriverReview,
    deleteDriver,
    deleteDriverReview,
    deleteDriverStudent,
    searchDrivers,
    changeDriver,
    computeDriverRatings,
    backgroundVerification,
    driverImageUpload,
    createOnboardingLink
} = require('../services/drivers');

// Driver routes
router.get("driver/checkApproval",cors(), verifyToken, checkApproval);
router.get("driver/myCurrentDriver",cors(), verifyToken, getMyCurrentDriver);
router.get("driver/reviews/:id",cors(), verifyToken, getDriverReviews);
router.post("driver/background-verification/status",cors(), verifyToken, approvedDriver);
router.get("driver/:id",cors(), verifyToken, getDriverDetailsById);
router.get("driver/students/:id",cors(), verifyToken, getDriverStudents);
router.get("drivers/",cors(), verifyToken, searchDrivers);
router.post("driver/new",cors(), verifyToken, addDriver);
router.post("driver/ratings/compute/:id",cors(), verifyToken, computeDriverRatings);
router.post("driver/:id/review",cors(), verifyToken, addDriverReview);
router.post("driver/:id/student",cors(), verifyToken, addDriverStudent);
router.post("driver/location/add",cors(), verifyToken, addDriverLocation);
router.post("driver/change",cors(), verifyToken, changeDriver);
router.post("driver/background/verification",cors(), verifyToken, backgroundVerification);
router.post("driver/upload/image",cors(), verifyToken, driverImageUpload);
router.put("driver/:driverid/reviews/:reviewid",cors(), verifyToken, editDriverReview);
router.put("driver/:id",cors(), verifyToken, editDriver);
router.delete("driver/:id",cors(), verifyToken, deleteDriver);
router.delete("driver/:driverid/reviews/:reviewid",cors(), verifyToken, deleteDriverReview);
router.delete("driver/:driverid/students/:studentid",cors(), verifyToken, deleteDriverStudent);
router.post("driver/onboarding/link",cors(), createOnboardingLink);

module.exports = router; 