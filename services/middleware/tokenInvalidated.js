const { dynamoClient } = require("../../config/aws");
const {
  PutCommand,
  GetCommand,
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");

const dynamoDocumentClient = DynamoDBDocumentClient.from(dynamoClient);

const isTokenInvalidated = async (req, res, next) => {
  const token = req.header("Authorization");
  const userId = req.header("UserId");
  if (!token) {
    return res
      .status(401)
      .json({ success: false, error: "Access denied. No token provided." });
  }

  //fetch invalidTokensTable based on token and userId
  const params = {
    TableName: "invalidTokensTable",
    FilterExpression: "#authorization = :authorization and #userId = :userId",
    ExpressionAttributeNames: {
      "#authorization": "authorization",
      "#userId": "userId",
    },
    ExpressionAttributeValues: {
      ":authorization": token,
      ":userId": userId,
    },
  };

  try {
    const scanCommand = new ScanCommand(params);
    const result = await dynamoDocumentClient.send(scanCommand);

    if (result.Items.length === 0) next();
    else
      return res.status(400).json({
        success: false,
        error: "Token Expired",
      });
  } catch (error) {
    return res.status(400).send({ success: false, error: `${error}` });
  }
};

module.exports = isTokenInvalidated;
