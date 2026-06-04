const { dynamoClient } = require("../config/aws");

const {
  PutCommand,
  GetCommand,
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");
const jwt = require("jsonwebtoken");
const dynamoDocumentClient = DynamoDBDocumentClient.from(dynamoClient);
const { v4: uuidv4 } = require("uuid");
const AWS = require("aws-sdk");
require("dotenv").config();

const getParentByUserId = async (userId) => {
  try {
    const parentsParams = {
      TableName: "parentsTable",
      FilterExpression: "#userId = :userId",
      ExpressionAttributeNames: {
        "#userId": "userId",
      },
      ExpressionAttributeValues: {
        ":userId": userId,
      },
    };

    const command = new ScanCommand(parentsParams);
    const userData = await dynamoDocumentClient.send(command);

    if (userData.Items.length != 0) return true;
    return false;
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const getDriverByUserId = async (userId) => {
  const params = {
    TableName: "driversTable",
    FilterExpression: "#userId = :userId",
    ExpressionAttributeNames: {
      "#userId": "userId",
    },
    ExpressionAttributeValues: {
      ":userId": userId,
    },
  };

  try {
    const command = new ScanCommand(params);
    const userData = await dynamoDocumentClient.send(command);

    if (userData.Items.length != 0) return true;
    return false;
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const oAuth = async (req, res) => {
  const email = req.body.email;
  if (!email)
    return res
      .status(400)
      .json({ success: false, message: "Email is required" });

  try {
    const emailParams = {
      TableName: "signupTable",
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

    const user = userData.Items;
    if (userData.Items.length !== 0) {
      if (req.query.role !== userData.Items[0].role)
        return res
          .status(400)
          .json({ success: false, error: "Invalid Login Details" });

      const result = await getParentByUserId(user[0].id);
      if (result) {
        const params = {
          TableName: "parentsTable",
          FilterExpression: "#userId = :userId",
          ExpressionAttributeNames: {
            "#userId": "userId",
          },
          ExpressionAttributeValues: {
            ":userId": user[0].id,
          },
        };
        const scanCommand = new ScanCommand(params);
        const resultData = await dynamoDocumentClient.send(scanCommand);

        const token = jwt.sign({ email }, process.env.jwtSecretToken, {
          expiresIn: "28800s",
        });
        return res.status(200).json({
          success: true,
          message: `Parent's Detail Already Encoded`,
          token,
          isRegistered: true,
          expiration: "28800",
          userId: user[0].id,
          customerId: resultData.Items[0].customerId ?? "",
          parentId: resultData.Items[0].id ?? "",
        });
      } else {
        const resultDriver = await getDriverByUserId(user[0].id);
        if (resultDriver) {
          const params = {
            TableName: "driversTable",
            FilterExpression: "#userId = :userId",
            ExpressionAttributeNames: {
              "#userId": "userId",
            },
            ExpressionAttributeValues: {
              ":userId": user[0].id,
            },
          };
          const scanCommand = new ScanCommand(params);
          const resultData = await dynamoDocumentClient.send(scanCommand);

          const token = jwt.sign({ email }, process.env.jwtSecretToken, {
            expiresIn: "28800s",
          });
          return res.status(200).json({
            success: true,
            message: `Driver's Detail Already Encoded`,
            token,
            isRegistered: true,
            expiration: "28800",
            userId: user[0].id,
            customerId: resultData.Items[0].customerId ?? "",
            driverId: resultData.Items[0].id,
          });
        }
      }
      const token = jwt.sign({ email }, process.env.jwtSecretToken, {
        expiresIn: "28800s",
      });

      return res.status(200).json({
        success: true,
        token,
        isRegistered: false,
        expiration: "28800",
        userId: user[0].id,
      });
    } else {
      const params = {
        TableName: "signupTable",
        FilterExpression: "#email = :email",
        ExpressionAttributeNames: {
          "#email": "email",
        },
        ExpressionAttributeValues: {
          ":email": req.body.email,
        },
      };

      const command = new ScanCommand(params);
      const userData = await dynamoDocumentClient.send(command);

      if (userData.Items.length !== 0)
        return res
          .status(400)
          .json({ success: false, error: "Email already exist" });

      const userId = uuidv4();
      const saveParams = {
        TableName: "signupTable",
        Item: {
          id: userId,
          email: req.body.email,
          phoneNumber: "",
          password: "",
          verificationToken: "",
          isVerified: true,
          provider: req.body.provider,
          customerId: "",
          role: req.body.role,
          taxiCode: req.body.taxiCode,
        },
      };

      const saveCommand = new PutCommand(saveParams);
      await dynamoDocumentClient.send(saveCommand);
      //const userItems = data.Items;

      const token = jwt.sign({ email }, process.env.jwtSecretToken, {
        expiresIn: "28800s",
      });

      return res.status(200).json({
        success: true,
        message: `OAuth ${req.body.provider} Successful`,
        token,
        expiration: "28800",
        isRegistered: false,
        userId: userId,
      });
    }
  } catch (error) {
    return res.status(400).send({ success: false, error: `${error}` });
  }
};
module.exports = { oAuth };
