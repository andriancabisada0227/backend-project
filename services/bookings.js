const { dynamoClient } = require("../config/aws");

const {
  PutCommand,
  GetCommand,
  DynamoDBDocumentClient,
  ScanCommand,
  BatchGetCommand,
  UpdateCommand,
  BatchWriteCommand,
  DeleteCommand,
} = require("@aws-sdk/lib-dynamodb");

const dynamoDocumentClient = DynamoDBDocumentClient.from(dynamoClient);
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();
const {
  sendParentSentBookingRequestNotification,
  sendDriverHasAcceptedYourRequest,
  checkDeviceToken,
} = require("./pushnotification");

const { checkUserId, checkParent } = require("./utils/userIdChecking");
const { Booking: BookingWebhook, BookingUpdate, BookingDelete } = require("./webhook");
const bookingsRepository = require("../app/repository/bookingsRepository");
const scheduleRepository = require("../app/repository/scheduleRepository");
const driverRepository = require("../app/repository/driverRepository");
const notificationRepository = require("../app/repository/notificationRepository");
const parentsRepository = require("../app/repository/parentsRepository");

const appConstants = require("./constants/appConstants");
const {
  sendSuccess,
  sendBadRequest,
  sendUnauthorized,
  sendConflict,
  sendInternalError,
} = require("./utils/responseHandler");
const logger = require("./utils/logger");

const createBooking = async (req, res) => {
  // if (await checkUserId(req.header("UserId")))
  //   return res.status(400).json({ success: false, error: `Invalid User Id` });

  if (await checkParent(req.header("UserId")))
    return res
      .status(400)
      .json({ success: false, error: `You are not a parent user` });
  const schedule = await scheduleRepository.getScheduleById(req.body.scheduleId);
  // if(schedule){
  //   const booking = await bookingsRepository.getBookingbyscheduleId(req.body.scheduleId);
  //   if(booking){
  //     return res.status(200).json({ success: true, message: "Booking already exists", data: booking, schedule: schedule });
  //   }
  // }

  req.body.id = uuidv4();
  req.body.userId = req.header("UserId");
  req.body.bookingStatus = "WAITING";
  req.body.dateCreated = Math.floor(new Date().getTime() / 1000);
  req.body.createdAt = new Date().toISOString();

  try {
    //send driver push notification
    if (req.body.driverId !== undefined) {
      const params = {
        TableName: "driversTable",
        Key: {
          id: req.body.driverId,
        },
      };

      const getCommand = new GetCommand(params);
      const user = await dynamoDocumentClient.send(getCommand);

      if (user.Item !== undefined) {
        const params = {
          TableName: "pushNotificationTable",
          FilterExpression: "#userId = :userId",
          ExpressionAttributeNames: {
            "#userId": "userId",
          },
          ExpressionAttributeValues: {
            ":userId": req.body.driverId, //user.Item.userId
          },
        };
        const command = new ScanCommand(params);
        const result = await dynamoDocumentClient.send(command);

        if (result.Items.length !== 0) {
          const deviceTokenChecker = await checkDeviceToken(
            result.Items[0].deviceToken
          );
          if (deviceTokenChecker === true)
            await sendParentSentBookingRequestNotification(
              result.Items[0].deviceToken
            );
        }
      }
    }
    const saveParams = {
      TableName: "bookingsTable",
      Item: req.body,
    };

    const putCommand = new PutCommand(saveParams);
    const booking = await dynamoDocumentClient.send(putCommand);

    // Call webhook function directly
    if(booking) {
      try {
        await BookingWebhook({
          body: {
            bookingId: req.body.id,
          }
        }, {
          status: () => ({
            json: () => ({}) // Mock response object
          })
        });
      } catch (webhookError) {
        console.error('Webhook error:', webhookError);
      }
    }
    return res.status(200).json({
      success: true,
      message: "Booking Data Successfully Created",
      data: req.body,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const deleteBooking = async (req, res) => {
  if (await checkUserId(req.header("UserId")))
    return res.status(400).json({ success: false, error: `Invalid User Id` });

  if (await checkParent(req.header("UserId")))
    return res
      .status(400)
      .json({ success: false, error: `You are not a parent user` });

  const params = {
    TableName: "bookingsTable",
    Key: {
      id: req.params.id,
    },
  };

  try {
    const deleteCommand = new DeleteCommand(params);
    const deleted = await dynamoDocumentClient.send(deleteCommand);

    // Call webhook function directly
    if(deleted) {
      try {
        await BookingDelete({
          body: {
            bookingId: req.params.id,
          }
        }, {
          status: () => ({
            json: () => ({}) // Mock response object
          })
        });
      } catch (webhookError) {
        console.error('Webhook error:', webhookError);
      }
    }    
    return res
      .status(200)
      .json({ success: true, message: "Booking Data Successfully Deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const editBooking = async (req, res) => {
  if (await checkUserId(req.header("UserId")))
    return res.status(400).json({ success: false, error: `Invalid User Id` });

  if (await checkParent(req.header("UserId")))
    return res
      .status(400)
      .json({ success: false, error: `You are not a parent user` });

  if (Object.keys(req.body).length === 0)
    return res.status(400).json({ success: false, error: "No Data to Edit" });

  try {
    const params = {
      TableName: "bookingTable",
      Key: {
        id: req.params.id,
      },
    };

    const getCommand = new GetCommand(params);
    const user = await dynamoDocumentClient.send(getCommand);
    console.log(user);
    if (user.Item === undefined)
      return res
        .status(400)
        .json({ success: false, error: "Booking Id doesn't exists" });

    let updateExpressionParts = [];
    const expressionAttributeValues = {};

    const fieldsToUpdate = {
      driverId: ":driverId",
      totalStudent: ":totalStudent",
      scheduleId: ":scheduleId",
      bookingStatus: ":bookingStatus",
    };

    Object.keys(fieldsToUpdate).forEach((field) => {
      if (req.body[field] !== undefined) {
        updateExpressionParts.push(`${field}=${fieldsToUpdate[field]}`);
        expressionAttributeValues[fieldsToUpdate[field]] = req.body[field];
      }
    });

    // Join the parts of the update expression with ', '
    const updateExpression =
      updateExpressionParts.length > 0
        ? "set " + updateExpressionParts.join(", ")
        : "";

    console.log(updateExpression, expressionAttributeValues);

    const updateParams = {
      TableName: "bookingTable",
      Key: {
        id: req.params.id,
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "UPDATED_NEW",
    };
    const updateCommand = new UpdateCommand(updateParams);
    const updated = await dynamoDocumentClient.send(updateCommand);

    // Call webhook function directly
    if(updated) {
      try {
        await BookingUpdate({
          body: {
            bookingId: req.params.id,
          }
        }, {
          status: () => ({
            json: () => ({}) // Mock response object
          })
        });
      } catch (webhookError) {
        console.error('Webhook error:', webhookError);
      }
    }
    
    //console.log(updateUser);
    return res
      .status(200)
      .json({ success: true, message: "Booking Data Successfully Updated" });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const getBookingId = async (req, res) => {
  if (await checkUserId(req.header("UserId")))
    return res.status(400).json({ success: false, error: `Invalid User Id` });

  const params = {
    TableName: "bookingsTable",
    Key: {
      id: req.params.id,
    },
  };

  try {
    const getCommand = new GetCommand(params);
    const user = await dynamoDocumentClient.send(getCommand);
    //console.log(user);
    if (user.Item === undefined)
      return res
        .status(400)
        .json({ success: false, error: "Booking Id doesn't exists" });
    return res.status(200).json({ success: true, data: user.Item });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const confirmBooking = async (req, res) => {
    try {
        // Get booking details
        const booking = await bookingsRepository.getBookingById(req.params.id);
        if (!booking) {
            return res.status(400).json({ success: false, error: "Booking Id doesn't exists" });
        }

        // Validate booking status
        // if (booking.bookingStatus === "ACCEPTED") {
        //     return res.status(200).json({ success: true, message: "Booking Already Accepted" });
        // }

        if (!req.body.bookingStatus) {
            return res.status(400).json({ success: false, error: "Booking Status is required" });
        }

        // Get driver details
        const driver = await driverRepository.getDriverByUserId(req.header("UserId"));
        
        // Get latest schedule
        const latestSchedule = await scheduleRepository.getScheduleById(booking.scheduleId);
        if (latestSchedule) {

            if (driver) {
                // Get all bookings for this driver
                const driverBookings = await bookingsRepository.getBookingsByDriverId(driver.id);
                
                // Process schedule updates
                const scheduleUpdates = await processScheduleUpdates(driverBookings, latestSchedule);
                if (scheduleUpdates.length > 0) {
                    await scheduleRepository.batchUpdateSchedules(scheduleUpdates);
                }
            }
        }

        // Update booking status
        await bookingsRepository.confirmBookingStatus(req.params.id, req.body.bookingStatus, booking.driverId);

        // update parent driver
        await parentsRepository.updateParentDriver(booking.userId, booking.driverId);
        
        // Send notification to parent
        if (booking.userId) {
            const notifications = await notificationRepository.GetDeviceToken(booking.userId);
            if (notifications.length > 0 && notifications[0].deviceToken) {
                try {
                  await notificationService.sendNotification(
                    notifications[0].deviceToken, 
                    "Booking accepted", 
                    `your booking has been accepted by ${driver.driverName}. please check your schedule.`
                  );
                } catch (error) {
                    console.log(error);
                }
            }
        }

        const allBookings = await bookingsRepository.getAllBookingsByUserId(booking.driverId, "ACCEPTED", booking.id);
        if (allBookings.length > 0) {
            const totalStudents = allBookings.reduce((sum, booking) => sum + (booking.totalStudent || 0), 0);
            let price = 0;
            if(totalStudents === 1){
              price = 39;
            } else if(totalStudents === 2){
              price = 22;
            } else {
              price = 15;
            }
            for (const b of allBookings) {
              const notifParent = await notificationRepository.GetDeviceToken(b.userId);
              if (notifParent.length > 0 && notifParent[0].deviceToken) {
                try {
                  await notificationService.sendNotification(
                    notifParent[0].deviceToken, 
                    "Price adjustment", 
                    `you get new price adjustment for your booking. base price for each student: $${price}. Please check your schedule.`
                  );
                } catch (error) {
                  console.log(error);
                }
              }
            }
        }
        // Handle chat automation
        const chatDetails = await prepareChatDetails(booking);
        if (chatDetails) {
            await createAutomatedChat(chatDetails);
        }

        return res.status(200).json({
            success: true,
            message: "Booking Successfully Confirmed",
            data: req.body,
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: `${error}` });
    }
};

// Helper functions
const processScheduleUpdates = async (driverBookings, latestSchedule) => {
    const uniqueScheduleIds = new Set();
    const scheduleUpdates = [];

    driverBookings.forEach(booking => {
        if (!uniqueScheduleIds.has(booking.scheduleId)) {
            uniqueScheduleIds.add(booking.scheduleId);
            
            // Check if both booking and latestSchedule have students array
            const bookingStudents = booking.students || [];
            const scheduleStudents = latestSchedule.students || [];
            
            const updatedStudents = bookingStudents.filter(student => 
                !scheduleStudents.some(s => s.studentId === student.studentId)
            );

            if (updatedStudents.length !== bookingStudents.length) {
                scheduleUpdates.push({
                    ...booking,
                    students: updatedStudents
                });
            }
        }
    });

    return scheduleUpdates;
};

const prepareChatDetails = async (booking) => {
    const parent = await parentsRepository.getParentByUserId(booking.userId);
    const driver = await driverRepository.getDriverById(booking.driverId);

    if (!parent || !driver) return null;

    return {
        id: uuidv4(),
        roomID: [driver.userId, parent.userId].sort().join("_"),
        timestamp: Math.floor(new Date().getTime() / 1000),
        senderUserID: driver.userId,
        receiverUserID: parent.userId,
        message: "Automated Chat. Booking Confirmed",
        messageType: "text",
        status: "send",
        role: "driver",
        senderName: driver.driverName || driver.name,
        senderImageURL: driver.imageUrl,
        receiverName: parent.parentName || parent.name,
        receiverImageURL: parent.imageUrl || parent.imageURL,
    };
};

const createAutomatedChat = async (chatDetails) => {
    const params = {
        TableName: "chatTable",
        Item: chatDetails
    };
    return dynamoDocumentClient.send(new PutCommand(params));
};

//drivers app api
const getAllBookingsByUserId = async (req, res) => {
  if (await checkUserId(req.header("UserId")))
    return res.status(400).json({ success: false, error: `Invalid User Id` });

  try {
    const driverParams = {
      TableName: "driversTable",
      FilterExpression: "#userId = :userId",
      ExpressionAttributeNames: {
        "#userId": "userId",
      },
      ExpressionAttributeValues: {
        ":userId": req.header("UserId"),
      },
    };

    const scanCommand = new ScanCommand(driverParams);
    const user = await dynamoDocumentClient.send(scanCommand);

    if (user.Items.length === 0)
      return res
        .status(400)
        .json({ success: false, error: "Driver Id doesn't  exists" });

    const params = {
      TableName: "bookingsTable",
      FilterExpression:
        "#driverId = :driverId and #bookingStatus = :bookingStatus",
      ExpressionAttributeNames: {
        "#driverId": "driverId",
        "#bookingStatus": "bookingStatus",
      },
      ExpressionAttributeValues: {
        ":driverId": user.Items[0].id,
        ":bookingStatus": "WAITING",
      },
    };
    const command = new ScanCommand(params);
    const userData = await dynamoDocumentClient.send(command);

    if (userData.Items.length === 0)
      return res.status(200).json({ status: true, data: [] });

    for (const item of userData.Items) {
      const parentsParams = {
        TableName: "parentsTable",
        FilterExpression: "#userId = :userId",
        ExpressionAttributeNames: {
          "#userId": "userId",
        },
        ExpressionAttributeValues: {
          ":userId": item.userId ?? "",
        },
      };
      const parentScanCommand = new ScanCommand(parentsParams);
      const parentUser = await dynamoDocumentClient.send(parentScanCommand);

      if (parentUser.Items.length > 0) {
        item.imageUrl = parentUser.Items[0].imageUrl || "";
        item.name = parentUser.Items[0].parentName;
      }
    }

    return res.status(200).json({ success: true, data: userData.Items });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

module.exports = {
  createBooking,
  deleteBooking,
  confirmBooking,
  editBooking,
  getBookingId,

  //driver app api
  getAllBookingsByUserId,
};
