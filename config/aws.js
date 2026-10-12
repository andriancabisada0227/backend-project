const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { SNSClient } = require("@aws-sdk/client-sns");
require("dotenv").config();

const awsConfig = {
  region: process.env.REGION_DRIVERS,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID_DRIVERS,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY_DRIVERS,
  },
};

const dynamoClient = new DynamoDBClient(awsConfig);
const dynamoClientDrivers = dynamoClient;
const snsClient = new SNSClient(awsConfig);

module.exports = { snsClient, dynamoClient, dynamoClientDrivers };
