const { DynamoDBDocumentClient, GetCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");

const { dynamoClient } = require("../../config/aws");
const dynamoDocumentClient = DynamoDBDocumentClient.from(dynamoClient);

let tableName = "studentsTable";

const getStudentById = async (id) => {
    const params = {
        TableName: tableName,
        Key: { id }
    };
    const result = await dynamoDocumentClient.send(new GetCommand(params));
    return result.Item;
};

const getStudentParentById = async (id) => {
    const params = {
        TableName: tableName,
        FilterExpression: "userId = :userId",
        ExpressionAttributeValues: {
            ":userId": id
        }
    };
    const result = await dynamoDocumentClient.send(new ScanCommand(params));
    return result.Items;
};

module.exports = {
    getStudentById, getStudentParentById
};
