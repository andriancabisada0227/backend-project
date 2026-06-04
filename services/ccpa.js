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


const addCCPA = async (req, res) => {
  const latestTermsParams = {
    TableName: "ccpaTable",
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
      https.get(remoteUrl, (response) => {
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
      }).on("error", (err) => {
        fs.unlink(localPath, () => {
          console.error("Error downloading .docx file:", err);
          reject(err);
        });
      });
    });


    // Store the new terms and conditions in DynamoDB
    const newTerms = {
      TableName: "ccpaTable",
      Item: req.body,
    };

    const putCommand = new PutCommand(newTerms);
    await dynamoDocumentClient.send(putCommand);

    return res.status(201).json({
      success: true,
      message: "CCPA added successfully!",
      version,
    });
  } catch (error) {
    return res.status(400).json({ success: false, error: `${error}` });
  }
};

const retrieveLatestCCPA = async (req, res) => {
  const scanTermsParams = {
    TableName: "ccpaTable",
  };

  try {
    const command = new ScanCommand(scanTermsParams);
    const userData = await dynamoDocumentClient.send(command);
    const result = userData.Items;
    console.log(result.length);
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


const retrieveSpecificVersionCCPA = async (req, res) => {
  const params = {
    TableName: "ccpaTable",
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

const listAllCCPA = async (req, res) => {
  const params = {
    TableName: "ccpaTable", // Replace with your table name
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
  addCCPA,
  retrieveLatestCCPA,
  retrieveSpecificVersionCCPA,
  listAllCCPA,
};
