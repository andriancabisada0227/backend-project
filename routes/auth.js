const express = require('express');
const router = express.Router();
const { verifyToken, refreshToken } = require('../services/token');

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

// Auth routes
router.post("/update/password", verifyToken, updatePassword);
router.post("/Register/resendCode", emailRegisterSignIn);
router.post("/SignIn", emailSignIn);
router.post("/Verification", emailVerification);
router.post("/logout", verifyToken, logout);
router.post("/changepassword", verifyToken, changePassword);
router.post("/request/update/emailorphoneNumber", verifyToken, requestUpdateEmailOrPhone);
router.post("/updateEmailOrPhone", verifyToken, updateEmailOrPhone);
router.post("/forgotpassword", forgotPassword);

router.get("/refreshtoken/:emailOrPhone", refreshToken);

module.exports = router; 