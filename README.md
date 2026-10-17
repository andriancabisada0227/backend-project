# Backend Core Platform (SchoolRyde)

Backend API, real-time messaging, and microservices platform powering ride bookings, driver location tracking, student commute management, payment processing, and customer support. Built with **Node.js**, **Express**, **AWS DynamoDB & S3**, **Redis**, **Firebase Cloud Messaging**, **Stripe**, and **Socket.IO**.

---

## Table of Contents

- [Overview](#overview)
- [Architecture & Tech Stack](#architecture--tech-stack)
- [Services & Port Mapping](#services--port-mapping)
- [Prerequisites](#prerequisites)
- [Installation & Setup](#installation--setup)
- [Environment Configuration](#environment-configuration)
- [Running the Application](#running-the-application)
- [Testing](#testing)
- [Project Structure](#project-structure)
- [Core Features & Design Patterns](#core-features--design-patterns)
  - [1. Redis Cluster Pub/Sub & Geospatial Tracking](#1-redis-cluster-pubsub--geospatial-tracking)
  - [2. Asynchronous Outbox Event Dispatcher](#2-asynchronous-outbox-event-dispatcher)
  - [3. Sliding-Window Rate Limiting](#3-sliding-window-rate-limiting)
  - [4. Centralized Constants & Response Envelopes](#4-centralized-constants--response-envelopes)
  - [5. Graceful Process Shutdown](#5-graceful-process-shutdown)
- [API Documentation](#api-documentation)

---

## Overview

The platform coordinates end-to-end student transportation:
- **Driver & Parent Workflows**: Onboarding, document verification, profile management, and student associations.
- **Rides & Bookings**: On-demand and scheduled ride booking flows with atomic concurrency locks.
- **Real-Time Geolocation**: High-frequency driver GPS tracking and nearby driver discovery via Redis Geospatial indexing (`GEOADD`, `GEOSEARCH`) and WebSockets.
- **Messaging**: Real-time driver-parent communication via Socket.IO with Redis pub/sub multi-worker synchronization.
- **Payments & Billing**: Stripe integration for customer card management, rides, payouts, and scheduled billing cron jobs.
- **Push Notifications**: Firebase Admin SDK and AWS SNS for transaction and commute alerts.

---

## Architecture & Tech Stack

- **Runtime**: Node.js (`>=18.x`)
- **HTTP Framework**: Express.js with Helmet security headers, Gzip/Deflate compression, and CORS
- **Database**:
  - **AWS DynamoDB** (via AWS SDK v3 `@aws-sdk/client-dynamodb` / `lib-dynamodb`) for document persistence
  - **AWS S3** for media, driver licenses, and document uploads
- **In-Memory Cache & Pub/Sub**: **Redis** (`redis` v4 client) with graceful fallback to in-memory mode when offline
- **Real-Time WebSockets**: Socket.IO & `ws` for tracking and chat servers
- **Payment Processing**: Stripe SDK
- **Push Notifications & Messaging**: Firebase Admin SDK, AWS SNS, Nodemailer
- **Task Scheduling**: `node-cron` for automated recurring billing jobs
- **Process Management**: PM2 cluster configurations

---

## Services & Port Mapping

When started via [server.js](file:///home/andre/Documents/repos/core/server.js), three dedicated servers initialize:

| Service | Port | Description |
| :--- | :--- | :--- |
| **REST API Server** | `3000` (or `process.env.PORT`) | Express API handling authentication, bookings, parents, drivers, payments, webhooks |
| **Ride Tracking Server** | `3020` | WebSocket / Socket.IO service for driver telemetry and real-time route updates |
| **Chat Server** | `3030` (or `process.env.chatPORT`) | Socket.IO messaging service for parent-driver communication |

---

## Prerequisites

- **Node.js**: `v18.x` or higher (tested on Node v18.19.1+)
- **npm**: `v9.x` or higher
- **Redis** *(optional for local dev)*: `v6.x+` or `v7.x` on `redis://127.0.0.1:6379`. The server automatically runs in in-memory mode if Redis is unreachable.
- **AWS Credentials**: An IAM account with DynamoDB, S3, and SNS access permissions.

---

## Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd core
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Either decrypt the included GPG secrets file (if you have the team passphrase) or create `.env` manually:
   ```bash
   # Decrypt encrypted environment file
   ./decrypt.sh
   ```

---

## Environment Configuration

Configure the required environment variables in `.env`:

```env
# Server
PORT=3000
chatPORT=3030
NODE_ENV=development

# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
s3BucketName=schoolryde-s3-bucket-us-east-region
imageURL=https://schoolryde-s3-bucket-us-east-region.s3.amazonaws.com

# Redis
REDIS_URL=redis://127.0.0.1:6379

# Auth & Tokens
jwtSecretToken=your_jwt_secret

# Stripe
stripeKey=sk_test_...
stripePublishKey=pk_test_...

# Firebase
fireBaseDBUrl=https://schoolryde-default-rtdb.firebaseio.com/
```

---

## Running the Application

### Development (Nodemon)
Auto-reloads on file changes:
```bash
npm run start:dev
```

### Direct Node Execution
```bash
npm start
```

### Production / Process Manager (PM2)
Runs with clustered processes defined in [ecosystem.config.js](file:///home/andre/Documents/repos/core/ecosystem.config.js):
```bash
npm run dev        # PM2 development mode
npm run staging    # PM2 staging environment
npm run production # PM2 production environment
```

---

## Testing

Run the automated integration and sanity test suite:
```bash
npm test
```

The test runner ([test/sanity.test.js](file:///home/andre/Documents/repos/core/test/sanity.test.js)) validates:
- Health check and root route responses
- Helmet and compression security headers (`x-powered-by` suppression)
- Route authentication and 404 handlers
- Sliding-window rate limiter throttling
- Redis initialization and fallback handling
- Redis GEO spatial driver location tracking and indexing
- Asynchronous outbox event dispatching and retry handling

---

## Project Structure

```
core/
├── app.js                         # Express application setup, security, docs & router mounts
├── server.js                      # Entry point launching REST (3000), Tracking (3020), & Chat (3030)
├── config/
│   ├── aws.js                     # AWS SDK v3 DynamoDB client & credentials setup
│   └── redis.js                   # Redis client, pub/sub, GEO spatial indexing, and fallbacks
├── middleware/
│   ├── compression.js             # Performance gzip/deflate response compression
│   └── rateLimiter.js             # Sliding-window rate limiter (Redis distributed / in-memory)
├── routes/                        # Modular Express routes
│   ├── auth.js                    # OTP, phone, email authentication
│   ├── booking.js                 # Ride booking endpoints
│   ├── chat.js                    # Chat history & thread routes
│   ├── drivers.js                 # Driver management & location updates
│   ├── parents.js                 # Parent profile & student management
│   ├── payments.js                # Stripe card setup & charge endpoints
│   ├── payout.js                  # Driver earnings and payouts
│   ├── routes.js                  # Route definitions and scheduling
│   ├── servicesArea.js            # Service boundary checks
│   ├── taxiCompany.js             # Fleet/company partner management
│   └── webhook.js                 # Stripe & external webhook receivers
├── services/                      # Business logic & data access
│   ├── outbox.js                  # Resilient async event dispatcher with exponential backoff
│   ├── routeTracking.js           # Real-time WebSocket driver GPS tracking service
│   ├── chat.js                    # Real-time Socket.IO chat service with Redis pub/sub
│   ├── bookings.js                # Booking lifecycle, status transitions, atomic locks
│   ├── drivers.js                 # Driver search, geolib calculations, ratings
│   ├── parents.js                 # Parent operations
│   ├── billings.js                # Recurring billing cron job
│   ├── constants/
│   │   └── appConstants.js        # Centralized DynamoDB table names, HTTP codes, messages
│   └── utils/
│       ├── responseHandler.js     # Standardized JSON response envelope helpers
│       ├── logger.js              # Centralized error, warn, info, debug logger
│       └── userIdChecking.js      # User identity & token validation
├── app/                           # Controller and repository patterns
│   ├── controllers/
│   └── repository/
├── api-docs/                      # OpenAPI 3.0 / Swagger specifications
│   ├── customer-support.yml
│   ├── drivers.yml
│   ├── parents.yml
│   └── web.yml
├── test/
│   └── sanity.test.js             # Automated integration sanity tests
├── ecosystem.config.js            # PM2 cluster configuration
└── decrypt.sh                     # GPG decrypt script for local secrets
```

---

## Core Features & Design Patterns

### 1. Redis Cluster Pub/Sub & Geospatial Tracking
- **Multi-Instance Sync**: Driver location pings and chat messages are broadcast via Redis Pub/Sub so multiple Node.js/PM2 cluster workers stay synchronized.
- **Driver Geo-Indexing**: Driver coordinates are written via `updateDriverLocation` using Redis `GEOADD` into `drivers:locations` and searched with `getNearbyDrivers` (`GEOSEARCH`) within configurable km radii.
- **Resilient Fallback**: If Redis is offline or unreachable, functions log a warning once and safely fall back without throwing unhandled exceptions.

### 2. Asynchronous Outbox Event Dispatcher
Located in [services/outbox.js](file:///home/andre/Documents/repos/core/services/outbox.js):
- Non-critical operations (such as push notifications, analytics, or webhook dispatches during booking confirmations) are dispatched via `enqueueEvent()`.
- Guarantees primary request latencies remain under 50ms.
- Includes automatic retry logic with exponential backoff (`Math.pow(2, attempts) * 200ms`) and dead-letter queue logging after 3 attempts.

### 3. Sliding-Window Rate Limiting
Configured in [middleware/rateLimiter.js](file:///home/andre/Documents/repos/core/middleware/rateLimiter.js):
- Protects brute-force targets like `/sendOtp`, `/verifyOtp`, and `/email/SignIn` (default 30 requests/min).
- Distributed rate limiting via Redis atomic `INCR` + `PEXPIRE` when Redis is available, with sliding bucket in-memory fallback.

### 4. Centralized Constants & Response Envelopes
- Table names, status codes, and user-facing messages live in [services/constants/appConstants.js](file:///home/andre/Documents/repos/core/services/constants/appConstants.js).
- Handlers return standard JSON responses through [services/utils/responseHandler.js](file:///home/andre/Documents/repos/core/services/utils/responseHandler.js):
  - `sendSuccess(res, statusCode, message, data)`
  - `sendBadRequest(res, errorMessage, exception)`
  - `sendUnauthorized(res, errorMessage, exception)`
  - `sendInternalError(res, errorMessage, exception)`

### 5. Graceful Process Shutdown
[server.js](file:///home/andre/Documents/repos/core/server.js) intercepts `SIGINT` and `SIGTERM` signals:
- Stops the recurring billing cron job.
- Closes the REST API, Chat, and Ride Tracking HTTP/WebSocket servers in parallel.
- Provides a 10-second timeout safety net to ensure clean process termination.

---

## API Documentation

Swagger UI interfaces are mounted for distinct client consumers:

| Endpoint | Target Audience | Source Spec |
| :--- | :--- | :--- |
| `http://localhost:3000/api/customer-support` | Support Agents & Operations | `api-docs/customer-support.yml` |
| `http://localhost:3000/api/parents` | Mobile Parent App | `api-docs/parents.yml` |
| `http://localhost:3000/api/drivers` | Mobile Driver App | `api-docs/drivers.yml` |
| `http://localhost:3000/api/web` | Web Admin & Portal | `api-docs/web.yml` |
