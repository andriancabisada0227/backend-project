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

const { checkUserId } = require("./utils/userIdChecking");
const computeRatings = require("./utils/ratings");
const s3Data = require("./utils/s3");
const dateFormat = require("./utils/dateFormat");
const updateStudentDetails = require("../services/utils/studentDetails");
const updateParentDetails = require("../services/utils/parentDetails");
const {
  addDriverSchema,
  addDriverLocationSchema,
} = require("./validation/drivers.validation");
const geolib = require("geolib");
const appConstants = require("./constants/appConstants");
const {
  sendSuccess,
  sendBadRequest,
  sendInternalError,
} = require("./utils/responseHandler");
const logger = require("./utils/logger");

const paginationDriversList = (driversWithinRadius, pagesize, page) => {
  try {
    const parsedPageSize = parseInt(pagesize) || 10;
    const parsedPage = parseInt(page) || 1;

    const startIndex = (parsedPage - 1) * parsedPageSize;
    const endIndex = parsedPage * parsedPageSize;
    const driversForPage = driversWithinRadius.slice(startIndex, endIndex);

    const hasMorePages = endIndex < driversWithinRadius.length;

    return {
      success: true,
      data: driversForPage,
      pageInfo: {
        currentPage: parsedPage,
        pageSize: parsedPageSize,
        totalItems: driversWithinRadius.length,
        hasMorePages,
      },
    };
  } catch (error) {
    logger.error("Pagination error", error);
    return {
      success: false,
      error: appConstants.ERROR_MESSAGES.INTERNAL_ERROR,
    };
  }
};

const getMyCurrentDriver = async (req, res) => {
  try {
    const userId = req.header("UserId");

    if (await checkUserId(userId)) {
      return sendBadRequest(res, appConstants.ERROR_MESSAGES.INVALID_USER_ID);
    }

    logger.info("Fetching current driver", { userId });

    const params = {
      TableName: appConstants.TABLES.BOOKINGS,
      FilterExpression: "#userId = :userId AND #status = :status",
      ExpressionAttributeNames: {
        "#userId": "userId",
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":userId": userId,
        ":status": true,
      },
    };

    const command = new ScanCommand(params);
    const result = await dynamoDocumentClient.send(command);

    if (result.Items.length === 0) {
      logger.info("No active booking found", { userId });
      return sendSuccess(
        res,
        appConstants.HTTP_STATUS.OK,
        appConstants.SUCCESS_MESSAGES.NO_ACTIVE_BOOKING,
        { data: [] },
      );
    }

    const sortedData = result.Items.sort(
      (a, b) => new Date(b.createdDate) - new Date(a.createdDate),
    );

    const latestBooking = sortedData[0];

    const scheduleParams = {
      TableName: appConstants.TABLES.SCHEDULES,
      Key: {
        id: latestBooking.scheduleId,
      },
    };

    const scheduleCommand = new GetCommand(scheduleParams);
    const scheduleData = await dynamoDocumentClient.send(scheduleCommand);

    const driverParams = {
      TableName: appConstants.TABLES.DRIVERS,
      Key: {
        id: latestBooking.driverId,
      },
    };

    const driverCommand = new GetCommand(driverParams);
    const driverData = await dynamoDocumentClient.send(driverCommand);

    logger.info("Driver retrieved successfully", {
      userId,
      driverId: latestBooking.driverId,
    });

    return sendSuccess(
      res,
      appConstants.HTTP_STATUS.OK,
      appConstants.SUCCESS_MESSAGES.DRIVER_PROFILE_RETRIEVED,
      {
        data: driverData.Item,
      },
    );
  } catch (error) {
    logger.error("Error fetching current driver", error);
    return sendInternalError(
      res,
      appConstants.ERROR_MESSAGES.INTERNAL_ERROR,
      error,
    );
  }
};

/**
 * @swagger
 * /api/drivers:
 *   post:
 *     summary: Get all drivers based on user nationality
 *     tags:
 *      - Search Drivers
 *     parameters:
 *       - in: header
 *         name: UserId
 *         required: true
 *         description: User ID for authentication
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 drivers: [DriverObject]
 *       400:
 *         description: Invalid User ID or Driver has no nationality
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               error: Invalid User ID or Driver has no nationality
 *       500:
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               error: Internal Server Error
 */

// Helper function to fetch parent zipcode
const getParentZipcode = async (parentUserId) => {
  const parentsParams = new ScanCommand({
    TableName: appConstants.TABLES.PARENTS,
    FilterExpression: "#userId = :userId",
    ExpressionAttributeNames: {
      "#userId": "userId",
    },
    ExpressionAttributeValues: {
      ":userId": parentUserId,
    },
  });
  const parentData = await dynamoDocumentClient.send(parentsParams);
  const zipcode = parentData.Items[0]?.zipcode;

  if (!zipcode || isNaN(zipcode)) {
    throw new Error("Parent has no valid zipcode");
  }

  return zipcode;
};

// Helper function to fetch taxi codes by zipcode
const getTaxiCodes = async (zipcode) => {
  const taxiParams = new ScanCommand({
    TableName: appConstants.TABLES.TAXI,
    ExpressionAttributeValues: {
      ":attribute": zipcode,
    },
    FilterExpression: "contains(zipCode, :attribute)",
  });

  const taxiData = await dynamoDocumentClient.send(taxiParams);

  if (taxiData.Items.length === 0) {
    return null; // No taxi services available
  }

  return taxiData.Items.map((item) => item.taxiCode);
};

// Helper function to fetch drivers by taxi codes
const getDriversByTaxiCodes = async (taxiCodes) => {
  const expressionAttributeValues = {};
  taxiCodes.forEach((code, index) => {
    expressionAttributeValues[`:taxiCode${index}`] = code;
  });

  const filterExpression = taxiCodes
    .map((_, index) => `#taxiCode = :taxiCode${index}`)
    .join(" OR ");

  const params = {
    TableName: appConstants.TABLES.DRIVERS,
    FilterExpression: filterExpression,
    ExpressionAttributeNames: {
      "#taxiCode": "taxiCode",
    },
    ExpressionAttributeValues: expressionAttributeValues,
  };

  const scanCommand = new ScanCommand(params);
  const userData = await dynamoDocumentClient.send(scanCommand);
  return userData.Items;
};

// Helper function to enrich drivers with student and booking details
const enrichDriversWithDetails = async (drivers) => {
  const enrichedDrivers = [];

  for (const driver of drivers) {
    const bookingParams = {
      TableName: appConstants.TABLES.BOOKINGS,
      FilterExpression:
        "#driverId = :driverId and #bookingStatus = :bookingStatus",
      ExpressionAttributeNames: {
        "#driverId": "driverId",
        "#bookingStatus": "bookingStatus",
      },
      ExpressionAttributeValues: {
        ":driverId": driver.id,
        ":bookingStatus": "ACCEPTED",
      },
    };

    const scanCommand = new ScanCommand(bookingParams);
    const bookingData = await dynamoDocumentClient.send(scanCommand);

    if (bookingData.Items.length !== 0) {
      const uniqueScheduleIds = new Set();
      const uniqueKeys = [];

      bookingData.Items.forEach((item) => {
        if (!uniqueScheduleIds.has(item.scheduleId)) {
          uniqueScheduleIds.add(item.scheduleId);
          uniqueKeys.push({ id: item.scheduleId });
        }
      });

      const batchParams = {
        RequestItems: {
          schedulesTable: {
            Keys: uniqueKeys,
          },
        },
      };

      const getCommand = new BatchGetCommand(batchParams);
      const scheduleResult = await dynamoDocumentClient.send(getCommand);

      if (scheduleResult.Responses.schedulesTable.length !== 0) {
        const students =
          scheduleResult.Responses.schedulesTable[0]?.students || [];

        for (const student of students) {
          const studentParams = {
            TableName: appConstants.TABLES.STUDENTS,
            Key: {
              id: student.studentId,
            },
          };

          const studentCommand = new GetCommand(studentParams);
          const studentData = await dynamoDocumentClient.send(studentCommand);

          if (studentData.Item !== undefined) {
            student.imageUrl = studentData.Item.imageUrl;
            student.studentName = studentData.Item.studentName;
            student.schoolName = studentData.Item.schoolName;
            student.age = studentData.Item.age;
            student.grade = studentData.Item.grade;
          }
        }

        students.forEach((student) => {
          delete student.pickUpLocation;
          delete student.dropOffLocation;
          delete student.days;
          delete student.isRecurrence;
        });

        driver.totalStudents = students.length;
        driver.students = students;
      }
    }

    enrichedDrivers.push(driver);
  }

  return enrichedDrivers;
};

// Helper function to normalize driver location field
const normalizeDriverLocation = (drivers) => {
  return drivers.map((driver) => {
    if (driver.hasOwnProperty("driverLocation")) {
      driver.location = driver.driverLocation;
      delete driver.driverLocation;
    }
    return driver;
  });
};

const getAllDrivers = async (req, res) => {
  if (await checkUserId(req.header("UserId")))
    return sendBadRequest(res, appConstants.ERROR_MESSAGES.INVALID_USER_ID);

  try {
    const parentUserid = req.header("UserId");

    // Get parent zipcode
    const zipcode = await getParentZipcode(parentUserid);

    // Get taxi codes for the zipcode
    const taxiCodes = await getTaxiCodes(zipcode);
    if (!taxiCodes) {
      return sendSuccess(
        res,
        appConstants.HTTP_STATUS.OK,
        "No taxi services available in your zipcode",
        { data: [] },
      );
    }

    // Get drivers matching taxi codes
    const drivers = await getDriversByTaxiCodes(taxiCodes);
    if (drivers.length === 0) {
      return sendSuccess(
        res,
        appConstants.HTTP_STATUS.OK,
        appConstants.ERROR_MESSAGES.EMPTY_LIST,
        { data: [] },
      );
    }

    // Enrich drivers with student and booking details
    const enrichedDrivers = await enrichDriversWithDetails(drivers);

    // Normalize location field
    const normalizedDrivers = normalizeDriverLocation(enrichedDrivers);

    // Apply enrichment services and pagination
    const resultStudentDetails = await updateStudentDetails(
      normalizedDrivers,
      "scan",
    );
    const resultReviewDetails = await updateParentDetails(
      resultStudentDetails,
      "scan",
    );

    return sendSuccess(
      res,
      appConstants.HTTP_STATUS.OK,
      appConstants.SUCCESS_MESSAGES.DRIVERS_RETRIEVED,
      paginationDriversList(
        resultReviewDetails,
        req.query.pagesize,
        req.query.page,
      ),
    );
  } catch (error) {
    logger.error("Error in getAllDrivers", error);
    return sendInternalError(
      res,
      appConstants.ERROR_MESSAGES.INTERNAL_ERROR,
      error,
    );
  }
};

/**
 * @swagger
 * /api/search/filters:
 *   post:
 *     summary: Get drivers based on specified filters
 *     tags:
 *      - Search Drivers
 *     parameters:
 *       - in: query
 *         name: gender
 *         description: Gender of the driver
 *         schema:
 *           type: string
 *       - in: query
 *         name: vehicleType
 *         description: Type of vehicle driven by the driver
 *         schema:
 *           type: string
 *       - in: query
 *         name: ageLimit_low
 *         description: Lower limit for driver's age
 *         schema:
 *           type: integer
 *       - in: query
 *         name: ageLimit_high
 *         description: Upper limit for driver's age
 *         schema:
 *           type: integer
 *       - in: query
 *         name: latitude
 *         description: Latitude for nearby filtering
 *         schema:
 *           type: number
 *       - in: query
 *         name: longitude
 *         description: Longitude for nearby filtering
 *         schema:
 *           type: number
 *       - in: query
 *         name: radius
 *         description: Radius for nearby filtering (in miles)
 *         schema:
 *           type: number
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data: [DriverObject]
 *       500:
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               error: Internal Server Error
 */
// Helper function to build filter expressions for driver search
const buildDriverFilterExpression = (gender, vehicleType, ageLimit_low, ageLimit_high, taxiCodes) => {
  const queryParams = {
    TableName: appConstants.TABLES.DRIVERS,
    FilterExpression: "",
    ExpressionAttributeNames: {},
    ExpressionAttributeValues: {},
  };

  const filterExpressions = [];

  // Handle multiple taxi codes with OR condition
  if (taxiCodes && taxiCodes.length > 0) {
    const taxiCodeExpressions = taxiCodes.map(
      (_, index) => `#taxiCode = :taxiCode${index}`,
    );
    filterExpressions.push(`(${taxiCodeExpressions.join(" OR ")})`);

    taxiCodes.forEach((code, index) => {
      queryParams.ExpressionAttributeValues[`:taxiCode${index}`] = code;
    });

    queryParams.ExpressionAttributeNames["#taxiCode"] = "taxiCode";
  }

  if (gender) {
    filterExpressions.push("#gender = :gender");
    queryParams.ExpressionAttributeValues[":gender"] = gender;
    queryParams.ExpressionAttributeNames["#gender"] = "gender";
  }

  if (vehicleType) {
    filterExpressions.push("#vehicleType = :vehicleType");
    queryParams.ExpressionAttributeNames["#vehicleType"] = "vehicleType";
    queryParams.ExpressionAttributeValues[":vehicleType"] = vehicleType;
  }

  if (ageLimit_low && ageLimit_high) {
    filterExpressions.push("#age BETWEEN :ageLow AND :ageHigh");
    queryParams.ExpressionAttributeValues[":ageLow"] = parseInt(ageLimit_low);
    queryParams.ExpressionAttributeValues[":ageHigh"] = parseInt(ageLimit_high);
    queryParams.ExpressionAttributeNames["#age"] = "age";
  }

  if (filterExpressions.length > 0) {
    queryParams.FilterExpression = filterExpressions.join(" AND ");
  }

  return queryParams;
};

// Helper function to filter drivers by geolocation
const filterDriversByNearby = (drivers, latitude, longitude, radius) => {
  const origin = { latitude, longitude };
  const radiusMeters = (radius || 10) * 1609.34; // Convert miles to meters

  return drivers.filter((driver) => {
    const lat = driver.location?.latitude ?? driver.driverLocation?.latitude;
    const lng = driver.location?.longitude ?? driver.driverLocation?.longitude;

    if (lat === undefined || lng === undefined) {
      return false;
    }

    const distance = geolib.getDistance(origin, {
      latitude: lat,
      longitude: lng,
    });

    return distance <= radiusMeters;
  });
};

const searchFilters = async (req, res) => {
  const gender = req.query.gender;
  const vehicleType = req.query.vehicleType;
  const ageLimit_low = req.query.ageLimit_low;
  const ageLimit_high = req.query.ageLimit_high;
  const parentUserid = req.header("UserId");

  try {
    const query = {
      TableName: appConstants.TABLES.SIGNUP,
      Key: { id: req.header("UserId") },
    };

    const getCommand = new GetCommand(query);
    const user = await dynamoDocumentClient.send(getCommand);

    if (user.Item === undefined)
      return sendBadRequest(res, appConstants.ERROR_MESSAGES.INVALID_USER_ID);

    // Get parent zipcode
    const zipcode = await getParentZipcode(parentUserid);

    // Get taxi codes for the zipcode
    const taxiCodes = await getTaxiCodes(zipcode);
    if (!taxiCodes) {
      return sendSuccess(res, appConstants.HTTP_STATUS.OK, "No taxi services available in your zipcode", { data: [] });
    }

    // Build filter expression
    const queryParams = buildDriverFilterExpression(
      gender,
      vehicleType,
      ageLimit_low,
      ageLimit_high,
      taxiCodes,
    );

    // Fetch drivers matching filters
    const scanCommand = new ScanCommand(queryParams);
    const driversResult = await dynamoDocumentClient.send(scanCommand);

    if (driversResult.Items.length === 0) {
      return sendSuccess(res, appConstants.HTTP_STATUS.OK, appConstants.ERROR_MESSAGES.EMPTY_LIST, { data: [] });
    }

    let filteredDrivers = driversResult.Items;

    // Apply geolocation filter if provided
    if (req.query.latitude !== undefined && req.query.longitude !== undefined) {
      filteredDrivers = filterDriversByNearby(
        filteredDrivers,
        parseFloat(req.query.latitude),
        parseFloat(req.query.longitude),
        req.query.radius,
      );

      if (filteredDrivers.length === 0) {
        return sendSuccess(res, appConstants.HTTP_STATUS.OK, "No drivers found within the specified radius", { data: [] });
      }
    }

    // Enrich with student and booking details
    const enrichedDrivers = await enrichDriversWithDetails(filteredDrivers);

    // Normalize location field
    const normalizedDrivers = normalizeDriverLocation(enrichedDrivers);

    // Apply enrichment services
    const resultStudentDetails = await updateStudentDetails(normalizedDrivers, "scan");
    const resultReviewDetails = await updateParentDetails(resultStudentDetails, "scan");

    // Return paginated results
    const paginatedResults = paginationDriversList(
      resultReviewDetails,
      req.query.pagesize,
      req.query.page,
    );

    return sendSuccess(
      res,
      appConstants.HTTP_STATUS.OK,
      appConstants.SUCCESS_MESSAGES.DRIVERS_RETRIEVED,
      paginatedResults,
    );
  } catch (error) {
    logger.error("Error in searchFilters", error);
    return sendInternalError(res, appConstants.ERROR_MESSAGES.INTERNAL_ERROR, error);
  }
};

/**
 * @swagger
 * /drivers/{id}:
 *   get:
 *     summary: Retrieves a specific driver's details
 *     description: Fetches details of a specific driver by their ID.
 *     tags:
 *      - Drivers
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Unique ID of the driver.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Details of a specific driver.
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data: [DriverObject]
 *       400:
 *         description: Invalid User ID or No Data yet.
 *       500:
 *         description: Internal Server Error
 */
const getDriverDetailsById = async (req, res) => {
  //get deliver details by id, include students and reviews
  //computation driver ratings

  if (await checkUserId(req.header("UserId")))
    return sendBadRequest(res, appConstants.ERROR_MESSAGES.INVALID_USER_ID);

  const params = {
    TableName: appConstants.TABLES.DRIVERS,
    Key: {
      id: req.params.id,
    },
  };

  try {
    const getCommand = new GetCommand(params);
    const user = await dynamoDocumentClient.send(getCommand);

    if (user.Item === undefined) {
      const params = {
        TableName: appConstants.TABLES.DRIVERS,
        FilterExpression: "#userId = :userId",
        ExpressionAttributeNames: {
          "#userId": "userId",
        },
        ExpressionAttributeValues: {
          ":userId": req.params.id,
        },
      };

      const scanCommand = new ScanCommand(params);
      const user = await dynamoDocumentClient.send(scanCommand);

      if (user.Items.length === 0)
        return res
          .status(400)
          .json({ success: false, error: "Driver id doesn't exists" });

      let resultUpdateStudentDetails = "";
      if (
        user.Items[0].students !== undefined &&
        user.Items[0].students.length !== 0
      )
        resultUpdateStudentDetails = await updateStudentDetails(
          user.Items,
          "scan",
        );
      else resultUpdateStudentDetails = user.Items;
      let resultUpdateParentDetails = "";
      if (
        user.Items[0].reviews !== undefined &&
        user.Items[0].reviews.length !== 0
      )
        resultUpdateParentDetails = await updateParentDetails(
          resultUpdateStudentDetails,
          "scan",
        );
      else resultUpdateParentDetails = resultUpdateStudentDetails;

      const signupParams = {
        TableName: appConstants.TABLES.SIGNUP,
        Key: {
          id: user.Items[0].userId,
        },
      };
      const getCommand = new GetCommand(signupParams);
      const userResult = await dynamoDocumentClient.send(getCommand);

      if (userResult.Item !== undefined) {
        resultUpdateParentDetails[0].phoneNumber =
          userResult.Item?.phoneNumber ?? null;
        resultUpdateParentDetails[0].email = userResult.Item?.email ?? null;
        resultUpdateParentDetails[0].location =
          resultUpdateParentDetails[0].driverLocation ||
          resultUpdateParentDetails[0].location;
      }

      return sendSuccess(res, appConstants.HTTP_STATUS.OK, appConstants.SUCCESS_MESSAGES.DRIVER_PROFILE_RETRIEVED, { data: resultUpdateParentDetails[0] });
    } else {
      let resultUpdateStudentDetails = "";
      if (user.Item?.students) {
        // Add null check for students property
        if (user.Item.students.length !== 0) {
          resultUpdateStudentDetails = await updateStudentDetails(user, "get");
        } else {
          resultUpdateStudentDetails = user.Item;
        }
      } else {
        resultUpdateStudentDetails = user.Item;
      }
      let resultUpdateParentDetails = "";
      if (user.Item?.reviews) {
        // Add null check for reviews property
        if (user.Item.reviews.length !== 0) {
          resultUpdateParentDetails = await updateParentDetails(
            resultUpdateStudentDetails,
            "get",
          );
        } else {
          resultUpdateParentDetails = resultUpdateStudentDetails;
        }
      } else {
        resultUpdateParentDetails = resultUpdateStudentDetails;
      }

      if (user.Item.userId !== undefined) {
        const signupParams = {
          TableName: appConstants.TABLES.SIGNUP,
          Key: {
            id: user.Item.userId,
          },
        };
        const getCommand = new GetCommand(signupParams);
        const userResult = await dynamoDocumentClient.send(getCommand);

        if (userResult.Item !== undefined) {
          resultUpdateParentDetails.phoneNumber =
            userResult.Item?.phoneNumber ?? null;
          resultUpdateParentDetails.email = userResult.Item?.email ?? null;
          resultUpdateParentDetails.location =
            resultUpdateParentDetails.driverLocation ??
            resultUpdateParentDetails.location;
        }

        const driverParams = {
          TableName: appConstants.TABLES.BOOKINGS,
          FilterExpression:
            "#driverId = :driverId and #bookingStatus = :bookingStatus",
          ExpressionAttributeNames: {
            "#driverId": "driverId",
            "#bookingStatus": "bookingStatus",
          },
          ExpressionAttributeValues: {
            ":driverId": req.params.id,
            ":bookingStatus": "ACCEPTED",
          },
        };

        const scanCommand = new ScanCommand(driverParams);
        const scanResult = await dynamoDocumentClient.send(scanCommand);
        // Sort bookings by dateCreated in descending order
        if (scanResult.Items.length > 0) {
          scanResult.Items.sort(
            (a, b) => new Date(b.dateCreated) - new Date(a.dateCreated),
          );
        }
        if (scanResult.Items.length !== 0) {
          const scheduleParams = {
            TableName: appConstants.TABLES.SCHEDULES,
            Key: {
              id: scanResult.Items[0].scheduleId,
            },
          };

          const scheduleCommand = new GetCommand(scheduleParams);
          const scheduleResult =
            await dynamoDocumentClient.send(scheduleCommand);
          if (scheduleResult.Item !== undefined) {
            for (const item of scheduleResult.Item.students) {
              const params = {
                TableName: appConstants.TABLES.STUDENTS,
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
              }
            }
            scheduleResult.Item.students.forEach((student) => {
              delete student.pickUpLocation;
              delete student.dropOffLocation;
              delete student.days;
              delete student.isRecurrence;
            });
            resultUpdateParentDetails.totalStudents =
              scheduleResult.Item.students.length;
            resultUpdateParentDetails.students = scheduleResult.Item.students;
          }
        }
        // if (userData.Items.length === 0) {
        //   resultUpdateParentDetails.students = [];
        // } else {
        //   const uniqueScheduleIds = new Set();
        //   const uniqueKeys = [];

        //   // Filter out duplicate scheduleIds and create unique keys
        //   userData.Items.forEach((item) => {
        //     if (!uniqueScheduleIds.has(item.scheduleId)) {
        //       uniqueScheduleIds.add(item.scheduleId);
        //       uniqueKeys.push({ id: item.scheduleId });
        //     }
        //   });
        //   const params = {
        //     RequestItems: {
        //       schedulesTable: {
        //         Keys: uniqueKeys,
        //       },
        //     },
        //   };

        //   const getCommand = new BatchGetCommand(params);
        //   const scheduleResult = await dynamoDocumentClient.send(getCommand);

        //   if (scheduleResult.Responses.schedulesTable.length !== 0) {
        //     let result = [];
        //     for (const item of scheduleResult.Responses.schedulesTable) {
        //       result.push(item.students);
        //     }
        //     for (const item of result) {
        //       for (const student of item) {
        //         const params = {
        //           TableName: appConstants.TABLES.STUDENTS,
        //           Key: {
        //             id: student.studentId,
        //           },
        //         };

        //         const getCommand = new GetCommand(params);
        //         const user = await dynamoDocumentClient.send(getCommand);

        //         if (user.Item !== undefined) {
        //           student.imageUrl = user.Item.imageUrl;
        //           student.studentName = user.Item.studentName;
        //           student.schoolName = user.Item.schoolName;
        //           student.age = user.Item.age;
        //           student.grade = user.Item.grade;
        //         }
        //       }
        //     }
        //     result[0].forEach((studentsArray) => {
        //       delete studentsArray.pickUpLocation;
        //       delete studentsArray.dropOffLocation;
        //       delete studentsArray.days;
        //       delete studentsArray.isRecurrence;
        //     });

        //     resultUpdateParentDetails.totalStudents = result[0].length;
        //     resultUpdateParentDetails.students = result[0];
        //   }
        // }
      }
      return sendSuccess(res, appConstants.HTTP_STATUS.OK, appConstants.SUCCESS_MESSAGES.DRIVER_PROFILE_RETRIEVED, { data: resultUpdateParentDetails });
    }
  } catch (error) {
    logger.error("Error in getDriverDetailsById", error);
    return sendInternalError(res, appConstants.ERROR_MESSAGES.INTERNAL_ERROR, error);
  }
};

/**
 * @swagger
 * /drivers/{id}/reviews:
 *   get:
 *     summary: Get reviews for a specific driver
 *     description: Retrieve all reviews associated with a driver based on their ID.
 *     tags:
 *      - Drivers
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: The ID of the driver to retrieve reviews for.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: A list of reviews for the specified driver.
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data: [DriverObject]
 *       400:
 *         description: Invalid User ID or No data available.
 *       500:
 *         description: Internal Server Error
 */
const getDriverReviews = async (req, res) => {
  //get all driver reviews based on driver id

  if (await checkUserId(req.header("UserId")))
    return sendBadRequest(res, appConstants.ERROR_MESSAGES.INVALID_USER_ID);

  if (req.params.id === undefined)
    return sendBadRequest(res, "Driver ID is required");

  const params = {
    TableName: appConstants.TABLES.DRIVERS,
    Key: {
      id: req.params.id,
    },
  };

  try {
    const getCommand = new GetCommand(params);
    const userData = await dynamoDocumentClient.send(getCommand);

    // Check if Item exists first
    if (!userData.Item) {
      return res.status(404).json({
        success: false,
        error: "Driver not found",
      });
    }

    // Now safely check reviews
    if (userData.Item.reviews && userData.Item.reviews.length > 0) {
      const result = await updateParentDetails(userData, "get");
      return sendSuccess(res, appConstants.HTTP_STATUS.OK, appConstants.SUCCESS_MESSAGES.SUCCESS, { data: result });
    }

    return sendSuccess(res, appConstants.HTTP_STATUS.OK, appConstants.ERROR_MESSAGES.EMPTY_LIST, { data: [] });
  } catch (error) {
    logger.error("Error in getDriverReviews", error);
    return sendInternalError(res, appConstants.ERROR_MESSAGES.INTERNAL_ERROR, error);
  }
};

/**
 * @swagger
 * /drivers/{id}/students:
 *   get:
 *     summary: Get students under a specific driver
 *     description: Retrieve all students associated with a driver based on their ID.
 *     tags:
 *      - Drivers
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: The ID of the driver to retrieve students for.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: A list of students for the specified driver.
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data: [DriverObject]
 *       400:
 *         description: Invalid User ID or No data available.
 *       500:
 *         description: Internal Server Error
 */
const getDriverStudents = async (req, res) => {
  //get all students under a certain driver
  if (await checkUserId(req.header("UserId")))
    return sendBadRequest(res, appConstants.ERROR_MESSAGES.INVALID_USER_ID);

  if (req.params.id === undefined)
    return sendBadRequest(res, "Driver ID is required");

  const params = {
    TableName: appConstants.TABLES.DRIVERS,
    Key: {
      id: req.params.id,
    },
  };

  try {
    const getCommand = new GetCommand(params);
    const userData = await dynamoDocumentClient.send(getCommand);
    if (userData.Item.students.length > 0) {
      const result = await updateStudentDetails(userData, "get");
      return sendSuccess(
        res,
        appConstants.HTTP_STATUS.OK,
        appConstants.SUCCESS_MESSAGES.STUDENTS_RETRIEVED,
        { data: result },
      );
    }

    return sendSuccess(
      res,
      appConstants.HTTP_STATUS.OK,
      appConstants.ERROR_MESSAGES.EMPTY_LIST,
      { data: [] },
    );
  } catch (error) {
    logger.error("Error getting driver students", error);
    return sendInternalError(
      res,
      appConstants.ERROR_MESSAGES.INTERNAL_ERROR,
      error,
    );
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

/**
 * @swagger
 * /drivers/{id}/location:
 *   get:
 *     summary: Get location of a specific driver
 *     description: Retrieve the location details of a driver based on their ID.
 *     tags:
 *      - Drivers
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: The ID of the driver to retrieve location for.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Location details of the specified driver.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 city:
 *                   type: string
 *                 state:
 *                   type: string
 *                 country:
 *                   type: string
 *       400:
 *         description: Invalid User ID or No data available.
 *       500:
 *         description: Internal Server Error
 */
const getDriverLocation = async (req, res) => {
  if (await checkUserId(req.header("UserId")))
    return sendBadRequest(res, appConstants.ERROR_MESSAGES.INVALID_USER_ID);

  const params = {
    TableName: appConstants.TABLES.DRIVERS,
    Key: {
      id: req.params.id,
    },
  };

  try {
    const getCommand = new GetCommand(params);
    const userData = await dynamoDocumentClient.send(getCommand);

    if (Object.keys(userData.location).length != 0)
      return sendSuccess(
        res,
        appConstants.HTTP_STATUS.OK,
        appConstants.SUCCESS_MESSAGES.DRIVER_LOCATION_UPDATED,
        { data: userData.location },
      );
    return sendSuccess(
      res,
      appConstants.HTTP_STATUS.OK,
      appConstants.ERROR_MESSAGES.EMPTY_LIST,
      { data: [] },
    );
  } catch (error) {
    logger.error("Error in getDriverLocation", error);
    return sendInternalError(res, appConstants.ERROR_MESSAGES.INTERNAL_ERROR, error);
  }
};

/**
 * @swagger
 * /api/search/drivers-by-location:
 *   post:
 *     summary: Get drivers based on location
 *     tags:
 *      - Search Drivers
 *     parameters:
 *       - in: header
 *         name: UserId
 *         required: true
 *         description: User ID for authentication
 *         schema:
 *           type: string
 *       - in: query
 *         name: location
 *         description: Location to search for (e.g., city, state, country)
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data: [DriverObject]
 *       400:
 *         description: Invalid User ID or missing location parameter
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               error: Invalid User ID or missing location parameter
 *       500:
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               error: Internal Server Error
 */
const searchDriversByLocation = async (req, res) => {
  if (await checkUserId(req.header("UserId")))
    return sendBadRequest(res, appConstants.ERROR_MESSAGES.INVALID_USER_ID);

  const location = req.query.location;
  if (!location) {
    return sendBadRequest(res, "Location parameter is required");
  }

  const queryParams = {
    TableName: appConstants.TABLES.SIGNUP,
    Key: {
      id: req.header("UserId"),
    },
  };

  try {
    const getCommand = new GetCommand(queryParams);
    const user = await dynamoDocumentClient.send(getCommand);
    const taxiCode = user?.Item?.TaxiCode;

    const params = {
      TableName: appConstants.TABLES.DRIVERS,
      FilterExpression:
        "(contains(#city, :value) or contains(#state, :value) or contains(#country, :value)) and TaxiCode = :TaxiCode",
      ExpressionAttributeNames: {
        "#city": "city",
        "#state": "state",
        "#country": "country",
      },
      ExpressionAttributeValues: {
        ":value": location,
        ":TaxiCode": taxiCode,
      },
    };

    const scanCommand = new ScanCommand(params);
    const userData = await dynamoDocumentClient.send(scanCommand);
    if (userData.Items && userData.Items.length !== 0) {
      const resultStudentDetails = await updateStudentDetails(
        userData.Items,
        "scan",
      );
      const resultReviewDetails = await updateParentDetails(
        resultStudentDetails,
        "scan",
      );

      const enrichedDrivers = await enrichDriversWithDetails(resultReviewDetails);
      const normalizedDrivers = normalizeDriverLocation(enrichedDrivers);

      return sendSuccess(
        res,
        appConstants.HTTP_STATUS.OK,
        appConstants.SUCCESS_MESSAGES.DRIVERS_RETRIEVED,
        paginationDriversList(
          normalizedDrivers,
          req.query.pagesize,
          req.query.page,
        ),
      );
    }

    return sendSuccess(
      res,
      appConstants.HTTP_STATUS.OK,
      appConstants.ERROR_MESSAGES.EMPTY_LIST,
      { data: [] },
    );
  } catch (error) {
    logger.error("Error searching drivers by location", error);
    return sendInternalError(
      res,
      appConstants.ERROR_MESSAGES.INTERNAL_ERROR,
      error,
    );
  }
};

/**
 * @swagger
 * /drivers/{id}/location:
 *   post:
 *     summary: Add or update a driver's location
 *     description: Save the current location of a driver.
 *     tags:
 *      - Drivers
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: The ID of the driver to update location for.
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               location:
 *                 type: object
 *                 properties:
 *                   latitude:
 *                     type: number
 *                   longitude:
 *                     type: number
 *                   city:
 *                     type: string
 *                   state:
 *                     type: string
 *                   country:
 *                     type: string
 *                   dateTime:
 *                     type: string
 *                     format: date-time
 *     responses:
 *       201:
 *         description: Driver location added successfully.
 *       400:
 *         description: Invalid User ID.
 *       500:
 *         description: Internal Server Error
 */
const addDriverLocation = async (req, res) => {
  //save driver current location

  // if (await checkUserId(req.header("UserId")))
  //   return res.status(400).json({ success: false, error: `Invalid User Id` });

  const params = {
    TableName: appConstants.TABLES.DRIVERS,
    Key: {
      id: req.header("UserId"),
    },
  };

  let userData = "";
  try {
    const getCommand = new GetCommand(params);
    const user = await dynamoDocumentClient.send(getCommand);

    if (user.Item === undefined) {
      const params = {
        TableName: appConstants.TABLES.DRIVERS,
        FilterExpression: "#userId = :userId",
        ExpressionAttributeNames: {
          "#userId": "userId",
        },
        ExpressionAttributeValues: {
          ":userId": req.header("UserId"),
        },
      };

      const scanCommand = new ScanCommand(params);
      const user = await dynamoDocumentClient.send(scanCommand);

      if (user.Items.length === 0)
        return res
          .status(400)
          .json({ success: false, error: "Driver id doesn't exists" });

      userData = user.Items;
    } else userData = user.Item;

    //set age=:age

    const whiteListParams = {
      TableName: appConstants.TABLES.WHITELIST,
    };

    const command = new ScanCommand(whiteListParams);
    const data = await dynamoDocumentClient.send(command);

    if (data.Items.length === 0)
      return sendBadRequest(res, "WhiteList data not configured");

    let country = req.body.location.country;
    let result = false;
    if (req.body.location.country !== undefined)
      if (!data.Items[0].country.includes(country.toLowerCase())) {
        result = true;
      }

    // Update stateLoc
    let state = req.body.location.state;
    if (req.body.location.state !== undefined)
      if (!data.Items[0].stateLoc.includes(state.toLowerCase())) {
        result = true;
      }

    // Update city
    let city = req.body.location.city;
    if (req.body.location.city !== undefined)
      if (!data.Items[0].city.includes(city.toLowerCase())) {
        result = true;
      }

    if (result)
      return res
        .status(451)
        .json({ success: false, error: "Location is not in the WhiteList" });

    const UpdateExpression = "set driverLocation = :driverLocation";
    const ExpressionAttributeValues = {
      ":driverLocation": req.body.location,
    };
    const locationParams = {
      TableName: appConstants.TABLES.DRIVERS,
      Key: {
        id: userData[0].id ?? userData.id,
      },
      UpdateExpression: UpdateExpression,
      ExpressionAttributeValues: ExpressionAttributeValues,
      ReturnValues: "UPDATED_NEW",
    };

    try {
      const updateCommand = new UpdateCommand(locationParams);
      await dynamoDocumentClient.send(updateCommand);

      return res.status(201).json({
        success: true,
        message: "Successfully Added Driver Location",
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: `${error}` });
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

/**
 * @swagger
 * /drivers/{id}/reviews:
 *   post:
 *     summary: Add a review for a driver
 *     description: Save a review including ratings and content for a driver.
 *     tags:
 *      - Drivers
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: The ID of the driver to add review for.
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               review:
 *                 type: object
 *                 properties:
 *                   userId:
 *                     type: string
 *                   name:
 *                     type: string
 *                   datePosted:
 *                     type: string
 *                     format: date
 *                   imageURL:
 *                     type: string
 *                     format: uri
 *                   content:
 *                     type: string
 *                   rating:
 *                     type: number
 *     responses:
 *       201:
 *         description: Driver review added successfully.
 *       400:
 *         description: Invalid User ID.
 *       500:
 *         description: Internal Server Error
 */
const addDriverReview = async (req, res) => {
  if (await checkUserId(req.header("UserId")))
    return res.status(400).json({ success: false, error: `Invalid User Id` });

  const params = {
    TableName: appConstants.TABLES.DRIVERS,
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
        .json({ success: false, error: "Driver id doesn't exists" });

    // Initialize reviews array if it doesn't exist
    if (!user.Item.reviews) {
      user.Item.reviews = [];
    }

    req.body.review.id = uuidv4();
    req.body.review.datePosted = dateFormat(new Date());

    const isUserIdPresent = user.Item.reviews.some(
      (item) => item.userId === req.body.review.userId,
    );
    if (isUserIdPresent)
      return res
        .status(400)
        .json({ success: false, error: `Duplicate Review` });

    const updatedReviews = [...user.Item.reviews, req.body.review];
    const averageRatings = await computeRatings(updatedReviews);

    const UpdateExpression = "set reviews = :r, ratings = :ratings";
    const expressionAttributeValues = {
      ":r": updatedReviews,
      ":ratings": averageRatings,
    };

    const reviewParams = {
      TableName: appConstants.TABLES.DRIVERS,
      Key: {
        id: req.params.id,
      },
      UpdateExpression: UpdateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "UPDATED_NEW",
    };
    try {
      const updateCommand = new UpdateCommand(reviewParams);
      await dynamoDocumentClient.send(updateCommand);

      return res.status(201).json({
        success: true,
        message: "Successfully Added Driver Review",
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: `${error}` });
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

/**
 * @swagger
 * /drivers/{id}/students:
 *   post:
 *     summary: Add a student under a specific driver
 *     description: Associate a new student with a driver.
 *     tags:
 *      - Drivers
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: The ID of the driver to add a student for.
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               student:
 *                 type: object
 *                 properties:
 *                   studentId:
 *                     type: string
 *                   name:
 *                     type: string
 *                   datePosted:
 *                     type: string
 *                     format: date
 *                   imageURL:
 *                     type: string
 *                     format: uri
 *                   schoolName:
 *                     type: string
 *                   grade:
 *                     type: string
 *                   age:
 *                     type: integer
 *     responses:
 *       201:
 *         description: Student successfully added to the driver.
 *       400:
 *         description: Invalid User ID.
 *       500:
 *         description: Internal Server Error
 */
const addDriverStudent = async (req, res) => {
  //add student under a certain driver

  if (await checkUserId(req.header("UserId")))
    return res.status(400).json({ success: false, error: `Invalid User Id` });

  const params = {
    TableName: appConstants.TABLES.DRIVERS,
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
        .json({ success: false, error: "Driver id doesn't exists" });

    const isStudentIdPresent = user.Item.students.some(
      (item) => item.studentId === req.body.student.studentId,
    );

    if (isStudentIdPresent)
      return res
        .status(400)
        .json({ success: false, error: `Student Already Added` });

    if (user.Item.rideShare === true && user.Item.students.length >= 1)
      return res.status(400).json({
        success: false,
        isRideShare: false,
        message: "Ride Share false ",
      });

    //get imageurl, name, generate date format - dd MMMM yyyy HH:mm
    //code here
    const getStudentParams = {
      TableName: appConstants.TABLES.STUDENTS,
      Key: {
        id: req.body.student.studentId,
      },
    };
    const getStudentCommand = new GetCommand(getStudentParams);
    const userStudent = await dynamoDocumentClient.send(getStudentCommand);

    req.body.student.imageUrl = userStudent.Item.imageUrl ?? "";
    req.body.student.name = userStudent.Item.name ?? "";
    req.body.student.datePosted = dateFormat(new Date());

    const updatedStudents = [...user.Item.students, req.body.student];

    if (updatedStudents.length > userStudent.Item.maxPassenger)
      return res
        .status(400)
        .json({ success: false, message: "Max Passenger exceeded" });

    const UpdateExpression = "set students = :s, totalStudents = :ts";
    const expressionAttributeValues = {
      ":s": updatedStudents,
      ":ts": updatedStudents.length,
    };

    const studentParams = {
      TableName: appConstants.TABLES.DRIVERS,
      Key: {
        id: req.params.id,
      },
      UpdateExpression: UpdateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "UPDATED_NEW",
    };

    try {
      const updateCommand = new UpdateCommand(studentParams);
      await dynamoDocumentClient.send(updateCommand);

      return res.status(201).json({
        success: true,
        message: "Successfully Added Student into the Driver",
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: `${error}` });
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

/**
 * @swagger
 * /drivers:
 *   post:
 *     summary: Add a new driver
 *     description: Register a new driver in the system.
 *     tags:
 *      - Drivers
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               age:
 *                 type: integer
 *               gender:
 *                 type: string
 *               description:
 *                 type: string
 *               vehicleName:
 *                 type: string
 *               vehicleType:
 *                 type: string
 *               plateNumber:
 *                 type: string
 *               imageBase64:
 *                 type: string
 *                 description: Base64 encoded image string.
 *
 *     responses:
 *       201:
 *         description: Driver successfully registered.
 *       400:
 *         description: Invalid User ID.
 *       500:
 *         description: Internal Server Error
 */
const addDriver = async (req, res) => {
  if (await checkUserId(req.header("UserId")))
    return sendBadRequest(res, appConstants.ERROR_MESSAGES.INVALID_USER_ID);
  const driverUserid = req.header("UserId");
  const { error } = addDriverSchema.validate(req.body, {
    allowUnknown: false,
  });
  if (error) return sendBadRequest(res, error.toString());

  AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID_DRIVERS,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY_DRIVERS,
    region: process.env.REGION_DRIVERS, // replace with your S3 bucket's region
  });

  const params = {
    TableName: appConstants.TABLES.DRIVERS,
    FilterExpression: "#userId = :userId",
    ExpressionAttributeNames: {
      "#userId": "userId",
    },
    ExpressionAttributeValues: {
      ":userId": driverUserid,
    },
  };
  const scanCommand = new ScanCommand(params);
  const driverData = await dynamoDocumentClient.send(scanCommand);
  if (driverData.Items.length > 0) {
    return sendConflict(res, "Driver already exists");
  }

  try {
    if (req.body.imageBase64 !== undefined) {
      const s3 = new AWS.S3();
      const result = await s3Data(req.body.imageBase64);
      await s3.upload(result.s3Params).promise();

      req.body.imageUrl = process.env.imageURL + `/${result.imageKey}`;
    }
    req.body.id = uuidv4();
    req.body.ratings = 0;
    req.body.totalStudents = 0;
    req.body.reviews = [];
    req.body.students = [];
    req.body.imageUrl = "";
    req.body.location = {};
    req.body.userId = req.header("UserId");
    req.body.imageBase64 = "";
    req.body.driverStatus = "new";
    req.body.background = {};
    req.body.approvedStatus = false;
    req.body.dateRegistered = Math.floor(new Date().getTime() / 1000);

    if (req.body.gender === undefined) req.body.gender = "";
    const emailParams = {
      TableName: appConstants.TABLES.SIGNUP,
      Key: {
        id: req.body.userId,
      },
    };
    const getCommand = new GetCommand(emailParams);
    const user = await dynamoDocumentClient.send(getCommand);

    if (user.Item === undefined)
      return res
        .status(400)
        .json({ success: false, error: "User Id doesn't exist" });

    const stripe = require("stripe")(process.env.stripeKey);
    const customer = await stripe.customers.create({
      name: req.body.name,
      email: user.Item.email,
    });
    req.body.customerId = customer.id;

    // Create Stripe Connect account for the driver
    const account = await stripe.accounts.create({
      type: "custom", // or 'express' based on your needs
      country: "US", // Update based on your supported countries
      email: user.Item.email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_type: "individual",
      business_profile: {
        mcc: "4121", // MCC code for Taxicabs/Limousines
        url: process.env.FRONTEND_URL,
      },
      tos_acceptance: {
        date: Math.floor(Date.now() / 1000),
        ip: req.ip, // Client's IP address
      },
    });
    req.body.stripeAccountId = account.id;

    const params = {
      TableName: appConstants.TABLES.DRIVERS,
      Item: req.body,
    };

    const putCommand = new PutCommand(params);
    await dynamoDocumentClient.send(putCommand);
    return res.status(201).json({
      success: true,
      message: "Driver Data Successfully Saved",
      data: {
        driverId: req.body.id,
        driverUserId: req.body.userId,
        customerId: req.body.customerId,
      },
      body: req.body,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

/**
 * @swagger
 * /drivers/{id}:
 *   put:
 *     summary: Edit details of an existing driver
 *     description: Update the information of a driver with a specific ID.
 *     tags:
 *      - Drivers
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: The ID of the driver to be updated.
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               description:
 *                 type: string
 *               name:
 *                 type: string
 *               age:
 *                 type: integer
 *               vehicleName:
 *                 type: string
 *               vehicleType:
 *                 type: string
 *               plateNumber:
 *                 type: string
 *               imageBase64:
 *                 type: string
 *                 description: Base64 encoded image string.
 *     responses:
 *       200:
 *         description: Driver data successfully updated.
 *       400:
 *         description: Invalid User ID.
 *       500:
 *         description: Internal Server Error
 */
const editDriver = async (req, res) => {
  //edit driver details
  //driver id - data needed

  if (await checkUserId(req.header("UserId")))
    return res.status(400).json({ success: false, error: `Invalid User Id` });

  if (Object.keys(req.body).length === 0)
    return res.status(400).json({ success: false, error: "No Data to Edit" });

  AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID_DRIVERS,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY_DRIVERS,
    region: process.env.REGION_DRIVERS, // replace with your S3 bucket's region
  });

  try {
    const driverParams = {
      TableName: appConstants.TABLES.DRIVERS,
      Key: {
        id: req.params.id,
      },
    };

    const getCommand = new GetCommand(driverParams);
    const user = await dynamoDocumentClient.send(getCommand);

    if (user.Item === undefined) {
      const scanParams = {
        TableName: appConstants.TABLES.DRIVERS,
        FilterExpression: "#userId = :userId",
        ExpressionAttributeNames: {
          "#userId": "userId",
        },
        ExpressionAttributeValues: {
          ":userId": req.params.id,
        },
      };

      const command = new ScanCommand(scanParams);
      const userData = await dynamoDocumentClient.send(command);

      if (userData.Items.length === 0)
        return res
          .status(400)
          .json({ success: false, error: "Driver Id doesn't exist" });

      req.params.id = userData.Items[0].id;
    }

    let updateExpressionParts = [];
    const expressionAttributeValues = {};

    const fieldsToUpdate = {
      approvedStatus: ":approvedStatus",
      city: ":city",
      country: ":country",
      experience: ":experience",
      gender: ":gender",
      licenseNumber: ":licenseNumber",
      insuranceId: ":insuranceId",
      address: ":address",
      description: ":description",
      driverName: ":driverName",
      age: ":age",
      vehicleName: ":vehicleName",
      vehicleType: ":vehicleType",
      plateNumber: ":plateNumber",
      driverStatus: ":driverStatus",
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

    const params = {
      TableName: appConstants.TABLES.DRIVERS,
      Key: {
        id: req.params.id,
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "UPDATED_NEW",
    };

    const updateCommand = new UpdateCommand(params);
    await dynamoDocumentClient.send(updateCommand);

    return res
      .status(200)
      .json({ success: true, message: "Driver Data Successfully Updated" });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

/**
 * @swagger
 * /drivers/{driverid}/reviews:
 *   put:
 *     summary: Edit a review for a specific driver
 *     description: Update an existing review for a driver.
 *     tags:
 *      - Drivers
 *     parameters:
 *       - in: path
 *         name: driverid
 *         required: true
 *         description: The ID of the driver whose review is to be edited.
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               review:
 *                 type: object
 *                 properties:
 *                   reviewid:
 *                     type: string
 *                   name:
 *                     type: string
 *                   content:
 *                     type: string
 *                   rating:
 *                     type: number
 *                   datePosted:
 *                     type: string
 *                     format: date
 *     responses:
 *       200:
 *         description: Driver review successfully edited.
 *       400:
 *         description: Invalid User ID or Review Not Found.
 *       500:
 *         description: Internal Server Error
 */
const editDriverReview = async (req, res) => {
  //edit review for a certain driver
  //review id and driver id - data needed
  //req.body.review

  if (await checkUserId(req.header("UserId")))
    return res.status(400).json({ success: false, error: `Invalid User Id` });

  const params = {
    TableName: appConstants.TABLES.DRIVERS,
    Key: {
      id: req.params.driverid,
    },
  };
  try {
    const getCommand = new GetCommand(params);
    const user = await dynamoDocumentClient.send(getCommand);

    let index = user.Item.reviews.findIndex((p) => p.id == req.params.reviewid);
    if (index == -1)
      return res
        .status(400)
        .json({ success: false, error: `Review Not Found` });

    user.Item.reviews[index].name = req.body.name;
    user.Item.reviews[index].content = req.body.content;
    user.Item.reviews[index].rating = req.body.rating;

    //date posted can be also generated via server - for date format purposes
    //coordinate with the front-end to discuss about it.
    user.Item.reviews[index].datePosted = req.body.datePosted;

    const averageRatings = await computeRatings(user.Item.reviews);
    const UpdateExpression = "set reviews = :r, ratings = :ratings";
    const expressionAttributeValues = {
      ":r": user.Item.reviews,
      ":ratings": averageRatings,
    };

    const reviewParams = {
      TableName: appConstants.TABLES.DRIVERS,
      Key: {
        id: req.params.driverid,
      },
      UpdateExpression: UpdateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "UPDATED_NEW",
    };

    try {
      const updateCommand = new UpdateCommand(reviewParams);
      const updateUser = await dynamoDocumentClient.send(updateCommand);

      return res.status(200).json({
        success: true,
        message: "Successfully Edited Driver Review",
        data: updateUser,
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: `${error}` });
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

/**
 * @swagger
 * /drivers/{id}:
 *   delete:
 *     summary: Delete a driver
 *     description: Remove a driver from the system using their ID.
 *     tags:
 *      - Drivers
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: The ID of the driver to be deleted.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Driver successfully deleted.
 *       400:
 *         description: Invalid User ID.
 *       500:
 *         description: Internal Server Error
 */
const deleteDriver = async (req, res) => {
  //delete driver
  //data needed - driver id

  if (await checkUserId(req.header("UserId")))
    return res.status(400).json({ success: false, error: `Invalid User Id` });

  try {
    const params = {
      TableName: appConstants.TABLES.DRIVERS,
      Key: {
        id: req.params.id,
      },
    };

    const deleteCommand = new DeleteCommand(params);
    await dynamoDocumentClient.send(deleteCommand);
    return res
      .status(200)
      .json({ success: true, message: "Driver Data Successfully Deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

/**
 * @swagger
 * /drivers/{driverid}/reviews/{reviewid}:
 *   delete:
 *     summary: Delete a review for a specific driver
 *     description: Remove a review associated with a driver.
 *     tags:
 *      - Drivers
 *     parameters:
 *       - in: path
 *         name: driverid
 *         required: true
 *         description: The ID of the driver.
 *         schema:
 *           type: string
 *       - in: path
 *         name: reviewid
 *         required: true
 *         description: The ID of the review to be deleted.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Driver review successfully deleted.
 *       400:
 *         description: Invalid User ID or Review Not Found.
 *       500:
 *         description: Internal Server Error
 */
const deleteDriverReview = async (req, res) => {
  //delete a review for a certain driver
  //data needed - review id and driver id
  if (await checkUserId(req.header("UserId")))
    return res.status(400).json({ success: false, error: `Invalid User Id` });

  let params = {
    TableName: appConstants.TABLES.DRIVERS,
    Key: {
      id: req.params.driverid,
    },
  };

  try {
    let getCommand = new GetCommand(params);
    let user = await dynamoDocumentClient.send(getCommand);

    let indexToRemove = user.Item.reviews.findIndex(
      (p) => p.id === req.params.reviewid,
    );
    if (indexToRemove == -1)
      return res
        .status(400)
        .json({ success: false, error: `Review Not Found` });

    let reviewParams = {
      TableName: appConstants.TABLES.DRIVERS,
      Key: {
        id: req.params.driverid,
      },
      UpdateExpression: `REMOVE reviews[${indexToRemove}]`, //test needed if this code is really working
      ReturnValues: "ALL_NEW", // You can choose to get the updated item back
    };

    try {
      let updateCommand = new UpdateCommand(reviewParams);
      const updateUser = await dynamoDocumentClient.send(updateCommand);

      let params = {
        TableName: appConstants.TABLES.DRIVERS,
        Key: {
          id: req.params.driverid,
        },
      };

      let getCommand = new GetCommand(params);
      let user = await dynamoDocumentClient.send(getCommand);
      const averageRatings = await computeRatings(user.Item.reviews);

      const UpdateExpression = "set ratings = :ratings";
      const expressionAttributeValues = {
        ":ratings": averageRatings,
      };

      let reviewUpdateParams = {
        TableName: appConstants.TABLES.DRIVERS,
        Key: {
          id: req.params.driverid,
        },
        UpdateExpression: UpdateExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: "UPDATED_NEW",
      };

      updateCommand = new UpdateCommand(reviewUpdateParams);
      await dynamoDocumentClient.send(updateCommand);

      return res.status(200).json({
        success: true,
        message: "Successfully Removed Driver Review",
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: `${error}` });
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

/**
 * @swagger
 * /drivers/{driverid}/students/{studentid}:
 *   delete:
 *     summary: Delete a student associated with a specific driver
 *     description: Remove a student from a driver's list using the student's and driver's IDs.
 *     tags:
 *      - Drivers
 *     parameters:
 *       - in: path
 *         name: driverid
 *         required: true
 *         description: The ID of the driver.
 *         schema:
 *           type: string
 *       - in: path
 *         name: studentid
 *         required: true
 *         description: The ID of the student to be deleted.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Student successfully removed from the driver.
 *       400:
 *         description: Invalid User ID or Student Not Found.
 *       500:
 *         description: Internal Server Error
 */
const deleteDriverStudent = async (req, res) => {
  //delete a student for a certain driver
  //data needed - student id and driver id
  if (await checkUserId(req.header("UserId")))
    return res.status(400).json({ success: false, error: `Invalid User Id` });

  const params = {
    TableName: appConstants.TABLES.DRIVERS,
    Key: {
      id: req.params.driverid,
    },
  };

  try {
    const getCommand = new GetCommand(params);
    const user = await dynamoDocumentClient.send(getCommand);

    let indexToRemove = user.Item.students.findIndex(
      (p) => p.studentId === req.params.studentid,
    );
    if (indexToRemove == -1)
      return res
        .status(400)
        .json({ success: false, error: `Student Not Found` });

    const studentParams = {
      TableName: appConstants.TABLES.DRIVERS,
      Key: {
        id: req.params.driverid,
      },
      UpdateExpression: `REMOVE students[${indexToRemove}]`, //test needed if this code is really working
      ReturnValues: "ALL_NEW", // You can choose to get the updated item back
    };

    const updateCommand = new UpdateCommand(studentParams);
    const updateUser = await dynamoDocumentClient.send(updateCommand);

    const getParams = {
      TableName: appConstants.TABLES.SCHEDULES,
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
        return parseInt(b.createdDate) * 1000 - parseInt(a.createdDate) * 1000;
      });

      let slicedData = sortedData.slice(0, 1);
      slicedData = slicedData.Items.students.filter(
        (student) => student.studentId !== req.params.studentId,
      );

      const updateParams = {
        TableName: appConstants.TABLES.SCHEDULES,
        Key: {
          id: slicedData.Items.id,
        },
        UpdateExpression: "set students = :s",
        ExpressionAttributeValues: {
          ":s": students,
        },
        ReturnValues: "UPDATED_NEW",
      };

      const updateCommand = new UpdateCommand(updateParams);
      await dynamoDocumentClient.send(updateCommand);
    }
    return res.status(200).json({
      success: true,
      message: "Successfully Removed a Student for a Certain Driver",
      data: updateUser,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const searchDrivers = async (req, res) => {
  if (await checkUserId(req.header("UserId")))
    return res.status(400).json({ success: false, error: `Invalid User Id` });

  return getAllDrivers(req, res);

  // if (Object.keys(req.query).length === 0) {
  //   // No query parameters, get all drivers
  //   return getAllDrivers(req, res);
  // } else if (
  //   Object.keys(req.query).length === 1 &&
  //   req.query.location != undefined
  // )
  //   return searchDriversByLocation(req, res);
  // else {
  //   // Query parameters exist, apply filters
  //   return searchFilters(req, res);
  // }
};

async function uploadToS3AndUpdateRequest(base64Data, req, key) {
  const s3 = new AWS.S3();
  if (base64Data !== undefined) {
    const data = await s3Data(base64Data);
    await s3.upload(data.s3Params).promise();
    req.body.background[key + "Url"] =
      process.env.imageURL + `/${data.imageKey}`;
    req.body.background[key + "Base64"] = "";
  }
}

/**
 * @swagger
 * /background-verification:
 *   post:
 *     tags:
 *       - Drivers
 *     summary: Background Verification for Drivers
 *     description: This endpoint handles the background verification process for drivers, including uploading relevant documents to S3.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *               - background
 *             properties:
 *               id:
 *                 type: string
 *                 description: The unique identifier for the driver.
 *               background:
 *                 type: object
 *                 description: Background information including document images in Base64 format.
 *                 properties:
 *                   driverLicenseFrontBase64:
 *                     type: string
 *                     format: byte
 *                     description: Base64 encoded image of the driver's license front.
 *                   driverLicenseBackBase64:
 *                     type: string
 *                     format: byte
 *                     description: Base64 encoded image of the driver's license back.
 *                   vehicleRegistrationBase64:
 *                     type: string
 *                     format: byte
 *                     description: Base64 encoded image of the vehicle registration.
 *                   vehicleInsuranceBase64:
 *                     type: string
 *                     format: byte
 *                     description: Base64 encoded image of the vehicle insurance.
 *     responses:
 *       200:
 *         description: Background verification successful and documents uploaded.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: Bad request, such as invalid User ID or driver ID does not exist.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 error:
 *                   type: string
 *       500:
 *         description: Internal server error or issues with document upload.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 error:
 *                   type: string
 */
const backgroundVerification = async (req, res) => {
  // if (await checkUserId(req.header("UserId")))
  //   return res.status(400).json({ success: false, error: `Invalid User Id` });

  const params = {
    TableName: appConstants.TABLES.DRIVERS,
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
        .json({ success: false, error: "driver id doesn't exists" });

    AWS.config.update({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID_DRIVERS,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY_DRIVERS,
      region: process.env.REGION_DRIVERS, // replace with your S3 bucket's region
    });

    if (req.body.background.driverLicenseFrontBase64 !== undefined)
      await uploadToS3AndUpdateRequest(
        req.body.background.driverLicenseFrontBase64,
        req,
        "driverLicenseFront",
      );
    else
      req.body.background.driverLicenseFrontBase64 =
        user.Item.driverLicenseFrontUrl;
    if (req.body.background.driverLicenseBackBase64 !== undefined)
      await uploadToS3AndUpdateRequest(
        req.body.background.driverLicenseBackBase64,
        req,
        "driverLicenseBack",
      );
    else
      req.body.background.driverLicenseBackUrl = user.Item.driverLicenseBackUrl;
    if (req.body.background.vehicleRegistrationBase64 !== undefined)
      await uploadToS3AndUpdateRequest(
        req.body.background.vehicleRegistrationBase64,
        req,
        "vehicleRegistration",
      );
    else req.body.vehicleRegistrationUrl = user.Item.vehicleRegistrationUrl;
    if (req.body.background.vehicleInsuranceBase64 !== undefined)
      await uploadToS3AndUpdateRequest(
        req.body.background.vehicleInsuranceBase64,
        req,
        "vehicleInsurance",
      );
    else req.body.vehicleInsuranceUrl = user.Item.vehicleInsuranceUrl;

    const lastUpdatedDate = new Date();
    req.body.background.lastUpdated = lastUpdatedDate.getTime();

    const UpdateExpression =
      "set #background = :background, #insuranceId = :insuranceId, #licenseNumber = :licenseNumber";
    const expressionAttributeNames = {
      "#background": "background",
      "#insuranceId": "insuranceId",
      "#licenseNumber": "licenseNumber",
    };
    const expressionAttributeValues = {
      ":background": req.body.background,
      ":insuranceId": req.body.insuranceId ?? "",
      ":licenseNumber": req.body.licenseNumber ?? "",
    };

    const backgroundParams = {
      TableName: appConstants.TABLES.DRIVERS,
      Key: {
        id: req.body.id,
      },
      UpdateExpression: UpdateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "UPDATED_NEW",
    };

    const updateCommand = new UpdateCommand(backgroundParams);
    await dynamoDocumentClient.send(updateCommand);
    return res
      .status(200)
      .json({ success: true, message: "Documents Successfully Uploaded" });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const approvedDriver = async (req, res) => {
  if (req.body.approvedStatus === undefined)
    return res
      .status(400)
      .json({ success: false, error: "Approved Status is required" });

  try {
    const params = {
      TableName: appConstants.TABLES.DRIVERS,
      FilterExpression: "#userId = :userId",
      ExpressionAttributeNames: {
        "#userId": "userId",
      },
      ExpressionAttributeValues: {
        ":userId": req.header("UserId"),
      },
    };

    const scanCommand = new ScanCommand(params);
    const user = await dynamoDocumentClient.send(scanCommand);

    if (user.Items.length === 0)
      return res
        .status(400)
        .json({ success: false, error: "User Id doesn't exists" });

    const updateParams = {
      TableName: appConstants.TABLES.DRIVERS,
      Key: {
        id: user.Items[0].id,
      },
      UpdateExpression: "SET #approvedStatus = :approvedStatus",
      ExpressionAttributeNames: {
        "#approvedStatus": "approvedStatus",
      },
      ExpressionAttributeValues: {
        ":approvedStatus": req.body.approvedStatus,
      },
    };
    const updateCommand = new UpdateCommand(updateParams);
    await dynamoDocumentClient.send(updateCommand);

    return res.status(200).json({
      success: true,
      message: "Driver Background Verification Successfully Updated",
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const changeDriver = async (req, res) => {
  if (await checkUserId(req.header("UserId")))
    return res.status(400).json({ success: false, error: `Invalid User Id` });

  try {
    //check the userId if it has booking and schedule to get the driver id
    //replace and update the driver id with the selected one -- schedule

    const scanParams = {
      TableName: appConstants.TABLES.BOOKINGS,
      FilterExpression: "#uId = :userId",
      ExpressionAttributeNames: {
        "#uId": "userId",
      },
      ExpressionAttributeValues: {
        ":userId": req.header("UserId"),
      },
    };

    const command = new ScanCommand(scanParams);
    const userData = await dynamoDocumentClient.send(command);

    if (userData.Items.length === 0)
      return res
        .status(400)
        .json({ success: false, error: "No Driver Selected Yet" });

    const sortedData = userData.Items.sort((a, b) => {
      return new Date(b.dateCreated) - new Date(a.dateCreated);
    });
    const slicedData = sortedData.slice(0, 1);
    //slicedData[0].driverId;

    //req.body.driverId -- update
    const updateExpression =
      "set driverId=:driverId, bookingStatus=:bookingStatus";
    const expressionAttributeValues = {
      ":driverId": req.body.driverId ?? "",
      ":bookingStatus": false,
    };

    const updateParams = {
      TableName: appConstants.TABLES.BOOKINGS,
      Key: {
        id: slicedData[0].id,
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "UPDATED_NEW",
    };
    const updateCommand = new UpdateCommand(updateParams);
    await dynamoDocumentClient.send(updateCommand);
    return res
      .status(200)
      .json({ success: true, message: "Successfully Changed Driver" });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const computeDriverRatings = async (req, res) => {
  const params = {
    TableName: appConstants.TABLES.DRIVERS,
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
        .json({ success: false, error: "Driver Id doesn't exist" });

    const averageRatings = await computeRatings(user.Item.reviews);

    const UpdateExpression = "set ratings = :ratings";
    const expressionAttributeValues = {
      ":ratings": averageRatings,
    };

    const reviewParams = {
      TableName: appConstants.TABLES.DRIVERS,
      Key: {
        id: req.params.id,
      },
      UpdateExpression: UpdateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "UPDATED_NEW",
    };

    const updateCommand = new UpdateCommand(reviewParams);
    await dynamoDocumentClient.send(updateCommand);

    return res
      .status(200)
      .json({ success: true, message: "Succesfully Computed Driver Ratings" });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const checkApproval = async (req, res) => {
  if (await checkUserId(req.header("UserId")))
    return res.status(400).json({ success: false, error: `Invalid User Id` });

  try {
    const params = {
      TableName: appConstants.TABLES.DRIVERS,
      Key: {
        id: req.header("UserId"),
      },
    };

    const getCommand = new GetCommand(params);
    const user = await dynamoDocumentClient.send(getCommand);

    if (user.Item === undefined) {
      const params = {
        TableName: appConstants.TABLES.DRIVERS,
        FilterExpression: "#userId = :userId",
        ExpressionAttributeNames: {
          "#userId": "userId",
        },
        ExpressionAttributeValues: {
          ":userId": req.header("UserId"),
        },
      };

      const scanCommand = new ScanCommand(params);
      const user = await dynamoDocumentClient.send(scanCommand);

      if (user.Items.length === 0)
        return res
          .status(400)
          .json({ success: false, error: "driver id doesn't exists" });

      if (user.Items[0].approvedStatus === "")
        return res.status(200).json({
          success: true,
          data: {
            backgroundCheckStatus: false,
          },
        });

      return res.status(200).json({
        success: true,
        data: {
          backgroundCheckStatus: user.Items[0].approvedStatus ?? false,
        },
      });
    }

    if (user.Item.approvedStatus === "")
      return res.status(200).json({
        success: true,
        data: {
          backgroundCheckStatus: false,
        },
      });

    return res.status(200).json({
      success: true,
      data: {
        backgroundCheckStatus: user.Item.approvedStatus ?? false,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const driverImageUpload = async (req, res) => {
  if (await checkUserId(req.header("UserId")))
    return res.status(400).json({ success: false, error: `Invalid User Id` });

  if (req.body.imageBase64 === undefined)
    return res
      .status(400)
      .json({ success: false, error: "ImageBase64 is required" });
  try {
    AWS.config.update({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID_DRIVERS,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY_DRIVERS,
      region: process.env.REGION_DRIVERS, // replace with your S3 bucket's region
    });

    const params = {
      TableName: appConstants.TABLES.DRIVERS,
      FilterExpression: "#userId = :userId",
      ExpressionAttributeNames: {
        "#userId": "userId", // Add this line to map 'email' to '#em'
      },
      ExpressionAttributeValues: {
        ":userId": req.header("UserId"), // Add this line to define the value for 'email'
      },
    };

    const getCommand = new ScanCommand(params);
    const user = await dynamoDocumentClient.send(getCommand);

    if (user.Items.length === 0)
      return res
        .status(400)
        .json({ success: false, error: "Driver User Id doesn't exists" });

    const s3 = new AWS.S3();

    //delete old image
    if (user.Items[0].imageURL !== undefined) {
      const urlParts = new URL(user.Items[0].imageUrl);
      const hostname = urlParts.hostname;
      const pathname = urlParts.pathname;

      // Extract the bucket name
      const bucketName = hostname.split(".")[0];

      // Extract the key, removing the leading '/'
      const key = pathname.substring(1);
      const deleteParams = {
        Bucket: bucketName,
        Key: key,
      };

      await s3.deleteObject(deleteParams);
    }

    result = await s3Data(req.body.imageBase64); //parse image
    await s3.upload(result.s3Params).promise(); //upload image to s3

    //update it on the dynamodb
    const expressionAttributeValues = {
      ":imageUrl": process.env.imageURL + `/${result.imageKey}`,
    };
    const updateParams = {
      TableName: appConstants.TABLES.DRIVERS,
      Key: {
        id: user.Items[0].id,
      },
      UpdateExpression: "set imageUrl=:imageUrl",
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "UPDATED_NEW",
    };
    const updateCommand = new UpdateCommand(updateParams);
    await dynamoDocumentClient.send(updateCommand);
    return res.status(200).json({
      success: true,
      message: "Driver Image Successfully Added",
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const createOnboardingLink = async (req, res) => {
  try {
    const stripe = require("stripe")(process.env.stripeKey);
    // Get driver's Stripe account ID from your database
    const params = {
      TableName: appConstants.TABLES.DRIVERS,
      Key: {
        id: req.body.driverId,
      },
    };

    const getCommand = new GetCommand(params);
    const driver = await dynamoDocumentClient.send(getCommand);

    if (!driver.Item?.stripeAccountId) {
      return res.status(400).json({
        success: false,
        error: "Driver doesn't have a Stripe account",
      });
    }

    // Create account link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: driver.Item.stripeAccountId,
      refresh_url: `${process.env.FRONTEND_URL}/stripe/refresh`,
      return_url: `${process.env.FRONTEND_URL}/stripe/return`,
      type: "account_onboarding",
    });

    return res.status(200).json({
      success: true,
      url: accountLink.url,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  checkApproval,
  getMyCurrentDriver,
  getDriverDetailsById,
  getDriverReviews,
  getDriverLocation,
  getDriverStudents,
  getAllDrivers,

  addDriver,
  addDriverReview,
  addDriverStudent,
  addDriverLocation,
  changeDriver,
  computeDriverRatings,

  editDriver,
  editDriverReview,

  deleteDriver,
  deleteDriverReview,
  deleteDriverStudent,
  searchDrivers,

  //drivers app api
  backgroundVerification,
  approvedDriver,
  driverImageUpload,
  createOnboardingLink,
};
