const { dynamoClient } = require("../config/aws");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const AWS = require("aws-sdk");
const geolib = require("geolib");
require("dotenv").config();
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
const { WebhookNotifyDriver } = require("./webhook");

const {
  isValidEmailFormat,
  generateToken,
  isWeakPassword,
  phoneNumberExists,
  emailExists,
} = require("./utils/email.utils");
const {
  createCustomerSupportSchema,
  loginCustomerSupportSchema,
  addDMV_Criminal_RecordsSchema,
  sendDMV_Criminal_RecordsSchema,
  forgotPasswordSchema,
  updatePasswordSchema,
} = require("./validation/customerSupport.validation");

const { sendVerificationEmail } = require("../mailer");
const s3Data = require("./utils/s3");

const { sendTempDriver, checkDeviceToken } = require("./pushnotification");

const createAdminAccount = async (req, res) => {
  const { error, value } = createCustomerSupportSchema.validate(req.body, {
    allowUnknown: false,
  });

  if (error) return res.status(400).json({ success: false, error: `${error}` });

  try {
    const params = {
      TableName: "customerSupportTable",
    };

    const scanCommand = new ScanCommand(params);
    const data = await dynamoDocumentClient.send(scanCommand);

    if (data.Items.length === 0) {
      const hashedPassword = await bcrypt.hash(req.body.password, 10);
      req.body.password = hashedPassword;
      req.body.id = uuidv4();
      req.body.verificationToken = "";
      const saveParams = {
        TableName: "customerSupportTable",
        Item: req.body,
      };

      const putCommand = new PutCommand(saveParams);
      await dynamoDocumentClient.send(putCommand);

      return res.status(201).json({
        success: true,
        message: "Customer support account created successfully",
      });
    } else {
      const params = {
        TableName: "customerSupportTable",
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

      if (data.Items.length != 0)
        return res.status(400).json({
          success: false,
          error: "CS Admin Account Registered Already",
        });

      const hashedPassword = await bcrypt.hash(req.body.password, 10);
      req.body.password = hashedPassword;
      req.body.id = uuidv4();
      req.body.verificationToken = "";
      const saveParams = {
        TableName: "customerSupportTable",
        Item: req.body,
      };

      const putCommand = new PutCommand(saveParams);
      await dynamoDocumentClient.send(putCommand);

      return res.status(201).json({
        success: true,
        message: "Customer support account created successfully",
      });
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const createAdminProfile = async (req, res) => {
  try {
    const param = {
      TableName: "csProfileTable",
    };
    const scanCommand = new ScanCommand(param);
    const result = await dynamoDocumentClient.send(scanCommand);

    if (result.Items.length === 0) {
      req.body.id = uuidv4();
      req.body.csUserId = req.header("UserId");

      AWS.config.update({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID_DRIVERS,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY_DRIVERS,
        region: process.env.REGION_DRIVERS, // replace with your S3 bucket's region
      });
      const s3 = new AWS.S3();

      if (req.body.imageBase64 !== undefined) {
        const result = await s3Data(req.body.imageBase64);
        await s3.upload(result.s3Params).promise();

        req.body.imageUrl = process.env.imageURL + `/${result.imageKey}`;
      }

      const saveParams = {
        TableName: "csProfileTable",
        Item: req.body,
      };

      const putCommand = new PutCommand(saveParams);
      await dynamoDocumentClient.send(putCommand);

      return res.status(201).json({
        success: true,
        message: "Customer support account profile created successfully",
        data: req.body,
      });
    } else {
      if (req.query.id === undefined)
        return res.status(400).json({
          success: false,
          error: "Customer Service Account Id is required",
        });
      console.log(req.query.id);
      let params = {
        TableName: "csProfileTable",
        FilterExpression: "#csUserId = :csUserId",
        ExpressionAttributeNames: {
          "#csUserId": "csUserId",
        },
        ExpressionAttributeValues: {
          ":csUserId": req.query.id,
        },
      };

      const scanCommand = new ScanCommand(params);
      const result = await dynamoDocumentClient.send(scanCommand);

      if (result.Items.length > 0)
        return res.status(400).json({
          success: false,
          error: "Customer Service Profile already exists",
        });

      req.body.id = uuidv4();
      req.body.csUserId = req.header("UserId");
      const saveParams = {
        TableName: "csProfileTable",
        Item: req.body,
      };

      const putCommand = new PutCommand(saveParams);
      await dynamoDocumentClient.send(putCommand);

      return res.status(201).json({
        success: true,
        message: "Customer support account profile created successfully",
      });
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const getAdminProfileBy_csUserId = async (req, res) => {
  try {
    console.log(req.params.id);
    let params = {
      TableName: "csProfileTable",
      FilterExpression: "#csUserId = :csUserId",
      ExpressionAttributeNames: {
        "#csUserId": "csUserId",
      },
      ExpressionAttributeValues: {
        ":csUserId": req.params.id,
      },
    };

    const scanCommand = new ScanCommand(params);
    const data = await dynamoDocumentClient.send(scanCommand);
    if (data.Items.length === 0)
      return res.status(400).json({ success: false, error: "Id not found" });

    params = {
      TableName: "customerSupportTable",
      Key: {
        id: req.params.id,
      },
    };
    const getCommand = new GetCommand(params);
    const user = await dynamoDocumentClient.send(getCommand);

    data.Items[0].email = user.Item.email ?? "";

    return res.status(200).json({ success: true, data: data.Items[0] });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const editAdminProfileBy_csUserId = async (req, res) => {
  try {
    const params = {
      TableName: "csProfileTable",
      FilterExpression: "#csUserId = :csUserId",
      ExpressionAttributeNames: {
        "#csUserId": "csUserId",
      },
      ExpressionAttributeValues: {
        ":csUserId": req.params.id,
      },
    };
    const scanCommand = new ScanCommand(params);
    const data = await dynamoDocumentClient.send(scanCommand);
    if (data.Items.length === 0)
      return res.status(400).json({ success: false, error: "Id not found" });

    const s3 = new AWS.S3();

    if (req.body.imageBase64 !== undefined) {
      const result = await s3Data(req.body.imageBase64);
      await s3.upload(result.s3Params).promise();

      req.body.imageUrl = process.env.imageURL + `/${result.imageKey}`;
    }
    const updateExpression =
      "set fullName=:fullName, age=:age, address=:address, imageUrl=:imageUrl";
    const expressionAttributeValues = {
      ":fullName": req.body.fullName ?? data.Items[0].fullName,
      ":age": req.body.age ?? data.Items[0].age,
      ":address": req.body.address ?? data.Items[0].address,
      ":imageUrl": req.body.imageUrl ?? data.Items[0].imageUrl,
    };

    const updateParams = {
      TableName: "csProfileTable",
      Key: {
        id: data.Items[0].id,
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "UPDATED_NEW",
    };
    //console.log(updateParams);
    const updateCommand = new UpdateCommand(updateParams);
    await dynamoDocumentClient.send(updateCommand);
    return res.status(200).json({
      success: true,
      message: "Customer Service Profile Successfully Updated",
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};
const deleteAdminProfileBy_csUserId = async (req, res) => {
  try {
    let params = {
      TableName: "csProfileTable",
      FilterExpression: "#csUserId = :csUserId",
      ExpressionAttributeNames: {
        "#csUserId": "csUserId",
      },
      ExpressionAttributeValues: {
        ":csUserId": req.params.id,
      },
    };
    const scanCommand = new ScanCommand(params);
    const data = await dynamoDocumentClient.send(scanCommand);
    if (data.Items.length === 0)
      return res.status(400).json({ success: false, error: "Id not found" });

    params = {
      TableName: "csProfileTable",
      Key: {
        id: data.Items[0].id,
      },
    };
    const deleteCommand = new DeleteCommand(params);
    await dynamoDocumentClient.send(deleteCommand);
    //console.log(data);
    return res.status(200).json({
      success: true,
      message: "Customer Service Profile Data Successfully Deleted",
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const getAdminAccountByEmail = async (req, res) => {
  if (req.params.email === undefined)
    return res.status(400).json({ success: false, error: "Email is required" });

  let email = req.body.email.split("@")[1];
  if (email !== "treelinktechnologies.com")
    return res
      .status(400)
      .json({ success: false, error: "Email Domain not correct" });

  try {
    const params = {
      TableName: "customerSupportTable",
      FilterExpression: "#email = :email",
      ExpressionAttributeNames: {
        "#email": "email",
      },
      ExpressionAttributeValues: {
        ":email": req.params.email,
      },
    };
    const scanCommand = new ScanCommand(params);
    const data = await dynamoDocumentClient.send(scanCommand);
    if (data.Items.length === 0)
      return res.status(400).json({ success: false, error: "Email not found" });

    return res.status(200).json({ success: true, data: data.Items });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const deleteAdminAccountByEmail = async (req, res) => {
  if (req.body.email === undefined)
    return res.status(400).json({ success: false, error: "Email is required" });

  if (req.body.email.split("@")[1] !== "treelinktechnologies.com")
    return res
      .status(400)
      .json({ success: false, error: "Email Domain not correct" });

  try {
    const params = {
      TableName: "customerSupportTable",
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
    if (data.Items === undefined)
      return res.status(400).json({ success: false, error: "Email not found" });

    const deleteParams = {
      TableName: "customerSupportTable",
      Key: {
        id: data.Items[0].id,
      },
    };

    const deleteCommand = new DeleteCommand(deleteParams);
    await dynamoDocumentClient.send(deleteCommand);
    return res.status(200).json({
      success: true,
      message: "Customer Support Account Successfully Deleted",
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const loginCS = async (req, res) => {
  const { error, value } = loginCustomerSupportSchema.validate(req.body, {
    allowUnknown: false,
  });

  if (error) return res.status(400).json({ success: false, error: `${error}` });

  try {
    const params = {
      TableName: "customerSupportTable",
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

    const match = await bcrypt.compare(
      req.body.password,
      data.Items[0].password
    );

    if (!match)
      return res
        .status(401)
        .json({ success: false, error: "Password incorrect" });

    const email = req.body.email;
    const token = jwt.sign({ email }, process.env.jwtSecretToken, {
      expiresIn: "28800s",
    });

    return res.status(200).json({
      success: true,
      token,
      message: "Customer Support Successfully Login",
      expiration: "28800",
      email: req.body.email,
      cs_id: data.Items[0].id,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const forgotPasswordCS = async (req, res) => {
  const { error, value } = forgotPasswordSchema.validate(req.body, {
    allowUnknown: false,
  });

  if (error) return res.status(400).json({ success: false, error: `${error}` });

  try {
    const params = {
      TableName: "customerSupportTable",
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
    const token = jwt.sign({ email }, process.env.jwtSecretToken, {
      expiresIn: "28800s",
    });
    await sendVerificationEmail(
      req.body.email,
      "Request to Reset Password",
      "Click the link to reset your password: ",
      process.env.WebAppURL + `/reset-password?token=${token}`
    );

    return res.status(200).json({
      success: true,
      message: "Forgot Password Link Successfully Send",
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const updatePasswordCS = async (req, res) => {
  try {
    const { error, value } = updatePasswordSchema.validate(req.body, {
      allowUnknown: false,
    });

    if (error)
      return res.status(400).json({ success: false, error: `${error}` });

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

    //check email if existing
    const emailParams = {
      TableName: "customerSupportTable",

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
      TableName: "customerSupportTable",
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
      .json({ success: true, message: "Password Successfully Updated" });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const getDriverAccountsWithPagination = async (req, res) => {
  try {
    const params = {
      TableName: "driversTable",
    };
    const scanCommand = new ScanCommand(params);
    const parentsData = await dynamoDocumentClient.send(scanCommand);

    if (parentsData.Items.length === 0)
      return res.status(200).json({ success: true, data: [] });

    const parsedPageSize = parseInt(req.query.pageSize) || 10;

    // Get the page number from the request or use a default value
    const parsedPage = parseInt(req.query.page) || 1;

    // Calculate the start and end index for the current page
    const startIndex = (parsedPage - 1) * parsedPageSize;
    const endIndex = parsedPage * parsedPageSize;

    // Get the drivers for the current page
    const parentsForPage = parentsData.Items.slice(startIndex, endIndex);

    // Determine if there are more pages
    const hasMorePages = endIndex < parentsData.Items.length;
    //console.log(parentsForPage);
    //get addition details on signupTable for email and phone
    for (const item of parentsForPage) {
      //console.log(item);

      if (item.userId !== undefined) {
        const signUpParams = {
          TableName: "signupTable",
          Key: {
            id: item.userId,
          },
        };

        const getCommand = new GetCommand(signUpParams);
        const user = await dynamoDocumentClient.send(getCommand);
        if (user.Item !== undefined) {
          item.email = user.Item.email ?? "";
          item.phoneNumber = user.Item.phoneNumber ?? "";
        }
      }
    }

    const response = {
      success: true,
      data: parentsForPage,
      pageInfo: {
        currentPage: parsedPage,
        pageSize: parsedPageSize,
        totalItems: parentsForPage.length,
        hasMorePages: hasMorePages,
        totalDrivers: parentsData.Items.length,
      },
    };
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const getDriverAccountByEmailOrPhone = async (req, res) => {
  if (!req.params.emailOrPhone)
    return res
      .status(400)
      .json({ success: false, error: "Email or Phone is required" });

  try {
    let params = "";
    if (await isValidEmailFormat(req.params.emailOrPhone)) {
      params = {
        TableName: "signupTable",
        FilterExpression: "#email = :email",
        ExpressionAttributeNames: {
          "#email": "email",
        },
        ExpressionAttributeValues: {
          ":email": req.params.emailOrPhone,
        },
      };
    } else {
      params = {
        TableName: "signupTable",
        FilterExpression: "#phoneNumber = :phoneNumber",
        ExpressionAttributeNames: {
          "#phoneNumber": "phoneNumber",
        },
        ExpressionAttributeValues: {
          ":phoneNumber": req.params.emailOrPhone,
        },
      };
    }

    const scanCommand = new ScanCommand(params);
    const data = await dynamoDocumentClient.send(scanCommand);
    if (data.Items.length === 0)
      return res
        .status(400)
        .json({ success: false, error: "Email / Phone Number not found" });
    console.log(data.Items);
    const parentsParams = {
      TableName: "driversTable",
      FilterExpression: "#userId = :userId",
      ExpressionAttributeNames: {
        "#userId": "userId",
      },
      ExpressionAttributeValues: {
        ":userId": data.Items[0].id,
      },
    };
    const scanParentsCommand = new ScanCommand(parentsParams);
    const userData = await dynamoDocumentClient.send(scanParentsCommand);

    if (userData.Items.length === 0)
      return res
        .status(400)
        .json({ success: false, error: "Driver Details not Found" });

    userData.Items[0].email = data.Items[0].email ?? "";
    userData.Items[0].phoneNumber = data.Items[0].phoneNumber ?? "";

    return res.status(200).json({ success: true, data: userData.Items });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const deleteDriverAccount = async (req, res) => {
  try {
    const params = {
      TableName: "driversTable",
      Key: {
        id: req.params.id,
      },
    };

    const getCommand = new GetCommand(params);
    const result = await dynamoDocumentClient.send(getCommand);

    if (result.Item === undefined)
      return res
        .status(400)
        .json({ success: false, error: "Driver Id not  found" });

    const deleteCommand = new DeleteCommand(params);
    await dynamoDocumentClient.send(deleteCommand);
    return res
      .status(200)
      .json({ success: true, message: "Driver Data Successfully Deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const getParentsAccountByEmailOrPhone = async (req, res) => {
  //console.log(req.query.emailOrPhone, req.params.emailOrPhone);
  if (!req.params.emailOrPhone)
    return res
      .status(400)
      .json({ success: false, error: "Email or Phone is required" });

  try {
    let params = "";
    if (await isValidEmailFormat(req.params.emailOrPhone)) {
      params = {
        TableName: "signupTable",
        FilterExpression: "#email = :email",
        ExpressionAttributeNames: {
          "#email": "email",
        },
        ExpressionAttributeValues: {
          ":email": req.params.emailOrPhone,
        },
      };
    } else {
      params = {
        TableName: "signupTable",
        FilterExpression: "#phoneNumber = :phoneNumber",
        ExpressionAttributeNames: {
          "#phoneNumber": "phoneNumber",
        },
        ExpressionAttributeValues: {
          ":phoneNumber": req.params.emailOrPhone,
        },
      };
    }

    const scanCommand = new ScanCommand(params);
    const data = await dynamoDocumentClient.send(scanCommand);
    if (data.Items.length === 0)
      return res
        .status(400)
        .json({ success: false, error: "Email / Phone Number not found" });

    const parentsParams = {
      TableName: "parentsTable",
      FilterExpression: "#userId = :userId",
      ExpressionAttributeNames: {
        "#userId": "userId",
      },
      ExpressionAttributeValues: {
        ":userId": data.Items[0].id,
      },
    };
    const scanParentsCommand = new ScanCommand(parentsParams);
    const userData = await dynamoDocumentClient.send(scanParentsCommand);

    if (userData.Items.length === 0)
      return res
        .status(400)
        .json({ success: false, error: "Parent Details not Found" });

    userData.Items[0].email = data.Items[0].email ?? "";
    userData.Items[0].phoneNumber = data.Items[0].phoneNumber ?? "";

    return res.status(200).json({ success: true, data: userData.Items });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const getParentAccountsWithPagination = async (req, res) => {
  try {
    const params = {
      TableName: "parentsTable",
    };
    const scanCommand = new ScanCommand(params);
    const parentsData = await dynamoDocumentClient.send(scanCommand);

    if (parentsData.Items.length === 0)
      return res.status(200).json({ success: true, data: [] });

    const parsedPageSize = parseInt(req.query.pageSize) || 10;

    // Get the page number from the request or use a default value
    const parsedPage = parseInt(req.query.page) || 1;

    // Calculate the start and end index for the current page
    const startIndex = (parsedPage - 1) * parsedPageSize;
    const endIndex = parsedPage * parsedPageSize;

    // Get the drivers for the current page
    const parentsForPage = parentsData.Items.slice(startIndex, endIndex);

    // Determine if there are more pages
    const hasMorePages = endIndex < parentsData.Items.length;

    //get addition details on signupTable for email and phone
    for (const item of parentsForPage) {
      if (item.userId !== undefined) {
        const signUpParams = {
          TableName: "signupTable",
          Key: {
            id: item.userId,
          },
        };

        const getCommand = new GetCommand(signUpParams);
        const user = await dynamoDocumentClient.send(getCommand);

        if (user.Item !== undefined) {
          item.email = user.Item.email ?? "";
          item.phoneNumber = user.Item.phoneNumber ?? "";
        }
      }
    }

    const response = {
      success: true,
      data: parentsForPage,
      pageInfo: {
        currentPage: parsedPage,
        pageSize: parsedPageSize,
        totalItems: parentsForPage.length,
        hasMorePages: hasMorePages,
        totalParents: parentsData.Items.length,
      },
    };
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const deleteParentAccount = async (req, res) => {
  try {
    const params = {
      TableName: "parentsTable",
      Key: {
        id: req.params.id,
      },
    };

    const getCommand = new GetCommand(params);
    const result = await dynamoDocumentClient.send(getCommand);

    if (result.Item === undefined)
      return res
        .status(400)
        .json({ success: false, error: "Parent Id not  found" });

    const deleteCommand = new DeleteCommand(params);
    await dynamoDocumentClient.send(deleteCommand);
    return res
      .status(200)
      .json({ success: true, message: "Parent Data Successfully Deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const logOutCS = async (req, res) => {
  try {
    const token = req.header("Authorization");
    // Decode the token to get its expiration time
    const decoded = jwt.decode(token);
    if (!decoded) {
      return res.status(400).json({ success: false, error: "Invalid token." });
    }

    //save invalidTokensTable include user id
    const params = {
      TableName: "invalidTokensTable",
      Item: {
        id: uuidv4(),
        authorization: token,
        userId: req.header("CustomerServiceId"),
        date: new Date(),
      },
    };
    try {
      const putCommand = new PutCommand(params);
      await dynamoDocumentClient.send(putCommand);

      return res
        .status(200)
        .json({ success: true, message: "Successfully logged out." });
    } catch (error) {
      return res.status(400).json({ success: false, error: `${error}` });
    }
  } catch (error) {
    return res.status(400).json({ success: false, error: `${error}` });
  }
};

const s3DataPdf = (fileBase64) => {
  const buffer = Buffer.from(fileBase64, "base64");
  let fileExtension = "pdf";
  let contentType = "application/pdf";
  const fileKey = `${uuidv4()}.${fileExtension}`;

  const s3Params = {
    Bucket: process.env.s3BucketName,
    Key: fileKey,
    Body: buffer,
    ContentType: contentType,
  };
  //console.log(s3Params, fileKey);
  return { s3Params, fileKey };
};

const addDMVRecord_CriminalBackground = async (req, res) => {
  try {
    const { error, value } = addDMV_Criminal_RecordsSchema.validate(req.body, {
      allowUnknown: false,
    });

    if (error)
      return res.status(400).json({ success: false, error: `${error}` });

    const signUpParams = {
      TableName: "signupTable",
      FilterExpression: "#email = :email",
      ExpressionAttributeNames: {
        "#email": "email",
      },
      ExpressionAttributeValues: {
        ":email": req.body.driverEmail,
      },
    };

    const scanCommand = new ScanCommand(signUpParams);
    const userData = await dynamoDocumentClient.send(scanCommand);

    if (userData.Items.length === 0)
      return res.status(400).json({ success: false, error: "Email not Found" });

    await sendVerificationEmail(
      "naveen@treelinktechnologies.com",
      "Driver and Agent Details",
      `Driver Email: ${req.body.driverEmail}. \n Agent Email: ${req.body.agentEmail}.`,
      ""
    );

    return res
      .status(200)
      .json({ success: true, message: "Successfully Send an Email" });
  } catch (error) {
    return res.status(400).json({ success: false, error: `${error}` });
  }
};

const sendDocumentVerification = async (req, res) => {
  try {
    if (req.body.driverEmail === undefined)
      return res
        .status(400)
        .json({ success: false, error: "Driver Email is required" });

    if (req.body.description == undefined)
      return res
        .status(400)
        .json({ success: false, error: "Description is required" });

    const result = await isValidEmailFormat(req.body.driverEmail);
    console.log(result);
    if (!result)
      return res
        .status(400)
        .json({ success: false, error: "Invalid Email Format" });

    const signUpParams = {
      TableName: "signupTable",
      FilterExpression: "#email = :email",
      ExpressionAttributeNames: {
        "#email": "email",
      },
      ExpressionAttributeValues: {
        ":email": req.body.driverEmail,
      },
    };

    const scanCommand = new ScanCommand(signUpParams);
    const userData = await dynamoDocumentClient.send(scanCommand);

    if (userData.Items.length === 0)
      return res.status(400).json({ success: false, error: "Email not Found" });

    await sendVerificationEmail(
      req.body.driverEmail,
      "Document Record Verification",
      "Your Document Record Verification status is: ",
      req.body.description
    );

    // here will be call a webhook also
    try {
      await WebhookNotifyDriver({
        body: {
          status: "Document Record Verification",
          message: `Document verification status updated to: ${req.body.description}`,
          userId: userData.Items[0].id
        }
      }, {
        status: () => ({
          json: () => ({}) // Mock response object
        })
      });
    } catch (webhookError) {
      console.error('Webhook notification error:', webhookError);
    }
    

    const params = {
      TableName: "driversTable",
      FilterExpression: "#userId = :userId",
      ExpressionAttributeNames: {
        "#userId": "userId",
      },
      ExpressionAttributeValues: {
        ":userId": userData.Items[0].id,
      },
    };
    const command = new ScanCommand(params);
    const user = await dynamoDocumentClient.send(command);

    if (user.Items.length !== 0) {
      const driverParams = {
        TableName: "driversTable",
        Key: {
          id: user.Items[0].id,
        },
        UpdateExpression: "SET #driverStatus = :driverStatus",
        ExpressionAttributeNames: {
          "#driverStatus": "driverStatus",
        },
        ExpressionAttributeValues: {
          ":driverStatus": req.body.description,
        },
      };

      const updateCommand = new UpdateCommand(driverParams);
      await dynamoDocumentClient.send(updateCommand);
    }

    return res.status(200).json({
      success: true,
      message: "Successfully Send Email to the Driver",
    });
  } catch (error) {
    return res.status(400).json({ success: false, error: `${error}` });
  }
};
const sendDMVRecord_CriminalBackground = async (req, res) => {
  try {
    const { error, value } = sendDMV_Criminal_RecordsSchema.validate(req.body, {
      allowUnknown: false,
    });

    if (error)
      return res.status(400).json({ success: false, error: `${error}` });

    const signUpParams = {
      TableName: "signupTable",
      FilterExpression: "#email = :email",
      ExpressionAttributeNames: {
        "#email": "email",
      },
      ExpressionAttributeValues: {
        ":email": req.body.driverEmail,
      },
    };

    const scanCommand = new ScanCommand(signUpParams);
    const userData = await dynamoDocumentClient.send(scanCommand);

    if (userData.Items.length === 0)
      return res.status(400).json({ success: false, error: "Email not Found" });

    await sendVerificationEmail(
      req.body.driverEmail,
      "Background Verification Status",
      "DMV and Criminal Record \nYour approved status is: ",
      req.body.description.toUpperCase(),
      ""
    );

    AWS.config.update({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID_DRIVERS,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY_DRIVERS,
      region: process.env.REGION_DRIVERS, // replace with your S3 bucket's region
    });

    let s3 = new AWS.S3();
    if (req.body.dmvFileBase64 !== undefined) {
      let result = s3DataPdf(req.body.dmvFileBase64);
      await s3.upload(result.s3Params).promise();
      req.body.dmvFileURL = process.env.imageURL + `/${result.fileKey}`;
    }

    if (req.body.criminalFileBase64 !== undefined) {
      s3 = new AWS.S3();
      result = s3DataPdf(req.body.criminalFileBase64);
      await s3.upload(result.s3Params).promise();
      req.body.criminalFileURL = process.env.imageURL + `/${result.fileKey}`;
    }

    req.body.driverStatus = req.body.description.toLowerCase();
    if (req.body.description.toLowerCase() === "approved")
      req.body.approvedStatus = true;
    else req.body.approvedStatus = false;

    const signupParams = {
      TableName: "driversTable",
      FilterExpression: "#userId = :userId",
      ExpressionAttributeNames: {
        "#userId": "userId",
      },
      ExpressionAttributeValues: {
        ":userId": userData.Items[0].id,
      },
    };

    const command = new ScanCommand(signupParams);
    const user = await dynamoDocumentClient.send(command);

    if (user.Items.length > 0) {
      const driverParams = {
        TableName: "driversTable",
        Key: {
          id: user.Items[0].id,
        },
        UpdateExpression:
          "SET #criminalFileURL = :criminalFileURL, #dmvFileURL = :dmvFileURL, #approvedStatus = :approvedStatus, #driverStatus = :driverStatus",
        ExpressionAttributeNames: {
          "#criminalFileURL": "criminalFileURL",
          "#dmvFileURL": "dmvFileURL",
          "#approvedStatus": "approvedStatus",
          "#driverStatus": "driverStatus",
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":criminalFileURL": req.body.criminalFileURL,
          ":dmvFileURL": req.body.dmvFileURL,
          ":approvedStatus": req.body.approvedStatus,
          ":driverStatus": req.body.description,
          ":status": req.body.description,
        },
      };
      console.log(driverParams);
      const updateCommand = new UpdateCommand(driverParams);
      await dynamoDocumentClient.send(updateCommand);
    }

    return res.status(200).json({
      success: true,
      message: "Successfully Send Email to the Driver",
    });
  } catch (error) {
    return res.status(400).json({ success: false, error: `${error}` });
  }
};

const editDriverCS = async (req, res) => {
  try {
    const params = {
      TableName: "signupTable",
      Key: {
        id: req.params.id,
      },
    };
    const getCommand = new GetCommand(params);
    const user = await dynamoDocumentClient.send(getCommand);

    if (user.Item === undefined)
      return res
        .status(400)
        .json({ success: false, error: "Driver Id doesn't exist" });

    const params1 = {
      TableName: "signupTable",
      Key: {
        id: req.params.id,
      },
      UpdateExpression: "SET #email = :email, #phoneNumber = :phoneNumber",
      ExpressionAttributeNames: {
        "#email": "email",
        "#phoneNumber": "phoneNumber",
      },
      ExpressionAttributeValues: {
        ":email": req.body.email ?? user.Item.email,
        ":phoneNumber": req.body.phoneNumber ?? user.Item.phoneNumber,
      },
    };
    console.log(params1);

    const updateCommand = new UpdateCommand(params1);
    await dynamoDocumentClient.send(updateCommand);

    const driverParams = {
      TableName: "driversTable",
      FilterExpression: "#userId = :userId",
      ExpressionAttributeNames: {
        "#userId": "userId",
      },
      ExpressionAttributeValues: {
        ":userId": user.Item.id,
      },
    };

    const scanCommand = new ScanCommand(driverParams);
    const userData = await dynamoDocumentClient.send(scanCommand);

    if (userData.Items.length === 0)
      return res
        .status(400)
        .json({ success: false, error: "User has no driver data" });

    const params2 = {
      TableName: "driversTable",
      Key: {
        id: userData.Items[0].id,
      },
      UpdateExpression:
        "SET #driverName = :driverName, #licenseNumber = :licenseNumber",
      ExpressionAttributeNames: {
        "#driverName": "driverName",
        "#licenseNumber": "licenseNumber",
      },
      ExpressionAttributeValues: {
        ":driverName": req.body.driverName ?? userData.Items[0].driverName,
        ":licenseNumber":
          req.body.licenseNumber ?? userData.Items[0].licenseNumber,
      },
    };

    const updateCommand1 = new UpdateCommand(params2);
    await dynamoDocumentClient.send(updateCommand1);

    return res
      .status(200)
      .json({ success: true, message: "Driver Data Successfully Updated" });
  } catch (error) {
    return res.status(400).json({ success: false, error: `${error}` });
  }
};

const editParentCS = async (req, res) => {
  try {
    const params = {
      TableName: "signupTable",
      Key: {
        id: req.params.id,
      },
    };
    const getCommand = new GetCommand(params);
    const user = await dynamoDocumentClient.send(getCommand);

    if (user.Item === undefined)
      return res
        .status(400)
        .json({ success: false, error: "Parent Id doesn't exist" });

    const params1 = {
      TableName: "signupTable",
      Key: {
        id: req.params.id,
      },
      UpdateExpression: "SET #email = :email, #phoneNumber = :phoneNumber",
      ExpressionAttributeNames: {
        "#email": "email",
        "#phoneNumber": "phoneNumber",
        "#parentName": "parentName",
      },
      ExpressionAttributeValues: {
        ":email": req.body.email ?? user.Item.email,
        ":phoneNumber": req.body.phoneNumber ?? user.Item.phoneNumber,
      },
    };

    const updateCommand = new UpdateCommand(params1);
    await dynamoDocumentClient.send(updateCommand);

    const parentParams = {
      TableName: "parentsTable",
      FilterExpression: "#userId = :userId",
      ExpressionAttributeNames: {
        "#userId": "userId",
      },
      ExpressionAttributeValues: {
        ":userId": user.Item.id,
      },
    };

    const scanCommand = new ScanCommand(parentParams);
    const userData = await dynamoDocumentClient.send(scanCommand);

    if (userData.Items.length === 0)
      return res
        .status(400)
        .json({ success: false, error: "User has no parent data" });

    const params2 = {
      TableName: "parentsTable",
      Key: {
        id: userData.Items[0].id,
      },
      UpdateExpression: "SET #parentName = :parentName",
      ExpressionAttributeNames: {
        "#parentName": "parentName",
      },
      ExpressionAttributeValues: {
        ":parentName": req.body.parentName ?? userData.Items[0].parentName,
      },
    };

    const updateCommand1 = new UpdateCommand(params2);
    await dynamoDocumentClient.send(updateCommand1);

    return res
      .status(200)
      .json({ success: true, message: "Parent Data Successfully Updated" });
  } catch (error) {
    return res.status(400).json({ success: false, error: `${error}` });
  }
};

const searchFilterDrivers = async (req, res) => {
  try {
    //
    let queryParams = {
      TableName: "driversTable",
      FilterExpression: "",
      ExpressionAttributeNames: {},
      ExpressionAttributeValues: {},
    };
    let filterExpressions = [];
    const driverName = req.query.driverName;
    const licenseNumber = req.query.licenseNumber;
    const registrationDate = req.query.registrationDate;
    const email = req.query.email;
    const phoneNumber = req.query.phoneNumber;
    const driverStatus = req.query.driverStatus;
    if (driverStatus) {
      filterExpressions.push("#driverStatus = :driverStatus");
      queryParams.ExpressionAttributeValues[":driverStatus"] = driverStatus;
      queryParams.ExpressionAttributeNames["#driverStatus"] = "driverStatus";
    }

    if (driverName) {
      filterExpressions.push("contains(#driverName, :driverName)");
      queryParams.ExpressionAttributeValues[":driverName"] = driverName;
      queryParams.ExpressionAttributeNames["#driverName"] = "driverName";
    }

    if (licenseNumber) {
      filterExpressions.push("#licenseNumber = :licenseNumber");
      queryParams.ExpressionAttributeValues[":licenseNumber"] = licenseNumber;
      queryParams.ExpressionAttributeNames["#licenseNumber"] = "licenseNumber";
    }

    if (registrationDate) {
      const parts = registrationDate.split("-");
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // JavaScript months are 0-indexed
      const day = parseInt(parts[2], 10);

      const startOfDay = new Date(year, month, day);
      const endOfDay = new Date(year, month, day + 1);
      const startEpoch = Math.floor(startOfDay.getTime() / 1000);
      const endEpoch = Math.floor(endOfDay.getTime() / 1000) - 1;

      filterExpressions.push("#dateRegistered BETWEEN :startDay AND :endDay");
      queryParams.ExpressionAttributeValues[":startDay"] = startEpoch;
      queryParams.ExpressionAttributeValues[":endDay"] = endEpoch;
      queryParams.ExpressionAttributeNames["#dateRegistered"] =
        "dateRegistered";
    }

    if (!driverName && !licenseNumber && !registrationDate && !driverStatus)
      queryParams = {
        TableName: "driversTable",
      };
    else queryParams.FilterExpression = filterExpressions.join(" AND ");
    console.log(queryParams);
    const scanCommand = new ScanCommand(queryParams);
    const userData = await dynamoDocumentClient.send(scanCommand);

    if (userData.Items.length === 0)
      return res.status(200).json({ success: true, data: [] });

    filterExpressions = [];
    let signupParams = {
      TableName: "signupTable",
      FilterExpression: "",
      ExpressionAttributeNames: {},
      ExpressionAttributeValues: {},
    };

    if (email) {
      filterExpressions.push("#email = :email");
      signupParams.ExpressionAttributeValues[":email"] = email;
      signupParams.ExpressionAttributeNames["#email"] = "email";
    }

    if (phoneNumber) {
      const decoded = decodeURIComponent(phoneNumber);
      filterExpressions.push("#phoneNumber = :phoneNumber");
      signupParams.ExpressionAttributeValues[":phoneNumber"] = decoded;
      signupParams.ExpressionAttributeNames["#phoneNumber"] = "phoneNumber";
    }

    if (!email && !phoneNumber) {
      for (const item of userData.Items) {
        if (item.userId !== undefined) {
          const params = {
            TableName: "signupTable",
            Key: {
              id: item.userId,
            },
          };
          const getCommand = new GetCommand(params);
          const user = await dynamoDocumentClient.send(getCommand);

          if (user.Item !== undefined) {
            item.email = user.Item.email ?? "";
            item.phoneNumber = user.Item.phoneNumber ?? "";
          }
        }
      }
      console.log(userData.Items);
      const parsedPageSize = parseInt(req.query.pageSize) || 10;

      // Get the page number from the request or use a default value
      const parsedPage = parseInt(req.query.page) || 1;

      // Calculate the start and end index for the current page
      const startIndex = (parsedPage - 1) * parsedPageSize;
      const endIndex = parsedPage * parsedPageSize;

      // Get the drivers for the current page
      const driversForPage = userData.Items.slice(startIndex, endIndex);

      // Determine if there are more pages
      const hasMorePages = endIndex < userData.Items.length;

      const response = {
        success: true,
        data: driversForPage,
        pageInfo: {
          currentPage: parsedPage,
          pageSize: parsedPageSize,
          totalItems: driversForPage.length,
          hasMorePages: hasMorePages,
          totalDrivers: userData.Items.length,
        },
      };
      return res.status(200).json(response);
      //return res.status(200).json({ success: true, data: userData.Items });
    } else signupParams.FilterExpression = filterExpressions.join(" AND ");

    console.log(signupParams);
    const command = new ScanCommand(signupParams);
    const result = await dynamoDocumentClient.send(command);

    if (result.Items.length === 0)
      return res.status(200).json({ success: true, data: [] });
    else {
      let final = "";
      if (
        !driverName &&
        !licenseNumber &&
        !registrationDate &&
        !driverStatus &&
        (email || phoneNumber)
      ) {
        final = result.Items.map((driver) => {
          let matchingSignup = userData.Items.find(
            (signup) => driver.id === signup.userId
          );
          if (matchingSignup)
            return {
              ...matchingSignup,
              email: driver.email,
              phoneNumber: driver.phoneNumber,
            };
          else
            return {
              ...null,
            };
        });
      } else {
        final = userData.Items.map((driver) => {
          let matchingSignup = result.Items.find(
            (signup) => driver.userId === signup.id
          );
          if (matchingSignup)
            return {
              ...driver,
              email: matchingSignup.email,
              phoneNumber: matchingSignup.phoneNumber,
            };
          else
            return {
              ...null,
            };
        });
      }

      if (final.length !== 0) {
        const parsedPageSize = parseInt(req.query.pageSize) || 10;

        // Get the page number from the request or use a default value
        const parsedPage = parseInt(req.query.page) || 1;

        // Calculate the start and end index for the current page
        const startIndex = (parsedPage - 1) * parsedPageSize;
        const endIndex = parsedPage * parsedPageSize;

        // Get the drivers for the current page
        const parentsForPage = final.slice(startIndex, endIndex);

        // Determine if there are more pages
        const hasMorePages = endIndex < final.length;

        const response = {
          success: true,
          data: parentsForPage,
          pageInfo: {
            currentPage: parsedPage,
            pageSize: parsedPageSize,
            totalItems: parentsForPage.length,
            hasMorePages: hasMorePages,
            totalDrivers: final.length,
          },
        };
        return res.status(200).json(response);
      }
      return res.status(200).json({ success: true, data: final });
    }
  } catch (error) {
    return res.status(400).json({ success: false, error: `${error}` });
  }
};

const searchFilterParents = async (req, res) => {
  try {
    //
    let queryParams = {
      TableName: "parentsTable",
      FilterExpression: "",
      ExpressionAttributeNames: {},
      ExpressionAttributeValues: {},
    };
    let filterExpressions = [];
    const parentName = req.query.parentName;

    const email = req.query.email;
    const phoneNumber = req.query.phoneNumber;

    if (parentName) {
      filterExpressions.push("contains(#parentName, :parentName)");
      queryParams.ExpressionAttributeValues[":parentName"] = parentName;
      queryParams.ExpressionAttributeNames["#parentName"] = "parentName";
    }

    if (!parentName)
      queryParams = {
        TableName: "parentsTable",
      };
    else queryParams.FilterExpression = filterExpressions.join("");

    console.log(queryParams);
    const scanCommand = new ScanCommand(queryParams);
    const userData = await dynamoDocumentClient.send(scanCommand);

    if (userData.Items.length === 0)
      return res.status(200).json({ success: true, data: [] });

    filterExpressions = [];
    let signupParams = {
      TableName: "signupTable",
      FilterExpression: "",
      ExpressionAttributeNames: {},
      ExpressionAttributeValues: {},
    };

    if (email) {
      filterExpressions.push("#email = :email");
      signupParams.ExpressionAttributeValues[":email"] = email;
      signupParams.ExpressionAttributeNames["#email"] = "email";
    }

    if (phoneNumber) {
      const decoded = decodeURIComponent(phoneNumber);
      filterExpressions.push("#phoneNumber = :phoneNumber");
      signupParams.ExpressionAttributeValues[":phoneNumber"] = decoded;
      signupParams.ExpressionAttributeNames["#phoneNumber"] = "phoneNumber";
    }

    if (!email && !phoneNumber) {
      for (let item of userData.Items) {
        if (item.userId !== undefined) {
          const params = {
            TableName: "signupTable",
            Key: {
              id: item.userId,
            },
          };
          const getCommand = new GetCommand(params);
          const user = await dynamoDocumentClient.send(getCommand);

          if (user.Item !== undefined) {
            item.email = user.Item.email ?? "";
            item.phoneNumber = user.Item.phoneNumber ?? "";
          }
        }
      }
      const parsedPageSize = parseInt(req.query.pageSize) || 10;

      // Get the page number from the request or use a default value
      const parsedPage = parseInt(req.query.page) || 1;

      // Calculate the start and end index for the current page
      const startIndex = (parsedPage - 1) * parsedPageSize;
      const endIndex = parsedPage * parsedPageSize;

      // Get the drivers for the current page
      const parentsForPage = userData.Items.slice(startIndex, endIndex);

      // Determine if there are more pages
      const hasMorePages = endIndex < userData.Items.length;

      const response = {
        success: true,
        data: parentsForPage,
        pageInfo: {
          currentPage: parsedPage,
          pageSize: parsedPageSize,
          totalItems: parentsForPage.length,
          hasMorePages: hasMorePages,
          totalParents: userData.Items.length,
        },
      };
      return res.status(200).json(response);
    } else signupParams.FilterExpression = filterExpressions.join(" AND ");

    console.log(signupParams);

    const command = new ScanCommand(signupParams);
    const result = await dynamoDocumentClient.send(command);

    if (result.Items.length === 0)
      return res.status(200).json({ success: true, data: [] });
    else {
      let final = "";
      if (!parentName && (email || phoneNumber)) {
        final = result.Items.map((parent) => {
          let matchingSignup = userData.Items.find(
            (signup) => parent.id === signup.userId
          );
          if (matchingSignup)
            return {
              ...matchingSignup,
              email: parent.email,
              phoneNumber: parent.phoneNumber,
            };
          else
            return {
              ...null,
            };
        });
      } else {
        final = userData.Items.map((parent) => {
          let matchingSignup = result.Items.find(
            (signup) => parent.userId === signup.id
          );
          if (matchingSignup)
            return {
              ...parent,
              email: matchingSignup.email,
              phoneNumber: matchingSignup.phoneNumber,
            };
          else
            return {
              ...null,
            };
        });
      }

      if (final.length !== 0) {
        const parsedPageSize = parseInt(req.query.pageSize) || 10;

        // Get the page number from the request or use a default value
        const parsedPage = parseInt(req.query.page) || 1;

        // Calculate the start and end index for the current page
        const startIndex = (parsedPage - 1) * parsedPageSize;
        const endIndex = parsedPage * parsedPageSize;

        // Get the drivers for the current page
        const parentsForPage = final.slice(startIndex, endIndex);

        // Determine if there are more pages
        const hasMorePages = endIndex < final.length;

        const response = {
          success: true,
          data: parentsForPage,
          pageInfo: {
            currentPage: parsedPage,
            pageSize: parsedPageSize,
            totalItems: parentsForPage.length,
            hasMorePages: hasMorePages,
            totalParents: final.length,
          },
        };
        return res.status(200).json(response);
      }
      return res.status(200).json({ success: true, data: final });
    }
  } catch (error) {
    return res.status(400).json({ success: false, error: `${error}` });
  }
};

const searchDriverNoParentAssigned = async (req, res) => {
  try {
    if (req.query.latitude === "")
      return res
        .status(400)
        .json({ success: false, error: "Latitude is required" });

    if (req.query.longitude === "")
      return res
        .status(400)
        .json({ success: false, error: "Longitude is required" });

    if (req.query.radius === "")
      return res
        .status(400)
        .json({ success: false, error: "Radius is required" });

    let params = {
      TableName: "driversTable",
    };

    let scanCommand = new ScanCommand(params);
    const driverData = await dynamoDocumentClient.send(scanCommand);

    if (driverData.Items.length === 0)
      return res.status(200).json({ success: true, data: [] });

    const origin = {
      latitude: req.query.latitude,
      longitude: req.query.longitude,
    };
    const radius = req.query.radius * 1609.34;

    const driversWithinRadius = driverData.Items.filter((driver) => {
      if (
        driver.location &&
        typeof (driver.location?.latitude ?? driver.location?.latitude) !==
          "undefined" &&
        typeof (driver.location?.longitude ?? driver.location?.longitude) !==
          "undefined"
      ) {
        const distance = geolib.getDistance(origin, {
          latitude: driver.location?.latitude ?? driver.location?.latitude,
          longitude: driver.location?.longitude ?? driver.location?.longitude,
        });
        return distance <= radius;
      }
    });

    let finalList = [];
    let availableDrivers = [];
    for (const data of driversWithinRadius) {
      params = {
        TableName: "bookingsTable",
        FilterExpression:
          "#bookingStatus = :bookingStatus and #driverId = :driverId",
        ExpressionAttributeNames: {
          "#bookingStatus": "bookingStatus",
          "#driverId": "driverId",
        },
        ExpressionAttributeValues: {
          ":bookingStatus": "ACCEPTED",
          ":driverId": data.id,
        },
      };

      scanCommand = new ScanCommand(params);
      const bookingData = await dynamoDocumentClient.send(scanCommand);

      if (bookingData.Items.length === 0) {
        data.scheduleId = null;
        data.fromCustomerSupport = true;
        finalList.push(data);
      } else {
        data.scheduleId = data.scheduleId;
        data.fromCustomerSupport = true;
        availableDrivers.push(data);
      }
    }

    const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    // Get index of start and end days in the week
    const startDayIndex = daysOfWeek.indexOf(req.body.startDayOfTheWeek);
    const endDayIndex = daysOfWeek.indexOf(req.body.endDayOfTheWeek);

    for (data of availableDrivers) {
      if (data.scheduleId === null) finalList.push(data);
      else {
        params = {
          TableName: "schedulesTable",
          FilterExpression: "#id = :id",
          ExpressionAttributeNames: {
            "#id": "id",
          },
          ExpressionAttributeValues: {
            ":id": data.scheduleId,
          },
        };

        scanCommand = new ScanCommand(params);
        const scheduleData = await dynamoDocumentClient.send(scanCommand);

        let filteredDrivers = availableDrivers.filter((driver) => {
          const schedule = scheduleData.Items.find(
            (schedule) => schedule.id === driver.scheduleId
          );

          // If no matching schedule found, keep the driver
          if (!schedule) {
            return true;
          }

          // Check if any of the days in the schedule fall between the start and end days
          let removeDriver = false;

          for (let student of schedule.students) {
            for (let dayObj of student.days) {
              const dayIndex = daysOfWeek.indexOf(dayObj.day);

              // Determine if the day falls between the start and end day of the week
              if (
                (startDayIndex <= endDayIndex &&
                  dayIndex >= startDayIndex &&
                  dayIndex <= endDayIndex) ||
                (startDayIndex > endDayIndex &&
                  (dayIndex >= startDayIndex || dayIndex <= endDayIndex))
              ) {
                removeDriver = true;
                break; // No need to check further days if one is found in range
              }
            }
            if (removeDriver) break; // No need to check further students if a conflicting day is found
          }

          return !removeDriver;
        });
        finalList.push(filteredDrivers);
      }
    }

    const parsedPageSize = parseInt(req.query.pageSize) || 10;
    const parsedPage = parseInt(req.query.page) || 1;
    const startIndex = (parsedPage - 1) * parsedPageSize;
    const endIndex = parsedPage * parsedPageSize;
    const availableDriversPage = finalList.slice(startIndex, endIndex);
    const hasMorePages = endIndex < availableDriversPage.length;

    const response = {
      success: true,
      data: availableDriversPage,
      pageInfo: {
        currentPage: parsedPage,
        pageSize: parsedPageSize,
        totalItems: availableDriversPage.length,
        hasMorePages: hasMorePages,
        totalDrivers: availableDriversPage.length,
      },
    };
    return res.status(200).json(response);
  } catch (error) {
    return res.status(400).json({ success: false, error: `${error}` });
  }
};

const sendNotificationTempDriver = async (req, res) => {
  try {
    for (const data of req.body.userId) {
      const params = {
        TableName: "pushNotificationTable",
        FilterExpression: "#userId = :userId",
        ExpressionAttributeNames: {
          "#userId": "userId",
        },
        ExpressionAttributeValues: {
          ":userId": data.userId, //user.Item.userId
        },
      };
      const command = new ScanCommand(params);
      const result = await dynamoDocumentClient.send(command);

      if (result.Items.length !== 0) {
        const deviceTokenChecker = await checkDeviceToken(
          result.Items[0].deviceToken
        );
        if (deviceTokenChecker === true)
          await sendTempDriver(result.Items[0].deviceToken);
      }
    }
    return res.status(200).json({
      success: true,
      message: "Successfully Send Notification to Driver's",
    });
  } catch (error) {
    return res.status(400).json({ success: false, error: `${error}` });
  }
};
module.exports = {
  sendNotificationTempDriver,
  searchFilterParents,
  searchFilterDrivers,
  searchDriverNoParentAssigned,

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

  addDMVRecord_CriminalBackground,
  sendDMVRecord_CriminalBackground,
  sendDocumentVerification,
  deleteAdminAccountByEmail,
  editDriverCS,
  editParentCS,
  deleteDriverAccount,
  deleteParentAccount,

  loginCS,
  logOutCS,
  forgotPasswordCS,
  updatePasswordCS,
};
