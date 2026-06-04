const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, QueryCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { v4: uuidv4 } = require('uuid');

const { dynamoClient } = require("../../config/aws");
const dynamoDocumentClient = DynamoDBDocumentClient.from(dynamoClient);

let tableName = "routesTable";
class RoutesRepository {
    async createRoute(routeData) {
        const params = {    
            TableName: tableName,
            Item: routeData,
        };  
        const result = await dynamoDocumentClient.send(new PutCommand(params));
        return result;
    }

    async getRouteById(routeId) {
        const params = {
            TableName: tableName,
            Key: { id: routeId },
        };  
        const result = await dynamoDocumentClient.send(new GetCommand(params));
        return result.Item;
    }

    async getRouteByScheduleId(scheduleId) {
        const params = {
            TableName: tableName,
            FilterExpression: "scheduleId = :scheduleId",
            ExpressionAttributeValues: {
                ":scheduleId": scheduleId
            }
        };
        const result = await dynamoDocumentClient.send(new ScanCommand(params));
        return result.Items[0];
    }
    
    async updateRoute(routeId, routeData) {
        const params = {
            TableName: tableName,
            Key: { id: routeId },
            UpdateExpression: "SET #students = :students, #longitude = :longitude, #latitude = :latitude",
            ExpressionAttributeNames: {
                "#students": "students",
                "#longitude": "longitude",
                "#latitude": "latitude"
            },
            ExpressionAttributeValues: {
                ":students": routeData.students,
                ":longitude": routeData.longitude,
                ":latitude": routeData.latitude
            },
            ReturnValues: "ALL_NEW"
        };
        const result = await dynamoDocumentClient.send(new UpdateCommand(params));
        return result.Attributes;
    }
}

module.exports = new RoutesRepository();
