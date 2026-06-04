/**
 * Application-wide constants for DynamoDB tables, timeouts, and configuration
 */

module.exports = {
  // DynamoDB Table Names
  TABLES: {
    SIGNUP: "signupTable",
    PARENTS: "parentsTable",
    DRIVERS: "driversTable",
    BOOKINGS: "bookingsTable",
    SCHEDULES: "schedulesTable",
    STUDENTS: "studentsTable",
    TAXI: "taxiTable",
    WHITELIST: "whiteListTable",
    INVALID_TOKENS: "invalidTokensTable",
  },

  // OTP Configuration
  OTP: {
    LENGTH: 4,
    EXPIRY_SECONDS: 300, // 5 minutes
  },

  // JWT Configuration
  JWT: {
    EXPIRY_SECONDS: 28800, // 8 hours
    EXPIRY_STRING: "28800s",
  },

  // Role Constants
  ROLES: {
    PARENT: "PARENT",
    DRIVER: "DRIVER",
    TAXI_COMPANY: "TAXI_COMPANY",
  },

  // HTTP Status Codes
  HTTP_STATUS: {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    CONFLICT: 409,
    INTERNAL_SERVER_ERROR: 500,
  },

  // Error Messages
  ERROR_MESSAGES: {
    PHONE_NOT_REGISTERED:
      "Phone number is not registered. Please sign up first.",
    INVALID_ROLE_MISMATCH:
      "Role does not match. Please complete sign up first.",
    PHONE_NOT_FOUND: "Phone number not found.",
    INVALID_OTP: "Invalid OTP.",
    OTP_EXPIRED: "OTP has expired.",
    EMAIL_NOT_FOUND: "Email address not found.",
    PASSWORD_INCORRECT: "Password is incorrect.",
    INVALID_EMAIL: "Invalid or missing email.",
    INVALID_TAXI_CODE: "Invalid or missing taxi code.",
    WEAK_PASSWORD: "Password is weak.",
    EMAIL_EXISTS: "Email already exists.",
    PHONE_EXISTS: "Phone number already exists.",
    FAILED_TO_SEND_OTP: "Failed to send OTP.",
    FAILED_TO_VERIFY_OTP: "Failed to verify OTP.",
    INTERNAL_ERROR: "An unexpected error occurred. Please try again later.",
    INVALID_USER_ID: "Invalid user ID.",
    USER_NOT_FOUND: "User not found.",
    NO_ZIPCODE: "User has no zipcode configured.",
    NO_TAXI_SERVICES: "No taxi services available in your zipcode.",
    DRIVER_NOT_FOUND: "Driver not found.",
    NO_ACTIVE_BOOKING: "No active booking found.",
    INVALID_COORDINATES: "Invalid geolocation coordinates.",
    EMPTY_LIST: "No results found.",
  },

  // Success Messages
  SUCCESS_MESSAGES: {
    OTP_SENT_REGISTRATION:
      "OTP sent successfully for phone number verification.",
    OTP_SENT_SIGNIN: "OTP sent successfully for sign in.",
    OTP_RESENT: "OTP successfully resent.",
    PHONE_VERIFIED: "Phone number verified successfully.",
    SIGNIN_SUCCESS: "Successfully signed in using phone number.",
    EMAIL_SIGNUP_SUCCESS: "Email sign up successful.",
    EMAIL_VERIFICATION_RESENT: "Email verification code successfully resent.",
    EMAIL_ALREADY_VERIFIED: "Email already verified. You can now sign in.",
    DRIVERS_RETRIEVED: "Drivers retrieved successfully.",
    DRIVER_PROFILE_RETRIEVED: "Driver profile retrieved successfully.",
    DRIVER_LOCATION_UPDATED: "Driver location updated successfully.",
    DRIVER_CREATED: "Driver created successfully.",
    LOGGED_OUT: "Successfully logged out.",
  },
};
