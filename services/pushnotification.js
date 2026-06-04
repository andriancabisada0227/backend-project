const { dynamoClient } = require("../config/aws");
const {
  GetCommand,
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
  DeleteCommand,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");

const dynamoDocumentClient = DynamoDBDocumentClient.from(dynamoClient);
const admin = require("firebase-admin");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

// Initialize Firebase Admin SDK with your project credentials
const serviceAccount = require("../firebase-admin-sdk/schoolryde-24250-firebase-adminsdk-pfwui-5d2849b5b5.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.fireBaseDBUrl,
});

const checkIfRegisteredForPushNotif = async (deviceToken) => {
  console.log(deviceToken);
  const params = {
    TableName: "pushNotificationTable",
    FilterExpression: "#userId = :userId",
    ExpressionAttributeNames: {
      "#userId": "userId",
    },
    ExpressionAttributeValues: {
      ":userId": deviceToken,
    },
  };
  try {
    const getCommand = new ScanCommand(params);
    const user = await dynamoDocumentClient.send(getCommand);

    if (user.Items.length === 0) return false;
    return true;
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const registerForPushNotifications = async (req, res) => {
  try {
    const param = {
      TableName: "pushNotificationTable",
    };
    const scanCommand = new ScanCommand(param);
    const result = await dynamoDocumentClient.send(scanCommand);

    if (result.Items.length === 0) {
      const params = {
        TableName: "pushNotificationTable",
        Item: {
          id: uuidv4(),
          userId: req.header("UserId"),
          deviceToken: req.body.deviceToken,
          platform: req.body.platform,
        },
      };

      const putCommand = new PutCommand(params);
      await dynamoDocumentClient.send(putCommand);
      return res.status(200).json({
        success: true,
        message: "Successfully registered to receive notification",
        data: req.body,
      });
    } else {
      const param = {
        TableName: "pushNotificationTable",
        FilterExpression: "#userId = :userId",
        ExpressionAttributeNames: {
          "#userId": "userId",
        },
        ExpressionAttributeValues: {
          ":userId": req.header("UserId"),
        },
      };
      const scanCommand = new ScanCommand(param);
      const result = await dynamoDocumentClient.send(scanCommand);

      if (result.Items.length > 0) {
        const updateParams = {
          TableName: "pushNotificationTable",
          Key: {
            id: result.Items[0].id,
          },
          UpdateExpression: "SET #deviceToken = :deviceToken",
          ExpressionAttributeNames: {
            "#deviceToken": "deviceToken",
          },
          ExpressionAttributeValues: {
            ":deviceToken": req.body.deviceToken,
          },
        };

        const updateCommand = new UpdateCommand(updateParams);
        await dynamoDocumentClient.send(updateCommand);
        return res.status(200).json({
          success: true,
          message: "Device Token Updated",
        });
      }

      const params = {
        TableName: "pushNotificationTable",
        Item: {
          id: uuidv4(),
          userId: req.header("UserId"),
          deviceToken: req.body.deviceToken,
          platform: req.body.platform,
        },
      };

      const putCommand = new PutCommand(params);
      await dynamoDocumentClient.send(putCommand);
      return res.status(200).json({
        success: true,
        message: "Successfully registered to receive notification",
        data: req.body,
      });
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

// Function to unregister for push notifications
const unregisterForPushNotifications = async (req, res) => {
  try {
    const param = {
      TableName: "pushNotificationTable",
      FilterExpression: "#userId = :userId",
      ExpressionAttributeNames: {
        "#userId": "userId",
      },
      ExpressionAttributeValues: {
        ":userId": req.header("UserId"),
      },
    };
    const scanCommand = new ScanCommand(param);
    const result = await dynamoDocumentClient.send(scanCommand);

    if (result.Items.length === 0)
      return res
        .status(400)
        .json({ success: false, error: "User ID already unregistered" });

    const params = {
      TableName: "pushNotificationTable",
      Key: {
        id: result.Items[0].id,
      },
    };

    const deleteCommand = new DeleteCommand(params);
    await dynamoDocumentClient.send(deleteCommand);
    return res.status(200).json({
      success: true,
      message: "Successfully unregistered to push notification",
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const sendNotificationTest = async (req, res) => {
  try {
    console.log(message);
    const options = {
      priority: "high",
      timeToLive: 60 * 60 * 24, // 1 day
    };

    const message = {
      notification: {
        title: "Ride Request",
        body: "Waiting for driver confirmation.",
      },
    };
    let dryRun = false;
    admin
      .messaging()
      .send(
        { token: req.body.deviceToken, notification: message.notification },
        dryRun,
        options
      );

    return res
      .status(200)
      .json({ success: true, message: "push notification successfully send" });
    //return admin.messaging().send(message);
  } catch (error) {
    return res.status(400).json({ success: false, error: `${error}` });
  }
};
// A function to send a notification
const sendNotification = async (deviceToken, message) => {
  try {
    const options = {
      priority: "high",
      timeToLive: 60 * 60 * 24, // 1 day
    };
    let dryRun = false;
    return admin
      .messaging()
      .send(
        { token: deviceToken, notification: message },
        dryRun,
        options
      );
  } catch (error) {
    console.log(`${error}`);
    return `Error: ${error}`;
  }

  //}
};

const sendNotif = async (deviceToken, message) => {
  try {
    const msg = {
      token: deviceToken,
      notification: message.notification
  };
  return await admin.messaging().send(msg);
  } catch (error) {
    console.log(`${error}`);
    return `Error: ${error}`;
  }
};

const checkDeviceToken = async (deviceToken) => {
  const message = {
    token: deviceToken,
    data: {
      // Minimal data payload
      test: "test",
    },
  };
  admin
    .messaging()
    .send(message)
    .then((response) => {
      // Response is a message ID string
      console.log("Successfully sent message:", response);
      return true;
    })
    .catch((error) => {
      console.log("Error sending message:", error);
      if (
        error.code === "messaging/invalid-registration-token" ||
        error.code === "messaging/registration-token-not-registered"
      ) {
        // Handle invalid or expired token
        console.log("The device token is invalid or expired");
      }
      return false;
    });
};

// Function to send 'Waiting for driver confirmation' notification
const sendWaitingForDriverConfirmation = async (deviceToken) => {
  const message = {
    notification: {
      title: "Ride Request",
      body: "Waiting for driver confirmation.",
    },
  };
  return sendNotif(deviceToken, message);
};

// Function to send 'Student dropped off' notification
const sendStudentDroppedOff = async (deviceToken, studentName, location) => {
  const message = {
    notification: {
      title: "Student Dropped Off",
      body: `${studentName} is dropped off at ${location}.`,
    },
  };
  return sendNotif(deviceToken, message);
};

// Function to send 'Student picked up' notification
const sendStudentPickedUp = async (deviceToken, studentName, location) => {
  const message = {
    notification: {
      title: "Student Picked Up",
      body: `${studentName} is picked up at ${location}.`,
    },
  };
  console.log("sendStudentPickedUp", deviceToken, message);
  return sendNotif(deviceToken, message);
};

// Function to send 'Ride completed' notification
const sendRideCompleted = async (deviceToken) => {
  const message = {
    notification: {
      title: "Ride Completed",
      body: `Your ride is completed.`,
    },
  };
  return sendNotif(deviceToken, message);
};

// Function to send 'Driver is full' notification
const sendDriverIsFull = async (deviceToken) => {
  const message = {
    notification: {
      title: "Driver Unavailable",
      body: "Your selected driver is full. Please select another driver.",
    },
  };
  return sendNotif(deviceToken, message);
};

// Function to send 'Driver has accepted your request' notification
const sendDriverHasAcceptedYourRequest = async (deviceToken) => {
  const message = {
    notification: {
      title: "Ride Accepted",
      body: "Driver has accepted your ride request.",
    },
  };
  return sendNotif(deviceToken, message);
};

const sendParentRemovedDriverNotification = async (deviceToken) => {
  const message = {
    notification: {
      title: "Driver Removed",
      body: "The driver has been removed from your account.",
    },
  };
  return sendNotif(deviceToken, message);
};
const sendParentSentBookingRequestNotification = async (deviceToken) => {
  const message = {
    notification: {
      title: "Booking Request Sent",
      body: "Your booking request has been sent successfully.",
    },
  };
  return sendNotif(deviceToken, message);
};

const sendParentAddedNewStudentNotification = async (deviceToken) => {
  const message = {
    notification: {
      title: "New Student Added",
      body: "A new student has been added to your account.",
    },
  };
  return sendNotif(deviceToken, message);
};

const sendParentRemovedStudentNotification = async (deviceToken) => {
  const message = {
    notification: {
      title: "Student Removed",
      body: "A student has been removed from your account.",
    },
  };
  return sendNotif(deviceToken, message);
};

const sendRideCancelation = async (deviceToken, studentName, dateTime) => {
  const message = {
    notification: {
      title: "Ride Cancelation",
      body: `We regret to inform you that your scheduled ride for ${studentName} on ${dateTime} has been canceled by the driver. Please review the following options to manage this situation:`,
    },
  };
  return sendNotif(deviceToken, message);
};

const chargeParent = async (deviceToken, startDate, endDate, amount) => {
  let message = "";
  if (endDate !== "") {
    message = {
      notification: {
        title: "Invoice from SchoolRyde",
        body: `Your card has been charged for the rides taken from ${startDate} to ${endDate} for the amount of ${amount}`,
      },
    };
  } else {
    message = {
      notification: {
        title: "Invoice from SchoolRyde",
        body: `Your card has been charged for the rides taken from ${startDate} for the amount of ${amount}`,
      },
    };
  }

  return sendNotif(deviceToken, message);
};

const paymentMade = async (deviceToken, startDate, endDate, amount) => {
  let message = "";
  if (endDate !== "") {
    message = {
      notification: {
        title: "Payment from SchoolRyde",
        body: `Payment has been made for the rides from ${startDate} to ${endDate}. The amount ${amount} has been deposited to your account.`,
      },
    };
  } else {
    message = {
      notification: {
        title: "Payment from SchoolRyde",
        body: `Payment has been made for the rides from ${startDate}. The amount ${amount} has been deposited to your account.`,
      },
    };
  }

  return sendNotif(deviceToken, message);
};


const sendTempDriver = async (deviceToken) => {
  const message = {
    notification: {
      title: "Customer Support",
      body: "You have been selected to be a temporary driver.",
    },
  };
  return sendNotif(deviceToken, message);
};


const sendNotifWebhook = async (deviceToken,message) => {
  return sendNotif(deviceToken, message);
};



module.exports = {
  chargeParent,
  paymentMade,
  sendDriverHasAcceptedYourRequest,
  sendDriverIsFull,
  sendRideCompleted,
  sendStudentDroppedOff,
  sendStudentPickedUp,
  sendWaitingForDriverConfirmation,
  sendRideCancelation,
  sendParentRemovedDriverNotification,
  sendParentSentBookingRequestNotification,
  sendParentAddedNewStudentNotification,
  sendParentRemovedStudentNotification,
  sendTempDriver,

  registerForPushNotifications,
  unregisterForPushNotifications,
  sendNotificationTest,
  checkDeviceToken,

  sendNotifWebhook,
  sendNotif
};
