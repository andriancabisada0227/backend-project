const express = require('express');
const router = express.Router();
const { verifyToken } = require('../services/token');
const isTokenInvalidated = require("../services/middleware/tokenInvalidated");


const {
    emailRegisterSignIn,
    emailVerification,
    emailSignIn,
    logout,
    changePassword,
    updateEmailOrPhone,
    forgotPassword,
    requestUpdateEmailOrPhone,
    updatePassword,
  } = require("../services/email");

  const {
    addTermsAndConditions,
    retrieveLatestTermsAndConditions,
    retrieveSpecificVersionTermsAndConditions,
    listAllTermsAndConditions,
  } = require("../services/termsAndConditions");
  
  const {
    addPrivacyPolicy,
    retrieveLatestPrivacyPolicy,
    retrieveSpecificVersionPrivacyPolicy,
    listAllPrivacyPolicy,
  } = require("../services/privacyPolicy");
  
  const {
    addCCPA,
    retrieveLatestCCPA,
    retrieveSpecificVersionCCPA,
    listAllCCPA,
  } = require("../services/ccpa");
  
  const {
    addCopyright,
    retrieveLatestCopyright,
    retrieveSpecificVersionCopyright,
    listAllCopyright,
  } = require("../services/copyrightNotice");

const {
    searchDriverNoParentAssigned,
    searchFilterParents,
    searchFilterDrivers,
    getAdminAccountByEmail,
    getDriverAccountsWithPagination,
    getDriverAccountByEmailOrPhone,
    getParentAccountsWithPagination,
    getParentsAccountByEmailOrPhone,
    createAdminAccount,
    createAdminProfile,
    getAdminProfileBy_csUserId,
    editAdminProfileBy_csUserId,
    deleteAdminProfileBy_csUserId,
    deleteAdminAccountByEmail,
    deleteDriverAccount,
    deleteParentAccount,
    loginCS,
    logOutCS,
    forgotPasswordCS,
    addDMVRecord_CriminalBackground,
    sendDMVRecord_CriminalBackground,
    sendDocumentVerification,
    updatePasswordCS,
    editDriverCS,
    editParentCS,
    sendNotificationTempDriver,
  } = require("../services/customerSupport");

//sign up
router.post("/email/update/password", verifyToken, updatePassword);
router.post("/email/Register/resendCode", emailRegisterSignIn);
router.post("/email/SignIn", emailSignIn);
router.post("/email/Verification", emailVerification);
router.post("/logout", verifyToken, logout);
router.post("/changepassword", verifyToken, changePassword);
router.post(
  "/request/update/emailorphoneNumber",
  verifyToken,
  requestUpdateEmailOrPhone
);
router.post(
  "/updateEmailOrPhone",
  isTokenInvalidated,
  verifyToken,
  updateEmailOrPhone
);
router.post("/forgotpassword", forgotPassword);

//terms and condition api
router.post("/termsAndConditions", cors(), addTermsAndConditions);
router.get("/termsAndConditions/latest", cors(), retrieveLatestTermsAndConditions);
router.get(
  "/termsAndConditions/:vn",
  cors(),
  retrieveSpecificVersionTermsAndConditions
);
router.get("/termsAndConditions", cors(), listAllTermsAndConditions);

//privacy policy api
router.get("/privacy-policy/:vn", cors(), retrieveSpecificVersionPrivacyPolicy);
router.get("/privacy-policy/get/all", cors(), listAllPrivacyPolicy);
router.get("/privacy-policy/get/latest", cors(), retrieveLatestPrivacyPolicy);
router.post("/privacy-policy/add", cors(), addPrivacyPolicy);

//ccpa api
router.get("/ccpa/:vn", cors(), retrieveSpecificVersionCCPA);
router.get("/ccpa/get/all", cors(), listAllCCPA);
router.get("/ccpa/get/latest", cors(), retrieveLatestCCPA);
router.post("/ccpa/add", cors(), addCCPA);

//copyright api
router.get("/copyright/:vn", cors(), retrieveSpecificVersionCopyright);
router.get("/copyright/get/all", cors(), listAllCopyright);
router.get("/copyright/get/latest", cors(), retrieveLatestCopyright);
router.post("/copyright/add", cors(), addCopyright);

//customer support
router.post("/search/drivers/send-notification", cors(), verifyToken, sendNotificationTempDriver);

router.get("/search/drivers/temp", cors(), verifyToken, searchDriverNoParentAssigned);

router.get("/search/filter/parents", cors(), verifyToken, searchFilterParents);

router.get("/search/filter/drivers", cors(), verifyToken, searchFilterDrivers);

router.get("/admin/:email", cors(), verifyToken, getAdminAccountByEmail);

router.get(
  "/drivers/pagination",
  cors(),
  verifyToken,
  getDriverAccountsWithPagination
);
  
router.get(
  "/driver/:emailOrPhone",
  cors(),
  verifyToken,
  getDriverAccountByEmailOrPhone
);
  
router.get(
  "/parents/pagination",
  cors(),
  verifyToken,
  getParentAccountsWithPagination
);
  
router.get(
  "/parent/:emailOrPhone",
  cors(),
  verifyToken,
  getParentsAccountByEmailOrPhone
);
  
router.get(
  "/admin/profile/:id",
  cors(),
  verifyToken,
  getAdminProfileBy_csUserId
);
  
router.post(
  "/admin/profile/create",
  cors(),
  verifyToken,
  createAdminProfile
);
router.post(
  "/admin/profile/edit/:id",
  cors(),
  verifyToken,
  editAdminProfileBy_csUserId
);
  
router.post("/admin", cors(), createAdminAccount);
router.post("/admin/login", cors(), loginCS);
router.post("/admin/logout", cors(), verifyToken, logOutCS);
router.post("/admin/forgotPassword", cors(), forgotPasswordCS);
router.post("/admin/updatePassword", cors(), updatePasswordCS);
router.post(
  "/admin/add/dmv-criminal-records",
  cors(),
  verifyToken,
  addDMVRecord_CriminalBackground
);
router.post(
  "/admin/send-status/document-verification",
  cors(),
  verifyToken,
  sendDocumentVerification
);
  
router.post(
  "/admin/send-status/dmv-criminal-records",
  cors(),
  verifyToken,
  sendDMVRecord_CriminalBackground
);
  
router.delete(
  "/admin/profile/:id",
  cors(),
  verifyToken,
  deleteAdminProfileBy_csUserId
);
router.delete(
  "/admin/:email",
  cors(),
  verifyToken,
  deleteAdminAccountByEmail
);
router.post("/driver/:id", cors(), verifyToken, editDriverCS);
router.post("/parent/:id", cors(), verifyToken, editParentCS);
router.delete("/driver/:id", cors(), verifyToken, deleteDriverAccount);
router.delete("/parent/:id", cors(), verifyToken, deleteParentAccount);

module.exports = router; 