const express = require('express');
const router = express.Router();
const cors = require('cors');
const { verifyToken } = require('../services/token');

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

//customer support
router.post(
  "/support/search/drivers/send-notification",
  cors(),
  verifyToken,
  sendNotificationTempDriver
);

router.get(
  "/support/search/drivers/temp",
  cors(),
  verifyToken,
  searchDriverNoParentAssigned
);

router.get(
  "/support/search/filter/parents",
  cors(),
  verifyToken,
  searchFilterParents
);

router.get(
  "/support/search/filter/drivers",
  cors(),
  verifyToken,
  searchFilterDrivers
);

router.get("/support/admin/:email", cors(), verifyToken, getAdminAccountByEmail);

router.get(
  "/support/drivers/pagination",
  cors(),
  verifyToken,
  getDriverAccountsWithPagination
);

router.get(
  "/support/driver/:emailOrPhone",
  cors(),
  verifyToken,
  getDriverAccountByEmailOrPhone
);

router.get(
  "/support/parents/pagination",
  cors(),
  verifyToken,
  getParentAccountsWithPagination
);

router.get(
  "/support/parent/:emailOrPhone",
  cors(),
  verifyToken,
  getParentsAccountByEmailOrPhone
);

router.get(
  "/support/admin/profile/:id",
  cors(),
  verifyToken,
  getAdminProfileBy_csUserId
);

router.post(
  "/support/admin/profile/create",
  cors(),
  verifyToken,
  createAdminProfile
);
router.post(
  "/support/admin/profile/edit/:id",
  cors(),
  verifyToken,
  editAdminProfileBy_csUserId
);

router.post("/support/admin", cors(), createAdminAccount);
router.post("/support/admin/login", cors(), loginCS);
router.post("/support/admin/logout", cors(), verifyToken, logOutCS);
router.post("/support/admin/forgotPassword", cors(), forgotPasswordCS);
router.post("/support/admin/updatePassword", cors(), updatePasswordCS);
router.post(
  "/support/admin/add/dmv-criminal-records",
  cors(),
  verifyToken,
  addDMVRecord_CriminalBackground
);
router.post(
  "/support/admin/send-status/document-verification",
  cors(),
  verifyToken,
  sendDocumentVerification
);

router.post(
  "/support/admin/send-status/dmv-criminal-records",
  cors(),
  verifyToken,
  sendDMVRecord_CriminalBackground
);

router.delete(
  "/support/admin/profile/:id",
  cors(),
  verifyToken,
  deleteAdminProfileBy_csUserId
);
router.delete(
  "/support/admin/:email",
  cors(),
  verifyToken,
  deleteAdminAccountByEmail
);
router.post("/support/driver/:id", cors(), verifyToken, editDriverCS);
router.post("/support/parent/:id", cors(), verifyToken, editParentCS);
router.delete("/support/driver/:id", cors(), verifyToken, deleteDriverAccount);
router.delete("/support/parent/:id", cors(), verifyToken, deleteParentAccount);

module.exports = router; 