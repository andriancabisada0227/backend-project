const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
require("dotenv").config();

const dynamoClient = new DynamoDBClient({
  region: process.env.REGION_DRIVERS,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID_DRIVERS,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY_DRIVERS,
  },
});

const dynamoClientDrivers = new DynamoDBClient({
  region: process.env.REGION_DRIVERS,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID_DRIVERS,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY_DRIVERS,
  },
});

const { SNSClient } = require("@aws-sdk/client-sns");

let snsClient = new SNSClient({
  region: process.env.REGION_DRIVERS,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID_DRIVERS,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY_DRIVERS,
  },
});

module.exports = { snsClient, dynamoClient, dynamoClientDrivers };
