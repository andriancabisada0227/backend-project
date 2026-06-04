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
const { checkUserId } = require("./utils/userIdChecking");
const e = require("cors");
//const AWS = require("aws-sdk");
require("dotenv").config();
//const { v4: uuidv4 } = require("uuid");

const dynamoDocumentClient = DynamoDBDocumentClient.from(dynamoClient);

const getAllChatsByUserId = async (req, res) => {
  //userId == senderId
  // if (await checkUserId(req.header("UserId")))
  //   return res.status(400).json({ success: false, error: `Invalid User Id` });

  const params = {
    TableName: "chatTable",
    FilterExpression: "#senderID = :senderID",
    ExpressionAttributeNames: {
      "#senderID": "senderID",
    },
    ExpressionAttributeValues: {
      ":senderID": req.header("UserId"),
    },
  };

  try {
    const scanCommand = new ScanCommand(params);
    const result = await dynamoDocumentClient.send(scanCommand);

    //sort by receiverId ug timestamp
    //then return
    return res.status(200).json({ success: true, data: result.Items });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const deleteAllChatsByUserId = async (req, res) => {
  //userId == senderId
  if (await checkUserId(req.header("UserId")))
    return res.status(400).json({ success: false, error: `Invalid User Id` });

  const params = {
    TableName: "chatTable",
    FilterExpression: "#senderId = :senderId",
    ExpressionAttributeNames: {
      "#senderId": "senderId",
    },
    ExpressionAttributeValues: {
      ":senderId": req.header("UserId"),
    },
  };

  try {
    const scanCommand = new ScanCommand(params);
    const data = await dynamoDocumentClient.send(scanCommand);

    for (const item of data.Items) {
      const deleteParams = {
        TableName: "chatTable",
        Key: { id: item.id },
      };
      const deleteCommand = new DeleteCommand(deleteParams);
      await dynamoDocumentClient.send(deleteCommand);
    }

    return res
      .status(200)
      .json({ success: true, message: "Chat Data/s Succesfully Deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const deleteSelectedChatsByUserId = async (req, res) => {
  if (await checkUserId(req.header("UserId")))
    return res.status(400).json({ success: false, error: `Invalid User Id` });

  const params = {
    TableName: "chatTable",
    FilterExpression: "#senderId = :senderId",
    ExpressionAttributeNames: {
      "#senderId": "senderId",
    },
    ExpressionAttributeValues: {
      ":senderId": req.header("UserId"),
    },
  };

  //sample values
  //req.body.id = ["sadas123", "sdfsdfs12312", "asdas31231"];
  try {
    const scanCommand = new ScanCommand(params);
    const data = await dynamoDocumentClient.send(scanCommand);

    for (const item of data.Items) {
      if (req.body.id.includes(item.id)) {
        const deleteParams = {
          TableName: "chatTable",
          Key: { id: item.id },
        };
        const deleteCommand = new DeleteCommand(deleteParams);
        await dynamoDocumentClient.send(deleteCommand);
      }
    }

    return res
      .status(200)
      .json({ success: true, message: "Chat Data/s Succesfully Deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const deleteChatByChatId = async (req, res) => {
  if (await checkUserId(req.header("UserId")))
    return res.status(400).json({ success: false, error: `Invalid User Id` });

  const params = {
    TableName: "chatTable",
    Key: {
      id: req.params.id,
    },
  };
  try {
    const deleteCommand = new DeleteCommand(params);
    await dynamoDocumentClient.send(deleteCommand);
    return res
      .status(200)
      .json({ success: true, message: "Chat Data Succesfully Deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const allChatRooms = async (req, res) => {
  // if (await checkUserId(req.header("UserId")))
  //   return res.status(400).json({ success: false, error: `Invalid User Id` });
  try {
    let params = {
      TableName: "chatTable",
      FilterExpression: "#senderUserID = :senderUserID",
      ExpressionAttributeNames: {
        "#senderUserID": "senderUserID",
      },
      ExpressionAttributeValues: {
        ":senderUserID": req.header("UserId"),
      },
    };

    const scanCommand = new ScanCommand(params);
    const data = await dynamoDocumentClient.send(scanCommand);

    params = {
      TableName: "chatTable",
      FilterExpression: "#receiverUserID = :receiverUserID",
      ExpressionAttributeNames: {
        "#receiverUserID": "receiverUserID",
      },
      ExpressionAttributeValues: {
        ":receiverUserID": req.header("UserId"),
      },
    };

    const scanReceiverCommand = new ScanCommand(params);
    const dataReceiver = await dynamoDocumentClient.send(scanReceiverCommand);

    if (data.Items.length === 0 && dataReceiver.Items.length === 0)
      return res.status(200).json({ success: true, data: [] });
    let combinedData = data.Items.concat(dataReceiver.Items);
    //console.log(combinedData);
    const today = new Date();

    combinedData = combinedData.filter((message) => {
      const timestampDate = new Date(parseInt(message.timestamp) * 1000); // Convert epoch to milliseconds
      const oneYearAgo = new Date(
        today.getFullYear() - 1,
        today.getMonth(),
        today.getDate()
      );

      return timestampDate > oneYearAgo;
    });

    combinedData.sort((a, b) => {
      return parseInt(a.timestamp) * 1000 - parseInt(b.timestamp) * 1000; // Compare epoch timestamps directly
    });
    // console.log(combinedData);
    let groupedMessages = [];

    combinedData.forEach((message) => {
      let conversationID = [message.senderUserID, message.receiverUserID]
        .sort()
        .join("_");

      let messageTimestamp = parseInt(message.timestamp); // Convert timestamp to integer

      if (
        !groupedMessages[conversationID] ||
        messageTimestamp > parseInt(groupedMessages[conversationID].timestamp)
      ) {
        groupedMessages[conversationID] = message;
      }
    });

    // Now groupedMessages contains the latest message per conversationID

    let arrayResult = Object.values(groupedMessages);

    // console.log(arrayResult[0].receiverUserID);
    // console.log(arrayResult[0].senderUserID);

    params = {
      TableName: "parentsTable",
      FilterExpression: "#userId = :userId",
      ExpressionAttributeNames: {
        "#userId": "userId",
      },
      ExpressionAttributeValues: {
        ":userId": arrayResult[0].senderUserID,
      },
    };

    const scanCommand1 = new ScanCommand(params);
    const dataPhoneNumber = await dynamoDocumentClient.send(scanCommand1);

    if (dataPhoneNumber.Items.length === 0) {
      params = {
        TableName: "signupTable",
        Key: {
          id: arrayResult[0].receiverUserID,
        },
      };
      const getCommand = new GetCommand(params);
      const dataPhoneNumber = await dynamoDocumentClient.send(getCommand);
      arrayResult[0].parentPhoneNumber =
        dataPhoneNumber.Item?.phoneNumber ?? "";

      params = {
        TableName: "signupTable",
        Key: {
          id: arrayResult[0].senderUserID,
        },
      };
      const getCommand1 = new GetCommand(params);
      const dataPhoneNumber1 = await dynamoDocumentClient.send(getCommand1);

      arrayResult[0].driverPhoneNumber =
        dataPhoneNumber1.Item?.phoneNumber ?? "";
    } else {
      //parent phone number - driver phone number
      params = {
        TableName: "signupTable",
        Key: {
          id: arrayResult[0].senderUserID,
        },
      };
      const getCommand2 = new GetCommand(params);
      const dataPhoneNumber2 = await dynamoDocumentClient.send(getCommand2);
      arrayResult[0].parentPhoneNumber =
        dataPhoneNumber2.Item?.phoneNumber ?? "";

      params = {
        TableName: "signupTable",
        Key: {
          id: arrayResult[0].receiverUserID,
        },
      };
      const getCommand3 = new GetCommand(params);
      const dataPhoneNumber3 = await dynamoDocumentClient.send(getCommand3);

      arrayResult[0].driverPhoneNumber =
        dataPhoneNumber3.Item?.phoneNumber ?? "";
    }

    return res.status(200).json({ success: true, data: arrayResult });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const chatRoomsDetails = async (req, res) => {
  // if (await checkUserId(req.header("UserId")))
  //   return res.status(400).json({ success: false, error: `Invalid User Id` });
  try {
    let params = {
      TableName: "chatTable",
      FilterExpression:
        "#senderUserID = :senderUserID AND #receiverUserID = :receiverUserID",
      ExpressionAttributeNames: {
        "#senderUserID": "senderUserID",
        "#receiverUserID": "receiverUserID",
      },
      ExpressionAttributeValues: {
        ":senderUserID": req.header("UserId"),
        ":receiverUserID": req.params.id ?? "",
      },
    };

    const scanCommand = new ScanCommand(params);
    const data = await dynamoDocumentClient.send(scanCommand);

    params = {
      TableName: "chatTable",
      FilterExpression:
        "#senderUserID = :senderUserID AND #receiverUserID = :receiverUserID",
      ExpressionAttributeNames: {
        "#senderUserID": "senderUserID",
        "#receiverUserID": "receiverUserID",
      },
      ExpressionAttributeValues: {
        ":senderUserID": req.params.id ?? "",
        ":receiverUserID": req.header("UserId"),
      },
    };

    const scan_Command = new ScanCommand(params);
    const dataUser = await dynamoDocumentClient.send(scan_Command);

    if (data.Items.length === 0 && dataUser.Items.length === 0)
      return res.status(200).json({ success: true, data: [] });

    let combinedData = data.Items.concat(dataUser.Items);
    const today = new Date();

    combinedData = combinedData.filter((message) => {
      const timestampDate = new Date(parseInt(message.timestamp) * 1000); // Convert epoch to milliseconds
      const oneYearAgo = new Date(
        today.getFullYear() - 1,
        today.getMonth(),
        today.getDate()
      );

      return timestampDate > oneYearAgo;
    });

    combinedData.sort((a, b) => {
      return parseInt(a.timestamp) * 1000 - parseInt(b.timestamp) * 1000; // Compare epoch timestamps directly
    });

    // Get the last 50 items after sorting
    const totalItems = combinedData.length;
    const startIndex = totalItems > 50 ? totalItems - 50 : 0;
    combinedData = combinedData.slice(startIndex);

    return res.status(200).json({ success: true, data: combinedData });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

module.exports = {
  getAllChatsByUserId,
  allChatRooms,
  chatRoomsDetails,
  deleteAllChatsByUserId,
  deleteChatByChatId,
  deleteSelectedChatsByUserId,
};
