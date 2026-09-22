const { dynamoClient, snsClient } = require("../config/aws");
const { PublishCommand } = require("@aws-sdk/client-sns");
const { BatchWriteItemCommand } = require("@aws-sdk/client-dynamodb");

const {
  PutCommand,
  GetCommand,
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
  DeleteCommand,
} = require("@aws-sdk/lib-dynamodb");

const dynamoDocumentClient = DynamoDBDocumentClient.from(dynamoClient);
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");

require("dotenv").config();

const {
  isValidEmailFormat,
  generateToken,
  isWeakPassword,
  phoneNumberExists,
  emailExists,
} = require("./utils/email.utils");

const { sendVerificationEmail } = require("../mailer");

const AWS = require("aws-sdk");

const createSchool = async (req, res) => {
  try {
    const params = {
      TableName: "schoolsTable",
    };

    const scanCommand = new ScanCommand(params);
    const result = await dynamoDocumentClient.send(scanCommand);

    if (result.Items.length === 0) {
      const password = req.body.password;
      const hashedPassword = await bcrypt.hash(password, 10);
      const verificationToken = generateToken();
      req.body.id = uuidv4();
      req.body.password = hashedPassword;
      req.body.verificationToken = verificationToken;
      req.body.isVerified = false;
      const saveParams = {
        TableName: "schoolsTable",
        Item: req.body,
      };
      const email = req.body.email;
      await sendVerificationEmail(
        email,
        "Verify your email address",
        "Your verification code is: ",
        verificationToken
      );
      const putCommand = new PutCommand(saveParams);
      await dynamoDocumentClient.send(putCommand);

      return res
        .status(200)
        .json({ success: true, message: "Successfully Added to the Database" });
    } else {
      const emailParams = {
        TableName: "schoolsTable",
        FilterExpression: "#email = :email and #isVerified = :isVerified",
        ExpressionAttributeNames: {
          "#email": "email",
          "#isVerified": "isVerified",
        },
        ExpressionAttributeValues: {
          ":email": req.body.email,
          ":isVerified": true,
        },
      };

      const command = new ScanCommand(emailParams);
      const userData = await dynamoDocumentClient.send(command);

      if (userData.Items.length !== 0)
        return res
          .status(200)
          .json({ success: false, error: "Email already in use" });

      const password = req.body.password;
      const hashedPassword = await bcrypt.hash(password, 10);
      const verificationToken = generateToken();
      req.body.id = uuidv4();
      req.body.password = hashedPassword;
      req.body.verificationToken = verificationToken;
      req.body.isVerified = false;
      const saveParams = {
        TableName: "schoolsTable",
        Item: req.body,
      };
      const email = req.body.email;
      await sendVerificationEmail(
        email,
        "Verify your email address",
        "Your verification code is: ",
        verificationToken
      );
      const putCommand = new PutCommand(saveParams);
      await dynamoDocumentClient.send(putCommand);

      return res
        .status(200)
        .json({ success: true, message: "Successfully Added to the Database" });
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const verifySchool = async (req, res) => {
  try {
    //const token = ;
    const email = req.body.email;
    const emailParams = {
      TableName: "schoolsTable",
      FilterExpression: "#email = :email",
      ExpressionAttributeNames: {
        "#email": "email",
      },
      ExpressionAttributeValues: {
        ":email": email,
      },
    };

    const command = new ScanCommand(emailParams);
    const userData = await dynamoDocumentClient.send(command);

    if (userData.Items.length === 0)
      return res
        .status(400)
        .json({ success: false, error: "School Email doesn't exists" });

    const user = userData.Items;
    if (!user && user[0].verificationToken != req.body.token)
      return res
        .status(401)
        .json({ success: false, error: "Invalid verification token" });

    if (user[0].isVerified === true)
      return res
        .status(400)
        .json({ success: false, error: "Email already verified" });

    const updateParams = {
      TableName: "schoolsTable",
      Key: {
        id: user[0].id,
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

    const token = jwt.sign({ email }, process.env.jwtSecretToken, {
      expiresIn: "28800s",
    });

    return res.status(200).json({
      success: true,
      message: "Email successfully verified!",
      token,
      expiration: "28800",
      userId: user[0].id,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const editSchool = async (req, res) => {
  try {
    const params = {
      TableName: "schoolsTable",
      Key: {
        id: req.params.id,
      },
    };
    const getCommand = new GetCommand(params);
    const user = await dynamoDocumentClient.send(getCommand);
    //console.log(user);
    if (user.Item === undefined)
      return res
        .status(400)
        .json({ success: false, error: "School Id doesn't exists" });

    const password = req.body.password;
    const hashedPassword = await bcrypt.hash(password, 10);
    const updateExpression =
      "set firstName=:firstName, lastName=:lastName, phoneNumber=:phoneNumber, schoolName=:schoolName, schoolAddress=:schoolAddress, country=:country, state=:state, city=:city, zipCode=:zipCode, password=:password";

    const expressionAttributeValues = {
      ":firstName": req.body.firstName ?? user.Item.firstName,
      ":lastName": req.body.lastName ?? user.Item.lastName,
      ":phoneNumber": req.body.phoneNumber ?? user.Item.phoneNumber,
      ":schoolName": req.body.schoolName ?? user.Item.schoolName,
      ":schoolAddress": req.body.schoolAddress ?? user.Item.schoolAddress,
      ":country": req.body.country ?? user.Item.country,
      ":state": req.body.state ?? user.Item.state,
      ":zipCode": req.body.zipCode ?? user.Item.zipCode,
      ":password": hashedPassword ?? user.Item.password,
    };

    const updateParams = {
      TableName: "schoolsTable",
      Key: {
        id: req.params.id,
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "UPDATED_NEW",
    };

    const updateCommand = new UpdateCommand(updateParams);
    await dynamoDocumentClient.send(updateCommand);

    return res.status(200).json({
      success: true,
      message: "School Data Successfully Updated",
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const getSchoolById = async (req, res) => {
  try {
    const params = {
      TableName: "schoolsTable",
      Key: {
        id: req.params.id,
      },
    };

    const getCommand = new GetCommand(params);
    const user = await dynamoDocumentClient.send(getCommand);
    //console.log(user);
    if (user.Item === undefined)
      return res.status(400).json({ success: true, data: {} });

    return res.status(200).json({ success: true, data: user.Item });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const getSchoolByName = async (req, res) => {
  try {
    const getParams = {
      TableName: "schoolsTable",
      FilterExpression: "#schoolName = :schoolName",
      ExpressionAttributeNames: {
        "#schoolName": "schoolName",
      },
      ExpressionAttributeValues: {
        ":schoolName": req.params.name,
      },
    };
    const command = new ScanCommand(getParams);
    const userData = await dynamoDocumentClient.send(command);

    if (userData.Items.length === 0)
      return res.status(400).json({ success: true, data: {} });

    return res.status(200).json({ success: true, data: userData.Items[0] });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const deleteSchoolById = async (req, res) => {
  try {
    const params = {
      TableName: "schoolsTable",
      Key: {
        id: req.params.id,
      },
    };

    const deleteCommand = new DeleteCommand(params);
    const data = await dynamoDocumentClient.send(deleteCommand);
    console.log(data);
    return res
      .status(200)
      .json({ success: true, message: "Student Data Successfully Deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const interestRegistration = async (req, res) => {
  try {
    req.body.id = uuidv4();
    req.body.isVerifiedEmail = false;
    req.body.isVerifiedPhoneNumber = false;
    //validate email and or phone number to avoid duplicate
    const emailParams = {
      TableName: "interestedUsersTable",
      FilterExpression: "#email = :email",
      ExpressionAttributeNames: {
        "#email": "email",
      },
      ExpressionAttributeValues: {
        ":email": req.body.email,
      },
    };

    const command = new ScanCommand(emailParams);
    const userData = await dynamoDocumentClient.send(command);

    if (userData.Items.length !== 0)
      return res
        .status(400)
        .json({ success: false, error: "Email already exist" });

    const phoneNumber = req.body.phoneNumber;

    if (phoneNumber !== undefined && phoneNumber !== "") {
      const emailParams = {
        TableName: "interestedUsersTable",
        FilterExpression: "#phoneNumber = :phoneNumber",
        ExpressionAttributeNames: {
          "#phoneNumber": "phoneNumber",
        },
        ExpressionAttributeValues: {
          ":phoneNumber": req.body.phoneNumber,
        },
      };

      const command = new ScanCommand(emailParams);
      const userData = await dynamoDocumentClient.send(command);

      if (userData.Items.length !== 0)
        return res
          .status(400)
          .json({ success: false, error: "Phone number already exist" });

      const otp = Math.floor(1000 + Math.random() * 9000).toString();
      req.body.otp = otp;
    }

    const verificationToken = generateToken();
    req.body.verificationToken = verificationToken;

    const saveParams = {
      TableName: "interestedUsersTable",
      Item: req.body,
    };

    const putCommand = new PutCommand(saveParams);
    await dynamoDocumentClient.send(putCommand);

    //send email verification
    const email = req.body.email;
    const token = jwt.sign({ email }, process.env.jwtSecretToken, {
      expiresIn: "28800s",
    });
    await sendVerificationEmail(
      email,
      "Verify your email address",
      "Click the link to verify your email: ",
      process.env.WebAppURLSchoolRyde +
        `/interest/register/verify?token=${token}`
    );

    //send sms
    if (phoneNumber !== undefined && phoneNumber !== "") {
      const tokenPhone = jwt.sign({ phoneNumber }, process.env.jwtSecretToken, {
        expiresIn: "28800s",
      });
      const otpParams = {
        Message: `Click the link to verify your phone number: ${process.env.WebAppURLSchoolRyde}/interest/register/verify?token=${tokenPhone}`,
        PhoneNumber: phoneNumber,
      };
      const command = new PublishCommand(otpParams);
      await snsClient.send(command);
    }

    return res
      .status(200)
      .json({ success: true, message: "Successfully Added to the Database" });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};
const getVerifiedInterestRegistration = async (req, res) => {
  try {
    const emailParams = {
      TableName: "interestedUsersTable",
      FilterExpression:
        "#isVerifiedEmail = :isVerifiedEmail or #isVerifiedPhoneNumber = :isVerifiedPhoneNumber",
      ExpressionAttributeNames: {
        "#isVerifiedEmail": "isVerifiedEmail",
        "#isVerifiedPhoneNumber": "isVerifiedPhoneNumber",
      },
      ExpressionAttributeValues: {
        ":isVerifiedEmail": true,
        ":isVerifiedPhoneNumber": true,
      },
    };

    const command = new ScanCommand(emailParams);
    const userData = await dynamoDocumentClient.send(command);

    if (userData.Items.length === 0)
      return res.status(200).json({ success: true, data: [] });

    return res.status(200).json({ success: true, data: userData.Items });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const verifyEmailInterestRegistration = async (req, res) => {
  try {
    const token = req.header("Authorization");
    //check token if still valid
    if (!token) {
      return res
        .status(401)
        .json({ success: false, error: "Access denied. No token provided." });
    }

    const secretKey = process.env.jwtSecretToken;
    //decode to get the email
    req.user = jwt.verify(token, secretKey, (err, decoded) => {
      if (err) {
        return res
          .status(401)
          .json({ success: false, error: "Token Expired." });
      }

      // Token is valid, and decoded data can be accessed via decoded.email, decoded.userId, etc.
      return decoded;
    });

    if (req.user.email === undefined && req.user.email === "")
      return res
        .status(400)
        .json({ success: false, error: "No email provided in token" });

    if (req.user.phoneNumber === undefined && req.user.phoneNumber === "")
      return res
        .status(400)
        .json({ success: false, error: "No phone number provided in token" });

    if (req.user.email !== undefined && req.user.email !== "") {
      const emailParams = {
        TableName: "interestedUsersTable",
        FilterExpression: "#email = :email",
        ExpressionAttributeNames: {
          "#email": "email",
        },
        ExpressionAttributeValues: {
          ":email": req.user.email,
        },
      };

      const scanCommand = new ScanCommand(emailParams);
      const userData = await dynamoDocumentClient.send(scanCommand);

      const user = userData.Items;

      if (user.length === 0)
        return res.status(400).json({
          success: false,
          error: "Email Address not found",
        });

      if (user[0].isVerifiedEmail === true)
        return res
          .status(400)
          .json({ success: false, error: "Email already verified" });

      const updateParams = {
        TableName: "interestedUsersTable",
        Key: {
          id: user[0].id,
        },
        UpdateExpression:
          "SET #verificationTokenAttr = :verificationToken, #isVerifiedAttr = :isVerifiedEmail",
        ExpressionAttributeNames: {
          "#verificationTokenAttr": "verificationToken",
          "#isVerifiedAttr": "isVerifiedEmail",
        },
        ExpressionAttributeValues: {
          ":verificationToken": "",
          ":isVerifiedEmail": true,
        },
      };
      const updateCommand = new UpdateCommand(updateParams);
      await dynamoDocumentClient.send(updateCommand);

      return res.status(200).json({
        success: true,
        message: "Email successfully verified!",
      });
    }

    const phoneParams = {
      TableName: "interestedUsersTable",
      FilterExpression: "#pn = :phoneVal",
      ExpressionAttributeNames: {
        "#pn": "phoneNumber",
      },
      ExpressionAttributeValues: {
        ":phoneVal": req.user.phoneNumber,
      },
    };

    const queryCommand = new ScanCommand(phoneParams);
    const result = await dynamoDocumentClient.send(queryCommand);

    const user = result.Items;

    if (result.Items.length === 0)
      return res
        .status(400)
        .send({ success: false, error: "Phone Number doesn't exist" });

    //verify phone number -- register using phone
    if (user[0].isVerifiedPhoneNumber === true)
      return res
        .status(400)
        .json({ success: false, error: "Phone number already verified" });

    const updateParams = {
      TableName: "interestedUsersTable",
      Key: {
        id: user[0].id,
      },

      UpdateExpression: "SET #isVerifiedAttr = :isVerifiedPhoneNumber",
      ExpressionAttributeNames: {
        "#isVerifiedAttr": "isVerifiedPhoneNumber",
      },
      ExpressionAttributeValues: {
        ":isVerifiedPhoneNumber": true,
      },
    };

    const updateCommand = new UpdateCommand(updateParams);
    await dynamoDocumentClient.send(updateCommand);

    return res.status(200).send({
      success: true,
      message: "Phone number verified successfully",
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const schoolRegistration = async (req, res) => {
  try {
    req.body.id = uuidv4();
    if (req.body.password) {
      req.body.password = await bcrypt.hash(req.body.password, 10);
    }
    req.body.isVerified = false;
    const saveParams = {
      TableName: "schoolRegistrationTable",
      Item: req.body,
    };

    const putCommand = new PutCommand(saveParams);
    await dynamoDocumentClient.send(putCommand);

    const verificationToken = generateToken();
    // const email = req.body.email;
    // await sendVerificationEmail(
    //   email,
    //   "Verify your email address",
    //   "Your verification code is: ",
    //   verificationToken
    // );
    return res
      .status(200)
      .json({ success: true, message: "Successfully Added to the Database" });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const forgotPasswordSchool = async (req, res) => {
  try {
    const params = {
      TableName: "schoolsTable",
      FilterExpression: "#email = :email",
      ExpressionAttributeNames: {
        "#email": "email",
      },
      ExpressionAttributeValues: {
        ":email": req.body.email,
      },
    };
    const scanCommand = new ScanCommand(params);
    const data = await dynamoDocumentClient.send(scanCommand);
    if (data.Items.length === 0)
      return res.status(400).json({ success: false, error: "Email not found" });

    const email = req.body.email;
    const verificationToken = generateToken();
    await sendVerificationEmail(
      email,
      "Verify your email address",
      "Your verification code is: ",
      verificationToken
    );

    const updateParams = {
      TableName: "schoolsTable",
      Key: {
        id: data.Items[0].id,
      },
      UpdateExpression: "SET #verificationToken = :verificationToken",
      ExpressionAttributeNames: {
        "#verificationToken": "verificationToken",
      },
      ExpressionAttributeValues: {
        ":verificationToken": verificationToken,
      },
    };

    const updateCommand = new UpdateCommand(updateParams);
    await dynamoDocumentClient.send(updateCommand);

    return res.status(200).json({
      success: true,
      message: "Forgot Password Code Successfully Send",
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const verifyForgotPasswordSchool = async (req, res) => {
  try {
    //
    const params = {
      TableName: "schoolsTable",
      FilterExpression: "#email = :email",
      ExpressionAttributeNames: {
        "#email": "email",
      },
      ExpressionAttributeValues: {
        ":email": req.body.email,
      },
    };
    const scanCommand = new ScanCommand(params);
    const data = await dynamoDocumentClient.send(scanCommand);
    if (data.Items.length === 0)
      return res.status(400).json({ success: false, error: "Email not found" });

    if (data.Items[0].verificationToken !== req.body.token)
      return res
        .status(401)
        .json({ success: false, error: "Invalid verification token" });

    const email = req.body.email;
    const token = jwt.sign({ email }, process.env.jwtSecretToken, {
      expiresIn: "28800s",
    });
    await sendVerificationEmail(
      req.body.email,
      "Request to Reset Password",
      "Click the link to reset your password: ",
      process.env.WebAppURL + `/reset-password?token=${token}`
    );

    const updateParams = {
      TableName: "schoolsTable",
      Key: {
        id: data.Items[0].id,
      },
      UpdateExpression: "SET #verificationToken = :verificationToken",
      ExpressionAttributeNames: {
        "#verificationToken": "verificationToken",
      },
      ExpressionAttributeValues: {
        ":verificationToken": "",
      },
    };

    const updateCommand = new UpdateCommand(updateParams);
    await dynamoDocumentClient.send(updateCommand);

    return res
      .status(200)
      .json({ success: true, message: "Email Successfully Verified" });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const updatePasswordSchool = async (req, res) => {
  try {
    const token = req.header("Authorization");
    //check token if still valid
    if (!token) {
      return res
        .status(401)
        .json({ success: false, error: "Access denied. No token provided." });
    }

    const secretKey = process.env.jwtSecretToken;
    req.user = jwt.verify(token, secretKey, (err, decoded) => {
      if (err) {
        return res
          .status(401)
          .json({ success: false, error: "Token Expired." });
      }

      // Token is valid, and decoded data can be accessed via decoded.email, decoded.userId, etc.
      return decoded;
    });

    //check email if existing
    const emailParams = {
      TableName: "schoolsTable",
      FilterExpression: "#email = :email",
      ExpressionAttributeNames: {
        "#email": "email",
      },
      ExpressionAttributeValues: {
        ":email": req.user.email,
      },
    };

    const scanCommand = new ScanCommand(emailParams);
    const result = await dynamoDocumentClient.send(scanCommand);

    if (result.Items.length === 0)
      return res.status(400).json({
        success: false,
        error: "Email Address not found",
      });

    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    const updateParams = {
      TableName: "schoolsTable",
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

    return res
      .status(200)
      .json({ success: true, message: "Email Successfully Verified" });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};
const schoolInterest = async (req, res) => {
  try {
    req.body.id = uuidv4();

    const saveParams = {
      TableName: "schoolInterestTable",
      Item: req.body,
    };

    const putCommand = new PutCommand(saveParams);
    await dynamoDocumentClient.send(putCommand);

    return res.status(200).json({
      success: true,
      message: "Successfully Added to the Database",
      id: req.body.id,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const sendSMSDriverOrParent = async (req, res) => {
  try {
    const phoneNumber = req.body.phoneNumber;

    if (!phoneNumber)
      return res
        .status(400)
        .json({ success: false, error: "Phone Number is required" });

    const params = {
      Message: `Thank you for subscribing to SchoolRyde. Search for SchoolRyde from Play Store for Android and App Store for iOS`,
      PhoneNumber: phoneNumber,
    };
    const command = new PublishCommand(params);
    await snsClient.send(command);

    return res
      .status(200)
      .json({ success: true, message: "SMS Successfully Send" });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const loginSchool = async (req, res) => {
  try {
    //
    const emailParams = {
      TableName: "schoolsTable",
      FilterExpression: "#email = :email",
      ExpressionAttributeNames: {
        "#email": "email",
      },
      ExpressionAttributeValues: {
        ":email": req.body.email,
      },
    };
    const scanCommand = new ScanCommand(emailParams);
    const result = await dynamoDocumentClient.send(scanCommand);

    if (result.Items.length === 0)
      return res
        .status(400)
        .json({ success: false, error: "Email doesn't exist" });

    const user = result.Items;
    const match = await bcrypt.compare(req.body.password, user[0].password);

    if (!match) {
      return res
        .status(401)
        .json({ success: false, error: "Password incorrect" });
    }
    if (user[0].isVerified === false) {
      return res.status(200).json({
        success: true,
        message: "Email not yet verified",
        isVerified: false,
      });
    }
    const email = req.body.email;
    const token = jwt.sign({ email }, process.env.jwtSecretToken, {
      expiresIn: "28800s",
    });
    return res.status(200).json({
      success: true,
      token,
      expiration: "28800",
      userId: user[0].id,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const downloadSampleTemplate = async (req, res) => {
  try {
    // Define the headers
    const headers = [
      { header: "Student Name", key: "studentName", width: 30 },
      { header: "Age", key: "age", width: 30 },
      { header: "Gender", key: "gender", width: 30 },
      { header: "Grade", key: "grade", width: 30 },
      { header: "Share Ride", key: "shareRide", width: 30 },
      { header: "Disability", key: "Disability", width: 30 },
      { header: "School Name", key: "schoolName", width: 30 },
      { header: "Payment Method", key: "paymentMethod", width: 30 },
      { header: "Birth Date", key: "birthDate", width: 30 },
      { header: "Disability Condition", key: "disabilityCondition", width: 30 },
      { header: "Father Email Address", key: "fatherEmailAddress", width: 30 },
      { header: "Father Phone Number", key: "fatherPhoneNumber", width: 30 },
      { header: "Father Name", key: "fatherName", width: 30 },
      { header: "Mother Email Address", key: "motherEmailAddress", width: 30 },
      { header: "Mother Phone Number", key: "motherPhoneNumber", width: 30 },
      { header: "Mother Name", key: "motherName", width: 30 },
      { header: "Disability Note For Needs", key: "note", width: 30 },
      { header: "City", key: "note", width: 30 },
    ];

    // Create a new workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Students");

    // Set the headers
    worksheet.columns = headers;

    // Generate a file path
    const filename = "students.xlsx";
    const filePath = path.join(__dirname, filename);

    // Save the workbook to the file
    await workbook.xlsx.writeFile(filePath);

    console.log(`File "${filename}" generated successfully with headers.`);

    // Set the response headers for downloading the file
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    //Send the file as a response
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    // Optionally, you can delete the file after sending it
    fileStream.on("end", () => {
      fs.unlinkSync(filePath);
      console.log(`File "${filename}" deleted successfully.`);
    });
    // workbook.xlsx.write(res);
    // return res
    //   .status(200)
    //   .json({ success: true, message: "PDF File Generated" });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const uploadToS3 = async (base64, filename) => {
  const s3 = new AWS.S3();
  AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID_DRIVERS,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY_DRIVERS,
    region: process.env.REGION_DRIVERS, // replace with your S3 bucket's region
  });

  const buffer = Buffer.from(base64, "base64");
  const params = {
    Bucket: process.env.s3BucketName,
    Key: `excel-files/${filename}`,
    Body: buffer,
    ContentEncoding: "base64",
    ContentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return s3.upload(params).promise();
};

const readExcelFileAndSave = async (req, res) => {
  try {
    // Load the Excel file from S3
    if (req.header("UserId") === undefined || req.header("UserId") === "")
      return res
        .status(400)
        .json({ success: false, error: "UserId is required in the headers" });

    const base64 = Buffer.from(req.file.buffer).toString("base64");
    await uploadToS3(base64, req.file.originalname);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);

    // Get the worksheet
    const worksheet = workbook.getWorksheet("Students");

    // Initialize an array to store student data
    const studentsData = [];
    let student = "";
    let imageUrl = "";
    // Iterate over each row in the worksheet (excluding headers)
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber > 1) {
        // Skip header row

        if (row.getCell(3).value.toLowerCase() === "male")
          imageUrl = process.env.maleImageUrl;
        else imageUrl = process.env.femaleImageUrl;

        const age = new Date() - new Date(row.getCell(9).value);

        student = {
          id: uuidv4() + "-student",
          studentName: row.getCell(1).value,
          age: Math.floor(age / (1000 * 60 * 60 * 24 * 365.25)),
          gender: row.getCell(3).value,
          grade: row.getCell(4).value,
          shareRide: row.getCell(5).value,
          studentDisability: row.getCell(6).value,
          schoolName: row.getCell(7).value,
          paymentMethod: row.getCell(8).value,
          birthDate: new Date(row.getCell(9).value).toDateString(),
          disabilityCondition: row.getCell(10).value,
          fatherEmailAddress:
            row.getCell(11).value ?? row.getCell(11).value.text,
          fatherPhoneNumber: "+" + row.getCell(12).value.toString(),
          fatherName: row.getCell(13).value,
          motherEmailAddress:
            row.getCell(14).value ?? row.getCell(14).value.text,
          motherPhoneNumber: "+" + row.getCell(15).value.toString(),
          motherName: row.getCell(16).value,
          note: row.getCell(17).value,
          city: row.getCell(18).value,
          imageUrl: imageUrl,
          platform: "web",
          userId: req.header("UserId"),
          isInvited: false,
        };
        studentsData.push(student);
      }
    });
    console.log(studentsData);
    const putPromises = studentsData.map((student) => {
      const params = {
        TableName: "studentsTable",
        Item: student,
      };
      const command = new PutCommand(params);
      return dynamoDocumentClient.send(command);
    });

    await Promise.all(putPromises);
    return res
      .status(200)
      .json({ success: true, message: "Successfully uploaded" });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const schoolChangePassword = async (req, res) => {
  try {
    //
    const params = {
      TableName: "schoolsTable",
      Key: {
        id: req.body.schoolId,
      },
    };
    const getCommand = new GetCommand(params);
    const user = await dynamoDocumentClient.send(getCommand);

    if (user.Item === undefined)
      return res
        .status(400)
        .json({ success: false, error: "School Id doesn't exist" });

    const match = await bcrypt.compare(
      req.body.oldPassword,
      user.Item.password
    );
    if (!match)
      return res
        .status(401)
        .json({ success: false, error: "Password incorrect" });

    const updateParams = {
      TableName: "schoolsTable",
      Key: {
        id: user.Item.id,
      },
      UpdateExpression: "SET #password = :password",
      ExpressionAttributeNames: {
        "#password": "password",
      },
      ExpressionAttributeValues: {
        ":password": req.body.newPassword,
      },
    };

    const updateCommand = new UpdateCommand(updateParams);
    await dynamoDocumentClient.send(updateCommand);

    return res
      .status(200)
      .json({ success: true, message: "Password Successfully Changed" });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

module.exports = {
  downloadSampleTemplate,
  createSchool,
  editSchool,
  getSchoolById,
  getSchoolByName,
  deleteSchoolById,

  interestRegistration,
  getVerifiedInterestRegistration,
  verifyEmailInterestRegistration,

  schoolRegistration,
  verifySchool,
  schoolInterest,

  sendSMSDriverOrParent,

  schoolChangePassword,
  loginSchool,
  forgotPasswordSchool,
  verifyForgotPasswordSchool,
  updatePasswordSchool,
  readExcelFileAndSave,
};
