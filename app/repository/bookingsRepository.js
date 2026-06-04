const { DynamoDBDocumentClient, ScanCommand, PutCommand, GetCommand, DeleteCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { v4: uuidv4 } = require('uuid');
const { dynamoClient } = require("../../config/aws");
const dynamoDocumentClient = DynamoDBDocumentClient.from(dynamoClient);

let tableName = "bookingsTable";

const getBookingById = async (id) => {
    const params = {
        TableName: tableName,
        Key: { id }
    };
    const result = await dynamoDocumentClient.send(new GetCommand(params));
    return result.Item;
};

const getBookingsByTaxiCode = async (taxiCode, page, pageSize) => {
    const params = {
        TableName: tableName,
        FilterExpression: 'taxiCode = :taxiCode',
        ExpressionAttributeValues: {
            ':taxiCode': taxiCode
        },
        Limit: pageSize,
        ScanIndexForward: false
    };

    const result = await dynamoDocumentClient.send(new ScanCommand(params));
    return result.Items;
};

const getBookingsBydriverIDs = async (driverIDs, page, pageSize) => {
    // Create the filter expression parts dynamically
    const filterExpressionParts = driverIDs.map((_, index) => `driverId = :driverId${index}`);
    const filterExpression = filterExpressionParts.join(' OR ');
    
    // Create the expression attribute values dynamically
    const expressionAttributeValues = driverIDs.reduce((acc, driverId, index) => {
        acc[`:driverId${index}`] = driverId;
        return acc;
    }, {});

    const params = {
        TableName: tableName,
        FilterExpression: filterExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        Limit: pageSize,
        ScanIndexForward: false
    };
    
    try {
        const result = await dynamoDocumentClient.send(new ScanCommand(params));
        let items = result.Items || [];
        
        // Fetch schedule data for each booking
        items = await Promise.all(items.map(async (booking) => {
            if (booking.scheduleId) {
                const scheduleParams = {
                    TableName: "schedulesTable", // Make sure this matches your schedule table name
                    Key: { id: booking.scheduleId }
                };
                const scheduleResult = await dynamoDocumentClient.send(new GetCommand(scheduleParams));
                return {
                    ...booking,
                    scheduleData: scheduleResult.Item || null
                };
            }
            return {
                ...booking,
                scheduleData: null
            };
        }));
        
        // Calculate pagination
        const startIndex = (page - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const paginatedItems = items.slice(startIndex, endIndex);
        
        return {
            items: paginatedItems,
            totalItems: items.length,
            currentPage: page,
            pageSize: pageSize,
            totalPages: Math.ceil(items.length / pageSize)
        };
    } catch (error) {
        console.error("Error fetching new bookings:", error);
        throw error;
    }
};

const updateBooking = async (id, status) => {
    const params = {
        TableName: tableName,
        Key: { id },
        UpdateExpression: "SET bookingStatus = :status",
        ExpressionAttributeValues: {
            ":status": status
        },
        ReturnValues: "UPDATED_NEW"
    };
    const result = await dynamoDocumentClient.send(new UpdateCommand(params));
    return result.Attributes;
};

const assignDriverToBooking = async (bookingId, driverId) => {
    const params = {
      TableName: "bookingsTable",
      Key: { id: bookingId },
      UpdateExpression: "set driverId = :driverId",
      ExpressionAttributeValues: {
        ":driverId": driverId,
      },
      ReturnValues: "UPDATED_NEW",
    };
  
    const command = new UpdateCommand(params);
    return dynamoDocumentClient.send(command);
  };

const confirmBookingStatus = async (bookingId, status, driverId) => {
    const params = {
        TableName: "bookingsTable",
        Key: { id: bookingId },
        UpdateExpression: "set bookingStatus = :status, driverId = :driverId",
        ExpressionAttributeValues: {
            ":status": status,
            ":driverId": driverId
        },
        ReturnValues: "UPDATED_NEW"
    };
    return dynamoDocumentClient.send(new UpdateCommand(params));
};

const getBookingsByDriverId = async (driverId) => {
    const params = {
        TableName: "bookingsTable",
        FilterExpression: "#driverId = :driverId",
        ExpressionAttributeNames: {
            "#driverId": "driverId"
        },
        ExpressionAttributeValues: {
            ":driverId": driverId
        }
    };
    const result = await dynamoDocumentClient.send(new ScanCommand(params));
    return result.Items;
};

const getBookingbyscheduleId = async (scheduleId) => {
    const params = {
        TableName: "bookingsTable",
        FilterExpression: "#scheduleId = :scheduleId",
        ExpressionAttributeNames: {
            "#scheduleId": "scheduleId"
        },
        ExpressionAttributeValues: {
            ":scheduleId": scheduleId
        }   
    };
    const result = await dynamoDocumentClient.send(new ScanCommand(params));
    return result.Items;
};

const getAllBookingsByUserId = async (driverId, bookingStatus, excludeBookingId = null) => {
    const params = {
        TableName: "bookingsTable",
        FilterExpression: "#driverId = :driverId AND #bookingStatus = :bookingStatus",
        ExpressionAttributeNames: {
            "#driverId": "driverId",
            "#bookingStatus": "bookingStatus"  
        },
        ExpressionAttributeValues: {
            ":driverId": driverId,
            ":bookingStatus": bookingStatus
        }
    };
    if (excludeBookingId) {
        params.FilterExpression += " AND id <> :excludeBookingId";
        params.ExpressionAttributeValues[":excludeBookingId"] = excludeBookingId;
    }
    const result = await dynamoDocumentClient.send(new ScanCommand(params));
    return result.Items;
};

const getAllnewBookings = async (page = 1, pageSize = 10) => {
    const params = {
        TableName: "bookingsTable",
        FilterExpression: "attribute_not_exists(driverId) OR #driverId = :emptyDriverId",
        ExpressionAttributeNames: {
            "#driverId": "driverId"
        },
        ExpressionAttributeValues: {
            ":emptyDriverId": ""
        }
    };

    try {
        const result = await dynamoDocumentClient.send(new ScanCommand(params));
        let items = result.Items || [];
        
        // Fetch schedule data for each booking
        items = await Promise.all(items.map(async (booking) => {
            if (booking.scheduleId) {
                const scheduleParams = {
                    TableName: "schedulesTable", // Make sure this matches your schedule table name
                    Key: { id: booking.scheduleId }
                };
                const scheduleResult = await dynamoDocumentClient.send(new GetCommand(scheduleParams));
                return {
                    ...booking,
                    scheduleData: scheduleResult.Item || null
                };
            }
            return {
                ...booking,
                scheduleData: null
            };
        }));
        
        // Calculate pagination
        const startIndex = (page - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const paginatedItems = items.slice(startIndex, endIndex);
        
        return {
            items: paginatedItems,
            totalItems: items.length,
            currentPage: page,
            pageSize: pageSize,
            totalPages: Math.ceil(items.length / pageSize)
        };
    } catch (error) {
        console.error("Error fetching new bookings:", error);
        throw error;
    }
};

module.exports = {
    getBookingById,
    getBookingsByTaxiCode,
    updateBooking,
    assignDriverToBooking,
    confirmBookingStatus,
    getBookingsByDriverId,
    getAllBookingsByUserId,
    getAllnewBookings,
    getBookingbyscheduleId,
    getBookingsBydriverIDs
};
