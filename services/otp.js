const { dynamoClient, snsClient } = require("../config/aws");
const { PublishCommand } = require("@aws-sdk/client-sns");
const {
  UpdateCommand,
  PutCommand,
  DynamoDBDocumentClient,
  ScanCommand,
} = require("@aws-sdk/lib-dynamodb");
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const dynamoDocumentClient = DynamoDBDocumentClient.from(dynamoClient);
const appConstants = require("./constants/appConstants");
const crypto = require("crypto");
const { sendSuccess, sendBadRequest, sendInternalError } = require("./utils/responseHandler");
const logger = require("./utils/logger");

/**
 * Generate a random OTP with specified length using CSPRNG
 * @returns {string} Random OTP
 */
const generateOtp = () => {
  const min = Math.pow(10, appConstants.OTP.LENGTH - 1);
  const max = Math.pow(10, appConstants.OTP.LENGTH);
  return crypto.randomInt(min, max).toString();
};

/**
 * @swagger
 * /sendOtp:
 *   post:
 *     summary: Send OTP for Phone Number Verification or Resend OTP
 *     description: This endpoint sends an OTP (One Time Password) for phone number verification or sign in.
 *     tags:
 *      - OTP
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 description: The phone number to which the OTP should be sent.
 *     responses:
 *       201:
 *         description: OTP sent successfully for new user registration or phone number verification.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       200:
 *         description: OTP sent successfully for existing user sign-in.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Bad Request - Phone number does not exist or other errors.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 error:
 *                   type: string
 *       500:
 *         description: Internal Server Error - Failed to send OTP.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 error:
 *                   type: string
 */
const sendOtp = async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    const userRole = req.query.role;

    if (!phoneNumber) {
      return sendBadRequest(res, appConstants.ERROR_MESSAGES.PHONE_NOT_FOUND);
    }

    logger.info("Attempting to send OTP", { phoneNumber, role: userRole });

    const phoneParams = {
      TableName: appConstants.TABLES.SIGNUP,
      FilterExpression: "#pn = :phoneVal",
      ExpressionAttributeNames: {
        "#pn": "phoneNumber",
      },
      ExpressionAttributeValues: {
        ":phoneVal": phoneNumber,
      },
    };

    const scanCommand = new ScanCommand(phoneParams);
    const result = await dynamoDocumentClient.send(scanCommand);

    // Phone number not registered
    if (result.Items.length === 0) {
      return sendBadRequest(res, appConstants.ERROR_MESSAGES.PHONE_NOT_REGISTERED);
    }

    const user = result.Items[0];

    // Verify role matches
    if (userRole && userRole !== user.role) {
      return sendBadRequest(res, appConstants.ERROR_MESSAGES.INVALID_ROLE_MISMATCH);
    }

    // Generate OTP and prepare SNS message
    const otp = generateOtp();
    logger.debug("Generated OTP for phone number", { phoneNumber });

    const otpParams = {
      Message: `Your OTP is: ${otp}`,
      PhoneNumber: phoneNumber,
    };

    // Send OTP via SNS
    const command = new PublishCommand(otpParams);
    await snsClient.send(command);
    logger.info("OTP sent successfully via SNS", { phoneNumber });

    // Calculate TTL (expiry time)
    const ttl = Math.floor(Date.now() / 1000) + appConstants.OTP.EXPIRY_SECONDS;

    // Update user record with new OTP and TTL
    const updateParams = {
      TableName: appConstants.TABLES.SIGNUP,
      Key: {
        id: user.id,
      },
      UpdateExpression: "SET #ttlAttr = :ttl, #otpAttr = :otp",
      ExpressionAttributeNames: {
        "#ttlAttr": "ttl",
        "#otpAttr": "otp",
      },
      ExpressionAttributeValues: {
        ":ttl": ttl,
        ":otp": otp,
      },
    };

    const updateCommand = new UpdateCommand(updateParams);
    await dynamoDocumentClient.send(updateCommand);

    // Determine appropriate success message
    const message = user.isVerified
      ? appConstants.SUCCESS_MESSAGES.OTP_SENT_SIGNIN
      : appConstants.SUCCESS_MESSAGES.OTP_RESENT;

    return sendSuccess(res, appConstants.HTTP_STATUS.OK, message);
  } catch (error) {
    logger.error("Failed to send OTP", error);
    return sendInternalError(res, appConstants.ERROR_MESSAGES.FAILED_TO_SEND_OTP, error);
  }
};

/**
 * @swagger
 * /verifyOtp:
 *   post:
 *     summary: Verify OTP for Phone Number
 *     description: This endpoint verifies an OTP (One Time Password) sent to a user's phone number for registration or sign-in purposes.
 *     tags:
 *      - OTP
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *               - otp
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 description: The phone number to be verified.
 *               otp:
 *                 type: string
 *                 description: The OTP sent to the phone number.
 *     responses:
 *       200:
 *         description: Phone number verified successfully or successful sign-in using phone number.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 token:
 *                   type: string
 *                 expiration:
 *                   type: string
 *                 userId:
 *                   type: string
 *       400:
 *         description: Bad Request - Phone number doesn't exist, invalid OTP, or OTP has expired.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 error:
 *                   type: string
 *       500:
 *         description: Internal Server Error - Failed to verify OTP.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 error:
 *                   type: string
 */
const verifyOtp = async (req, res) => {
  try {
    const { phoneNumber, otp } = req.body;

    if (!phoneNumber || !otp) {
      return sendBadRequest(res, appConstants.ERROR_MESSAGES.PHONE_NOT_FOUND);
    }

    logger.info("Verifying OTP", { phoneNumber });

    const phoneParams = {
      TableName: appConstants.TABLES.SIGNUP,
      FilterExpression: "#pn = :phoneVal",
      ExpressionAttributeNames: {
        "#pn": "phoneNumber",
      },
      ExpressionAttributeValues: {
        ":phoneVal": phoneNumber,
      },
    };

    const queryCommand = new ScanCommand(phoneParams);
    const result = await dynamoDocumentClient.send(queryCommand);

    if (result.Items.length === 0) {
      return sendBadRequest(res, appConstants.ERROR_MESSAGES.PHONE_NOT_FOUND);
    }

    const user = result.Items[0];
    const currentTime = Math.floor(Date.now() / 1000);

    // Validate OTP
    if (user.otp !== otp) {
      logger.warn("Invalid OTP provided", { phoneNumber });
      return sendBadRequest(res, appConstants.ERROR_MESSAGES.INVALID_OTP);
    }

    // Check if OTP has expired
    if (currentTime > user.ttl) {
      logger.warn("OTP has expired", { phoneNumber });
      return sendBadRequest(res, appConstants.ERROR_MESSAGES.OTP_EXPIRED);
    }

    // Verify phone number if not already verified
    if (!user.isVerified) {
      const updateParams = {
        TableName: appConstants.TABLES.SIGNUP,
        Key: {
          id: user.id,
        },
        UpdateExpression: "SET #isVerifiedAttr = :isVerified REMOVE #otp",
        ExpressionAttributeNames: {
          "#isVerifiedAttr": "isVerified",
          "#otp": "otp",
        },
        ExpressionAttributeValues: {
          ":isVerified": true,
        },
      };

      const updateCommand = new UpdateCommand(updateParams);
      await dynamoDocumentClient.send(updateCommand);

      logger.info("Phone number verified successfully", { phoneNumber, userId: user.id });

      const token = jwt.sign(
        { id: user.id, userId: user.id, phoneNumber, role: user.role || "" },
        process.env.jwtSecretToken,
        {
          expiresIn: appConstants.JWT.EXPIRY_STRING,
        }
      );

      return sendSuccess(res, appConstants.HTTP_STATUS.OK, appConstants.SUCCESS_MESSAGES.PHONE_VERIFIED, {
        token,
        expiration: appConstants.JWT.EXPIRY_SECONDS.toString(),
        userId: user.id,
      });
    }

    // Invalidate OTP immediately to prevent reuse
    const clearOtpParams = {
      TableName: appConstants.TABLES.SIGNUP,
      Key: {
        id: user.id,
      },
      UpdateExpression: "REMOVE #otp",
      ExpressionAttributeNames: {
        "#otp": "otp",
      },
    };
    await dynamoDocumentClient.send(new UpdateCommand(clearOtpParams));

    // User already verified - handle sign in
    logger.info("Attempting sign in with verified phone number", { phoneNumber, userId: user.id });

    // Check parent table
    const parentParams = {
      TableName: appConstants.TABLES.PARENTS,
      FilterExpression: "#userId = :userId",
      ExpressionAttributeNames: {
        "#userId": "userId",
      },
      ExpressionAttributeValues: {
        ":userId": user.id,
      },
    };

    const parentCommand = new ScanCommand(parentParams);
    const parentResult = await dynamoDocumentClient.send(parentCommand);

    if (parentResult.Items.length > 0) {
      const parentData = parentResult.Items[0];
      const token = jwt.sign(
        { id: user.id, userId: user.id, phoneNumber, role: "PARENT" },
        process.env.jwtSecretToken,
        {
          expiresIn: appConstants.JWT.EXPIRY_STRING,
        }
      );

      return sendSuccess(res, appConstants.HTTP_STATUS.OK, appConstants.SUCCESS_MESSAGES.SIGNIN_SUCCESS, {
        token,
        expiration: appConstants.JWT.EXPIRY_SECONDS.toString(),
        userId: user.id,
        customerId: parentData?.customerId ?? "",
        parentId: parentData.id,
      });
    }

    // Check driver table
    const driverParams = {
      TableName: appConstants.TABLES.DRIVERS,
      FilterExpression: "#userId = :userId",
      ExpressionAttributeNames: {
        "#userId": "userId",
      },
      ExpressionAttributeValues: {
        ":userId": user.id,
      },
    };

    const driverCommand = new ScanCommand(driverParams);
    const driverResult = await dynamoDocumentClient.send(driverCommand);

    if (driverResult.Items.length > 0) {
      const driverData = driverResult.Items[0];
      const token = jwt.sign(
        { id: user.id, userId: user.id, phoneNumber, role: "DRIVER" },
        process.env.jwtSecretToken,
        {
          expiresIn: appConstants.JWT.EXPIRY_STRING,
        }
      );

      return sendSuccess(res, appConstants.HTTP_STATUS.OK, appConstants.SUCCESS_MESSAGES.SIGNIN_SUCCESS, {
        token,
        expiration: appConstants.JWT.EXPIRY_SECONDS.toString(),
        userId: user.id,
        customerId: driverData?.customerId ?? "",
        driverId: driverData.id,
      });
    }

    // No parent or driver record found - still allow sign in
    const token = jwt.sign(
      { id: user.id, userId: user.id, phoneNumber, role: user.role || "" },
      process.env.jwtSecretToken,
      {
        expiresIn: appConstants.JWT.EXPIRY_STRING,
      }
    );

    return sendSuccess(res, appConstants.HTTP_STATUS.OK, appConstants.SUCCESS_MESSAGES.SIGNIN_SUCCESS, {
      token,
      expiration: appConstants.JWT.EXPIRY_SECONDS.toString(),
      userId: user.id,
    });
  } catch (error) {
    logger.error("Failed to verify OTP", error);
    return sendInternalError(res, appConstants.ERROR_MESSAGES.FAILED_TO_VERIFY_OTP, error);
  }
};

module.exports = { sendOtp, verifyOtp };
