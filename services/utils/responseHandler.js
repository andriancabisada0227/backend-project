/**
 * Centralized response handling to ensure consistent API response formats
 */

const { HTTP_STATUS } = require("../constants/appConstants");
const logger = require("./logger");

/**
 * Send a successful response with standard format
 * @param {Object} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Success message
 * @param {Object} data - Optional additional data to include in response
 */
const sendSuccess = (res, statusCode = HTTP_STATUS.OK, message, data = {}) => {
  const response = {
    success: true,
    message,
    ...data,
  };

  return res.status(statusCode).json(response);
};

/**
 * Send an error response with standard format
 * @param {Object} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {string} error - Error message
 * @param {Error} exception - Optional Error object for logging
 */
const sendError = (
  res,
  statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR,
  error,
  exception = null,
) => {
  const response = {
    success: false,
    error,
  };

  // Log the error for debugging
  if (exception) {
    logger.error(`[Status ${statusCode}] ${error}`, exception);
  } else {
    logger.warn(`[Status ${statusCode}] ${error}`);
  }

  return res.status(statusCode).json(response);
};

/**
 * Send a 400 Bad Request error
 */
const sendBadRequest = (res, error, exception = null) => {
  return sendError(res, HTTP_STATUS.BAD_REQUEST, error, exception);
};

/**
 * Send a 401 Unauthorized error
 */
const sendUnauthorized = (res, error, exception = null) => {
  return sendError(res, HTTP_STATUS.UNAUTHORIZED, error, exception);
};

/**
 * Send a 409 Conflict error
 */
const sendConflict = (res, error, exception = null) => {
  return sendError(res, HTTP_STATUS.CONFLICT, error, exception);
};

/**
 * Send a 500 Internal Server Error
 */
const sendInternalError = (res, error, exception = null) => {
  return sendError(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, error, exception);
};

module.exports = {
  sendSuccess,
  sendError,
  sendBadRequest,
  sendUnauthorized,
  sendConflict,
  sendInternalError,
};
