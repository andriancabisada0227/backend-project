const { dynamoClient } = require("../config/aws");
const {
  GetCommand,
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
  DeleteCommand,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");

const axios = require("axios");
const AWS = require("aws-sdk");
const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");
const https = require("https");
const mammoth = require("mammoth");
require("dotenv").config();

const { v4: uuidv4 } = require("uuid");
const dynamoDocumentClient = DynamoDBDocumentClient.from(dynamoClient);

const s3DataPdf = (fileBase64) => {
  const buffer = Buffer.from(fileBase64, "base64");
  let fileExtension = "pdf";
  let contentType = "application/pdf";
  const fileKey = `${uuidv4()}.${fileExtension}`;

  const s3Params = {
    Bucket: process.env.s3BucketName,
    Key: fileKey,
    Body: buffer,
    ContentType: contentType,
  };
  console.log(s3Params, fileKey);
  return { s3Params, fileKey };
};

const s3DataDocx = (fileBase64) => {
  const buffer = Buffer.from(fileBase64, "base64");
  let fileExtension = "docx";
  let contentType =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const fileKey = `${uuidv4()}.${fileExtension}`;

  const s3Params = {
    Bucket: process.env.s3BucketName,
    Key: fileKey,
    Body: buffer,
    ContentType: contentType,
  };
  console.log(s3Params, fileKey);
  return { s3Params, fileKey };
};

/**
 * @swagger
 * /terms-and-conditions:
 *   post:
 *     tags:
 *      - Terms and Conditions
 *     summary: Add new Terms and Conditions
 *     description: Adds a new version of the Terms and Conditions.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fileBase64:
 *                 type: string
 *                 description: Base64 encoded terms and conditions file
 *               summary:
 *                 type: string
 *               imageURL:
 *                 type: string
 *     responses:
 *       201:
 *         description: Terms and Conditions added successfully
 *       400:
 *         description: Bad Request or Error in processing
 *       500:
 *         description: Internal server error
 */
const addTermsAndConditions = async (req, res) => {
  const latestTermsParams = {
    TableName: "termsAndConditionsTable",
  };

  try {
    const command = new ScanCommand(latestTermsParams);
    const userData = await dynamoDocumentClient.send(command);

    AWS.config.update({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID_DRIVERS,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY_DRIVERS,
      region: process.env.REGION_DRIVERS,
    });

    const s3 = new AWS.S3();
    const result = s3DataDocx(req.body.fileBase64);
    await s3.upload(result.s3Params).promise();

    let version = 1;
    if (userData.Items.length !== 0) version = userData.Items.length + 1;

    req.body.fileBase64 = "";
    req.body.versionNumber = version;
    req.body.id = uuidv4();
    req.body.contentURL = process.env.imageURL + `/${result.fileKey}`;
    const remoteUrl = req.body.contentURL;
    const localPath = path.join(__dirname, "downloaded.docx");

    await new Promise((resolve, reject) => {
      const file = fs.createWriteStream(localPath);
      https
        .get(remoteUrl, (response) => {
          response.pipe(file);
          file.on("finish", () => {
            file.close(async () => {
              try {
                const result = await mammoth.convertToHtml({ path: localPath });
                const html = result.value; // The generated HTML
                req.body.contentHTML = html;

                fs.unlink(localPath, (unlinkErr) => {
                  if (unlinkErr) {
                    console.error("Error deleting local file:", unlinkErr);
                  }
                  resolve();
                });
              } catch (error) {
                console.error("Error converting .docx to HTML:", error);
                reject(error);
              }
            });
          });
        })
        .on("error", (err) => {
          fs.unlink(localPath, () => {
            console.error("Error downloading .docx file:", err);
            reject(err);
          });
        });
    });

    // Store the new terms and conditions in DynamoDB
    const newTerms = {
      TableName: "termsAndConditionsTable",
      Item: req.body,
    };

    const putCommand = new PutCommand(newTerms);
    await dynamoDocumentClient.send(putCommand);

    return res.status(201).json({
      success: true,
      message: "Terms and Conditions added successfully!",
      version,
    });
  } catch (error) {
    return res.status(400).json({ success: false, error: `${error}` });
  }
};
/**
 * @swagger
 * /terms-and-conditions/latest:
 *   get:
 *     tags:
 *      - Terms and Conditions
 *     summary: Retrieve the latest Terms and Conditions
 *     description: Gets the most recent version of the Terms and Conditions.
 *     responses:
 *       200:
 *         description: Successfully retrieved the latest Terms and Conditions
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
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       versionNumber:
 *                         type: integer
 *                       contentURL:
 *                         type: string
 *                       summary:
 *                         type: string
 *                       imageURL:
 *                         type: string
 *       400:
 *         description: No data available or Bad Request
 */
const retrieveLatestTermsAndConditions = async (req, res) => {
  const scanTermsParams = {
    TableName: "termsAndConditionsTable",
  };

  try {
    const command = new ScanCommand(scanTermsParams);
    const userData = await dynamoDocumentClient.send(command);
    const result = userData.Items;

    if (result.length == 0)
      return res.status(400).json({
        success: true,
        data: "data still empty",
      });

    const sortedByVersion = userData.Items.sort(
      (a, b) => b.versionNumber - a.versionNumber
    );

    return res.status(200).json({
      success: true,
      data: sortedByVersion[0],
    });
  } catch (error) {
    return res.status(400).json({ success: false, error: `${error}` });
  }
};

/**
 * @swagger
 *   /terms-and-conditions/version/{versionNumber}:
 *   get:
 *     tags:
 *      -  Terms and Conditions
 *     summary: Retrieve a specific version of Terms and Conditions
 *     description: Gets a specific version of the Terms and Conditions by version number.
 *     parameters:
 *       - in: path
 *         name: versionNumber
 *         required: true
 *         schema:
 *           type: integer
 *         description: The version number of the Terms and Conditions to retrieve
 *     responses:
 *       200:
 *         description: Successfully retrieved the specified version of Terms and Conditions
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
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       versionNumber:
 *                         type: integer
 *                       contentURL:
 *                         type: string
 *                       summary:
 *                         type: string
 *                       imageURL:
 *                         type: string
 *       400:
 *         description: No data available or Bad Request
 *       500:
 *         description: Internal server error
 */
const retrieveSpecificVersionTermsAndConditions = async (req, res) => {
  const params = {
    TableName: "termsAndConditionsTable",
    FilterExpression: "#vn = :versionNumber",
    ExpressionAttributeNames: {
      "#vn": "versionNumber",
    },
    ExpressionAttributeValues: {
      ":versionNumber": Number(req.params.vn.slice(3)),
    },
  };

  try {
    const command = new ScanCommand(params);
    const userData = await dynamoDocumentClient.send(command);

    if (userData.Items == 0)
      return res.status(400).json({ success: true, data: "Data still empty" });
    return res.status(200).json({ success: true, data: userData.Items });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const listAllTermsAndConditions = async (req, res) => {
  const params = {
    TableName: "termsAndConditionsTable", // Replace with your table name
  };

  try {
    const command = new ScanCommand(params);
    const userData = await dynamoDocumentClient.send(command);
    if (userData.Items == 0)
      return res.status(400).json({ success: true, data: "Data still empty" });
    return res.status(200).json({ success: true, data: userData.Items });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

module.exports = {
  addTermsAndConditions,
  retrieveLatestTermsAndConditions,
  retrieveSpecificVersionTermsAndConditions,
  listAllTermsAndConditions,
};
