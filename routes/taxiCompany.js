const express = require('express');
const router = express.Router();
const taxiCompanyController   = require("../app/controllers/taxiCompanyController");
const { verifyJWT } = require('../app/helper/jwtHelper');

router.post("/register", taxiCompanyController.register);
router.post("/login", taxiCompanyController.login);
router.put("/update",verifyJWT, taxiCompanyController.update);

router.get("/driver", verifyJWT, taxiCompanyController.driver);
router.get("/driver/:id", verifyJWT, taxiCompanyController.driverById);
router.post("/driver/create", verifyJWT, taxiCompanyController.createDriver);
router.put("/driver/:id", verifyJWT, taxiCompanyController.updateDriver);
router.delete("/driver/:id", verifyJWT, taxiCompanyController.deleteDriver);
router.post("/driver/location", verifyJWT, taxiCompanyController.driverLocation);

router.get("/booking/:id", verifyJWT, taxiCompanyController.bookingById);
router.get("/booking", verifyJWT, taxiCompanyController.booking);
router.post("/booking/confirm", verifyJWT, taxiCompanyController.confirmBooking);
router.post("/booking/assign-driver", verifyJWT, taxiCompanyController.assignDriverToBooking);
router.get("/bookings/new", verifyJWT, taxiCompanyController.newBookings);

router.get("/schedule/:id", verifyJWT, taxiCompanyController.scheduleById);

router.get("/parent/:id", verifyJWT, taxiCompanyController.parentsById);

router.get("/student/:id", verifyJWT, taxiCompanyController.studentById);
router.get("/student/parent/:id", verifyJWT, taxiCompanyController.studentParentById);
 router.post("/ride/update/status", verifyJWT, taxiCompanyController.updateRideStatus);

module.exports = router;
