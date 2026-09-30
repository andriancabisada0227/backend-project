const express = require('express');
const router = express.Router();
const { verifyToken, refreshToken } = require('../services/token');
const isTokenInvalidated = require("../services/middleware/tokenInvalidated");
const { oAuth } = require("../services/oauth");
const { sendOtp, verifyOtp } = require("../services/otp");

const { 
  emailRegisterSignIn, 
  emailVerification, 
  emailSignIn, 
  logout, 
  changePassword, 
  updateEmailOrPhone, 
  forgotPassword, 
  requestUpdateEmailOrPhone, 
  updatePassword 
} = require('../services/email');

// OAuth
router.post("/oauth", oAuth);

// Email & Auth routes
router.post("/email/update/password", verifyToken, updatePassword);
router.post("/email/Register/resendCode", emailRegisterSignIn);
router.post("/email/SignIn", emailSignIn);
router.post("/email/Verification", emailVerification);
router.post("/logout", verifyToken, logout);
router.post("/changepassword", verifyToken, changePassword);
router.post("/request/update/emailorphoneNumber", verifyToken, requestUpdateEmailOrPhone);
router.post("/updateEmailOrPhone", isTokenInvalidated, verifyToken, updateEmailOrPhone);
router.post("/forgotpassword", forgotPassword);

// OTP routes
router.post("/sendOtp", sendOtp);
router.post("/verifyOtp", verifyOtp);

// Refresh token (protected)
router.get("/refreshtoken/:emailOrPhone", verifyToken, refreshToken);

module.exports = router;