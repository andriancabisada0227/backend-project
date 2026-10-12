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

  const chatServer = chatApp.listen(chatPORT, () => {
    console.log(`Chat Server is running on port ${chatPORT}`);
  });

  const restServer = app.listen(PORT, () => {
    console.log(`REST API Server is running on port ${PORT}`);
  });

  const trackingServer = rideTrackingApp.listen(3020, () => {
    console.log(`Ride Tracking Server is running on port 3020`);
  });

  // Graceful shutdown handling
  let isShuttingDown = false;
  async function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\nReceived ${signal}. Initiating graceful shutdown...`);

    try {
      if (billingCronJob && typeof billingCronJob.stop === 'function') {
        billingCronJob.stop();
        console.log('Stopped billing cron job.');
      }
    } catch (err) {
      console.error('Error stopping cron job:', err);
    }

    const closeHttpServer = (serverInstance, name) => {
      return new Promise((resolve) => {
        if (!serverInstance || !serverInstance.close) return resolve();
        serverInstance.close((err) => {
          if (err) {
            console.error(`Error closing ${name}:`, err);
          } else {
            console.log(`Closed ${name}.`);
          }
          resolve();
        });
      });
    };

    // Close servers in parallel with a timeout guarantee
    const shutdownTimeout = setTimeout(() => {
      console.warn('Forcefully terminating process after shutdown timeout.');
      process.exit(1);
    }, 10000);

    await Promise.all([
      closeHttpServer(restServer, 'REST API Server'),
      closeHttpServer(chatServer, 'Chat Server'),
      closeHttpServer(trackingServer, 'Ride Tracking Server'),
    ]);

    clearTimeout(shutdownTimeout);
    console.log('Graceful shutdown complete.');
    process.exit(0);
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

