const { DynamoDBDocumentClient, ScanCommand, PutCommand, GetCommand, UpdateCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");
const { v4: uuidv4 } = require('uuid');

const { dynamoClient } = require("../../config/aws");
const dynamoDocumentClient = DynamoDBDocumentClient.from(dynamoClient);

let tableName = "driversTable";
const getDriverById = async (id) => {
  const params = {
    TableName: tableName,
    Key: { id }
};
const result = await dynamoDocumentClient.send(new GetCommand(params));
return result.Item;
};

const getDriverByTaxiCode = async (taxiCode) => {
  const params = {
    TableName: tableName,
    FilterExpression: "#taxiCode = :taxiCode",
    ExpressionAttributeNames: {
      "#taxiCode": "taxiCode"
    },
    ExpressionAttributeValues: {
      ":taxiCode": taxiCode
    }
  };

  const scanCommand = new ScanCommand(params);
  const data = await dynamoDocumentClient.send(scanCommand);
  return data.Items;
};

const findAllDriversByTaxiCode = async (taxiCode, page = 1, pageSize = 10) => {
  try {
    const params = {
      TableName: tableName,
      FilterExpression: "#taxiCode = :taxiCode",
      ExpressionAttributeNames: {
        "#taxiCode": "taxiCode"
      },
      ExpressionAttributeValues: {
        ":taxiCode": taxiCode
      }
    };

    const scanCommand = new ScanCommand(params);
    const data = await dynamoDocumentClient.send(scanCommand);
    
    const totalItems = data.Items.length;
    const totalPages = Math.ceil(totalItems / pageSize);
    const startIndex = (page - 1) * pageSize;
    const paginatedItems = data.Items.slice(startIndex, startIndex + pageSize);

    return {
      items: paginatedItems,
      totalItems,
      totalPages,
      currentPage: page,
      pageSize
    };
  } catch (error) {
    console.error("Error getting drivers by taxiCode:", error);
    throw error;
  }
};

const findByEmail = async (email) => {
    try {
        const params = {
            TableName: tableName,
            FilterExpression: "#email = :email",
            ExpressionAttributeNames: {
                "#email": "email"
            },
            ExpressionAttributeValues: {
                ":email": email
            }
        };

        const scanCommand = new ScanCommand(params);
        const data = await dynamoDocumentClient.send(scanCommand);
        
        return data.Items.length > 0 ? data.Items[0] : null;
    } catch (error) {
        console.error("Error finding driver by email:", error);
        throw error;
    }
};

const create = async (driverData) => {
    try {
        const driver = {
            id: uuidv4(),
            ...driverData,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const params = {
            TableName: "driversTable",
            Item: driver
        };

        await dynamoDocumentClient.send(new PutCommand(params));
        return driver;
    } catch (error) {
        console.error("Error creating driver:", error);
        throw error;
    }
};

const getDriverByUserId = async (userId) => {
  try {
    const params = {
      TableName: "driversTable",
      FilterExpression: "#userId = :userId",
      ExpressionAttributeNames: {
        "#userId": "userId"
      },
      ExpressionAttributeValues: {
        ":userId": userId
      }
    };

    console.log("Searching for userId:", userId);
    console.log("Params:", JSON.stringify(params, null, 2));

    const scanCommand = new ScanCommand(params);
    const data = await dynamoDocumentClient.send(scanCommand);
    
    if (data.Items.length === 0) {
      return null;
    }
    return data.Items[0];
  } catch (error) {
    console.error("Error getting driver by userId:", error);
    throw error;
  }
};

const deleteDriver = async (id) => {
  try {
    const params = {
      TableName: tableName,
      Key: {
        id: id
      }
    };

    await dynamoDocumentClient.send(new DeleteCommand(params));
  } catch (error) {
    console.error("Error deleting driver:", error);
    throw error;
  }
};

const updateDriver = async (id, driverData) => {
  try {
    const updateExpression = ["set"];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    // Dynamically build update expression based on provided fields
    Object.keys(driverData).forEach((key, index) => {
      if (driverData[key] !== undefined) {
        updateExpression.push(`${index === 0 ? '' : ','} #${key} = :${key}`);
        expressionAttributeNames[`#${key}`] = key;
        expressionAttributeValues[`:${key}`] = driverData[key];
      }
    });

    // Add updatedAt timestamp
    updateExpression.push(`, #updatedAt = :updatedAt`);
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    const params = {
      TableName: tableName,
      Key: {
        id: id
      },
      UpdateExpression: updateExpression.join(''),
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'  // This will return the updated item
    };

    const result = await dynamoDocumentClient.send(new UpdateCommand(params));
    return result.Attributes;  // Return the updated driver data
  } catch (error) {
    console.error("Error updating driver:", error);
    throw error;  
  }
};

const updateDriverLocation = async (driverId, location) => {
  try {
    const params = {
      TableName: tableName,
      Key: {
        id: driverId
      },
      UpdateExpression: "set driverLocation = :driverLocation",
      ExpressionAttributeValues: {
        ":driverLocation": location
      }
    };

    const result = await dynamoDocumentClient.send(new UpdateCommand(params));
    return result.Attributes;
  } catch (error) {
    console.error("Error updating driver location:", error);
    throw error;
  }
};

const getStudentById = async (studentId) => {
  const params = {
    TableName: "studentsTable",
    Key: {
      id: studentId
    }
  };
  const result = await dynamoDocumentClient.send(new GetCommand(params));
  return result.Item;
};


const updateStudentDriver = async (driverId, studentId) => {
  try {
    // First, get the current driver data to check existing students
    const currentDriver = await getDriverById(driverId);
    const student = await getStudentById(studentId);

    // Check if student object with matching ID already exists in the array
    if (currentDriver?.students?.some(existingStudent => existingStudent.id === studentId)) {
      return currentDriver;
    }

    const params = {
      TableName: tableName,
      Key: {
        id: driverId
      },
      UpdateExpression: "SET students = list_append(if_not_exists(students, :empty_list), :new_student)",
      ExpressionAttributeValues: {
        ":new_student": [student],
        ":empty_list": []
      }
    };

    const result = await dynamoDocumentClient.send(new UpdateCommand(params));
    return result.Attributes;
  } catch (error) {
    console.error("Error updating student driver:", error);
    throw error;
  }
};

module.exports = {
    getDriverById,
    findAllDriversByTaxiCode,
    findByEmail,
    create,
    getDriverByUserId,
    deleteDriver,
    updateDriver,
    updateDriverLocation,
    getDriverByTaxiCode,
    updateStudentDriver
};
