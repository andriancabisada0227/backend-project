const app = require("./app");
const PORT = process.env.PORT || 3000;
const rideTrackingApp = require("./services/routeTracking");
const chatApp = require("./services/chat");
const chatPORT = process.env.chatPORT || 3030;
const billingCronJob = require("./services/billings");
// const { DynamoDB } = require("@aws-sdk/client-dynamodb");
// const { ListTablesCommand } = require("@aws-sdk/client-dynamodb");
// const { dynamoClient } = require('./config/aws');

// Add DynamoDB connection check
// const dynamodb = new DynamoDB({
//   region: process.env.AWS_REGION || 'your-region',
// });

// async function checkDynamoDBConnection() {
//   try {
//     const response = await dynamoClient.send(new ListTablesCommand({}));
//     console.log('Successfully connected to DynamoDB');
//     console.log('Available tables:', response.TableNames);
//   } catch (error) {
//     console.error('Failed to connect to DynamoDB:', error);
//     process.exit(1);
//   }
// }

// Wrap server startup in async function
async function startServer() {
  // await checkDynamoDBConnection();

  billingCronJob.start();

  chatApp.listen(chatPORT, () => {
    console.log(`Chat Server is running on port ${chatPORT}`);
  });

  app.listen(PORT, () => {
    console.log(`REST API Server is running on port ${PORT}`);
  });

  rideTrackingApp.listen(3020, () => {
    console.log(`Ride Tracking Server is running on port 3020`);
  });
}

startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
