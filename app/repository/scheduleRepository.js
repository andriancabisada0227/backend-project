const { DynamoDBDocumentClient, ScanCommand, PutCommand, GetCommand, DeleteCommand, UpdateCommand, BatchWriteCommand } = require("@aws-sdk/lib-dynamodb");
const { v4: uuidv4 } = require('uuid');
const { dynamoClient } = require("../../config/aws");
const dynamoDocumentClient = DynamoDBDocumentClient.from(dynamoClient);

let tableName = "schedulesTable";

const getScheduleById = async (id) => {
    const params = {
        TableName: tableName,
        Key: { id }
    };
    const result = await dynamoDocumentClient.send(new GetCommand(params));
    return result.Item;
};

const updateScheduleStudents = async (scheduleId, students) => {
    const params = {
        TableName: tableName,
        Key: { id: scheduleId },
        UpdateExpression: "set students = :students",
        ExpressionAttributeValues: {
            ":students": students
        },
        ReturnValues: "UPDATED_NEW"
    };
    return dynamoDocumentClient.send(new UpdateCommand(params));
};

const batchUpdateSchedules = async (scheduleUpdates) => {
    const batchParams = {
        RequestItems: {
            [tableName]: scheduleUpdates.map(item => ({
                PutRequest: { Item: item }
            }))
        }
    };
    return dynamoDocumentClient.send(new BatchWriteCommand(batchParams));
};

const updateSchedule = async (scheduleId, updateData) => {
    try {
        const params = {
            TableName: tableName,
            Key: {
                id: scheduleId
            },
            UpdateExpression: 'set students = :students',
            ExpressionAttributeValues: {
                ':students': updateData.students
            },
            ReturnValues: 'ALL_NEW'
        };

        const result = await dynamoDocumentClient.send(new UpdateCommand(params));
        return result.Attributes;
    } catch (error) {
        console.error('Error updating schedule:', error);
        return null;
    }
}

const updateScheduleStudentsRideStatus = async (scheduleId, students) => {
    const params = {
        TableName: tableName,
        Key: {
            id: scheduleId
        },
        UpdateExpression: "SET #students = :students",
        ExpressionAttributeNames: {
            "#students": "students"
        },
        ExpressionAttributeValues: {
            ":students": students
        },
        ReturnValues: "UPDATED_NEW"
    };
    
    try {
        const result = await dynamoDocumentClient.send(new UpdateCommand(params));
        return result.Attributes;
    } catch (error) {
        console.error('Error updating schedule students ride status:', error);
        return null;
    }
};

module.exports = {
    getScheduleById,
    updateScheduleStudents,
    batchUpdateSchedules,
    updateSchedule,
    updateScheduleStudentsRideStatus
};
