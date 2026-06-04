const express = require('express');
const router = express.Router();
const { verifyToken } = require('../services/token');
const {
  createBooking,
  getBookingById,
  updateBooking,
  cancelBooking,
  getBookingHistory,
  getActiveBookings,
  confirmBooking,
  getBookingStatus
} = require('../services/bookings');

// Booking routes
router.post("/create", verifyToken, createBooking);
router.get("/history", verifyToken, getBookingHistory);
router.get("/active", verifyToken, getActiveBookings);
router.get("/status/:bookingId", verifyToken, getBookingStatus);
router.get("/:id", verifyToken, getBookingById);
router.put("/update/:id", verifyToken, updateBooking);
router.put("/confirm/:id", verifyToken, confirmBooking);
router.delete("/cancel/:id", verifyToken, cancelBooking);

module.exports = router; 