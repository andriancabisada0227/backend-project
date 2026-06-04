  const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
  const { DynamoDBDocumentClient, ScanCommand, PutCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

const { dynamoClient } = require("../../config/aws");
const { v4: uuidv4 } = require("uuid");
const dynamoDocumentClient = DynamoDBDocumentClient.from(dynamoClient);


const createWebhookEntry = async (type, body) => {
  const webhookId = uuidv4();
  const webhookData = {
    type,
    body,
    created_at: new Date().toISOString(),
    status: 'PENDING'
  };

  await dynamoDocumentClient.send(new PutCommand({
    TableName: "webhooks",
    Item: { id: webhookId, ...webhookData }
  }));

  return webhookId;
};

const updateWebhookStatus = async (webhookId, status, additionalData = {}) => {
    const updateExpression = "set #status = :status" + 
      (additionalData.error ? ", #error = :error" : "") +
      (additionalData.response ? ", #response = :response" : "");
  
    const updateCommand = new UpdateCommand({
      TableName: "webhooks",
      Key: { id: webhookId },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: {
        "#status": "status",
        ...(additionalData.error && { "#error": "error" }),
        ...(additionalData.response && { "#response": "response" })
      },
      ExpressionAttributeValues: {
        ":status": status,
        ...(additionalData.error && { ":error": additionalData.error }),
        ...(additionalData.response && { ":response": additionalData.response })
      }
    });
  
    await dynamoDocumentClient.send(updateCommand);
};

const checkWebhook = async (taxiCode) => ({
  Items: await scanTable(
    "webhooks_list",
    "taxiCode = :taxiCode",
    null,
    { ":taxiCode": taxiCode }
  )
});

// Consolidate common DynamoDB scan operations into a reusable function
const scanTable = async (tableName, filterExp, attrNames, attrValues) => {
  const params = {
    TableName: tableName,
    FilterExpression: filterExp,
    ExpressionAttributeValues: attrValues
  };
  
  // Only add ExpressionAttributeNames if they exist
  if (Object.keys(attrNames || {}).length > 0) {
    params.ExpressionAttributeNames = attrNames;
  }

  const result = await dynamoDocumentClient.send(new ScanCommand(params));
  return result.Items || [];
};


module.exports = {
    createWebhookEntry,
    updateWebhookStatus,
    checkWebhook,
    scanTable
};

