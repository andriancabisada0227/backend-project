const { dynamoClient } = require("../config/aws");
const {
  GetCommand,
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
  DeleteCommand,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");

const { v4: uuidv4 } = require("uuid");
const AWS = require("aws-sdk");
const dynamoDocumentClient = DynamoDBDocumentClient.from(dynamoClient);
const { checkUserId, checkParent } = require("./utils/userIdChecking");
const s3Data = require("./utils/s3");
const { array } = require("joi");
const {
  createParentSchema
} = require("./validation/parents.validation");
const { getParentsByName, updateParent, isParent, getParentByUserId, updateParentLocation } = require('../app/repository/parentsRepository');

const createCustomer = async (userId) => {
  const stripe = require("stripe")(process.env.stripeKey);

  try {
    const parentsParams = {
      TableName: "parentsTable",
      FilterExpression: "#userId = :userId",
      ExpressionAttributeNames: {
        "#userId": "userId",
      },
      ExpressionAttributeValues: {
        ":userId": userId,
      },
    };
    const scanCommand = new ScanCommand(parentsParams);
    const parentData = dynamoDocumentClient.send(scanCommand);

    const emailParams = {
      TableName: "signupTable",
      Key: {
        id: userId,
      },
    };
    const getCommand = new GetCommand(emailParams);
    const user = dynamoDocumentClient.send(getCommand);

    await TaskQueue.WhenAll(parentData, user);

    if (parentData.Items.length === 0)
      return { success: false, error: "Parent id doesn't exists" };

    if (user.Item === undefined)
      return { success: false, error: "user id doesn't exists" };

    const customer = await stripe.customers.create({
      name: parentData.Items[0].parentName,
      email: user.Item.email,
    });

    //update parent detail - add customerId value -
    const updateExpression = "set customerId=:customerId";
    const expressionAttributeValues = {
      ":customerId": customer.id ?? parentData.Items[0].customerId,
    };
    const updateParams = {
      TableName: "parentsTable",
      Key: {
        id: parentData.Items[0].id,
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "UPDATED_NEW",
    };
    const updateCommand = new UpdateCommand(updateParams);
    await dynamoDocumentClient.send(updateCommand);

    return customer.id;
  } catch (error) {
    return { success: false, error: `${error}` };
  }
};

/**
 * @swagger
 * /parents/{id}:
 *   get:
 *     summary: Get a parent by ID
 *     description: Retrieve a parent's information by their ID.
 *     tags:
 *       - Parents
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Parent's ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successful response with parent data
 *       500:
 *         description: Internal server error
 */
const getParentById = async (req, res) => {
  if (await checkUserId(req.header("UserId")))
    return res.status(400).json({ success: false, error: `Invalid User Id` });

  console.log(req.params.id);

  try {
    const params = {
      TableName: "parentsTable",
      FilterExpression: "#userId = :userId",
      ExpressionAttributeNames: {
        "#userId": "userId", // Add this line to map 'email' to '#em'
      },
      ExpressionAttributeValues: {
        ":userId": req.params.id, // Add this line to define the value for 'email'
      },
    };

    const getCommand = new ScanCommand(params);
    const user = await dynamoDocumentClient.send(getCommand);

    if (user.Items.length === 0)
      return res
        .status(400)
        .json({ success: false, error: "Parent id doesn't exists" });

    const emailParams = {
      TableName: "signupTable",
      Key: {
        id: user.Items[0].userId,
      },
    };

    const getEmailCommand = new GetCommand(emailParams);
    const resultData = await dynamoDocumentClient.send(getEmailCommand);

    if (resultData.Item !== undefined) {
      user.Items[0].email = resultData.Item.email;
      user.Items[0].phoneNumber = resultData.Item.phoneNumber;
    }

    const bookingParams = {
      TableName: "bookingsTable",
      FilterExpression: "#userId = :userId AND #bookingStatus = :bookingStatus",
      ExpressionAttributeNames: {
        "#userId": "userId",
        "#bookingStatus": "bookingStatus",
      },
      ExpressionAttributeValues: {
        ":userId": req.params.id,
        ":bookingStatus": false,
      },
    };

    const command = new ScanCommand(bookingParams);
    const result = await dynamoDocumentClient.send(command);
    //console.log(result.Items);
    //dateCreated
    if (result.Items.length != 0) {
      const sortedData = result.Items.sort((a, b) => {
        return new Date(b.dateCreated) - new Date(a.dateCreated);
      });
      //console.log(sortedData[0].dateCreated);
      const slicedData = sortedData.slice(0, 1);
      user.Items[0].driverId = slicedData[0].driverId;
      return res.status(200).json({ success: true, data: user.Items[0] });
    } else return res.status(200).json({ success: true, data: user.Items[0] });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

/**
 * @swagger
 * /parents/name/{parentsName}:
 *   get:
 *     summary: Get a parent by name
 *     description: Retrieve a parent's information by their name.
 *     tags:
 *       - Parents
 *     parameters:
 *       - in: path
 *         name: parentsName
 *         required: true
 *         description: Parent's name
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successful response with parent data
 *       500:
 *         description: Internal server error
 */
const getParentByName = async (req, res) => {
  if (await checkUserId(req.header("UserId")))
    return res.status(400).json({ success: false, error: `Invalid User Id` });

  const parentName = req.params.parentName;
  console.log("parent name", parentName);

  if (!parentName) {
    return res
      .status(400)
      .json({ success: false, error: "Missing parentName parameter" });
  }

  try {
    const parents = await getParentsByName(parentName);
    
    if (parents.length === 0) {
      return res.status(404).json({ success: false, error: "No parents found with that name" });
    }

    return res.status(200).json({ success: true, data: parents });
  } catch (error) {
    console.error("Error in getParentByName:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * @swagger
 * /parents:
 *   post:
 *     summary: Save a new parent
 *     description: Create a new parent record.
 *     tags:
 *       - Parents
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               parentName:
 *                 type: string
 *               address:
 *                 type: string
 *               city:
 *                 type: string
 *               country:
 *                 type: string
 *               personName:
 *                 type: string
 *               phoneNumber:
 *                 type: string
 *             required:
 *               - parentName
 *               - address
 *               - city
 *               - country
 *     responses:
 *       200:
 *         description: Successful response with message
 *       500:
 *         description: Internal server error
 */
const addParent = async (req, res) => {
  req.body.userId = req.header("UserId");
  // const { error, value } = createParentSchema.validate(req.body, {
  //   allowUnknown: false,
  // });

  // if (error) return res.status(400).json({ success: false, error: `${error}` });


  if (await checkUserId(req.body.userId))
    return res.status(400).json({ success: false, error: `Invalid User Id` });

  if (await checkParent(req.body.userId))
    return res
      .status(400)
      .json({ success: false, error: `You are not a parent user` });

  //validate if userid does have a record already
  //code here
  const parentsParams = {
    TableName: "parentsTable",
    FilterExpression: "#userId = :userId",
    ExpressionAttributeNames: {
      "#userId": "userId",
    },
    ExpressionAttributeValues: {
      ":userId": req.body.userId,
    },
  };
  const scanCommand = new ScanCommand(parentsParams);
  const userData = await dynamoDocumentClient.send(scanCommand);
  // if (userData.Items.length === 1)
  //   return res
  //     .status(400)
  //     .json({ success: false, error: "User already have data" });

  req.body.id = uuidv4();
  req.body.imageUrl = "";
  req.body.parentLocation = {};
  req.body.driverId = "";
  const params = {
    TableName: "parentsTable",
    Item: req.body,
  };

  try {
    const putCommand = new PutCommand(params);
    await dynamoDocumentClient.send(putCommand);
    const result = await createCustomer(req.body.userId);
    req.body.customerId = result;

    return res.status(201).json({
      success: true,
      message: "Parent Data Successfully Saved",
      data: req.body,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

/**
 * @swagger
 * /parents/{id}:
 *   put:
 *     summary: Edit an existing parent by ID
 *     description: Update an existing parent's information by their ID.
 *     tags:
 *       - Parents
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Parent's ID
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               parentName:
 *                 type: string
 *               address:
 *                 type: string
 *               city:
 *                 type: string
 *               country:
 *                 type: string
 *               personName:
 *                 type: string
 *               phoneNumber:
 *                 type: string
 *             required:
 *               - parentName
 *               - address
 *               - city
 *               - country
 *     responses:
 *       200:
 *         description: Successful response with message
 *       500:
 *         description: Internal server error
 */
const editParent = async (req, res) => {
  try {
    // Validate user
    if (await checkUserId(req.header("UserId"))) {
      return res.status(400).json({ success: false, error: "Invalid User Id" });
    }

    // Validate request body
    const { error } = createParentSchema.validate(req.body, { allowUnknown: false });
    if (error) {
      return res.status(400).json({ success: false, error: `${error}` });
    }

    if (await checkParent(req.header("UserId"))) {
      return res.status(400).json({ success: false, error: "You are not a parent user" });
    }

    if (Object.keys(req.body).length === 0) {
      return res.status(400).json({ success: false, error: "No Data to Edit" });
    }

    // Update parent in repository
    await updateParent(req.header("UserId"), req.body);

    return res.status(200).json({ 
      success: true, 
      message: "Parent Data Successfully Updated" 
    });
  } catch (error) {
    console.error("Error in editParent:", error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || "Internal server error" 
    });
  }
};

/**
 * @swagger
 * /parents/{id}:
 *   delete:
 *     summary: Delete a parent by ID
 *     description: Delete a parent's information by their ID.
 *     tags:
 *       - Parents
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Parent's ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successful response with message
 *       500:
 *         description: Internal server error
 */
const deleteParentById = async (req, res) => {
  if (await checkUserId(req.header("UserId")))
    return res.status(400).json({ success: false, error: `Invalid User Id` });

  if (await checkParent(req.header("UserId")))
    return res
      .status(400)
      .json({ success: false, error: `You are not a parent user` });

  const params = {
    TableName: "parentsTable",
    Key: {
      id: req.params.id,
    },
  };
  try {
    const deleteCommand = new DeleteCommand(params);
    await dynamoDocumentClient.send(deleteCommand);
    return res
      .status(200)
      .json({ success: true, message: "Parent Data Successfully Deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const addParentLocation = async (req, res) => {
  try {
    const userId = req.header("UserId");

    // Validate user
    if (await checkUserId(userId)) {
      return res.status(400).json({ success: false, error: "Invalid User Id" });
    }
    const parentData = await isParent(userId)
    if (!parentData) {
      return res.status(400).json({ success: false, error: "You are not a parent user" });
    }

    // Get parent and update location
    const parent = await getParentByUserId(userId);
    if (!parent) {
      return res.status(400).json({ success: false, error: "Parent not found" });
    }

    await updateParentLocation(parent.id, req.body.location);

    return res.status(201).json({
      success: true,
      message: "Successfully Added Parent Location"
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

const addParentImage = async (req, res) => {
  try {
    // Validate user and permissions
    if (await checkUserId(req.header("UserId"))) {
      return res.status(400).json({ success: false, error: `Invalid User Id` });
    }

    if (await checkParent(req.header("UserId"))) {
      return res.status(400).json({ success: false, error: `You are not a parent user` });
    }

    if (!req.body.imageBase64) {
      return res.status(400).json({ success: false, error: "ImageBase64 is required" });
    }

    // Get parent data
    const params = {
      TableName: "parentsTable",
      FilterExpression: "#userId = :userId",
      ExpressionAttributeNames: {
        "#userId": "userId",
      },
      ExpressionAttributeValues: {
        ":userId": req.header("UserId"),
      },
    };

    const getCommand = new ScanCommand(params);
    const user = await dynamoDocumentClient.send(getCommand);

    if (user.Items.length === 0) {
      return res.status(400).json({ success: false, error: "Parent id doesn't exist" });
    }

    // Configure AWS S3
    const s3 = new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID_DRIVERS,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY_DRIVERS,
      region: process.env.REGION_DRIVERS
    });

    // Delete old image if it exists
    if (user.Items[0].imageUrl) {
      try {
        const urlParts = user.Items[0].imageUrl.split('/');
        const bucketName = urlParts[2].split('.')[0];
        const key = urlParts.slice(3).join('/');

        if (bucketName && key) {
          await s3.deleteObject({
            Bucket: bucketName,
            Key: key
          }).promise();
        }
      } catch (deleteError) {
        console.error("Error deleting old image:", deleteError);
        // Continue with upload even if delete fails
      }
    }

    // Upload new image
    const result = await s3Data(req.body.imageBase64);
    await s3.upload(result.s3Params).promise();

    // Update parent record with new image URL
    const updateParams = {
      TableName: "parentsTable",
      Key: {
        id: user.Items[0].id,
      },
      UpdateExpression: "set imageUrl=:imageUrl",
      ExpressionAttributeValues: {
        ":imageUrl": process.env.imageURL + `/${result.imageKey}`,
      },
      ReturnValues: "UPDATED_NEW",
    };

    const updateCommand = new UpdateCommand(updateParams);
    await dynamoDocumentClient.send(updateCommand);

    return res.status(200).json({
      success: true,
      message: "Parent Image Successfully Added",
    });
  } catch (error) {
    console.error("S3 operation error:", error);
    return res.status(500).json({ 
      success: false, 
      error: "Failed to process image: " + error.message 
    });
  }
};

const getStudentsByParentUserId = async (res, req) => {
  if (await checkUserId(req.header("UserId")))
    return res.status(400).json({ success: false, error: `Invalid User Id` });

  try {
    const params = {
      TableName: "studentsTable",
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
        .json({ success: false, error: "Parent id doesn't exists" });

    return res.status(200).json({ success: true, data: user.Items });
  } catch (error) {
    return res.status(400).json({ success: false, error: `${error}` });
  }
};

const getParentDetailStudents = async (req, res) => {
  if (await checkUserId(req.header("UserId")))
    return res.status(400).json({ success: false, error: `Invalid User Id` });

  try {
    const params = {
      TableName: "studentsTable",
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
        .json({ success: false, error: "Parent id doesn't exists" });

    const parentsParams = {
      TableName: "parentsTable",
      FilterExpression: "#userId = :userId",
      ExpressionAttributeNames: {
        "#userId": "userId",
      },
      ExpressionAttributeValues: {
        ":userId": req.header("UserId"),
      },
    };
    const scanCommand = new ScanCommand(parentsParams);
    const userData = await dynamoDocumentClient.send(scanCommand);

    if (userData.Items.length === 0)
      return res
        .status(400)
        .json({ success: false, error: "Parent id doesn't exists" });

    return res
      .status(200)
      .json({ success: true, parent: userData.Items, students: user.Items });
  } catch (error) {
    return res.status(400).json({ success: false, error: `${error}` });
  }
};

const getAllConfirmedParentsDriver = async (req, res) => {
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
    const command = new ScanCommand(scanParams);
    const userData = await dynamoDocumentClient.send(command);

    if (userData.Items.length === 0)
      return res.status(200).json({ success: true, data: [] });

    const bookingParams = {
      TableName: "bookingsTable",
      FilterExpression: "#driverId = :driverId",
      ExpressionAttributeNames: {
        "#driverId": "driverId",
      },
      ExpressionAttributeValues: {
        ":driverId": userData.Items[0].id,
      },
    };

    const scanCommand = new ScanCommand(bookingParams);
    const result = await dynamoDocumentClient.send(scanCommand);

    if (result.Items.length === 0)
      return res.status(200).json({ success: true, data: [] });

    let parentUserIdScheduleIdSet = new Set();
    let parentUserIdScheduleId = [];

    for (const item of result.Items) {
      const key = `${item.userId}-${item.scheduleId}`;
      if (!parentUserIdScheduleIdSet.has(key)) {
        parentUserIdScheduleId.push({
          parentUserId: item.userId,
          scheduleId: item.scheduleId,
        });
        parentUserIdScheduleIdSet.add(key);
      }
    }

    let arrayResult = [];
    let itemToAdd = {};
    let params = "";
    for (const item of parentUserIdScheduleId) {
      itemToAdd = {};
      console.log(item);
      params = {
        TableName: "parentsTable",
        FilterExpression: "#userId = :userId",
        ExpressionAttributeNames: {
          "#userId": "userId",
        },
        ExpressionAttributeValues: {
          ":userId": item.parentUserId,
        },
      };

      const scanCommand = new ScanCommand(params);
      const resultData = await dynamoDocumentClient.send(scanCommand);

      itemToAdd.parentName = resultData.Items[0]?.parentName ?? null;
      itemToAdd.parentId = resultData.Items[0]?.id ?? null;
      itemToAdd.parentUserId = resultData.Items[0]?.userId ?? null;
      itemToAdd.imageUrl = resultData.Items[0]?.imageUrl ?? null;

      params = {
        TableName: "schedulesTable",
        Key: {
          id: item.scheduleId,
        },
      };

      const getCommand = new GetCommand(params);
      const scheduleData = await dynamoDocumentClient.send(getCommand);

      itemToAdd.totalStudents = scheduleData.Item?.students.length ?? 0;
      itemToAdd.scheduleId = scheduleData.Item?.id ?? null;
      params = {
        TableName: "signupTable",
        Key: {
          id: resultData.Items[0].userId,
        },
      };

      const command = new GetCommand(params);
      const userResult = await dynamoDocumentClient.send(command);

      itemToAdd.email = userResult.Item?.email ?? null;
      itemToAdd.phoneNumber = userResult.Item?.phoneNumber ?? null;

      arrayResult.push(itemToAdd);
    }

    return res.status(200).json({ success: true, data: arrayResult });
  } catch (error) {
    return res.status(400).json({ success: false, error: `${error}` });
  }
};

const getConfirmedParentStudentDriver = async (req, res) => {
  if (
    req.query.parentUserId === undefined ||
    req.query.scheduleId === undefined
  )
    return res.status(400).json({
      success: false,
      error: "Parent User ID and  ScheduleId are required",
    });

  try {
    //fe need to pass userId and schedule id

    let params = "";
    let arrayResult = [];
    let itemToAdd = {};
    params = {
      TableName: "parentsTable",
      FilterExpression: "#userId = :userId",
      ExpressionAttributeNames: {
        "#userId": "userId",
      },
      ExpressionAttributeValues: {
        ":userId": req.query.parentUserId,
      },
    };

    const scanCommand = new ScanCommand(params);
    const result = await dynamoDocumentClient.send(scanCommand);

    if (result.Items.length === 0)
      return res
        .status(400)
        .json({ success: false, error: "Parent User Id doesn't exist" });

    itemToAdd.parentName = result.Items[0]?.parentName ?? null;
    itemToAdd.parentId = result.Items[0]?.id ?? null;
    itemToAdd.parentUserId = result.Items[0]?.userId ?? null;
    itemToAdd.emergencyPersonName =
      result.Items[0]?.emergencyPersonName ?? null;
    itemToAdd.address = result.Items[0]?.address ?? null;
    itemToAdd.country = result.Items[0]?.country ?? null;
    itemToAdd.imageUrl = result.Items[0]?.imageUrl ?? null;

    params = {
      TableName: "signupTable",
      Key: {
        id: req.query.parentUserId,
      },
    };

    const parentCommand = new GetCommand(params);
    const parentData = await dynamoDocumentClient.send(parentCommand);

    itemToAdd.phoneNumber = parentData.Item?.phoneNumber ?? null;
    itemToAdd.email = parentData.Item?.email ?? null;

    params = {
      TableName: "schedulesTable",
      Key: {
        id: req.query.scheduleId,
      },
    };

    const getCommand = new GetCommand(params);
    const user = await dynamoDocumentClient.send(getCommand);

    if (user.Item === undefined)
      return res
        .status(400)
        .json({ success: false, error: "Schedule Id doesn't exist" });

    itemToAdd.totalStudents = user.Item?.students.length ?? 0;
    itemToAdd.scheduleId = user.Item?.id ?? null;
    itemToAdd.students = user.Item?.students ?? user.Item.student ?? null;
    arrayResult.push(itemToAdd);

    for (const parent of arrayResult) {
      for (const student of parent.students) {
        //console.log(student.studentId);
        const studentParams = {
          TableName: "studentsTable",
          Key: {
            id: student.studentId,
          },
        };

        const studentCommand = new GetCommand(studentParams);
        const studentResult = await dynamoDocumentClient.send(studentCommand);

        if (studentResult.Item !== undefined) {
          student.imageUrl = studentResult.Item.imageUrl;
          student.studentName = studentResult.Item.studentName;
          student.schoolName = studentResult.Item.schoolName;
          student.age = studentResult.Item.age;
          student.grade = studentResult.Item.grade;
        }
      }
    }
    //ride cost code
    if (arrayResult.students !== undefined) {
      for (const student of arrayResult.students) {
        if (student.cost === undefined) student.cost = 0;
      }
    }
    return res.status(200).json({ success: true, data: arrayResult });
  } catch (error) {
    return res.status(400).json({ success: false, error: `${error}` });
  }
};

const getLatestDriver = async (req, res) => {
  try {
    const params = {
      TableName: "parentsTable",
      FilterExpression: "#userId = :userId",
      ExpressionAttributeNames: {
        "#userId": "userId",
      },
      ExpressionAttributeValues: {
        ":userId": req.header("UserId"),
      },
    };

    const scanCommand = new ScanCommand(params);
    const result = await dynamoDocumentClient.send(scanCommand);
    console.log(result);
    if (result.Items.length === 0)
      return res
        .status(400)
        .json({ success: false, error: "Parent User ID doesn't exist" });

    if (
      result.Items[0].driverId === undefined ||
      result.Items[0].driverId === ""
    )
      return res.status(200).json({ success: true, data: {} });
    const driverParams = {
      TableName: "driversTable",
      Key: {
        id: result.Items[0].driverId,
      },
    };

    const command = new GetCommand(driverParams);
    const resultData = await dynamoDocumentClient.send(command);

    if (resultData.Item === undefined)
      return res
        .status(400)
        .json({ success: false, error: "Driver  User ID doesn't exist" });

    resultData.Item.driverId = result.Items[0].driverId;
    //get the booking details - use driverId and userId (parentUserId)
    const bookingParams = {
      TableName: "bookingsTable",
      FilterExpression: "#driverId = :driverId and #userId = :userId",
      ExpressionAttributeNames: {
        "#driverId": "driverId",
        "#userId": "userId",
      },
      ExpressionAttributeValues: {
        ":driverId": resultData.Item.id,
        ":userId": result.Items[0].userId,
      },
    };
    const bookingCommand = new ScanCommand(bookingParams);
    const scanResult = await dynamoDocumentClient.send(bookingCommand);
    
    // Sort bookings by dateCreated in descending order
    if (scanResult.Items.length > 0) {
      scanResult.Items.sort((a, b) => new Date(b.dateCreated) - new Date(a.dateCreated));
    }
    
    if (scanResult.Items.length !== 0) {
      const scheduleParams = {
        TableName: "schedulesTable",
        Key: {
          id: scanResult.Items[0].scheduleId,
        },
      };

      const scheduleCommand = new GetCommand(scheduleParams);
      const scheduleResult = await dynamoDocumentClient.send(scheduleCommand);
      console.log("Schedule",scheduleResult.Item);
      if (scheduleResult.Item !== undefined) {
        for (const item of scheduleResult.Item.students) {
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
          }
        }
        scheduleResult.Item.students.forEach((student) => {
          delete student.pickUpLocation;
          delete student.dropOffLocation;
          delete student.days;
          delete student.isRecurrence;
        });
        resultData.Item.totalStudents = scheduleResult.Item.students.length;
        resultData.Item.students = scheduleResult.Item.students;
      }
    }

    // Add a check for reviews array before iteration
    if (resultData.Item.reviews && Array.isArray(resultData.Item.reviews)) {
      for (const item of resultData.Item.reviews) {
        const params = {
          TableName: "parentsTable",
          FilterExpression: "#userId = :userId",
          ExpressionAttributeNames: {
            "#userId": "userId",
          },
          ExpressionAttributeValues: {
            ":userId": item.userId,
          },
        };

        const scanCommand = new ScanCommand(params);
        const result = await dynamoDocumentClient.send(scanCommand);

        if (result.Items.length !== 0) {
          item.parentName = result.Items[0].parentName ?? "";
          item.imageUrl = result.Items[0].imageUrl ?? "";
        }
      }
    } else {
      // Initialize reviews as empty array if it doesn't exist
      resultData.Item.reviews = [];
    }

    const paramsSignup = {
      TableName: "signupTable",
      Key: {
        id: resultData.Item.userId,
      },
    };

    const commandSignup = new GetCommand(paramsSignup);
    const resultDataSignup = await dynamoDocumentClient.send(commandSignup);

    resultData.Item.phoneNumber = resultDataSignup.Item.phoneNumber ?? "";
      

    return res.status(200).json({ success: true, data: resultData.Item });
  } catch (error) {
    return res.status(400).json({ success: false, error: `${error}` });
  }
};

module.exports = {
  getParentById,
  getLatestDriver,
  getParentByName,
  getStudentsByParentUserId,
  getParentDetailStudents,
  addParent,
  editParent,
  deleteParentById,
  addParentLocation,
  addParentImage,
  getAllConfirmedParentsDriver,
  getConfirmedParentStudentDriver,
};
