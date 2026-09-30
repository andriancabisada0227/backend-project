const express = require('express');
const router = express.Router();
const { verifyToken } = require('../services/token');
const {
  createBooking,
  deleteBooking,
  confirmBooking,
  editBooking,
  getBookingId,
  getAllBookingsByUserId,
} = require('../services/bookings');

// Booking routes
router.get("/booking/all", verifyToken, getAllBookingsByUserId);
router.get("/booking/:id", verifyToken, getBookingId);
router.post("/booking/confirm/:id", verifyToken, confirmBooking);
router.post("/booking", verifyToken, createBooking);
router.put("/booking/:id", verifyToken, editBooking);
router.delete("/booking/:id", verifyToken, deleteBooking);

module.exports = router; 