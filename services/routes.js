const { dynamoClient } = require("../config/aws");

const {
  PutCommand,
  GetCommand,
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");

const dynamoDocumentClient = DynamoDBDocumentClient.from(dynamoClient);
const { v4: uuidv4 } = require("uuid");
const AWS = require("aws-sdk");
require("dotenv").config();
const { checkUserId } = require("../services/utils/userIdChecking");
const {
  sendStudentPickedUp,
  sendStudentDroppedOff,
  sendRideCompleted,
} = require("./pushnotification");

const { sendInvoice } = require("../mailer");
const { getParentByUserId, getStudentsByDriverId } = require('../app/repository/parentsRepository');
const { getAllBookingsByUserId } = require('../app/repository/bookingsRepository');
const { getDriverById } = require('../app/repository/driverRepository');
const notificationService = require('../app/services/notificationService');

const e = require("express");
const startRide = async (req, res) => {
  if (await checkUserId(req.header("UserId")))
    return res.status(400).json({ success: false, message: `Invalid User Id` });

  try {
    //save the booking to routesTable and set status to in progress
    req.body.rideStatus = "PICKING_UP_HOME";
    req.body.id = uuidv4();

    let newDate = new Date();
    let newDateString = newDate.toISOString().slice(0, 10);
    req.body.date = newDateString;

    const saveParams = {
      TableName: "routesTable",
      Item: req.body,
    };

    const putCommand = new PutCommand(saveParams);
    await dynamoDocumentClient.send(putCommand);
    return res.status(201).json({
      success: true,
      message: "Ride Successfully started",
      data: req.body,
    });
  } catch (error) {
    return res.status(400).json({ success: false, error: `${error}` });
  }
};

const cancelRideStudents = async (req, res) => {
  if (await checkUserId(req.header("UserId")))
    return res.status(400).json({ success: false, message: `Invalid User Id` });

  try {
    req.body.id = uuidv4();
    // let newDate = new Date();
    // let newDateString = newDate.toISOString().slice(0, 10);
    // req.body.date = newDateString;
    req.body.dateCreated = Math.floor(new Date().getTime() / 1000);
    const saveParams = {
      TableName: "cancelRideStudentsTable",
      Item: req.body,
    };

    const putCommand = new PutCommand(saveParams);
    await dynamoDocumentClient.send(putCommand);

    return res.status(200).json({
      success: true,
      message: "Cancel Ride Students Successfully Added",
    });
  } catch (error) {
    return res.status(400).json({ success: false, error: `${error}` });
  }
};

const endRide = async (req, res) => {
  if (await checkUserId(req.header("UserId")))
    return res.status(400).json({ success: false, message: `Invalid User Id` });

  try {
    const params = {
      TableName: "routesTable",
      Key: {
        id: req.body.id,
      },
    };

    const getCommand = new GetCommand(params);
    const user = await dynamoDocumentClient.send(getCommand);
    if (user.Item === undefined)
      return res
        .status(400)
        .json({ success: false, error: "ride id doesn't exists" });

    if (user.Item.rideDistance !== -1)
      return res
        .status(400)
        .json({ success: false, error: "Ride Already Ended" });
    //set ride status to completed.
    const updateParams = {
      TableName: "routesTable",
      Key: {
        id: req.body.id,
      },
      UpdateExpression: "SET #rideDistance = :rideDistance",
      ExpressionAttributeNames: {
        "#rideDistance": "rideDistance",
      },
      ExpressionAttributeValues: {
        ":rideDistance": req.body.distance,
      },
      ReturnValues: "UPDATED_NEW",
    };

    const updateCommand = new UpdateCommand(updateParams);
    await dynamoDocumentClient.send(updateCommand);

    //save to dynamodb
    //driver earnings -- parent payment
    let amountToPay = 0;
    if (req.body.distance <= 5) amountToPay = 12;
    else if (req.body.distance > 5 && req.body.distance <= 10) amountToPay = 24;
    else if (req.body.distance > 10 && req.body.distance <= 15)
      amountToPay = 36;
    else if (req.body.distance > 15 && req.body.distance <= 20)
      amountToPay = 48;
    else if (req.body.distance > 20 && req.body.distance <= 25)
      amountToPay = 60;
    else if (req.body.distance > 25 && req.body.distance <= 30)
      amountToPay = 72;
    else if (req.body.distance > 30 && req.body.distance <= 35)
      amountToPay = 84;
    else if (req.body.distance > 35 && req.body.distance <= 40)
      amountToPay = 96;
    else if (req.body.distance > 40 && req.body.distance <= 45)
      amountToPay = 108;
    else if (req.body.distance > 45 && req.body.distance <= 50)
      amountToPay = 120;
    else
      return res
        .status(400)
        .json({ success: false, error: "Distance is more than 20 miles" });

    const checkAccountParams = {
      TableName: "earningsTable",
      FilterExpression: "#driverUserId = :driverUserId",
      ExpressionAttributeNames: {
        "#driverUserId": "driverUserId",
      },
      ExpressionAttributeValues: {
        ":driverUserId": req.header("UserId"),
      },
    };
    const checkAccountScanParams = new ScanCommand(checkAccountParams);
    const dataResult = await dynamoDocumentClient.send(checkAccountScanParams);

    if (dataResult.Items.length !== 0) {
      const updateParams = {
        TableName: "earningsTable",
        Key: {
          id: dataResult.Items[0].id,
        },
        UpdateExpression: "SET #earnings = :earnings",
        ExpressionAttributeNames: {
          "#earnings": "earnings",
        },
        ExpressionAttributeValues: {
          ":earnings": dataResult.Items[0].earnings + amountToPay,
        },
        ReturnValues: "UPDATED_NEW",
      };

      const updateCommand = new UpdateCommand(updateParams);
      await dynamoDocumentClient.send(updateCommand);
    } else {
      const addEarningsParams = {
        TableName: "earningsTable",
        Item: {
          id: uuidv4(),
          driverUserId: req.header("UserId"),
          earnings: amountToPay,
          createdDate: Math.floor(new Date().getTime() / 1000),
        },
      };
      const putEarningsCommand = new PutCommand(addEarningsParams);
      await dynamoDocumentClient.send(putEarningsCommand);
    }

    const getParentUserIdParams = {
      TableName: "schedulesTable",
      Key: {
        id: user.Item.scheduleId,
      },
    };

    const getParentUserIdCommand = new GetCommand(getParentUserIdParams);
    const resultData = await dynamoDocumentClient.send(getParentUserIdCommand);

    if (resultData.Item !== undefined) {
      //update can also be added here -- rideStatus: ""
      resultData.Item.students.forEach((newStudent) => {
        newStudent.rideStatus = "";
      });
      const updateParams = {
        TableName: "schedulesTable",
        Key: {
          id: resultData.Item.id,
        },
        UpdateExpression: "SET #students = :students",
        ExpressionAttributeNames: {
          "#students": "students",
        },
        ExpressionAttributeValues: {
          ":students": resultData.Item.students,
        },
        ReturnValues: "UPDATED_NEW",
      };
      const updateCommand = new UpdateCommand(updateParams);
      await dynamoDocumentClient.send(updateCommand);

      const checkAccountParams = {
        TableName: "paymentsTable",
        FilterExpression: "#parentUserId = :parentUserId",
        ExpressionAttributeNames: {
          "#parentUserId": "parentUserId",
        },
        ExpressionAttributeValues: {
          ":parentUserId": resultData.Item.userId,
        },
      };
      const checkAccountScanParams = new ScanCommand(checkAccountParams);
      const dataResult = await dynamoDocumentClient.send(
        checkAccountScanParams
      );

      //insert invoiceHistory for the PDF itemize
      //invoiceHistory
      const createdDate = new Date();
      const addPaymentParams = {
        TableName: "invoiceHistory",
        Item: {
          id: uuidv4(),
          parentUserId: resultData.Item.userId,
          driverUserId: req.header("UserId"),
          scheduleId: resultData.Item.id,
          amountToPay: amountToPay,
          createdDate: createdDate.toISOString().slice(0, 10),
          rideDistance: req.body.rideDistance,
        },
      };

      const putCommand = new PutCommand(addPaymentParams);
      await dynamoDocumentClient.send(putCommand);

      if (dataResult.Items.length !== 0) {
        const updateParams = {
          TableName: "paymentsTable",
          Key: {
            id: dataResult.Items[0].id,
          },
          UpdateExpression:
            "SET #amountToPay = :amountToPay, #inclusiveDate = :inclusiveDate",
          ExpressionAttributeNames: {
            "#amountToPay": "amountToPay",
            "#inclusiveDate": "inclusiveDate",
          },
          ExpressionAttributeValues: {
            ":amountToPay": dataResult.Items[0].amountToPay + amountToPay,
            ":inclusiveDate": [
              ...dataResult.Items[0].inclusiveDate,
              new Date().toISOString().slice(0, 10),
            ],
          },
          ReturnValues: "UPDATED_NEW",
        };

        const updateCommand = new UpdateCommand(updateParams);
        await dynamoDocumentClient.send(updateCommand);
      } else {
        const addPaymentParams = {
          TableName: "paymentsTable",
          Item: {
            id: uuidv4(),
            parentUserId: resultData.Item.userId,
            driverUserId: req.header("UserId"),
            amountToPay: amountToPay,
            createdDate: Math.floor(new Date().getTime() / 1000),
            inclusiveDate: [new Date().toISOString().slice(0, 10)],
          },
        };

        const putCommand = new PutCommand(addPaymentParams);
        await dynamoDocumentClient.send(putCommand);
      }

      //check if isRecurrence is false - send immediate invoice via email to the parent
      //isRecurrence true - send invoice every friday to the parent

      //for driver isRecurrence false - reflect the earnings immediately
      //isRecurrence true - reflect the earnings friday end of the day

      //what should be the notification message? ask naveen after DSM

      if (resultData.Item.isRecurrence === false) {
        //resultData.Item.userId -- parent user id
        const getParams = {
          TableName: "parentsTable",
          FilterExpression: "#userId = :userId",
          ExpressionAttributeNames: {
            "#userId": "userId",
          },
          ExpressionAttributeValues: {
            ":userId": resultData.Item.userId,
          },
        };

        const scanCommand = new ScanCommand(getParams);
        const userData = await dynamoDocumentClient.send(scanCommand);

        //parentEmail, parent name, startDate, amount
        const parentName = userData.Items[0].parentName ?? "";
        const startDate = user.Item.date ?? "";

        const params = {
          TableName: "signupTable",
          Key: {
            id: resultData.Item.userId,
          },
        };

        const getCommand = new GetCommand(params);
        const userResult = await dynamoDocumentClient.send(getCommand);

        const email = userResult.Item.email ?? "";

        await sendInvoice(email, parentName, startDate, "", amount);
      }
    }

    //send push notification to parent
    if (resultData.Item.deviceToken !== undefined) {
      const params = {
        TableName: "pushNotificationTable",
        FilterExpression: "#userId = :userId",
        ExpressionAttributeNames: {
          "#userId": "userId",
        },
        ExpressionAttributeValues: {
          ":userId": resultData.Item.userId,
        },
      };

      const scanCommand = new ScanCommand(params);
      const userData = await dynamoDocumentClient.send(scanCommand);
      if (userData.Items[0].deviceToken !== undefined)
        await sendRideCompleted(userData.Items[0].deviceToken);
    }

    return res.status(200).json({
      success: true,
      message: "Ride Successfully Completed",
    });
  } catch (error) {
    return res.status(400).json({ success: false, error: `${error}` });
  }
};

const rideStatus = async (req, res) => {
  if (await checkUserId(req.header("UserId")))
    return res.status(400).json({ success: false, message: `Invalid User Id` });

  const params = {
    TableName: "routesTable",
    Key: {
      id: req.body.id,
    },
  };

  try {
    const getCommand = new GetCommand(params);
    const user = await dynamoDocumentClient.send(getCommand);
    if (user.Item === undefined)
      return res
        .status(400)
        .json({ success: false, error: "ride id doesn't exists" });

    return res.status(200).json({ success: false, data: user.Item });
  } catch (error) {
    return res.status(400).json({ success: false, error: `${error}` });
  }
};

const pickUpStudent = async (res, req) => {
  if (await checkUserId(req.header("UserId")))
    return res.status(400).json({ success: false, message: `Invalid User Id` });

  if (req.body.deviceToken === undefined)
    return res
      .status(400)
      .json({ success: false, error: "Device Token is required" });
  try {
    const params = {
      TableName: "routesTable",
      Key: {
        id: req.body.id,
      },
    };

    const id = req.body.id;

    const getCommand = new GetCommand(params);
    const user = await dynamoDocumentClient.send(getCommand);
    if (user.Item === undefined)
      return res
        .status(400)
        .json({ success: false, error: "ride id doesn't exists" });

    //set ride status to completed.
    let rideStatus = "";
    if (user.Item.rideStatus === "PICKING_UP_HOME")
      rideStatus = "PICKED_UP_HOME";
    else if (user.Item.rideStatus === "DROPPED_OFF_SCHOOL")
      rideStatus = "PICKING_UP_SCHOOL";
    else rideStatus = "PICKED_UP_SCHOOL";

    const updateParams = {
      TableName: "routesTable",
      Key: { id },
      UpdateExpression: "SET #rideStatus = :rideStatus",
      ExpressionAttributesNames: {
        "#rideStatus": "rideStatus",
      },
      ExpressionAttributeValues: {
        ":rideStatus": rideStatus,
      },
      ReturnValues: "UPDATED_NEW",
    };

    const updateCommand = new UpdateCommand(updateParams);
    await dynamoDocumentClient.send(updateCommand);

    if (req.body.deviceToken !== undefined)
      await sendStudentPickedUp(
        req.body.deviceToken,
        req.body.studentName,
        req.body.location
      );

    return res
      .status(200)
      .json({ success: true, message: `${rideStatus} Successfully` });
  } catch (error) {
    return res.status(400).json({ success: false, error: `${error}` });
  }
};

const dropOffStudent = async (res, req) => {
  if (await checkUserId(req.header("UserId")))
    return res.status(400).json({ success: false, message: `Invalid User Id` });

  if (req.body.deviceToken === undefined)
    return res
      .status(400)
      .json({ success: false, error: "Device Token is required" });

  try {
    const params = {
      TableName: "routesTable",
      Key: {
        id: req.body.id,
      },
    };

    const id = req.body.id;

    const getCommand = new GetCommand(params);
    const user = await dynamoDocumentClient.send(getCommand);
    if (user.Item === undefined)
      return res
        .status(400)
        .json({ success: false, error: "ride id doesn't exists" });

    //set ride status to completed.
    let rideStatus = "";
    if (user.Item.rideStatus === "PICKED_UP_HOME")
      rideStatus = "DROPPED_OFF_SCHOOL";
    else if (user.Item.rideStatus === "PICKED_UP_SCHOOL")
      rideStatus = "DROPPED_OFF_HOME";

    const updateParams = {
      TableName: "routesTable",
      Key: { id },
      UpdateExpression: "SET #rideStatus = :rideStatus",
      ExpressionAttributesNames: {
        "#rideStatus": "rideStatus",
      },
      ExpressionAttributeValues: {
        ":rideStatus": rideStatus,
      },
      ReturnValues: "UPDATED_NEW",
    };

    const updateCommand = new UpdateCommand(updateParams);
    await dynamoDocumentClient.send(updateCommand);

    if (req.body.deviceToken !== undefined)
      await sendStudentDroppedOff(
        req.body.deviceToken,
        req.body.studentName,
        req.body.location
      );
    return res
      .status(200)
      .json({ success: true, message: `${rideStatus} Successfully` });
  } catch (error) {
    return res.status(400).json({ success: false, error: `${error}` });
  }
};

const parentRideStatus = async (req, res) => {
  try {
    // Validate schedule ID
    if (!req.params.id) {
      return res.status(400).json({ 
        success: false, 
        error: "Schedule ID is required" 
      });
    }

    // First query to get schedule - FIXED params structure
    const params = {
      TableName: "schedulesTable",
      Key: {
        id: req.params.id.toString() // Ensure ID is a string
      }
    };

    const getCommand = new GetCommand(params);
    const user = await dynamoDocumentClient.send(getCommand);

    if (!user.Item) {
      return res.status(400).json({ 
        success: false, 
        error: "Schedule Id doesn't exist" 
      });
    }

    let obj = {
      driver: {},
      students: user.Item.students || [], // Ensure students is always an array
      scheduleId: user.Item.id
    };

    // Handle cancelled students
    const params2 = {
      TableName: "cancelRideStudentsTable",
      FilterExpression: "#scheduleId = :scheduleId",
      ExpressionAttributeNames: {
        "#scheduleId": "scheduleId",
      },
      ExpressionAttributeValues: {
        ":scheduleId": req.params.id,
      },
    };

    const scanCommand2 = new ScanCommand(params2);
    const userData2 = await dynamoDocumentClient.send(scanCommand2);

    if (userData2.Items && userData2.Items.length > 0 && userData2.Items[0].student) {
      obj.students = obj.students.filter((student) => {
        return !userData2.Items[0].student.some(
          (deleteStudent) => deleteStudent.studentId === student.studentId
        );
      });
    }

    // Get student details
    if (obj.students && obj.students.length > 0) {
      for (const student of obj.students) {
        if (!student.studentId) continue;
        
        const studentParams = {
          TableName: "studentsTable",
          Key: {
            id: student.studentId
          }
        };

        const studentGetCommand = new GetCommand(studentParams);
        const studentUser = await dynamoDocumentClient.send(studentGetCommand);
        
        if (studentUser.Item) {
          student.studentDetails = {
            imageUrl: studentUser.Item.imageUrl || null,
            age: studentUser.Item.age || null,
            name: studentUser.Item.studentName || null,
            school: studentUser.Item.schoolName || null,
            grade: studentUser.Item.grade || null
          };
        }
      }
    }

    // Get booking details
    const params1 = {
      TableName: "bookingsTable",
      FilterExpression: "#scheduleId = :scheduleId",
      ExpressionAttributeNames: {
        "#scheduleId": "scheduleId",
      },
      ExpressionAttributeValues: {
        ":scheduleId": req.params.id,
      },
    };

    const scanCommand1 = new ScanCommand(params1);
    const userData1 = await dynamoDocumentClient.send(scanCommand1);

    if (userData1.Items && userData1.Items.length > 0) {
      const sortedData = userData1.Items.sort((a, b) => {
        return parseInt(b.dateCreated || 0) - parseInt(a.dateCreated || 0);
      });
      const latestBooking = sortedData[0];

      if (latestBooking.driverId) {
        // Try direct driver lookup first
        const getParams = {
          TableName: "driversTable",
          Key: {
            id: latestBooking.driverId,
          },
        };
        const getCommand = new GetCommand(getParams);
        const userResult = await dynamoDocumentClient.send(getCommand);

        let driverData = userResult.Item;
        let userId = '';

        // If direct lookup fails, try by userId
        if (!driverData) {
          const scanParams = {
            TableName: "driversTable",
            FilterExpression: "#userId = :userId",
            ExpressionAttributeNames: {
              "#userId": "userId",
            },
            ExpressionAttributeValues: {
              ":userId": latestBooking.driverId,
            },
          };

          const scanCommand = new ScanCommand(scanParams);
          const userData = await dynamoDocumentClient.send(scanCommand);
          
          if (userData.Items && userData.Items.length > 0) {
            driverData = userData.Items[0];
          }
        }

        if (driverData) {
          obj.driver = {
            id: latestBooking.driverId || null,
            licenseNumber: driverData.licenseNumber || null,
            name: driverData.driverName || null,
            imageUrl: driverData.imageUrl || null,
            age: driverData.age || null,
            vehicleType: driverData.vehicleType || null,
            vehicleName: driverData.vehicleName || null,
          };
          userId = driverData.userId;

          // Get additional driver details from signup table
          if (userId) {
            const signupParams = {
              TableName: "signupTable",
              Key: {
                id: userId,
              },
            };
            const getCommand2 = new GetCommand(signupParams);
            const user2 = await dynamoDocumentClient.send(getCommand2);

            if (user2.Item) {
              obj.driver.email = user2.Item.email || null;
              obj.driver.phoneNumber = user2.Item.phoneNumber || null;
            }
          }
        }
      }

      // Get current ride status
      const newDate = new Date();
      const newDateString = newDate.toISOString().slice(0, 10);

      const scanParams = {
        TableName: "routesTable",
        FilterExpression: "#scheduleId = :scheduleId AND #date = :date",
        ExpressionAttributeNames: {
          "#scheduleId": "scheduleId",
          "#date": "date",
        },
        ExpressionAttributeValues: {
          ":scheduleId": req.params.id,
          ":date": newDateString,
        },
      };

      const scanCommand = new ScanCommand(scanParams);
      const userData = await dynamoDocumentClient.send(scanCommand);

      if (userData.Items && userData.Items.length > 0) {
        const routeData = userData.Items[0];
        if (routeData.students) {
          routeData.students.forEach((update) => {
            const studentToUpdate = obj.students.find(
              (student) => student.studentId === update.studentId
            );
            if (studentToUpdate) {
              studentToUpdate.rideStatus = {
                rideStatus: update.rideStatus || '',
                date: update.date || newDateString,
              };
            }
          });
        }
      }
    }

    return res.status(200).json({ success: true, data: obj });
  } catch (error) {
    console.error('ParentRideStatus Error:', error);
    return res.status(400).json({ 
      success: false, 
      error: error.message || 'An error occurred while processing the request' 
    });
  }
};

const driverRideStatus = async (req, res) => {
  try {
    //save the booking to routesTable and set status to in progress

    req.body.id = uuidv4();
    let newDate = new Date();
    let newDateString = newDate.toISOString().slice(0, 10);
    req.body.date = newDateString;
    req.body.driverId = req.params.driverid;
    req.body.studentId = req.params.studentId;
    req.body.time = newDate.toISOString().slice(0, newDate.length);
    const saveParams = {
      TableName: "routesTable",
      Item: req.body,
    };

    const putCommand = new PutCommand(saveParams);
    await dynamoDocumentClient.send(putCommand);
    return res.status(201).json({
      success: true,
      message: "Driver Ride Status Updated",
      data: req.body,
    });
  } catch (error) {
    return res.status(400).json({ success: false, error: `${error}` });
  }
};

const updateRideStatus = async (req, res) => {
  try {
    if (req.body.id === undefined) {
      req.body.id = uuidv4();
      let newDate = new Date();
      let newDateString = newDate.toISOString().slice(0, 10);
      req.body.dateCreated = newDateString;
      req.body.driverUserId = req.header("UserId");
      req.body.rideDistance = -1;
      const saveParams = {
        TableName: "routesTable",
        Item: req.body,
      };

      const putCommand = new PutCommand(saveParams);
      await dynamoDocumentClient.send(putCommand);

      //update schedule with the rideStatus attribute
      //code here
      const scheduleId = req.body.scheduleId;

      const getParams = {
        TableName: "schedulesTable",
        Key: {
          id: scheduleId,
        },
      };

      const getCommand = new GetCommand(getParams);
      const user = await dynamoDocumentClient.send(getCommand);
      console.log("schedule user", user);
      if (user.Item !== undefined) {
        req.body.students.forEach((update) => {
          // Find the matching student in the schedule
          let student = user.Item.students.find(
            (s) => s.studentId === update.studentId
          );
          if (student) {
            // Update the ride status
            student.rideStatus = update.rideStatus;
          }
        });

        const updateParams = {
          TableName: "schedulesTable",
          Key: {
            id: req.body.scheduleId,
          },
          UpdateExpression: "SET #students = :students",
          ExpressionAttributeNames: {
            "#students": "students",
          },
          ExpressionAttributeValues: {
            ":students": user.Item.students,
          },
          ReturnValues: "UPDATED_NEW",
        };
        console.log(JSON.stringify(updateParams));
        const updateCommand = new UpdateCommand(updateParams);
        await dynamoDocumentClient.send(updateCommand);
      }

      return res.status(201).json({
        success: true,
        message: "Ride Successfully Created",
        data: req.body,
      });
    } else {
      const params = {
        TableName: "routesTable",
        Key: {
          id: req.body.id,
        },
      };

      const getCommand = new GetCommand(params);
      const user = await dynamoDocumentClient.send(getCommand);

      if (user.Item === undefined)
        return res
          .status(400)
          .json({ success: false, error: "ride id doesn't exists" });

      //
      req.body.students.forEach((update) => {
        // Find the matching student in the schedule
        let student = user.Item.students.find(
          (s) => s.studentId === update.studentId
        );
        if (student) {
          // Update the ride status
          student.rideStatus = update.rideStatus;
        }
      });
      //console.log(JSON.stringify(user.Item));
      const scheduleId = req.body.scheduleId;
      const getParams = {
        TableName: "schedulesTable",
        Key: {
          id: scheduleId,
        },
      };

      const scheduleCommand = new GetCommand(getParams);
      const userResult = await dynamoDocumentClient.send(scheduleCommand);
      console.log("schedule userResult", userResult);
      if (userResult.Item !== undefined) {
        user.Item.students.forEach((update) => {
          // Find the matching student in the schedule
          let student = userResult.Item.students.find(
            (s) => s.studentId === update.studentId
          );
          if (student) {
            // Update the ride status
            student.rideStatus = update.rideStatus;
          }
        });

        const updateParams = {
          TableName: "schedulesTable",
          Key: {
            id: scheduleId,
          },
          UpdateExpression: "SET #students = :students",
          ExpressionAttributeNames: {
            "#students": "students",
          },
          ExpressionAttributeValues: {
            ":students": userResult.Item.students,
          },
        };
        //console.log(JSON.stringify(updateParams));
        const updateCommand = new UpdateCommand(updateParams);
        await dynamoDocumentClient.send(updateCommand);
      }

      //push notification
      console.log("try to send notification")
      for (const item of req.body.students) {
        const getParams = {
          TableName: "studentsTable",
          Key: {
            id: item.studentId,
          },
        };
        const getStudentCommand = new GetCommand(getParams);
        const userResult = await dynamoDocumentClient.send(getStudentCommand);
        console.log("userResult", userResult);
        if (userResult.Item !== undefined) {
          const parentUserId = userResult.Item.userId;
          console.log("parentUserId", parentUserId);
          const params = {
            TableName: "pushNotificationTable",
            FilterExpression: "#userId = :userId",
            ExpressionAttributeNames: {
              "#userId": "userId",
            },
            ExpressionAttributeValues: {
              ":userId": parentUserId,
            },
          };

          const scanCommand = new ScanCommand(params);
          const userData = await dynamoDocumentClient.send(scanCommand);
          if (userData.Items.length !== 0) {
            if (item.rideStatus === "PICKED_UP_HOME") {
              await notificationService.sendNotification(
                userData.Items[0].deviceToken, 
                "Student picked up", 
                `${userResult.Item.studentName} has arrived at your home.`
              );
            } else if (item.rideStatus === "DROPPED_OFF_SCHOOL") {
              await notificationService.sendNotification(
                userData.Items[0].deviceToken, 
                "Student dropped off", 
                `${userResult.Item.studentName} has arrived at school.`
              );
            } else if (item.rideStatus === "DROPPED_OFF_HOME") {
              await notificationService.sendNotification(
                userData.Items[0].deviceToken, 
                "Student dropped off", 
                `${userResult.Item.studentName} has arrived at your home.`
              );
            } else if (item.rideStatus === "PICKED_UP_SCHOOL") {
              await notificationService.sendNotification(
                userData.Items[0].deviceToken, 
                "Student picked up", 
                `${userResult.Item.studentName} has arrived at school.`
              );
            } else if (item.rideStatus === "DROPPED_OFF_SCHOOL") {
              await notificationService.sendNotification(
                userData.Items[0].deviceToken, 
                "Student dropped off", 
                `${userResult.Item.studentName} has arrived at school.`
              );
            }
          }
        }
      }

      const updateParams = {
        TableName: "routesTable",
        Key: {
          id: req.body.id,
        },
        UpdateExpression:
          "SET #students = :students,#longitude = :longitude, #latitude = :latitude",
        ExpressionAttributeNames: {
          "#students": "students",
          "#latitude": "latitude",
          "#longitude": "longitude",
        },
        ExpressionAttributeValues: {
          ":students": user.Item.students,
          ":latitude": req.body.latitude,
          ":longitude": req.body.longitude,
        },
      };

      //update schedule with the rideStatus attribute
      //code here

      const updateCommand = new UpdateCommand(updateParams);
      await dynamoDocumentClient.send(updateCommand);
      return res.status(201).json({
        success: true,
        message: "Ride Successfully Update",
        data: req.body,
      });
    }
  } catch (error) {
    return res.status(400).json({ success: false, error: `${error}` });
  }
};

const rideCost = async (req, res) => {
  try {
    const parentId = req.header("UserId");

    // Validate request body
    if (!req.body.students || !Array.isArray(req.body.students) || req.body.students.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid request: students array is required"
      });
    }

    // Validate each student has a valid studentId
    for (const student of req.body.students) {
      if (!student.studentId || typeof student.studentId !== 'string' || student.studentId.trim() === '') {
        return res.status(400).json({
          success: false,
          error: "Invalid student ID provided"
        });
      }
    }

    const students = await Promise.all(
      req.body.students.map(async (student) => {
        // Get name and imageUrl
        const params = {
          TableName: "studentsTable",
          Key: {
            id: student.studentId.trim() // Ensure the ID is trimmed
          },
        };

        const getCommand = new GetCommand(params);
        const user = await dynamoDocumentClient.send(getCommand);

        if (!user.Item) {
          throw new Error(`Student not found with ID: ${student.studentId}`);
        }

        return {
          ...student,
          imageUrl: user.Item.imageUrl,
          studentName: user.Item.studentName,
          parentUserId: user.Item.userId
        };
      })
    );
    const parent = await getParentByUserId(parentId ?? students[0].parentUserId);
    if (!parent) {
      return res.status(400).json({
        success: false,
        error: "Parent not found"
      });
    }

    let additionalStudents = 0;
    //check if parent has a driver
    if(parent.driverId){
      const driver = await getDriverById(parent.driverId);
      if(driver){
        const studentsDrivers = await getAllBookingsByUserId(driver.id, "ACCEPTED");
        if(studentsDrivers.length > 0){
          studentsDrivers.forEach(e => {
            additionalStudents = e.totalStudent;
          });
        }
      }
    }
    // Get base price based on number of kids
    const numKids = students.length + (additionalStudents ?? 0);

    let baseCost;
    if (numKids === 1) {
      baseCost = 39;
    } else if (numKids === 2) {
      baseCost = 22;
    } else {
      baseCost = 15;
    }

    // Calculate final cost for each student based on distance
    students.forEach(student => {
      if (student.distance <= 5) {
        student.cost = baseCost;
      }
      else if (student.distance > 5 && student.distance <= 10) {
        student.cost = baseCost + 12;
      }
      else if (student.distance > 10 && student.distance <= 15) {
        student.cost = baseCost + 24;
      }
      else if (student.distance > 15 && student.distance <= 20) {
        student.cost = baseCost + 36;
      }
      else if (student.distance > 20 && student.distance <= 25) {
        student.cost = baseCost + 48;
      }
      else if (student.distance > 25 && student.distance <= 30) {
        student.cost = baseCost + 60;
      }
      else if (student.distance > 30 && student.distance <= 35) {
        student.cost = baseCost + 72;
      }
      else if (student.distance > 35 && student.distance <= 40) {
        student.cost = baseCost + 84;
      }
      else if (student.distance > 40 && student.distance <= 45) {
        student.cost = baseCost + 96;
      }
      else if (student.distance > 45 && student.distance <= 50) {
        student.cost = baseCost + 108;
      }
      else {
        student.cost = -1;
      }
    });

    // Check if any student has an invalid distance
    if (students.some(student => student.cost === -1)) {
      return res.status(400).json({
        success: false,
        error: "Rides not supported distance is > 50 miles",
      });
    }

    return res.status(200).json({
      success: true,
      data: students,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const parentRideCostAcceptance = async (req, res) => {
  if (req.header("UserId") == undefined || req.header("UserId") == "")
    return res
      .status(400)
      .json({ success: false, message: "User Id is required" });

  if (req.body.acceptance == false)
    return res
      .status(200)
      .json({ success: false, message: "Ride Cost Acceptance is false" });

  req.body.id = uuidv4();
  req.body.role = "parent";
  let newDate = new Date();
  let newDateString = newDate.toISOString().slice(0, 10);
  req.body.date = newDateString;
  req.body.parentUserId = req.header("UserId");
  const saveParams = {
    TableName: "rideCostAcceptance",
    Item: req.body,
  };

  const putCommand = new PutCommand(saveParams);
  await dynamoDocumentClient.send(putCommand);
  return res.status(200).json({
    success: true,
    message: "Ride Cost Acceptance is true",
    data: req.body,
  });
};

const driverRideCostAcceptance = async (req, res) => {
  if (req.header("UserId") == undefined || req.header("UserId") == "")
    return res
      .status(400)
      .json({ success: false, message: "User Id is required" });

  if (req.body.acceptance == false)
    return res
      .status(200)
      .json({ success: false, message: "Ride Cost Acceptance is false" });

  req.body.id = uuidv4();
  req.body.role = "driver";
  let newDate = new Date();
  let newDateString = newDate.toISOString().slice(0, 10);
  req.body.date = newDateString;
  req.body.driverUserId = req.header("UserId");
  const saveParams = {
    TableName: "rideCostAcceptance",
    Item: req.body,
  };

  const putCommand = new PutCommand(saveParams);
  await dynamoDocumentClient.send(putCommand);
  return res.status(200).json({
    success: true,
    message: "Ride Cost Acceptance is true",
    data: req.body,
  });
};

module.exports = {
  rideCost,
  parentRideCostAcceptance,
  driverRideCostAcceptance,
  startRide,
  cancelRideStudents,
  endRide,
  rideStatus,
  pickUpStudent,
  dropOffStudent,
  driverRideStatus,
  parentRideStatus,
  updateRideStatus,
};
