const { dynamoClient } = require("../config/aws");

const {
  PutCommand,
  GetCommand,
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
  DeleteCommand,
} = require("@aws-sdk/lib-dynamodb");

const dynamoDocumentClient = DynamoDBDocumentClient.from(dynamoClient);
const { v4: uuidv4 } = require("uuid");

const sendHelpAndSupport = async (req, res) => {
  try {
    req.body.id = uuidv4();
    req.body.userId = req.header("UserId");
    req.body.createdDate = Math.floor(new Date().getTime() / 1000);
    console.log(req.body.id);
    const saveParams = {
      TableName: "helpSupportTable",
      Item: req.body,
    };
    const putCommand = new PutCommand(saveParams);
    await dynamoDocumentClient.send(putCommand);

    return res.status(200).json({
      success: true,
      message: "Help and Support saved successfully",
      helpSupportId: req.body.id,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};
const contactUs = async (req, res) => {
  try {
    req.body.id = uuidv4();
    const saveParams = {
      TableName: "contactUsTable",
      Item: req.body,
    };

    const putCommand = new PutCommand(saveParams);
    await dynamoDocumentClient.send(putCommand);

    return res
      .status(200)
      .json({ success: true, message: "Contact Details Successfully Saved" });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const faq = async (req, res) => {
  try {
    req.body.id = uuidv4();
    const saveParams = {
      TableName: "faqTable",
      Item: req.body,
    };

    const putCommand = new PutCommand(saveParams);
    await dynamoDocumentClient.send(putCommand);

    return res
      .status(200)
      .json({ success: true, message: "FAQ Successfully Saved" });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

module.exports = { sendHelpAndSupport, contactUs, faq };
