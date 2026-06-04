const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");

const { dynamoClient } = require("../../config/aws");
const dynamoDocumentClient = DynamoDBDocumentClient.from(dynamoClient);

let tableName = "parentsTable";

const getParentById = async (id) => {
  const params = {
    TableName: tableName,
    Key: { id }
};
const result = await dynamoDocumentClient.send(new GetCommand(params));
return result.Item;
};

const getParentByUserId = async (userId) => {
  const params = {
    TableName: tableName,
    FilterExpression: "#userId = :userId",
    ExpressionAttributeNames: {
      "#userId": "userId",
    },
    ExpressionAttributeValues: {
      ":userId": userId,
    },
  };

  const command = new ScanCommand(params);
  const result = await dynamoDocumentClient.send(command);
  return result.Items[0];
};

const getParentsByDriverIdExcludingUserId = async (driverId, excludeUserId) => {
  try {
    const parentParams = {
      TableName: tableName,
      FilterExpression: "#driverId = :driverId AND #userId <> :userId",
      ExpressionAttributeNames: {
        "#driverId": "driverId",
        "#userId": "userId"
      },
      ExpressionAttributeValues: {
        ":driverId": driverId,
        ":userId": excludeUserId
      }
    };

    const scanCommand = new ScanCommand(parentParams);
    const parentData = await dynamoDocumentClient.send(scanCommand);
    
    return parentData.Items;
  } catch (error) {
    console.error("Error getting parents by driverId:", error);
    throw error;
  }
};

const getStudentsByDriverId = async (driverId, excludeUserId = null) => {
  try {
    if (!driverId) {
      throw new Error('driverId is required');
    }

    // First, get all parents with this driverId
    const parentParams = {
      TableName: tableName,
      FilterExpression: excludeUserId 
        ? "#driverId = :driverId AND #userId <> :excludeUserId"
        : "#driverId = :driverId",
      ExpressionAttributeNames: {
        "#driverId": "driverId",
        "#userId": "userId"
      },
      ExpressionAttributeValues: {
        ":driverId": driverId,
        ...(excludeUserId && { ":excludeUserId": excludeUserId })
      }
    };

    const scanCommand = new ScanCommand(parentParams);
    const parentData = await dynamoDocumentClient.send(scanCommand)
      .catch(error => {
        console.error("Error scanning parents table:", error);
        throw new Error('Failed to fetch parents data');
      });

    if (!parentData || !parentData.Items) {
      console.warn(`No parent data found or invalid response for driverId: ${driverId}`);
      return [];
    }

    if (parentData.Items.length === 0) {
      return [];
    }

    // Get all userIds from parents
    const parentUserIds = parentData.Items.map(parent => parent.userId).filter(Boolean);
    
    if (parentUserIds.length === 0) {
      console.warn(`No valid parent userIds found for driverId: ${driverId}`);
      return [];
    }

    // Now query students table for all students belonging to these parents
    const studentParams = {
      TableName: "studentsTable",
      FilterExpression: "#userId IN (" + parentUserIds.map((_, index) => `:userId${index}`).join(", ") + ")",
      ExpressionAttributeNames: {
        "#userId": "userId"
      },
      ExpressionAttributeValues: parentUserIds.reduce((acc, userId, index) => ({
        ...acc,
        [`:userId${index}`]: userId
      }), {})
    };

    const studentScanCommand = new ScanCommand(studentParams);
    const studentData = await dynamoDocumentClient.send(studentScanCommand)
      .catch(error => {
        console.error("Error scanning students table:", error);
        throw new Error('Failed to fetch students data');
      });

    if (!studentData || !studentData.Items) {
      console.warn(`No student data found or invalid response for parent userIds`);
      return [];
    }

    return studentData.Items;
  } catch (error) {
    console.error("Error getting students by driverId:", error);
    throw error;
  }
};

const getParentsByName = async (parentName) => {
  try {
    const parentParams = {
      TableName: "parentsTable",
      FilterExpression: "contains(#parentName, :parentName)",
      ExpressionAttributeNames: {
        "#parentName": "parentName"
      },
      ExpressionAttributeValues: {
        ":parentName": parentName
      }
    };

    const scanCommand = new ScanCommand(parentParams);
    const parentData = await dynamoDocumentClient.send(scanCommand);
    
    if (!parentData.Items || parentData.Items.length === 0) {
      return [];
    }

    return parentData.Items;
  } catch (error) {
    console.error("Error getting parents by name:", error);
    throw error;
  }
};

const updateParent = async (userId, updates) => {
  try {
    // Get parent by userId
    const parent = await getParentByUserId(userId);
    if (!parent) {
      throw new Error("Parent User Id doesn't exist");
    }

    // Define fields that can be updated
    const fieldsToUpdate = {
      parentName: {value: ":n", attr: "#pname"},
      address: {value: ":a", attr: "#addr"},
      city: {value: ":c", attr: "#city"},
      country: {value: ":co", attr: "#country"},
      personName: {value: ":pn", attr: "#person"},
      phoneNumber: {value: ":pnum", attr: "#phone"},
      userId: {value: ":userId", attr: "#uid"},
      emergencyPersonName: {value: ":emergencyPersonName", attr: "#epname"},
      emergencyPhoneNumber: {value: ":emergencyPhoneNumber", attr: "#ephone"},
      state: {value: ":state", attr: "#st"},
      zipcode: {value: ":zipcode", attr: "#zip"},
      age: {value: ":age", attr: "#age"}
    };

    // Build update expression
    let updateExpressionParts = [];
    const expressionAttributeValues = {};
    const expressionAttributeNames = {};

    Object.entries(fieldsToUpdate).forEach(([field, {value, attr}]) => {
      if (updates[field] !== undefined) {
        updateExpressionParts.push(`${attr}=${value}`);
        expressionAttributeValues[value] = updates[field];
        expressionAttributeNames[attr] = field;
      }
    });

    const updateExpression = updateExpressionParts.length > 0
      ? "set " + updateExpressionParts.join(", ")
      : "";

    // If no fields to update, return early
    if (!updateExpression) {
      return;
    }

    // Update parent
    const updateParams = {
      TableName: "parentsTable",
      Key: {
        id: parent.id
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ExpressionAttributeNames: expressionAttributeNames,
      ReturnValues: "UPDATED_NEW"
    };

    const updateCommand = new UpdateCommand(updateParams);
    await dynamoDocumentClient.send(updateCommand);
  } catch (error) {
    console.error("Error updating parent:", error);
    throw error;
  }
};

const isParent = async (userId) => {
  try {
    const userIdParams = {
      TableName: "signupTable",
      Key: {
        id: userId,
      },
    };

    const getCommand = new GetCommand(userIdParams);
    const result = await dynamoDocumentClient.send(getCommand);

    if (!result.Item || !result.Item.role) {
      return false;
    }

    return result.Item.role.toUpperCase() === "PARENT";
  } catch (error) {
    console.error("Error checking if user is parent:", error);
    throw error;
  }
};
const addDrivertoParent = async (userId, driverId) => {
  const params = {
    TableName: "parentsTable",
    Key: { id: userId },
    UpdateExpression: "set driverId = :driverId",
    ExpressionAttributeValues: {
      ":driverId": driverId,
    },
    ReturnValues: "UPDATED_NEW",
  };

  const command = new UpdateCommand(params);
  return dynamoDocumentClient.send(command);
};
const updateParentLocation = async (parentId, location) => {
  const params = {
    TableName: "parentsTable",
    Key: { id: parentId },
    UpdateExpression: "set parentLocation = :parentLocation",
    ExpressionAttributeValues: {
      ":parentLocation": location,
    },
    ReturnValues: "UPDATED_NEW",
  };

  const command = new UpdateCommand(params);
  return dynamoDocumentClient.send(command);
};

const updateParentDriver = async (userId, driverId) => {
  // First get the parent to find their id
  const parent = await getParentByUserId(userId);
  if (!parent) {
    throw new Error("Parent not found");
  }

  const params = {
    TableName: "parentsTable",
    Key: { id: parent.id },  // Using id instead of userId
    UpdateExpression: "set driverId = :driverId",
    ExpressionAttributeValues: {
      ":driverId": driverId,
    },
    ReturnValues: "UPDATED_NEW",
  };

  const command = new UpdateCommand(params);  
  return dynamoDocumentClient.send(command);
};


module.exports = {
  getParentById,
  getParentByUserId,
  getParentsByDriverIdExcludingUserId,
  getStudentsByDriverId,
  getParentsByName,
  updateParent,
  isParent,
  updateParentLocation,
  addDrivertoParent,
  updateParentDriver
};
