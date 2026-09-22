#  Backend App Project

The backend App Project service for the platform. Built with **Node.js**, **Express**, **AWS DynamoDB**, **Firebase Cloud Messaging**, **Stripe**, and **Socket.io**.

---

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Installation & Setup](#installation--setup)
- [Running the Application](#running-the-application)
- [Project Architecture & Structure](#project-architecture--structure)
- [Coding Standards & Conventions](#coding-standards--conventions)
- [API Documentation](#api-documentation)

---

## Overview

Backend App manages driver and parent onboarding, route tracking, ride bookings, payment processing, student scheduling, real-time messaging, and push notifications.

Key integrations:
- **AWS DynamoDB**: Main database engine for JSON documents and table stores.
- **Stripe**: Payment processing and customer management.
- **Firebase Admin SDK / SNS**: Mobile push notifications.
- **Socket.IO / WebSockets**: Real-time driver location tracking and chat communication.

---

## Prerequisites

- **Node.js**: `v18.x` or higher (tested on Node v18.19.1)
- **npm**: `v9.x` or higher
- **AWS Credentials**: Configured locally or via environment variables for DynamoDB and S3 access.

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
   Decrypt the included GPG env file or create a `.env` file in the root directory:
   ```bash
   # Decrypt encrypted environment file (requires passphrase)
   ./decrypt.sh
   ```
   Or create `.env` manually with key parameters:
   ```env
   PORT=3000
   NODE_ENV=development
   AWS_REGION=us-east-1
   AWS_ACCESS_KEY_ID=your_access_key
   AWS_SECRET_ACCESS_KEY=your_secret_key
   stripeKey=your_stripe_secret_key
   JWT_SECRET=your_jwt_secret
   DEBUG_MODE=true
   ```

---

## Running the Application

### Development Mode
Runs the server with `nodemon` for auto-reloading:
```bash
npm run start:dev
```

### Direct Execution
```bash
npm start
```

### Production / Process Manager (PM2)
```bash
npm run dev        # Launch via PM2 configuration
npm run staging    # PM2 staging environment
npm run production # PM2 production environment
```

---

## Project Architecture & Structure

```
core/
├── app.js                         # Main Express application initialization & middleware
├── server.js                      # HTTP server entry point & WebSocket setup
├── config/
│   └── aws.js                     # AWS SDK & DynamoDB client configuration
├── routes/                        # Express API route modules
│   ├── auth.js
│   ├── booking.js
│   ├── chat.js
│   ├── drivers.js
│   ├── parents.js
│   ├── payments.js
│   └── ...
├── services/                      # Core business logic & DynamoDB handlers
│   ├── constants/
│   │   └── appConstants.js        # Centralized constants, table names, status codes, messages
│   ├── utils/
│   │   ├── responseHandler.js     # Standardized HTTP response utilities
│   │   ├── logger.js              # Centralized logging service
│   │   └── userIdChecking.js      # User validation utilities
│   ├── drivers.js                 # Driver management, geolocation search, reviews
│   ├── parents.js                 # Parent accounts, student associations, locations
│   ├── bookings.js                # Ride bookings & scheduling flow
│   ├── chat.js                    # Messaging service
│   └── whiteList.js               # Service area whitelisting logic
├── app/                           # Repository and service pattern layers
│   ├── controllers/
│   ├── repository/
│   └── services/
├── api-docs/                      # OpenAPI / Swagger specification files
   ├── drivers.yml
   ├── parents.yml
   ├── customer-support.yml
   └── web.yml
```

---

## Coding Standards & Conventions

All services follow these design patterns:

### 1. Centralized Constants (`services/constants/appConstants.js`)
All DynamoDB table names, HTTP status codes, and error/success response messages are managed in `appConstants.js`.

### 2. Standardized Response Handling (`services/utils/responseHandler.js`)
Endpoints return consistent JSON envelopes using response helper functions:
- `sendSuccess(res, statusCode, message, data)`
- `sendBadRequest(res, errorMessage, exception)`
- `sendUnauthorized(res, errorMessage, exception)`
- `sendInternalError(res, errorMessage, exception)`

### 3. Structured Logging (`services/utils/logger.js`)
All exceptions and operational events are logged through `logger.error()`, `logger.info()`, `logger.warn()`, and `logger.debug()`.

---

## API Documentation

OpenAPI / Swagger specs are located in `api-docs/`. When running the server, Swagger UI documentation is available at:
`http://localhost:3000/api-docs`


