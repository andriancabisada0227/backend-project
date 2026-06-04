const { DynamoDBDocumentClient, PutCommand, ScanCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { v4: uuidv4 } = require('uuid');

const { dynamoClient } = require("../../config/aws");
const dynamoDocumentClient = DynamoDBDocumentClient.from(dynamoClient);

let tableName = "pushNotificationTable";

class PushNotificationRepository {
    async getPushNotificationByUserId(userId) {
        const params = {
            TableName: "pushNotificationTable",
            FilterExpression: "#userId = :userId",
            ExpressionAttributeNames: {
              "#userId": "userId",
            },
            ExpressionAttributeValues: {
              ":userId": userId,
            },
          };  
        const scanCommand = new ScanCommand(params);
        const userData = await dynamoDocumentClient.send(scanCommand);
        return userData.Items;
    }   
}

module.exports = new PushNotificationRepository();