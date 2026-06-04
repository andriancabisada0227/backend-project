const { dynamoClient } = require("../config/aws");

const {
  PutCommand,
  GetCommand,
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
  DeleteCommand,
  BatchGetCommand,
} = require("@aws-sdk/lib-dynamodb");

const dynamoDocumentClient = DynamoDBDocumentClient.from(dynamoClient);
const { v4: uuidv4 } = require("uuid");
const AWS = require("aws-sdk");
require("dotenv").config();
const {
  checkUserId,
  checkParent,
} = require("../services/utils/userIdChecking");
const updateStudentDetails = require("../services/utils/studentDetails");
const dateFormat = require("./utils/dateFormat");
const scheduleSchema = require("./validation/schedules.validation");
const { CancelScheduleParent, updateSchedule, deleteSchedule } = require("./webhook");
/**
 * @swagger
 * /schedule/{id}:
 *   get:
 *     summary: Retrieve a schedule by its ID
 *     description: Fetch a specific schedule using its unique ID.
 *     tags:
 *      - Schedule
 *     parameters:
 *       - in: header
 *         name: UserId
 *         required: true
 *         description: User ID to validate.
 *         schema:
 *           type: string
 *       - in: path
 *         name: id
 *         required: true
 *         description: Unique ID of the schedule.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Schedule retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       400:
 *         description: Invalid user ID or schedule does not exist.
 *       500:
 *         description: Internal server error.
 */
const getScheduleById = async (req, res) => {
  if (await checkUserId(req.header("UserId")))
    return res.status(400).json({ success: false, error: `Invalid User Id` });

  if (req.params.id === undefined)
    return res
      .status(400)
      .json({ success: false, error: "Schedule Id is required" });

  const params = {
    TableName: "schedulesTable",
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
        .json({ success: false, error: "schedule doesn't exists" });

    for (const student of user.Item.students) {
      if (student.cost === undefined) student.cost = 0;
    }

    const result = await updateStudentDetails(user, "get");
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const searchAllSchedule = async (req, res) => {
  // if (await checkUserId(req.header("UserId")))
  //   return res.status(400).json({ success: false, error: `Invalid User Id` });

  try {
    if (req.query.startDate !== undefined && req.query.endDate !== undefined) {
      let startDate = parseInt(req.query.startDate);
      let endDate = parseInt(req.query.endDate);

      const dayDifference = Math.round((endDate - startDate) / (24 * 60 * 60)); // Calculate difference in days

      if (dayDifference >= 7) {
        endDate = startDate + 6 * 24 * 60 * 60 + 23 * 60 * 60 + 59 * 6;
      }
      startDate = startDate.toString();
      endDate = endDate.toString();
      console.log(startDate, endDate);
      const getParams = {
        TableName: "schedulesTable",
        FilterExpression: "#userId = :userId",
        ExpressionAttributeNames: {
          "#userId": "userId",
        },
        ExpressionAttributeValues: {
          ":userId": req.header("UserId"),
        },
      };
      const command = new ScanCommand(getParams);
      const userData = await dynamoDocumentClient.send(command);

      if (userData.Items.length !== 0) {
        //get latest  schedule

        const sortedResult = userData.Items.sort((a, b) => {
          return (
            parseInt(b.createdDate) * 1000 - parseInt(a.createdDate) * 1000
          );
        });

        let slicedData = sortedResult.slice(0, 1);

        const startDateMs = startDate * 1000;
        const endDateMs = endDate * 1000;

        slicedData.forEach((entry) => {
          entry.students = entry.students.filter((student) => {
            return student.days.some((day) => {
              const daysOfWeek = [
                "Sun",
                "Mon",
                "Tue",
                "Wed",
                "Thu",
                "Fri",
                "Sat",
              ];
              const dayIndex = daysOfWeek.indexOf(day.day);

              // Find the next date matching the day of the week within the range
              let currentDayMs = new Date(startDateMs); // Start from the beginning of the range
              currentDayMs.setDate(
                currentDayMs.getDate() +
                  ((7 + dayIndex - currentDayMs.getDay()) % 7)
              );

              let validDayFound = false;
              while (currentDayMs.getTime() <= endDateMs) {
                // Extract hours and minutes from pickUpTime
                const timeParts = day.pickUpTime.match(/(\d+):(\d+)(AM|PM)?/);
                const hours = parseInt(timeParts[1], 10);
                const minutes = parseInt(timeParts[2], 10);
                const isPM = timeParts[3] === "PM";

                const hoursAdjusted =
                  (hours % 12) + (isPM && hours !== 12 ? 12 : 0);
                // Calculate the exact timestamp for pickUpTime
                let rideTimestamp = new Date(
                  currentDayMs.getFullYear(),
                  currentDayMs.getMonth(),
                  currentDayMs.getDate(),
                  hoursAdjusted,
                  minutes
                ).getTime();

                if (
                  rideTimestamp >= startDateMs &&
                  rideTimestamp <= endDateMs
                ) {
                  validDayFound = true;
                  break; // Exit if a valid day is found
                }

                // Move to the next week
                currentDayMs.setDate(currentDayMs.getDate() + 7);
              }

              return validDayFound;
            });
          });
        });

        if (slicedData.length === 0)
          return res.status(200).json({ success: true, data: {} });

        //remove students who are found in the record
        //with the same days specification

        const cancelParams = {
          TableName: "cancelScheduleStudentsTable",
          FilterExpression: "#scheduleId = :scheduleId and #userId = :userId",
          ExpressionAttributeNames: {
            "#scheduleId": "scheduleId",
            "#userId": "userId",
          },
          ExpressionAttributeValues: {
            ":scheduleId": slicedData[0].id,
            ":userId": req.header("UserId"),
          },
        };

        const cancelCommand = new ScanCommand(cancelParams);
        const user = await dynamoDocumentClient.send(cancelCommand);

        if (user.Items.length === 0) {
          const resultStudent = await updateStudentDetails(slicedData, "scan");
          let result = resultStudent.filter(
            (item) => item.students && item.students.length > 0
          );
          if (result.length !== 0) {
            delete result[0].rideStatus;

            //ride cost code
            for (const student of result[0].students) {
              if (student.cost === undefined) student.cost = 0;
            }

            return res.status(200).json({ success: true, data: result[0] });
          } else return res.status(200).json({ success: true, data: {} });
        }

        // //sort to latest cancel schedule student
        const sortedData1 = user.Items.sort((a, b) => {
          return (
            parseInt(b.createdDate) * 1000 - parseInt(a.createdDate) * 1000
          );
        });

        let cancelSchedule = sortedData1.slice(0, 1);

        let basedStartDate = parseInt(req.query.startDate);
        let basedEndDate = parseInt(req.query.endDate);
        slicedData.forEach((item) => {
          item.students = item.students.filter((student) => {
            let cancelData = cancelSchedule.find(
              (cancel) => cancel.scheduleId === item.id
            );
            if (cancelData) {
              let cancelStudent = cancelData.students.find(
                (cancelStudent) => cancelStudent.studentId === student.studentId
              );
              if (cancelStudent) {
                if (student.isRecurrence) {
                  return !(
                    cancelStudent.startDate <= basedEndDate &&
                    cancelStudent.endDate >= basedStartDate
                  );
                } else {
                  return !student.days.some(
                    (day) =>
                      day.exactDate >= basedStartDate &&
                      day.exactDate <= basedEndDate
                  );
                }
              }
            }
            return true;
          });
        });

        const resultStudent = await updateStudentDetails(slicedData, "scan");
        let result = resultStudent.filter(
          (item) => item.students && item.students.length > 0
        );
        if (result.length !== 0) {
          delete result[0].rideStatus;

          for (const student of result[0].students) {
            if (student.cost === undefined) student.cost = 0;
          }

          return res.status(200).json({ success: true, data: result[0] });
        } else return res.status(200).json({ success: true, data: {} });
      }
      return res.status(200).json({ success: true, data: {} });
    } else {
      //get schedule no params
      const getParams = {
        TableName: "schedulesTable",
        FilterExpression: "#uId = :userId",
        ExpressionAttributeNames: {
          "#uId": "userId",
        },
        ExpressionAttributeValues: {
          ":userId": req.header("UserId"),
        },
      };

      const command = new ScanCommand(getParams);
      const userData = await dynamoDocumentClient.send(command);

      if (userData.Items.length != 0) {
        const sortedData = userData.Items.sort((a, b) => {
          return (
            parseInt(b.createdDate) * 1000 - parseInt(a.createdDate) * 1000
          );
        });

        let slicedData = sortedData.slice(0, 1);
        const result = await updateStudentDetails(slicedData, "scan");

        if (result.length !== 0) {
          delete result[0].rideStatus;

          //ride cost code
          for (const student of result[0].students) {
            if (student.cost === undefined) student.cost = 0;
          }

          return res.status(200).json({ success: true, data: result[0] });
        } else return res.status(200).json({ success: true, data: {} });
      }
      return res.status(200).json({ success: true, data: {} });
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

/**
 * @swagger
 * /schedule:
 *   post:
 *     summary: Create a new schedule
 *     description: Create a new schedule with the provided data.
 *     tags:
 *      - Schedule
 *     parameters:
 *       - in: header
 *         name: UserId
 *         required: true
 *         description: User ID to validate.
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               time:
 *                 type: string
 *               date:
 *                 type: string
 *     responses:
 *       201:
 *         description: Schedule created successfully.
 *       400:
 *         description: Invalid user ID.
 *       500:
 *         description: Internal server error.
 */
const createSchedule = async (req, res) => {
  if (await checkUserId(req.header("UserId")))
    return res.status(400).json({ success: false, error: `Invalid User Id` });

  if (await checkParent(req.header("UserId")))
    return res
      .status(400)
      .json({ success: false, error: `You are not a parent user` });

  try {
    // Validate required fields
    if (!req.body.students || !Array.isArray(req.body.students) || req.body.students.length === 0) {
      return res.status(400).json({ success: false, error: "Students array is required" });
    }

    // Generate new UUID and add metadata
    const scheduleId = uuidv4();
    if (!scheduleId) {
      return res.status(500).json({ success: false, error: "Failed to generate schedule ID" });
    }

    req.body.id = scheduleId;
    req.body.userId = req.header("UserId");
    req.body.createdDate = Math.floor(new Date().getTime() / 1000);
    req.body.rideStatus = "";
    req.body.createdAt = new Date().toISOString();
    const today = new Date();
    const currentDay = today.getDay();

    // Process students data
    const studentsWithExactDates = req.body.students.map((student) => {
      if (!student.studentId) {
        throw new Error("Student ID is required for each student");
      }

      const updatedDays = student.days.map((dayObj) => {
        if (student.isRecurrence) {
          return { ...dayObj };
        }

        const dayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(dayObj.day);
        const dayDifference = dayIndex >= currentDay ? dayIndex - currentDay : 7 - currentDay + dayIndex;
        const dayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + dayDifference);
        
        return {
          ...dayObj,
          exactDate: Math.floor(dayDate.getTime() / 1000),
        };
      });

      return {
        ...student,
        days: updatedDays,
        rideStatus: "",
      };
    });

    req.body.students = studentsWithExactDates;

    // Validate locations against whitelist
    const params = {
      TableName: "whiteListTable",
    };

    const command = new ScanCommand(params);
    const data = await dynamoDocumentClient.send(command);

    let result = true;
    for (const entry of req.body.students) {
      const pickUpAddress = entry.pickUpLocation?.address?.toLowerCase() || "";
      const dropOffAddress = entry.dropOffLocation?.address?.toLowerCase() || "";

      if (!pickUpAddress || !dropOffAddress) {
        return res.status(400).json({ 
          success: false, 
          error: "Pick up and drop off addresses are required" 
        });
      }

      const pickUpIsWhitelisted =
        data.Items[0].city.some((city) => pickUpAddress.includes(city)) &&
        data.Items[0].country.some((country) => pickUpAddress.includes(country)) &&
        data.Items[0].stateLoc.some((state) => pickUpAddress.includes(state));

      const dropOffIsWhitelisted =
        data.Items[0].city.some((city) => dropOffAddress.includes(city)) &&
        data.Items[0].country.some((country) => dropOffAddress.includes(country)) &&
        data.Items[0].stateLoc.some((state) => dropOffAddress.includes(state));

      if (!pickUpIsWhitelisted || !dropOffIsWhitelisted) {
        result = false;
        break;
      }
    }

    const saveParams = {
      TableName: "schedulesTable",
      Item: req.body,
    };

    const putCommand = new PutCommand(saveParams);
    await dynamoDocumentClient.send(putCommand);

    return res.status(201).json({
      success: true,
      message: "Schedule saved successfully",
      data: { scheduleId: req.body.id, ...req.body },
    });
  } catch (error) {
    console.error("Create schedule error:", error);
    return res.status(500).json({ 
      success: false, 
      error: `Failed to create schedule: ${error.message}` 
    });
  }
};

/**
 * @swagger
 * /schedule/{id}:
 *   put:
 *     summary: Edit a schedule by ID
 *     description: Update an existing schedule using its ID.
 *     tags:
 *      - Schedule
 *     parameters:
 *       - in: header
 *         name: UserId
 *         required: true
 *         description: User ID to validate.
 *         schema:
 *           type: string
 *       - in: path
 *         name: id
 *         required: true
 *         description: Unique ID of the schedule to update.
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               pickUpLocation:
 *                 type: string
 *               dropOffLocation:
 *                 type: string
 *               pickUpTime:
 *                 type: string
 *               dropoffTime:
 *                 type: string
 *     responses:
 *       200:
 *         description: Schedule updated successfully.
 *       400:
 *         description: Invalid user ID or schedule does not exist.
 *       500:
 *         description: Internal server error.
 */
const editScheduleById = async (req, res) => {
  if (await checkUserId(req.header("UserId")))
    return res.status(400).json({ success: false, error: `Invalid User Id` });

  if (await checkParent(req.header("UserId")))
    return res
      .status(400)
      .json({ success: false, error: `You are not a parent user` });

  if (Object.keys(req.body).length === 0)
    return res.status(400).json({ success: false, error: "No Data to Edit" });
  const params = {
    TableName: "schedulesTable",
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
        .json({ success: false, error: "schedule doesn't exists" });

    const updateExpressionParts = [];
    const expressionAttributeValues = {};

    Object.keys(req.body).forEach((key) => {
      updateExpressionParts.push(`${key} = :${key}`);
      expressionAttributeValues[`:${key}`] = req.body[key];
    });

    const updateExpression = "SET " + updateExpressionParts.join(", ");

    console.log(updateExpression, expressionAttributeValues);
    const updateParams = {
      TableName: "schedulesTable",
      Key: {
        id: req.params.id,
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "UPDATED_NEW",
    };

    try {
      const updateCommand = new UpdateCommand(updateParams);
      await dynamoDocumentClient.send(updateCommand);
      //console.log(updateUser);
          // here will be call a webhook also
      try {
        await updateSchedule({
          body: {
            scheduleId: req.params.id,
          }
        }, {
          status: () => ({
            json: () => ({}) // Mock response object
          })
        });
      } catch (webhookError) {
        console.error('Webhook error:', webhookError);
      }
      return res
        .status(200)
        .json({ success: true, message: "Schedule Data Successfully Updated" });
    } catch (error) {
      return res.status(500).json({ success: false, error: `${error}` });
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const editStudentByScheduleId = async (req, res) => {
  if (await checkUserId(req.header("UserId")))
    return res.status(400).json({ success: false, error: `Invalid User Id` });

  if (await checkParent(req.header("UserId")))
    return res
      .status(400)
      .json({ success: false, error: `You are not a parent user` });

  const params = {
    TableName: "schedulesTable",
    Key: {
      id: req.params.id,
    },
  };

  try {
    const getCommand = new GetCommand(params);
    const user = await dynamoDocumentClient.send(getCommand);

    if (user.Item === undefined)
      return res
        .status(400)
        .json({ success: false, error: "Schedule id doesn't exists" });

    const data = user.Item.students;
    const index = data.findIndex(
      (student) => student.studentId === req.body.studentId
    );

    // If the student is found, update the data with the properties from toEditData
    if (index !== -1) {
      data[index] = { ...data[index], ...req.body };
    }
    const updateParams = {
      TableName: "schedulesTable",
      Key: {
        id: req.params.id,
      },
      UpdateExpression: "set students = :s",
      ExpressionAttributeValues: {
        ":s": data,
      },
      ReturnValues: "UPDATED_NEW",
    };

    const updateCommand = new UpdateCommand(updateParams);
    await dynamoDocumentClient.send(updateCommand);
    //console.log(updateUser);
    try {
      await updateSchedule({
        body: {
          scheduleId: req.params.id,
        }
      }, {
        status: () => ({
          json: () => ({}) // Mock response object
        })
      });
    } catch (webhookError) {
      console.error('Webhook error:', webhookError);
    }

    return res
      .status(200)
      .json({ success: true, message: "Data Successfully Updated" });
  } catch (error) {
    return res.status(400).json({ success: false, error: `${error}` });
  }
};

const deleteStudentByScheduleId = async (req, res) => {
  if (await checkUserId(req.header("UserId")))
    return res.status(400).json({ success: false, error: `Invalid User Id` });

  if (await checkParent(req.header("UserId")))
    return res
      .status(400)
      .json({ success: false, error: `You are not a parent user` });

  const params = {
    TableName: "schedulesTable",
    Key: {
      id: req.params.id,
    },
  };

  try {
    const getCommand = new GetCommand(params);
    const user = await dynamoDocumentClient.send(getCommand);

    if (user.Item === undefined)
      return res
        .status(400)
        .json({ success: false, error: "Schedule id doesn't exists" });

    let students = user.Item.students;
    try {
      await deleteSchedule({
        body: {
          scheduleId: req.params.id,
          students: students
        }
      }, {
        status: () => ({
          json: () => ({}) // Mock response object
        })
      });
    } catch (webhookError) {
      console.error('Webhook error:', webhookError);
    }
    students = students.filter(
      (student) => student.studentId !== req.params.studentId
    );

    const updateParams = {
      TableName: "schedulesTable",
      Key: {
        id: req.params.id,
      },
      UpdateExpression: "set students = :s",
      ExpressionAttributeValues: {
        ":s": students,
      },
      ReturnValues: "UPDATED_NEW",
    };

    const updateCommand = new UpdateCommand(updateParams);
    await dynamoDocumentClient.send(updateCommand);
   
    return res
      .status(200)
      .json({ success: true, message: "Data Successfully Updated" });
  } catch (error) {
    return res.status(400).json({ success: false, error: `${error}` });
  }
};
/**
 * @swagger
 * /schedule/{id}:
 *   delete:
 *     summary: Delete a schedule by ID
 *     description: Remove a schedule from the database using its ID.
 *     tags:
 *      - Schedule
 *     parameters:
 *       - in: header
 *         name: UserId
 *         required: true
 *         description: User ID to validate.
 *         schema:
 *           type: string
 *       - in: path
 *         name: id
 *         required: true
 *         description: Unique ID of the schedule to delete.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Schedule deleted successfully.
 *       400:
 *         description: Invalid user ID.
 *       500:
 *         description: Internal server error.
 */
const deleteScheduleById = async (req, res) => {
  if (await checkUserId(req.header("UserId")))
    return res.status(400).json({ success: false, error: `Invalid User Id` });

  if (await checkParent(req.header("UserId")))
    return res
      .status(400)
      .json({ success: false, error: `You are not a parent user` });

  const params = {
    TableName: "schedulesTable",
    Key: {
      id: req.params.id,
    },
  };

  try {
    const deleteCommand = new DeleteCommand(params);
    const data = await dynamoDocumentClient.send(deleteCommand);
    return res
      .status(200)
      .json({ success: true, message: "Schedule Data Succesfully Deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const cancelScheduleStudents = async (req, res) => {
  if (await checkUserId(req.header("UserId")))
    return res.status(400).json({ success: false, error: `Invalid User Id` });

  try {
    req.body.userId = req.header("UserId");
    req.body.createdDate = Math.floor(new Date().getTime() / 1000);
    const params = {
      TableName: "schedulesTable",
      Key: {
        id: req.body.scheduleId,
      },
    };

    const getCommand = new GetCommand(params);
    const user = await dynamoDocumentClient.send(getCommand);
    //console.log(user);
    if (user.Item === undefined)
      return res
        .status(400)
        .json({ success: false, error: "schedule id doesn't exists" });

    req.body.id = uuidv4();
    const saveParams = {
      TableName: "cancelScheduleStudentsTable",
      Item: req.body,
    };

    const putCommand = new PutCommand(saveParams);
    const Cancelbooking = await dynamoDocumentClient.send(putCommand);
    
    // here will be call a webhook also
    if(Cancelbooking) {
      try {
        await CancelScheduleParent({
          body: {
            scheduleId: req.body.scheduleId,
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
      message: "Successfully Added Cancel Schedule Students",
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const getDriverScheduleByUserId = async (req, res) => {
  // if (await checkUserId(req.header("UserId")))
  //   return res.status(400).json({ success: false, error: `Invalid User Id` });
  try {
    const scanParams = {
      TableName: "driversTable",
      FilterExpression: "#userId = :userId",
      ExpressionAttributeNames: {
        "#userId": "userId",
      },
      ExpressionAttributeValues: {
        ":userId": req.header("UserId"),
      },
    };
    const scanCommand1 = new ScanCommand(scanParams);
    const user1 = await dynamoDocumentClient.send(scanCommand1);

    let driverId = "";
    if (user1.Items.length !== 0) driverId = user1.Items[0].id;
    else driverId = req.header("UserId");

    const bookingParams = {
      TableName: "bookingsTable",
      FilterExpression:
        "#driverId = :driverId and #bookingStatus = :bookingStatus",
      ExpressionAttributeNames: {
        "#driverId": "driverId",
        "#bookingStatus": "bookingStatus",
      },
      ExpressionAttributeValues: {
        ":driverId": driverId,
        ":bookingStatus": "ACCEPTED",
      },
    };

    const scanCommand = new ScanCommand(bookingParams);
    const userData = await dynamoDocumentClient.send(scanCommand);

    if (userData.Items.length === 0)
      return res.status(200).json({ success: true, data: [] });

    const uniqueScheduleIds = new Set();
    const uniqueKeys = [];

    // Filter out duplicate scheduleIds and create unique keys
    userData.Items.forEach((item) => {
      if (!uniqueScheduleIds.has(item.scheduleId)) {
        uniqueScheduleIds.add(item.scheduleId);
        uniqueKeys.push({ id: item.scheduleId });
      }
    });
    const params = {
      RequestItems: {
        schedulesTable: {
          Keys: uniqueKeys,
        },
      },
    };

    const getCommand = new BatchGetCommand(params);
    const user = await dynamoDocumentClient.send(getCommand);

    if (user.Responses.schedulesTable.length === 0)
      return res.status(200).json({ success: true, data: [] });

    if (req.query.startDate !== undefined && req.query.endDate !== undefined) {
      const startDate = req.query.startDate;
      const endDate = req.query.endDate;

      let sortedData = [];
      let addedIds = new Set(); // to track added ride IDs to avoid duplicates

      let filteredSchedule = user.Responses.schedulesTable.filter((item) => {
        return item.students.some(
          (student) => Array.isArray(student.days) && student.days.length > 0
        );
      });

      filteredSchedule.forEach((item) => {
        item.students.forEach((student) => {
          // Check if student.days is defined and is an array
          let addRide =
            Array.isArray(student.days) &&
            student.days.some((day) => {
              return day.exactDate >= startDate && day.exactDate <= endDate;
            });

          if (
            addRide ||
            (student.isRecurrence && student.days && student.days.length > 0)
          ) {
            if (!addedIds.has(item.id)) {
              sortedData.push(item);
              addedIds.add(item.id); // mark this ID as added
            }
          }
        });
      });

      const startDateMs = startDate * 1000;
      const endDateMs = endDate * 1000;

      filteredSchedule.forEach((entry) => {
        entry.students = entry.students.filter((student) => {
          return student.days.some((day) => {
            const daysOfWeek = [
              "Sun",
              "Mon",
              "Tue",
              "Wed",
              "Thu",
              "Fri",
              "Sat",
            ];
            const dayIndex = daysOfWeek.indexOf(day.day);

            // Find the next date matching the day of the week within the range
            let currentDayMs = new Date(startDateMs); // Start from the beginning of the range
            currentDayMs.setDate(
              currentDayMs.getDate() +
                ((7 + dayIndex - currentDayMs.getDay()) % 7)
            );

            let validDayFound = false;
            while (currentDayMs.getTime() <= endDateMs) {
              // Extract hours and minutes from pickUpTime
              const timeParts = day.pickUpTime.match(/(\d+):(\d+)(AM|PM)?/);
              const hours = parseInt(timeParts[1], 10);
              const minutes = parseInt(timeParts[2], 10);
              const isPM = timeParts[3] === "PM";

              const hoursAdjusted =
                (hours % 12) + (isPM && hours !== 12 ? 12 : 0);
              // Calculate the exact timestamp for pickUpTime
              let rideTimestamp = new Date(
                currentDayMs.getFullYear(),
                currentDayMs.getMonth(),
                currentDayMs.getDate(),
                hoursAdjusted,
                minutes
              ).getTime();

              if (rideTimestamp >= startDateMs && rideTimestamp <= endDateMs) {
                validDayFound = true;
                break; // Exit if a valid day is found
              }

              // Move to the next week
              currentDayMs.setDate(currentDayMs.getDate() + 7);
            }

            return validDayFound;
          });
        });
      });

      let result = sortedData.filter(
        (item) => item.students && item.students.length > 0
      );

      if (result.length !== 0) {
        for (const data of result) {
          for (const item of data.students) {
            const params = {
              TableName: "studentsTable",
              Key: {
                id: item.studentId,
              },
            };

            const getCommand = new GetCommand(params);
            const user = await dynamoDocumentClient.send(getCommand);

            if (user.Item !== undefined) {
              item.imageUrl = user.Item.imageUrl;
              item.studentName = user.Item.studentName;
              item.schoolName = user.Item.schoolName;
              item.age = user.Item.age;
              item.grade = user.Item.grade;

              const params = {
                TableName: "signupTable",
                Key: {
                  id: user.Item.userId,
                },
              };
              const command = new GetCommand(params);
              const userResult = await dynamoDocumentClient.send(command);

              if (userResult.Item !== undefined)
                item.phoneNumber = userResult.Item.phoneNumber;
            }
          }
        }
      }

      return res.status(200).json({ success: true, data: result });
    } else if (req.query.currentTime !== undefined) {
      //code here

      let filteredSchedule = user.Responses.schedulesTable.filter((item) => {
        return item.students.some(
          (student) => Array.isArray(student.days) && student.days.length > 0
        );
      });

      const currentDate = new Date();
      const currentDayOfWeek = currentDate.toLocaleString("en-US", {
        weekday: "short",
      });

      // Filter the data based on the current day of the week
      const sortedData = filteredSchedule.filter((item) =>
        item.students.some((student) =>
          student.days.some(
            (day) => day.day.toUpperCase() === currentDayOfWeek.toUpperCase()
          )
        )
      );

      const addSpaceBeforePeriod = (time) => {
        return time.replace(/(\d)(AM|PM)/, "$1 $2");
      };

      // Process each item in the schedule
      sortedData.forEach((item) => {
        item.students.forEach((student) => {
          student.days.forEach((day) => {
            // Adjust pickUpTime and dropOffTime
            if (day.pickUpTime) {
              day.pickUpTime = addSpaceBeforePeriod(day.pickUpTime);
            }
            if (day.dropOffTime) {
              day.dropOffTime = addSpaceBeforePeriod(day.dropOffTime);
            }
          });
        });
      });

      const convertTo12HourFormat = (time) => {
        const [hours, minutes] = time.split(":").map(Number);

        // Determine AM or PM suffix
        const period = hours >= 12 ? "PM" : "AM";

        // Adjust hour for 12-hour format (handle the case for 12 PM and midnight)
        const twelveHour = hours % 12 || 12; // Convert 0 to 12 for midnight

        // Pad the minutes with leading zero if needed
        const paddedMinutes = minutes.toString().padStart(2, "0");

        // Format the time string in 12-hour format
        return `${twelveHour}:${paddedMinutes} ${period}`;
      };
      const currentTime = convertTo12HourFormat(req.query.currentTime);

      // Function to convert 12-hour format time to minutes for comparison
      const timeToMinutes = (time) => {
        let [hoursMinutes, period] = time.split(" ");
        let [hours, minutes] = hoursMinutes.split(":").map(Number);
        if (period === "PM" && hours !== 12) hours += 12;
        if (period === "AM" && hours === 12) hours = 0;
        return hours * 60 + minutes;
      };

      // Calculate the time two hours from now
      const nextTwoHours = timeToMinutes(currentTime) + 120; // 2 hours = 120 minutes

      // Filter the data based on pickUpTime within the next two hours
      const result = sortedData.filter((item) =>
        item.students.some((student) =>
          student.days.some((day) => {
            const pickUpMinutes = timeToMinutes(day.pickUpTime);
            return (
              pickUpMinutes >= timeToMinutes(currentTime) &&
              pickUpMinutes <= nextTwoHours
            );
          })
        )
      );

      //console.log(JSON.stringify(result));
      let finalResult = result.map(({ id, createdDate, students }) => ({
        scheduleId: id,
        createdDate: createdDate,
        rideStatus: students[0].rideStatus,
        studentId: students[0].studentId,
        dropOffLocation: students[0].dropOffLocation,
        days: students[0].days,
        isRecurrence: students[0].isRecurrence,
        pickUpLocation: students[0].pickUpLocation,
      }));

      let newDateString = currentDate.toISOString().slice(0, 10);
      for (const item of finalResult) {
        const params = {
          TableName: "studentsTable",
          Key: {
            id: item.studentId,
          },
        };

        const getCommand = new GetCommand(params);
        const user = await dynamoDocumentClient.send(getCommand);

        if (user.Item !== undefined) {
          item.imageUrl = user.Item.imageUrl;
          item.studentName = user.Item.studentName;
          item.schoolName = user.Item.schoolName;
          item.age = user.Item.age;
          item.grade = user.Item.grade;

          const params = {
            TableName: "signupTable",
            Key: {
              id: user.Item.userId,
            },
          };
          const getCommand = new GetCommand(params);
          const userResult = await dynamoDocumentClient.send(getCommand);
          item.phoneNumber = userResult.Item?.phoneNumber ?? null;
        }

        const scanParams = {
          TableName: "routesTable",
          FilterExpression:
            "#scheduleId = :scheduleId and #dateCreated = :dateCreated and #driverUserId = :driverUserId",
          ExpressionAttributeNames: {
            "#scheduleId": "scheduleId",
            "#dateCreated": "dateCreated",
            "#driverUserId": "driverUserId",
          },
          ExpressionAttributeValues: {
            ":scheduleId": item.scheduleId,
            ":dateCreated": newDateString,
            ":driverUserId": req.header("UserId"),
          },
        };
        const command = new ScanCommand(scanParams);
        const userData = await dynamoDocumentClient.send(command);
        if (userData.Items.length !== 0) {
          item.rideId = userData.Items[0]?.id ?? nul;
        }
      }
      return res.status(200).json({ success: true, data: finalResult });
    } else {
      for (const data of user.Responses.schedulesTable) {
        for (const item of data.students) {
          const params = {
            TableName: "studentsTable",
            Key: {
              id: item.studentId,
            },
          };

          const getCommand = new GetCommand(params);
          const user = await dynamoDocumentClient.send(getCommand);

          if (user.Item !== undefined) {
            item.imageUrl = user.Item.imageUrl;
            item.studentName = user.Item.studentName;
            item.schoolName = user.Item.schoolName;
            item.age = user.Item.age;
            item.grade = user.Item.grade;

            const params = {
              TableName: "signupTable",
              Key: {
                id: user.Item.userId,
              },
            };
            const getCommand = new GetCommand(params);
            const userResult = await dynamoDocumentClient.send(getCommand);
            item.phoneNumber = userResult.Item?.phoneNumber ?? null;
          }
        }
      }
      return res
        .status(200)
        .json({ success: true, data: user.Responses.schedulesTable });
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const cancelScheduleStudentDriver = async (req, res) => {
  try {
    //code here
    req.body.id = uuidv4();
    req.body.userId = req.header("UserId");
    req.body.createdDate = Math.floor(new Date().getTime() / 1000);
    const saveParams = {
      TableName: "cancelScheduleStudentDriverTable",
      Item: req.body,
    };
    //console.log(req.body);
    const putCommand = new PutCommand(saveParams);
    await dynamoDocumentClient.send(putCommand);

    return res.status(200).json({
      success: true,
      message: "Cancel Schedule Student Driver Added Successfully",
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

module.exports = {
  searchAllSchedule,
  getScheduleById,
  cancelScheduleStudents,
  cancelScheduleStudentDriver,

  createSchedule,
  editScheduleById,
  editStudentByScheduleId,
  deleteScheduleById,
  deleteStudentByScheduleId,

  getDriverScheduleByUserId,
};
