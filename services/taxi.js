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

const { checkUserId } = require("./utils/userIdChecking");
const s3Data = require("./utils/s3");
const dynamoDocumentClient = DynamoDBDocumentClient.from(dynamoClient);
const { addTaxi, editTaxi } = require("./validation/taxi.validation");

const addTaxiCode = async (req, res) => {
  const { error, value } = addTaxi.validate(req.body, {
    allowUnknown: false,
  });

  if (error) return res.status(400).json({ success: false, error: `${error}` });

  if (req.body.taxiLogo !== undefined) {
    AWS.config.update({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID_DRIVERS,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY_DRIVERS,
      region: process.env.REGION_DRIVERS, // replace with your S3 bucket's region
    });

    const s3 = new AWS.S3();
    result = await s3Data(req.body.taxiLogo);
    await s3.upload(result.s3Params).promise();
    req.body.logoUrl = process.env.imageURL + `/${result.imageKey}`;
  }
  let today = new Date();
  req.body.dateCreated = today.toDateString();
  req.body.taxiLogo = "";
  req.body.id = uuidv4();
  req.body.userId = req.header("UserId");
  req.body.taxiCode = req.body.taxiCode.toUpperCase().replace(/\s+/g, '');
  const saveParams = {
    TableName: "taxiTable",
    Item: req.body,
  };

  const putCommand = new PutCommand(saveParams);
  await dynamoDocumentClient.send(putCommand);

  return res.status(201).json({
    success: true,
    message: "Taxi Details saved successfully",
    data: req.body,
  });
};

const editTaxiCode = async (req, res) => {
  try {
    const { error, value } = editTaxi.validate(req.body, {
      allowUnknown: false,
    });

    if (error)
      return res.status(400).json({ success: false, error: `${error}` });

    const params = {
      TableName: "taxiTable",
      FilterExpression: "#taxiCode = :taxiCode",
      ExpressionAttributeNames: {
        "#taxiCode": "taxiCode",
      },
      ExpressionAttributeValues: {
        ":taxiCode": req.params.id,
      },
    };

    const scanCommand = new ScanCommand(params);
    const user = await dynamoDocumentClient.send(scanCommand);

    if (user.Items.length === 0)
      return res
        .status(400)
        .json({ success: false, error: "Taxi Code doesn't exists" });

    let result = {};
    if (req.body.taxiLogo !== undefined) {
      AWS.config.update({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID_DRIVERS,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY_DRIVERS,
        region: process.env.REGION_DRIVERS, // replace with your S3 bucket's region
      });

      const s3 = new AWS.S3();
      result = await s3Data(req.body.taxiLogo);
      await s3.upload(result.s3Params).promise();
      req.body.logoUrl = process.env.imageURL + `/${result.imageKey}`;
    }

    const updateExpression =
      "set taxiCompanyName=:taxiCompanyName, taxiCity=:taxiCity, taxiState=:taxiState, bgColor=:bgColor, textColor=:textColor, primaryColor=:primaryColor, secondaryColor=:secondaryColor, logoUrl=:logoUrl, taxiName=:taxiName";
    const expressionAttributeValues = {
      ":taxiCompanyName": req.body.taxiCompanyName ?? user.Items[0].taxiCompanyName,
      ":taxiCity": req.body.taxiCity ?? user.Items[0].taxiCity,
      ":taxiState": req.body.taxiState ?? user.Items[0].taxiState,
      ":bgColor": req.body.bgColor ?? user.Items[0].bgColor,
      ":textColor": req.body.textColor ?? user.Items[0].textColor,
      ":primaryColor": req.body.primaryColor ?? user.Items[0].primaryColor,
      ":secondaryColor": req.body.secondaryColor ?? user.Items[0].secondaryColor,
      ":logoUrl": req.body.logoUrl ?? user.Items[0].logoUrl,
      ":taxiName": req.body.taxiName ?? user.Items[0].taxiName,
    };

    const updateParams = {
      TableName: "taxiTable",
      Key: {
        id: user.Items[0].id,
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "UPDATED_NEW",
    };

    const updateCommand = new UpdateCommand(updateParams);
    await dynamoDocumentClient.send(updateCommand);

    return res.status(200).json({
      success: true,
      message: "Taxi Data Successfully Updated",
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const deleteTaxiCode = async (req, res) => {
  try {
    const queryParams = {
      TableName: "taxiTable",
      FilterExpression: "#taxiCode = :taxiCode",
      ExpressionAttributeNames: {
        "#taxiCode": "taxiCode",
      },
      ExpressionAttributeValues: {
        ":taxiCode": req.params.id,
      },
    };

    const scanCommand = new ScanCommand(queryParams);
    const user = await dynamoDocumentClient.send(scanCommand);

    if (user.Items.length === 0)
      return res.status(400).json({ success: false, error: `${error}` });

    const params = {
      TableName: "taxiTable",
      Key: {
        id: user.Items[0].id,
      },
    };

    const deleteCommand = new DeleteCommand(params);
    const data = await dynamoDocumentClient.send(deleteCommand);
    console.log(data);
    return res
      .status(200)
      .json({ success: true, message: "Taxi Data Successfully Deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const getTaxiCode = async (req, res) => {
  try {
    console.log(req.params.id);
    if (req.params.id === ":id") {
      const params = {
        TableName: "taxiTable",
      };

      const scanCommand = new ScanCommand(params);
      const data = await dynamoDocumentClient.send(scanCommand);

      if (data.Items.length === 0)
        return res.status(200).json({ success: true, data: [] });
      return res.status(200).json({ success: true, data: data.Items });
    }
    const params = {
      TableName: "taxiTable",
      FilterExpression: "#taxiCode = :taxiCode",
      ExpressionAttributeNames: {
        "#taxiCode": "taxiCode",
      },
      ExpressionAttributeValues: {
        ":taxiCode": req.params.id,
      },
    };

    const scanCommand = new ScanCommand(params);
    const data = await dynamoDocumentClient.send(scanCommand);

    if (data.Items.length === 0)
      return res
        .status(400)
        .json({ success: false, error: "Taxi Code doesn't exists" });
    return res.status(200).json({ success: true, data: data.Items[0] });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const getAllTaxi = async (req, res) => {
  try {
    let queryParams = {
      TableName: "taxiTable",
      FilterExpression: "",
      ExpressionAttributeNames: {},
      ExpressionAttributeValues: {},
    };
    let filterExpressions = [];
    const taxiCompanyName = req.query.taxiCompanyName;
    const taxiCode = req.query.taxiCode;
    const taxiCity = req.query.taxiCity;
    const bgColor = req.query.bgColor;
    const textColor = req.query.textColor;
    const primaryColor = req.query.primaryColor;
    const secondaryColor = req.query.secondaryColor;
    const taxiName = req.query.taxiName;

    if (taxiCompanyName) {
      filterExpressions.push("#taxiCompanyName = :taxiCompanyName");
      queryParams.ExpressionAttributeValues[":taxiCompanyName"] =
        taxiCompanyName;
      queryParams.ExpressionAttributeNames["#taxiCompanyName"] =
        "taxiCompanyName";
    }

    if (taxiCode) {
      filterExpressions.push("#taxiCode = :taxiCode");
      queryParams.ExpressionAttributeValues[":taxiCode"] = taxiCode;
      queryParams.ExpressionAttributeNames["#taxiCode"] = "taxiCode";
    }

    if (taxiCity) {
      filterExpressions.push("#taxiCity = :taxiCity");
      queryParams.ExpressionAttributeValues[":taxiCity"] = taxiCity;
      queryParams.ExpressionAttributeNames["#taxiCity"] = "taxiCity";
    }

    if (bgColor) {
      filterExpressions.push("#bgColor = :bgColor");
      queryParams.ExpressionAttributeValues[":bgColor"] = bgColor;
      queryParams.ExpressionAttributeNames["#bgColor"] = "bgColor";
    }

    if (textColor) {
      filterExpressions.push("#textColor = :textColor");
      queryParams.ExpressionAttributeValues[":textColor"] = textColor;
      queryParams.ExpressionAttributeNames["#textColor"] = "textColor";
    }

    if (primaryColor) {
      filterExpressions.push("#primaryColor = :primaryColor");
      queryParams.ExpressionAttributeValues[":primaryColor"] = primaryColor;
      queryParams.ExpressionAttributeNames["#primaryColor"] = "primaryColor";
    }

    if (secondaryColor) {
      filterExpressions.push("#secondaryColor = :secondaryColor");
      queryParams.ExpressionAttributeValues[":secondaryColor"] = secondaryColor;
      queryParams.ExpressionAttributeNames["#secondaryColor"] =
        "secondaryColor";
    }

    if (taxiName) {
      filterExpressions.push("#taxiName = :taxiName");
      queryParams.ExpressionAttributeValues[":taxiName"] = taxiName;
      queryParams.ExpressionAttributeNames["#taxiName"] = "taxiName";
    }

    if (
      !taxiCompanyName &&
      !taxiCode &&
      !taxiCity &&
      !bgColor &&
      !textColor &&
      !primaryColor &&
      !secondaryColor &&
      !taxiName
    ) {
      queryParams = {
        TableName: "taxiTable",
      };
    } else queryParams.FilterExpression = filterExpressions.join(" AND ");

    const scanCommand = new ScanCommand(queryParams);
    const data = await dynamoDocumentClient.send(scanCommand);

    if (data.Items.length === 0)
      return res.status(200).json({ success: true, data: [] });

    //pagination
    const parsedPageSize = parseInt(req.query.pageSize) || 10;

    // Get the page number from the request or use a default value
    const parsedPage = parseInt(req.query.page) || 1;

    // Calculate the start and end index for the current page
    const startIndex = (parsedPage - 1) * parsedPageSize;
    const endIndex = parsedPage * parsedPageSize;

    // Get the drivers for the current page
    const taxiForPage = data.Items.slice(startIndex, endIndex);

    // Determine if there are more pages
    const hasMorePages = endIndex < data.Items.length;

    const response = {
      success: true,
      data: taxiForPage,
      pageInfo: {
        currentPage: parsedPage,
        pageSize: parsedPageSize,
        totalItems: taxiForPage.length,
        hasMorePages: hasMorePages,
        totalTaxi: data.Items.length,
      },
    };
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};


const CreateTaxiKey = async (req, res) => {
  const { taxiCode } = req.body;
  const params = {
    TableName: "taxiTable",
    FilterExpression: "#taxiCode = :taxiCode",
    ExpressionAttributeNames: {
      "#taxiCode": "taxiCode",
    },
    ExpressionAttributeValues: {
      ":taxiCode": taxiCode,
    },
  };

  const scanCommand = new ScanCommand(params);
  const taxi = await dynamoDocumentClient.send(scanCommand);
  if (taxi.Items.length === 0) {
    return res.status(400).json({ success: false, error: "Taxi Code doesn't exists" });
  }

  // Generate a more secure random key
  const taxiApiKey = require('crypto').randomBytes(32).toString('hex');
  
  // Update the taxi record with the new key
  const updateParams = {
    TableName: "taxiTable",
    Key: {
      id: taxi.Items[0].id,
    },
    UpdateExpression: "set #taxiApiKey = :taxiApiKey",
    ExpressionAttributeNames: {
      "#taxiApiKey": "taxiApiKey"
    },
    ExpressionAttributeValues: {
      ":taxiApiKey": taxiApiKey
    },
    ReturnValues: "UPDATED_NEW",
  };

  const updateCommand = new UpdateCommand(updateParams);
  await dynamoDocumentClient.send(updateCommand);

  return res.status(200).json({ 
    success: true, 
    message: "Taxi key generated successfully",
    taxiApiKey 
  });
};


module.exports = {
  addTaxiCode,
  editTaxiCode,
  deleteTaxiCode,
  getTaxiCode,
  getAllTaxi,
  CreateTaxiKey
};
