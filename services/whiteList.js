const { dynamoClient } = require("../config/aws");
const {
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");

require("dotenv").config();
const { v4: uuidv4 } = require("uuid");
const dynamoDocumentClient = DynamoDBDocumentClient.from(dynamoClient);

const appConstants = require("./constants/appConstants");
const {
  sendSuccess,
  sendBadRequest,
  sendInternalError,
} = require("./utils/responseHandler");
const logger = require("./utils/logger");

const WHITELIST_TABLE = "whiteListTable";

const addWhiteList = async (req, res) => {
  try {
    const params = {
      TableName: WHITELIST_TABLE,
    };

    const command = new ScanCommand(params);
    const data = await dynamoDocumentClient.send(command);

    if (data.Items && data.Items.length !== 0) {
      const currentItem = data.Items[0];
      currentItem.country = currentItem.country || [];
      currentItem.stateLoc = currentItem.stateLoc || [];
      currentItem.city = currentItem.city || [];

      if (req.body.country !== undefined) {
        req.body.country.forEach((item) => {
          if (!currentItem.country.includes(item)) {
            currentItem.country.push(item);
          }
        });
      }

      if (req.body.stateLoc !== undefined) {
        req.body.stateLoc.forEach((item) => {
          if (!currentItem.stateLoc.includes(item)) {
            currentItem.stateLoc.push(item);
          }
        });
      }

      if (req.body.city !== undefined) {
        req.body.city.forEach((item) => {
          if (!currentItem.city.includes(item)) {
            currentItem.city.push(item);
          }
        });
      }

      const updateExpression =
        "set country = :country, stateLoc = :stateLoc, city = :city";
      const expressionAttributeValues = {
        ":country": currentItem.country,
        ":stateLoc": currentItem.stateLoc,
        ":city": currentItem.city,
      };

      const updateParams = {
        TableName: WHITELIST_TABLE,
        Key: {
          id: currentItem.id,
        },
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: "UPDATED_NEW",
      };

      const updateCommand = new UpdateCommand(updateParams);
      await dynamoDocumentClient.send(updateCommand);

      return sendSuccess(
        res,
        appConstants.HTTP_STATUS.OK,
        "Successfully Updated WhiteList Data",
      );
    } else {
      req.body.id = uuidv4();
      const addParams = {
        TableName: WHITELIST_TABLE,
        Item: req.body,
      };

      const putCommand = new PutCommand(addParams);
      await dynamoDocumentClient.send(putCommand);

      return sendSuccess(
        res,
        appConstants.HTTP_STATUS.OK,
        "Successfully Added WhiteList Data",
      );
    }
  } catch (error) {
    logger.error("Error in addWhiteList", error);
    return sendInternalError(res, "Failed to update whitelist", error);
  }
};

const removeWhiteList = async (req, res) => {
  try {
    const params = {
      TableName: WHITELIST_TABLE,
    };
    const command = new ScanCommand(params);
    const data = await dynamoDocumentClient.send(command);
    if (!data.Items || data.Items.length === 0) {
      return sendBadRequest(res, "No Data to Delete");
    }

    const currentItem = data.Items[0];
    currentItem.country = currentItem.country || [];
    currentItem.stateLoc = currentItem.stateLoc || [];
    currentItem.city = currentItem.city || [];

    if (req.body.country) {
      req.body.country.forEach((item) => {
        const index = currentItem.country.indexOf(item);
        if (index !== -1) {
          currentItem.country.splice(index, 1);
        }
      });
    }

    if (req.body.stateLoc) {
      req.body.stateLoc.forEach((item) => {
        const index = currentItem.stateLoc.indexOf(item);
        if (index !== -1) {
          currentItem.stateLoc.splice(index, 1);
        }
      });
    }

    if (req.body.city) {
      req.body.city.forEach((item) => {
        const index = currentItem.city.indexOf(item);
        if (index !== -1) {
          currentItem.city.splice(index, 1);
        }
      });
    }

    const updateExpression =
      "set country = :country, stateLoc = :stateLoc, city = :city";
    const expressionAttributeValues = {
      ":country": currentItem.country,
      ":stateLoc": currentItem.stateLoc,
      ":city": currentItem.city,
    };
    const updateParams = {
      TableName: WHITELIST_TABLE,
      Key: {
        id: currentItem.id,
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "UPDATED_NEW",
    };
    const updateCommand = new UpdateCommand(updateParams);
    await dynamoDocumentClient.send(updateCommand);

    return sendSuccess(
      res,
      appConstants.HTTP_STATUS.OK,
      "Successfully Removed WhiteList Data",
    );
  } catch (error) {
    logger.error("Error in removeWhiteList", error);
    return sendInternalError(res, "Failed to remove whitelist data", error);
  }
};

const checkWhiteList = async (req, res) => {
  try {
    const params = {
      TableName: WHITELIST_TABLE,
    };

    const command = new ScanCommand(params);
    const data = await dynamoDocumentClient.send(command);

    if (!data.Items || data.Items.length === 0) {
      return sendBadRequest(res, "Please add WhiteList Data");
    }

    let isNotWhitelisted = false;
    const currentItem = data.Items[0];

    if (req.query.country !== undefined) {
      if (!currentItem.country || !currentItem.country.includes(req.query.country)) {
        isNotWhitelisted = true;
      }
    }

    if (req.query.stateLoc !== undefined) {
      if (!currentItem.stateLoc || !currentItem.stateLoc.includes(req.query.stateLoc)) {
        isNotWhitelisted = true;
      }
    }

    if (req.query.city !== undefined) {
      if (!currentItem.city || !currentItem.city.includes(req.query.city)) {
        isNotWhitelisted = true;
      }
    }

    if (isNotWhitelisted) {
      return sendBadRequest(res, "Location is not in the WhiteList");
    }

    return sendSuccess(
      res,
      appConstants.HTTP_STATUS.OK,
      "Location is in the WhiteList",
    );
  } catch (error) {
    logger.error("Error in checkWhiteList", error);
    return sendInternalError(res, "Failed to check whitelist", error);
  }
};

module.exports = {
  addWhiteList,
  removeWhiteList,
  checkWhiteList,
};
