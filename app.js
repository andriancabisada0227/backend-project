const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const helmet = require("helmet");
const zlib = require("zlib");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const isTokenInvalidated = require("./services/middleware/tokenInvalidated");
const { verifyToken, refreshToken } = require("./services/token");
const { oAuth } = require("./services/oauth");
const { sendOtp, verifyOtp } = require("./services/otp");

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
} = require("./services/email");

const {
  getParentById,
  getLatestDriver,
  getParentByName,
  addParent,
  deleteParentById,
  editParent,
  addParentLocation,
  addParentImage,
  getParentDetailStudents,
  getAllConfirmedParentsDriver,
  getConfirmedParentStudentDriver,
} = require("./services/parents");

const {
  getStudentById,
  getStudentByName,
  saveStudent,
  updateStudent,
  deleteStudentById,
  getAllStudents,
  getConfirmedStudentsDriver,
} = require("./services/students");

const {
  addTermsAndConditions,
  retrieveLatestTermsAndConditions,
  retrieveSpecificVersionTermsAndConditions,
  listAllTermsAndConditions,
} = require("./services/termsAndConditions");

const {
  addPrivacyPolicy,
  retrieveLatestPrivacyPolicy,
  retrieveSpecificVersionPrivacyPolicy,
  listAllPrivacyPolicy,
} = require("./services/privacyPolicy");

const {
  addCCPA,
  retrieveLatestCCPA,
  retrieveSpecificVersionCCPA,
  listAllCCPA,
} = require("./services/ccpa");

const {
  addCopyright,
  retrieveLatestCopyright,
  retrieveSpecificVersionCopyright,
  listAllCopyright,
} = require("./services/copyrightNotice");

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
} = require("./services/drivers");

const {
  createSchedule,
  cancelScheduleStudents,
  cancelScheduleStudentDriver,
  deleteScheduleById,
  deleteStudentByScheduleId,
  editScheduleById,
  editStudentByScheduleId,
  searchAllSchedule,
  getScheduleById,
  getDriverScheduleByUserId,
} = require("./services/schedule");

const {
  createBooking,
  deleteBooking,
  confirmBooking,
  editBooking,
  getBookingId,
  getAllBookingsByUserId,
} = require("./services/bookings");

const {
  getCardsByUserId,
  connectionToken,
  create_setup_intent,
  createCustomer,
  create_setup_intent_key,
  paymentSheet,
  createEphemeralKeys,
  attachPaymentMethod,
  driverPayout,
} = require("./services/payments");

const {
  registerForPushNotifications,
  unregisterForPushNotifications,
} = require("./services/pushnotification");

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
} = require("./services/routes");

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
} = require("./services/customerSupport");

const {
  getAllChatsByUserId,
  allChatRooms,
  chatRoomsDetails,
  deleteAllChatsByUserId,
  deleteChatByChatId,
  deleteSelectedChatsByUserId,
} = require("./services/chatREST");

const {
  addWhiteList,
  removeWhiteList,
  checkWhiteList,
} = require("./services/whiteList");

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
} = require("./services/schools");

const {
  sendHelpAndSupport,
  contactUs,
  faq,
} = require("./services/helpSupport");


const cookieParser = require("cookie-parser");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");

const customerSupportYML = YAML.load("./api-docs/customer-support.yml");
const parentsYML = YAML.load("./api-docs/parents.yml");
const driversYML = YAML.load("./api-docs/drivers.yml");
const webYML = YAML.load("./api-docs/web.yml");

require("dotenv").config();

const app = express();

app.use((req, res, next) => {
  const acceptEncoding = req.headers["Accept-Encoding"] || "";

  if (acceptEncoding.includes("br")) {
    res.setHeader("Content-Encoding", "br");
    const brotli = zlib.createBrotliCompress();
    res.write = (data) => brotli.write(data);
    res.end = () => brotli.end();
    brotli.pipe(res);
  } else if (acceptEncoding.includes("gzip")) {
    res.setHeader("Content-Encoding", "gzip");
    const gzip = zlib.createGzip();
    res.write = (data) => gzip.write(data);
    res.end = () => gzip.end();
    gzip.pipe(res);
  } else if (acceptEncoding.includes("deflate")) {
    res.setHeader("Content-Encoding", "deflate");
    const deflate = zlib.createDeflate();
    res.write = (data) => deflate.write(data);
    res.end = () => deflate.end();
    deflate.pipe(res);
  } else {
    next();
  }
});

app.use(cookieParser());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(helmet());
app.use(cors());
app.disable("x-powered-by");

const setCrossOriginOpenerPolicy = (req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "unsafe-none");
  next();
};

app.use(
  "/api/customer-support",
  setCrossOriginOpenerPolicy,
  swaggerUi.serveFiles(customerSupportYML),
  swaggerUi.setup(customerSupportYML)
);
app.use(
  "/api/parents",
  setCrossOriginOpenerPolicy,
  swaggerUi.serveFiles(parentsYML),
  swaggerUi.setup(parentsYML)
);
app.use(
  "/api/drivers",
  setCrossOriginOpenerPolicy,
  swaggerUi.serveFiles(driversYML),
  swaggerUi.setup(driversYML)
);
app.use(
  "/api/web",
  setCrossOriginOpenerPolicy,
  swaggerUi.serveFiles(webYML),
  swaggerUi.setup(webYML)
);

//home page
app.get("/", (req, res) => {
  return res.json({ success: 200, message: "schoolryde backend app" });
});
//oauth
app.post("/oauth", oAuth);

//sign up
app.post("/email/update/password", verifyToken, updatePassword);
app.post("/email/Register/resendCode", emailRegisterSignIn);
app.post("/email/SignIn", emailSignIn);
app.post("/email/Verification", emailVerification);
app.post("/logout", verifyToken, logout);
app.post("/changepassword", verifyToken, changePassword);
app.post(
  "/request/update/emailorphoneNumber",
  verifyToken,
  requestUpdateEmailOrPhone
);
app.post(
  "/updateEmailOrPhone",
  isTokenInvalidated,
  verifyToken,
  updateEmailOrPhone
);
app.post("/forgotpassword", forgotPassword);

//otp
app.post("/sendOtp", sendOtp);
app.post("/verifyOtp", verifyOtp);

//parents api
// app.get("/parents/driver/latest", verifyToken, getLatestDriver);
// app.get("/parents/:id", isTokenInvalidated, verifyToken, getParentById);
// app.get("/parents/name/:parentName", verifyToken, getParentByName);
// app.get(
//   "/parents/details/student/details",
//   verifyToken,
//   getParentDetailStudents
// );
// app.get(
//   "/parents/confirmed/booking",
//   verifyToken,
//   getAllConfirmedParentsDriver
// );
// app.get(
//   "/parents/students/confirmed",
//   verifyToken,
//   getConfirmedParentStudentDriver
// );
app.put("/parent/edit", verifyToken, editParent);
// app.post("/parents", verifyToken, addParent);
app.post("/parent/location/add", verifyToken, addParentLocation);
app.post("/parent/image", verifyToken, addParentImage);

// app.delete("/parents/:id", verifyToken, deleteParentById);

// routes for parents
const parentRoutes = require('./routes/parents');
app.use('/parents', parentRoutes);


//student api
app.get("/students", verifyToken, getAllStudents);
app.get("/students/all/confirmed", verifyToken, getConfirmedStudentsDriver);
app.get("/students/:id", verifyToken, getStudentById);
app.get("/students/:studentName", verifyToken, getStudentByName);

app.post("/students/", verifyToken, saveStudent);
app.put("/students/:id", verifyToken, updateStudent);
app.delete("/students/:id", verifyToken, deleteStudentById);

//terms and condition api
app.post("/termsAndConditions", cors(), addTermsAndConditions);
app.get("/termsAndConditions/latest", cors(), retrieveLatestTermsAndConditions);
app.get(
  "/termsAndConditions/:vn",
  cors(),
  retrieveSpecificVersionTermsAndConditions
);
app.get("/termsAndConditions", cors(), listAllTermsAndConditions);

//privacy policy api
app.get("/privacy-policy/:vn", cors(), retrieveSpecificVersionPrivacyPolicy);
app.get("/privacy-policy/get/all", cors(), listAllPrivacyPolicy);
app.get("/privacy-policy/get/latest", cors(), retrieveLatestPrivacyPolicy);
app.post("/privacy-policy/add", cors(), addPrivacyPolicy);

//ccpa api
app.get("/ccpa/:vn", cors(), retrieveSpecificVersionCCPA);
app.get("/ccpa/get/all", cors(), listAllCCPA);
app.get("/ccpa/get/latest", cors(), retrieveLatestCCPA);
app.post("/ccpa/add", cors(), addCCPA);

//copyright api
app.get("/copyright/:vn", cors(), retrieveSpecificVersionCopyright);
app.get("/copyright/get/all", cors(), listAllCopyright);
app.get("/copyright/get/latest", cors(), retrieveLatestCopyright);
app.post("/copyright/add", cors(), addCopyright);

//drivers api
app.get("/driver/checkApproval", verifyToken, checkApproval);
app.get("/driver/myCurrentDriver", verifyToken, getMyCurrentDriver);
app.get("/driver/reviews/:id", verifyToken, getDriverReviews);
app.post("/driver/background-verification/status", verifyToken, approvedDriver);
app.get("/driver/:id", verifyToken, getDriverDetailsById);
app.get("/driver/students/:id", verifyToken, getDriverStudents);
app.get("/drivers", verifyToken, searchDrivers);
app.post("/driver/new", cors(), verifyToken, addDriver);
app.post("/driver/ratings/compute/:id", verifyToken, computeDriverRatings);
app.post("/driver/:id/review", verifyToken, addDriverReview);
app.post("/driver/:id/student", verifyToken, addDriverStudent);
app.post("/driver/location/add", verifyToken, addDriverLocation);
app.post("/driver/change", verifyToken, changeDriver);
app.post(
  "/driver/background/verification",
  verifyToken,
  backgroundVerification
);
app.post("/driver/upload/image", verifyToken, driverImageUpload);
app.put("/driver/:driverid/reviews/:reviewid", verifyToken, editDriverReview);
app.put("/driver/:id", verifyToken, editDriver);
app.delete("/driver/:id", verifyToken, deleteDriver);
app.delete(
  "/driver/:driverid/reviews/:reviewid",
  verifyToken,
  deleteDriverReview
);
app.delete(
  "/driver/:driverid/students/:studentid",
  verifyToken,
  deleteDriverStudent
);

//schedule
app.get("/schedule/userid/limit", verifyToken, searchAllSchedule);
app.get("/schedule/driver", verifyToken, getDriverScheduleByUserId);
app.get("/schedule/:id", verifyToken, getScheduleById);

app.post("/schedule/", verifyToken, createSchedule);
app.post("/schedule/cancel/students", verifyToken, cancelScheduleStudents);
app.post(
  "/schedule/cancel/students/driver",
  verifyToken,
  cancelScheduleStudentDriver
);
app.put("/schedule/:id", verifyToken, editScheduleById);
app.post("/schedule/:id/student/edit", verifyToken, editStudentByScheduleId);
app.delete(
  "/schedule/:id/student/delete/:studentId",
  verifyToken,
  deleteStudentByScheduleId
);
app.delete("/schedule/:id", verifyToken, deleteScheduleById);

//booking
app.get("/booking/all", verifyToken, getAllBookingsByUserId);
app.get("/booking/:id", verifyToken, getBookingId);
app.post("/booking/confirm/:id", verifyToken, confirmBooking);
app.post("/booking", verifyToken, createBooking);
app.put("/booking/:id", verifyToken, editBooking);
app.delete("/booking/:id", verifyToken, deleteBooking);

//payment and cards
app.get("/payment/connectionToken", verifyToken, connectionToken);
app.get(
  "/payment/create/setup/intent/key",
  verifyToken,
  create_setup_intent_key
);
app.get("/payment/create/setup/intent", verifyToken, create_setup_intent);

app.post("/payment/:id/attach", verifyToken, attachPaymentMethod);
app.get("/payment/:id/createEphemeralKeys/", verifyToken, createEphemeralKeys);
app.post("/payment/sheet/", verifyToken, paymentSheet);
app.get("/payment/card/user/:id", verifyToken, getCardsByUserId);
app.post("/payment/driver/payout", verifyToken, driverPayout);

//routes - ride
app.get("/ride/parent/status/:id", verifyToken, parentRideStatus);
app.post("/rideCost", verifyToken, rideCost);
app.post("/ride/start", verifyToken, startRide);
app.post("/ride/cancel/students", verifyToken, cancelRideStudents);
app.post("/ride/end", verifyToken, endRide);
app.post("/ride/status", verifyToken, rideStatus);
app.post("/ride/driver/status", verifyToken, driverRideStatus);
app.post("/ride/update/status", verifyToken, updateRideStatus);
app.post("/parent/rideCostAcceptance", verifyToken, parentRideCostAcceptance);
app.post("/driver/rideCostAcceptance", verifyToken, driverRideCostAcceptance);

//refresh token
app.get("/refreshtoken/:emailOrPhone", refreshToken);

//push notification
app.post(
  "/registerForPushNotifications",
  verifyToken,
  registerForPushNotifications
);
app.post(
  "/unregisterForPushNotifications",
  verifyToken,
  unregisterForPushNotifications
);

//chat REST
app.get("/chat/getall", verifyToken, getAllChatsByUserId);
app.get("/chat/all/rooms", verifyToken, allChatRooms);
app.get("/chat/details/:id", verifyToken, chatRoomsDetails);
app.delete("/chat/delete/selected", verifyToken, deleteSelectedChatsByUserId);

//whiteList
app.post("/white/list/add", verifyToken, addWhiteList);
app.post("/white/list/remove", verifyToken, removeWhiteList);
app.get("/white/list/check", verifyToken, checkWhiteList);

//help and support
app.post("/sendHelpAndSupport", verifyToken, sendHelpAndSupport);
app.post("/web/contactUs", cors(), contactUs);
app.post("/web/faq", cors(), faq);
//schools - web
app.get("/schools/download/template", cors(), downloadSampleTemplate);
app.get("/schools/get/:id", cors(), verifyToken, getSchoolById);
app.get("/schools/get/:name", cors(), verifyToken, getSchoolByName);

app.get(
  "/schools/interest/register/getVerified",
  cors(),
  verifyToken,
  getVerifiedInterestRegistration
);
app.post(
  "/schools/interest/register/verify",
  cors(),
  verifyEmailInterestRegistration
);

app.post("/schools/send/sms", cors(), sendSMSDriverOrParent);
app.post("/schools/create", cors(), createSchool);
app.post("/schools/verify", cors(), verifySchool);
app.post("/schools/edit/:id", cors(), verifyToken, editSchool);
app.post("/schools/interest/register/create", cors(), interestRegistration);
app.post("/schools/register", cors(), schoolRegistration);
app.post("/schools/interest", cors(), schoolInterest);
app.post("/schools/forgot/password", cors(), forgotPasswordSchool);
app.post("/schools/verify/forgot/password", cors(), verifyForgotPasswordSchool);
app.post("/schools/update/password", cors(), updatePasswordSchool);
app.post("/schools/login", cors(), loginSchool);
app.post(
  "/schools/bulk/upload",
  upload.single("students"),
  cors(),
  verifyToken,
  readExcelFileAndSave
);
app.post("/schools/change/password", cors(), verifyToken, schoolChangePassword);
app.delete("/school/:id", cors(), verifyToken, deleteSchoolById);

//customer support
app.post(
  "/support/search/drivers/send-notification",
  cors(),
  verifyToken,
  sendNotificationTempDriver
);

app.get(
  "/support/search/drivers/temp",
  cors(),
  verifyToken,
  searchDriverNoParentAssigned
);

app.get(
  "/support/search/filter/parents",
  cors(),
  verifyToken,
  searchFilterParents
);
app.get(
  "/support/search/filter/drivers",
  cors(),
  verifyToken,
  searchFilterDrivers
);
app.get("/support/admin/:email", cors(), verifyToken, getAdminAccountByEmail);
app.get(
  "/support/drivers/pagination",
  cors(),
  verifyToken,
  getDriverAccountsWithPagination
);

app.get(
  "/support/driver/:emailOrPhone",
  cors(),
  verifyToken,
  getDriverAccountByEmailOrPhone
);

app.get(
  "/support/parents/pagination",
  cors(),
  verifyToken,
  getParentAccountsWithPagination
);

app.get(
  "/support/parent/:emailOrPhone",
  cors(),
  verifyToken,
  getParentsAccountByEmailOrPhone
);

app.get(
  "/support/admin/profile/:id",
  cors(),
  verifyToken,
  getAdminProfileBy_csUserId
);

app.post(
  "/support/admin/profile/create",
  cors(),
  verifyToken,
  createAdminProfile
);
app.post(
  "/support/admin/profile/edit/:id",
  cors(),
  verifyToken,
  editAdminProfileBy_csUserId
);

app.post("/support/admin", cors(), createAdminAccount);
app.post("/support/admin/login", cors(), loginCS);
app.post("/support/admin/logout", cors(), verifyToken, logOutCS);
app.post("/support/admin/forgotPassword", cors(), forgotPasswordCS);
app.post("/support/admin/updatePassword", cors(), updatePasswordCS);
app.post(
  "/support/admin/add/dmv-criminal-records",
  cors(),
  verifyToken,
  addDMVRecord_CriminalBackground
);
app.post(
  "/support/admin/send-status/document-verification",
  cors(),
  verifyToken,
  sendDocumentVerification
);

app.post(
  "/support/admin/send-status/dmv-criminal-records",
  cors(),
  verifyToken,
  sendDMVRecord_CriminalBackground
);

app.delete(
  "/support/admin/profile/:id",
  cors(),
  verifyToken,
  deleteAdminProfileBy_csUserId
);
app.delete(
  "/support/admin/:email",
  cors(),
  verifyToken,
  deleteAdminAccountByEmail
);
app.post("/support/driver/:id", cors(), verifyToken, editDriverCS);
app.post("/support/parent/:id", cors(), verifyToken, editParentCS);
app.delete("/support/driver/:id", cors(), verifyToken, deleteDriverAccount);
app.delete("/support/parent/:id", cors(), verifyToken, deleteParentAccount);


const {
  addTaxiCode,
  editTaxiCode,
  deleteTaxiCode,
  getTaxiCode,
  getAllTaxi,
  CreateTaxiKey
} = require("./services/taxi");
// taxi
app.get("/taxi/all", cors(), verifyToken, getAllTaxi);
app.get("/taxi/details/:id", cors(), verifyToken, getTaxiCode);
app.post("/taxi/add", cors(), verifyToken, addTaxiCode);
app.post("/taxi/edit/:id", cors(), verifyToken, editTaxiCode);
app.delete("/taxi/delete/:id", cors(), verifyToken, deleteTaxiCode);

app.post("/taxi/create/key", cors(), CreateTaxiKey);






// Service Areas routes
const serviceAreaRoutes = require('./routes/servicesArea');
app.use('/service-areas', serviceAreaRoutes);


//webhook endpoints
const {
  WebhookEndpoints,
} = require("./services/webhook");
app.post("/api/webhook_endpoints", cors(), WebhookEndpoints);

// routes for webhook
const webhookRoutes = require('./routes/webhook');
app.use('/webhook', webhookRoutes);

// taxi company routes
const taxiCompanyRoutes = require('./routes/taxiCompany');
app.use('/taxi-company', taxiCompanyRoutes);

// payout routes
const payoutRoutes = require('./routes/payout');
app.use('/payout', payoutRoutes);

app.all("*", (req, res) => {
  return res.status(404).json({ success: false, error: "Page Not found" });
});
module.exports = app;