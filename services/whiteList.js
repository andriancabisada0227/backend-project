const { dynamoClient } = require("../config/aws");
const {
  GetCommand,
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
  DeleteCommand,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");

require("dotenv").config();

const { v4: uuidv4 } = require("uuid");
const dynamoDocumentClient = DynamoDBDocumentClient.from(dynamoClient);

const addWhiteList = async (req, res) => {
  try {
    //
    const params = {
      TableName: "whiteListTable",
    };

    const command = new ScanCommand(params);
    const data = await dynamoDocumentClient.send(command);

    if (data.Items.length !== 0) {
      //update

      if (req.body.country !== undefined)
        req.body.country.forEach((item) => {
          if (!data.Items[0].country.includes(item)) {
            data.Items[0].country.push(item);
          }
        });

      // Update stateLoc
      if (req.body.stateLoc !== undefined)
        req.body.stateLoc.forEach((item) => {
          if (!data.Items[0].stateLoc.includes(item)) {
            data.Items[0].stateLoc.push(item);
          }
        });

      // Update city
      if (req.body.city !== undefined)
        req.body.city.forEach((item) => {
          if (!data.Items[0].city.includes(item)) {
            data.Items[0].city.push(item);
          }
        });
      const updateExpression =
        "set country =:country, stateLoc =:stateLoc, city =:city";
      const expressionAttributeValues = {
        ":country": data.Items[0].country,
        ":stateLoc": data.Items[0].stateLoc,
        ":city": data.Items[0].city,
      };
    

      const updateParams = {
        TableName: "whiteListTable",
        Key: {
          id: data.Items[0].id,
        },
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: "UPDATED_NEW",
      };

      const updateCommand = new UpdateCommand(updateParams);
      await dynamoDocumentClient.send(updateCommand);

      return res.status(200).json({
        success: true,
        message: "Successfully Updated WhiteList Data",
      });
    } else {
      //save first data
      req.body.id = uuidv4();
      const addParams = {
        TableName: "whiteListTable",
        Item: req.body,
      };

      const putCommand = new PutCommand(addParams);
      await dynamoDocumentClient.send(putCommand);

      return res
        .status(200)
        .json({ success: true, message: "Successfully Added WhiteList Data" });
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const removeWhiteList = async (req, res) => {
  try {
    //
    const params = {
      TableName: "whiteListTable",
    };
    const command = new ScanCommand(params);
    const data = await dynamoDocumentClient.send(command);
    if (data.Items.length === 0)
      return res
        .status(400)
        .json({ success: false, error: "No Data to Delete" });

    req.body.country.forEach((item) => {
      let index = data.Items[0].country.indexOf(item);
      if (index !== -1) {
        data.Items[0].country.splice(index, 1);
      }
    });

    // Remove stateLoc
    req.body.stateLoc.forEach((item) => {
      let index = data.Items[0].stateLoc.indexOf(item);
      if (index !== -1) {
        data.Items[0].stateLoc.splice(index, 1);
      }
    });

    // Remove city
    req.body.city.forEach((item) => {
      let index = data.Items[0].city.indexOf(item);
      if (index !== -1) {
        data.Items[0].city.splice(index, 1);
      }
    });

    const updateExpression =
      "set country =: country, stateLoc =: stateLoc, city =: city";
    const expressionAttributeValues = {
      ":country": data.Items[0].country,
      ":stateLoc": data.Items[0].stateLoc,
      ":city": data.Items[0].city,
    };
    const updateParams = {
      TableName: "schoolsTable",
      Key: {
        id: data.Items[0].id,
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "UPDATED_NEW",
    };
    const updateCommand = new UpdateCommand(updateParams);
    await dynamoDocumentClient.send(updateCommand);

    return res.status(200).json({
      success: true,
      message: "Successfully Remove WhiteList Data",
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const checkWhiteList = async (req, res) => {
  try {
    const params = {
      TableName: "whiteListTable",
    };

    const command = new ScanCommand(params);
    const data = await dynamoDocumentClient.send(command);

    if (data.Items.length === 0)
      return res
        .status(400)
        .json({ success: false, error: "Please add WhiteList Data" });
    //
    let result = false;

    if (req.query.country !== undefined)
      if (!data.Items[0].country.includes(req.query.country)) {
        result = true;
      }

    // Update stateLoc
    if (req.query.stateLoc !== undefined)
      if (!data.Items[0].stateLoc.includes(req.query.stateLoc)) {
        result = true;
      }

    // Update city
    if (req.query.city !== undefined)
      if (!data.Items[0].city.includes(req.query.city)) {
        result = true;
      }

    if (result)
      return res
        .status(400)
        .json({ success: false, error: "Location is not in the WhiteList" });

    return res
      .status(200)
      .json({ success: true, message: "Location is in the WhiteList" });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

module.exports = {
  addWhiteList,
  removeWhiteList,
  checkWhiteList,
};
