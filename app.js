const express = require("express");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const helmet = require("helmet");
const zlib = require("zlib");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");

require("dotenv").config();

const customerSupportYML = YAML.load("./api-docs/customer-support.yml");
const parentsYML = YAML.load("./api-docs/parents.yml");
const driversYML = YAML.load("./api-docs/drivers.yml");
const webYML = YAML.load("./api-docs/web.yml");

const compressionMiddleware = require("./middleware/compression");
const createRateLimiter = require("./middleware/rateLimiter");

const app = express();

app.use(compressionMiddleware);

app.use(cookieParser());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(helmet());
app.use(cors());
app.disable("x-powered-by");

// Rate limit sensitive authentication endpoints: max 30 requests per minute
const authRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  message: "Too many login/OTP requests from this IP. Please try again after a minute.",
});
app.use(["/email/SignIn", "/sendOtp", "/verifyOtp", "/refreshtoken"], authRateLimiter);

const setCrossOriginOpenerPolicy = (req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "unsafe-none");
  next();
};

// API Documentation
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

// Home page
app.get("/", (req, res) => {
  return res.json({ success: 200, message: "schoolryde backend app" });
});

// Mount modular routers
const authRoutes = require("./routes/auth");
const parentRoutes = require("./routes/parents");
const studentRoutes = require("./routes/student");
const driverRoutes = require("./routes/drivers");
const scheduleRoutes = require("./routes/schedule");
const bookingRoutes = require("./routes/booking");
const paymentRoutes = require("./routes/payments");
const routesRoutes = require("./routes/routes");
const chatRoutes = require("./routes/chat");
const schoolRoutes = require("./routes/schools");
const supportRoutes = require("./routes/support");
const taxiRoutes = require("./routes/taxi");
const serviceAreaRoutes = require("./routes/servicesArea");
const webhookRoutes = require("./routes/webhook");
const taxiCompanyRoutes = require("./routes/taxiCompany");
const payoutRoutes = require("./routes/payout");
const onboardingRoutes = require("./routes/onboarding");
const serviceRoutes = require("./routes/service");

// Webhook endpoints
const { WebhookEndpoints } = require("./services/webhook");
app.post("/api/webhook_endpoints", cors(), WebhookEndpoints);

app.use("/", authRoutes);
app.use("/", parentRoutes);
app.use("/", studentRoutes);
app.use("/", driverRoutes);
app.use("/", scheduleRoutes);
app.use("/", bookingRoutes);
app.use("/", paymentRoutes);
app.use("/", routesRoutes);
app.use("/", chatRoutes);
app.use("/", schoolRoutes);
app.use("/", supportRoutes);
app.use("/support", supportRoutes);
app.use("/", taxiRoutes);
app.use("/", serviceRoutes);
app.use("/service-areas", serviceAreaRoutes);
app.use("/webhook", webhookRoutes);
app.use("/taxi-company", taxiCompanyRoutes);
app.use("/payout", payoutRoutes);
app.use("/onboarding", onboardingRoutes);

// 404 Handler
app.all("*", (req, res) => {
  return res.status(404).json({ success: false, error: "Page Not found" });
});

// Centralized error handling middleware
app.use((err, req, res, next) => {
  console.error("Unhandled Server Error:", err);
  const status = err.status || err.statusCode || 500;
  return res.status(status).json({
    success: false,
    error: err.message || "Internal Server Error"
  });
});

module.exports = app;