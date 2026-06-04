const { dynamoClient, snsClient } = require("../config/aws");
const { PublishCommand } = require("@aws-sdk/client-sns");
const { sendVerificationEmail } = require("../mailer");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const {
  PutCommand,
  GetCommand,
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");

const {
  isValidEmailFormat,
  generateToken,
  isWeakPassword,
  phoneNumberExists,
  emailExists,
} = require("./utils/email.utils");

const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

const { checkUserId } = require("./utils/userIdChecking");
const appConstants = require("./constants/appConstants");
const { sendSuccess, sendBadRequest, sendUnauthorized, sendConflict, sendInternalError, sendError } = require("./utils/responseHandler");
const logger = require("./utils/logger");

const dynamoDocumentClient = DynamoDBDocumentClient.from(dynamoClient);

const validateUserInput = async ({ email, password, phoneNumber, taxiCode, role }) => {
  if (!email || !isValidEmailFormat(email)) {
    return { status: appConstants.HTTP_STATUS.BAD_REQUEST, message: appConstants.ERROR_MESSAGES.INVALID_EMAIL };
  }

  if (role === appConstants.ROLES.DRIVER) {
    if (!taxiCode || !isValidEmailFormat(taxiCode)) {
      return { status: appConstants.HTTP_STATUS.BAD_REQUEST, message: appConstants.ERROR_MESSAGES.INVALID_TAXI_CODE };
    }
  }

  if (password && isWeakPassword(password)) {
    return { status: appConstants.HTTP_STATUS.BAD_REQUEST, message: appConstants.ERROR_MESSAGES.WEAK_PASSWORD };
  }

  try {
    if (
      (await emailExists(email)) &&
      password !== undefined &&
      phoneNumber !== undefined
    ) {
      return { status: appConstants.HTTP_STATUS.CONFLICT, message: appConstants.ERROR_MESSAGES.EMAIL_EXISTS };
    }

    if (phoneNumber && (await phoneNumberExists(phoneNumber))) {
      return { status: appConstants.HTTP_STATUS.CONFLICT, message: appConstants.ERROR_MESSAGES.PHONE_EXISTS };
    }
  } catch (error) {
    logger.error("Validation error", error);
    return { status: appConstants.HTTP_STATUS.INTERNAL_SERVER_ERROR, message: appConstants.ERROR_MESSAGES.INTERNAL_ERROR };
  }

  return { status: appConstants.HTTP_STATUS.OK, message: "Validation successful" };
};

const emailRegisterSignIn = async (req, res) => {
  try {
    const { email, password, phoneNumber, taxiCode } = req.body;
    const userRole = req.body.role || appConstants.ROLES.PARENT;

    logger.info("Email registration/sign-in attempt", { email, role: userRole });

    const validationResult = await validateUserInput({
      email,
      password,
      phoneNumber,
      taxiCode,
      role: userRole,
    });

    if (validationResult.status !== appConstants.HTTP_STATUS.OK) {
      const statusCode = validationResult.status === appConstants.HTTP_STATUS.CONFLICT
        ? appConstants.HTTP_STATUS.CONFLICT
        : appConstants.HTTP_STATUS.BAD_REQUEST;
      return sendError(res, statusCode, validationResult.message);
    }

    const emailParams = {
      TableName: appConstants.TABLES.SIGNUP,
      FilterExpression: "#email = :email",
      ExpressionAttributeNames: {
        "#email": "email",
      },
      ExpressionAttributeValues: {
        ":email": email,
      },
    };

    const scanCommand = new ScanCommand(emailParams);
    const result = await dynamoDocumentClient.send(scanCommand);

    if (result.Items.length === 0) {
      const hashedPassword = await bcrypt.hash(password, 10);
      const verificationToken = generateToken();

      try {
        await sendVerificationEmail(
          email,
          "Verify your email address",
          "Your verification code is: ",
          verificationToken
        );
        logger.info("Verification email sent", { email });
      } catch (error) {
        logger.error("Failed to send verification email", error);
      }

      const params = {
        TableName: appConstants.TABLES.SIGNUP,
        Item: {
          id: uuidv4(),
          email,
          phoneNumber,
          password: hashedPassword,
          verificationToken,
          isVerified: false,
          imageBase64: "",
          imageUrl: "",
          taxiCode: taxiCode || "",
          role: userRole,
        },
      };

      const saveCommand = new PutCommand(params);
      await dynamoDocumentClient.send(saveCommand);

      logger.info("New user registered", { email, role: userRole });

      return sendSuccess(res, appConstants.HTTP_STATUS.CREATED, appConstants.SUCCESS_MESSAGES.EMAIL_SIGNUP_SUCCESS, {
        isVerified: false,
      });
    }

    const user = result.Items[0];

    if (!user.isVerified) {
      const verificationToken = generateToken();

      try {
        await sendVerificationEmail(
          email,
          "Verify your email address",
          "Your verification code is: ",
          verificationToken
        );
      } catch (error) {
        logger.error("Failed to send verification email", error);
      }

      const updateParams = {
        TableName: appConstants.TABLES.SIGNUP,
        Key: {
          id: user.id,
        },
        UpdateExpression: "SET #verificationTokenAttr = :verificationToken",
        ExpressionAttributeNames: {
          "#verificationTokenAttr": "verificationToken",
        },
        ExpressionAttributeValues: {
          ":verificationToken": verificationToken,
        },
      };

      const updateCommand = new UpdateCommand(updateParams);
      await dynamoDocumentClient.send(updateCommand);

      logger.info("Verification code resent", { email });

      return sendSuccess(res, appConstants.HTTP_STATUS.OK, appConstants.SUCCESS_MESSAGES.EMAIL_VERIFICATION_RESENT);
    }

    logger.info("Email already verified, user can sign in", { email });
    return sendSuccess(res, appConstants.HTTP_STATUS.OK, appConstants.SUCCESS_MESSAGES.EMAIL_ALREADY_VERIFIED);
  } catch (error) {
    logger.error("Email registration/sign-in error", error);
    return sendInternalError(res, appConstants.ERROR_MESSAGES.INTERNAL_ERROR, error);
  }
};

const emailSignIn = async (req, res) => {
  try {
    const { email, password } = req.body;
    const userRole = req.query.role;

    if (!email || !password) {
      return sendBadRequest(res, appConstants.ERROR_MESSAGES.EMAIL_NOT_FOUND);
    }

    logger.info("Email sign-in attempt", { email });

    const emailParams = {
      TableName: appConstants.TABLES.SIGNUP,
      FilterExpression: "#email = :email",
      ExpressionAttributeNames: {
        "#email": "email",
      },
      ExpressionAttributeValues: {
        ":email": email,
      },
    };

    const scanCommand = new ScanCommand(emailParams);
    const result = await dynamoDocumentClient.send(scanCommand);

    if (result.Items.length === 0) {
      return sendBadRequest(res, appConstants.ERROR_MESSAGES.EMAIL_NOT_FOUND);
    }

    const user = result.Items[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      logger.warn("Password mismatch for email", { email });
      return sendUnauthorized(res, appConstants.ERROR_MESSAGES.PASSWORD_INCORRECT);
    }

    if (!user.isVerified) {
      logger.info("Email not yet verified", { email });
      return sendSuccess(res, appConstants.HTTP_STATUS.OK, "Email not yet verified", { isVerified: false });
    }

    if (userRole && userRole !== user.role) {
      return sendBadRequest(res, appConstants.ERROR_MESSAGES.INVALID_ROLE_MISMATCH);
    }

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

    let customerId = "";
    let driverId = "";
    let parentId = "";

    if (parentResult.Items.length > 0) {
      customerId = parentResult.Items[0].customerId || "";
      parentId = parentResult.Items[0].id;
    } else {
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
        customerId = driverResult.Items[0].customerId || "";
        driverId = driverResult.Items[0].id;
      }
    }

    const token = jwt.sign({ email }, process.env.jwtSecretToken, {
      expiresIn: appConstants.JWT.EXPIRY_STRING,
    });

    logger.info("Email sign-in successful", { email, userId: user.id });

    const responseData = {
      token,
      expiration: appConstants.JWT.EXPIRY_SECONDS.toString(),
      userId: user.id,
      customerId,
      role: user.role || "",
    };

    if (parentId) {
      responseData.parentId = parentId;
    }
    if (driverId) {
      responseData.driverId = driverId;
    }

    return sendSuccess(res, appConstants.HTTP_STATUS.OK, "Successfully signed in", responseData);
  } catch (error) {
    logger.error("Email sign-in error", error);
    return sendInternalError(res, appConstants.ERROR_MESSAGES.INTERNAL_ERROR, error);
  }
};

const emailVerification = async (req, res) => {
  try {
    const { email, token: verificationToken } = req.body;

    if (!email || !verificationToken) {
      return sendBadRequest(res, "Email and verification token are required");
    }

    logger.info("Email verification attempt", { email });

    const emailParams = {
      TableName: appConstants.TABLES.SIGNUP,
      FilterExpression: "#em = :emailVal",
      ExpressionAttributeNames: {
        "#em": "email",
      },
      ExpressionAttributeValues: {
        ":emailVal": email,
      },
    };

    const command = new ScanCommand(emailParams);
    const userData = await dynamoDocumentClient.send(command);

    if (userData.Items.length === 0 || userData.Items[0].verificationToken !== verificationToken) {
      logger.warn("Invalid verification token", { email });
      return sendUnauthorized(res, "Invalid verification token");
    }

    const user = userData.Items[0];

    if (user.isVerified) {
      return sendBadRequest(res, "Email already verified");
    }

    const updateParams = {
      TableName: appConstants.TABLES.SIGNUP,
      Key: {
        id: user.id,
      },
      UpdateExpression:
        "SET #verificationTokenAttr = :verificationToken, #isVerifiedAttr = :isVerified",
      ExpressionAttributeNames: {
        "#verificationTokenAttr": "verificationToken",
        "#isVerifiedAttr": "isVerified",
      },
      ExpressionAttributeValues: {
        ":verificationToken": "",
        ":isVerified": true,
      },
    };

    const updateCommand = new UpdateCommand(updateParams);
    await dynamoDocumentClient.send(updateCommand);

    const authToken = jwt.sign({ email }, process.env.jwtSecretToken, {
      expiresIn: appConstants.JWT.EXPIRY_STRING,
    });

    logger.info("Email successfully verified", { email, userId: user.id });

    return sendSuccess(res, appConstants.HTTP_STATUS.OK, "Email successfully verified!", {
      token: authToken,
      expiration: appConstants.JWT.EXPIRY_SECONDS.toString(),
      userId: user.id,
    });
  } catch (error) {
    logger.error("Email verification error", error);
    return sendInternalError(res, "Could not verify email", error);
  }
};

const changePassword = async (req, res) => {
  try {
    if (await checkUserId(req.header("UserId"))) {
      return sendBadRequest(res, "Invalid User ID");
    }

    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return sendBadRequest(res, "Both old and new passwords are required");
    }

    const params = {
      TableName: appConstants.TABLES.SIGNUP,
      Key: {
        id: req.header("UserId"),
      },
    };

    const getCommand = new GetCommand(params);
    const userData = await dynamoDocumentClient.send(getCommand);

    if (!userData.Item) {
      return sendBadRequest(res, "User not found");
    }

    const match = await bcrypt.compare(oldPassword, userData.Item.password);
    if (!match) {
      logger.warn("Incorrect password attempt", { userId: req.header("UserId") });
      return sendUnauthorized(res, appConstants.ERROR_MESSAGES.PASSWORD_INCORRECT);
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const updateParams = {
      TableName: appConstants.TABLES.SIGNUP,
      Key: {
        id: req.header("UserId"),
      },
      UpdateExpression: "set password = :pass",
      ExpressionAttributeValues: {
        ":pass": hashedPassword,
      },
    };

    const updateCommand = new UpdateCommand(updateParams);
    await dynamoDocumentClient.send(updateCommand);

    logger.info("Password changed successfully", { userId: req.header("UserId") });

    return sendSuccess(res, appConstants.HTTP_STATUS.OK, "Password successfully changed");
  } catch (error) {
    logger.error("Error in changePassword", error);
    return sendInternalError(res, appConstants.ERROR_MESSAGES.INTERNAL_ERROR, error);
  }
};

const logout = async (req, res) => {
  try {
    if (await checkUserId(req.header("UserId"))) {
      return sendBadRequest(res, "Invalid User ID");
    }

    const token = req.header("Authorization");
    const decoded = jwt.decode(token);

    if (!decoded) {
      return sendBadRequest(res, "Invalid token");
    }

    const params = {
      TableName: "invalidTokensTable",
      Item: {
        id: uuidv4(),
        authorization: token,
        userId: req.header("UserId"),
        date: Math.floor(new Date().getTime() / 1000),
      },
    };

    const putCommand = new PutCommand(params);
    await dynamoDocumentClient.send(putCommand);

    logger.info("User logged out successfully", { userId: req.header("UserId") });

    return sendSuccess(res, appConstants.HTTP_STATUS.OK, "Successfully logged out");
  } catch (error) {
    logger.error("Logout error", error);
    return sendInternalError(res, appConstants.ERROR_MESSAGES.INTERNAL_ERROR, error);
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email, url } = req.body;

    if (!email) {
      return sendBadRequest(res, "Email is required");
    }

    logger.info("Forgot password request", { email });

    const params = {
      TableName: appConstants.TABLES.SIGNUP,
      FilterExpression: "#email = :email",
      ExpressionAttributeNames: {
        "#email": "email",
      },
      ExpressionAttributeValues: {
        ":email": email,
      },
    };

    const scanCommand = new ScanCommand(params);
    const result = await dynamoDocumentClient.send(scanCommand);

    if (result.Items.length === 0) {
      return sendBadRequest(res, appConstants.ERROR_MESSAGES.EMAIL_NOT_FOUND);
    }

    if (!result.Items[0].isVerified) {
      return sendBadRequest(res, "Email address not verified");
    }

    const emailParam = encodeURIComponent(url || "");

    await sendVerificationEmail(
      email,
      "Forgot Password",
      "To update your password click the link here: ",
      emailParam
    );

    logger.info("Forgot password email sent", { email });

    return sendSuccess(res, appConstants.HTTP_STATUS.OK, "Password reset link sent to your email");
  } catch (error) {
    logger.error("Forgot password error", error);
    return sendInternalError(res, appConstants.ERROR_MESSAGES.INTERNAL_ERROR, error);
  }
};

const requestUpdateEmailOrPhone = async (req, res) => {
  try {
    if (await checkUserId(req.header("UserId"))) {
      return sendBadRequest(res, "Invalid User ID");
    }

    const { email, phoneNumber } = req.body;

    if (!email && !phoneNumber) {
      return sendBadRequest(res, "Email or phone number is required");
    }

    const params = {
      TableName: appConstants.TABLES.SIGNUP,
      Key: {
        id: req.header("UserId"),
      },
    };

    const getCommand = new GetCommand(params);
    const result = await dynamoDocumentClient.send(getCommand);

    if (!result.Item) {
      return sendBadRequest(res, "Account not found");
    }

    const updateField = email ? "#email" : "#phoneNumber";
    const attrValue = email ? ":email" : ":phoneNumber";
    const baseUpdate = email ? "Email" : "Phone Number";

    const updateParams = {
      TableName: appConstants.TABLES.SIGNUP,
      Key: {
        id: result.Item.id,
      },
      UpdateExpression: `SET ${updateField} = ${attrValue}`,
      ExpressionAttributeNames: {
        [updateField]: email ? "email" : "phoneNumber",
      },
      ExpressionAttributeValues: {
        [attrValue]: email || phoneNumber,
      },
    };

    const updateCommand = new UpdateCommand(updateParams);
    await dynamoDocumentClient.send(updateCommand);

    logger.info(`${baseUpdate} updated successfully`, { userId: req.header("UserId") });

    return sendSuccess(res, appConstants.HTTP_STATUS.OK, `${baseUpdate} successfully updated!`);
  } catch (error) {
    logger.error("Update email/phone error", error);
    return sendInternalError(res, appConstants.ERROR_MESSAGES.INTERNAL_ERROR, error);
  }
};

const updateEmailOrPhone = async (req, res) => {
  try {
    if (await checkUserId(req.header("UserId"))) {
      return sendBadRequest(res, "Invalid User ID");
    }

    const { email, phoneNumber, code } = req.body;

    if (!email && !phoneNumber) {
      return sendBadRequest(res, "Email or phone number is required");
    }

    if (!code) {
      return sendBadRequest(res, "Verification code is required");
    }

    const params = {
      TableName: appConstants.TABLES.SIGNUP,
      Key: {
        id: req.header("UserId"),
      },
    };

    const getCommand = new GetCommand(params);
    const result = await dynamoDocumentClient.send(getCommand);

    if (!result.Item) {
      return sendBadRequest(res, "Account not found");
    }

    const user = result.Item;

    if (user.verificationToken !== code) {
      logger.warn("Invalid verification code", { userId: req.header("UserId") });
      return sendBadRequest(res, "Invalid verification code");
    }

    const updateField = email ? "#email" : "#phoneNumber";
    const attrValue = email ? ":email" : ":phoneNumber";
    const baseUpdate = email ? "Email" : "Phone Number";

    const updateParams = {
      TableName: appConstants.TABLES.SIGNUP,
      Key: {
        id: user.id,
      },
      UpdateExpression: `SET ${updateField} = ${attrValue}`,
      ExpressionAttributeNames: {
        [updateField]: email ? "email" : "phoneNumber",
      },
      ExpressionAttributeValues: {
        [attrValue]: email || phoneNumber,
      },
    };

    const updateCommand = new UpdateCommand(updateParams);
    await dynamoDocumentClient.send(updateCommand);

    logger.info(`${baseUpdate} updated after verification`, { userId: req.header("UserId") });

    return sendSuccess(res, appConstants.HTTP_STATUS.OK, `${baseUpdate} successfully updated!`);
  } catch (error) {
    logger.error("Update email/phone verification error", error);
    return sendInternalError(res, appConstants.ERROR_MESSAGES.INTERNAL_ERROR, error);
  }
};

const updatePassword = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email) {
      return sendBadRequest(res, "Email is required");
    }

    if (!password) {
      return sendBadRequest(res, "Password is required");
    }

    logger.info("Password update request", { email });

    const params = {
      TableName: appConstants.TABLES.SIGNUP,
      FilterExpression: "#email = :email",
      ExpressionAttributeNames: {
        "#email": "email",
      },
      ExpressionAttributeValues: {
        ":email": email,
      },
    };

    const scanCommand = new ScanCommand(params);
    const result = await dynamoDocumentClient.send(scanCommand);

    if (result.Items.length === 0) {
      return sendBadRequest(res, appConstants.ERROR_MESSAGES.EMAIL_NOT_FOUND);
    }

    if (!result.Items[0].isVerified) {
      return sendBadRequest(res, "Email address not verified");
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const updateParams = {
      TableName: appConstants.TABLES.SIGNUP,
      Key: {
        id: result.Items[0].id,
      },
      UpdateExpression: "SET #password = :password",
      ExpressionAttributeNames: {
        "#password": "password",
      },
      ExpressionAttributeValues: {
        ":password": hashedPassword,
      },
    };

    const updateCommand = new UpdateCommand(updateParams);
    await dynamoDocumentClient.send(updateCommand);

    logger.info("Password updated successfully", { email, userId: result.Items[0].id });

    return sendSuccess(res, appConstants.HTTP_STATUS.OK, "Password successfully updated!");
  } catch (error) {
    logger.error("Password update error", error);
    return sendInternalError(res, appConstants.ERROR_MESSAGES.INTERNAL_ERROR, error);
  }
};

module.exports = {
  emailRegisterSignIn,
  emailVerification,
  emailSignIn,
  changePassword,
  logout,
  forgotPassword,
  updateEmailOrPhone,
  updatePassword,
  requestUpdateEmailOrPhone,
};
