const { dynamoClient } = require("../config/aws");
const {
  GetCommand,
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
  DeleteCommand,
  UpdateCommand,
  BatchGetCommand,
} = require("@aws-sdk/lib-dynamodb");

const AWS = require("aws-sdk");
require("dotenv").config();

const { v4: uuidv4 } = require("uuid");

const { checkUserId, checkParent } = require("./utils/userIdChecking");
const s3Data = require("./utils/s3");

const addStudentSchema = require("./validation/students.validation");
const dynamoDocumentClient = DynamoDBDocumentClient.from(dynamoClient);
const { sendVerificationEmail } = require("../mailer");
/**
 * @swagger
 * /students/name/{studentName}:
 *   get:
 *     summary: Retrieve a student by name
 *     description: Provides details of a student based on their name.
 *     tags:
 *       - Students
 *     parameters:
 *       - in: header
 *         name: UserId
 *         required: true
 *         schema:
 *           type: string
 *         description: User Id to validate the request
 *       - in: path
 *         name: studentName
 *         required: true
 *         schema:
 *           type: string
 *         description: The name of the student to retrieve
 *     responses:
 *       200:
 *         description: Successfully retrieved student data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Student'
 *       400:
 *         description: Invalid User Id
 *       500:
 *         description: Internal server error
 */
const getStudentByName = async (req, res) => {
  if (await checkUserId(req.header("UserId")))
    return res.status(400).json({ success: false, message: `Invalid User Id` });

  let studentName = req.params.studentName;
  if (!studentName) {
    return res
      .status(400)
      .json({ success: false, error: "Missing studentName parameter" });
  }

  //contains(#city, :value)
  const studentParams = {
    TableName: "studentsTable",
    FilterExpression: "contains(#sn = :studentNameVal) and userId = :userId",
    ExpressionAttributeNames: {
      "#sn": "studentName",
      "#userId": "userId",
    },
    ExpressionAttributeValues: {
      ":studentNameVal": studentName.slice(12).trim(),
      ":userId": req.header("UserId"),
    },
  };

  try {
    const command = new ScanCommand(studentParams);
    const userData = await dynamoDocumentClient.send(command);
    if (userData.Items.length != 0)
      return res.status(200).json({ success: true, data: userData.Items });
    return res.status(200).json({ status: true, data: [] });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

/**
 * @swagger
 * /students/id/{id}:
 *   get:
 *     summary: Retrieve a student by ID
 *     description: Provides details of a student based on their unique ID.
 *     tags:
 *       - Students
 *     parameters:
 *       - in: header
 *         name: UserId
 *         required: true
 *         schema:
 *           type: string
 *         description: User Id to validate the request
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique ID of the student to retrieve
 *     responses:
 *       200:
 *         description: Successfully retrieved student data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Student'
 *       400:
 *         description: Invalid User Id
 *       500:
 *         description: Internal server error
 */
const getStudentById = async (req, res) => {
  if (await checkUserId(req.header("UserId")))
    return res.status(400).json({ success: false, message: `Invalid User Id` });

  try {
    const params = {
      TableName: "studentsTable",
      Key: {
        id: req.params.id,
      },
    };

    const getCommand = new GetCommand(params);
    const user = await dynamoDocumentClient.send(getCommand);
    //console.log(user);
    if (user.Item === undefined)
      return res
        .status(400)
        .json({ success: false, error: "student id doesn't exists" });
    return res.status(200).json({ success: true, data: user.Item });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

/**
 * @swagger
 * /students:
 *   post:
 *     summary: Save a new student
 *     description: Stores a new student record in the database.
 *     tags:
 *       - Students
 *     parameters:
 *       - in: header
 *         name: UserId
 *         required: true
 *         schema:
 *           type: string
 *         description: User Id to validate the request
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               imageBase64:
 *                 type: string
 *                 description: Base64 encoded image string
 *     responses:
 *       200:
 *         description: Student saved successfully
 *       400:
 *         description: Invalid User Id or Bad Request
 *       500:
 *         description: Internal server error
 */
const saveStudent = async (req, res) => {
  const { error, value } = addStudentSchema.validate(req.body, {
    allowUnknown: false,
  });

  if (error) return res.status(400).json({ success: false, error: `${error}` });

  AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID_DRIVERS,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY_DRIVERS,
    region: process.env.REGION_DRIVERS, // replace with your S3 bucket's region
  });

  try {
    let result = {};
    if (req.body.imageBase64 !== undefined) {
      const s3 = new AWS.S3();
      result = await s3Data(req.body.imageBase64);
      await s3.upload(result.s3Params).promise();
    }

    //console.log(result.s3Params, result.imageKey);
    req.body.imageUrl = process.env.imageURL + `/${result.imageKey}`;
    req.body.id = uuidv4();
    req.body.userId = req.header("UserId");
    req.body.drivers = [];
    req.body.imageBase64 = "";
    let today = new Date();
    req.body.dateCreated = today.toDateString();
    req.body.isInvited = false;
    //console.log(req.body.imageUrl);
    // Save the student record to DynamoDB
    const saveParams = {
      TableName: "studentsTable",
      Item: req.body,
    };

    const putCommand = new PutCommand(saveParams);
    await dynamoDocumentClient.send(putCommand);

    return res.status(201).json({
      success: true,
      message: "Student saved successfully",
      data: req.body,
    });
  } catch (error) {
    return res.status(400).json({ success: false, error: `${error}` });
  }
};

/**
 * @swagger
 * /students/{studentId}:
 *   put:
 *     summary: Update an existing student
 *     description: Updates the details of an existing student record.
 *     tags:
 *       - Students
 *     parameters:
 *       - in: header
 *         name: UserId
 *         required: true
 *         schema:
 *           type: string
 *         description: User Id to validate the request
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique ID of the student to update
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
 *               imageBase64:
 *                 type: string
 *                 description: Base64 encoded image string
 *               grade:
 *                 type: string
 *               address:
 *                 type: string
 *               city:
 *                 type: string
 *               country:
 *                 type: string
 *               schoolName:
 *                 type: string
 *               disability:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Student Data Successfully Updated
 *       400:
 *         description: Invalid User Id or Bad Request
 *       500:
 *         description: Internal server error
 */
const updateStudent = async (req, res) => {
  if (Object.keys(req.body).length === 0)
    return res.status(400).json({ success: false, error: "No Data to Edit" });

  AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID_DRIVERS,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY_DRIVERS,
    region: process.env.REGION_DRIVERS, // replace with your S3 bucket's region
  });

  const params = {
    TableName: "studentsTable",
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
        .json({ success: false, error: "Student Id doesn't exists" });

    let result = "";
    if (req.body.imageBase64 !== undefined && req.body.imageBase64 !== "") {
      const s3 = new AWS.S3();
      result = await s3Data(req.body.imageBase64);
      
      if (result.s3Params) {
        await s3.upload(result.s3Params).promise();
      }
    }

    let updateExpressionParts = [];
    const expressionAttributeValues = {};

    const fieldsToUpdate = {
      age: ":age",
      city: ":city",
      country: ":country",
      address: ":address",
      studentDescription: ":studentDescription",
      studentDisability: ":studentDisability",
      grade: ":grade",
      schoolName: ":schoolName",
      studentName: ":studentName",
      shareRide: ":shareRide",
      dateCreated: ":dateCreated",
      motherName: ":motherName",
      birthDate: ":birthDate",
      isInvited: ":isInvited",
      fatherEmailAddress: ":fatherEmailAddress",
      studentEmail: ":studentEmail",
      disabilityCondition: ":disabilityCondition",
      fatherPhoneNumber: ":fatherPhoneNumber",
      fatherName: ":fatherName",
      motherEmailAddress: ":motherEmailAddress",
      otherAssistance: ":otherAssistance",
      studentPhoneNumber: ":studentPhoneNumber",
      motherPhoneNumber: ":motherPhoneNumber",
      paymentMethod: ":paymentMethod",
      disabilityNoteForNeeds: ":disabilityNoteForNeeds",
    };

    Object.keys(fieldsToUpdate).forEach((field) => {
      if (req.body[field] !== undefined) {
        updateExpressionParts.push(`${field}=${fieldsToUpdate[field]}`);
        expressionAttributeValues[fieldsToUpdate[field]] = req.body[field];
      }
    });

    // Add imageUrl to update expression if new image is provided
    if (req.body.imageBase64 !== undefined && result.imageKey !== undefined) {
      updateExpressionParts.push("imageUrl = :imageUrl");
      expressionAttributeValues[":imageUrl"] = process.env.imageURL + `/${result.imageKey}`;
    }

    // Join the parts of the update expression with ', '
    const updateExpression = updateExpressionParts.length > 0
      ? "set " + updateExpressionParts.join(", ")
      : "";

    const updateParams = {
      TableName: "studentsTable",
      Key: {
        id: req.params.id,
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "UPDATED_NEW",
    };
    console.log(updateParams);
    const updateCommand = new UpdateCommand(updateParams);
    await dynamoDocumentClient.send(updateCommand);
    //console.log(updatedUser);
    return res.status(200).json({
      success: true,
      message: "Student Data Successfully Updated",
      data: updateParams.ExpressionAttributeValues,
    });
  } catch (error) {
    return res.status(400).json({ success: false, error: `${error}` });
  }
};

/**
 * @swagger
 * /students/{id}:
 *   delete:
 *     summary: Delete a student by ID
 *     description: Deletes a student record from the database based on their ID.
 *     tags:
 *       - Students
 *     parameters:
 *       - in: header
 *         name: UserId
 *         required: true
 *         schema:
 *           type: string
 *         description: User Id to validate the request
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique ID of the student to delete
 *     responses:
 *       200:
 *         description: Student Data Successfully Deleted
 *       400:
 *         description: Invalid User Id
 *       500:
 *         description: Internal server error
 */
const deleteStudentById = async (req, res) => {
  const params = {
    TableName: "studentsTable",
    Key: {
      id: req.params.id,
    },
  };
  try {
    const deleteCommand = new DeleteCommand(params);
    const data = await dynamoDocumentClient.send(deleteCommand);
    console.log(data);
    return res
      .status(200)
      .json({ success: true, message: "Student Data Successfully Deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const getAllStudents = async (req, res) => {
  let params = "";
  if (req.query.id !== undefined) {
    params = {
      TableName: "studentsTable",
      FilterExpression: "#userId = :userId",
      ExpressionAttributeNames: {
        "#userId": "userId",
      },
      ExpressionAttributeValues: {
        ":userId": req.query.id,
      },
    };
  } else {
    params = {
      TableName: "studentsTable",
      FilterExpression: "#userId = :userId",
      ExpressionAttributeNames: {
        "#userId": "userId",
      },
      ExpressionAttributeValues: {
        ":userId": req.header("UserId"),
      },
    };
  }

  try {
    const scanCommand = new ScanCommand(params);
    const data = await dynamoDocumentClient.send(scanCommand);
    //console.log(data);
    if (data.Items === undefined)
      return res.status(200).json({ success: true, data: [] });
    return res.status(200).json({
      success: true,
      message: "Students Data Successfully Retrieved",
      data: data.Items,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const getConfirmedStudentsDriver = async (req, res) => {
  try {
    if (req.header("UserId") === "" || req.header("UserId") === undefined)
      return res
        .status(400)
        .json({ success: false, error: "Driver User Id is required" });

    let scanDriverUserId = "";
    let command = "";
    let userResult = "";
    let dataResult = "";
    if (req.query.driverId !== undefined) {
      scanDriverUserId = {
        TableName: "driversTable",
        Key: {
          id: req.query.driverId,
        },
      };
      command = new GetCommand(scanDriverUserId);
      userResult = await dynamoDocumentClient.send(command);

      if (userResult.Item === undefined)
        return res.status(200).json({ success: true, data: [] });

      dataResult = userResult.Item;
    } else {
      scanDriverUserId = {
        TableName: "driversTable",
        FilterExpression: "#userId = :userId",
        ExpressionAttributeNames: {
          "#userId": "userId",
        },
        ExpressionAttributeValues: {
          ":userId": req.header("UserId"),
        },
      };
      command = new ScanCommand(scanDriverUserId);
      userResult = await dynamoDocumentClient.send(command);

      if (userResult.Items.length === 0)
        return res.status(200).json({ success: true, data: [] });

      dataResult = userResult.Items[0];
    }

    const driverParams = {
      TableName: "bookingsTable",
      FilterExpression:
        "#driverId = :driverId and #bookingStatus = :bookingStatus",
      ExpressionAttributeNames: {
        "#driverId": "driverId",
        "#bookingStatus": "bookingStatus",
      },
      ExpressionAttributeValues: {
        ":driverId": dataResult.id,
        ":bookingStatus": "ACCEPTED",
      },
    };

    const scanCommand = new ScanCommand(driverParams);
    const user = await dynamoDocumentClient.send(scanCommand);

    if (user.Items.length === 0)
      return res.status(200).json({ success: true, data: [] });

    const uniqueScheduleIds = new Set();
    const uniqueKeys = [];

    // Filter out duplicate scheduleIds and create unique keys
    user.Items.forEach((item) => {
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
    const batchCommand = new BatchGetCommand(params);
    const userData = await dynamoDocumentClient.send(batchCommand);
    //console.log(user);
    if (userData.Item !== undefined)
      return res.status(200).json({ success: true, data: [] });

    //console.log(userData.Responses.schedulesTable);

    const allStudents = userData.Responses.schedulesTable.reduce(
      (acc, curr) => {
        acc.push(...curr.students);
        return acc;
      },
      []
    );

    for (const item of allStudents) {
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
    return res.status(200).json({ success: true, data: allStudents });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const sendInviteToStudents = async (req, res) => {
  try {
    //
    if (req.body && Object.keys(req.body).length > 0)
      return res
        .status(200)
        .json({ success: false, error: "Request body / payload is not empty" });

    let listOfEmail = [];
    for (let item of req.body.id) {
      const params = {
        TableName: "studentsTable",
        Key: {
          id: item,
        },
      };

      const getCommand = new GetCommand(params);
      const user = await dynamoDocumentClient.send(getCommand);

      if (user.Item !== undefined)
        listOfEmail.push({ id: user.Item.id, email: user.Item.email });
    }

    let updateParams = "";
    for (let item of listOfEmail) {
      const updateExpression = "set isInvited=:isInvited";

      //console.log(user.Item.age);
      const expressionAttributeValues = {
        ":isInvited": true,
      };
      updateParams = {
        TableName: "studentsTable",
        Key: {
          id: item.id,
        },
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: "UPDATED_NEW",
      };
      //console.log(updateParams);
      const updateCommand = new UpdateCommand(updateParams);
      await dynamoDocumentClient.send(updateCommand);

      await sendVerificationEmail(
        item.email,
        "SchoolRyde App Invitation",
        "The link that we will be providing are for PARENT APP both iOS and Andriod: ",
        "[LINK TO BE UPDATED ONCE DEPLOY FOR PRODUCTION]"
      );
    }
    return res
      .status(200)
      .json({ success: true, message: "Successfully Send Email to Email/s" });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

module.exports = {
  sendInviteToStudents,
  getAllStudents,
  getStudentById,
  getStudentByName,
  saveStudent,
  updateStudent,
  deleteStudentById,
  getConfirmedStudentsDriver,
};
