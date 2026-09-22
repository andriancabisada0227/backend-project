const { dynamoClient } = require("../../config/aws");
const {
  GetCommand,
  DynamoDBDocumentClient,
} = require("@aws-sdk/lib-dynamodb");
const dynamoDocumentClient = DynamoDBDocumentClient.from(dynamoClient);

const checkUserId = async (userId) => {
  if (!userId) return true;
  const userIdParentsParams = {
    TableName: "signupTable",
    Key: {
      id: userId,
    },
  };

  try {
    const getCommand = new GetCommand(userIdParentsParams);
    const result = await dynamoDocumentClient.send(getCommand);

    if (result.Item && result.Item.id) return false;
    return true;
  } catch (error) {
    return true;
  }
};

const checkParent = async (userId) => {
  if (!userId) return true;
  const userIdParentsParams = {
    TableName: "signupTable",
    Key: {
      id: userId,
    },
  };

  try {
    const getCommand = new GetCommand(userIdParentsParams);
    const result = await dynamoDocumentClient.send(getCommand);

    if (result.Item && result.Item.role === "DRIVER") return true;

    return false;
  } catch (error) {
    return true;
  }
};

const checkDriver = async (userId) => {
  if (!userId) return true;
  const userIdParentsParams = {
    TableName: "signupTable",
    Key: {
      id: userId,
    },
  };

  try {
    const getCommand = new GetCommand(userIdParentsParams);
    const result = await dynamoDocumentClient.send(getCommand);

    if (result.Item && result.Item.role && result.Item.role.toUpperCase() === "PARENT") return true;

    return false;
  } catch (error) {
    return true;
  }
};

module.exports = {
  checkUserId,
  checkParent,
  checkDriver,
};
