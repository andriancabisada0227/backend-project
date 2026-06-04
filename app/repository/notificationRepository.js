const { DynamoDBDocumentClient, ScanCommand, PutCommand, GetCommand, UpdateCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");
const { v4: uuidv4 } = require('uuid');

const { dynamoClient } = require("../../config/aws");
const dynamoDocumentClient = DynamoDBDocumentClient.from(dynamoClient);

let tableName = "pushNotificationTable";
class NotificationRepository {
    async GetDeviceToken(userId) {
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
        const result = await dynamoDocumentClient.send(new ScanCommand(params));
        return result.Items;
    }
}

module.exports = new NotificationRepository();
