const { dynamoClient } = require("../config/aws");
const {
  GetCommand,
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
  DeleteCommand,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");
const bodyParser = require("body-parser");
const checkUserId = require("./utils/userIdChecking");
const AWS = require("aws-sdk");
require("dotenv").config();
const { v4: uuidv4 } = require("uuid");
const jwt = require('jsonwebtoken');

const dynamoDocumentClient = DynamoDBDocumentClient.from(dynamoClient);
const express = require("express");
const WebSocket = require("ws");
const http = require("http");
const { EventEmitter } = require('events');
const url = require("url");
const { verifyToken } = require("./token");

const app = express();

//add 10mb limit per message
app.use(bodyParser.json({ limit: "10mb" }));
app.use(verifyToken);
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const eventEmitter = new EventEmitter();
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB in bytes
let clients = {};

wss.on("connection", (ws, req) => {
  const location = new url.URL(req.url, `http://${req.headers.host}`);
  const userID = location.searchParams.get("UserId") ?? "userId";
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader != '') {
    try {
      const token = authHeader.split(' ')[1];
      jwt.verify(token, process.env.jwtSecretToken);
      console.log("token", token);
    } catch (error) {
      ws.send(JSON.stringify({ error: "Invalid token" }));
      ws.close();
      return;
    }
  }




  eventEmitter.emit("newConnection", ws, userID);

  ws.on("message", (message) => {
    eventEmitter.emit("messageReceived", ws, message, userID);
  });

  ws.on("close", () => {
    eventEmitter.emit("connectionClosed", ws, userID);
  });
});

// Add listeners for different events
eventEmitter.on("newConnection", (ws, userID) => {
  clients[userID] = ws;
  console.log("New connection established for userID:", userID);
});

eventEmitter.on("messageReceived", (ws, message, userID) => {
  let messageSize = Buffer.byteLength(message);

  if (messageSize > MAX_SIZE) {
    ws.send(JSON.stringify({ error: "Message size exceeds 5 MB limit." }));
    return;
  }

  try {
    const messageData = JSON.parse(message);

    switch (messageData.status) {
      case "send":
        saveMessageToDynamoDB(messageData);

        const receiverWs = clients[messageData.receiverUserID];
        if (receiverWs) {
          receiverWs.send(JSON.stringify(messageData));
        } else {
          console.log("Receiver not connected:", messageData.receiverUserID);
        }
        break;

      default:
        console.log("Unhandled message status:", messageData.status);
    }
  } catch (e) {
    console.error("Failed to process message:", e);
    ws.send(JSON.stringify({ error: `${e}` }));
  }
});

eventEmitter.on("connectionClosed", (ws, userID) => {
  delete clients[userID];
  console.log("Connection closed for userID:", userID);
});

const s3DataVoice = (fileBase64) => {
  const buffer = Buffer.from(fileBase64, "base64");
  let fileExtension = "mp3";
  let contentType = "audio/mpeg";
  const fileKey = `${uuidv4()}.${fileExtension}`;

  const s3Params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: fileKey,
    Body: buffer,
    ContentType: contentType,
    ACL: "public-read",
  };

  return { s3Params, fileKey };
};

async function check_ws_ClientsTable(UserId) {
  try {
    const param = {
      TableName: "wsClientsTable",
      FilterExpression:
        "#userId = :userId and #connectedStatus = :connectedStatus",
      ExpressionAttributeNames: {
        "#userId": "userId",
        "#connectedStatus": "connectedStatus",
      },
      ExpressionAttributeValues: {
        ":userId": UserId,
        ":connectedStatus": true,
      },
    };

    const scanCommand = new ScanCommand(param);
    const result = await dynamoDocumentClient.send(scanCommand);

    if (result.Items.length > 0) return true;
    return false;
  } catch (error) {
    console.log(`${error}`);
  }
}
async function falsefy_ws_ClientsTable(UserId) {
  try {
    const param = {
      TableName: "wsClientsTable",
      FilterExpression: "#userId = :userId",
      ExpressionAttributeNames: {
        "#userId": "userId",
      },
      ExpressionAttributeValues: {
        ":userId": UserId,
      },
    };
    const scanCommand = new ScanCommand(param);
    const result = await dynamoDocumentClient.send(scanCommand);

    if (result.Items.length > 0) {
      const updateParams = {
        TableName: "wsClientsTable",
        Key: {
          id: result.Items[0].id,
        },
        UpdateExpression: "SET #connectedStatus = :connectedStatus",
        ExpressionAttributeNames: {
          "#connectedStatus": "connectedStatus",
        },
        ExpressionAttributeValues: {
          ":connectedStatus": false,
        },
      };

      const updateCommand = new UpdateCommand(updateParams);
      await dynamoDocumentClient.send(updateCommand);
      console.log("successfully updated");
    }
  } catch (error) {
    console.log(`${error}`);
  }
}
async function save_ws_ClientsTable(UserId) {
  try {
    const param = {
      TableName: "wsClientsTable",
    };
    const scanCommand = new ScanCommand(param);
    const result = await dynamoDocumentClient.send(scanCommand);

    if (result.Items.length === 0) {
      let body = {};
      body.id = uuidv4();
      body.userId = UserId;
      body.connectedStatus = true;
      const saveParams = {
        TableName: "wsClientsTable",
        Item: body,
      };

      const putCommand = new PutCommand(saveParams);
      await dynamoDocumentClient.send(putCommand);
    } else {
      const param = {
        TableName: "wsClientsTable",
        FilterExpression: "#userId = :userId",
        ExpressionAttributeNames: {
          "#userId": "userId",
        },
        ExpressionAttributeValues: {
          ":userId": UserId,
        },
      };
      const scanCommand = new ScanCommand(param);
      const result = await dynamoDocumentClient.send(scanCommand);

      if (result.Items.length > 0) {
        const updateParams = {
          TableName: "wsClientsTable",
          Key: {
            id: result.Items[0].id,
          },
          UpdateExpression: "SET #connectedStatus = :connectedStatus",
          ExpressionAttributeNames: {
            "#connectedStatus": "connectedStatus",
          },
          ExpressionAttributeValues: {
            ":connectedStatus": true,
          },
        };

        const updateCommand = new UpdateCommand(updateParams);
        await dynamoDocumentClient.send(updateCommand);
      }

      req.body.id = uuidv4();
      req.body.userId = UserId;
      req.body.connectedStatus = true;
      const saveParams = {
        TableName: "wsClientsTable",
        Item: req.body,
      };

      const putCommand = new PutCommand(saveParams);
      await dynamoDocumentClient.send(putCommand);
    }
    console.log("successfully added");
  } catch (error) {
    console.log(`${error}`);
  }
}

const saveMessageToDynamoDB = async (messageData) => {
  try {
    if (messageData.role === "parent") {
      const parentParams = {
        TableName: "parentsTable",
        FilterExpression: "#userId = :userId",
        ExpressionAttributeNames: {
          "#userId": "userId",
        },
        ExpressionAttributeValues: {
          ":userId": messageData.senderUserID ?? "",
        },
      };

      const scanCommand = new ScanCommand(parentParams);
      const userData = await dynamoDocumentClient.send(scanCommand);

      messageData.senderName = userData.Items[0]?.parentName ?? "";
      messageData.senderImageURL = userData.Items[0]?.imageURL ?? userData.Items[0]?.imageUrl ?? "";

      const driverParams = {
        TableName: "driversTable",
        FilterExpression: "#userId = :userId",
        ExpressionAttributeNames: {
          "#userId": "userId",
        },
        ExpressionAttributeValues: {
          ":userId": messageData.receiverUserID ?? "",
        },
      };

      const scanDriverUserId = new ScanCommand(driverParams);
      const driverUserId = await dynamoDocumentClient.send(scanDriverUserId);

      if (driverUserId.Items.length === 0) {
        const driverParamsId = {
          TableName: "driversTable",
          Key: {
            id: messageData.receiverUserID ?? "",
          },
        };

        const scanCommand = new GetCommand(driverParamsId);
        const userData = await dynamoDocumentClient.send(scanCommand);

        messageData.receiverName = userData.Item?.name ?? userData.Item?.driverName ?? "";
        messageData.receiverImageURL = userData.Item?.imageUrl ?? "";
      } else {
        messageData.receiverName = driverUserId.Items[0]?.name ?? driverUserId.Items[0]?.driverName ?? "";
        messageData.receiverImageURL = driverUserId.Items[0]?.imageUrl ?? "";
      }
    } else {
      const driverParams = {
        TableName: "driversTable",
        FilterExpression: "#userId = :userId",
        ExpressionAttributeNames: {
          "#userId": "userId",
        },
        ExpressionAttributeValues: {
          ":userId": messageData.senderUserID ?? "",
        },
      };

      const scanDriverUserId = new ScanCommand(driverParams);
      const driverUserId = await dynamoDocumentClient.send(scanDriverUserId);

      if (driverUserId.Items.length === 0) {
        const driverParamsId = {
          TableName: "driversTable",
          Key: {
            id: messageData.senderUserID ?? "",
          },
        };

        const scanCommand = new GetCommand(driverParamsId);
        const userData = await dynamoDocumentClient.send(scanCommand);

        messageData.senderName = userData.Item?.name ?? userData.Item?.driverName ?? "";
        messageData.senderImageURL = userData.Item?.imageUrl ?? "";
      } else {
        messageData.senderName = driverUserId.Items[0]?.name ?? driverUserId.Items[0]?.driverName ?? "";
        messageData.senderImageURL = driverUserId.Items[0]?.imageUrl ?? "";
      }

      const parentParams = {
        TableName: "parentsTable",
        FilterExpression: "#userId = :userId",
        ExpressionAttributeNames: {
          "#userId": "userId",
        },
        ExpressionAttributeValues: {
          ":userId": messageData.receiverUserID ?? "",
        },
      };

      const scanCommand = new ScanCommand(parentParams);
      const userData = await dynamoDocumentClient.send(scanCommand);

      messageData.receiverName = userData.Items[0]?.parentName ?? "";
      messageData.receiverImageURL = userData.Items[0]?.imageURL ?? userData.Items[0]?.imageUrl ?? "";
    }

    const params = {
      TableName: "chatTable",
      Item: {
        id: uuidv4(),
        roomID: [messageData.senderUserID, messageData.receiverUserID]
          .sort()
          .join("_"),
        timestamp: Math.floor(new Date().getTime() / 1000),
        senderUserID: messageData.senderUserID,
        receiverUserID: messageData.receiverUserID,
        message: messageData.type === "voice" ? null : messageData.message,
        messageType: messageData.type,
        status: messageData.status,
        role: messageData.role,
        senderName: messageData.senderName,
        senderImageURL: messageData.senderImageURL,
        receiverName: messageData.receiverName,
        receiverImageURL: messageData.receiverImageURL,
      },
    };
    const putCommand = new PutCommand(params);
    await dynamoDocumentClient.send(putCommand);
    console.log("Successfully saved to db ");
  } catch (error) {
    console.log(` error: ${error}`);
  }
};

const deleteMessageInDynamoDB = async (messageData) => {
  const params = {
    TableName: "chatTable",
    Key: {
      id: messageData.id,
    },
  };

  try {
    const deleteCommand = new DeleteCommand(params);
    await dynamoDocumentClient.send(deleteCommand);
    console.log("Chat Data Succesfully Deleted");
  } catch (error) {
    console.log(` error: ${error}`);
  }
};

const editMessageInDynamoDB = async (messageData) => {
  const params = {
    TableName: "chatTable",
    Key: {
      id: messageData.id,
    },
  };

  try {
    const getCommand = new GetCommand(params);
    const user = await dynamoDocumentClient.send(getCommand);
    //console.log(user);
    if (user.Item === undefined) console.log("chat id doesn't exists");

    let updateExpressionParts = [];
    const expressionAttributeValues = {};

    const fieldsToUpdate = {
      message: ":message",
      messageType: ":messageType",
      audioURL: ":audioURL",
      duration: ":duration",
      status: ":status",
    };

    Object.keys(fieldsToUpdate).forEach((field) => {
      if (req.body[field] !== undefined) {
        updateExpressionParts.push(`${field}=${fieldsToUpdate[field]}`);
        expressionAttributeValues[fieldsToUpdate[field]] = req.body[field];
      }
    });
    const updateExpression =
      updateExpressionParts.length > 0
        ? "set " + updateExpressionParts.join(", ")
        : "";

    //console.log(updateExpression, expressionAttributeValues);
    const updateParams = {
      TableName: "chatTable",
      Key: {
        id: messageData.id,
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "UPDATED_NEW",
    };

    const updateCommand = new UpdateCommand(updateParams);
    await dynamoDocumentClient.send(updateCommand);
    console.log("Chat successfully edited");
  } catch (error) {
    console.log(` error: ${error}`);
  }
};

const saveAudioToS3 = async (base64Audio) => {
  // Logic to store the audio in S3 and return the URL
  // This is a placeholder and would need to be replaced with actual implementation
  AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.REGION, // replace with your S3 bucket's region
  });

  const s3 = new AWS.S3();

  try {
    const result = await s3DataVoice(base64Audio);
    await s3.upload(result.s3Params).promise();
    return result.fileKey;
  } catch (error) {
    console.log(` error: ${error}`);
  }
};

module.exports = server;

//sample json for audio message
// {
//     "senderUserID": "user123",
//     "receiverUserID": "user456",
//     "message": "UklGRngAAABXQVZFZm10IBAAAAABAAEARKwAABCxAgAEABAAZGF0YQAAAAA...",
//     "type": "voice",
//     "duration": 5, // Duration of the audio in seconds
//     "timestamp": 1609459200000 // The UNIX timestamp in milliseconds
//   }

//sample json for text message
// {
//     "senderUserID": "user123",
//     "receiverUserID": "user456",
//     "message": "Hello, how are you?",
//     "type": "text"
//   }