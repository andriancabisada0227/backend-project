const express = require('express');
const router = express.Router();
const { verifyToken } = require('../services/token');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const {
    downloadSampleTemplate,
    createSchool,
    editSchool,
    getSchoolById,
    getSchoolByName,
    deleteSchoolById,
    interestRegistration,
    schoolRegistration,
    verifySchool,
    schoolInterest,
    sendSMSDriverOrParent,
    forgotPasswordSchool,
    verifyForgotPasswordSchool,
    updatePasswordSchool,
    loginSchool,
    readExcelFileAndSave,
    schoolChangePassword,
    getVerifiedInterestRegistration,
    verifyEmailInterestRegistration,
} = require('../services/schools');



router.post("/schools/send/sms", cors(), sendSMSDriverOrParent);
router.post("/schools/create", cors(), createSchool);
router.post("/schools/verify", cors(), verifySchool);
router.post("/schools/edit/:id", cors(), verifyToken, editSchool);
router.post("/schools/interest/register/create", cors(), interestRegistration);
router.post("/schools/register", cors(), schoolRegistration);
router.post("/schools/interest", cors(), schoolInterest);
router.post("/schools/forgot/password", cors(), forgotPasswordSchool);
router.post("/schools/verify/forgot/password", cors(), verifyForgotPasswordSchool);
router.post("/schools/update/password", cors(), updatePasswordSchool);
router.post("/schools/login", cors(), loginSchool);
router.post(
  "/schools/bulk/upload",
  upload.single("students"),
  cors(),
  verifyToken,
  readExcelFileAndSave
);
router.post("/schools/change/password", cors(), verifyToken, schoolChangePassword);
router.delete("/school/:id", cors(), verifyToken, deleteSchoolById);

//schools - web
router.get("/schools/download/template", cors(), downloadSampleTemplate);
router.get("/schools/get/:id", cors(), verifyToken, getSchoolById);
router.get("/schools/get/:name", cors(), verifyToken, getSchoolByName);

router.get("/schools/interest/register/getVerified",cors(),verifyToken,getVerifiedInterestRegistration);
router.post("/schools/interest/register/verify",cors(),verifyEmailInterestRegistration);
  

module.exports = router; 