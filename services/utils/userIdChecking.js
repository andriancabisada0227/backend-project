const { dynamoClient } = require("../../config/aws");
const {
  PutCommand,
  GetCommand,
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");
const dynamoDocumentClient = DynamoDBDocumentClient.from(dynamoClient);

const checkUserId = async (userId) => {
  const userIdParentsParams = {
    TableName: "signupTable",
    Key: {
      id: userId,
    },
  };

  try {
    const getCommand = new GetCommand(userIdParentsParams);
    const result = await dynamoDocumentClient.send(getCommand);

    if (result.Item.id != "" || result.Item.id != undefined) return false;
    return true;
  } catch (error) {
    return error;
  }
};

const checkParent = async (userId) => {
  const userIdParentsParams = {
    TableName: "signupTable",
    Key: {
      id: userId,
    },
  };

  try {
    const getCommand = new GetCommand(userIdParentsParams);
    const result = await dynamoDocumentClient.send(getCommand);

    if (result.Item.role === "DRIVER") return true;

    return false;
  } catch (error) {
    return error;
  }
};

const checkDriver = async (userId) => {
  const userIdParentsParams = {
    TableName: "signupTable",
    Key: {
      id: userId,
    },
  };

  try {
    const getCommand = new GetCommand(userIdParentsParams);
    const result = await dynamoDocumentClient.send(getCommand);

    if (result.Item.role.toUpperCase() === "PARENT") return true;

    return false;
  } catch (error) {
    return error;
  }
};

module.exports = {
  checkUserId,
  checkParent,
  checkDriver,
};
